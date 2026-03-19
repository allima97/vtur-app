# AGENTS.md

## Contexto Rápido
Projeto: sgtur (Astro/React + Supabase).
Objetivo atual: convites corporativos (sem e-mail do Supabase), privacidade/escopo por empresa, e migrações de RLS.
Última atualização: 2026-03-15.

## O que foi feito (resumo)
- **Controle SAC e Viagens (desktop)**: botões agora usam `mobile-stack-buttons` (desktop em linha, mobile empilha).
  - `src/components/islands/ControleSacIsland.tsx`
  - `src/components/islands/ViagensListaIsland.tsx`
  - `src/styles/global.css` (classe `.viagens-actions`)
- **Vendas**: adicionada migration para `company_id` em `vendas`, backfill e RLS.
  - `database/migrations/20260206_vendas_company_id.sql`
- **Cadastro/edição de venda**: grava `company_id` e filtra por `company_id` no update.
  - `src/components/islands/VendasCadastroIsland.tsx`
- **Consulta de vendas**: filtro por `company_id` (respeita seleção do master) aplicado no KPI, listagem e exclusão.
  - `src/components/islands/VendasConsultaIsland.tsx`
- **Convites corporativos (Master/Gestor)**: troca de "Novo usuário" por "Enviar convite" (link do Supabase + e-mail do sistema).
  - `src/pages/api/convites/send.ts` (gera link `generateLink` e envia e-mail via Resend/SendGrid/SMTP)
  - `src/pages/api/convites/accept.ts` (vincula `company_id`/`user_type_id` ao aceitar)
  - `src/pages/auth/convite.astro` + `src/components/islands/AuthConviteIsland.tsx`
  - `src/components/islands/MasterUsuariosIsland.tsx`
  - `src/components/islands/EquipeGestorIsland.tsx`
- **RLS users (self)**: impede usuário comum de alterar `company_id`/`user_type_id` no próprio perfil.
  - `database/migrations/20260311_users_self_lockdown.sql`
- **Privacidade (To Do / Agenda)**: itens e categorias visíveis apenas para o usuário criador (não expõe para a empresa).
  - `database/migrations/20260312_agenda_todo_user_privacy.sql`
- **To Do (mobile)**: tabs por status + FAB “+” (melhor leitura no celular).
  - `src/components/islands/TodoBoard.tsx`
  - `src/styles/global.css`
- **Dashboard (vendedor/gestor/master)**: tabelas empilhadas (uma abaixo da outra) + modal de personalização padronizado; botão “Personalizar” do Master corrigido no desktop.
  - `src/components/islands/DashboardGeralIsland.tsx`
  - `src/components/islands/DashboardGestorIsland.tsx`
- **Tipos de usuário + permissões padrão**: admin pode criar cargos e definir permissões padrão por tipo (aplicadas em novos usuários via trigger).
  - `database/migrations/20260312_user_types_default_perms.sql`
  - `src/pages/admin/tipos-usuario.astro` + `src/components/islands/AdminUserTypesIsland.tsx`
- **Performance (Agenda/Tarefas/Dashboard/Vendas)**: instrumentação de requests + cache/dedupe no front + BFF `/api/v1/*` com Hono + RPCs/índices.
  - `public/documentação/perfomance.md`
  - `src/lib/netMetrics.ts` + `src/components/islands/NetMetricsPanelIsland.tsx`
  - `src/lib/queryLite.ts`
  - `src/pages/api/v1/*` + `src/api/apiApp.ts` + `src/worker.ts`
  - `database/migrations/20260217_perf_indexes_bff.sql`
  - `database/migrations/20260217_rpc_vendas_kpis.sql`
  - `database/migrations/20260218_rpc_dashboard_vendas_summary.sql`
- **Importação de vendas / clientes**: nova RPC `clientes_resolve_import` para resolver/criar cliente sem depender de `insert` direto sob RLS; a API `/api/v1/clientes/resolve-import` agora tenta essa RPC antes do fallback antigo.
  - `database/migrations/20260315_clientes_resolve_import_rpc.sql`
  - `src/pages/api/v1/clientes/resolve-import.ts`

