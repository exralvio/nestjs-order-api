import { SetMetadata } from '@nestjs/common';
import { ApiResponse } from '../interfaces/api-response.interface';

export interface ApiResponseOptions {
  message?: string;
  status?: 'success' | 'error';
}

export const ApiResponseWrapper = (options: ApiResponseOptions = {}) =>
  SetMetadata('apiResponse', options);
