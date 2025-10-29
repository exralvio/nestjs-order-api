import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Default PrismaService for accessing the main database (users)
 * This is separate from tenant-specific databases
 */
@Injectable()
export class DefaultPrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

