/**
 * Phase C6 — In-Memory Rate Limiter for Discovery Routes
 *
 * Sliding-window counter implementation. No Redis required.
 * One bucket per (operationType × identifierKey). Buckets are automatically
 * pruned after 2× the window duration to prevent unbounded growth.
 *
 * Operation limits (per unique userId+clientId key):
 *   live_run    → 2  requests / 60 s
 *   dry_run     → 10 requests / 60 s
 *   cancel      → 5  requests / 60 s
 *   inspect     → 60 requests / 60 s
 *   health      → 30 requests / 60 s
 *
 * Governance decisions:
 *   - Rate limits are per-user (userId+clientId) to prevent cross-tenant interference.
 *   - Requests beyond the limit receive HTTP 429 with Retry-After header.
 *   - The limiter is NOT shared across process restarts — it is in-memory only.
 *   - For production multi-instance deployments, replace with Redis counters.
 *
 * No Math.random(). No credentials.
 */

// ── Operation types ────────────────────────────────────────────────────────────

export type RateLimitOperation = "live_run" | "dry_run" | "cancel" | "inspect" | "health";

// ── Policy ────────────────────────────────────────────────────────────────────

export interface RateLimitPolicy {
  /** Maximum requests allowed within windowMs. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs:    number;
}

/** Default policies per operation type. */
export const DEFAULT_RATE_LIMIT_POLICIES: Record<RateLimitOperation, RateLimitPolicy> = {
  live_run: { maxRequests: 2,  windowMs: 60_000 },
  dry_run:  { maxRequests: 10, windowMs: 60_000 },
  cancel:   { maxRequests: 5,  windowMs: 60_000 },
  inspect:  { maxRequests: 60, windowMs: 60_000 },
  health:   { maxRequests: 30, windowMs: 60_000 },
};

// ── Result ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:     boolean;
  remaining:   number;
  resetAtMs:   number;  // epoch ms when the window resets for this key
  /** Seconds until allowed, when denied. */
  retryAfterS: number;
}

// ── Bucket ────────────────────────────────────────────────────────────────────

interface Bucket {
  timestamps: number[];  // epoch ms of each request within the window
  lastPrune:  number;    // epoch ms of last prune
}

// ── DiscoveryRateLimiter ──────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter for discovery routes.
 *
 * Usage:
 *   const limiter = new DiscoveryRateLimiter();
 *   const result  = limiter.check("live_run", userId, clientId);
 *   if (!result.allowed) {
 *     res.setHeader("Retry-After", String(result.retryAfterS));
 *     res.status(429).json({ error: "rate_limit_exceeded", retryAfterS: result.retryAfterS });
 *     return;
 *   }
 */
export class DiscoveryRateLimiter {
  private readonly buckets    = new Map<string, Bucket>();
  private readonly policies:  Record<RateLimitOperation, RateLimitPolicy>;

  constructor(policies: Partial<Record<RateLimitOperation, RateLimitPolicy>> = {}) {
    this.policies = { ...DEFAULT_RATE_LIMIT_POLICIES, ...policies };
  }

  /**
   * Checks and records a request. Mutates the bucket (records the timestamp).
   * Call this once per request — it both checks AND consumes a slot.
   */
  check(
    operation: RateLimitOperation,
    userId:    string,
    clientId:  string,
    now:       number = Date.now(),
  ): RateLimitResult {
    const policy     = this.policies[operation];
    const key        = `${operation}::${userId}::${clientId}`;
    let   bucket     = this.buckets.get(key);

    if (!bucket) {
      bucket = { timestamps: [], lastPrune: now };
      this.buckets.set(key, bucket);
    }

    // Prune old timestamps outside the window
    const windowStart = now - policy.windowMs;
    bucket.timestamps = bucket.timestamps.filter(t => t > windowStart);

    const count     = bucket.timestamps.length;
    const resetAtMs = count > 0
      ? bucket.timestamps[0] + policy.windowMs
      : now + policy.windowMs;

    if (count >= policy.maxRequests) {
      const retryAfterS = Math.ceil((resetAtMs - now) / 1000);
      return {
        allowed:     false,
        remaining:   0,
        resetAtMs,
        retryAfterS: Math.max(1, retryAfterS),
      };
    }

    // Record this request
    bucket.timestamps.push(now);

    // Prune stale buckets periodically (every 2× window)
    if (now - bucket.lastPrune > policy.windowMs * 2) {
      this.pruneStaleBuckets(now);
      bucket.lastPrune = now;
    }

    return {
      allowed:     true,
      remaining:   policy.maxRequests - bucket.timestamps.length,
      resetAtMs:   bucket.timestamps[0] + policy.windowMs,
      retryAfterS: 0,
    };
  }

  /**
   * Inspects the current state of a bucket without recording a request.
   * Used for diagnostics and testing.
   */
  peek(
    operation: RateLimitOperation,
    userId:    string,
    clientId:  string,
    now:       number = Date.now(),
  ): { count: number; remaining: number; resetAtMs: number } {
    const policy      = this.policies[operation];
    const key         = `${operation}::${userId}::${clientId}`;
    const bucket      = this.buckets.get(key);
    const windowStart = now - policy.windowMs;
    const timestamps  = bucket
      ? bucket.timestamps.filter(t => t > windowStart)
      : [];
    const resetAtMs   = timestamps.length > 0
      ? timestamps[0] + policy.windowMs
      : now + policy.windowMs;
    return {
      count:     timestamps.length,
      remaining: Math.max(0, policy.maxRequests - timestamps.length),
      resetAtMs,
    };
  }

  /** Resets all buckets for a specific key. Useful for testing. */
  reset(operation: RateLimitOperation, userId: string, clientId: string): void {
    const key = `${operation}::${userId}::${clientId}`;
    this.buckets.delete(key);
  }

  /** Clears all buckets. Useful for testing. */
  resetAll(): void {
    this.buckets.clear();
  }

  private pruneStaleBuckets(now: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      // Determine the longest window for any policy
      const maxWindow = Math.max(...Object.values(this.policies).map(p => p.windowMs));
      if (now - (bucket.timestamps[bucket.timestamps.length - 1] ?? 0) > maxWindow * 2) {
        this.buckets.delete(key);
      }
    }
  }

  /** Returns count of active buckets (for monitoring). */
  get bucketCount(): number {
    return this.buckets.size;
  }
}

// ── Singleton for production use ──────────────────────────────────────────────

/** Shared rate limiter instance — one per process. */
export const discoveryRateLimiter = new DiscoveryRateLimiter();
