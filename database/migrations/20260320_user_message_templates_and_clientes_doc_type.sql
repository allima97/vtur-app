-- 2026-03-20: Templates personalizados de avisos por usuário + suporte PF/PJ em clientes

create table if not exists public.user_message_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  nome text not null,
  categoria text null,
  assunto text null,
  titulo text not null,
  corpo text not null,
  assinatura text null,
  template_base_url text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_message_templates_user_idx
  on public.user_message_templates (user_id, nome);

create index if not exists user_message_templates_company_idx
  on public.user_message_templates (company_id);

drop trigger if exists trg_user_message_templates_updated_at on public.user_message_templates;
create trigger trg_user_message_templates_updated_at
before update on public.user_message_templates
for each row execute function public.set_updated_at();

alter table public.user_message_templates enable row level security;

drop policy if exists user_message_templates_select on public.user_message_templates;
create policy user_message_templates_select on public.user_message_templates
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

drop policy if exists user_message_templates_insert on public.user_message_templates;
create policy user_message_templates_insert on public.user_message_templates
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

drop policy if exists user_message_templates_update on public.user_message_templates;
create policy user_message_templates_update on public.user_message_templates
for update
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
)
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

drop policy if exists user_message_templates_delete on public.user_message_templates;
create policy user_message_templates_delete on public.user_message_templates
for delete
using (
  is_admin(auth.uid())
  or user_id = auth.uid()
);

grant select, insert, update, delete on public.user_message_templates to authenticated;

alter table public.clientes
  add column if not exists tipo_pessoa text;

update public.clientes
set tipo_pessoa = case
  when coalesce(length(regexp_replace(coalesce(cpf, ''), '\D', '', 'g')), 0) = 14 then 'PJ'
  else 'PF'
end
where tipo_pessoa is null;

alter table public.clientes
  alter column tipo_pessoa set default 'PF';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clientes_tipo_pessoa_check'
  ) then
    alter table public.clientes
      add constraint clientes_tipo_pessoa_check
      check (tipo_pessoa in ('PF', 'PJ'));
  end if;
end $$;
