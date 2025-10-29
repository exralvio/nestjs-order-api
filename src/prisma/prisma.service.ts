import { Injectable, Scope, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from './tenant-context.service';
import { DatabaseManagerService } from './database-manager.service';

/**
 * PrismaService that dynamically switches databases based on tenant context
 * Uses REQUEST scope to ensure each request gets the correct database connection
 */
@Injectable({ scope: Scope.REQUEST })
export class PrismaService implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private _client: PrismaClient | null = null;

  constructor(
    private tenantContext: TenantContextService,
    private databaseManager: DatabaseManagerService,
  ) {}

  /**
   * Lazy getter for the PrismaClient
   * Gets the appropriate client based on tenant context at access time
   * This ensures the tenant context is set by the interceptor before we access it
   */
  private get client(): PrismaClient {
    if (!this._client) {
      // Get the appropriate client based on tenant context
      const tenantCode = this.tenantContext.getTenantCode();
      
      // Log the database URL being used for the current tenant
      const databaseUrl = this.databaseManager.getDatabaseUrl(tenantCode);
      this.logger.log(`Using database URL for tenant '${tenantCode || 'default'}': ${this.maskDatabaseUrl(databaseUrl)}`);
      
      this._client = this.databaseManager.getClient(tenantCode);
    }
    return this._client;
  }

  async onModuleInit() {
    // Connection will be established when client is first accessed
    // This ensures tenant context is set before connecting
  }

  // Delegate all PrismaClient methods to the dynamic client
  get user() {
    return this.client.user;
  }

  get product() {
    return this.client.product;
  }

  get order() {
    return this.client.order;
  }

  get orderItem() {
    return this.client.orderItem;
  }

  // Proxy other PrismaClient methods
  async $connect() {
    // Access client to ensure it's initialized (triggers lazy initialization)
    return this.client.$connect();
  }

  $disconnect() {
    return this.client.$disconnect();
  }

  $transaction(...args: Parameters<typeof PrismaClient.prototype.$transaction>) {
    return this.client.$transaction(...args);
  }

  $queryRaw(...args: Parameters<typeof PrismaClient.prototype.$queryRaw>) {
    return this.client.$queryRaw(...args);
  }

  $executeRaw(...args: Parameters<typeof PrismaClient.prototype.$executeRaw>) {
    return this.client.$executeRaw(...args);
  }

  $queryRawUnsafe(...args: Parameters<typeof PrismaClient.prototype.$queryRawUnsafe>) {
    return this.client.$queryRawUnsafe(...args);
  }

  $executeRawUnsafe(...args: Parameters<typeof PrismaClient.prototype.$executeRawUnsafe>) {
    return this.client.$executeRawUnsafe(...args);
  }

  /**
   * Log the current database URL being used for the current tenant
   * This can be called explicitly for debugging purposes
   */
  logCurrentDatabaseUrl(): void {
    const tenantCode = this.tenantContext.getTenantCode();
    const databaseUrl = this.databaseManager.getDatabaseUrl(tenantCode);
    this.logger.log(`Current database URL for tenant '${tenantCode || 'default'}': ${this.maskDatabaseUrl(databaseUrl)}`);
  }

  /**
   * Get the current database URL (for debugging purposes)
   */
  getCurrentDatabaseUrl(): string {
    const tenantCode = this.tenantContext.getTenantCode();
    return this.databaseManager.getDatabaseUrl(tenantCode);
  }

  /**
   * Mask sensitive information in database URL for logging
   */
  private maskDatabaseUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '***';
      }
      return urlObj.toString();
    } catch (error) {
      // If URL parsing fails, mask password manually
      return url.replace(/:([^:@]+)@/, ':***@');
    }
  }
}

