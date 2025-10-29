import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    const { method, url, ip, body, query, params } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    // Get user info if available
    const user = request.user;
    const userId = user?.id || 'anonymous';
    const username = user?.username || 'anonymous';
    const tenantCode = user?.tenantCode || null;
    const userRole = user?.role || null;

    // Build request details (exclude sensitive data from body)
    const requestDetails = this.buildRequestDetails(body, query, params);

    // Log incoming request
    this.logger.log(
      `[${timestamp}] ${method} ${url} | IP: ${ip}${userAgent ? ` | UA: ${userAgent.substring(0, 50)}` : ''} | User: ${username}${userRole ? ` (${userRole})` : ''}${tenantCode ? ` | Tenant: ${tenantCode}` : ''}${requestDetails ? ` | ${requestDetails}` : ''}`
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - startTime;
          const { statusCode } = response;
          const responseTimestamp = new Date().toISOString();
          
          // Log successful response
          this.logger.log(
            `[${responseTimestamp}] ${method} ${url} ${statusCode} | ${responseTime}ms | User: ${username}`
          );
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          const statusCode = error?.status || error?.statusCode || 500;
          const errorMessage = error?.message || 'Unknown error';
          const errorTimestamp = new Date().toISOString();
          
          // Log error response
          this.logger.error(
            `[${errorTimestamp}] ${method} ${url} ${statusCode} | ${responseTime}ms | User: ${username} | Error: ${errorMessage}`,
            error?.stack || '',
          );
        },
      }),
    );
  }

  /**
   * Build request details string, excluding sensitive information
   */
  private buildRequestDetails(body?: any, query?: any, params?: any): string {
    const details: string[] = [];

    // Add query params if any
    if (query && Object.keys(query).length > 0) {
      const safeQuery = { ...query };
      if (safeQuery.password) delete safeQuery.password;
      if (Object.keys(safeQuery).length > 0) {
        details.push(`Query: ${JSON.stringify(safeQuery)}`);
      }
    }

    // Add body params if any (excluding sensitive fields)
    if (body && Object.keys(body).length > 0) {
      const safeBody = { ...body };
      if (safeBody.password) safeBody.password = '[REDACTED]';
      if (safeBody.token) safeBody.token = '[REDACTED]';
      if (Object.keys(safeBody).length > 0) {
        details.push(`Body: ${JSON.stringify(safeBody)}`);
      }
    }

    // Add route params if any
    if (params && Object.keys(params).length > 0) {
      details.push(`Params: ${JSON.stringify(params)}`);
    }

    return details.join(' | ');
  }
}
