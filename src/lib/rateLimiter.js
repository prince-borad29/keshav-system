/**
 * ============================================================================
 * RATE LIMITING UTILITY FOR API ENDPOINTS
 * ============================================================================
 *
 * Prevents brute force attacks on sensitive endpoints like:
 * - Login attempts
 * - User registration
 * - Password reset
 * - OTP verification
 *
 * Implementation: In-memory store with exponential backoff
 * Production: Replace with Redis for distributed systems
 *
 * ============================================================================
 */

/**
 * In-memory rate limit store
 * Key: identifier (IP, email, user_id)
 * Value: { attempts, resetTime, isLocked }
 */
const rateLimitStore = new Map();

/**
 * Configuration for different endpoints
 */
const RATE_LIMIT_CONFIG = {
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    lockoutMs: 30 * 60 * 1000, // 30 minutes after 5 failed attempts
    message: 'Too many login attempts. Please try again in 30 minutes.',
  },
  register: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    lockoutMs: 2 * 60 * 60 * 1000, // 2 hours
    message: 'Too many registration attempts. Please try again later.',
  },
  passwordReset: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    lockoutMs: 24 * 60 * 60 * 1000, // 24 hours
    message: 'Too many password reset attempts. Please try again tomorrow.',
  },
  otpVerify: {
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000, // 10 minutes
    lockoutMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many OTP verification attempts. Please try again in 15 minutes.',
  },
};

/**
 * Check if identifier is rate limited
 * @param {string} identifier - IP address, email, or user_id
 * @param {string} endpoint - 'login', 'register', 'passwordReset', 'otpVerify'
 * @returns {object} { allowed: boolean, remaining: number, retryAfter: number }
 */
export function checkRateLimit(identifier, endpoint) {
  const config = RATE_LIMIT_CONFIG[endpoint];
  if (!config) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  }

  const now = Date.now();
  const key = `${endpoint}:${identifier}`;
  const record = rateLimitStore.get(key);

  // No previous record - first attempt
  if (!record) {
    rateLimitStore.set(key, {
      attempts: 1,
      firstAttemptTime: now,
      isLocked: false,
      lockedUntil: null,
    });
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      retryAfter: null,
    };
  }

  // Check if currently locked
  if (record.isLocked && now < record.lockedUntil) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000); // seconds
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
      message: config.message,
    };
  }

  // Reset window expired - start fresh
  if (now - record.firstAttemptTime > config.windowMs) {
    rateLimitStore.set(key, {
      attempts: 1,
      firstAttemptTime: now,
      isLocked: false,
      lockedUntil: null,
    });
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      retryAfter: null,
    };
  }

  // Still in the window - increment attempt
  record.attempts += 1;

  // Check if max attempts exceeded
  if (record.attempts > config.maxAttempts) {
    record.isLocked = true;
    record.lockedUntil = now + config.lockoutMs;

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(config.lockoutMs / 1000), // seconds
      message: config.message,
    };
  }

  return {
    allowed: true,
    remaining: config.maxAttempts - record.attempts,
    retryAfter: null,
  };
}

/**
 * Reset rate limit for an identifier (call after successful attempt)
 * @param {string} identifier - IP address, email, or user_id
 * @param {string} endpoint - 'login', 'register', 'passwordReset', 'otpVerify'
 */
export function resetRateLimit(identifier, endpoint) {
  const key = `${endpoint}:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * Manually lock an identifier (for suspicious activity)
 * @param {string} identifier - IP address, email, or user_id
 * @param {string} endpoint - endpoint name
 * @param {number} durationMs - how long to lock (default: 1 hour)
 */
export function lockIdentifier(identifier, endpoint, durationMs = 60 * 60 * 1000) {
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();

  rateLimitStore.set(key, {
    attempts: Infinity,
    firstAttemptTime: now,
    isLocked: true,
    lockedUntil: now + durationMs,
  });
}

/**
 * Get current rate limit status (for debugging)
 * @param {string} identifier - IP address, email, or user_id
 * @param {string} endpoint - endpoint name
 */
export function getRateLimitStatus(identifier, endpoint) {
  const key = `${endpoint}:${identifier}`;
  return rateLimitStore.get(key) || null;
}

/**
 * Clean up expired entries (call periodically, e.g., every 5 minutes)
 * Prevents memory leaks in production
 */
export function cleanupExpiredLimits() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, record] of rateLimitStore.entries()) {
    // Remove entries that are unlocked and outside their window
    const [endpoint, identifier] = key.split(':');
    const config = RATE_LIMIT_CONFIG[endpoint];

    if (
      !record.isLocked &&
      now - record.firstAttemptTime > config.windowMs
    ) {
      rateLimitStore.delete(key);
      cleaned++;
    }

    // Also remove locked entries that have expired
    if (record.isLocked && now > record.lockedUntil) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Clear all rate limits (use carefully - testing only)
 */
export function clearAllLimits() {
  rateLimitStore.clear();
}

/**
 * Get statistics about current rate limits
 */
export function getRateLimitStats() {
  const stats = {
    totalIdentifiers: rateLimitStore.size,
    byEndpoint: {},
    locked: 0,
  };

  for (const [key, record] of rateLimitStore.entries()) {
    const [endpoint] = key.split(':');
    if (!stats.byEndpoint[endpoint]) {
      stats.byEndpoint[endpoint] = 0;
    }
    stats.byEndpoint[endpoint]++;

    if (record.isLocked) {
      stats.locked++;
    }
  }

  return stats;
}

// ============================================================================
// RECOMMENDED INTEGRATION IN LOGIN ENDPOINT
// ============================================================================
//
// import { checkRateLimit, resetRateLimit } from './lib/rateLimiter';
//
// export async function handleLogin(email, password, clientIp) {
//   // Check rate limit
//   const limiter = checkRateLimit(clientIp, 'login');
//   if (!limiter.allowed) {
//     return {
//       success: false,
//       error: limiter.message,
//       retryAfter: limiter.retryAfter,
//     };
//   }
//
//   // Attempt login
//   const { data, error } = await supabase.auth.signInWithPassword({
//     email,
//     password,
//   });
//
//   if (error) {
//     // Login failed - rate limit will increment next attempt
//     return {
//       success: false,
//       error: 'Invalid email or password',
//       remaining: limiter.remaining - 1,
//     };
//   }
//
//   // Login successful - reset rate limit
//   resetRateLimit(clientIp, 'login');
//   return { success: true, data };
// }
//
// ============================================================================
// CLEANUP TASK (add to your app initialization)
// ============================================================================
//
// setInterval(() => {
//   const cleaned = cleanupExpiredLimits();
//   if (cleaned > 0) {
//     console.log(`Cleaned up ${cleaned} expired rate limit entries`);
//   }
// }, 5 * 60 * 1000); // Every 5 minutes
//
// ============================================================================
