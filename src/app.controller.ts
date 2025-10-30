import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TenantMigrationService } from './prisma/tenant-migration.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { Roles } from './auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiOperation } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(
    private readonly tenantMigrationService: TenantMigrationService,
  ) {}

  @Get('migrate-tenants')
  async migrateAllTenants(): Promise<any> {
    return this.tenantMigrationService.migrateAllTenants();
  }
}
