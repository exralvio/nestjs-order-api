import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseManagerService implements OnModuleDestroy {
  private connections: Map<string, PrismaClient> = new Map();
  private readonly databasePrefix: string;
  private readonly baseDatabaseUrl: string;

  constructor() {
    // Get database prefix from environment or use default
    this.databasePrefix = process.env.DATABASE_PREFIX || 'provenant_tenant_';
    
    // Get base database URL (without database name)
    const dbUrl = process.env.DATABASE_URL || '';
    this.baseDatabaseUrl = this.extractBaseUrl(dbUrl);
  }

  /**
   * Get PrismaClient for a specific tenant
   * Creates a new connection if it doesn't exist
   */
  getClient(tenantCode: string | null): PrismaClient {
    // If no tenant code, use default database
    if (!tenantCode) {
      return this.getDefaultClient();
    }

    // Check if connection already exists
    if (this.connections.has(tenantCode)) {
      return this.connections.get(tenantCode)!;
    }

    // Create new connection for this tenant
    const databaseName = `${this.databasePrefix}${tenantCode.toLowerCase()}`;
    
    // Preserve query parameters from original URL (e.g., ?schema=public)
    const originalUrl = process.env.DATABASE_URL || '';
    const queryParams = originalUrl.includes('?') ? originalUrl.substring(originalUrl.indexOf('?')) : '';
    const databaseUrl = `${this.baseDatabaseUrl}/${databaseName}${queryParams}`;

    const client = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    // Store connection
    this.connections.set(tenantCode, client);

    return client;
  }

  /**
   * Get default PrismaClient (for non-tenant operations like user management)
   */
  getDefaultClient(): PrismaClient {
    const defaultKey = '_default_';
    
    if (!this.connections.has(defaultKey)) {
      const client = new PrismaClient();
      this.connections.set(defaultKey, client);
    }

    return this.connections.get(defaultKey)!;
  }

  /**
   * Extract base URL from full database URL (removes database name)
   * Handles PostgreSQL URL format: postgresql://user:password@host:port/database?schema=public
   */
  private extractBaseUrl(dbUrl: string): string {
    try {
      const url = new URL(dbUrl);
      // Reconstruct URL without the pathname (database name)
      const baseUrl = `${url.protocol}//${url.username}${url.password ? ':' + url.password : ''}@${url.host}${url.port ? ':' + url.port : ''}`;
      return baseUrl;
    } catch (error) {
      // Fallback: try to extract manually if URL parsing fails
      const match = dbUrl.match(/^(postgresql:\/\/[^\/]+)\//);
      if (match) {
        return match[1];
      }
      // If all else fails, return original (will likely cause connection error)
      return dbUrl;
    }
  }

  /**
   * Close all database connections
   */
  async onModuleDestroy() {
    const closePromises = Array.from(this.connections.values()).map(client => 
      client.$disconnect().catch(err => console.error('Error disconnecting client:', err))
    );
    await Promise.all(closePromises);
    this.connections.clear();
  }

  /**
   * Close a specific tenant connection
   */
  async disconnectTenant(tenantCode: string): Promise<void> {
    const client = this.connections.get(tenantCode);
    if (client) {
      await client.$disconnect();
      this.connections.delete(tenantCode);
    }
  }
}
