-- 2026-02-16: Campanhas (CRUD) + RLS por empresa

create extension if not exists "pgcrypto";

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  titulo text not null,
  imagem_url text,
  imagem_path text,
  link_url text,
  link_instagram text,
  link_facebook text,
  data_campanha date not null,
  validade_ate date,
  regras text,
  status text not null default 'ativa',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campanhas_status_chk check (status in ('ativa', 'inativa', 'cancelada'))
);

create index if not exists idx_campanhas_company_id on public.campanhas (company_id);
create index if not exists idx_campanhas_data on public.campanhas (data_campanha desc);
create index if not exists idx_campanhas_status on public.campanhas (status);

alter table public.campanhas enable row level security;

drop policy if exists campanhas_select on public.campanhas;
create policy campanhas_select on public.campanhas
  for select using (
    company_id = public.current_company_id()
    or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
  );

drop policy if exists campanhas_insert on public.campanhas;
create policy campanhas_insert on public.campanhas
  for insert with check (
    (is_gestor(auth.uid()) or is_master(auth.uid()))
    and created_by = auth.uid()
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists campanhas_update on public.campanhas;
create policy campanhas_update on public.campanhas
  for update using (
    (is_gestor(auth.uid()) or is_master(auth.uid()))
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  ) with check (
    (is_gestor(auth.uid()) or is_master(auth.uid()))
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop policy if exists campanhas_delete on public.campanhas;
create policy campanhas_delete on public.campanhas
  for delete using (
    (is_gestor(auth.uid()) or is_master(auth.uid()))
    and (
      company_id = public.current_company_id()
      or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
    )
  );

drop trigger if exists trg_campanhas_updated_at on public.campanhas;
create trigger trg_campanhas_updated_at
before update on public.campanhas
for each row execute function public.set_updated_at();

-- Storage bucket (imagens de campanhas)
insert into storage.buckets (id, name, public)
values ('campanhas', 'campanhas', true)
on conflict (id) do update set public = true;

drop policy if exists "campanhas_storage_insert" on storage.objects;
create policy "campanhas_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'campanhas'
    and auth.uid() = owner
    and (is_gestor(auth.uid()) or is_master(auth.uid()))
  );

drop policy if exists "campanhas_storage_delete" on storage.objects;
create policy "campanhas_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'campanhas'
    and (
      auth.uid() = owner
      or exists (
        select 1
        from public.campanhas c
        where c.imagem_path = name
          and (
            is_gestor(auth.uid())
            or is_master(auth.uid())
          )
          and (
            c.company_id = public.current_company_id()
            or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), c.company_id))
          )
      )
    )
  );
