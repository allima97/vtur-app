-- 2026-03-17: Conciliação de recibos (movimentação diária)

create extension if not exists "pgcrypto";

create table if not exists public.conciliacao_recibos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  documento text not null,
  movimento_data date,
  status text not null default '',
  descricao text,

  valor_lancamentos numeric,
  valor_taxas numeric,
  valor_descontos numeric,
  valor_abatimentos numeric,
  valor_calculada_loja numeric,
  valor_visao_master numeric,
  valor_opfax numeric,
  valor_saldo numeric,

  origem text,
  raw jsonb,

  conciliado boolean not null default false,
  match_total boolean,
  match_taxas boolean,
  sistema_valor_total numeric,
  sistema_valor_taxas numeric,
  diff_total numeric,
  diff_taxas numeric,

  venda_id uuid references public.vendas(id) on delete set null,
  venda_recibo_id uuid references public.vendas_recibos(id) on delete set null,

  imported_by uuid references public.users(id) on delete set null,
  last_checked_at timestamptz,
  conciliado_em timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists conciliacao_recibos_company_documento_uidx
  on public.conciliacao_recibos(company_id, documento);

create index if not exists conciliacao_recibos_company_pendente_idx
  on public.conciliacao_recibos(company_id, conciliado, movimento_data);

create index if not exists conciliacao_recibos_documento_idx
  on public.conciliacao_recibos(documento);

create or replace function public.conciliacao_recibos_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_conciliacao_recibos_updated_at on public.conciliacao_recibos;
create trigger trg_conciliacao_recibos_updated_at
before update on public.conciliacao_recibos
for each row execute procedure public.conciliacao_recibos_set_updated_at();

alter table public.conciliacao_recibos enable row level security;

-- SELECT
drop policy if exists "conciliacao_recibos_select" on public.conciliacao_recibos;
create policy "conciliacao_recibos_select" on public.conciliacao_recibos
  for select using (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  );

-- INSERT
drop policy if exists "conciliacao_recibos_insert" on public.conciliacao_recibos;
create policy "conciliacao_recibos_insert" on public.conciliacao_recibos
  for insert with check (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  );

-- UPDATE
drop policy if exists "conciliacao_recibos_update" on public.conciliacao_recibos;
create policy "conciliacao_recibos_update" on public.conciliacao_recibos
  for update using (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      is_gestor(auth.uid())
      and company_id = public.current_company_id()
    )
    or (
      is_master(auth.uid())
      and public.master_can_access_company(auth.uid(), company_id)
    )
  );

-- DELETE: bloqueado por padrão (mantém histórico)
drop policy if exists "conciliacao_recibos_delete" on public.conciliacao_recibos;

-- =========================
-- Menu/Permissões (somente Gestor/Master)
-- =========================

-- Defaults por tipo de usuário
insert into public.user_type_default_perms (user_type_id, modulo, permissao, ativo)
select t.id, 'Conciliação', 'edit', true
from public.user_types t
where (
    upper(coalesce(t.name, '')) like '%GESTOR%'
    or upper(coalesce(t.name, '')) like '%MASTER%'
    or upper(coalesce(t.name, '')) like '%ADMIN%'
  )
  and not exists (
    select 1
    from public.user_type_default_perms d
    where d.user_type_id = t.id
      and lower(d.modulo) = lower('Conciliação')
  );

-- Backfill: usuários atuais
insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select u.id, 'Conciliação', 'edit', true
from public.users u
join public.user_types t on t.id = u.user_type_id
where (
    upper(coalesce(t.name, '')) like '%GESTOR%'
    or upper(coalesce(t.name, '')) like '%MASTER%'
    or upper(coalesce(t.name, '')) like '%ADMIN%'
  )
  and not exists (
    select 1
    from public.modulo_acesso ma
    where ma.usuario_id = u.id
      and lower(ma.modulo) = lower('Conciliação')
  );
