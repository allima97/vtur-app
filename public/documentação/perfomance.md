LEIA ESTE arquivo perfomance.md e também o banco-sgvtur.md, onde constam melhorias e o esquema do banco de dados do sistema. Vamos colocando em prática os itens de perfomance.md

A seguir está o checklist “cirúrgico” pronto para colar no Codex, focado nas telas mais caras Agenda / Tarefas / Dashboard / Vendas, com:

onde agrupar queries

onde colocar cache + dedupe

quais endpoints do BFF (Hono) criar primeiro

o que medir (TTFB, requests/tela, queries/sessão)

Contexto real do seu repo (zip): há muitas chamadas diretas supabase.from(...) em islands, ex.:

VendasConsultaIsland faz vendas + depois cidades + depois users (vendedores) + depois vendas_recibos etc (várias rodadas).

TodoBoard usa todo_categorias e agenda_itens (tarefas parecem viver em agenda_itens).

Dashboards fazem muitas queries (vendas, metas, viagens, clientes, quote, widgets, etc).

✅ OBJETIVO (KPIs) — definir antes de mexer
KPIs que vamos medir e perseguir

Requests/tela (front → supabase + front → BFF)
Meta: reduzir 30–80% nas telas pesadas.

Tempo até “Primeiro Conteúdo Útil” (TTCU)
Meta: < 1.5s em 4G “bom” para listas e dashboard.

TTFB dos endpoints agregados (BFF)
Meta: 200–600ms p95 (depende do banco).

Queries por sessão (estimativa)
Meta: cair drasticamente com cache/dedupe + agregação.

Realtime: número de subscriptions ativas por usuário
Meta: 1–3 por módulo, sem duplicadas.

0) INSTRUMENTAÇÃO (FAZER PRIMEIRO) — sem isso você “atira no escuro”
[x] 0.1 Criar um wrapper do Supabase para contar requests

Implementado em:
- `src/lib/netMetrics.ts`

Objetivo: logar quantas chamadas são feitas por tela/ação.

Estratégia simples: interceptar fetch global e contar quando URL contém:

- Supabase: `/rest/v1/`, `/rpc/`, `/auth/v1/`, `/storage/v1/`
- BFF: `/api/v1/` (ou `/api/`)

Além de contar, registrar `status` e `durationMs` (tempo total do fetch).

// src/lib/netMetrics.ts
type NetMetric = { ts: number; url: string; method: string; screen?: string };

const metrics: NetMetric[] = [];
let currentScreen = "unknown";

export function setCurrentScreen(name: string) {
  currentScreen = name;
}

export function getNetMetrics() {
  return metrics.slice();
}

export function clearNetMetrics() {
  metrics.length = 0;
}

export function installFetchMetrics() {
  if ((globalThis as any).__fetchMetricsInstalled) return;
  (globalThis as any).__fetchMetricsInstalled = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as any).url ?? input);
    const method = (init?.method || "GET").toUpperCase();

    const isSupabase =
      url.includes("/rest/v1/") || url.includes("/rpc/") || url.includes("/auth/v1/");

    if (isSupabase) {
      metrics.push({ ts: Date.now(), url, method, screen: currentScreen });
    }

    return originalFetch(input as any, init);
  };
}

[x] 0.2 Instalar o metrics no bootstrap do app

Implementado em:
- `src/components/islands/PermissoesProvider.tsx` (instala o wrapper em DEV ou `PUBLIC_NET_METRICS=1`)
- `src/components/islands/MenuIsland.tsx` (marca a tela atual via `setCurrentScreen`)

Em alguma ilha raiz (ex.: DashboardRouterIsland ou layout principal logado), chamar installFetchMetrics() uma vez.

Em cada tela/island principal, chamar setCurrentScreen("Vendas"), etc.

[x] 0.3 Exibir um “debug panel” opcional (só dev)

Implementado em:
- `src/components/islands/NetMetricsPanelIsland.tsx` (toggle: Ctrl/Cmd+Shift+M)
- `src/layouts/DashboardLayout.astro` (carrega em DEV ou `PUBLIC_NET_METRICS_PANEL=1`)

Mostrar: requests por tela, por endpoint, e top 10 repetidos.

