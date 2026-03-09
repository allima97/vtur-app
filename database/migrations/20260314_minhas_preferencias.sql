-- 2026-03-14: Minhas Preferências (Hotéis/Serviços/Dicas) + compartilhamento com aceite

create extension if not exists "pgcrypto";

create table if not exists public.minhas_preferencias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,

  -- Categoria livre para organizar a base pessoal
  categoria text not null default 'dica',

  -- Tipo (opcional) vindo dos tipos de produto
  tipo_produto_id uuid references public.tipo_produtos(id) on delete set null,

  -- Cidade do cadastro
  cidade_id uuid references public.cidades(id) on delete set null,

  nome text not null,
  localizacao text,
  classificacao text,
  observacao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.users(id) on delete set null
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'minhas_preferencias_categoria_check'
  ) then
    alter table public.minhas_preferencias
      add constraint minhas_preferencias_categoria_check
      check (categoria in ('hotel', 'servico', 'dica'));
  end if;
end $$;

create index if not exists idx_minhas_preferencias_company_created
  on public.minhas_preferencias(company_id, created_at desc);
create index if not exists idx_minhas_preferencias_owner
  on public.minhas_preferencias(created_by, created_at desc);
create index if not exists idx_minhas_preferencias_cidade
  on public.minhas_preferencias(cidade_id);
create index if not exists idx_minhas_preferencias_tipo
  on public.minhas_preferencias(tipo_produto_id);

create table if not exists public.minhas_preferencias_shares (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  preferencia_id uuid not null references public.minhas_preferencias(id) on delete cascade,
  shared_by uuid not null references public.users(id) on delete cascade,
  shared_with uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'minhas_preferencias_shares_status_check'
  ) then
    alter table public.minhas_preferencias_shares
      add constraint minhas_preferencias_shares_status_check
      check (status in ('pending', 'accepted', 'revoked'));
  end if;
end $$;

create unique index if not exists uq_minhas_preferencias_shares_pref_user
  on public.minhas_preferencias_shares(preferencia_id, shared_with);

create index if not exists idx_minhas_preferencias_shares_company
  on public.minhas_preferencias_shares(company_id, created_at desc);
create index if not exists idx_minhas_preferencias_shares_with
  on public.minhas_preferencias_shares(shared_with, created_at desc);
create index if not exists idx_minhas_preferencias_shares_by
  on public.minhas_preferencias_shares(shared_by, created_at desc);

alter table public.minhas_preferencias enable row level security;
alter table public.minhas_preferencias_shares enable row level security;

-- Preferências: visíveis somente para o dono, ou para quem recebeu compartilhamento (pendente/aceito).
drop policy if exists "minhas_preferencias_select" on public.minhas_preferencias;
create policy "minhas_preferencias_select" on public.minhas_preferencias
  for select using (
    is_admin(auth.uid())
    or (
      (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (
        created_by = auth.uid()
        or exists (
          select 1
          from public.minhas_preferencias_shares s
          where s.preferencia_id = minhas_preferencias.id
            and s.shared_with = auth.uid()
            and s.status in ('pending', 'accepted')
        )
      )
    )
  );

drop policy if exists "minhas_preferencias_insert" on public.minhas_preferencias;
create policy "minhas_preferencias_insert" on public.minhas_preferencias
  for insert with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and company_id = public.current_company_id()
  );

drop policy if exists "minhas_preferencias_update" on public.minhas_preferencias;
create policy "minhas_preferencias_update" on public.minhas_preferencias
  for update using (
    created_by = auth.uid()
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  )
  with check (
    created_by = auth.uid()
    and updated_by = auth.uid()
    and company_id = public.current_company_id()
  );

drop policy if exists "minhas_preferencias_delete" on public.minhas_preferencias;
create policy "minhas_preferencias_delete" on public.minhas_preferencias
  for delete using (
    created_by = auth.uid()
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

-- Shares: quem compartilha vê, quem recebe vê.
drop policy if exists "minhas_preferencias_shares_select" on public.minhas_preferencias_shares;
create policy "minhas_preferencias_shares_select" on public.minhas_preferencias_shares
  for select using (
    is_admin(auth.uid())
    or (
      (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
      and (shared_by = auth.uid() or shared_with = auth.uid())
    )
  );

drop policy if exists "minhas_preferencias_shares_insert" on public.minhas_preferencias_shares;
create policy "minhas_preferencias_shares_insert" on public.minhas_preferencias_shares
  for insert with check (
    auth.uid() is not null
    and shared_by = auth.uid()
    and shared_with <> auth.uid()
    and company_id = public.current_company_id()
    and exists (
      select 1
      from public.minhas_preferencias p
      where p.id = minhas_preferencias_shares.preferencia_id
        and p.created_by = auth.uid()
        and p.company_id = minhas_preferencias_shares.company_id
    )
    and exists (
      select 1
      from public.users u
      where u.id = minhas_preferencias_shares.shared_with
        and u.company_id = minhas_preferencias_shares.company_id
    )
  );

drop policy if exists "minhas_preferencias_shares_update" on public.minhas_preferencias_shares;
create policy "minhas_preferencias_shares_update" on public.minhas_preferencias_shares
  for update using (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      and (shared_by = auth.uid() or shared_with = auth.uid())
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      and (shared_by = auth.uid() or shared_with = auth.uid())
    )
  );

drop policy if exists "minhas_preferencias_shares_delete" on public.minhas_preferencias_shares;
create policy "minhas_preferencias_shares_delete" on public.minhas_preferencias_shares
  for delete using (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      and shared_by = auth.uid()
    )
  );
