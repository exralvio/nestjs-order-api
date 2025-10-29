import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ProductModule } from './product/product.module';
import { OrderModule } from './order/order.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [PrismaModule, UserModule, AuthModule, ProductModule, OrderModule, CommonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
