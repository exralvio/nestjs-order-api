import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantInterceptor } from '../auth/interceptors/tenant.interceptor';
import { ApiResponseWrapper } from '../common/decorators/api-response.decorator';
import { CacheInterceptor } from '../common/interceptors/cache.interceptor';
import { Cacheable, InvalidateCache } from '../common/decorators/cache.decorator';
import { TenantCode } from '../common/decorators/tenant-code.decorator';
import { Role } from '@prisma/client';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor, CacheInterceptor)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponseWrapper({ message: 'Product created successfully' })
  @Roles(Role.ADMIN)
  @InvalidateCache(['findAll'])
  async create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiQuery({ name: 'tenantCode', required: true, description: 'Tenant code to filter products' })
  @ApiResponseWrapper({ message: 'Products retrieved successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  @Cacheable({ ttl: 300 })
  async findAll(@TenantCode() tenantCode: string) {
    return this.productService.findAll(tenantCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiQuery({ name: 'tenantCode', required: true, description: 'Tenant code to filter products' })
  @ApiResponseWrapper({ message: 'Product retrieved successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  @Cacheable({ ttl: 300 })
  async findOne(@Param('id') id: string, @TenantCode() tenantCode: string) {
    return this.productService.findOne(id, tenantCode);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product by ID' })
  @ApiQuery({ name: 'tenantCode', required: true, description: 'Tenant code to filter products' })
  @ApiResponseWrapper({ message: 'Product updated successfully' })
  @Roles(Role.ADMIN)
  @InvalidateCache(['findAll', 'findOne'])
  async update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto, @TenantCode() tenantCode: string) {
    return this.productService.update(id, updateProductDto, tenantCode);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product by ID' })
  @ApiQuery({ name: 'tenantCode', required: true, description: 'Tenant code to filter products' })
  @ApiResponseWrapper({ message: 'Product deleted successfully' })
  @Roles(Role.ADMIN)
  @InvalidateCache(['findAll', 'findOne'])
  async remove(@Param('id') id: string, @TenantCode() tenantCode: string) {
    return this.productService.remove(id, tenantCode);
  }
}

