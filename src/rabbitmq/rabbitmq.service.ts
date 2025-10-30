import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly queueName = 'database-creation';
  private readonly orderProcessingQueue = 'order-processing';
  private readonly orderCompletedQueue = 'order-completed';

  async onModuleInit() {
    try {
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
      this.logger.log(`Connecting to RabbitMQ at ${rabbitmqUrl}`);
      
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      
      // Ensure the queues exist
      await this.channel.assertQueue(this.queueName, {
        durable: true, // Queue survives broker restarts
      });
      await this.channel.assertQueue(this.orderProcessingQueue, {
        durable: true,
      });
      await this.channel.assertQueue(this.orderCompletedQueue, {
        durable: true,
      });
      
      this.logger.log('RabbitMQ connection established');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      // Don't throw error immediately, let the retry logic handle it
      this.logger.warn('RabbitMQ connection will be retried when needed');
    }
  }

  async onModuleDestroy() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('RabbitMQ connection closed');
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection:', error);
    }
  }

  async publishDatabaseCreationMessage(data: {
    userId: string;
    tenantCode: string;
  }): Promise<void> {
    try {
      // Wait for connection to be established
      await this.waitForConnection();
      
      const message = JSON.stringify(data);
      
      const sent = this.channel.sendToQueue(
        this.queueName,
        Buffer.from(message),
        {
          persistent: true, // Message survives broker restarts
        }
      );

      if (sent) {
        this.logger.log(`Database creation message published for user ${data.userId}, tenant ${data.tenantCode}`);
      } else {
        this.logger.warn(`Failed to publish message for user ${data.userId}`);
      }
    } catch (error) {
      this.logger.error('Failed to publish database creation message:', error);
      throw error;
    }
  }

  async consumeDatabaseCreationMessages(
    callback: (data: { userId: string; tenantCode: string }) => Promise<void>
  ): Promise<void> {
    try {
      // Wait for connection to be established
      await this.waitForConnection();
      
      await this.channel.consume(this.queueName, async (msg) => {
        if (msg) {
          try {
            const data = JSON.parse(msg.content.toString());
            this.logger.log(`Processing database creation for user ${data.userId}, tenant ${data.tenantCode}`);
            
            await callback(data);
            
            // Acknowledge the message
            this.channel.ack(msg);
            this.logger.log(`Database creation completed for user ${data.userId}`);
          } catch (error) {
            this.logger.error(`Error processing database creation message:`, error);
            // Reject the message and requeue it
            this.channel.nack(msg, false, true);
          }
        }
      });
      
      this.logger.log('Started consuming database creation messages');
    } catch (error) {
      this.logger.error('Failed to start consuming messages:', error);
      throw error;
    }
  }

  async publishOrderProcessingMessage(data: {
    orderId: string;
    userId: string;
    tenantCode: string;
  }): Promise<void> {
    try {
      await this.waitForConnection();
      await this.channel.assertQueue(this.orderProcessingQueue, { durable: true });

      const message = JSON.stringify(data);
      const sent = this.channel.sendToQueue(
        this.orderProcessingQueue,
        Buffer.from(message),
        { persistent: true }
      );

      if (sent) {
        this.logger.log(
          `Order processing message published for order ${data.orderId}, user ${data.userId}, tenant ${data.tenantCode}`,
        );
      } else {
        this.logger.warn(`Failed to publish order processing message for order ${data.orderId}`);
      }
    } catch (error) {
      this.logger.error('Failed to publish order processing message:', error);
      throw error;
    }
  }

  async consumeOrderProcessingMessages(
    callback: (data: { orderId: string; userId: string; tenantCode: string }) => Promise<void>
  ): Promise<void> {
    try {
      await this.waitForConnection();
      await this.channel.assertQueue(this.orderProcessingQueue, { durable: true });

      await this.channel.consume(this.orderProcessingQueue, async (msg) => {
        if (msg) {
          try {
            const data = JSON.parse(msg.content.toString());
            this.logger.log(
              `Processing order ${data.orderId} for user ${data.userId}, tenant ${data.tenantCode}`,
            );
            await callback(data);
            this.channel.ack(msg);
          } catch (error) {
            this.logger.error('Error processing order message:', error);
            this.channel.nack(msg, false, true);
          }
        }
      });

      this.logger.log('Started consuming order processing messages');
    } catch (error) {
      this.logger.error('Failed to start consuming order processing messages:', error);
      throw error;
    }
  }

  private async waitForConnection(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 1000; // 1 second

    for (let i = 0; i < maxRetries; i++) {
      if (this.channel) {
        return;
      }
      
      this.logger.log(`Waiting for RabbitMQ connection... (attempt ${i + 1}/${maxRetries})`);
      
      // Try to reconnect if connection is not established
      if (!this.connection) {
        try {
          await this.attemptConnection();
        } catch (error) {
          this.logger.warn(`Connection attempt ${i + 1} failed:`, error.message);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    throw new Error('Failed to establish RabbitMQ connection after maximum retries');
  }

  private async attemptConnection(): Promise<void> {
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
    this.connection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();
    
    // Ensure the queues exist
    await this.channel.assertQueue(this.queueName, {
      durable: true,
    });
    await this.channel.assertQueue(this.orderProcessingQueue, {
      durable: true,
    });
    await this.channel.assertQueue(this.orderCompletedQueue, {
      durable: true,
    });
    
    this.logger.log('RabbitMQ connection established');
  }

  async publishOrderCompletedMessage(data: {
    orderId: string;
    userId: string;
    tenantCode: string;
    transactionId: string;
  }): Promise<void> {
    try {
      await this.waitForConnection();
      await this.channel.assertQueue(this.orderCompletedQueue, { durable: true });

      const message = JSON.stringify(data);
      const sent = this.channel.sendToQueue(
        this.orderCompletedQueue,
        Buffer.from(message),
        { persistent: true }
      );

      if (sent) {
        this.logger.log(
          `Order completed message published for order ${data.orderId}, user ${data.userId}, tenant ${data.tenantCode}`,
        );
      } else {
        this.logger.warn(`Failed to publish order completed message for order ${data.orderId}`);
      }
    } catch (error) {
      this.logger.error('Failed to publish order completed message:', error);
      throw error;
    }
  }

  async consumeOrderCompletedMessages(
    callback: (data: { orderId: string; userId: string; tenantCode: string; transactionId: string }) => Promise<void>
  ): Promise<void> {
    try {
      await this.waitForConnection();
      await this.channel.assertQueue(this.orderCompletedQueue, { durable: true });

      await this.channel.consume(this.orderCompletedQueue, async (msg) => {
        if (msg) {
          try {
            const data = JSON.parse(msg.content.toString());
            this.logger.log(
              `Processing order completion ${data.orderId} for user ${data.userId}, tenant ${data.tenantCode}`,
            );
            await callback(data);
            this.channel.ack(msg);
          } catch (error) {
            this.logger.error('Error processing order completed message:', error);
            this.channel.nack(msg, false, true);
          }
        }
      });

      this.logger.log('Started consuming order completed messages');
    } catch (error) {
      this.logger.error('Failed to start consuming order completed messages:', error);
      throw error;
    }
  }
}
