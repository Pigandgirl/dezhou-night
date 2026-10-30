'use strict';

/**
 * Tiny in-memory fixed-window rate limiter.
 * key -> { count, resetAt }
 */

const buckets = new Map();

function take(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, remaining: limit - bucket.count };
}

function reset(key) {
  buckets.delete(key);
}

function clientIp(req) {
  const remote = req.socket?.remoteAddress || 'unknown';
  if (process.env.TRUST_PROXY === '1') {
    const isLocalProxy = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    const forwarded = req.headers['x-forwarded-for'];
    if (isLocalProxy && forwarded) return String(forwarded).split(',')[0].trim();
  }
  return remote;
}

// Keep the map from growing without bound on hostile traffic.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60000);
if (sweeper.unref) sweeper.unref();

module.exports = { take, reset, clientIp };
