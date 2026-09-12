/**
 * Simple in-memory rate limiter for Next.js Server Actions and Middleware.
 * 
 * NOTE: For production at scale, use Upstash Redis or a similar persistent 
 * store to stay synchronized across serverless functions.
 */

type RateLimitRecord = {
  count: number;
  lastRequest: number;
};

const storage = new Map<string, RateLimitRecord>();

/**
 * Rate limit a specific key (e.g., IP address or User ID).
 * 
 * @param key Unique identifier for the requester
 * @param limit Max requests allowed in the window
 * @param windowMs Time window in milliseconds
 * @returns Object indicating success and remaining attempts
 */
export async function rateLimit(
  key: string,
  limit: number = 10,
  windowMs: number = 60000
) {
  const now = Date.now();
  const record = storage.get(key) || { count: 0, lastRequest: now };

  // Reset count if window has passed
  if (now - record.lastRequest > windowMs) {
    record.count = 1;
    record.lastRequest = now;
  } else {
    record.count += 1;
  }

  storage.set(key, record);

  const isLimited = record.count > limit;

  return {
    success: !isLimited,
    count: record.count,
    remaining: Math.max(0, limit - record.count),
    reset: record.lastRequest + windowMs
  };
}

/**
 * Helper to get the client IP from request headers.
 */
export function getIP(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return '127.0.0.1'; // Fallback
}
