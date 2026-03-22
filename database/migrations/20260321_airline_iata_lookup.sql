-- Tabela de referência de companhias aéreas e códigos IATA
-- Base para resolver automaticamente "Cia Aérea" no orçamento/PDF

create table if not exists public.airline_iata_codes (
  id uuid primary key default gen_random_uuid(),
  iata_code text not null unique,
  airline_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airline_iata_codes_iata_format check (iata_code ~ '^[A-Z0-9]{2}$')
);

create table if not exists public.airline_iata_aliases (
  id uuid primary key default gen_random_uuid(),
  airline_code_id uuid not null references public.airline_iata_codes(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (airline_code_id, alias)
);

create index if not exists airline_iata_aliases_alias_idx
  on public.airline_iata_aliases (alias);

alter table public.airline_iata_codes enable row level security;
alter table public.airline_iata_aliases enable row level security;

drop policy if exists airline_iata_codes_select on public.airline_iata_codes;
create policy airline_iata_codes_select
  on public.airline_iata_codes
  for select
  using (auth.role() in ('authenticated', 'service_role'));

drop policy if exists airline_iata_aliases_select on public.airline_iata_aliases;
create policy airline_iata_aliases_select
  on public.airline_iata_aliases
  for select
  using (auth.role() in ('authenticated', 'service_role'));

grant select on public.airline_iata_codes to authenticated;
grant select on public.airline_iata_aliases to authenticated;

-- Seed inicial (cias mais usadas no contexto atual do sistema)
insert into public.airline_iata_codes (iata_code, airline_name, active)
values
  ('LA', 'LATAM Airlines', true),
  ('AR', 'Aerolíneas Argentinas', true),
  ('TK', 'Turkish Airlines', true),
  ('H2', 'Sky Airline', true),
  ('G3', 'GOL Linhas Aéreas', true),
  ('AD', 'Azul Linhas Aéreas', true),
  ('AA', 'American Airlines', true),
  ('DL', 'Delta Air Lines', true),
  ('UA', 'United Airlines', true),
  ('AF', 'Air France', true),
  ('KL', 'KLM', true),
  ('IB', 'Iberia', true),
  ('LH', 'Lufthansa', true),
  ('UX', 'Air Europa', true),
  ('AV', 'Avianca', true),
  ('CM', 'Copa Airlines', true),
  ('AC', 'Air Canada', true),
  ('EK', 'Emirates', true),
  ('QR', 'Qatar Airways', true),
  ('ET', 'Ethiopian Airlines', true)
on conflict (iata_code) do update
set
  airline_name = excluded.airline_name,
  active = excluded.active,
  updated_at = now();

with alias_data(iata_code, alias) as (
  values
    ('LA', 'LATAM'),
    ('LA', 'LATAM Airlines'),
    ('LA', 'LATAM Airlines Brasil'),
    ('AR', 'Aerolíneas Argentinas'),
    ('AR', 'Aerolineas Argentinas'),
    ('AR', 'Aerolineas'),
    ('TK', 'Turkish'),
    ('TK', 'Turkish Airlines'),
    ('H2', 'Sky'),
    ('H2', 'Sky Airline'),
    ('G3', 'GOL'),
    ('G3', 'GOL Linhas Aéreas'),
    ('AD', 'Azul'),
    ('AD', 'Azul Linhas Aéreas'),
    ('AA', 'American Airlines'),
    ('DL', 'Delta'),
    ('DL', 'Delta Air Lines'),
    ('UA', 'United'),
    ('UA', 'United Airlines'),
    ('AF', 'Air France'),
    ('KL', 'KLM'),
    ('IB', 'Iberia'),
    ('LH', 'Lufthansa'),
    ('UX', 'Air Europa'),
    ('AV', 'Avianca'),
    ('CM', 'Copa'),
    ('CM', 'Copa Airlines'),
    ('AC', 'Air Canada'),
    ('EK', 'Emirates'),
    ('QR', 'Qatar'),
    ('QR', 'Qatar Airways'),
    ('ET', 'Ethiopian'),
    ('ET', 'Ethiopian Airlines')
)
insert into public.airline_iata_aliases (airline_code_id, alias)
select c.id, a.alias
from alias_data a
join public.airline_iata_codes c
  on c.iata_code = a.iata_code
on conflict (airline_code_id, alias) do nothing;
