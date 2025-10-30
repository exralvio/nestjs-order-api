import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { DatabaseManagerService } from '../prisma/database-manager.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrderCompletedConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderCompletedConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly databaseManager: DatabaseManagerService,
  ) {}

  async onModuleInit() {
    setTimeout(async () => {
      try {
        await this.rabbitMQService.consumeOrderCompletedMessages(
          this.handleOrderCompleted.bind(this),
        );
      } catch (error) {
        this.logger.error('Failed to start order completed consumer:', error);
        setTimeout(() => this.onModuleInit(), 5000);
      }
    }, 2000);
  }

  private async handleOrderCompleted(data: {
    orderId: string;
    userId: string;
    tenantCode: string;
  }): Promise<void> {
    const { orderId, tenantCode } = data;
    const tenantPrisma = this.databaseManager.getClient(tenantCode);

    // 1) Update status to COMPLETE
    await tenantPrisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.COMPLETE },
    });

    // 2) Send success email (stub)
    await this.sendOrderCompletedEmail(orderId, tenantCode);
  }

  private async sendOrderCompletedEmail(orderId: string, tenantCode: string): Promise<void> {
    // TODO: integrate with email service
    this.logger.log(`Stub sendOrderCompletedEmail for order ${orderId} (tenant ${tenantCode})`);
  }
}


