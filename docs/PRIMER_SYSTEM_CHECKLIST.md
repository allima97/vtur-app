# Checklist de Adocao Primer no VTUR

Atualizado em 2026-03-10.

Objetivo: aplicar `@primer/react` em toda a experiencia do `vtur`, usando wrappers internos para preservar identidade visual, reduzir inconsistencias e manter um caminho de migracao controlado.

Fonte de verdade: varredura de `src/components/islands/*.tsx` buscando imports `../ui/primer/*` ou `@primer/react`.

## Status rapido (varredura 2026-03-10)

- [x] 89 islands mapeadas
- [x] 88 islands com uso de Primer
- [x] 0 islands com UI legada pendente de migracao
- [ ] 1 island sem UI (`PermissoesProvider`) - nao se aplica a migracao visual

Comando de verificacao rapida:

```bash
for f in $(rg --files src/components/islands -g '*.tsx' | sort); do
  if rg -q "ui/primer|@primer/react" "$f"; then
    echo "PRIMER|$f"
  else
    echo "LEGACY|$f"
  fi
done
```

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
- [x] `ImportarVendasIsland`
- [x] `ClientesConsultaIsland`
- [x] `ClientesIsland`
- [x] `QuoteManualIsland`
- [x] `QuoteImportIsland`
- [x] `QuoteDetailIsland`
- [x] `QuoteListIsland`
- [x] `ComissionamentoIsland`
- [x] `MetasVendedorIsland`
- [x] `AuthLoginIsland`
- [x] `AuthRecoverIsland`
- [x] `AuthRegisterIsland`
- [x] `AuthResetIsland`
- [x] `AuthConviteIsland`
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
- [x] `UsuariosAdminIsland`
- [x] `EmailSettingsAdminIsland`
- [x] `EmpresasAdminIsland`
- [x] `PlanosAdminIsland`
- [x] `CommissionTemplatesIsland`
- [x] `CommissionRulesIsland`
- [x] `AdminUserTypesIsland`
- [x] `AvisosAdminIsland`
- [x] `FinanceiroAdminIsland`
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
- [x] `ProdutosLoteIsland`
- [x] `FornecedoresIsland`

## Parametros

- [x] `FormasPagamentoIsland`
- [x] `TipoProdutosIsland`
- [x] `TipoPacotesIsland`
- [x] `CommissionRulesIsland`
- [x] `CommissionTemplatesIsland`
- [x] `ParametrosCambiosIsland`
- [x] `ParametrosAvisosIsland`
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
- [x] `AgendaCalendar`
- [x] `TodoBoard`
- [x] `MuralRecadosIsland`
- [x] `ControleSacIsland`
- [x] `CampanhasIsland`
- [x] `ConciliacaoIsland`
- [x] `DocumentosViagensIsland`
- [x] `DossieViagemIsland`
- [x] `RoteiroListIsland`
- [x] `RoteiroEditIsland`
- [x] `ViagensListaIsland`
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
- [x] `PermissoesProvider` (sem UI renderizavel, N/A para migracao de design system)
- [x] `PersonalizarMenuIsland`

## Pendencias confirmadas (telas)

- [x] nenhuma pendencia de tela visual no momento

Item tecnico sem UI (nao bloquear migracao visual):

- [ ] `src/components/islands/PermissoesProvider.tsx` (provider de contexto)

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

## Checklist de verificacao por tela pendente

Para cada tela pendente, validar e marcar:

- [ ] envolve conteudo com `AppPrimerProvider` quando necessario
- [ ] usa `AppToolbar` no topo da tela
- [ ] usa `AppCard` nos blocos principais
- [ ] usa `AppField` para entradas de formulario
- [ ] usa `AppButton` para acoes principais/secundarias
- [ ] usa `DataTable` nas listagens
- [ ] usa `EmptyState` para listas vazias
- [ ] usa `AlertMessage` para sucesso/erro
- [ ] usa `AppDialog` ou `Dialog` do Primer para modais
- [ ] revisao de responsividade desktop/mobile
- [ ] revisao de acessibilidade basica (foco, labels, contraste)
- [ ] validacao final com `npm run build`

## Ordem de fechamento recomendada

1. Dashboards por perfil
2. Admin legado
3. Operacao legado
4. Parametros e perfil
5. Auth e componentes utilitarios
