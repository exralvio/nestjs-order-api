import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Cacheable, CacheOptions, CACHE_KEY, INVALIDATE_CACHE, InvalidateTarget } from '../decorators/cache.decorator';
import { CacheService } from '../services/cache.service';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    
    // Get controller and method names dynamically
    const controllerName = context.getClass().name;
    const methodName = handler.name;
    
    // Check if method is cacheable
    const cacheOptions = this.reflector.get<CacheOptions>(CACHE_KEY, handler);
    
    // Check if method should invalidate cache
    const methodsToInvalidate = this.reflector.get<InvalidateTarget[]>(INVALIDATE_CACHE, handler);
    
    // Handle cache invalidation
    if (methodsToInvalidate) {
      return next.handle().pipe(
        tap(async () => {
          // Invalidate cache for specified methods
          for (const target of methodsToInvalidate) {
            const isString = typeof target === 'string';
            const method = isString ? target : target.method;
            const isDefaultTenant = isString ? false : target.isDefaultTenant === true;

            if (method === '*') {
              // Invalidate all methods for this controller
              await this.cacheService.delPattern(controllerName, isDefaultTenant ? 'default' : undefined);
            } else {
              // Build args for the cache key based on target options
              let argsKey: any = undefined;
              const args = this.getMethodArguments(handler, request);

              const includeArgs = isString ? true : target.includeArgs !== false;
              const includeUserId = isString ? false : target.includeUserId === true;

              if (includeUserId) {
                const user = request.user;
                const derivedUserId = user?.id ?? user?.userId ?? user?.sub;
                if (derivedUserId !== undefined) {
                  argsKey = String(derivedUserId);
                }
              } else if (includeArgs) {
                argsKey = args;
              }

              console.log('-------- argsKey', argsKey);

              await this.cacheService.del(
                controllerName,
                method,
                argsKey,
                isDefaultTenant ? 'default' : undefined,
              );
            }
          }
          
          this.logger.debug(
            `Cache invalidated for ${controllerName}.${methodsToInvalidate.join(', ')}`
          );
        }),
      );
    }
    
    // Handle cache retrieval
    if (cacheOptions !== undefined) {
      const args = this.getMethodArguments(handler, request);
      let argsKey = cacheOptions.includeArgs !== false ? args : undefined;

      // Optionally include authenticated user id in the cache key
      if (cacheOptions.includeUserId) {
        const user = request.user;
        const derivedUserId = user?.id ?? user?.userId ?? user?.sub;
        if (derivedUserId !== undefined) {
          // When includeUserId is enabled, the user id alone determines the key suffix
          // so we pass it as a string to avoid JSON serialization in the final key
          argsKey = String(derivedUserId);
        }
      }
      
      // Try to get from cache
      const cached = await this.cacheService.get(controllerName, methodName, argsKey);
      
      if (cached) {
        this.logger.debug(`Cache hit for ${controllerName}.${methodName}`);
        return of(cached);
      }
      
      this.logger.debug(`Cache miss for ${controllerName}.${methodName}`);
      
      // If not in cache, proceed with request and cache the result
      return next.handle().pipe(
        tap(async (data) => {
          const ttl = cacheOptions.ttl || 300; // default 5 minutes
          await this.cacheService.set(controllerName, methodName, data, ttl, argsKey);
          this.logger.debug(`Cached result for ${controllerName}.${methodName} with TTL: ${ttl}s`);
        }),
      );
    }
    
    // No caching, proceed normally
    return next.handle();
  }

  /**
   * Extract method arguments from request (params, query, body)
   */
  private getMethodArguments(handler: any, request: any): any {
    const { params, query, body } = request;
    
    // Build a simplified arguments object
    const args: any = {};
    
    // Add route parameters
    if (params && Object.keys(params).length > 0) {
      Object.assign(args, params);
    }
    
    // Add query parameters (for GET requests)
    if (query && Object.keys(query).length > 0) {
      Object.assign(args, query);
    }
    
    return Object.keys(args).length > 0 ? args : undefined;
  }
}