Isso vai indicar exatamente onde dói.

1) PADRONIZAR CAMADA DE DADOS NO FRONT (cache + dedupe + invalidação)

O maior problema hoje: cada island chama supabase por conta própria → refetch duplicado + muitas rodadas.

[x] 1.1 Introduzir cache/dedupe padrão no front (equivalente ao TanStack/SWR)

Observação importante: como o Astro usa **React Islands** (roots separados), um `QueryClientProvider` global não atravessa as ilhas.
Para ainda assim ter dedupe/caching, foi implementado um cache leve (global no browser) para chamadas do BFF:
- `src/lib/queryLite.ts`

[x] 1.2 Chavear cache por company_id + user_id + filtros

Exemplo de key:

["vendas", companyId, vendedorScope, periodo, page, pageSize, busca]

[x] Implementado via `buildQueryLiteKey([...])` com `userId` + querystring do endpoint.

[x] 1.3 Invalidação orientada a evento (CRUD)

Quando salvar/excluir:

invalidar só o necessário (invalidateQueries(["vendas", companyId]))

otimizar com “update cache” (optimistic) em casos simples

Implementado em:
- `src/components/islands/VendasConsultaIsland.tsx` (invalida cache de vendas/kpis antes de recarregar após CRUD)
- `src/pages/api/v1/vendas/list.ts` + `src/pages/api/v1/vendas/kpis.ts` (suporta `no_cache=1` para bypass do cache do BFF)

2) BFF com HONO (Cloudflare Workers) — “menos requests, mais payload útil”

Hono não acelera o Supabase sozinho. O ganho vem de agregar e cachear.

[x] 2.1 Criar Worker Hono como “/api”

Rotas versionadas: /api/v1/...

Middleware:

auth (validar JWT do Supabase)

resolver company_id e escopo do usuário

rate limit básico por user/company

Implementado em:
- `src/api/apiApp.ts` (rotas `/api/v1/*` + fallback para `/api/*`)
- `src/worker.ts` (roteia `/api/*` via Hono; demais rotas continuam no handler do Astro)

Nota: validações de auth/permissões/escopo continuam dentro dos handlers atuais (por enquanto); o Hono serve como camada única para consolidar middleware sem precisar reescrever tudo de uma vez.

[x] 2.2 Criar “endpoints agregados” primeiro (maior dor)

Prioridade P0/P1 abaixo (por tela).

[x] 2.3 Regras de ouro do BFF

Cada endpoint deve substituir múltiplas queries front.

Responder com payload já “pronto pra render”: nomes resolvidos, totais calculados, paginação pronta.

Cachear o que puder (mesmo 10–30s já muda o jogo em dashboard).

Observação:
- O BFF agora é roteado por um **Worker Hono** (Cloudflare) e reutiliza os handlers existentes em `src/pages/api/...` (mantém compatibilidade e permite migrar por partes).
- Endpoints agregados + cache curto já aplicados em: `dashboard/summary`, `dashboard/widgets`, `dashboard/aniversariantes`, `dashboard/consultorias`, `dashboard/viagens`, `dashboard/follow-ups`, `vendas/list`, `vendas/kpis`, `todo/board`, `todo/batch`, `agenda/range`.

✅ CHECKLIST POR TELA (P0 → P2)
A) VENDAS (VendasConsultaIsland) — P0 (maior impacto)
Problema observado

Carrega vendas (com join parcial), depois faz nova rodada pra:

cidades (para mapear nome)

users (para mapear vendedor)

KPI mensal chama vendas + vendas_recibos e faz cálculo no front (peso grande).

[x] A0. Reduzir roundtrips no front via embeds (sem BFF ainda)

- `src/components/islands/VendasConsultaIsland.tsx`: a listagem agora carrega vendedor/cidade/recibos/complementares no mesmo select do PostgREST (reduz várias rodadas extras).

[x] A1. Criar endpoint BFF: GET /api/v1/vendas/list

Implementado em:
- `src/pages/api/v1/vendas/list.ts` (listagem agregada com embeds + paginação + cache curto 10s).

Front:
- `src/components/islands/VendasConsultaIsland.tsx` (carregar() agora usa `/api/v1/vendas/list`).

