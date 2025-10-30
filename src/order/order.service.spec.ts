import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { DatabaseManagerService } from '../prisma/database-manager.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('OrderService', () => {
  let service: OrderService;

  const prisma = {
    order: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;

  const tenantContext = { /* no-op in tests */ } as unknown as TenantContextService;

  const databaseManager = {
    getDefaultClient: jest.fn(),
    getClient: jest.fn(),
  } as any as jest.Mocked<DatabaseManagerService>;

  const rabbit = {
    publishOrderProcessingMessage: jest.fn(),
    publishOrderCompletedMessage: jest.fn(),
  } as any as jest.Mocked<RabbitMQService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: DatabaseManagerService, useValue: databaseManager },
        { provide: RabbitMQService, useValue: rabbit },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  describe('createOrder', () => {
    it('creates pending order', async () => {
      prisma.order.create.mockResolvedValueOnce({ id: 'o1' } as any);
      const res = await service.createOrder('u1', 'TENANT1');
      expect(prisma.order.create).toHaveBeenCalled();
      expect(res).toEqual({ id: 'o1' });
    });

    it('maps tenant missing DB errors', async () => {
      prisma.order.create.mockRejectedValueOnce(new Error('does not exist'));
      await expect(service.createOrder('u1', 'TENANT1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('enqueueOrderCompleted', () => {
    it('throws if order not found', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(service.enqueueOrderCompleted('o1', 'u1', 'TENANT', 'tx')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws if user mismatch', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u2' } as any);
      await expect(service.enqueueOrderCompleted('o1', 'u1', 'TENANT', 'tx')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('publishes completion message', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u1' } as any);
      const res = await service.enqueueOrderCompleted('o1', 'u1', 'TENANT', 'tx');
      expect(rabbit.publishOrderCompletedMessage).toHaveBeenCalledWith({ orderId: 'o1', userId: 'u1', tenantCode: 'TENANT', transactionId: 'tx' });
      expect(res).toEqual({ queued: true });
    });
  });

  describe('addItemToOrder', () => {
    beforeEach(() => {
      prisma.order.findUnique.mockReset();
      prisma.product.findUnique.mockReset();
      prisma.orderItem.findFirst.mockReset();
      prisma.orderItem.update.mockReset();
      prisma.orderItem.create.mockReset();
      prisma.orderItem.findMany.mockReset();
      prisma.order.update.mockReset();
    });

    it('validates order exists and belongs to user', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(service.addItemToOrder('o1', 'u1', { productId: 'p1', quantity: 1 }, 'TENANT')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('errors when product not found', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u1', status: 'PENDING' } as any);
      prisma.product.findUnique.mockResolvedValueOnce(null);
      await expect(service.addItemToOrder('o1', 'u1', { productId: 'p1', quantity: 1 }, 'TENANT')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates new order item and recalculates total', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u1', status: 'PENDING' } as any);
      prisma.product.findUnique.mockResolvedValueOnce({ id: 'p1', stock: 5, price: 10 } as any);
      prisma.orderItem.findFirst.mockResolvedValueOnce(null);
      prisma.orderItem.create.mockResolvedValueOnce({ id: 'oi1' } as any);
      prisma.orderItem.findMany.mockResolvedValueOnce([{ price: 10, quantity: 2 }] as any);
      prisma.order.update.mockResolvedValueOnce({ id: 'o1', total: 20 } as any);

      const res = await service.addItemToOrder('o1', 'u1', { productId: 'p1', quantity: 2 }, 'TENANT');
      expect(prisma.orderItem.create).toHaveBeenCalled();
      expect(prisma.orderItem.findMany).toHaveBeenCalledWith({ where: { orderId: 'o1' } });
      expect(prisma.order.update).toHaveBeenCalled();
      expect(res).toEqual({ id: 'oi1' });
    });
  });

  describe('checkoutOrder', () => {
    it('validates order and stock then updates status', async () => {
      const items = [{ productId: 'p1', quantity: 1 }];
      prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u1', status: 'PENDING', items } as any);
      prisma.product.findUnique.mockResolvedValueOnce({ id: 'p1', stock: 2 } as any);
      prisma.order.update.mockResolvedValueOnce({ id: 'o1', status: 'WAITING_FOR_PAYMENT' } as any);
      const res = await service.checkoutOrder('o1', 'u1', 'TENANT');
      expect(prisma.order.update).toHaveBeenCalled();
      expect(res).toEqual({ id: 'o1', status: 'WAITING_FOR_PAYMENT' });
    });
  });

  describe('paymentReceived', () => {
    it('deducts stock and updates order to PAID', async () => {
      const items = [{ productId: 'p1', quantity: 2 }];
      prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u1', status: 'WAITING_FOR_PAYMENT', items } as any);
      prisma.product.update.mockResolvedValueOnce({} as any);
      prisma.order.update.mockResolvedValueOnce({ id: 'o1', status: 'PAID' } as any);
      const res = await service.paymentReceived('o1', 'u1', 'TENANT');
      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { decrement: 2 } } });
      expect(prisma.order.update).toHaveBeenCalled();
      expect(res).toEqual({ id: 'o1', status: 'PAID' });
    });
  });

  describe('findAll', () => {
    it('aggregates across tenants and paginates', async () => {
      const defaultClient = { user: { findMany: jest.fn().mockResolvedValue([{ tenantCode: 'T1' }, { tenantCode: 'T2' }]) } } as any;
      const tenantClient = (orders: any[]) => ({ order: { findMany: jest.fn().mockResolvedValue(orders) } });
      (databaseManager.getDefaultClient as jest.Mock).mockReturnValue(defaultClient);
      (databaseManager.getClient as jest.Mock).mockImplementation((code: string) =>
        code === 'T1' ? tenantClient([{ id: 'a', createdAt: new Date('2020-01-02') }]) : tenantClient([{ id: 'b', createdAt: new Date('2020-01-01') }]),
      );

      const res = await service.findAll('u1', 1, 10);
      expect(res.total).toBe(2);
      expect(res.data.length).toBe(2);
    });
  });

  describe('findOne', () => {
    it('throws when not found', async () => {
      prisma.order.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('o1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});


