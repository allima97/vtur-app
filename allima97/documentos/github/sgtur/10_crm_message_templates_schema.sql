-- Opcional: estrutura "CRM" conforme especificação da biblioteca master-card-v1.
-- Este schema não é usado pelo módulo atual de Avisos (que usa user_message_templates).

create extension if not exists pgcrypto;

create table if not exists public.crm_message_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  description text,
  subject_type text not null default 'cliente',
  message_template text not null,
  theme_key text not null,
  layout_key text not null default 'master-card-v1',
  logo_position text not null default 'bottom-right',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_message_templates_layout_master_check check (layout_key = 'master-card-v1'),
  constraint crm_message_templates_logo_position_check check (logo_position = 'bottom-right')
);

create index if not exists idx_crm_message_templates_category
  on public.crm_message_templates(category);

create index if not exists idx_crm_message_templates_active
  on public.crm_message_templates(is_active);
