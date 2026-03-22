import Dexie, { type Table } from "dexie";
import {
  getDexieCloudDatabaseUrl,
  getDexieCloudSyncScopes,
  isDexieCloudSyncEnabled,
} from "../cachePolicy";

type PersistentCacheEntry = {
  id: string;
  scope: string;
  key: string;
  expiresAt: number;
  payload: unknown;
  updatedAt: number;
};

class VturPersistentCacheDb extends Dexie {
  cache!: Table<PersistentCacheEntry, string>;

  constructor(
    databaseName: string,
    options?: {
      cloudAddon?: unknown;
      cloudDatabaseUrl?: string;
    }
  ) {
    const dexieOptions = options?.cloudAddon ? ({ addons: [options.cloudAddon] } as any) : undefined;
    super(databaseName, dexieOptions);
    this.version(1).stores({
      cache: "&id, scope, key, expiresAt, updatedAt",
    });

    if (options?.cloudAddon && options.cloudDatabaseUrl) {
      try {
        const cloudApi = (this as any).cloud;
        if (cloudApi?.configure) {
          cloudApi.configure({
            databaseUrl: options.cloudDatabaseUrl,
            requireAuth: false,
            tryUseServiceWorker: false,
          });
        }
      } catch (error) {
        console.warn("[PersistentCache] Nao foi possivel configurar Dexie Cloud.", error);
      }
    }
  }
}

const LOCAL_FALLBACK_PREFIX = "vtur_persistent_cache_v1:";
const LOCAL_DB_NAME = "vtur_persistent_cache_v1";
const CLOUD_DB_NAME = "vtur_persistent_cache_cloud_v1";

let localDbPromise: Promise<VturPersistentCacheDb | null> | null = null;
let cloudDbPromise: Promise<VturPersistentCacheDb | null> | null = null;

function canUseWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function buildEntryId(scope: string, key: string) {
  return `${scope}::${key}`;
}

function buildLocalStorageKey(scope: string, key: string) {
  return `${LOCAL_FALLBACK_PREFIX}${buildEntryId(scope, key)}`;
}

async function createDb(): Promise<VturPersistentCacheDb | null> {
  if (!canUseIndexedDb()) return null;
  return new VturPersistentCacheDb(LOCAL_DB_NAME);
}

function shouldUseCloudForScope(scope: string) {
  if (!isDexieCloudSyncEnabled()) return false;
  const syncScopes = getDexieCloudSyncScopes();
  if (syncScopes.includes("*")) return true;
  return syncScopes.includes(scope);
}

function tryCloudSync(db: VturPersistentCacheDb | null) {
  if (!db) return;
  try {
    const cloudApi = (db as any).cloud;
    if (cloudApi?.sync) {
      void cloudApi.sync();
    }
  } catch {
    // ignore sync trigger errors
  }
}

async function createCloudDb(): Promise<VturPersistentCacheDb | null> {
  if (!canUseIndexedDb()) return null;

  const cloudEnabled = isDexieCloudSyncEnabled();
  const cloudDatabaseUrl = getDexieCloudDatabaseUrl();
  if (!cloudEnabled || !cloudDatabaseUrl) {
    return null;
  }

  try {
    const cloudModule = await import("dexie-cloud-addon");
    const cloudAddon = (cloudModule as any)?.default || cloudModule;
    return new VturPersistentCacheDb(CLOUD_DB_NAME, { cloudAddon, cloudDatabaseUrl });
  } catch (error) {
    console.warn(
      "[PersistentCache] Dexie Cloud indisponivel. Mantendo cache local no navegador.",
      error
    );
    return null;
  }
}

async function getLocalDb() {
  if (!localDbPromise) {
    localDbPromise = createDb();
  }
  return localDbPromise;
}

async function getCloudDb() {
  if (!cloudDbPromise) {
    cloudDbPromise = createCloudDb();
  }
  return cloudDbPromise;
}

async function getPreferredDb(scope: string) {
  if (shouldUseCloudForScope(scope)) {
    const cloudDb = await getCloudDb();
    if (cloudDb) return cloudDb;
  }
  return getLocalDb();
}

function readFallbackEntry<T>(scope: string, key: string) {
  if (!canUseWindowStorage()) return null;
  const storageKey = buildLocalStorageKey(scope, key);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt: number; payload: T };
    if (!parsed || !Number.isFinite(parsed.expiresAt)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return parsed.payload ?? null;
  } catch {
    return null;
  }
}

