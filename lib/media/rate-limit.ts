interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const tracker = new Map<string, RateLimitRecord>();

/**
 * Basic in-memory rate limiter per IP address
 * Max requests allowed per windowMs interval.
 */
export function checkRateLimit(
  clientIp: string,
  limit = 20,
  windowMs = 60 * 1000
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = tracker.get(clientIp);

  if (!record || now > record.resetTime) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetTime: now + windowMs,
    };
    tracker.set(clientIp, newRecord);
    return { allowed: true, remaining: limit - 1, resetTime: newRecord.resetTime };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count += 1;
  tracker.set(clientIp, record);
  return { allowed: true, remaining: limit - record.count, resetTime: record.resetTime };
}
