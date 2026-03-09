-- Migração: Atualiza roteiro_passeio (data → data_inicio + data_fim) e cria tabela de sugestões autocomplete
-- Data: 2026-02-28

-- Renomeia coluna data para data_inicio em roteiro_passeio
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roteiro_passeio'
      and column_name = 'data'
  ) then
    alter table public.roteiro_passeio rename column data to data_inicio;
  end if;
end $$;

-- Adiciona coluna data_fim em roteiro_passeio
alter table public.roteiro_passeio
  add column if not exists data_fim date;

-- Tabela de sugestões de autocomplete por empresa
create table if not exists public.roteiro_sugestoes (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade,
  tipo text not null,   -- 'cidade', 'hotel', 'apto', 'categoria', 'passeio', 'transporte_tipo', 'fornecedor', 'transporte_desc', 'transporte_cat', 'investimento_tipo', 'forma_pagamento'
  valor text not null,
  uso_count int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, tipo, valor)
);

create index if not exists roteiro_sugestoes_company_tipo_idx
  on public.roteiro_sugestoes (company_id, tipo);

-- RLS
alter table public.roteiro_sugestoes enable row level security;

drop policy if exists roteiro_sugestoes_select on public.roteiro_sugestoes;
create policy roteiro_sugestoes_select on public.roteiro_sugestoes for select
  using (
    company_id = (select company_id from public.users where id = auth.uid())
  );

drop policy if exists roteiro_sugestoes_insert on public.roteiro_sugestoes;
create policy roteiro_sugestoes_insert on public.roteiro_sugestoes for insert
  with check (
    company_id = (select company_id from public.users where id = auth.uid())
  );

drop policy if exists roteiro_sugestoes_update on public.roteiro_sugestoes;
create policy roteiro_sugestoes_update on public.roteiro_sugestoes for update
  using (
    company_id = (select company_id from public.users where id = auth.uid())
  );

drop policy if exists roteiro_sugestoes_delete on public.roteiro_sugestoes;
create policy roteiro_sugestoes_delete on public.roteiro_sugestoes for delete
  using (
    company_id = (select company_id from public.users where id = auth.uid())
  );
