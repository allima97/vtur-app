/**
 * Cloudflare Worker Environment Types
 * Defines types for KV namespace bindings and environment variables
 */

export interface Env {
  // KV Namespace for caching
  CACHE?: KVNamespace;
  SESSION: KVNamespace;

  // Environment variables
  ENVIRONMENT?: "production" | "staging" | "development";

  // Supabase (read from .env)
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/**
 * KV Cache wrapper interface
 */
export interface CacheEntry<T = unknown> {
  data: T;
  expiresAt?: number;
}

/**
 * KV operation options
 */
export interface CacheOptions {
  ttlSeconds?: number;
}
