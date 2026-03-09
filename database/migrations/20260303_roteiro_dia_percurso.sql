-- Migração: adicionar coluna "percurso" em roteiro_dia
-- Data: 2026-03-03

alter table public.roteiro_dia
  add column if not exists percurso text;
