import { Role } from '@prisma/client';

export class AuthResponseDto {
  access_token: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: Role;
  };
}

