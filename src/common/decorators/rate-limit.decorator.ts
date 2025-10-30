import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  /** Time window in milliseconds (default: 60_000) */
  windowMs?: number;
  /** Max number of requests allowed in the window (default: 60) */
  max?: number;
  /** Use authenticated user id for keying when available (default: true, fallback to IP) */
  keyByUser?: boolean;
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);


