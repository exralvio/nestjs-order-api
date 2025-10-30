import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TenantInterceptor } from '../auth/interceptors/tenant.interceptor';
import { ApiResponseWrapper } from '../common/decorators/api-response.decorator';
import { Role } from '@prisma/client';
import { TenantCode } from '../common/decorators/tenant-code.decorator';
import { Cacheable, InvalidateCache } from 'src/common/decorators/cache.decorator';
import { CacheInterceptor } from 'src/common/interceptors/cache.interceptor';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor, CacheInterceptor)
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post(':tenantCode/create')
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponseWrapper({ message: 'Order created successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  @ApiParam({ name: 'tenantCode', required: true, description: 'Tenant code to route to destination database' })
  @InvalidateCache([{ method: 'findAll', includeUserId: true, isDefaultTenant: true }])
  async create(
    @GetUser() user: any,
    @TenantCode() tenantCode: string,
    @Body()
    body: {
      items: Array<{
        product_id: string;
        qty: number;
      }>;
    },
  ) {
    if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('items is required and must be a non-empty array');
    }

    const order = await this.orderService.createOrder(user.id, tenantCode);

    const items = body.items;
    for (const item of items) {
      // Map request fields to service DTO fields
      await this.orderService.addItemToOrder(
        order.id,
        user.id,
        { productId: item.product_id, quantity: item.qty },
        tenantCode,
      );
    }

    await this.orderService.enqueueOrderProcessing(order.id, user.id, tenantCode);

    return this.orderService.findOne(order.id, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get user orders' })
  @ApiResponseWrapper({ message: 'Orders retrieved successfully' })
  @Roles(Role.CUSTOMER)
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'per_page', required: false, type: Number, description: 'Items per page (default: 10)' })
  @Cacheable({ ttl: 300, includeUserId: true })
  findAll(@GetUser() user: any, @Param() _params: any, @Query('page') page?: string, @Query('per_page') perPage?: string) {
    // All users see only their own orders
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const perPageNum = Math.max(1, Math.min(100, parseInt(perPage ?? '10', 10) || 10));
    return this.orderService.findAll(user.id, pageNum, perPageNum);
  }

  @Get(':tenantCode/:id')
  @ApiOperation({ summary: 'Get an order by ID' })
  @ApiResponseWrapper({ message: 'Order retrieved successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  @ApiParam({ name: 'tenantCode', required: true, description: 'Tenant code to route to destination database' })
  findOne(@Param('id') id: string, @GetUser() user: any) {
    // All users can only see their own orders
    return this.orderService.findOne(id, user.id);
  }

  @Post(':tenantCode/:id/payment-received')
  @ApiOperation({ summary: 'Mark payment as received (manual trigger)' })
  @ApiResponseWrapper({ message: 'Payment marked as received' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  @ApiParam({ name: 'tenantCode', required: true, description: 'Tenant code to route to destination database' })
  paymentReceived(@Param('id') id: string, @GetUser() user: any, @TenantCode() tenantCode: string) {
    return this.orderService.paymentReceived(id, user.id, tenantCode);
  }

  @Post(':tenantCode/:id/complete')
  @ApiOperation({ summary: 'Mark order as completed (async via queue)' })
  @ApiResponseWrapper({ message: 'Order completion queued' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  @ApiParam({ name: 'tenantCode', required: true, description: 'Tenant code to route to destination database' })
  @InvalidateCache([{ method: 'findAll', includeUserId: true, isDefaultTenant: true }])
  async completeOrder(
    @Param('id') id: string,
    @GetUser() user: any,
    @TenantCode() tenantCode: string,
    @Body()
    body: {
      transaction_id: string;
    },
  ) {
    if (!body || typeof body.transaction_id !== 'string' || body.transaction_id.trim().length === 0) {
      throw new BadRequestException('transaction_id is required');
    }
    return this.orderService.enqueueOrderCompleted(id, user.id, tenantCode, body.transaction_id);
  }
}

