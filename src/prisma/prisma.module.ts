import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContextService } from './tenant-context.service';
import { DatabaseManagerService } from './database-manager.service';
import { DefaultPrismaService } from './default-prisma.service';
import { TenantMigrationService } from './tenant-migration.service';

@Global()
@Module({
  providers: [PrismaService, TenantContextService, DatabaseManagerService, DefaultPrismaService, TenantMigrationService],
  exports: [PrismaService, TenantContextService, DatabaseManagerService, DefaultPrismaService, TenantMigrationService],
})
export class PrismaModule {}

