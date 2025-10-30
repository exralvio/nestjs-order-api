import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RabbitMQService } from './rabbitmq.service';
import { DatabaseManagerService } from '../prisma/database-manager.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrderProcessingConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderProcessingConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly databaseManager: DatabaseManagerService,
  ) {}

  async onModuleInit() {
    // Delay slightly to allow RabbitMQ to initialize
    setTimeout(async () => {
      try {
        await this.rabbitMQService.consumeOrderProcessingMessages(
          this.handleOrderProcessing.bind(this),
        );
      } catch (error) {
        this.logger.error('Failed to start order processing consumer:', error);
        setTimeout(() => this.onModuleInit(), 5000);
      }
    }, 2000);
  }

  private async handleOrderProcessing(data: {
    orderId: string;
    userId: string;
    tenantCode: string;
  }): Promise<void> {
    const { orderId, tenantCode } = data;
    const tenantPrisma = this.databaseManager.getClient(tenantCode);

    // 1) Update status to WAITING_FOR_PAYMENT
    await tenantPrisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.WAITING_FOR_PAYMENT, paymentId: this.generatePaymentId() },
    });

    // 2) Create payment link (stub)
    await this.createPaymentLink(orderId, tenantCode);

    // 3) Send order pending email (stub)
    await this.sendOrderPendingEmail(orderId, tenantCode);
  }

  private async createPaymentLink(orderId: string, tenantCode: string): Promise<void> {
    // TODO: integrate with payment provider
    this.logger.log(`Stub createPaymentLink for order ${orderId} (tenant ${tenantCode})`);
  }

  private async sendOrderPendingEmail(orderId: string, tenantCode: string): Promise<void> {
    // TODO: integrate with email service
    this.logger.log(`Stub sendOrderPendingEmail for order ${orderId} (tenant ${tenantCode})`);
  }

  private generatePaymentId(): string {
    // Return a simple UUID using crypto.randomUUID (Node.js 16.17+ and most browsers)
    return randomUUID();
  }
}


