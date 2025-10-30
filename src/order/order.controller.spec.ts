import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { BadRequestException } from '@nestjs/common';
import { TenantInterceptor } from '../auth/interceptors/tenant.interceptor';
import { CacheInterceptor } from '../common/interceptors/cache.interceptor';
import { TenantContextService } from '../prisma/tenant-context.service';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../common/services/cache.service';

describe('OrderController', () => {
  let controller: OrderController;
  let service: jest.Mocked<OrderService>;

  const mockOrderService = () => ({
    createOrder: jest.fn(),
    addItemToOrder: jest.fn(),
    enqueueOrderProcessing: jest.fn(),
    enqueueOrderCompleted: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    paymentReceived: jest.fn(),
  }) as unknown as jest.Mocked<OrderService>;

  const mockUser = { id: 'user-1' } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useFactory: mockOrderService },
        // Provide no-op interceptors to satisfy DI from @UseInterceptors on controller
        { provide: TenantInterceptor, useValue: { intercept: (_ctx: any, next: any) => next.handle() } },
        { provide: CacheInterceptor, useValue: { intercept: (_ctx: any, next: any) => next.handle() } },
        // Provide a no-op TenantContextService in case Nest tries to instantiate TenantInterceptor
        { provide: TenantContextService, useValue: { setTenantCode: jest.fn(), getTenantCode: jest.fn() } as unknown as TenantContextService },
        // Satisfy CacheInterceptor constructor deps
        { provide: Reflector, useValue: { get: jest.fn(), getAllAndOverride: jest.fn(), getAllAndMerge: jest.fn() } },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), delPattern: jest.fn(), delMethodUserKeys: jest.fn() } },
      ],
    }).compile();

    controller = module.get<OrderController>(OrderController);
    service = module.get(OrderService);
  });

  describe('create', () => {
    it('throws if items missing/empty', async () => {
      await expect(
        controller.create(mockUser, 'TENANT1', { items: [] as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates order, adds items, enqueues, returns order', async () => {
      service.createOrder.mockResolvedValueOnce({ id: 'order-1' } as any);
      service.findOne.mockResolvedValueOnce({ id: 'order-1', total: 100 } as any);

      const result = await controller.create(
        mockUser,
        'TENANT1',
        { items: [{ product_id: 'p1', qty: 2 }, { product_id: 'p2', qty: 1 }] },
      );

      expect(service.createOrder).toHaveBeenCalledWith('user-1', 'TENANT1');
      expect(service.addItemToOrder).toHaveBeenCalledTimes(2);
      expect(service.addItemToOrder).toHaveBeenNthCalledWith(
        1,
        'order-1',
        'user-1',
        { productId: 'p1', quantity: 2 },
        'TENANT1',
      );
      expect(service.enqueueOrderProcessing).toHaveBeenCalledWith('order-1', 'user-1', 'TENANT1');
      expect(service.findOne).toHaveBeenCalledWith('order-1', 'user-1');
      expect(result).toEqual({ id: 'order-1', total: 100 });
    });
  });

  describe('findAll', () => {
    it('parses pagination and delegates', () => {
      service.findAll.mockResolvedValueOnce({ page: 1 } as any);
      const res = controller.findAll(mockUser, {} as any, '2', '5');
      expect(service.findAll).toHaveBeenCalledWith('user-1', 2, 5);
      return expect(res).resolves.toEqual({ page: 1 });
    });
  });

  describe('findOne', () => {
    it('delegates to service with user scoping', () => {
      service.findOne.mockResolvedValueOnce({ id: 'order-1' } as any);
      const res = controller.findOne('order-1', mockUser);
      expect(service.findOne).toHaveBeenCalledWith('order-1', 'user-1');
      return expect(res).resolves.toEqual({ id: 'order-1' });
    });
  });

  describe('paymentReceived', () => {
    it('delegates to service', () => {
      service.paymentReceived.mockResolvedValueOnce({ ok: true } as any);
      const res = controller.paymentReceived('order-1', mockUser, 'TENANT1');
      expect(service.paymentReceived).toHaveBeenCalledWith('order-1', 'user-1', 'TENANT1');
      return expect(res).resolves.toEqual({ ok: true });
    });
  });

  describe('completeOrder', () => {
    it('throws on missing transaction_id', async () => {
      await expect(
        controller.completeOrder('order-1', mockUser, 'TENANT1', {} as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enqueues completion', async () => {
      service.enqueueOrderCompleted.mockResolvedValueOnce({ queued: true } as any);
      const res = await controller.completeOrder('order-1', mockUser, 'TENANT1', { transaction_id: 'tx-1' });
      expect(service.enqueueOrderCompleted).toHaveBeenCalledWith('order-1', 'user-1', 'TENANT1', 'tx-1');
      expect(res).toEqual({ queued: true });
    });
  });
});


