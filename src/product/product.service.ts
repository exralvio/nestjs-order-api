import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private tenantContext: TenantContextService,
  ) {}

  async create(createProductDto: CreateProductDto) {
    // For ADMIN users, tenant context should be set by interceptor
    // For CUSTOMER users, they should use default database
    if (this.tenantContext.hasTenant()) {
      // Ensure we have tenant context (should be set by interceptor)
      if (!this.tenantContext.getTenantCode()) {
        throw new ForbiddenException('Tenant context is required for ADMIN users');
      }
    }

    const product = await this.prisma.product.create({
      data: {
        name: createProductDto.name,
        description: createProductDto.description,
        price: createProductDto.price,
        stock: createProductDto.stock ?? 0,
      },
    });

    return product;
  }

  async findAll(tenantCode: string) {
    try {
      return await this.prisma.product.findMany({
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        throw new BadRequestException(`Tenant database for '${tenantCode}' does not exist. Please ensure the tenant is properly set up.`);
      }
      throw error;
    }
  }

  async findOne(id: string, tenantCode: string) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      return product;
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        throw new BadRequestException(`Tenant database for '${tenantCode}' does not exist. Please ensure the tenant is properly set up.`);
      }
      throw error;
    }
  }

  async update(id: string, updateProductDto: UpdateProductDto, tenantCode: string) {
    // Check if product exists
    await this.findOne(id, tenantCode);

    try {
      return await this.prisma.product.update({
        where: { id },
        data: updateProductDto,
      });
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        throw new BadRequestException(`Tenant database for '${tenantCode}' does not exist. Please ensure the tenant is properly set up.`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantCode: string) {
    // Check if product exists
    await this.findOne(id, tenantCode);

    try {
      return await this.prisma.product.delete({
        where: { id },
      });
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        throw new BadRequestException(`Tenant database for '${tenantCode}' does not exist. Please ensure the tenant is properly set up.`);
      }
      throw error;
    }
  }
}

