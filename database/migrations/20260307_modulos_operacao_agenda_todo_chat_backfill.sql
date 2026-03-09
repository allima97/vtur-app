-- 2026-03-07: replica permissoes de Operacao para Agenda/Todo/Chat

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'operacao_agenda', ma.permissao, ma.ativo
from public.modulo_acesso ma
where lower(ma.modulo) = 'operacao'
  and not exists (
    select 1
    from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and lower(m2.modulo) = 'operacao_agenda'
  )
on conflict (usuario_id, modulo) do nothing;

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'operacao_todo', ma.permissao, ma.ativo
from public.modulo_acesso ma
where lower(ma.modulo) = 'operacao'
  and not exists (
    select 1
    from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and lower(m2.modulo) = 'operacao_todo'
  )
on conflict (usuario_id, modulo) do nothing;

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'operacao_chat', ma.permissao, ma.ativo
from public.modulo_acesso ma
where lower(ma.modulo) = 'operacao'
  and not exists (
    select 1
    from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and lower(m2.modulo) = 'operacao_chat'
  )
on conflict (usuario_id, modulo) do nothing;
