# Prime/Sakai Full Audit

Gerado em: 2026-03-11T02:33:32.206Z

## Resumo

- primer imports no src: 0
- emojis fora da allowlist: 0
- imports legacyCompat: 18
- form-input: 141
- form-select: 33
- table-default: 33
- classes btn*: 21
- raw <input>: 201
- raw <select>: 42
- raw <textarea>: 20
- raw <table>: 38
- raw <button>: 16

## Bloqueadores

- Bloqueador @primer/*: OK
- Bloqueador emojis fora da allowlist: OK

## Detalhamento Por Arquivo (Top 20)

### legacyCompat

- src/components/islands/AdminPermissoesIsland.tsx: 1
- src/components/islands/AdminUserTypesIsland.tsx: 1
- src/components/islands/CampanhasIsland.tsx: 1
- src/components/islands/CircuitosIsland.tsx: 1
- src/components/islands/ClientesConsultaIsland.tsx: 1
- src/components/islands/ClientesIsland.tsx: 1
- src/components/islands/ComissionamentoIsland.tsx: 1
- src/components/islands/ConsultoriaOnlineIsland.tsx: 1
- src/components/islands/DashboardGeralIsland.tsx: 1
- src/components/islands/DashboardGestorIsland.tsx: 1
- src/components/islands/MenuIsland.tsx: 1
- src/components/islands/ProdutosLoteIsland.tsx: 1
- src/components/islands/QuoteListIsland.tsx: 1
- src/components/islands/RelatorioAgrupadoClienteIsland.tsx: 1
- src/components/islands/RelatorioAgrupadoDestinoIsland.tsx: 1
- src/components/islands/RelatorioAgrupadoProdutoIsland.tsx: 1
- src/components/islands/RelatorioVendasIsland.tsx: 1
- src/components/islands/VendaContratoImportIsland.tsx: 1

### form-input

- src/components/islands/PerfilIsland.tsx: 16
- src/components/islands/ParametrosAvisosIsland.tsx: 15
- src/components/islands/DossieViagemIsland.tsx: 14
- src/components/islands/EquipeGestorIsland.tsx: 12
- src/components/islands/QuotePrintSettingsIsland.tsx: 10
- src/components/islands/QuoteDetailIsland.tsx: 9
- src/components/islands/QuoteImportIsland.tsx: 9
- src/components/islands/QuoteManualIsland.tsx: 9
- src/components/islands/DocumentosViagensIsland.tsx: 7
- src/components/islands/EmpresasAdminIsland.tsx: 7
- src/components/islands/EscalaGestorIsland.tsx: 7
- src/components/islands/UsuariosAdminIsland.tsx: 6
- src/components/islands/VendasCadastroIsland.tsx: 5
- src/components/islands/TodoBoard.tsx: 3
- src/components/forms/CredentialsForm.tsx: 2
- src/components/islands/AuthResetIsland.tsx: 2
- src/components/islands/EmailSettingsAdminIsland.tsx: 2
- src/components/islands/MuralRecadosIsland.tsx: 2
- src/components/islands/AuthLoginIsland.tsx: 1
- src/components/islands/CampanhasIsland.tsx: 1

### form-select

- src/components/islands/DossieViagemIsland.tsx: 8
- src/components/islands/ParametrosAvisosIsland.tsx: 8
- src/components/islands/EscalaGestorIsland.tsx: 3
- src/components/islands/UsuariosAdminIsland.tsx: 3
- src/components/islands/EquipeGestorIsland.tsx: 2
- src/components/islands/MasterPermissoesIsland.tsx: 2
- src/components/islands/RankingVendasIsland.tsx: 2
- src/components/islands/TodoBoard.tsx: 2
- src/components/islands/PermissoesAdminIsland.tsx: 1
- src/components/islands/VendasCadastroIsland.tsx: 1
- src/components/ui/PaginationControls.tsx: 1

### table-default

- src/components/islands/DossieViagemIsland.tsx: 4
- src/components/islands/EquipeGestorIsland.tsx: 4
- src/components/islands/MasterUsuariosIsland.tsx: 3
- src/components/islands/VendasConsultaIsland.tsx: 2
- src/components/islands/CidadesIsland.tsx: 1
- src/components/islands/EscalaGestorIsland.tsx: 1
- src/components/islands/EstadosIsland.tsx: 1
- src/components/islands/FechamentoComissaoIsland.tsx: 1
- src/components/islands/FormasPagamentoIsland.tsx: 1
- src/components/islands/MasterEmpresasIsland.tsx: 1
- src/components/islands/MasterPermissoesIsland.tsx: 1
- src/components/islands/MinhaEscalaIsland.tsx: 1
- src/components/islands/MinhasPreferenciasIsland.tsx: 1
- src/components/islands/PaisesIsland.tsx: 1
- src/components/islands/ParametrosAvisosIsland.tsx: 1
- src/components/islands/ProdutosIsland.tsx: 1
- src/components/islands/QuoteDetailIsland.tsx: 1
- src/components/islands/QuoteImportIsland.tsx: 1
- src/components/islands/QuoteManualIsland.tsx: 1
- src/components/islands/RankingVendasIsland.tsx: 1

### btn class

- src/components/islands/TodoBoard.tsx: 15
- src/components/islands/MuralRecadosIsland.tsx: 4
- src/components/islands/AgendaCalendar.tsx: 1
- src/components/islands/MasterUsuariosIsland.tsx: 1

### raw <input>

- src/components/islands/RoteiroEditIsland.tsx: 23
- src/components/islands/PerfilIsland.tsx: 18
- src/components/islands/ParametrosAvisosIsland.tsx: 16
- src/components/islands/DossieViagemIsland.tsx: 15
- src/components/islands/EquipeGestorIsland.tsx: 12
- src/components/islands/QuotePrintSettingsIsland.tsx: 11
- src/components/islands/QuoteDetailIsland.tsx: 10
- src/components/islands/QuoteImportIsland.tsx: 9
- src/components/islands/QuoteManualIsland.tsx: 9
- src/components/islands/EmpresasAdminIsland.tsx: 7
- src/components/islands/EscalaGestorIsland.tsx: 7
- src/components/islands/VendasCadastroIsland.tsx: 6
- src/components/islands/DocumentosViagensIsland.tsx: 5
- src/components/islands/UsuariosAdminIsland.tsx: 5
- src/components/islands/MuralRecadosIsland.tsx: 4
- src/components/islands/ParametrosSistemaIsland.tsx: 4
- src/components/islands/TodoBoard.tsx: 4
- src/pages/admin/sales/[id]/refunds.astro: 4
- src/components/islands/AgendaCalendar.tsx: 3
- src/components/islands/EmailSettingsAdminIsland.tsx: 3

### raw <select>

- src/components/islands/DossieViagemIsland.tsx: 8
- src/components/islands/ParametrosAvisosIsland.tsx: 8
- src/components/islands/EscalaGestorIsland.tsx: 3
- src/components/islands/RankingVendasIsland.tsx: 3
- src/components/islands/RoteiroEditIsland.tsx: 3
- src/components/islands/UsuariosAdminIsland.tsx: 3
- src/components/islands/EquipeGestorIsland.tsx: 2
- src/components/islands/MasterPermissoesIsland.tsx: 2
- src/components/islands/TodoBoard.tsx: 2
- src/components/islands/DocumentosViagensIsland.tsx: 1
- src/components/islands/PermissoesAdminIsland.tsx: 1
- src/components/islands/QuoteListIsland.tsx: 1
- src/components/islands/VendasCadastroIsland.tsx: 1
- src/components/ui/PaginationControls.tsx: 1
- src/components/ui/primer/AppField.tsx: 1
- src/components/ui/primer/legacyCompat.tsx: 1
- src/pages/admin/sales/[id]/payments.astro: 1

### raw <textarea>

- src/components/islands/ParametrosAvisosIsland.tsx: 5
- src/components/islands/RoteiroEditIsland.tsx: 5
- src/components/islands/DossieViagemIsland.tsx: 4
- src/components/islands/MuralRecadosIsland.tsx: 2
- src/components/islands/DocumentosViagensIsland.tsx: 1
- src/components/islands/EscalaGestorIsland.tsx: 1
- src/components/islands/QuotePrintSettingsIsland.tsx: 1
- src/components/islands/TodoBoard.tsx: 1

### raw <table>

- src/components/islands/RoteiroEditIsland.tsx: 5
- src/components/islands/DossieViagemIsland.tsx: 4
- src/components/islands/EquipeGestorIsland.tsx: 4
- src/components/islands/MasterUsuariosIsland.tsx: 3
- src/components/islands/MinhaEscalaIsland.tsx: 3
- src/components/islands/RankingVendasIsland.tsx: 3
- src/components/islands/EscalaGestorIsland.tsx: 2
- src/pages/orcamentos/personalizados/visualizar/[id].astro: 2
- src/components/islands/FechamentoComissaoIsland.tsx: 1
- src/components/islands/FormasPagamentoIsland.tsx: 1
- src/components/islands/MasterEmpresasIsland.tsx: 1
- src/components/islands/MasterPermissoesIsland.tsx: 1
- src/components/islands/ParametrosAvisosIsland.tsx: 1
- src/components/islands/QuoteDetailIsland.tsx: 1
- src/components/islands/QuoteImportIsland.tsx: 1
- src/components/islands/QuoteManualIsland.tsx: 1
- src/components/islands/RoteiroListIsland.tsx: 1
- src/components/islands/VendasConsultaIsland.tsx: 1
- src/components/ui/DataTable.tsx: 1
- src/pages/dashboard/financeiro.astro: 1

### raw <button>

- src/components/islands/MuralRecadosIsland.tsx: 11
- src/components/islands/DossieViagemIsland.tsx: 4
- src/components/ui/Button.astro: 1
