import { Test, TestingModule } from '@nestjs/testing';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { TenantInterceptor } from '../auth/interceptors/tenant.interceptor';
import { CacheInterceptor } from '../common/interceptors/cache.interceptor';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { TenantContextService } from '../prisma/tenant-context.service';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../common/services/cache.service';

describe('ProductController', () => {
  let controller: ProductController;
  let service: jest.Mocked<ProductService>;

  const mockService = () => ({
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }) as unknown as jest.Mocked<ProductService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        { provide: ProductService, useFactory: mockService },
        // Provide no-op interceptors to satisfy DI from @UseInterceptors on controller
        { provide: TenantInterceptor, useValue: { intercept: (_ctx: any, next: any) => next.handle() } },
        { provide: CacheInterceptor, useValue: { intercept: (_ctx: any, next: any) => next.handle() } },
        { provide: RateLimitInterceptor, useValue: { intercept: (_ctx: any, next: any) => next.handle() } },
        // Satisfy interceptor constructor dependencies
        { provide: TenantContextService, useValue: { setTenantCode: jest.fn(), getTenantCode: jest.fn() } as unknown as TenantContextService },
        { provide: Reflector, useValue: { get: jest.fn(), getAllAndOverride: jest.fn(), getAllAndMerge: jest.fn() } },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), delPattern: jest.fn(), delMethodUserKeys: jest.fn() } },
      ],
    }).compile();

    controller = module.get<ProductController>(ProductController);
    service = module.get(ProductService);
  });

  it('create delegates', async () => {
    service.create.mockResolvedValueOnce({ id: 'p1' } as any);
    const res = await controller.create({} as any);
    expect(service.create).toHaveBeenCalled();
    expect(res).toEqual({ id: 'p1' });
  });

  it('findAll parses pagination and delegates', async () => {
    service.findAll.mockResolvedValueOnce({ page: 2 } as any);
    const res = await controller.findAll('TENANT1', '2', '5');
    expect(service.findAll).toHaveBeenCalledWith('TENANT1', 2, 5);
    expect(res).toEqual({ page: 2 });
  });

  it('findOne delegates', async () => {
    service.findOne.mockResolvedValueOnce({ id: 'p1' } as any);
    const res = await controller.findOne('p1', 'TENANT1');
    expect(service.findOne).toHaveBeenCalledWith('p1', 'TENANT1');
    expect(res).toEqual({ id: 'p1' });
  });

  it('update delegates', async () => {
    service.update.mockResolvedValueOnce({ id: 'p1' } as any);
    const res = await controller.update('p1', {} as any, 'TENANT1');
    expect(service.update).toHaveBeenCalledWith('p1', {}, 'TENANT1');
    expect(res).toEqual({ id: 'p1' });
  });

  it('remove delegates', async () => {
    service.remove.mockResolvedValueOnce({ id: 'p1' } as any);
    const res = await controller.remove('p1', 'TENANT1');
    expect(service.remove).toHaveBeenCalledWith('p1', 'TENANT1');
    expect(res).toEqual({ id: 'p1' });
  });
});


