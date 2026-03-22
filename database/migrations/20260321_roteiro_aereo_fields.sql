-- 2026-03-21: expande roteiro_transporte para passagens aereas

alter table public.roteiro_transporte
  add column if not exists trecho text,
  add column if not exists cia_aerea text,
  add column if not exists data_voo date,
  add column if not exists classe_reserva text,
  add column if not exists hora_saida text,
  add column if not exists aeroporto_saida text,
  add column if not exists duracao_voo text,
  add column if not exists tipo_voo text,
  add column if not exists hora_chegada text,
  add column if not exists aeroporto_chegada text,
  add column if not exists tarifa_nome text,
  add column if not exists reembolso_tipo text,
  add column if not exists qtd_adultos integer,
  add column if not exists qtd_criancas integer,
  add column if not exists taxas numeric,
  add column if not exists valor_total numeric;
