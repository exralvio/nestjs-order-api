import { Role } from '@prisma/client';

export class UserResponseDto {
  id: string;
  email: string;
  username: string;
  role: Role;
  tenantCode?: string;
  isDatabaseCreated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

