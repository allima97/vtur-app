-- 2026-02-28: garante tabela consultorias_online e atualiza cache de schema

create extension if not exists pgcrypto;

create table if not exists public.consultorias_online (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid,
  cliente_nome text not null,
  data_hora timestamp with time zone not null,
  lembrete text not null default '15min',
  destino text,
  quantidade_pessoas integer not null default 1,
  orcamento_id uuid,
  taxa_consultoria numeric(12,2) not null default 0,
  notas text,
  created_by uuid not null,
  created_at timestamp with time zone not null default timezone('UTC', now()),
  updated_at timestamp with time zone not null default timezone('UTC', now()),
  constraint consultorias_online_pkey primary key (id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'clientes'
  ) then
    begin
      alter table public.consultorias_online
        add constraint consultorias_online_cliente_id_fkey
        foreign key (cliente_id) references public.clientes(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'orcamentos'
  ) then
    begin
      alter table public.consultorias_online
        add constraint consultorias_online_orcamento_id_fkey
        foreign key (orcamento_id) references public.orcamentos(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    begin
      alter table public.consultorias_online
        add constraint consultorias_online_created_by_fkey
        foreign key (created_by) references public.users(id);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

create index if not exists consultorias_online_data_hora_idx on public.consultorias_online (data_hora);

create or replace function public.set_consultoria_online_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('UTC', now());
  return new;
end;
$$;

drop trigger if exists trg_consultoria_online_updated_at on public.consultorias_online;
create trigger trg_consultoria_online_updated_at
  before update on public.consultorias_online
  for each row
  execute function public.set_consultoria_online_updated_at();

alter table public.consultorias_online enable row level security;

drop policy if exists "consultorias_online_admin" on public.consultorias_online;
create policy "consultorias_online_admin" on public.consultorias_online
  for all using (
    is_admin(auth.uid())
    or created_by = auth.uid()
  )
  with check (
    is_admin(auth.uid())
    or created_by = auth.uid()
  );

select pg_notify('pgrst', 'reload schema');
