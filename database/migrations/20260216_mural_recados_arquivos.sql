-- 2026-02-16: Anexos no Mural de Recados (imagens/arquivos) + Storage bucket

create extension if not exists "pgcrypto";

create table if not exists public.mural_recados_arquivos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recado_id uuid not null references public.mural_recados(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  file_name text not null,
  storage_bucket text not null default 'mural-recados',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_mural_recados_arquivos_recado
  on public.mural_recados_arquivos(recado_id);
create index if not exists idx_mural_recados_arquivos_company_created
  on public.mural_recados_arquivos(company_id, created_at desc);

alter table public.mural_recados_arquivos enable row level security;

drop policy if exists "mural_recados_arquivos_select" on public.mural_recados_arquivos;
create policy "mural_recados_arquivos_select" on public.mural_recados_arquivos
  for select using (
    exists (
      select 1
      from public.mural_recados r
      where r.id = mural_recados_arquivos.recado_id
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

drop policy if exists "mural_recados_arquivos_insert" on public.mural_recados_arquivos;
create policy "mural_recados_arquivos_insert" on public.mural_recados_arquivos
  for insert with check (
    auth.uid() is not null
    and uploaded_by = auth.uid()
    and exists (
      select 1
      from public.mural_recados r
      where r.id = mural_recados_arquivos.recado_id
        and r.sender_id = auth.uid()
        and r.company_id = mural_recados_arquivos.company_id
        and (
          is_admin(auth.uid())
          or r.company_id = public.current_company_id()
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
        )
    )
  );

drop policy if exists "mural_recados_arquivos_delete" on public.mural_recados_arquivos;
create policy "mural_recados_arquivos_delete" on public.mural_recados_arquivos
  for delete using (
    exists (
      select 1
      from public.mural_recados r
      where r.id = mural_recados_arquivos.recado_id
        and (
          is_admin(auth.uid())
          or (
            r.receiver_id is null
            and r.sender_id = auth.uid()
            and (
              r.company_id = public.current_company_id()
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
            )
          )
          or (
            r.receiver_id = auth.uid()
            and (
              r.company_id = public.current_company_id()
              or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
            )
          )
        )
    )
  );

-- Realtime (Postgres Changes) - anexos
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.mural_recados_arquivos;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

-- Storage bucket para anexos do mural
insert into storage.buckets (id, name, public)
values ('mural-recados', 'mural-recados', true)
on conflict (id) do update set public = true;

-- Policies (storage.objects) - upload e remoção (limpeza ao apagar recado)
drop policy if exists "mural_recados_storage_insert" on storage.objects;
create policy "mural_recados_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'mural-recados'
    and auth.uid() = owner
  );

drop policy if exists "mural_recados_storage_delete" on storage.objects;
create policy "mural_recados_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'mural-recados'
    and (
      auth.uid() = owner
      or is_admin(auth.uid())
      or exists (
        select 1
        from public.mural_recados_arquivos a
        join public.mural_recados r on r.id = a.recado_id
        where a.storage_bucket = 'mural-recados'
          and a.storage_path = name
          and (
            is_admin(auth.uid())
            or (
              r.receiver_id is null
              and r.sender_id = auth.uid()
              and (
                r.company_id = public.current_company_id()
                or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
              )
            )
            or (
              r.receiver_id = auth.uid()
              and (
                r.company_id = public.current_company_id()
                or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), r.company_id))
              )
            )
          )
      )
    )
  );

