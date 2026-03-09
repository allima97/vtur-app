-- Migração: Textos de inclusões do Roteiro Personalizado
-- Data: 2026-03-02

alter table public.roteiro_personalizado
  add column if not exists inclui_texto text;

alter table public.roteiro_personalizado
  add column if not exists nao_inclui_texto text;
