-- 2026-02-19: ajustes finos de indices (P2)
-- Objetivo: acelerar filtros frequentes em dashboard/agenda.

do $$
begin
  if to_regclass('public.vendas') is not null then
    -- dashboard/rpc filtra cancelada = false com company_id + data_venda
    execute 'create index if not exists idx_vendas_company_data_venda_active on public.vendas (company_id, data_venda desc) where cancelada = false';
  end if;

  if to_regclass('public.agenda_itens') is not null then
    -- overlap usa end_date + user/tipo (agenda range)
    execute 'create index if not exists idx_agenda_itens_user_tipo_end on public.agenda_itens (user_id, tipo, end_date)';
  end if;
end $$;