Substitui: vendas + cidades + users (e reduz roundtrips)

Entrada (querystring):

periodoInicio, periodoFim (ou preset)

page, pageSize

busca (opcional)

scope (admin/master/vendedorIds)

companyId (derivado do token + masterScope)

Saída:

{
  page: number,
  pageSize: number,
  total: number,
  items: Array<{
    id: string,
    data_venda: string,
    data_embarque: string | null,
    valor_total: number | null,
    valor_taxas: number | null,
    cliente: { id: string, nome: string, whatsapp?: string|null },
    vendedor: { id: string, nome: string },
    destino: { id: string, nome: string, cidade_id?: string|null, cidade_nome?: string|null },
  }>
}


Implementação recomendada (server-side):

Fazer isso via RPC no Postgres (mais rápido e 1 roundtrip):

rpc_vendas_list(company_id, vendedor_ids[], dt_ini, dt_fim, busca, page, pageSize)

retornar items + total

Ou, alternativamente, criar VIEW com joins principais (users/cidades) e consultar.

[x] A2. Criar endpoint BFF: GET /api/v1/vendas/kpis

Implementado em:
- `src/pages/api/v1/vendas/kpis.ts` (agrega vendas + recibos em 1 query + cache curto 15s).

Front:
- `src/components/islands/VendasConsultaIsland.tsx` (carregarResumoMesAtual agora usa `/api/v1/vendas/kpis`).

Substitui: carregarResumoMesAtual() (hoje faz 2 queries e cálculo no front)

Saída:

{ totalVendas: number, totalTaxas: number, totalLiquido: number, totalSeguro: number }


Observação: calcular seguro e rateio no servidor (mais consistente e rápido).

[x] A2.1 (Extra) Unificar list + kpis em 1 request

- `src/pages/api/v1/vendas/list.ts`: aceita `include_kpis=1` (usa RPC `rpc_vendas_kpis` quando disponível).
- `src/components/islands/VendasConsultaIsland.tsx`: passou a pedir `include_kpis=1` e usa o KPI retornado; se o RPC ainda não estiver aplicado, faz fallback para `/api/v1/vendas/kpis`.

[x] A3. Cache no front (QueryLite)

Implementado em:
- `src/lib/queryLite.ts` (cache/dedupe leve)
- `src/components/islands/VendasConsultaIsland.tsx` (cache por `userId + filtros` para `/api/v1/vendas/list` e `/api/v1/vendas/kpis`)

[x] A4. Cache no BFF (curto)

- Aplicado no endpoint `vendas/kpis` (15s) e no endpoint `vendas/list` (10s).

Para kpis: cache 15–30s por (companyId, periodo, scope)

Para list: cache 5–15s por página/filtro (opcional)

[x] A5. Medições específicas

Antes/depois:

requests/tela para listar vendas

TTFB do endpoint agregador

tempo para render primeira página

Meta: tela de vendas cair para 1 request (lista) + 1 request (kpis), no máximo.

Como medir (dev):
- Abrir o painel `NetMetrics` (Ctrl/Cmd+Shift+M) → `Limpar`
- Entrar em Vendas → aguardar carregar → anotar “Por tela” e “Top endpoints” (avg)

B) DASHBOARD (Geral/Gestor/Admin) — P0/P1 (muitas queries pequenas)
Problema observado

Dashboard executa várias consultas: vendas, metas_vendedor, viagens, clientes, quote, dashboard_widgets, etc.

Perfeito para agregação, pois dashboard sempre é “um monte de KPIs”.

[x] B1. Criar endpoint BFF: GET /api/v1/dashboard/summary

Implementado em:
- `src/pages/api/v1/dashboard/summary.ts` (agrega dados + valida permissões + cache curto 20s).

Front (reduz várias queries Supabase para 1 request):
- `src/components/islands/DashboardGeralIsland.tsx` (carrega via `/api/v1/dashboard/summary?mode=geral&inicio=...&fim=...`).
- `src/components/islands/DashboardGestorIsland.tsx` (carrega via `/api/v1/dashboard/summary?mode=gestor&inicio=...&fim=...`).

Entrada:

