import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import * as request from 'supertest';
import { OrderController } from '../src/order/order.controller';
import { OrderService } from '../src/order/order.service';
import { TenantInterceptor } from '../src/auth/interceptors/tenant.interceptor';
import { CacheInterceptor } from '../src/common/interceptors/cache.interceptor';
import { RateLimitInterceptor } from '../src/common/interceptors/rate-limit.interceptor';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { TenantContextService } from '../src/prisma/tenant-context.service';
import { CacheService } from '../src/common/services/cache.service';

class AllowAllGuardWithUser implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req) {
      req.user = { id: 'user-1', tenantCode: 'TENANT1' };
    }
    return true;
  }
}

const passThrough = { intercept: (_ctx: any, next: any) => next.handle() };

describe('Order rate limit (e2e)', () => {
  let app: INestApplication;

  const orderServiceMock: jest.Mocked<OrderService> = {
    createOrder: jest.fn(),
    addItemToOrder: jest.fn(),
    enqueueOrderProcessing: jest.fn(),
    findOne: jest.fn().mockResolvedValue({ id: 'o1' }),
    findAll: jest.fn().mockImplementation((userId: string, page: number, perPage: number) => ({ userId, page, perPage })),
    paymentReceived: jest.fn(),
    enqueueOrderCompleted: jest.fn(),
  } as any;

  const cacheServiceMock: jest.Mocked<CacheService> = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(undefined),
    delMethodUserKeys: jest.fn().mockResolvedValue(undefined),
  } as any;

  beforeAll(async () => {
    let builder: TestingModuleBuilder = Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useValue: orderServiceMock },
        { provide: TenantInterceptor, useValue: passThrough },
        { provide: CacheInterceptor, useValue: passThrough },
        RateLimitInterceptor,
        Reflector,
        { provide: TenantContextService, useValue: { setTenantCode: jest.fn(), getTenantCode: jest.fn() } as unknown as TenantContextService },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    });

    builder = builder
      .overrideGuard(JwtAuthGuard)
      .useValue(new AllowAllGuardWithUser())
      .overrideGuard(RolesGuard)
      .useValue(new AllowAllGuardWithUser());

    const moduleRef: TestingModule = await builder.compile();

    app = moduleRef.createNestApplication();

    // Register the real RateLimitInterceptor globally so it applies to OrderController
    const rateLimitInterceptor = moduleRef.get(RateLimitInterceptor);
    app.useGlobalInterceptors(rateLimitInterceptor);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 429 after exceeding the class-level max (GET /orders)', async () => {
    const path = `/orders`;
    const max = 30; // class-level @RateLimit on controller

    for (let i = 1; i <= max; i++) {
      const res = await request(app.getHttpServer()).get(path);
      expect([200, 201]).toContain(res.status);
      expect(res.headers['x-ratelimit-limit']).toBe(String(max));
      const remaining = Number(res.headers['x-ratelimit-remaining']);
      expect(remaining).toBeGreaterThanOrEqual(0);
      if (i === max) {
        expect(remaining).toBe(0);
      }
      expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThanOrEqual(0);
    }

    const blocked = await request(app.getHttpServer()).get(path);
    expect(blocked.status).toBe(429);
    expect(blocked.text).toContain('Too many requests');
    expect(blocked.headers['x-ratelimit-limit']).toBe(String(max));
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
  });
});
