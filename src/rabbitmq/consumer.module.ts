import { Module } from '@nestjs/common';
import { DatabaseCreationConsumer } from './database-creation.consumer';
import { OrderProcessingConsumer } from './order-processing.consumer';
import { OrderCompletedConsumer } from './order-completed.consumer';
import { RabbitMQModule } from './rabbitmq.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RabbitMQModule, PrismaModule],
  providers: [DatabaseCreationConsumer, OrderProcessingConsumer, OrderCompletedConsumer],
})
export class ConsumerModule {}