## Migrações pendentes (aplicar na ordem)
1. `database/migrations/20260205_clientes_privacidade.sql`
2. `database/migrations/20260205_clientes_created_by_backfill.sql`
3. `database/migrations/20260303_clientes_rls_company_claim_fix.sql` (hotfix claim `company_id` vazia)
4. `database/migrations/20260304_clientes_rls_recursion_hotfix.sql` (hotfix erro `42P17` / “não salva clientes”)
5. `database/migrations/20260305_clientes_shared_by_cpf_company_link.sql` (clientes únicos por CPF + escopo por empresa via `clientes_company`)
6. `database/migrations/20260306_clientes_created_by_default_trigger.sql` (garante `created_by` no insert + evita 403 RLS ao criar cliente)
7. `database/migrations/20260315_clientes_resolve_import_rpc.sql` (importação resolve/cria cliente via RPC sem depender do insert sob RLS)
8. `database/migrations/20260206_vendas_company_id.sql`
9. `database/migrations/20260211_vendas_data_venda.sql` (competência de relatórios/comissões)
10. `database/migrations/20260211_user_convites.sql` (se ainda não estiver aplicada)
11. `database/migrations/20260213_relatorios_competencia_data_venda.sql` (RPCs agregadas: usa `data_venda`)
12. `database/migrations/20260217_perf_indexes_bff.sql`
13. `database/migrations/20260217_rpc_vendas_kpis.sql`
14. `database/migrations/20260218_rpc_dashboard_vendas_summary.sql`
15. `database/migrations/20260311_user_convites_expiration.sql`
16. `database/migrations/20260311_users_self_lockdown.sql`
17. `database/migrations/20260312_agenda_todo_user_privacy.sql`
18. `database/migrations/20260312_user_types_default_perms.sql`
19. `database/migrations/20260312_rls_gestor_vendedor_master_scope.sql`
20. `database/migrations/20260312_rls_escalas_master_company_match.sql`
21. `database/migrations/20260312_rls_escala_horario_usuario_master_company_match.sql`

## Pendências conhecidas
- Confirmar e aplicar migrations no Supabase (SQL Editor ou CLI).
- Se “Clientes” não salva e der 500/`42P17`, aplicar o hotfix: `20260304_clientes_rls_recursion_hotfix.sql`.
- Se a importação de vendas exibir a mensagem para cadastrar o cliente manualmente por causa de RLS, aplicar `20260315_clientes_resolve_import_rpc.sql`.
- Validar se outras telas de relatório precisam filtrar por `company_id` no front (o RLS cobre, mas pode otimizar).
- Garantir `SUPABASE_SERVICE_ROLE_KEY` configurada no ambiente do servidor (necessário para gerar links de convite).
- Aplicar a migration de correção de RLS da tabela `gestor_vendedor` para permitir gestão de equipe no módulo Master.
- Aplicar a migration de correção de RLS das tabelas `escala_mes`/`escala_dia`/`feriados` para permitir operação do Master no contexto da company atual.
- Aplicar a migration de correção de RLS da tabela `escala_horario_usuario` para permitir salvar horários no contexto de company atual do Master.

## Observações importantes
- O erro 400 no editar/listar vendas ocorria porque `company_id` não existia em `vendas`. A migration adiciona e o front já está ajustado.
- A competência (mês) de vendas/relatórios/comissões deve ser determinada por `vendas.data_venda` (Systur). Se os relatórios agregados por cliente/destino/produto estiverem “puxando mês pelo lançamento”, aplique `20260213_relatorios_competencia_data_venda.sql`.
- Usuários corporativos devem ficar vinculados à empresa via `company_id`.
- O fluxo de convite evita o rate limit de e-mails do Supabase (o sistema envia o e-mail; o Supabase só valida o link).

## Como continuar em outra máquina
1. Abra este repositório.
2. Leia este `AGENTS.md`.
3. Siga as migrações pendentes e teste os fluxos descritos.
