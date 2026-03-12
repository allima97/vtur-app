type CidadeBuscaRow = {
  id: string;
  nome: string;
  subdivisao_nome?: string | null;
  pais_nome?: string | null;
};

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "para",
  "com",
  "sem",
  "por",
  "no",
  "na",
  "nos",
  "nas",
  "roteiro",
  "destino",
  "destinos",
  "pacote",
  "fretamento",
]);

function normalizeLookup(value?: string | null) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCandidateTerm(value?: string | null) {
  if (!value) return "";
  let term = String(value).replace(/\s+/g, " ").trim();
  if (!term) return "";
  term = term.replace(/\s*[-–—]\s*\d+\s*(?:dia|dias|noite|noites)\b.*$/i, "");
  term = term.replace(/\((?:[^)]{0,32})\)\s*$/, "");
  term = term.replace(/\b[a-z]{2}\s*\/\s*[a-z]{2}\b$/i, "");
  term = term.replace(/\s*\/\s*[a-z]{2}$/i, "");
  term = term.replace(/\s*-\s*[a-z]{2}$/i, "");
  return term.trim();
}

function tokenize(value: string) {
  return normalizeLookup(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function buildCidadeSearchTerms(query: string) {
  const raw = sanitizeCandidateTerm(query);
  if (!raw) return [];

  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (candidate?: string | null) => {
    const sanitized = sanitizeCandidateTerm(candidate);
    const norm = normalizeLookup(sanitized);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    terms.push(sanitized);
  };

  add(raw);

  raw
    .split(/\s*(?:\/|,|;|\||→|->)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => add(part));

  raw
    .split(/\s[-–—]\s/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => add(part));

  const keywords = tokenize(raw).filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  keywords
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .forEach((token) => add(token));

  return terms.slice(0, 6);
}

function scoreCidade(row: CidadeBuscaRow, query: string) {
  const nome = normalizeLookup(row?.nome || "");
  if (!nome) return -1_000_000;

  const full = normalizeLookup(query);
  const tokens = tokenize(query);
  const detail = normalizeLookup(
    [row?.subdivisao_nome || "", row?.pais_nome || ""].filter(Boolean).join(" ")
  );
  const target = detail ? `${nome} ${detail}` : nome;

  let score = 0;
  if (full && nome === full) score += 1_000;
  if (full && nome.startsWith(full)) score += 700;
  if (full && nome.includes(full)) score += 420;

  let tokenMatches = 0;
  tokens.forEach((token) => {
    if (nome === token) score += 350;
    if (nome.startsWith(token)) score += 120;
    if (target.includes(token)) {
      tokenMatches += 1;
      score += 70;
    }
  });

  if (tokens.length > 1 && tokenMatches === tokens.length) score += 260;
  if (tokens.length > 0 && tokenMatches === 0) score -= 200;

  score -= Math.min(nome.length, 120) * 0.01;
  return score;
}

function sortRanked(rows: CidadeBuscaRow[], query: string) {
  return [...rows].sort((a, b) => {
    const scoreB = scoreCidade(b, query);
    const scoreA = scoreCidade(a, query);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR");
  });
}

async function fetchFromRpc(client: any, term: string, limit: number) {
  const { data, error } = await client.rpc("buscar_cidades", { q: term, limite: limit });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as CidadeBuscaRow[];
}

async function fetchFromTable(client: any, term: string, limit: number) {
  let query = client
    .from("cidades")
    .select("id, nome")
    .order("nome")
    .limit(limit);
  if (term) {
    query = query.ilike("nome", `%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []) as Array<{ id: string; nome: string }>;
  return rows
    .map((row) => ({
      id: row.id,
      nome: row.nome,
      subdivisao_nome: null,
      pais_nome: null,
    }))
    .filter((row) => row.id && row.nome);
}

function mergeRows(target: Map<string, CidadeBuscaRow>, rows: CidadeBuscaRow[]) {
  rows.forEach((row) => {
    const id = String(row?.id || "").trim();
    const nome = String(row?.nome || "").trim();
    if (!id || !nome) return;
    if (!target.has(id)) {
      target.set(id, {
        id,
        nome,
        subdivisao_nome: row.subdivisao_nome || null,
        pais_nome: row.pais_nome || null,
      });
      return;
    }
    const existing = target.get(id)!;
    target.set(id, {
      ...existing,
      subdivisao_nome: existing.subdivisao_nome || row.subdivisao_nome || null,
      pais_nome: existing.pais_nome || row.pais_nome || null,
    });
  });
}

export async function searchCidades(client: any, params: { query: string; limit: number; allowEmpty?: boolean }) {
  const query = String(params.query || "").trim();
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(params.limit) || 10)));

  if (!query) {
    if (!params.allowEmpty) return [];
    return fetchFromTable(client, "", limit);
  }

  if (query.length < 2) return [];

  const terms = buildCidadeSearchTerms(query);
  if (!terms.length) return [];

  const pool = new Map<string, CidadeBuscaRow>();
  const poolTargetSize = Math.min(220, Math.max(limit * 4, 40));
  const perTermLimit = Math.min(80, Math.max(limit * 2, 20));

  for (const term of terms) {
    try {
      const rpcRows = await fetchFromRpc(client, term, perTermLimit);
      mergeRows(pool, rpcRows);
    } catch {
      // Fallback abaixo para manter busca funcional mesmo sem RPC.
    }
    if (pool.size >= poolTargetSize) break;
  }

  if (pool.size < Math.max(limit, 15)) {
    for (const term of terms) {
      try {
        const fallbackRows = await fetchFromTable(client, term, perTermLimit);
        mergeRows(pool, fallbackRows);
      } catch {
        // Ignora erro do fallback de um termo e continua com os demais.
      }
      if (pool.size >= poolTargetSize) break;
    }
  }

  return sortRanked(Array.from(pool.values()), query).slice(0, limit);
}
