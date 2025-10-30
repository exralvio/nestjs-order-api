import { Injectable } from '@nestjs/common';
import { DefaultPrismaService } from './default-prisma.service';
import { DatabaseManagerService } from './database-manager.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TenantMigrationService {
  constructor(
    private readonly defaultPrisma: DefaultPrismaService,
    private readonly databaseManager: DatabaseManagerService,
  ) {}

  async migrateAllTenants(): Promise<any> {
    const tenants = await this.defaultPrisma.user.findMany({
      where: { tenantCode: { not: null }, isDatabaseCreated: true },
      select: { tenantCode: true },
    });

    const migrationsPath = path.join(process.cwd(), 'prisma', 'tenant_migrations');
    const migrationDirs = fs
      .readdirSync(migrationsPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort();

    const results: Array<{ tenantCode: string | null; migration: string; status: string; error?: string }> = [];

    for (const tenant of tenants) {
      const tenantCode = tenant.tenantCode;
      const tenantPrisma = this.databaseManager.getClient(tenantCode);
      await tenantPrisma.$connect();

      await tenantPrisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMP(3),
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMP(3),
        "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
      )`);

      for (const migrationDir of migrationDirs) {
        const migrationFile = path.join(migrationsPath, migrationDir, 'migration.sql');
        if (fs.existsSync(migrationFile)) {
          const migrationSQL = fs.readFileSync(migrationFile, 'utf-8');
          const existingMigration = await tenantPrisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "_prisma_migrations" WHERE migration_name = '${migrationDir.replace(/'/g, "''")}'`
          );

          if (existingMigration.length === 0) {
            try {
              const statements = migrationSQL
                .split('\n')
                .map((line) => line.replace(/--.*$/, ''))
                .join('\n')
                .split(';')
                .map((stmt) => stmt.trim())
                .filter((stmt) => stmt.length > 0);

              for (const stmt of statements) {
                await tenantPrisma.$executeRawUnsafe(stmt + ';');
              }

              await tenantPrisma.$executeRawUnsafe(
                `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count, finished_at)
                 VALUES (gen_random_uuid(), '-', '${migrationDir.replace(/'/g, "''")}', CURRENT_TIMESTAMP, ${statements.length}, CURRENT_TIMESTAMP)`
              );
              results.push({ tenantCode, migration: migrationDir, status: 'applied' });
            } catch (error: any) {
              results.push({ tenantCode, migration: migrationDir, status: 'failed', error: error.message });
            }
          } else {
            results.push({ tenantCode, migration: migrationDir, status: 'already_applied' });
          }
        }
      }

      await tenantPrisma.$disconnect();
    }

    return { status: 'completed', results };
  }
}