import type { Request, Response, NextFunction } from 'express';

/**
 * Phase 2 security fix — brute-force protection.
 *
 * `/auth/login`, `/auth/register` and `/auth/refresh` had no rate limiting at
 * all, so credential stuffing was unlimited. This is a dependency-free
 * sliding-window limiter held in memory, which matches the deployment shape
 * of this API (a single Node process alongside a local SQLite file). If the
 * API is ever run multi-instance, this needs to move to a shared store — see
 * the note in AUDIT.md about the in-process engines, which have the same
 * constraint.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per key inside the window. */
  max: number;
  /** Namespace so different endpoints don't share buckets. */
  name: string;
  /**
   * Extra key material beyond the client IP — e.g. the submitted email, so
   * one attacker cannot lock out every account from a single address, and one
   * account cannot be hammered from a rotating IP pool.
   */
  keyFrom?: (req: Request) => string | undefined;
}

function clientIp(req: Request): string {
  // `trust proxy` is enabled in index.ts, so req.ip already honours
  // X-Forwarded-For when running behind a reverse proxy.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, name, keyFrom } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const extra = keyFrom?.(req);
    const key = `${name}|${clientIp(req)}|${extra ?? ''}`;
    const now = Date.now();

    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

    if (bucket.hits.length >= max) {
      const retryAfterMs = windowMs - (now - bucket.hits[0]!);
      const retryAfter = Math.ceil(retryAfterMs / 1000);
      buckets.set(key, bucket);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: {
          code: 'AUTH_001',
          message: `Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
        },
      });
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);
    next();
  };
}

/** Drop empty buckets so the map can't grow without bound. */
export function sweepRateLimitBuckets(maxWindowMs = 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => now - t > maxWindowMs)) buckets.delete(key);
  }
}

function lowercasedBodyField(field: string) {
  return (req: Request): string | undefined => {
    const value = (req.body as Record<string, unknown> | undefined)?.[field];
    return typeof value === 'string' ? value.trim().toLowerCase() : undefined;
  };
}

/** 10 attempts per 15 minutes per (IP, email). */
export const loginRateLimit = rateLimit({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFrom: lowercasedBodyField('email'),
});

/** 5 new accounts per hour per IP. */
export const registerRateLimit = rateLimit({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  max: 5,
});

/** Generous, because a legitimate client refreshes on a schedule. */
export const refreshRateLimit = rateLimit({
  name: 'refresh',
  windowMs: 5 * 60 * 1000,
  max: 30,
});
