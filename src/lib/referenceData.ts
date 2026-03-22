import { buildQueryLiteKey, queryLite } from "./queryLite";
import { isPersistentCacheEnabled } from "./cachePolicy";
import {
  readPersistentCache,
  removePersistentCache,
  writePersistentCache,
} from "./offline/persistentCache";

type ReferencePayload = {
  paises?: Array<{ id: string; nome: string }>;
  subdivisoes?: Array<{
    id: string;
    nome: string;
    pais_id: string;
    codigo_admin1?: string | null;
    tipo?: string | null;
    created_at?: string | null;
  }>;
  cidades?: Array<{
    id: string;
    nome: string;
    subdivisao_id?: string | null;
  }>;
};

const LOCAL_TTL_MS = 12 * 60 * 60 * 1000;

function normalizeInclude(include?: string[]) {
  const list = (include || ["paises", "subdivisoes", "cidades"]).filter(Boolean);
  return Array.from(new Set(list.map((i) => String(i).trim()).filter(Boolean))).sort();
}

export async function fetchReferenceData(options?: {
  include?: string[];
  noCache?: boolean;
}): Promise<ReferencePayload> {
  const forceNoCache = options?.noCache || !isPersistentCacheEnabled();
  const include = normalizeInclude(options?.include);
  const includeKey = include.join(",");
  const cacheScope = "reference-data";
  const storageKey = `sgtur_ref_data_v3:${includeKey}`;

  if (!forceNoCache) {
    const cached = await readPersistentCache<ReferencePayload>(cacheScope, storageKey);
    if (cached) return cached;
  } else {
    await removePersistentCache(cacheScope, storageKey);
  }

  const key = buildQueryLiteKey(["referenceData", includeKey, forceNoCache ? "no-cache" : "cache"]);

  return queryLite(
    key,
    async () => {
      const qs = new URLSearchParams();
      qs.set("include", includeKey);
      if (forceNoCache) qs.set("no_cache", "1");
      const resp = await fetch(`/api/v1/reference-data?${qs.toString()}`);
      if (!resp.ok) throw new Error(await resp.text());
      const payload = (await resp.json()) as ReferencePayload;
      if (!forceNoCache) {
        await writePersistentCache(cacheScope, storageKey, payload, LOCAL_TTL_MS);
      }
      return payload;
    },
    { ttlMs: 5 * 60 * 1000 }
  );
}
