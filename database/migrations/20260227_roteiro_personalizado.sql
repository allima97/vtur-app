-- Migração: Roteiros Personalizados
-- Data: 2026-02-27

-- Tabela principal
create table if not exists public.roteiro_personalizado (
  id uuid default gen_random_uuid() primary key,
  created_by uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  nome text not null,
  duracao integer,
  inicio_cidade text,
  fim_cidade text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.roteiro_hotel (
  id uuid default gen_random_uuid() primary key,
  roteiro_id uuid not null references public.roteiro_personalizado(id) on delete cascade,
  cidade text,
  hotel text,
  data_inicio date,
  data_fim date,
  noites integer,
  apto text,
  categoria text,
  regime text,
  ordem int default 0
);

create table if not exists public.roteiro_passeio (
  id uuid default gen_random_uuid() primary key,
  roteiro_id uuid not null references public.roteiro_personalizado(id) on delete cascade,
  cidade text,
  passeio text,
  data date,
  tipo text,      -- "Compartilhado" | "Privativo"
  ingressos text, -- "Inclui Ingressos" | "NÃO INCLUI"
  ordem int default 0
);

create table if not exists public.roteiro_transporte (
  id uuid default gen_random_uuid() primary key,
  roteiro_id uuid not null references public.roteiro_personalizado(id) on delete cascade,
  tipo text,
  fornecedor text,
  descricao text,
  data_inicio date,
  data_fim date,
  categoria text,
  observacao text,
  ordem int default 0
);

-- Banco de dias compartilhado por empresa; roteiro_id nullable (dia avulso)
create table if not exists public.roteiro_dia (
  id uuid default gen_random_uuid() primary key,
  created_by uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  roteiro_id uuid references public.roteiro_personalizado(id) on delete set null,
  cidade text not null,
  data date,
  ordem int default 0,
  descricao text not null,
  created_at timestamptz default now()
);

create index if not exists roteiro_dia_company_idx on public.roteiro_dia (company_id);

create table if not exists public.roteiro_investimento (
  id uuid default gen_random_uuid() primary key,
  roteiro_id uuid not null references public.roteiro_personalizado(id) on delete cascade,
  tipo text,
  valor_por_pessoa numeric,
  qtd_apto int,
  valor_por_apto numeric,
  ordem int default 0
);

create table if not exists public.roteiro_pagamento (
  id uuid default gen_random_uuid() primary key,
  roteiro_id uuid not null references public.roteiro_personalizado(id) on delete cascade,
  servico text,
  valor_total_com_taxas numeric,
  taxas numeric,
  forma_pagamento text,
  ordem int default 0
);

-- Adicionar referência ao roteiro na tabela quote existente
alter table public.quote
  add column if not exists roteiro_id uuid
    references public.roteiro_personalizado(id) on delete set null;

-- RLS: roteiro visível para mesmo created_by OU mesma company_id
alter table public.roteiro_personalizado enable row level security;

drop policy if exists roteiro_select on public.roteiro_personalizado;
create policy roteiro_select on public.roteiro_personalizado for select
  using (
    created_by = auth.uid()
    or company_id = (select company_id from public.users where id = auth.uid())
  );

drop policy if exists roteiro_insert on public.roteiro_personalizado;
create policy roteiro_insert on public.roteiro_personalizado for insert
  with check (created_by = auth.uid());

drop policy if exists roteiro_update on public.roteiro_personalizado;
create policy roteiro_update on public.roteiro_personalizado for update
  using (created_by = auth.uid());

drop policy if exists roteiro_delete on public.roteiro_personalizado;
create policy roteiro_delete on public.roteiro_personalizado for delete
  using (created_by = auth.uid());

-- RLS tabelas filhas (via roteiro_id → mesmo dono)
alter table public.roteiro_hotel enable row level security;
drop policy if exists roteiro_hotel_select on public.roteiro_hotel;
create policy roteiro_hotel_select on public.roteiro_hotel for select
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id
      and (r.created_by = auth.uid()
        or r.company_id = (select company_id from public.users where id = auth.uid()))
  ));
drop policy if exists roteiro_hotel_all on public.roteiro_hotel;
create policy roteiro_hotel_all on public.roteiro_hotel for all
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id and r.created_by = auth.uid()
  ));

alter table public.roteiro_passeio enable row level security;
drop policy if exists roteiro_passeio_select on public.roteiro_passeio;
create policy roteiro_passeio_select on public.roteiro_passeio for select
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id
      and (r.created_by = auth.uid()
        or r.company_id = (select company_id from public.users where id = auth.uid()))
  ));
drop policy if exists roteiro_passeio_all on public.roteiro_passeio;
create policy roteiro_passeio_all on public.roteiro_passeio for all
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id and r.created_by = auth.uid()
  ));

alter table public.roteiro_transporte enable row level security;
drop policy if exists roteiro_transporte_select on public.roteiro_transporte;
create policy roteiro_transporte_select on public.roteiro_transporte for select
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id
      and (r.created_by = auth.uid()
        or r.company_id = (select company_id from public.users where id = auth.uid()))
  ));
drop policy if exists roteiro_transporte_all on public.roteiro_transporte;
create policy roteiro_transporte_all on public.roteiro_transporte for all
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id and r.created_by = auth.uid()
  ));

alter table public.roteiro_investimento enable row level security;
drop policy if exists roteiro_investimento_select on public.roteiro_investimento;
create policy roteiro_investimento_select on public.roteiro_investimento for select
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id
      and (r.created_by = auth.uid()
        or r.company_id = (select company_id from public.users where id = auth.uid()))
  ));
drop policy if exists roteiro_investimento_all on public.roteiro_investimento;
create policy roteiro_investimento_all on public.roteiro_investimento for all
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id and r.created_by = auth.uid()
  ));

alter table public.roteiro_pagamento enable row level security;
drop policy if exists roteiro_pagamento_select on public.roteiro_pagamento;
create policy roteiro_pagamento_select on public.roteiro_pagamento for select
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id
      and (r.created_by = auth.uid()
        or r.company_id = (select company_id from public.users where id = auth.uid()))
  ));
drop policy if exists roteiro_pagamento_all on public.roteiro_pagamento;
create policy roteiro_pagamento_all on public.roteiro_pagamento for all
  using (exists (
    select 1 from public.roteiro_personalizado r
    where r.id = roteiro_id and r.created_by = auth.uid()
  ));

-- roteiro_dia: compartilhado por empresa
alter table public.roteiro_dia enable row level security;

drop policy if exists roteiro_dia_select on public.roteiro_dia;
create policy roteiro_dia_select on public.roteiro_dia for select
  using (
    company_id = (select company_id from public.users where id = auth.uid())
    or (company_id is null and created_by = auth.uid())
  );

drop policy if exists roteiro_dia_insert on public.roteiro_dia;
create policy roteiro_dia_insert on public.roteiro_dia for insert
  with check (created_by = auth.uid());

drop policy if exists roteiro_dia_update on public.roteiro_dia;
create policy roteiro_dia_update on public.roteiro_dia for update
  using (created_by = auth.uid());

drop policy if exists roteiro_dia_delete on public.roteiro_dia;
create policy roteiro_dia_delete on public.roteiro_dia for delete
  using (created_by = auth.uid());
