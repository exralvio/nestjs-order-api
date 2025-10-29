import { Module } from '@nestjs/common';
import { DatabaseCreationConsumer } from './database-creation.consumer';
import { RabbitMQModule } from './rabbitmq.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RabbitMQModule, PrismaModule],
  providers: [DatabaseCreationConsumer],
})
export class ConsumerModule {}
