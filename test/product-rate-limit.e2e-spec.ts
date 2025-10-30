import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import * as request from 'supertest';
import { ProductController } from '../src/product/product.controller';
import { ProductService } from '../src/product/product.service';
import { TenantInterceptor } from '../src/auth/interceptors/tenant.interceptor';
import { CacheInterceptor } from '../src/common/interceptors/cache.interceptor';
import { RateLimitInterceptor } from '../src/common/interceptors/rate-limit.interceptor';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { TenantContextService } from '../src/prisma/tenant-context.service';
import { CacheService } from '../src/common/services/cache.service';

class AllowAllGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Attach a fake user for keyByUser paths if needed
    const req = _context.switchToHttp().getRequest();
    if (req) {
      req.user = { id: 'test-user', tenantCode: req.params?.tenantCode ?? 'TENANT1' };
    }
    return true;
  }
}

// No-op interceptors to satisfy DI
const passThrough = { intercept: (_ctx: any, next: any) => next.handle() };

describe('Product rate limit (e2e)', () => {
  let app: INestApplication;

  const productServiceMock: jest.Mocked<ProductService> = {
    create: jest.fn(),
    findAll: jest.fn().mockImplementation((tenant: string, page: number, perPage: number) => ({ tenant, page, perPage })),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
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
      controllers: [ProductController],
      providers: [
        { provide: ProductService, useValue: productServiceMock },
        { provide: TenantInterceptor, useValue: passThrough },
        { provide: CacheInterceptor, useValue: passThrough },
        // Use the real rate limit interceptor
        RateLimitInterceptor,
        Reflector,
        // Mock tenant context to satisfy TenantInterceptor constructor
        { provide: TenantContextService, useValue: { setTenantCode: jest.fn(), getTenantCode: jest.fn() } as unknown as TenantContextService },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    });

    builder = builder
      .overrideGuard(JwtAuthGuard)
      .useValue(new AllowAllGuard())
      .overrideGuard(RolesGuard)
      .useValue(new AllowAllGuard());

    const moduleRef: TestingModule = await builder.compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 429 after exceeding the per-route max (GET /:tenantCode/products)', async () => {
    const tenant = 'TENANT1';
    const path = `/${tenant}/products`;

    // findAll configured max is 30 in controller
    const max = 30;

    // First max requests should succeed
    for (let i = 1; i <= max; i++) {
      const res = await request(app.getHttpServer()).get(path);
      expect([200, 201]).toContain(res.status); // default 200
      expect(res.headers['x-ratelimit-limit']).toBe(String(max));
      // remaining should count down to 0 on the max-th request
      const remaining = Number(res.headers['x-ratelimit-remaining']);
      expect(remaining).toBeGreaterThanOrEqual(0);
      if (i === max) {
        expect(remaining).toBe(0);
      }
      expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThanOrEqual(0);
    }

    // Next request should be blocked
    const blocked = await request(app.getHttpServer()).get(path);
    expect(blocked.status).toBe(429);
    expect(blocked.text).toContain('Too many requests');
    expect(blocked.headers['x-ratelimit-limit']).toBe(String(max));
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
  });
});
