import { Role } from '@prisma/client';

export class UserResponseDto {
  id: string;
  email: string;
  username: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

