import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { AddItemDto } from './dto/add-item.dto';
import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private tenantContext: TenantContextService,
  ) {}

  async createOrder(userId: string) {
    return this.prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING,
        total: 0,
      },
    });
  }

  async addItemToOrder(orderId: string, userId: string, addItemDto: AddItemDto) {
    // Verify order exists and belongs to user
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have permission to modify this order');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Cannot add items to an order that is not pending');
    }

    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: addItemDto.productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${addItemDto.productId} not found`);
    }

    // Check stock availability
    if (product.stock < addItemDto.quantity) {
      throw new BadRequestException(`Insufficient stock. Available: ${product.stock}`);
    }

    // Check if item already exists in order
    const existingItem = await this.prisma.orderItem.findFirst({
      where: {
        orderId,
        productId: addItemDto.productId,
      },
    });

    let orderItem;
    if (existingItem) {
      // Update quantity if item already exists
      orderItem = await this.prisma.orderItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + addItemDto.quantity,
        },
        include: {
          product: true,
        },
      });
    } else {
      // Create new order item
      orderItem = await this.prisma.orderItem.create({
        data: {
          orderId,
          productId: addItemDto.productId,
          quantity: addItemDto.quantity,
          price: product.price,
        },
        include: {
          product: true,
        },
      });
    }

    // Recalculate order total
    await this.recalculateOrderTotal(orderId);

    return orderItem;
  }

  async checkoutOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have permission to checkout this order');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order is not in pending status');
    }

    if (order.items.length === 0) {
      throw new BadRequestException('Cannot checkout an order with no items');
    }

    // Verify stock availability for all items
    for (const item of order.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${item.productId} not found`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${product.name}. Available: ${product.stock}, Required: ${item.quantity}`,
        );
      }
    }

    // Update order status to WAITING_FOR_PAYMENT
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.WAITING_FOR_PAYMENT,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        },
      },
    });
  }

  async paymentReceived(orderId: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (userId && order.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this order');
    }

    if (order.status !== OrderStatus.WAITING_FOR_PAYMENT) {
      throw new BadRequestException('Order is not waiting for payment');
    }

    // Deduct stock from products
    for (const item of order.items) {
      await this.prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });
    }

    // Update order status to PAID
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PAID,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        },
      },
    });
  }

  async completeOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Order must be paid before it can be completed');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETE,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        },
      },
    });
  }

  async findAll(userId?: string) {
    const where = userId ? { userId } : {};
    
    return this.prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, userId?: string) {
    const where: any = { id };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  private async recalculateOrderTotal(orderId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
    });

    const total = items.reduce((sum, item) => {
      return sum + Number(item.price) * item.quantity;
    }, 0);

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        total: new Decimal(total),
      },
    });
  }
}

