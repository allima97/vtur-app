-- 2026-02-09: cadastro de tipos de pacote com comissão

create extension if not exists "pgcrypto";

create table if not exists public.tipo_pacotes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  rule_id uuid references public.commission_rule(id) on delete set null,
  fix_meta_nao_atingida numeric,
  fix_meta_atingida numeric,
  fix_super_meta numeric,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_tipo_pacotes_nome
  on public.tipo_pacotes (lower(nome));
