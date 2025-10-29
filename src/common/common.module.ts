import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiResponseInterceptor } from './interceptors/api-response.interceptor';
import { CacheModule } from './cache.module';

@Module({
  imports: [CacheModule],
  providers: [
    ApiResponseInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
  ],
  exports: [ApiResponseInterceptor, CacheModule],
})
export class CommonModule {}
