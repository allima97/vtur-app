-- 2026-03-04: documentos de validação do Master (admin)

create table if not exists public.master_documents (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.users(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  doc_type text not null,
  file_name text not null,
  storage_bucket text not null default 'master-docs',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists master_documents_master_id_idx on public.master_documents(master_id);

alter table public.master_documents enable row level security;

drop policy if exists "master_documents_admin" on public.master_documents;
create policy "master_documents_admin" on public.master_documents
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Bucket privado para documentos do master
insert into storage.buckets (id, name, public)
select 'master-docs', 'master-docs', false
where not exists (
  select 1 from storage.buckets where id = 'master-docs'
);

grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;
