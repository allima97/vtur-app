-- 2026-03-02: Templates de avisos por e-mail (admin)

create table if not exists public.admin_avisos_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  assunto text not null,
  mensagem text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_avisos_templates_nome_key
  on public.admin_avisos_templates (nome);

alter table public.admin_avisos_templates enable row level security;
drop policy if exists "admin_avisos_templates_admin_all" on public.admin_avisos_templates;
create policy "admin_avisos_templates_admin_all" on public.admin_avisos_templates
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
