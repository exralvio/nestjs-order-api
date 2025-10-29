import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiResponseInterceptor } from './interceptors/api-response.interceptor';

@Module({
  providers: [
    ApiResponseInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
  ],
  exports: [ApiResponseInterceptor],
})
export class CommonModule {}
