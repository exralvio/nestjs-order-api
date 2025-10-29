import { SetMetadata } from '@nestjs/common';

export interface CacheOptions {
  /**
   * Cache TTL in seconds
   * @default 300 (5 minutes)
   */
  ttl?: number;
  
  /**
   * Whether to include method arguments in the cache key
   * @default true
   */
  includeArgs?: boolean;
}

export const CACHE_KEY = 'cache';
export const CACHE_TTL = 'cache_ttl';
export const INVALIDATE_CACHE = 'invalidate_cache';

/**
 * Decorator to mark a method as cacheable
 * @param options Cache options
 */
export const Cacheable = (options: CacheOptions = {}) =>
  SetMetadata(CACHE_KEY, options);

/**
 * Decorator to mark a method that should invalidate cache
 * @param methodsToInvalidate Array of method names to invalidate
 */
export const InvalidateCache = (methodsToInvalidate: string[] = []) =>
  SetMetadata(INVALIDATE_CACHE, methodsToInvalidate);

