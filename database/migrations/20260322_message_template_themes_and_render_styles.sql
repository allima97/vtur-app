-- 2026-03-22: Artes dinâmicas para templates + estilos de render por template

create table if not exists public.user_message_template_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  categoria text not null default 'Geral',
  nome text not null,
  asset_url text not null,
  storage_path text null,
  width_px integer not null default 1080,
  height_px integer not null default 1920,
  title_style jsonb not null default '{
    "x": 540,
    "y": 760,
    "maxWidth": 860,
    "fontSize": 88,
    "color": "#0A0A0A",
    "fontFamily": "Georgia, serif",
    "align": "center",
    "lineHeight": 1.08
  }'::jsonb,
  body_style jsonb not null default '{
    "x": 540,
    "y": 1030,
    "maxWidth": 860,
    "fontSize": 52,
    "color": "#101010",
    "fontFamily": "Inter, Arial, sans-serif",
    "align": "center",
    "lineHeight": 1.2
  }'::jsonb,
  signature_style jsonb not null default '{
    "x": 760,
    "y": 1690,
    "maxWidth": 430,
    "fontSize": 58,
    "color": "#0A0A0A",
    "fontFamily": "Inter, Arial, sans-serif",
    "align": "left",
    "lineHeight": 1.1,
    "italic": true
  }'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_message_template_themes_dimension_check'
  ) then
    alter table public.user_message_template_themes
      add constraint user_message_template_themes_dimension_check
      check (width_px > 0 and height_px > 0);
  end if;
end $$;

create index if not exists user_message_template_themes_user_idx
  on public.user_message_template_themes (user_id, categoria, nome);
create index if not exists user_message_template_themes_company_idx
  on public.user_message_template_themes (company_id);

create unique index if not exists user_message_template_themes_user_nome_key
  on public.user_message_template_themes (user_id, categoria, nome);

drop trigger if exists trg_user_message_template_themes_updated_at on public.user_message_template_themes;
create trigger trg_user_message_template_themes_updated_at
before update on public.user_message_template_themes
for each row execute function public.set_updated_at();

alter table public.user_message_template_themes enable row level security;

drop policy if exists user_message_template_themes_select on public.user_message_template_themes;
create policy user_message_template_themes_select on public.user_message_template_themes
for select
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
  or (
    is_master(auth.uid())
    and company_id is not null
    and master_can_access_company(auth.uid(), company_id)
  )
);

drop policy if exists user_message_template_themes_insert on public.user_message_template_themes;
create policy user_message_template_themes_insert on public.user_message_template_themes
for insert
with check (
  is_admin(auth.uid())
  or (
    user_id = auth.uid()
    and (
      company_id is null
      or company_id = public.current_company_id()
      or (is_master(auth.uid()) and master_can_access_company(auth.uid(), company_id))
    )
  )
);

drop policy if exists user_message_template_themes_update on public.user_message_template_themes;
create policy user_message_template_themes_update on public.user_message_template_themes
for update
using (is_admin(auth.uid()) or user_id = auth.uid())
with check (
  is_admin(auth.uid())
  or (
    user_id = auth.uid()
    and (
      company_id is null
      or company_id = public.current_company_id()
      or (is_master(auth.uid()) and master_can_access_company(auth.uid(), company_id))
    )
  )
);

drop policy if exists user_message_template_themes_delete on public.user_message_template_themes;
create policy user_message_template_themes_delete on public.user_message_template_themes
for delete
using (is_admin(auth.uid()) or user_id = auth.uid());

grant select, insert, update, delete on public.user_message_template_themes to authenticated;

alter table public.user_message_templates
  add column if not exists theme_id uuid references public.user_message_template_themes(id) on delete set null,
  add column if not exists title_style jsonb not null default '{}'::jsonb,
  add column if not exists body_style jsonb not null default '{}'::jsonb,
  add column if not exists signature_style jsonb not null default '{}'::jsonb;

-- Bucket de artes
insert into storage.buckets (id, name, public)
values ('message-template-themes', 'message-template-themes', true)
on conflict (id) do update set public = true;

drop policy if exists "message_template_themes_storage_insert" on storage.objects;
create policy "message_template_themes_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'message-template-themes'
    and auth.uid() = owner
  );

drop policy if exists "message_template_themes_storage_delete" on storage.objects;
create policy "message_template_themes_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'message-template-themes'
    and (
      auth.uid() = owner
      or is_admin(auth.uid())
    )
  );

drop policy if exists "message_template_themes_storage_update" on storage.objects;
create policy "message_template_themes_storage_update" on storage.objects
  for update using (
    bucket_id = 'message-template-themes'
    and (
      auth.uid() = owner
      or is_admin(auth.uid())
    )
  )
  with check (
    bucket_id = 'message-template-themes'
    and (
      auth.uid() = owner
      or is_admin(auth.uid())
    )
  );
