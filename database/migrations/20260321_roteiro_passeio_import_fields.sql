-- 2026-03-21: expande roteiro_passeio para importacao estruturada de passeios e servicos

alter table public.roteiro_passeio
  add column if not exists fornecedor text,
  add column if not exists qtd_adultos integer,
  add column if not exists qtd_criancas integer,
  add column if not exists valor_original numeric,
  add column if not exists valor_final numeric;
