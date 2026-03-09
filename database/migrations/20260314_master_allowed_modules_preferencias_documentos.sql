-- 2026-03-14: inclui Minhas Preferências e Documentos Viagens no whitelist de módulos que o MASTER pode gerenciar

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

    -- novos módulos
    'operacao_preferencias',
    'operacao_documentos_viagens',

    'comissionamento',

    -- labels legados (compatibilidade temporaria)
    'vendas',
    'orcamentos',
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
    'ranking de vendas',
    'importar contratos',

    -- labels dos novos módulos
    'minhas preferências',
    'minhas preferencias',
    'documentos viagens',
    'documentos_viagens'
  );
$$;
