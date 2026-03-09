-- 2026-02-07: regras de comissão por tipo de pacote

create extension if not exists "pgcrypto";

create table if not exists public.product_commission_rule_pacote (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.tipo_produtos(id) on delete cascade,
  tipo_pacote text not null,
  rule_id uuid references public.commission_rule(id) on delete set null,
  fix_meta_nao_atingida numeric,
  fix_meta_atingida numeric,
  fix_super_meta numeric,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_product_comm_rule_pacote_un
  on public.product_commission_rule_pacote (produto_id, tipo_pacote);

create index if not exists idx_product_comm_rule_pacote_produto
  on public.product_commission_rule_pacote (produto_id);
