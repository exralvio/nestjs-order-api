import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const TenantCode = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const tenantCode = request.query?.tenantCode;
    
    if (!tenantCode) {
      throw new BadRequestException('tenantCode query parameter is required');
    }
    
    return tenantCode;
  },
);
