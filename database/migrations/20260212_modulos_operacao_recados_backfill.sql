-- 2026-02-12: replica permissoes para o novo modulo operacao_recados (Mural de Recados)
-- Fonte: operacao_chat (prioridade) e operacao (fallback)

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'operacao_recados', ma.permissao, ma.ativo
from public.modulo_acesso ma
where lower(ma.modulo) = 'operacao_chat'
  and not exists (
    select 1
    from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and lower(m2.modulo) = 'operacao_recados'
  )
on conflict (usuario_id, modulo) do nothing;

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'operacao_recados', ma.permissao, ma.ativo
from public.modulo_acesso ma
where lower(ma.modulo) = 'operacao'
  and not exists (
    select 1
    from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and lower(m2.modulo) = 'operacao_recados'
  )
on conflict (usuario_id, modulo) do nothing;

