import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';
import { ApiResponseOptions } from '../decorators/api-response.decorator';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.reflector.get<ApiResponseOptions>(
      'apiResponse',
      context.getHandler(),
    );

    return next.handle().pipe(
      map((data) => {
        const response: ApiResponse = {
          status: options?.status || 'success',
          data: data,
          message: options?.message || this.getDefaultMessage(context),
          timestamp: new Date().toISOString(),
        };

        return response;
      }),
    );
  }

  private getDefaultMessage(context: ExecutionContext): string {
    const method = context.getHandler().name;
    const httpMethod = context.switchToHttp().getRequest().method;
    
    const methodMessages: Record<string, string> = {
      'create': 'Resource created successfully',
      'findAll': 'Resources retrieved successfully',
      'findOne': 'Resource retrieved successfully',
      'update': 'Resource updated successfully',
      'remove': 'Resource deleted successfully',
      'login': 'Login successful',
      'register': 'Registration successful',
      'checkout': 'Order checkout successful',
      'complete': 'Order completed successfully',
      'addItem': 'Item added to order successfully',
      'paymentReceived': 'Payment marked as received',
    };

    return methodMessages[method] || `${httpMethod} operation completed successfully`;
  }
}
