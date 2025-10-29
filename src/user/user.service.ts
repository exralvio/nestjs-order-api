import { Injectable, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DefaultPrismaService } from '../prisma/default-prisma.service';
import { DatabaseManagerService } from '../prisma/database-manager.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class UserService {
  private readonly databasePrefix: string;
  private readonly baseDatabaseUrl: string;

  constructor(
    private prisma: DefaultPrismaService,
    private databaseManager: DatabaseManagerService,
  ) {
    this.databasePrefix = process.env.DATABASE_PREFIX || 'provenant_';
    const dbUrl = process.env.DATABASE_URL || '';
    this.baseDatabaseUrl = this.extractBaseUrl(dbUrl);
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
      // Connect to postgres database to execute CREATE DATABASE command
      // Try connecting to 'postgres' database (default PostgreSQL database)
      // If that fails, try using the current database connection
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
        // Fallback to using default connection (might work if user has permissions)
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
          .sort(); // Sort to ensure chronological order

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
                // Prisma migrations are typically well-formed, so we can execute as-is
                // But we need to split by semicolon while preserving statements that span multiple lines
                const lines = migrationSQL.split('\n');
                let currentStatement = '';
                let inString = false;
                let stringChar = '';
                
                for (const line of lines) {
                  // Skip comment-only lines
                  const trimmedLine = line.trim();
                  if (trimmedLine.startsWith('--') && currentStatement.trim() === '') {
                    continue;
                  }
                  
                  // Track string literals to avoid splitting on semicolons inside strings
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
                  
                  // If we find a semicolon and we're not in a string, execute the statement
                  if (!inString && line.trim().endsWith(';')) {
                    const statement = currentStatement.trim();
                    if (statement && !statement.startsWith('--')) {
                      await tenantClient.$executeRawUnsafe(statement);
                    }
                    currentStatement = '';
                  }
                }
                
                // Execute any remaining statement
                if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
                  await tenantClient.$executeRawUnsafe(currentStatement.trim());
                }
                
                // Count non-comment statements
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

        // Step 5: Register the client in DatabaseManagerService
        // The getClient method will handle this, but we need to ensure connection is ready
        await tenantClient.$disconnect();
      } catch (error) {
        // If migration fails, try to drop the database
        try {
          await this.prisma.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS ${this.escapeIdentifier(databaseName)}`
          );
        } catch (dropError) {
          console.error('Failed to drop database after migration error:', dropError);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          // Database already exists, this is fine
          return;
        }
        throw new InternalServerErrorException(
          `Failed to create and migrate tenant database: ${error.message}`
        );
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
    // Simple hash function for checksum
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  async create(createUserDto: CreateUserDto) {
    // Validate tenant_code for ADMIN role
    if (createUserDto.role === Role.ADMIN && !createUserDto.tenantCode) {
      throw new BadRequestException('tenantCode is required for ADMIN role');
    }

    if (createUserDto.role !== Role.ADMIN && createUserDto.tenantCode) {
      throw new BadRequestException('tenantCode can only be set for ADMIN role');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: createUserDto.email },
          { username: createUserDto.username },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or username already exists');
    }

    // Check if tenant_code is already in use (if provided)
    if (createUserDto.tenantCode) {
      const existingTenant = await this.prisma.user.findFirst({
        where: { tenantCode: createUserDto.tenantCode },
      });

      if (existingTenant) {
        throw new ConflictException('Tenant code is already in use');
      }

      // Create and migrate tenant database for ADMIN users with tenantCode
      await this.createAndMigrateTenantDatabase(createUserDto.tenantCode);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        username: createUserDto.username,
        password: hashedPassword,
        role: createUserDto.role || 'CUSTOMER',
        tenantCode: createUserDto.tenantCode || null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    await this.findOne(id);

    // Hash password if provided
    const updateData: any = { ...updateUserDto };
    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.user.delete({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

