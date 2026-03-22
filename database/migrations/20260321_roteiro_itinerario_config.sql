alter table public.roteiro_personalizado
  add column if not exists itinerario_config jsonb not null default '{"traslados":[]}'::jsonb;
