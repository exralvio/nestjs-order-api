import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private tenantCode: string | null = null;

  setTenantCode(tenantCode: string | null): void {
    this.tenantCode = tenantCode;
  }

  getTenantCode(): string | null {
    return this.tenantCode;
  }

  hasTenant(): boolean {
    return this.tenantCode !== null;
  }
}

