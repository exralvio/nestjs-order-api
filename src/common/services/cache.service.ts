import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { TenantContextService } from '../../prisma/tenant-context.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor(private readonly tenantContext: TenantContextService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  /**
   * Generate cache key dynamically based on tenant code, controller name, method name, and arguments
   */
  private generateCacheKey(
    controllerName: string,
    methodName: string,
    args?: any,
    tenantCodeOverride?: string
  ): string {
    const tenantCode = tenantCodeOverride ?? (this.tenantContext.getTenantCode() || 'default');
    const argsString =
      args === undefined
        ? ''
        : typeof args === 'string'
          ? `:${args}`
          : `:${JSON.stringify(args)}`;
    return `${tenantCode}:${controllerName}:${methodName}${argsString}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(
    controllerName: string,
    methodName: string,
    args?: any
  ): Promise<T | null> {
    try {
      const key = this.generateCacheKey(controllerName, methodName, args);
      const cached = await this.redis.get(key);
      
      if (cached) {
        this.logger.debug(`Cache hit for key: ${key}`);
        return JSON.parse(cached);
      }
      
      this.logger.debug(`Cache miss for key: ${key}`);
      return null;
    } catch (error) {
      this.logger.error('Error getting from cache:', error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(
    controllerName: string,
    methodName: string,
    value: any,
    ttlSeconds: number = 300, // 5 minutes default
    args?: any
  ): Promise<void> {
    try {
      const key = this.generateCacheKey(controllerName, methodName, args);
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      this.logger.debug(`Cached value for key: ${key} with TTL: ${ttlSeconds}s`);
    } catch (error) {
      this.logger.error('Error setting cache:', error);
    }
  }

  /**
   * Delete cache entry
   */
  async del(
    controllerName: string,
    methodName: string,
    args?: any,
    tenantCodeOverride?: string
  ): Promise<void> {
    try {
      const key = this.generateCacheKey(controllerName, methodName, args, tenantCodeOverride);
      await this.redis.del(key);
      this.logger.debug(`Deleted cache key: ${key}`);
    } catch (error) {
      this.logger.error('Error deleting from cache:', error);
    }
  }

  /**
   * Delete all cache entries for a specific controller
   */
  async delPattern(controllerName: string, tenantCodeOverride?: string): Promise<void> {
    try {
      const tenantCode = tenantCodeOverride ?? (this.tenantContext.getTenantCode() || 'default');
      const pattern = `${tenantCode}:${controllerName}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(`Deleted ${keys.length} cache keys for pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger.error('Error deleting cache pattern:', error);
    }
  }

  /**
   * Clear all cache entries for current tenant
   */
  async clearTenantCache(): Promise<void> {
    try {
      const pattern = `${this.tenantContext.getTenantCode() || 'default'}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(`Cleared ${keys.length} cache keys for tenant`);
      }
    } catch (error) {
      this.logger.error('Error clearing tenant cache:', error);
    }
  }

  /**
   * Health check for Redis connection
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
