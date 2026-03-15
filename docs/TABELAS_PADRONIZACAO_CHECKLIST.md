# Checklist de Padronizacao de Tabelas

Gerado em: 2026-03-13T16:44:00.177Z

## Resumo
- Arquivos com tabelas: 59
- Ocorrencias DataTable: 68
- Ocorrencias table nativa: 38
- Arquivos conformes: 59
- Arquivos pendentes: 0

## Pente-fino visual por modulo
- Cadastros: 13/13 conformes (pendentes: 0)
- Vendas: 4/4 conformes (pendentes: 0)
- Relatorios: 5/5 conformes (pendentes: 0)
- Admin: 11/11 conformes (pendentes: 0)
- Outros: 26/26 conformes (pendentes: 0)

Microajustes aplicados no padrao visual de tabelas:
- Cabecalho da secao de tabela com espaco vertical padronizado.
- Titulo/subtitulo da secao de tabela com tipografia e line-height uniformes.
- Box da tabela com borda, raio e sombra padronizados para tabelas nativas.
- Box DataTable com raio e sombra alinhados ao mesmo padrao.

## Checklist
- [x] `src/components/islands/AdminPermissoesIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/AdminUserTypesIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/AvisosAdminIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/CidadesIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/CircuitosIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/ClientesConsultaIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 3, table: 0)
- [x] `src/components/islands/ClientesIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 5, table: 0)
- [x] `src/components/islands/CommissionRulesIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/CommissionTemplatesIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/ConciliacaoIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 3, table: 0)
- [x] `src/components/islands/ConsultoriaOnlineIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/ControleSacIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/DashboardGeralIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 6, table: 0)
- [x] `src/components/islands/DashboardGestorIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 5, table: 0)
- [x] `src/components/islands/DestinosIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/DocumentosViagensIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/DossieViagemIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 4)
- [x] `src/components/islands/EmpresasAdminIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/EquipeGestorIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 4)
- [x] `src/components/islands/EscalaGestorIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 2)
- [x] `src/components/islands/EstadosIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/FechamentoComissaoIsland.tsx` - [Vendas] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/FinanceiroAdminIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/FormasPagamentoIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/FornecedoresIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/LogsIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/MasterEmpresasIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/MasterPermissoesIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/MasterUsuariosIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 3)
- [x] `src/components/islands/MetasVendedorIsland.tsx` - [Vendas] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 3, table: 0)
- [x] `src/components/islands/MinhaEscalaIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 3)
- [x] `src/components/islands/MinhasPreferenciasIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/PaisesIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/ParametrosAvisosIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/ParametrosCambiosIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/ParametrosNaoComissionaveisIsland.tsx` - [Vendas] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/PermissoesAdminIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/PlanosAdminIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/ProdutosIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/ProdutosLoteIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/QuoteDetailIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/QuoteImportIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/QuoteListIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/QuoteManualIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 1)
- [x] `src/components/islands/RankingVendasIsland.tsx` - [Relatorios] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 3)
- [x] `src/components/islands/RelatorioAgrupadoClienteIsland.tsx` - [Relatorios] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/RelatorioAgrupadoDestinoIsland.tsx` - [Relatorios] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/RelatorioAgrupadoProdutoIsland.tsx` - [Relatorios] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 2, table: 0)
- [x] `src/components/islands/RelatorioVendasIsland.tsx` - [Relatorios] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/RoteiroEditIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 0, table: 5)
- [x] `src/components/islands/RoteiroListIsland.tsx` - [Outros] Tabela sem card agrupador extra (DataTable: 0, table: 1)
- [x] `src/components/islands/TipoPacotesIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/TipoProdutosIsland.tsx` - [Cadastros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/UsuariosAdminIsland.tsx` - [Admin] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/islands/VendasConsultaIsland.tsx` - [Vendas] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 1)
- [x] `src/components/islands/ViagensListaIsland.tsx` - [Outros] Padrao global automatico (AppCard com separacao por tabela) (DataTable: 1, table: 0)
- [x] `src/components/ui/DataTable.tsx` - [Outros] Componente base da grade (DataTable) (DataTable: 0, table: 1)
- [x] `src/pages/dashboard/financeiro.astro` - [Outros] Padrao legado com classe de separacao (DataTable: 0, table: 1)
- [x] `src/pages/orcamentos/personalizados/visualizar/[id].astro` - [Outros] Tabela sem card agrupador extra (DataTable: 0, table: 2)

## Regra aplicada
- Tabelas em `AppCard` usam separacao automatica de cabecalho e grade por classes `vtur-app-card-has-table`/`vtur-app-card-has-datatable`.
- Tabelas em cards legados (Astro sem `AppCard`) devem usar `vtur-card-table-split`.
