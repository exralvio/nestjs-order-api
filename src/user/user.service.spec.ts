import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { DefaultPrismaService } from '../prisma/default-prisma.service';
import { DatabaseManagerService } from '../prisma/database-manager.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

jest.mock('bcrypt');

describe('UserService', () => {
  let service: UserService;

  const prisma = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;

  const dbManager = {} as unknown as DatabaseManagerService;

  const rabbit = {
    publishDatabaseCreationMessage: jest.fn(),
  } as any as jest.Mocked<RabbitMQService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: DefaultPrismaService, useValue: prisma },
        { provide: DatabaseManagerService, useValue: dbManager },
        { provide: RabbitMQService, useValue: rabbit },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('create', () => {
    it('validates tenantCode for roles', async () => {
      await expect(service.create({ role: Role.ADMIN } as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create({ role: Role.CUSTOMER, tenantCode: 'T1' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws on user conflict', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' } as any);
      await expect(service.create({ role: Role.CUSTOMER, email: 'a', username: 'b', password: 'p' } as any)).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates user and publishes DB creation for ADMIN', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null); // conflict check
      prisma.user.findFirst.mockResolvedValueOnce(null); // tenant code check
      prisma.user.create.mockResolvedValueOnce({ id: 'u1', isDatabaseCreated: false } as any);
      const res = await service.create({ role: Role.ADMIN, email: 'a', username: 'b', password: 'p', tenantCode: 'T1' } as any);
      expect(bcrypt.hash).toHaveBeenCalledWith('p', 10);
      expect(rabbit.publishDatabaseCreationMessage).toHaveBeenCalledWith({ userId: 'u1', tenantCode: 'T1' });
      expect(res.id).toBe('u1');
    });
  });

  it('findAll returns selected fields', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'u1' }] as any);
    const res = await service.findAll();
    expect(prisma.user.findMany).toHaveBeenCalled();
    expect(res).toEqual([{ id: 'u1' }]);
  });

  describe('findOne', () => {
    it('throws when not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('hashes password if provided', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({ id: 'u1' } as any);
      prisma.user.update.mockResolvedValueOnce({ id: 'u1' } as any);
      const res = await service.update('u1', { password: 'new' } as any);
      expect(bcrypt.hash).toHaveBeenCalledWith('new', 10);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(res).toEqual({ id: 'u1' });
    });
  });

  describe('remove', () => {
    it('deletes after exists check', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({ id: 'u1' } as any);
      prisma.user.delete.mockResolvedValueOnce({ id: 'u1' } as any);
      const res = await service.remove('u1');
      expect(prisma.user.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } })
      );
      expect(res).toEqual({ id: 'u1' });
    });
  });

  describe('checkDatabaseStatus', () => {
    it('returns message', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({ id: 'u1', isDatabaseCreated: true } as any);
      const res = await service.checkDatabaseStatus('u1');
      expect(res.isDatabaseCreated).toBe(true);
      expect(res.message).toBeDefined();
    });
  });
});


