# Auditoria Completa Prime/Sakai

Atualizado em 2026-03-11.

## Resultado da varredura

- `@primer/react` em `src/`: **0**
- Emojis visíveis em UI fora de mapeamentos internos (`Menu`, `DashboardAdmin`, `PerformanceDashboard`): **0**
- Imports de `legacyCompat` ainda ativos: **18** (compatibilidade temporária)

## Padronização aplicada nesta rodada

- Removidos emojis restantes de ações/botões/títulos nas telas:
  - `AdminPermissoes`, `AdminUserTypes`, `ConsultoriaOnline`, `ControleSac`, `DocumentosViagens`,
  - `DossieViagem`, `EmailSettingsAdmin`, `EquipeGestor`, `MasterUsuarios`,
  - `MetasVendedor`, `MinhasPreferencias`, `MuralRecados`, `ParametrosAvisos`,
  - `ProdutosLote`, `RoteiroEdit`, `RoteiroList`, `TodoBoard`, `VendasConsulta`,
  - `ViagensLista`, `FlightDetailsModal`,
  - `pages/negado.astro`, `pages/admin/sales/[id]/refunds.astro`.
- Removido resquício de tema Primer:
  - `src/layouts/DashboardLayout.astro` (import `@primer/primitives` removido).
- Dependências Primer não usadas removidas:
  - `@primer/react`, `@primer/primitives`, `@primer/octicons-react`.
- Reforço global de compatibilidade visual Prime/Sakai para classes legadas em:
  - `src/styles/primer-overrides.css`
  - Cobertura: `.form-input`, `.form-select`, `.btn*`, `.table-default`, `.btn-icon`.

## Pendências técnicas (código legado, já com visual compatível)

Ocorrências ainda em classes legadas:

- `form-input`: **141**
- `form-select`: **33**
- `table-default`: **33**
- classes `btn*`: **66**

Arquivos com maior concentração:

- `form-input`:
  - `src/components/islands/PerfilIsland.tsx` (16)
  - `src/components/islands/ParametrosAvisosIsland.tsx` (15)
  - `src/components/islands/DossieViagemIsland.tsx` (14)
  - `src/components/islands/EquipeGestorIsland.tsx` (12)
- `form-select`:
  - `src/components/islands/ParametrosAvisosIsland.tsx` (8)
  - `src/components/islands/DossieViagemIsland.tsx` (8)
- `table-default`:
  - `src/components/islands/EquipeGestorIsland.tsx` (4)
  - `src/components/islands/DossieViagemIsland.tsx` (4)
  - `src/components/islands/MasterUsuariosIsland.tsx` (3)
- `btn*`:
  - `src/components/islands/DossieViagemIsland.tsx` (24)
  - `src/components/islands/TodoBoard.tsx` (15)
  - `src/components/islands/ParametrosAvisosIsland.tsx` (15)
  - `src/components/islands/MuralRecadosIsland.tsx` (10)

## Próxima etapa recomendada

- Migrar os arquivos de maior concentração para wrappers finais:
  - `AppButton`
  - `AppField`
  - `DataTable`
- Depois remover gradualmente a dependência de classes legadas (`form-*`, `table-default`, `btn*`).
