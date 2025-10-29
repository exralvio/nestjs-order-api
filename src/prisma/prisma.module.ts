import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContextService } from './tenant-context.service';
import { DatabaseManagerService } from './database-manager.service';
import { DefaultPrismaService } from './default-prisma.service';

@Global()
@Module({
  providers: [PrismaService, TenantContextService, DatabaseManagerService, DefaultPrismaService],
  exports: [PrismaService, TenantContextService, DatabaseManagerService, DefaultPrismaService],
})
export class PrismaModule {}

