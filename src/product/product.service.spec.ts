import { Test, TestingModule } from '@nestjs/testing';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ProductService', () => {
  let service: ProductService;

  const prisma = {
    product: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;

  const tenantContext = {
    hasTenant: jest.fn(),
    getTenantCode: jest.fn(),
  } as any as jest.Mocked<TenantContextService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenantContext },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  describe('create', () => {
    it('requires tenant context code when tenant exists', async () => {
      tenantContext.hasTenant.mockReturnValue(true);
      tenantContext.getTenantCode.mockReturnValue(undefined as any);
      await expect(service.create({ name: 'n', description: 'd', price: 1 } as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates product', async () => {
      tenantContext.hasTenant.mockReturnValue(false);
      prisma.product.create.mockResolvedValueOnce({ id: 'p1' } as any);
      const res = await service.create({ name: 'n', description: 'd', price: 1 } as any);
      expect(prisma.product.create).toHaveBeenCalled();
      expect(res).toEqual({ id: 'p1' });
    });
  });

  describe('findAll', () => {
    it('returns pagination object', async () => {
      prisma.product.count.mockResolvedValueOnce(2 as any);
      prisma.product.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }] as any);
      const res = await service.findAll('TENANT1', 1, 10);
      expect(res.total).toBe(2);
      expect(res.data.length).toBe(2);
    });

    it('maps tenant missing error', async () => {
      prisma.product.count.mockImplementationOnce(() => { throw new Error('does not exist'); });
      await expect(service.findAll('TENANT1', 1, 10)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('throws when not found', async () => {
      prisma.product.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('x', 'TENANT')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('calls prisma.update after existence check', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({ id: 'p1' } as any);
      prisma.product.update.mockResolvedValueOnce({ id: 'p1' } as any);
      const res = await service.update('p1', { name: 'n' } as any, 'TENANT');
      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { name: 'n' } });
      expect(res).toEqual({ id: 'p1' });
    });
  });

  describe('remove', () => {
    it('calls prisma.delete after existence check', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({ id: 'p1' } as any);
      prisma.product.delete.mockResolvedValueOnce({ id: 'p1' } as any);
      const res = await service.remove('p1', 'TENANT');
      expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(res).toEqual({ id: 'p1' });
    });
  });
});


