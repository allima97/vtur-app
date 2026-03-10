# Checklist de Adocao Primer no VTUR

Atualizado em 2026-03-10.

Objetivo: aplicar `@primer/react` em toda a experiencia do `vtur`, usando wrappers internos para preservar identidade visual, reduzir inconsistencias e manter um caminho de migracao controlado.

## Fundacao compartilhada

- [x] `ThemeProvider`, `BaseStyles` e escopo global do Primer
- [x] `AppPrimerProvider`
- [x] `AppButton`
- [x] `AppField`
- [x] `AppCard`
- [x] `AppDialog`
- [x] `AppToolbar`
- [x] `AlertMessage`
- [x] `DataTable`
- [x] `EmptyState`
- [x] `ConfirmDialog`
- [x] `MenuIsland`
- [x] `HeaderPage`
- [x] correcoes SSR do Primer em `astro.config.mjs`

## Vendedor

- [x] `DashboardGeralIsland`
- [x] `VendasConsultaIsland`
- [x] `VendasCadastroIsland`
- [x] `VendaContratoImportIsland`
- [x] `ClientesConsultaIsland`
- [x] `ClientesIsland`
- [x] `QuoteManualIsland`
- [x] `QuoteImportIsland`
- [x] `QuoteDetailIsland`
- [x] `QuoteListIsland`
- [x] `ComissionamentoIsland`
- [ ] `MetasVendedorIsland`
- [x] `AuthLoginIsland`
- [x] `AuthRecoverIsland`
- [x] `AuthRegisterIsland`
- [x] `AuthResetIsland`
- [x] `PerfilIsland`
- [x] `MinhasPreferenciasIsland`

## Gestor e Master

- [x] `DashboardGestorIsland`
- [x] `EquipeGestorIsland`
- [x] `EscalaGestorIsland`
- [x] `MasterUsuariosIsland`
- [x] `MasterEmpresasIsland`
- [x] `MasterPermissoesIsland`
- [x] `MinhaEscalaIsland`
- [x] `RankingVendasIsland`
- [x] `FechamentoComissaoIsland`

## Admin

- [x] `DashboardAdminIsland`
- [x] `AdminPermissoesIsland`
- [x] `PermissoesAdminIsland`
- [ ] `UsuariosAdminIsland`
- [x] `EmailSettingsAdminIsland`
- [ ] `EmpresasAdminIsland`
- [x] `PlanosAdminIsland`
- [x] `CommissionTemplatesIsland`
- [x] `CommissionRulesIsland`
- [x] `AdminUserTypesIsland`
- [x] `AvisosAdminIsland`
- [ ] `FinanceiroAdminIsland`
- [x] `LogsIsland`
- [x] `PerformanceDashboardIsland`
- [x] `DocumentationIsland`
- [x] `DocumentationPortalIsland`

## Cadastros

- [x] `PaisesIsland`
- [x] `EstadosIsland`
- [x] `CidadesIsland`
- [x] `DestinosIsland`
- [x] `ProdutosIsland`
- [x] `CircuitosIsland`
- [ ] `ProdutosLoteIsland`
- [x] `FornecedoresIsland`

## Parametros

- [x] `FormasPagamentoIsland`
- [x] `TipoProdutosIsland`
- [x] `TipoPacotesIsland`
- [x] `CommissionRulesIsland`
- [x] `CommissionTemplatesIsland`
- [ ] `ParametrosCambiosIsland`
- [ ] `ParametrosAvisosIsland`
- [x] `ParametrosNaoComissionaveisIsland`
- [x] `ParametrosSistemaIsland`
- [x] `QuotePrintSettingsIsland`
- [x] `AdminUserTypesIsland`

## Relatorios

- [x] `RelatorioVendasIsland`
- [x] `RelatorioAgrupadoProdutoIsland`
- [x] `RelatorioAgrupadoDestinoIsland`
- [x] `RelatorioAgrupadoClienteIsland`
- [x] `RankingVendasIsland`

## Operacao e CRM

- [x] `ConsultoriaOnlineIsland`
- [ ] `AgendaCalendar`
- [x] `TodoBoard`
- [ ] `MuralRecadosIsland`
- [ ] `ControleSacIsland`
- [x] `CampanhasIsland`
- [x] `ConciliacaoIsland`
- [ ] `DocumentosViagensIsland`
- [ ] `DossieViagemIsland`
- [ ] `ViagensListaIsland`
- [x] `AniversariantesColaboradoresIsland`
- [x] `PushNotificationsIsland`
- [x] `ConsultoriaLembretesModalIsland`
- [x] `StreamChatIsland`

## Infra e suporte

- [x] `HelpDrawerIsland`
- [x] `NetMetricsPanelIsland`
- [x] `LogoutButtonIsland`
- [x] `MaintenanceAccessIsland`
- [x] `DashboardRouterIsland`
- [ ] `PermissoesProvider`
- [x] `PersonalizarMenuIsland`

## Criterios de conclusao por modulo

- [ ] toolbar principal em `AppToolbar`
- [ ] cards estruturais em `AppCard`
- [ ] campos em `AppField` ou componentes Primer equivalentes
- [ ] botoes em `AppButton`
- [ ] tabelas em `DataTable`
- [ ] vazios em `EmptyState`
- [ ] feedbacks em `AlertMessage`
- [ ] modais/dialogos em `Dialog` ou `AppDialog`
- [ ] estados de acesso/carregamento padronizados
- [ ] responsividade revisada
- [x] `npm run build` validado apos a rodada

## Ordem de fechamento recomendada

1. Dashboards por perfil
2. Admin legado
3. Operacao legado
4. Parametros e perfil
5. Auth e componentes utilitarios
