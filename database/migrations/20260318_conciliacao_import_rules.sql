alter table public.conciliacao_recibos
  add column if not exists descricao_chave text not null default '',
  add column if not exists valor_venda_real numeric,
  add column if not exists valor_comissao_loja numeric,
  add column if not exists percentual_comissao_loja numeric,
  add column if not exists faixa_comissao text,
  add column if not exists is_seguro_viagem boolean not null default false;

update public.conciliacao_recibos
set descricao_chave = regexp_replace(upper(trim(coalesce(descricao, ''))), '\s+', ' ', 'g')
where coalesce(descricao_chave, '') = '';

update public.conciliacao_recibos
set valor_venda_real = greatest(
  0::numeric,
  coalesce(valor_lancamentos, 0::numeric)
  - coalesce(valor_taxas, 0::numeric)
  - coalesce(valor_descontos, 0::numeric)
  - coalesce(valor_abatimentos, 0::numeric)
)
where valor_venda_real is null;

update public.conciliacao_recibos
set valor_comissao_loja = coalesce(valor_saldo, 0::numeric)
where valor_comissao_loja is null;

update public.conciliacao_recibos
set percentual_comissao_loja = case
  when coalesce(valor_venda_real, 0::numeric) > 0::numeric
    then round((coalesce(valor_comissao_loja, 0::numeric) / valor_venda_real) * 100::numeric, 4)
  else null
end
where percentual_comissao_loja is null;

update public.conciliacao_recibos
set faixa_comissao = case
  when coalesce(percentual_comissao_loja, 0::numeric) between 31.5 and 35.5 then 'SEGURO_32_35'
  when coalesce(percentual_comissao_loja, 0::numeric) >= 10 then 'MAIOR_OU_IGUAL_10'
  when coalesce(percentual_comissao_loja, 0::numeric) > 0 then 'MENOR_10'
  else 'SEM_COMISSAO'
end
where faixa_comissao is null;

update public.conciliacao_recibos
set is_seguro_viagem = faixa_comissao = 'SEGURO_32_35'
where is_seguro_viagem is distinct from (faixa_comissao = 'SEGURO_32_35');

drop index if exists conciliacao_recibos_company_documento_uidx;

create unique index if not exists conciliacao_recibos_company_mov_doc_desc_uidx
  on public.conciliacao_recibos(company_id, movimento_data, documento, descricao_chave);

create index if not exists conciliacao_recibos_company_doc_idx
  on public.conciliacao_recibos(company_id, documento, movimento_data desc);

alter table public.parametros_comissao
  add column if not exists conciliacao_sobrepoe_vendas boolean not null default false;
