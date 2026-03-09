-- Opcional: preencher permissões padrão para módulos granulares
-- Copia o nível do módulo pai quando o módulo filho não existe.

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'parametros_cambios', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'parametros'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'parametros_cambios'
  );

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'parametros_orcamentos', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'parametros'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'parametros_orcamentos'
  );

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'parametros_equipe', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'parametros'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'parametros_equipe'
  );

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'parametros_escalas', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'parametros'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'parametros_escalas'
  );

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'operacao_controle_sac', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'operacao'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'operacao_controle_sac'
  );

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'relatorios_ranking_vendas', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'relatorios'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'relatorios_ranking_vendas'
  );
