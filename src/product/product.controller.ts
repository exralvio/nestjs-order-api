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
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TenantInterceptor } from '../auth/interceptors/tenant.interceptor';
import { ApiResponseWrapper } from '../common/decorators/api-response.decorator';
import { CacheService } from '../common/services/cache.service';
import { Role } from '@prisma/client';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly cacheService: CacheService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponseWrapper({ message: 'Product created successfully' })
  @Roles(Role.ADMIN)
  async create(@Body() createProductDto: CreateProductDto) {
    const product = await this.productService.create(createProductDto);
    
    // Invalidate cache for findAll since we added a new product
    await this.cacheService.del('ProductController', 'findAll');
    
    return product;
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponseWrapper({ message: 'Products retrieved successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  async findAll() {
    const controllerName = 'ProductController';
    const methodName = 'findAll';
    
    // Try to get from cache first
    const cached = await this.cacheService.get(controllerName, methodName);
    if (cached) {
      return cached;
    }
    
    // If not in cache, fetch from database
    const products = await this.productService.findAll();
    
    // Cache the result for 5 minutes (300 seconds)
    await this.cacheService.set(controllerName, methodName, products, 300);
    
    return products;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiResponseWrapper({ message: 'Product retrieved successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  async findOne(@Param('id') id: string) {
    const controllerName = 'ProductController';
    const methodName = 'findOne';
    
    // Try to get from cache first
    const cached = await this.cacheService.get(controllerName, methodName, { id });
    if (cached) {
      return cached;
    }
    
    // If not in cache, fetch from database
    const product = await this.productService.findOne(id);
    
    // Cache the result for 5 minutes (300 seconds)
    await this.cacheService.set(controllerName, methodName, product, 300, { id });
    
    return product;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product by ID' })
  @ApiResponseWrapper({ message: 'Product updated successfully' })
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    const product = await this.productService.update(id, updateProductDto);
    
    // Invalidate cache for both findAll and this specific product
    await this.cacheService.del('ProductController', 'findAll');
    await this.cacheService.del('ProductController', 'findOne', { id });
    
    return product;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product by ID' })
  @ApiResponseWrapper({ message: 'Product deleted successfully' })
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string) {
    const product = await this.productService.remove(id);
    
    // Invalidate cache for both findAll and this specific product
    await this.cacheService.del('ProductController', 'findAll');
    await this.cacheService.del('ProductController', 'findOne', { id });
    
    return product;
  }
}

