/**
 * Cloudflare KV Cache Layer
 * Provides a wrapper around KV namespace with fallback to in-memory cache
 * Gracefully handles KV failures without breaking the application
 */

import type { Env } from "../types/env";

interface CacheEntry<T> {
  data: T;
  expiresAt?: number;
}

// Fallback in-memory cache for when KV is unavailable
const memoryCache = new Map<string, CacheEntry<any>>();
const MEMORY_CACHE_MAX = 100; // Limit to prevent memory bloat

/**
 * Get KV namespace from environment
 */
function getKVNamespace(env?: Env): KVNamespace | null {
  if (!env || !env.CACHE) {
    console.warn("[kvCache] KV namespace not available, using memory cache");
    return null;
  }
  return env.CACHE;
}

/**
 * Check if entry has expired
 */
function isExpired(entry: CacheEntry<any>): boolean {
  if (!entry.expiresAt) return false;
  return Date.now() > entry.expiresAt;
}

/**
 * Create cache key with optional prefix
 */
function createKey(key: string, prefix = "sgtur"): string {
  return `${prefix}:${key}`;
}

/**
 * Main KV Cache module
 */
export const kvCache = {
  /**
   * Get a value from KV or memory cache
   */
  async get<T>(key: string, env?: Env): Promise<T | null> {
    try {
      const fullKey = createKey(key);
      const kv = getKVNamespace(env);

      if (kv) {
        try {
          const value = await kv.get(fullKey, "json");
          if (!value) return null;

          const entry: CacheEntry<T> = value as CacheEntry<T>;

          // Check if expired
          if (isExpired(entry)) {
            // Delete expired entry asynchronously (don't await)
            kv.delete(fullKey).catch((err) => {
              console.error(`[kvCache] Failed to delete expired key: ${err}`);
            });
            return null;
          }

          return entry.data;
        } catch (err) {
          console.error(`[kvCache] KV get failed, using memory cache: ${err}`);
          // Fall through to memory cache
        }
      }

      // Fallback to memory cache
      const memEntry = memoryCache.get(fullKey);
      if (!memEntry) return null;

      if (isExpired(memEntry)) {
        memoryCache.delete(fullKey);
        return null;
      }

      return memEntry.data;
    } catch (err) {
      console.error(`[kvCache] Unexpected error in get: ${err}`);
      return null;
    }
  },

  /**
   * Set a value in KV and memory cache
   */
  async set<T>(key: string, value: T, ttlSeconds = 3600, env?: Env): Promise<void> {
    try {
      const fullKey = createKey(key);
      const expiresAt = Date.now() + ttlSeconds * 1000;
      const entry: CacheEntry<T> = { data: value, expiresAt };

      const kv = getKVNamespace(env);

      if (kv) {
        try {
          await kv.put(fullKey, JSON.stringify(entry), {
            expirationTtl: ttlSeconds,
          });
        } catch (err) {
          console.error(`[kvCache] KV put failed, using memory cache: ${err}`);
          // Fall through to memory cache
        }
      }

      // Also store in memory cache
      if (memoryCache.size >= MEMORY_CACHE_MAX) {
        // Remove oldest entry to prevent bloat
        const firstKey = memoryCache.keys().next().value;
        if (firstKey) {
          memoryCache.delete(firstKey);
        }
      }
      memoryCache.set(fullKey, entry);
    } catch (err) {
      console.error(`[kvCache] Unexpected error in set: ${err}`);
      // Silent failure - don't throw
    }
  },

  /**
   * Delete a value from KV and memory cache
   */
  async delete(key: string, env?: Env): Promise<void> {
    try {
      const fullKey = createKey(key);
      const kv = getKVNamespace(env);

      if (kv) {
        try {
          await kv.delete(fullKey);
        } catch (err) {
          console.error(`[kvCache] KV delete failed: ${err}`);
        }
      }

      memoryCache.delete(fullKey);
    } catch (err) {
      console.error(`[kvCache] Unexpected error in delete: ${err}`);
    }
  },

  /**
   * Check if a key exists
   */
  async has(key: string, env?: Env): Promise<boolean> {
    const value = await kvCache.get(key, env);
    return value !== null;
  },

  /**
   * Get or fetch a value
   * If not in cache, call fetcher and store result
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds = 3600,
    env?: Env
  ): Promise<T> {
    // Try to get from cache first
    const cached = await kvCache.get<T>(key, env);
    if (cached !== null) {
      return cached;
    }

    // Not in cache, fetch fresh data
    const data = await fetcher();

    // Store in cache
    await kvCache.set(key, data, ttlSeconds, env);

    return data;
  },

  /**
   * Clear all in-memory cache
   * Note: KV namespace must be cleared manually from Cloudflare dashboard
   */
  clearMemory(): void {
    memoryCache.clear();
    console.log("[kvCache] Memory cache cleared");
  },

  /**
   * Get cache statistics (for debugging)
   */
  getStats(): { memorySize: number; maxMemory: number } {
    return {
      memorySize: memoryCache.size,
      maxMemory: MEMORY_CACHE_MAX,
    };
  },
};

/**
 * Legacy export for backward compatibility
 */
export default kvCache;
