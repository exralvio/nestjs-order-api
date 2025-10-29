import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../../prisma/tenant-context.service';
import { Role } from '@prisma/client';

/**
 * Interceptor to set tenant context from authenticated user
 * For ADMIN users, sets the tenant code to access their tenant-specific database
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Priority 1: Set tenant code from query parameter (for explicit tenant access)
    const queryTenantCode = request.query?.tenantCode;
    if (queryTenantCode) {
      this.tenantContext.setTenantCode(queryTenantCode);
    }
    // Priority 2: Set tenant code from user if user is ADMIN (fallback)
    else if (user && user.role === Role.ADMIN && user.tenantCode) {
      this.tenantContext.setTenantCode(user.tenantCode);
    }

    return next.handle();
  }
}

