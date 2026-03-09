-- 2026-03-08: normaliza modulo_acesso.modulo para chaves tecnicas
-- Evita conflito de RLS que valida modulos por chave tecnica.

-- 1) Mapeamento legado -> chave tecnica
with modulo_map as (
  select
    id,
    usuario_id,
    modulo,
    permissao,
    ativo,
    case lower(coalesce(modulo, ''))
      when 'vendas' then 'vendas_consulta'
      when 'consultoria online' then 'consultoria_online'
      when 'paises' then 'cadastros_paises'
      when 'subdivisoes' then 'cadastros_estados'
      when 'cidades' then 'cadastros_cidades'
      when 'destinos' then 'cadastros_destinos'
      when 'produtos' then 'cadastros_produtos'
      when 'produtoslote' then 'cadastros_lote'
      when 'fornecedores' then 'cadastros_fornecedores'
      when 'relatoriovendas' then 'relatorios_vendas'
      when 'relatoriodestinos' then 'relatorios_destinos'
      when 'relatorioprodutos' then 'relatorios_produtos'
      when 'relatorioclientes' then 'relatorios_clientes'
      when 'tipoprodutos' then 'parametros_tipo_produtos'
      when 'tipopacotes' then 'parametros_tipo_pacotes'
      when 'metas' then 'parametros_metas'
      when 'regrascomissao' then 'parametros_regras_comissao'
      when 'equipe' then 'parametros_equipe'
      when 'escalas' then 'parametros_escalas'
      when 'cambios' then 'parametros_cambios'
      when 'orcamentos (pdf)' then 'parametros_orcamentos'
      when 'formas de pagamento' then 'parametros_formas_pagamento'
      when 'agenda' then 'operacao_agenda'
      when 'todo' then 'operacao_todo'
      when 'chat' then 'operacao_chat'
      when 'viagens' then 'operacao_viagens'
      when 'controle de sac' then 'operacao_controle_sac'
      when 'ranking de vendas' then 'relatorios_ranking_vendas'
      when 'importar contratos' then 'vendas_importar'
      else modulo
    end as target_modulo
  from public.modulo_acesso
),
duplicados_para_mesclar as (
  select
    old_row.id as old_id,
    target_row.id as target_id,
    -- nivel final de permissao (maior entre target e old)
    case
      when greatest(
        case lower(coalesce(target_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end,
        case lower(coalesce(old_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end
      ) = 5 then 'admin'
      when greatest(
        case lower(coalesce(target_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end,
        case lower(coalesce(old_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end
      ) = 4 then 'delete'
      when greatest(
        case lower(coalesce(target_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end,
        case lower(coalesce(old_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end
      ) = 3 then 'edit'
      when greatest(
        case lower(coalesce(target_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end,
        case lower(coalesce(old_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end
      ) = 2 then 'create'
      when greatest(
        case lower(coalesce(target_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end,
        case lower(coalesce(old_row.permissao, 'none'))
          when 'admin' then 5
          when 'delete' then 4
          when 'edit' then 3
          when 'create' then 2
          when 'view' then 1
          else 0
        end
      ) = 1 then 'view'
      else 'none'
    end as permissao_final,
    (coalesce(target_row.ativo, false) or coalesce(old_row.ativo, false)) as ativo_final
  from modulo_map old_row
  join public.modulo_acesso target_row
    on target_row.usuario_id = old_row.usuario_id
   and lower(coalesce(target_row.modulo, '')) = lower(coalesce(old_row.target_modulo, ''))
  where lower(coalesce(old_row.modulo, '')) <> lower(coalesce(old_row.target_modulo, ''))
)
-- 2) Atualiza registro alvo com a melhor permissao/ativo
update public.modulo_acesso t
set permissao = d.permissao_final,
    ativo = d.ativo_final
from duplicados_para_mesclar d
where t.id = d.target_id;

-- 3) Remove registro legado que conflitaria na renomeacao
with modulo_map as (
  select
    id,
    usuario_id,
    modulo,
    case lower(coalesce(modulo, ''))
      when 'vendas' then 'vendas_consulta'
      when 'consultoria online' then 'consultoria_online'
      when 'paises' then 'cadastros_paises'
      when 'subdivisoes' then 'cadastros_estados'
      when 'cidades' then 'cadastros_cidades'
      when 'destinos' then 'cadastros_destinos'
      when 'produtos' then 'cadastros_produtos'
      when 'produtoslote' then 'cadastros_lote'
      when 'fornecedores' then 'cadastros_fornecedores'
      when 'relatoriovendas' then 'relatorios_vendas'
      when 'relatoriodestinos' then 'relatorios_destinos'
      when 'relatorioprodutos' then 'relatorios_produtos'
      when 'relatorioclientes' then 'relatorios_clientes'
      when 'tipoprodutos' then 'parametros_tipo_produtos'
      when 'tipopacotes' then 'parametros_tipo_pacotes'
      when 'metas' then 'parametros_metas'
      when 'regrascomissao' then 'parametros_regras_comissao'
      when 'equipe' then 'parametros_equipe'
      when 'escalas' then 'parametros_escalas'
      when 'cambios' then 'parametros_cambios'
      when 'orcamentos (pdf)' then 'parametros_orcamentos'
      when 'formas de pagamento' then 'parametros_formas_pagamento'
      when 'agenda' then 'operacao_agenda'
      when 'todo' then 'operacao_todo'
      when 'chat' then 'operacao_chat'
      when 'viagens' then 'operacao_viagens'
      when 'controle de sac' then 'operacao_controle_sac'
      when 'ranking de vendas' then 'relatorios_ranking_vendas'
      when 'importar contratos' then 'vendas_importar'
      else modulo
    end as target_modulo
  from public.modulo_acesso
),
old_rows_conflitantes as (
  select old_row.id
  from modulo_map old_row
  join public.modulo_acesso target_row
    on target_row.usuario_id = old_row.usuario_id
   and lower(coalesce(target_row.modulo, '')) = lower(coalesce(old_row.target_modulo, ''))
  where lower(coalesce(old_row.modulo, '')) <> lower(coalesce(old_row.target_modulo, ''))
)
delete from public.modulo_acesso
where id in (select id from old_rows_conflitantes);

-- 4) Renomeia restantes sem conflito
update public.modulo_acesso
set modulo = case lower(coalesce(modulo, ''))
  when 'vendas' then 'vendas_consulta'
  when 'consultoria online' then 'consultoria_online'
  when 'paises' then 'cadastros_paises'
  when 'subdivisoes' then 'cadastros_estados'
  when 'cidades' then 'cadastros_cidades'
  when 'destinos' then 'cadastros_destinos'
  when 'produtos' then 'cadastros_produtos'
  when 'produtoslote' then 'cadastros_lote'
  when 'fornecedores' then 'cadastros_fornecedores'
  when 'relatoriovendas' then 'relatorios_vendas'
  when 'relatoriodestinos' then 'relatorios_destinos'
  when 'relatorioprodutos' then 'relatorios_produtos'
  when 'relatorioclientes' then 'relatorios_clientes'
  when 'tipoprodutos' then 'parametros_tipo_produtos'
  when 'tipopacotes' then 'parametros_tipo_pacotes'
  when 'metas' then 'parametros_metas'
  when 'regrascomissao' then 'parametros_regras_comissao'
  when 'equipe' then 'parametros_equipe'
  when 'escalas' then 'parametros_escalas'
  when 'cambios' then 'parametros_cambios'
  when 'orcamentos (pdf)' then 'parametros_orcamentos'
  when 'formas de pagamento' then 'parametros_formas_pagamento'
  when 'agenda' then 'operacao_agenda'
  when 'todo' then 'operacao_todo'
  when 'chat' then 'operacao_chat'
  when 'viagens' then 'operacao_viagens'
  when 'controle de sac' then 'operacao_controle_sac'
  when 'ranking de vendas' then 'relatorios_ranking_vendas'
  when 'importar contratos' then 'vendas_importar'
  else modulo
end
where lower(coalesce(modulo, '')) in (
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
  'importar contratos'
);