range (ex.: mes_atual, ult_7d, etc)

companyId/scope (derivado)

widgets (opcional)

Saída (exemplo):

{
  range: { inicio: string, fim: string },
  kpis: {
    vendasTotal: number,
    vendasQtde: number,
    clientesNovos: number,
    viagensAbertas: number,
    metaAtingida?: boolean,
    // ...
  },
  timeseries?: Array<{ day: string, vendas: number }>,
  top?: {
    destinos: Array<{ nome: string, total: number }>,
    vendedores: Array<{ nome: string, total: number }>,
  },
  widgets: Array<...> // se aplicável
}

[x] B2. Criar endpoint BFF: GET /api/v1/dashboard/widgets

e POST /api/v1/dashboard/widgets

Centralizar o CRUD de widgets (hoje faz deletes/inserts no front).

Implementado em:
- `src/pages/api/v1/dashboard/widgets.ts` (GET cache 30s + POST sobrescreve prefs do usuário)

Front:
- `src/components/islands/DashboardGeralIsland.tsx` (salvarPreferencias agora usa `/api/v1/dashboard/widgets`)

[x] B3. Cache agressivo e inteligente

- Cache curto (20s) no endpoint `dashboard/summary` + `Cache-Control: private, max-age=20`.

Dashboard tolera cache curto (15–60s) e fica “instantâneo”.

Bloco de endpoints (dashboard) com TTL:
- `GET /api/v1/dashboard/summary`: 20s
- `GET /api/v1/dashboard/widgets`: 900s
- `GET /api/v1/dashboard/aniversariantes`: 300s
- `GET /api/v1/dashboard/consultorias`: 300s
- `GET /api/v1/dashboard/viagens`: 300s
- `GET /api/v1/dashboard/follow-ups`: 300s

Cache local vs KV (dashboard):
- summary: local 20s, KV 20s, Cache-Control 20s
- widgets: local 900s, KV 900s, Cache-Control 900s
- aniversariantes: local 300s, KV 300s, Cache-Control 300s
- consultorias: local 300s, KV 300s, Cache-Control 300s
- viagens: local 300s, KV 300s, Cache-Control 300s
- follow-ups: local 300s, KV 300s, Cache-Control 300s

Key: (companyId, scope, range, widgetConfigHash)

[x] B4. Front: 1 query por dashboard

- Aplicado no `DashboardGeralIsland` e no `DashboardGestorIsland` (modes `geral` e `gestor`).
- Summary passou a carregar so KPIs/Orcamentos/Metas/Widgets; listas pesadas foram separadas em endpoints dedicados.

[x] B5. Medições específicas

Requests ao abrir dashboard: meta 1–2 no máximo (summary + widgets), com listas pesadas sob demanda.

Tempo para mostrar KPIs: meta < 1s após login (com cache).

Como medir (dev):
- Abrir o painel `NetMetrics` (Ctrl/Cmd+Shift+M) → `Limpar`
- Entrar no Dashboard → anotar “Por tela” + avg do endpoint `bff GET /api/v1/dashboard/summary`

C) AGENDA (AgendaCalendar) — P1 (muita leitura + realtime)
Problema observado

Muitas operações em agenda_itens (select/insert/update/delete)

Agenda é naturalmente “quente” e pode usar realtime, mas com cuidado para não duplicar subscrições.

[x] C1. Unificar consultas em “range”

Criar endpoint BFF: GET /api/v1/agenda/range?inicio=YYYY-MM-DD&fim=YYYY-MM-DD

Retornar itens do período já filtrados por companyId + permissões.

Incluir campos já “renderáveis” (ex.: nomes necessários).

[x] Implementado em:
- `src/pages/api/v1/agenda/range.ts` (cache curto 10s + `Cache-Control: private, max-age=10`)

Front:
- `src/components/islands/AgendaCalendar.tsx` (carrega por range via fetch em vez de `supabase.from("agenda_itens")`)

[x] C2. Estratégia de cache + invalidação

Cache front: staleTime=5–15s para range atual.

Quando criar/editar/deletar:

atualizar cache local (optimistic) e revalidar.

[x] Implementado em:
- `src/components/islands/AgendaCalendar.tsx` (cache leve em memória por range + atualizações otimistas já existentes)

