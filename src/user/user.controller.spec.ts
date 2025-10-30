import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  let service: jest.Mocked<UserService>;

  const mockService = () => ({
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    checkDatabaseStatus: jest.fn(),
  }) as unknown as jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useFactory: mockService },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get(UserService);
  });

  it('create delegates', () => {
    service.create.mockResolvedValueOnce({ id: 'u1' } as any);
    const res = controller.create({} as any);
    expect(service.create).toHaveBeenCalled();
    return expect(res).resolves.toEqual({ id: 'u1' });
  });

  it('findAll delegates', () => {
    service.findAll.mockResolvedValueOnce([] as any);
    const res = controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
    return expect(res).resolves.toEqual([]);
  });

  it('findOne delegates', () => {
    service.findOne.mockResolvedValueOnce({ id: 'u1' } as any);
    const res = controller.findOne('u1');
    expect(service.findOne).toHaveBeenCalledWith('u1');
    return expect(res).resolves.toEqual({ id: 'u1' });
  });

  it('update delegates', () => {
    service.update.mockResolvedValueOnce({ id: 'u1' } as any);
    const res = controller.update('u1', {} as any);
    expect(service.update).toHaveBeenCalledWith('u1', {});
    return expect(res).resolves.toEqual({ id: 'u1' });
  });

  it('remove delegates', () => {
    service.remove.mockResolvedValueOnce({ id: 'u1' } as any);
    const res = controller.remove('u1');
    expect(service.remove).toHaveBeenCalledWith('u1');
    return expect(res).resolves.toEqual({ id: 'u1' });
  });

  it('checkDatabaseStatus delegates', () => {
    service.checkDatabaseStatus.mockResolvedValueOnce({ ok: true } as any);
    const res = controller.checkDatabaseStatus('u1');
    expect(service.checkDatabaseStatus).toHaveBeenCalledWith('u1');
    return expect(res).resolves.toEqual({ ok: true });
  });
});


