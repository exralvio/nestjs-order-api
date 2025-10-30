import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    
    // Global route prefix
    app.setGlobalPrefix('api');
    
    // Enable validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Enable global logging interceptor
    app.useGlobalInterceptors(new LoggingInterceptor());

    // Swagger configuration
    const config = new DocumentBuilder()
      .setTitle('Provenant API')
      .setDescription('API documentation for Provenant application')
      .setVersion('1.0')
      .addBearerAuth() // If you're using JWT authentication
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    // Serve Swagger under /api/docs to avoid conflicting with global prefix
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}/api`);
    console.log(`Swagger documentation: http://localhost:${port}/api/docs`);
  } catch (error) {
    console.error('Error starting the application:', error);
    process.exit(1);
  }
}
bootstrap();