function writeFallbackEntry<T>(scope: string, key: string, payload: T, ttlMs: number) {
  if (!canUseWindowStorage() || ttlMs <= 0) return;
  const storageKey = buildLocalStorageKey(scope, key);
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        expiresAt: Date.now() + ttlMs,
        payload,
      })
    );
  } catch {
    // ignore fallback write errors
  }
}

function removeFallbackEntry(scope: string, key: string) {
  if (!canUseWindowStorage()) return;
  try {
    window.localStorage.removeItem(buildLocalStorageKey(scope, key));
  } catch {
    // ignore fallback remove errors
  }
}

async function pruneExpiredEntries(db: VturPersistentCacheDb) {
  try {
    await db.cache.where("expiresAt").belowOrEqual(Date.now()).delete();
  } catch {
    // ignore prune errors
  }
}

async function readActiveEntry<T>(db: VturPersistentCacheDb, entryId: string): Promise<T | null> {
  try {
    const entry = await db.cache.get(entryId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      await db.cache.delete(entryId);
      return null;
    }
    return (entry.payload as T) ?? null;
  } catch {
    return null;
  }
}

export async function readPersistentCache<T>(scope: string, key: string): Promise<T | null> {
  const entryId = buildEntryId(scope, key);
  const preferredDb = await getPreferredDb(scope);
  if (!preferredDb) return readFallbackEntry<T>(scope, key);

  const cached = await readActiveEntry<T>(preferredDb, entryId);
  if (cached != null) return cached;

  // Migra rascunho legado salvo no DB local para o DB cloud (quando cloud estiver ativo para o escopo).
  if (shouldUseCloudForScope(scope)) {
    const cloudDb = await getCloudDb();
    const localDb = await getLocalDb();
    if (cloudDb && localDb && cloudDb !== localDb) {
      const legacy = await readActiveEntry<T>(localDb, entryId);
      if (legacy != null) {
        try {
          await cloudDb.cache.put({
            id: entryId,
            scope,
            key,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
            payload: legacy,
            updatedAt: Date.now(),
          });
          tryCloudSync(cloudDb);
        } catch {
          // ignore migration errors
        }
        return legacy;
      }
    }
  }

  return readFallbackEntry<T>(scope, key);
}

export async function writePersistentCache<T>(
  scope: string,
  key: string,
  payload: T,
  ttlMs: number
): Promise<void> {
  if (ttlMs <= 0) return;
  const db = await getPreferredDb(scope);
  const now = Date.now();
  const entryId = buildEntryId(scope, key);

  if (!db) {
    writeFallbackEntry(scope, key, payload, ttlMs);
    return;
  }

  try {
    await db.cache.put({
      id: entryId,
      scope,
      key,
      expiresAt: now + ttlMs,
      payload,
      updatedAt: now,
    });
    if (Math.random() < 0.03) {
      await pruneExpiredEntries(db);
    }
    tryCloudSync(db);
    removeFallbackEntry(scope, key);
  } catch {
    writeFallbackEntry(scope, key, payload, ttlMs);
  }
}

export async function removePersistentCache(scope: string, key: string): Promise<void> {
  const entryId = buildEntryId(scope, key);
  const preferredDb = await getPreferredDb(scope);
  const localDb = await getLocalDb();
  const cloudDb = await getCloudDb();
  const targets = [preferredDb, localDb, cloudDb].filter(Boolean) as VturPersistentCacheDb[];
  const uniqueTargets = Array.from(new Set(targets));
  for (const db of uniqueTargets) {
    try {
      await db.cache.delete(entryId);
      tryCloudSync(db);
    } catch {
      // ignore
    }
  }
  removeFallbackEntry(scope, key);
}

export async function clearPersistentCacheScope(scope: string): Promise<void> {
  const preferredDb = await getPreferredDb(scope);
  const localDb = await getLocalDb();
  const cloudDb = await getCloudDb();
  const targets = [preferredDb, localDb, cloudDb].filter(Boolean) as VturPersistentCacheDb[];
  const uniqueTargets = Array.from(new Set(targets));
  for (const db of uniqueTargets) {
    try {
      await db.cache.where("scope").equals(scope).delete();
      tryCloudSync(db);
    } catch {
      // ignore
    }
  }
  if (!canUseWindowStorage()) return;
  const prefix = `${LOCAL_FALLBACK_PREFIX}${scope}::`;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
}
