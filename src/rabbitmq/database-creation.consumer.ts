import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { DefaultPrismaService } from '../prisma/default-prisma.service';
import { DatabaseManagerService } from '../prisma/database-manager.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseCreationConsumer implements OnModuleInit {
  private readonly logger = new Logger(DatabaseCreationConsumer.name);
  private readonly databasePrefix: string;
  private readonly baseDatabaseUrl: string;

  constructor(
    private rabbitMQService: RabbitMQService,
    private prisma: DefaultPrismaService,
    private databaseManager: DatabaseManagerService,
  ) {
    this.databasePrefix = process.env.DATABASE_PREFIX || 'provenant_';
    const dbUrl = process.env.DATABASE_URL || '';
    this.baseDatabaseUrl = this.extractBaseUrl(dbUrl);
  }

  async onModuleInit() {
    // Add a small delay to ensure RabbitMQ service is fully initialized
    setTimeout(async () => {
      try {
        await this.rabbitMQService.consumeDatabaseCreationMessages(
          this.handleDatabaseCreation.bind(this)
        );
      } catch (error) {
        this.logger.error('Failed to start consuming messages:', error);
        // Retry after a delay
        setTimeout(() => this.onModuleInit(), 5000);
      }
    }, 2000);
  }

  private async handleDatabaseCreation(data: {
    userId: string;
    tenantCode: string;
  }): Promise<void> {
    try {
      await this.createAndMigrateTenantDatabase(data.tenantCode);
      
      // Update user to mark database as created
      await this.prisma.user.update({
        where: { id: data.userId },
        data: { isDatabaseCreated: true },
      });
      
      this.logger.log(`Database creation completed for user ${data.userId}, tenant ${data.tenantCode}`);
    } catch (error) {
      this.logger.error(`Failed to create database for user ${data.userId}:`, error);
      throw error;
    }
  }

  /**
   * Extract base URL from full database URL (removes database name)
   */
  private extractBaseUrl(dbUrl: string): string {
    try {
      const url = new URL(dbUrl);
      const baseUrl = `${url.protocol}//${url.username}${url.password ? ':' + url.password : ''}@${url.host}`;
      return baseUrl;
    } catch (error) {
      const match = dbUrl.match(/^(postgresql:\/\/[^\/]+)\//);
      if (match) {
        return match[1];
      }
      return dbUrl;
    }
  }

  /**
   * Create a new tenant database and run migrations
   */
  private async createAndMigrateTenantDatabase(tenantCode: string): Promise<void> {
    const databaseName = `${this.databasePrefix}${tenantCode.toLowerCase()}`;
    
    // Preserve query parameters from original URL
    const originalUrl = process.env.DATABASE_URL || '';
    const queryParams = originalUrl.includes('?') ? originalUrl.substring(originalUrl.indexOf('?')) : '';
    const databaseUrl = `${this.baseDatabaseUrl}/${databaseName}${queryParams}`;

    try {
      // Step 1: Create the database
      let createDbClient: PrismaClient;
      try {
        const postgresDatabaseUrl = `${this.baseDatabaseUrl}/postgres${queryParams}`;
        createDbClient = new PrismaClient({
          datasources: {
            db: {
              url: postgresDatabaseUrl,
            },
          },
        });
        await createDbClient.$connect();
      } catch (error) {
        // Fallback to using default connection
        createDbClient = this.prisma as any;
      }

      try {
        await createDbClient.$executeRawUnsafe(
          `CREATE DATABASE ${this.escapeIdentifier(databaseName)}`
        );
      } finally {
        if (createDbClient !== this.prisma) {
          await createDbClient.$disconnect();
        }
      }

      // Step 2: Create PrismaClient for the new database
      const tenantClient = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      });

      try {
        await tenantClient.$connect();

        // Step 3: Create _prisma_migrations table
        await tenantClient.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
            "id" VARCHAR(36) NOT NULL,
            "checksum" VARCHAR(64) NOT NULL,
            "finished_at" TIMESTAMP(3),
            "migration_name" VARCHAR(255) NOT NULL,
            "logs" TEXT,
            "rolled_back_at" TIMESTAMP(3),
            "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
          )
        `);

        // Step 4: Read and execute migration files in order
        const migrationsPath = path.join(process.cwd(), 'prisma', 'migrations');
        const migrationDirs = fs.readdirSync(migrationsPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name)
          .sort();

        for (const migrationDir of migrationDirs) {
          const migrationFile = path.join(migrationsPath, migrationDir, 'migration.sql');
          
          if (fs.existsSync(migrationFile)) {
            const migrationSQL = fs.readFileSync(migrationFile, 'utf-8');
            
            // Skip if migration already applied
            const existingMigration = await tenantClient.$queryRawUnsafe<Array<{ id: string }>>(
              `SELECT id FROM "_prisma_migrations" WHERE migration_name = '${migrationDir.replace(/'/g, "''")}'`
            );

            if (existingMigration.length === 0) {
              const migrationId = this.generateUUID();
              const checksum = this.calculateChecksum(migrationSQL);
              
              // Record migration start
              await tenantClient.$executeRawUnsafe(`
                INSERT INTO "_prisma_migrations" 
                (id, checksum, migration_name, started_at, applied_steps_count)
                VALUES ('${migrationId}', '${checksum}', '${migrationDir.replace(/'/g, "''")}', CURRENT_TIMESTAMP, 0)
              `);

              try {
                // Execute migration SQL
                const lines = migrationSQL.split('\n');
                let currentStatement = '';
                let inString = false;
                let stringChar = '';
                
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine.startsWith('--') && currentStatement.trim() === '') {
                    continue;
                  }
                  
                  for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (!inString && (char === '"' || char === "'")) {
                      inString = true;
                      stringChar = char;
                    } else if (inString && char === stringChar && line[i - 1] !== '\\') {
                      inString = false;
                    }
                  }
                  
                  currentStatement += line + '\n';
                  
                  if (!inString && line.trim().endsWith(';')) {
                    const statement = currentStatement.trim();
                    if (statement && !statement.startsWith('--')) {
                      await tenantClient.$executeRawUnsafe(statement);
                    }
                    currentStatement = '';
                  }
                }
                
                if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
                  await tenantClient.$executeRawUnsafe(currentStatement.trim());
                }
                
                const statementCount = migrationSQL
                  .split(';')
                  .filter(s => {
                    const trimmed = s.trim();
                    return trimmed.length > 0 && !trimmed.startsWith('--');
                  }).length;

                // Mark migration as finished
                await tenantClient.$executeRawUnsafe(`
                  UPDATE "_prisma_migrations"
                  SET finished_at = CURRENT_TIMESTAMP, applied_steps_count = ${statementCount}
                  WHERE id = '${migrationId}'
                `);
              } catch (migrationError) {
                // Mark migration as rolled back
                await tenantClient.$executeRawUnsafe(`
                  UPDATE "_prisma_migrations"
                  SET rolled_back_at = CURRENT_TIMESTAMP
                  WHERE id = '${migrationId}'
                `);
                throw migrationError;
              }
            }
          }
        }

        await tenantClient.$disconnect();
      } catch (error) {
        try {
          await this.prisma.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS ${this.escapeIdentifier(databaseName)}`
          );
        } catch (dropError) {
          this.logger.error('Failed to drop database after migration error:', dropError);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          return;
        }
        throw new Error(`Failed to create and migrate tenant database: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Escape PostgreSQL identifier
   */
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return randomUUID();
  }

  /**
   * Calculate a simple checksum for migration
   */
  private calculateChecksum(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}
