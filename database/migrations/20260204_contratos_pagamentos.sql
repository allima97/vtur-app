-- 2026-02-04: contratos CVC, anexos de recibo, formas de pagamento e descontos

create extension if not exists "pgcrypto";

-- =========================
-- FORMAS DE PAGAMENTO
-- =========================
create table if not exists public.formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  nome text not null,
  descricao text,
  paga_comissao boolean not null default true,
  permite_desconto boolean not null default false,
  desconto_padrao_pct numeric,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_formas_pagamento_company on public.formas_pagamento (company_id);
create unique index if not exists idx_formas_pagamento_nome_company on public.formas_pagamento (company_id, nome);

-- =========================
-- PAGAMENTOS DA VENDA
-- =========================
create table if not exists public.vendas_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  forma_pagamento_id uuid references public.formas_pagamento(id) on delete set null,
  company_id uuid not null references public.companies(id),
  forma_nome text,
  operacao text,
  plano text,
  valor_bruto numeric,
  desconto_valor numeric,
  valor_total numeric,
  parcelas jsonb,
  parcelas_qtd integer,
  parcelas_valor numeric,
  vencimento_primeira date,
  paga_comissao boolean,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vendas_pagamentos_venda on public.vendas_pagamentos (venda_id);
create index if not exists idx_vendas_pagamentos_company on public.vendas_pagamentos (company_id);

-- =========================
-- NOVOS CAMPOS EM VENDAS
-- =========================
alter table if exists public.vendas
  add column if not exists desconto_comercial_aplicado boolean default false,
  add column if not exists desconto_comercial_valor numeric,
  add column if not exists valor_total_bruto numeric,
  add column if not exists valor_total_pago numeric,
  add column if not exists valor_taxas numeric,
  add column if not exists valor_nao_comissionado numeric;

-- =========================
-- NOVOS CAMPOS EM RECIBOS
-- =========================
alter table if exists public.vendas_recibos
  add column if not exists numero_reserva text,
  add column if not exists contrato_path text,
  add column if not exists contrato_url text;

-- =========================
-- RLS: FORMAS DE PAGAMENTO
-- =========================
alter table public.formas_pagamento enable row level security;

-- select
 drop policy if exists "formas_pagamento_select" on public.formas_pagamento;
 create policy "formas_pagamento_select" on public.formas_pagamento
  for select using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- write
 drop policy if exists "formas_pagamento_write" on public.formas_pagamento;
 create policy "formas_pagamento_write" on public.formas_pagamento
  for all using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- =========================
-- RLS: VENDAS_PAGAMENTOS
-- =========================
alter table public.vendas_pagamentos enable row level security;

-- select
 drop policy if exists "vendas_pagamentos_select" on public.vendas_pagamentos;
 create policy "vendas_pagamentos_select" on public.vendas_pagamentos
  for select using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- write
 drop policy if exists "vendas_pagamentos_write" on public.vendas_pagamentos;
 create policy "vendas_pagamentos_write" on public.vendas_pagamentos
  for all using (
    is_admin(auth.uid())
    or company_id = coalesce(current_setting('request.jwt.claims.company_id', true)::uuid,
                             (select u.company_id from public.users u where u.id = auth.uid()))
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

-- =========================
-- MASTER: permitir novos módulos
-- =========================
create or replace function public.is_master_allowed_module(modulo text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(coalesce(modulo, '')) in (
    'dashboard',
    'vendas_consulta',
    'vendas_importar',
    'orcamentos',
    'clientes',
    'consultoria_online',
    'cadastros',
    'cadastros_paises',
    'cadastros_estados',
    'cadastros_cidades',
    'cadastros_destinos',
    'cadastros_produtos',
    'circuitos',
    'cadastros_lote',
    'cadastros_fornecedores',
    'relatorios',
    'relatorios_vendas',
    'relatorios_destinos',
    'relatorios_produtos',
    'relatorios_clientes',
    'parametros',
    'parametros_tipo_produtos',
    'parametros_metas',
    'parametros_regras_comissao',
    'parametros_formas_pagamento',
    'operacao',
    'operacao_viagens',
    'comissionamento',
    'relatorios_ranking_vendas'
  );
$$;