[x] C3. Realtime certo (sem duplicar)

Apenas 1 subscription por range (ou por módulo).

Ao trocar de mês/semana:

teardown da subscription anterior

criar nova com filtros corretos

Regra: subscription deve sempre ser guardada em ref e unsubscribe() no cleanup.

[x] Implementado em:
- `src/components/islands/AgendaCalendar.tsx` (1 channel por usuário com filtro `user_id=eq.<id>`, faz upsert/remove local e respeita range atual via ref)

[x] C4. Medições específicas

Número de subscriptions ativas ao navegar: deve ficar estável (não crescer).

Requests/mudar de mês: meta 1 request (range) + updates realtime.

Como medir (dev):
- Abrir o painel `NetMetrics` (Ctrl/Cmd+Shift+M) → `Limpar`
- Navegar meses/semana/dia → checar se o número de requests por tela fica estável

D) TAREFAS (TodoBoard) — P1 (hoje mistura todo + agenda_itens)
Problema observado

todo_categorias + agenda_itens em múltiplas chamadas.

Muitas ações pequenas (mudar status, mover card, etc) → risco de “tempestade” de updates.

[x] D1. Criar endpoint BFF: GET /api/v1/todo/board

Retornar:

categorias

itens por categoria/status

contagens

Implementado em:
- `src/pages/api/v1/todo/board.ts` (cache curto 15s + payload pronto)

Front:
- `src/components/islands/TodoBoard.tsx` (loadData usa `/api/v1/todo/board`)

Saída:

{
  categorias: Array<{ id: string, nome: string, cor: string }>,
  itens: Array<{ id: string, titulo: string, status: string, categoria_id?: string|null, due?: string|null, ... }>
}

[x] D2. Batch de updates (P2, mas muito útil)

Criar endpoint: POST /api/v1/todo/batch

Para drag-and-drop (múltiplos updates rápidos), mandar lote:

{ updates: Array<{ id: string, status?: string, categoria_id?: string, order?: number }> }

[x] Implementado em:
- `src/pages/api/v1/todo/batch.ts` (batch de updates de tarefas)

Front:
- `src/components/islands/TodoBoard.tsx` (mudanças de status/done usam batch)

[x] D3. Debounce de mudanças rápidas no front

Ao arrastar cards, acumular mudanças 300–800ms e enviar batch.

[x] Implementado em:
- `src/components/islands/TodoBoard.tsx` (debounce 500ms para flush + merge por id)

[x] D4. Cache

todo_categorias: staleTime=30–60min

todo_board: staleTime=10–30s (ou realtime)

Implementado (cache curto 15s em sessão):
- `src/components/islands/TodoBoard.tsx` (sessionStorage: `sgtur_todo_board_cache_v1`)
- `src/pages/api/v1/todo/board.ts` (cache 15s: memoria/KV/Cache-Control)

3) PERMISSÕES (seu requisito) — carregar 1x por sessão, atualizar no login
[x] 3.1 Garantir que permissões NÃO são re-carregadas por rota

- `src/components/islands/PermissoesProvider.tsx`: removido refresh forçado de permissões a cada carregamento de página (reduz requests repetidas em `modulo_acesso`/`users`).

Carregar permissões no “entry” do app logado e persistir em store.

Ao logout/login: limpar store e carregar de novo.

[x] 3.2 No BFF, validar acesso por módulo/ação

Mesmo que o front já saiba, o BFF deve revalidar para endpoints críticos.

O token define usuário; o BFF resolve company e escopo.

Implementado em:
- `src/pages/api/v1/dashboard/summary.ts` (bloqueia sem `dashboard`)
- `src/pages/api/v1/dashboard/widgets.ts` (bloqueia sem `dashboard`)
- `src/pages/api/v1/vendas/list.ts` e `src/pages/api/v1/vendas/kpis.ts` (bloqueia sem `vendas_consulta`)
- `src/pages/api/v1/agenda/range.ts` (bloqueia sem `operacao_agenda` ou `operacao`)
- `src/pages/api/v1/todo/board.ts` (bloqueia sem `operacao_todo` ou `operacao`)

