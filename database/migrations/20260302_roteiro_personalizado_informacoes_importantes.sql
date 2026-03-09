-- Add per-roteiro "Informações Importantes" text

alter table public.roteiro_personalizado
  add column if not exists informacoes_importantes text;
