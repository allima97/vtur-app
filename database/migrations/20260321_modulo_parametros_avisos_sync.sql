-- 2026-03-21: adiciona módulo ParametrosAvisos em permissões e sincroniza whitelist MASTER

-- 1) Replica permissões existentes de "parametros" para "parametros_avisos" (usuários)
insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'parametros_avisos', ma.permissao, ma.ativo
from public.modulo_acesso ma
where lower(coalesce(ma.modulo, '')) = 'parametros'
  and not exists (
    select 1
    from public.modulo_acesso x
    where x.usuario_id = ma.usuario_id
      and lower(coalesce(x.modulo, '')) = 'parametros_avisos'
  );

-- 2) Replica permissões padrão por tipo de usuário
insert into public.user_type_default_perms (user_type_id, modulo, permissao, ativo)
select d.user_type_id, 'parametros_avisos', d.permissao, d.ativo
from public.user_type_default_perms d
where lower(coalesce(d.modulo, '')) = 'parametros'
  and not exists (
    select 1
    from public.user_type_default_perms x
    where x.user_type_id = d.user_type_id
      and lower(coalesce(x.modulo, '')) = 'parametros_avisos'
  );

-- 3) Atualiza whitelist que MASTER pode gerenciar
create or replace function public.is_master_allowed_module(modulo text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(coalesce(modulo, '')) in (
    -- chaves tecnicas
    'dashboard',
    'vendas_consulta',
    'vendas_importar',
    'orcamentos',
    'clientes',
    'consultoria_online',

    'cadastros',
    'cadastros_paises',
    'cadastros_estados',
    'cadastros_cidades',
    'cadastros_destinos',
    'cadastros_produtos',
    'circuitos',
    'cadastros_lote',
    'cadastros_fornecedores',

    'relatorios',
    'relatorios_vendas',
    'relatorios_destinos',
    'relatorios_produtos',
    'relatorios_clientes',
    'relatorios_ranking_vendas',

    'parametros',
    'parametros_tipo_produtos',
    'parametros_tipo_pacotes',
    'parametros_metas',
    'parametros_regras_comissao',
    'parametros_avisos',
    'parametros_equipe',
    'parametros_escalas',
    'parametros_cambios',
    'parametros_orcamentos',
    'parametros_formas_pagamento',

    'operacao',
    'operacao_agenda',
    'operacao_todo',
    'operacao_chat',
    'operacao_viagens',
    'operacao_controle_sac',
    'operacao_preferencias',
    'operacao_documentos_viagens',
    'operacao_campanhas',
    'operacao_conciliacao',

    'comissionamento',

    -- labels legados (compatibilidade)
    'vendas',
    'consultoria online',
    'paises',
    'subdivisoes',
    'cidades',
    'destinos',
    'produtos',
    'produtoslote',
    'fornecedores',
    'relatoriovendas',
    'relatoriodestinos',
    'relatorioprodutos',
    'relatorioclientes',
    'tipoprodutos',
    'tipopacotes',
    'metas',
    'regrascomissao',
    'parametrosavisos',
    'equipe',
    'escalas',
    'cambios',
    'orcamentos (pdf)',
    'formas de pagamento',
    'agenda',
    'todo',
    'chat',
    'viagens',
    'controle de sac',
    'campanhas',
    'conciliação',
    'conciliacao',
    'ranking de vendas',
    'importar contratos',
    'minhas preferências',
    'minhas preferencias',
    'documentos viagens',
    'documentos_viagens'
  );
$$;
