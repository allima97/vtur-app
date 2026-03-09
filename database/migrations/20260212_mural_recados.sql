-- 2026-02-12: Mural de Recados (substitui Chat por enquanto)
-- Requisitos:
-- - Recados podem ser para um usuario (privado) ou para toda a empresa (receiver_id = null)
-- - Privado: somente remetente/destinatario podem ler; somente destinatario pode apagar
-- - Empresa: usuarios da empresa podem ler; somente remetente pode apagar
-- - Respostas em thread, sem edicao (sem policy de UPDATE)
-- - Realtime habilitado via publication supabase_realtime

create extension if not exists "pgcrypto";

-- Helper para validar destinatario na empresa ignorando RLS de users.
create or replace function public.user_company_id(uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.company_id
  from public.users u
  where u.id = uid;
$$;

grant execute on function public.user_company_id(uuid) to anon, authenticated, service_role;

create table if not exists public.mural_recados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid references public.users(id) on delete cascade,
  assunto text,
  conteudo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mural_recados_company_created
  on public.mural_recados(company_id, created_at desc);
create index if not exists idx_mural_recados_receiver_created
  on public.mural_recados(receiver_id, created_at desc);
create index if not exists idx_mural_recados_sender_created
  on public.mural_recados(sender_id, created_at desc);

create table if not exists public.mural_recado_respostas (
  id uuid primary key default gen_random_uuid(),
  recado_id uuid not null references public.mural_recados(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  conteudo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mural_respostas_recado_created
  on public.mural_recado_respostas(recado_id, created_at asc);
create index if not exists idx_mural_respostas_company_created
  on public.mural_recado_respostas(company_id, created_at asc);

-- Defaults (evita o front precisar enviar sender_id/company_id sempre)
create or replace function public.mural_recados_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  if new.sender_id is null then
    new.sender_id := auth.uid();
  end if;
  if new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mural_recados_defaults on public.mural_recados;
create trigger trg_mural_recados_defaults
before insert on public.mural_recados
for each row execute procedure public.mural_recados_set_defaults();

create or replace function public.mural_recado_respostas_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  if new.sender_id is null then
    new.sender_id := auth.uid();
  end if;
  if new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mural_respostas_defaults on public.mural_recado_respostas;
create trigger trg_mural_respostas_defaults
before insert on public.mural_recado_respostas
for each row execute procedure public.mural_recado_respostas_set_defaults();

alter table public.mural_recados enable row level security;
alter table public.mural_recado_respostas enable row level security;

-- =========================
-- RLS: mural_recados
-- =========================
drop policy if exists "mural_recados_select" on public.mural_recados;
create policy "mural_recados_select" on public.mural_recados
  for select using (
    is_admin(auth.uid())
    -- Recado para empresa: qualquer usuario com acesso a esta empresa
    or (
      receiver_id is null
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
    -- Recado privado: somente participantes + acesso a empresa
    or (
      receiver_id is not null
      and (sender_id = auth.uid() or receiver_id = auth.uid())
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
  );

drop policy if exists "mural_recados_insert" on public.mural_recados;
create policy "mural_recados_insert" on public.mural_recados
  for insert with check (
    auth.uid() is not null
    and sender_id = auth.uid()
    and (
      is_admin(auth.uid())
      or company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
    and (
      receiver_id is null
      or public.user_company_id(receiver_id) = company_id
    )
  );

drop policy if exists "mural_recados_delete" on public.mural_recados;
create policy "mural_recados_delete" on public.mural_recados
  for delete using (
    is_admin(auth.uid())
    or (
      receiver_id is null
      and sender_id = auth.uid()
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
    or (
      receiver_id = auth.uid()
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
  );

-- =========================
-- RLS: mural_recado_respostas
-- =========================
drop policy if exists "mural_respostas_select" on public.mural_recado_respostas;
create policy "mural_respostas_select" on public.mural_recado_respostas
  for select using (
    exists (
      select 1
      from public.mural_recados r
      where r.id = mural_recado_respostas.recado_id
        and (
          is_admin(auth.uid())
          or (
            r.receiver_id is null
            and (
              r.company_id = public.current_company_id()
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
            )
          )
          or (
            r.receiver_id is not null
            and (r.sender_id = auth.uid() or r.receiver_id = auth.uid())
            and (
              r.company_id = public.current_company_id()
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
            )
          )
        )
    )
  );

drop policy if exists "mural_respostas_insert" on public.mural_recado_respostas;
create policy "mural_respostas_insert" on public.mural_recado_respostas
  for insert with check (
    auth.uid() is not null
    and sender_id = auth.uid()
    and (
      is_admin(auth.uid())
      or company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
    and exists (
      select 1
      from public.mural_recados r
      where r.id = mural_recado_respostas.recado_id
        and r.company_id = mural_recado_respostas.company_id
        and (
          r.receiver_id is null
          or r.sender_id = auth.uid()
          or r.receiver_id = auth.uid()
        )
    )
  );

drop policy if exists "mural_respostas_delete" on public.mural_recado_respostas;
create policy "mural_respostas_delete" on public.mural_recado_respostas
  for delete using (
    is_admin(auth.uid())
    or sender_id = auth.uid()
  );

-- =========================
-- Realtime (Postgres Changes)
-- =========================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.mural_recados;
    exception when duplicate_object then
      null;
    end;
    begin
      alter publication supabase_realtime add table public.mural_recado_respostas;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

