-- 2026-02-14: Indica leituras de recados e contador de não lidos
create table if not exists public.mural_recados_leituras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recado_id uuid not null references public.mural_recados(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_mural_recados_leituras_recado_user
  on public.mural_recados_leituras(recado_id, user_id);
create index if not exists idx_mural_recados_leituras_user_company
  on public.mural_recados_leituras(company_id, user_id);

alter table public.mural_recados_leituras enable row level security;

drop policy if exists "mural_recados_leituras_select" on public.mural_recados_leituras;
create policy "mural_recados_leituras_select" on public.mural_recados_leituras
  for select using (
    is_admin(auth.uid())
    or user_id = auth.uid()
    or exists (
      select 1
      from public.mural_recados r
      where r.id = mural_recados_leituras.recado_id
        and r.sender_id = auth.uid()
    )
  );

drop policy if exists "mural_recados_leituras_insert" on public.mural_recados_leituras;
create policy "mural_recados_leituras_insert" on public.mural_recados_leituras
  for insert with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and (
      exists (
        select 1
        from public.mural_recados r
        where r.id = mural_recados_leituras.recado_id
          and (
            (r.receiver_id is null
              and (
                r.company_id = public.current_company_id()
                or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
              )
            )
            or (r.receiver_id = auth.uid())
          )
      )
    )
  );

drop policy if exists "mural_recados_leituras_update" on public.mural_recados_leituras;
create policy "mural_recados_leituras_update" on public.mural_recados_leituras
  for update
  using (
    user_id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

create or replace function public.mural_recados_mark_read(target_id uuid)
returns void
language plpgsql
security definer
set row_security = off
as $$
declare
  recado record;
  ctx_company uuid := public.current_company_id();
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select id, company_id, receiver_id
  into recado
  from public.mural_recados
  where id = target_id;

  if not found then
    raise exception 'Recado não encontrado.';
  end if;

  if recado.receiver_id is not null then
    if recado.receiver_id <> auth.uid() then
      raise exception 'Somente o destinatário pode marcar este recado.';
    end if;
  else
    if not (
      recado.company_id = ctx_company
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), recado.company_id))
    ) then
      raise exception 'Você não pode marcar este recado.';
    end if;
  end if;

  insert into public.mural_recados_leituras (company_id, recado_id, user_id, read_at)
  values (recado.company_id, target_id, auth.uid(), now())
  on conflict (recado_id, user_id)
  do update set read_at = now();
end;
$$;

grant execute on function public.mural_recados_mark_read(uuid) to authenticated, anon, service_role;

create or replace function public.mural_recados_unread_count()
returns integer
language plpgsql
security definer
set row_security = off
as $$
declare
  usr uuid := auth.uid();
  ctx_company uuid := public.current_company_id();
begin
  if usr is null or ctx_company is null then
    return 0;
  end if;

  return (
    select count(*)
    from public.mural_recados r
    where (
      r.company_id = ctx_company
      or (is_master(usr) and public.master_can_access_company(usr, r.company_id))
    )
      and (
        r.receiver_id is null
        or r.receiver_id = usr
      )
      and not exists (
        select 1
        from public.mural_recados_leituras l
        where l.recado_id = r.id
          and l.user_id = usr
          and l.read_at >= r.created_at
      )
  );
end;
$$;

grant execute on function public.mural_recados_unread_count() to authenticated, anon, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication pub on pub.oid = pr.prpubid
    where pub.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'mural_recados_leituras'
  ) then
    execute 'alter publication supabase_realtime add table public.mural_recados_leituras';
  end if;
end;
$$;
