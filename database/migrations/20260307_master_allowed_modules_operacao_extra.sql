-- 2026-03-07: inclui Agenda, Todo e Chat na lista de modulos permitidos ao MASTER

create or replace function public.is_master_allowed_module(modulo text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(coalesce(modulo, '')) in (
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
    'parametros',
    'parametros_tipo_produtos',
    'parametros_metas',
    'parametros_regras_comissao',
    'parametros_formas_pagamento',
    'operacao',
    'operacao_agenda',
    'operacao_todo',
    'operacao_chat',
    'operacao_viagens',
    'operacao_controle_sac',
    'comissionamento',
    'relatorios_ranking_vendas'
  );
$$;

