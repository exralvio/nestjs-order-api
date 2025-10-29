import { NestFactory } from '@nestjs/core';
import { ConsumerModule } from '../rabbitmq/consumer.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(ConsumerModule);
  
  console.log('Database creation consumer started...');
  
  // Keep the application running
  process.on('SIGINT', async () => {
    console.log('Shutting down consumer...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start consumer:', error);
  process.exit(1);
});
