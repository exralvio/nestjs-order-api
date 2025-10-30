import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const TenantCode = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // Prefer path param (/:tenantCode/..), fallback to query if ever used
    const tenantCode = request.params?.tenantCode || request.query?.tenantCode;
    
    if (!tenantCode) {
      throw new BadRequestException('tenantCode path parameter is required');
    }
    
    return tenantCode;
  },
);
