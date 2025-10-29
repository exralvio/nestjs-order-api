import { Injectable, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DefaultPrismaService } from '../prisma/default-prisma.service';
import { DatabaseManagerService } from '../prisma/database-manager.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
@Injectable()
export class UserService {
  constructor(
    private prisma: DefaultPrismaService,
    private databaseManager: DatabaseManagerService,
    private rabbitMQService: RabbitMQService,
  ) {}


  async create(createUserDto: CreateUserDto) {
    // Validate tenant_code for ADMIN role
    if (createUserDto.role === Role.ADMIN && !createUserDto.tenantCode) {
      throw new BadRequestException('tenantCode is required for ADMIN role');
    }

    if (createUserDto.role !== Role.ADMIN && createUserDto.tenantCode) {
      throw new BadRequestException('tenantCode can only be set for ADMIN role');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: createUserDto.email },
          { username: createUserDto.username },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or username already exists');
    }

    // Check if tenant_code is already in use (if provided)
    if (createUserDto.tenantCode) {
      const existingTenant = await this.prisma.user.findFirst({
        where: { tenantCode: createUserDto.tenantCode },
      });

      if (existingTenant) {
        throw new ConflictException('Tenant code is already in use');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        username: createUserDto.username,
        password: hashedPassword,
        role: createUserDto.role || 'CUSTOMER',
        tenantCode: createUserDto.tenantCode || null,
        isDatabaseCreated: createUserDto.role !== Role.ADMIN, // Only ADMIN users need database creation
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        isDatabaseCreated: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // If user is ADMIN with tenantCode, publish message to create database
    if (createUserDto.role === Role.ADMIN && createUserDto.tenantCode) {
      try {
        await this.rabbitMQService.publishDatabaseCreationMessage({
          userId: user.id,
          tenantCode: createUserDto.tenantCode,
        });
      } catch (error) {
        // If RabbitMQ fails, we should still return the user but log the error
        console.error('Failed to publish database creation message:', error);
      }
    }

    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        isDatabaseCreated: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        isDatabaseCreated: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    await this.findOne(id);

    // Hash password if provided
    const updateData: any = { ...updateUserDto };
    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        isDatabaseCreated: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.user.delete({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        tenantCode: true,
        isDatabaseCreated: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async checkDatabaseStatus(userId: string) {
    const user = await this.findOne(userId);
    
    return {
      userId: user.id,
      isDatabaseCreated: user.isDatabaseCreated,
      message: user.isDatabaseCreated 
        ? 'Database is ready for use' 
        : 'Database creation is in progress or failed',
    };
  }
}

