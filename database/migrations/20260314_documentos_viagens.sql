-- 2026-03-14: Documentos Viagens (repositório de documentos por empresa) + Storage bucket

create extension if not exists "pgcrypto";

create table if not exists public.documentos_viagens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,

  file_name text not null,
  display_name text,

  storage_bucket text not null default 'viagens-documentos',
  storage_path text not null,

  mime_type text,
  size_bytes bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.users(id) on delete set null
);

create index if not exists idx_documentos_viagens_company_created
  on public.documentos_viagens(company_id, created_at desc);
create index if not exists idx_documentos_viagens_uploader
  on public.documentos_viagens(uploaded_by, created_at desc);
create unique index if not exists uq_documentos_viagens_storage
  on public.documentos_viagens(storage_bucket, storage_path);

alter table public.documentos_viagens enable row level security;

drop policy if exists "documentos_viagens_select" on public.documentos_viagens;
create policy "documentos_viagens_select" on public.documentos_viagens
  for select using (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists "documentos_viagens_insert" on public.documentos_viagens;
create policy "documentos_viagens_insert" on public.documentos_viagens
  for insert with check (
    auth.uid() is not null
    and uploaded_by = auth.uid()
    and company_id = public.current_company_id()
  );

drop policy if exists "documentos_viagens_update" on public.documentos_viagens;
create policy "documentos_viagens_update" on public.documentos_viagens
  for update using (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      and (uploaded_by = auth.uid())
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      and updated_by = auth.uid()
      and (uploaded_by = auth.uid())
    )
  );

drop policy if exists "documentos_viagens_delete" on public.documentos_viagens;
create policy "documentos_viagens_delete" on public.documentos_viagens
  for delete using (
    is_admin(auth.uid())
    or (
      company_id = public.current_company_id()
      and uploaded_by = auth.uid()
    )
  );

-- Storage bucket privado para documentos da empresa
insert into storage.buckets (id, name, public)
select 'viagens-documentos', 'viagens-documentos', false
where not exists (
  select 1 from storage.buckets where id = 'viagens-documentos'
);

-- Policies para storage.objects (leitura por company via metadata em public.documentos_viagens)
drop policy if exists "viagens_documentos_storage_read" on storage.objects;
create policy "viagens_documentos_storage_read" on storage.objects
  for select using (
    bucket_id = 'viagens-documentos'
    and auth.uid() is not null
    and exists (
      select 1
      from public.documentos_viagens d
      where d.storage_bucket = 'viagens-documentos'
        and d.storage_path = name
        and (
          is_admin(auth.uid())
          or d.company_id = public.current_company_id()
          or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), d.company_id))
        )
    )
  );

-- Upload: o dono do objeto é quem está autenticado (o restante é controlado via metadata + políticas acima)
drop policy if exists "viagens_documentos_storage_insert" on storage.objects;
create policy "viagens_documentos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'viagens-documentos'
    and auth.uid() = owner
  );

drop policy if exists "viagens_documentos_storage_delete" on storage.objects;
create policy "viagens_documentos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'viagens-documentos'
    and (
      auth.uid() = owner
      or is_admin(auth.uid())
      or exists (
        select 1
        from public.documentos_viagens d
        where d.storage_bucket = 'viagens-documentos'
          and d.storage_path = name
          and (
            is_admin(auth.uid())
            or d.company_id = public.current_company_id()
            or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), d.company_id))
          )
      )
    )
  );
