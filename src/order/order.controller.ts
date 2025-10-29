import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { AddItemDto } from './dto/add-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TenantInterceptor } from '../auth/interceptors/tenant.interceptor';
import { ApiResponseWrapper } from '../common/decorators/api-response.decorator';
import { Role } from '@prisma/client';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponseWrapper({ message: 'Order created successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  create(@GetUser() user: any) {
    return this.orderService.createOrder(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get user orders' })
  @ApiResponseWrapper({ message: 'Orders retrieved successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  findAll(@GetUser() user: any) {
    // All users see only their own orders
    return this.orderService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by ID' })
  @ApiResponseWrapper({ message: 'Order retrieved successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  findOne(@Param('id') id: string, @GetUser() user: any) {
    // All users can only see their own orders
    return this.orderService.findOne(id, user.id);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add product to order' })
  @ApiResponseWrapper({ message: 'Item added to order successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  addItem(
    @Param('id') id: string,
    @Body() addItemDto: AddItemDto,
    @GetUser() user: any,
  ) {
    return this.orderService.addItemToOrder(id, user.id, addItemDto);
  }

  @Post(':id/checkout')
  @ApiOperation({ summary: 'Checkout order (change status to waiting for payment)' })
  @ApiResponseWrapper({ message: 'Order checkout successful' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  checkout(@Param('id') id: string, @GetUser() user: any) {
    return this.orderService.checkoutOrder(id, user.id);
  }

  @Post(':id/payment-received')
  @ApiOperation({ summary: 'Mark payment as received (manual trigger)' })
  @ApiResponseWrapper({ message: 'Payment marked as received' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  paymentReceived(@Param('id') id: string, @GetUser() user: any) {
    return this.orderService.paymentReceived(id, user.id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Change order status to complete' })
  @ApiResponseWrapper({ message: 'Order completed successfully' })
  @Roles(Role.ADMIN, Role.CUSTOMER)
  complete(@Param('id') id: string, @GetUser() user: any) {
    return this.orderService.completeOrder(id, user.id);
  }
}

