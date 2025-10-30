import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

interface CounterState {
  count: number;
  windowStart: number;
}

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly counters = new Map<string, CounterState>();

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const handler = context.getHandler();
    const controller = context.getClass();

    const options = this.resolveOptions(handler, controller);

    const now = Date.now();
    const key = this.buildKey(request, handler, controller, options);

    const existing = this.counters.get(key);
    if (!existing || now - existing.windowStart >= options.windowMs) {
      this.counters.set(key, { count: 1, windowStart: now });
    } else {
      existing.count += 1;
      this.counters.set(key, existing);
    }

    const state = this.counters.get(key)!;

    const remaining = Math.max(0, options.max - state.count);
    const resetInMs = Math.max(0, options.windowMs - (now - state.windowStart));

    // Rate limit headers (informational)
    response.setHeader('X-RateLimit-Limit', String(options.max));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(resetInMs / 1000))); // seconds

    if (state.count > options.max) {
      throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return next.handle();
  }

  private resolveOptions(handler: any, controller: any): Required<RateLimitOptions> {
    const defaultOptions: Required<RateLimitOptions> = {
      windowMs: 60_000,
      max: 60,
      keyByUser: true,
    };

    const handlerOpts = this.reflector.get<RateLimitOptions | undefined>(RATE_LIMIT_KEY, handler);
    const controllerOpts = this.reflector.get<RateLimitOptions | undefined>(RATE_LIMIT_KEY, controller);

    return { ...defaultOptions, ...(controllerOpts ?? {}), ...(handlerOpts ?? {}) };
  }

  private buildKey(request: any, handler: any, controller: any, options: Required<RateLimitOptions>): string {
    const user = request.user;
    const userId = options.keyByUser ? (user?.id ?? user?.userId ?? user?.sub) : undefined;
    const ip = request.ip ?? request.connection?.remoteAddress ?? 'unknown';
    const tenant = user?.tenantCode ?? request.params?.tenantCode ?? 'no-tenant';
    const controllerName = controller.name ?? 'UnknownController';
    const methodName = handler.name ?? request.method;

    const principal = userId !== undefined ? `user:${String(userId)}` : `ip:${String(ip)}`;
    return `${tenant}:${controllerName}.${methodName}:${principal}`;
  }
}


