-- 2026-02-17: índices extras para performance (BFF + RLS)
-- Objetivo: acelerar filtros mais usados em vendas/agenda/permissoes.

do $$
begin
  if to_regclass('public.vendas') is not null then
    -- consultas por company + período (dashboard/vendas)
    execute 'create index if not exists idx_vendas_company_data_venda_desc on public.vendas (company_id, data_venda desc)';
    -- consultas por vendedor + período (vendedor/gestor)
    execute 'create index if not exists idx_vendas_vendedor_data_venda_desc on public.vendas (vendedor_id, data_venda desc)';
    -- consultas por company + vendedor + período (vendas/list com escopo)
    execute 'create index if not exists idx_vendas_company_vendedor_data_venda_desc on public.vendas (company_id, vendedor_id, data_venda desc)';
  end if;

  if to_regclass('public.vendas_recibos') is not null then
    -- embeds (vendas -> recibos) e importações
    execute 'create index if not exists idx_vendas_recibos_venda_id on public.vendas_recibos (venda_id)';
    execute 'create index if not exists idx_vendas_recibos_numero_recibo on public.vendas_recibos (numero_recibo) where numero_recibo is not null';
    execute 'create index if not exists idx_vendas_recibos_numero_reserva on public.vendas_recibos (numero_reserva) where numero_reserva is not null';
  end if;

  if to_regclass('public.agenda_itens') is not null then
    -- range (agenda) e listagem (todo) - sempre filtradas por user_id via RLS
    execute 'create index if not exists idx_agenda_itens_user_tipo_start on public.agenda_itens (user_id, tipo, start_date)';
    execute 'create index if not exists idx_agenda_itens_user_tipo_created on public.agenda_itens (user_id, tipo, created_at)';
    execute 'create index if not exists idx_agenda_itens_end_date on public.agenda_itens (end_date)';
  end if;

  if to_regclass('public.todo_categorias') is not null then
    -- board de tarefas: categorias por usuário, ordenação por nome
    execute 'create index if not exists idx_todo_categorias_user_nome on public.todo_categorias (user_id, nome)';
  end if;

  if to_regclass('public.users') is not null then
    -- escopo por empresa (equipes/relatórios)
    execute 'create index if not exists idx_users_company_id on public.users (company_id) where company_id is not null';
  end if;

  if to_regclass('public.dashboard_widgets') is not null then
    execute 'create index if not exists idx_dashboard_widgets_usuario_ordem on public.dashboard_widgets (usuario_id, ordem)';
  end if;

  if to_regclass('public.modulo_acesso') is not null then
    -- permissões são consultadas por usuario+modulo e quase sempre com ativo=true
    execute 'create index if not exists idx_modulo_acesso_usuario_modulo_ativo on public.modulo_acesso (usuario_id, modulo) where ativo';
  end if;
end $$;
