-- 2026-03-21: expande roteiro_hotel para importacao estruturada de hoteis

alter table public.roteiro_hotel
  add column if not exists endereco text,
  add column if not exists qtd_apto integer,
  add column if not exists tipo_tarifa text,
  add column if not exists qtd_adultos integer,
  add column if not exists qtd_criancas integer,
  add column if not exists valor_original numeric,
  add column if not exists valor_final numeric;
