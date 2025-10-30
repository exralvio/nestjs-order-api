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

  /**
   * Whether to include the authenticated user's id in the cache key
   * Useful for per-user caching regardless of route/query args
   * @default false
   */
  includeUserId?: boolean;
}

export const CACHE_KEY = 'cache';
export const CACHE_TTL = 'cache_ttl';
export const INVALIDATE_CACHE = 'invalidate_cache';

export type InvalidateTarget =
  | string
  | {
      /** Method name to invalidate (or '*' for all) */
      method: string;
      /** Whether to include method args when building the key (default: true) */
      includeArgs?: boolean;
      /** Whether to include the authenticated user's id in the key */
      includeUserId?: boolean;
      /** If true, force tenant code to 'default' when invalidating */
      isDefaultTenant?: boolean;
    };

/**
 * Decorator to mark a method as cacheable
 * @param options Cache options
 */
export const Cacheable = (options: CacheOptions = {}) =>
  SetMetadata(CACHE_KEY, options);

/**
 * Decorator to mark a method that should invalidate cache
 * @param targets Array of method names or objects with options
 */
export const InvalidateCache = (targets: InvalidateTarget[] = []) =>
  SetMetadata(INVALIDATE_CACHE, targets);