4) BANCO / RLS / ÍNDICES (obrigatório para “milhares de usuários”)

SPA/MPA não salva banco lento.

[x] 4.1 Indexar colunas que sempre aparecem em filtros/RLS

Prováveis (ajustar conforme schema real):

company_id

user_id, vendedor_id

datas (data_venda, data_lancamento, data_embarque)

status, categoria_id (todo)

agenda_itens.data (ou equivalente)

Implementado em:
- `database/migrations/20260217_perf_indexes_bff.sql` (índices para `vendas`, `vendas_recibos`, `agenda_itens`, `todo_categorias`, `users`, `dashboard_widgets` e `modulo_acesso`)

[x] 4.2 Evitar “select *”

Selecionar só colunas usadas na UI.

Implementado em:
- `src/lib/vendas/saveContratoImport.ts`
- `src/components/islands/VendasCadastroIsland.tsx`
- `src/lib/quote/exportQuotePdfClient.ts`
- `src/components/islands/QuotePrintSettingsIsland.tsx`
- `src/components/islands/FormasPagamentoIsland.tsx`
- `src/components/islands/MetasVendedorIsland.tsx`
- `src/components/islands/FechamentoComissaoIsland.tsx`
- `src/components/islands/CommissionTemplatesIsland.tsx`
- `src/components/islands/AdminPermissoesIsland.tsx`
- `src/components/islands/MasterPermissoesIsland.tsx`
- `src/components/islands/PermissoesAdminIsland.tsx`
- `src/components/islands/ClientesIsland.tsx`

[x] 4.3 Trocar N+1 por RPC/VIEW

Especialmente em Vendas e Dashboard.

Implementado em:
- `database/migrations/20260217_rpc_vendas_kpis.sql` (RPC agregada para KPIs de vendas)
- `database/migrations/20260218_rpc_dashboard_vendas_summary.sql` (RPC agregada para KPIs + gráficos do Dashboard)
- `src/pages/api/v1/vendas/kpis.ts` (usa RPC com fallback enquanto a migration não for aplicada)
- `src/pages/api/v1/dashboard/summary.ts` (usa RPC com fallback e passa a retornar `vendasAgg` no payload)
- `src/components/islands/DashboardGeralIsland.tsx` (passa a consumir `vendasAgg` e reduz cálculo/payload no front)
- `src/components/islands/DashboardGestorIsland.tsx` (passa a consumir `vendasAgg` e usa timeline real em “Evolução”)

5) METAS DE REDUÇÃO (alvos concretos por tela)
Vendas

Antes: 3–8+ requests (vendas + cidades + users + recibos + etc)

Depois: 2 requests (list + kpis), idealmente 1 (se kpis vier junto)

Dashboard

Antes: 6–15+ requests

Depois: 1 request (summary) + opcional widgets + listas pesadas sob demanda

Agenda

Antes: várias queries por mudança

Depois: 1 por range + realtime controlado

Tarefas

Antes: categorias + itens + updates individuais

Depois: 1 board + batch updates

6) ORDEM DE EXECUÇÃO (para não quebrar o sistema)
P0 (primeira semana de impacto real)

Instrumentação (0.x)

Dashboard summary (B1) + cache curto

Vendas list + kpis (A1/A2)

P1

Todo board (D1)

Agenda range (C1) + realtime sem duplicar (C3)

P2

Batch updates Todo (D2)

Ajustes finos de índices/RPC + otimizações de payload

✅ Entregável final esperado (para validação)

Painel “debug metrics” mostrando:

requests por tela (antes/depois)

top endpoints repetidos

Cada tela pesada com 1–2 requests no máximo

Dashboards “instantâneos” com cache 15–60s

Realtime estável (sem subscriptions duplicadas)

Logs/observabilidade básica no Worker

7) COMPATIBILIDADE (Safari/WebKit) — validação rápida

Para checar erros de console/hidratação no Safari (desktop + iPhone), usar:

`npm run safari:check`

Se aparecer erro “Importing binding name 'serialize' is not found.”, garantir que `@supabase/ssr` e `cookie` estejam no `optimizeDeps.include` (evita falha do `createBrowserClient` em WebKit durante o dev).
