# Checklist de Commit do Sistema (2026-03-10)

## Escopo revisado

- Migração Primer concluída nos módulos pendentes:
  - `MetasVendedorIsland`
  - `ParametrosAvisosIsland`
  - `MuralRecadosIsland`
  - `DossieViagemIsland`
- Checklist de adoção Primer marcado como concluído em:
  - `docs/PRIMER_SYSTEM_CHECKLIST.md`

## Testes executados

- [x] Build completo da aplicação
  - Comando: `ASTRO_TELEMETRY_DISABLED=1 npm run build`
  - Resultado: **OK** (sem erros de compilação; apenas warning de chunks grandes do Vite)
- [x] Validação de mapeamento de módulos/permissões
  - Comando: `npm run check:modulos`
  - Resultado: **OK**
- [ ] Testes unitários automatizados
  - Tentativa: `npx vitest run tests/apiAuth.test.ts`
  - Resultado: **não executado** por bloqueio de rede (`ENOTFOUND registry.npmjs.org`)

## Pendências encontradas (antes do commit final)

### 1) Banco de dados / Supabase (bloqueador de produção)

- [ ] Aplicar migrações pendentes listadas em `AGENTS.md` (seção **Migrações pendentes**).
- [ ] Validar especialmente migrations de hotfix e RLS:
  - `database/migrations/20260304_clientes_rls_recursion_hotfix.sql`
  - `database/migrations/20260312_rls_gestor_vendedor_master_scope.sql`
  - `database/migrations/20260312_rls_escalas_master_company_match.sql`
  - `database/migrations/20260312_rls_escala_horario_usuario_master_company_match.sql`

### 2) Documentação com checklist legado em aberto

- [ ] Revisar e atualizar checklists antigos para refletir estado atual:
  - `docs/VIAJA_COM_IMPLEMENTATION.md` (itens `[ ]` no final)
  - `docs/MENU_PERMISSIONS_FIX.md` (itens `[ ]` no final)
- Observação:
  - O código já contém sinais de implementação do Viaja Com (`numero_reserva` e `criarVinculosViajaComAutomaticos`) em `src/components/islands/VendasCadastroIsland.tsx` e `src/lib/vendas/*`.
  - O menu atual aplica visibilidade por `canShow` em `src/components/islands/MenuIsland.tsx`, então os itens em aberto no documento podem estar desatualizados.

### 3) Workspace/lockfile

- [ ] Revisar `package-lock.json` modificado antes de commitar.
  - Há diff de metadados de lock sem mudança declarada de dependências no `package.json`.
  - Decidir: incluir no commit (se intencional) ou retirar do commit (se ruído de ambiente).

## QA manual recomendado (rápido)

- [ ] `/parametros/metas`: criar/editar/excluir meta individual e meta da loja.
- [ ] `/parametros/avisos`: criar arte, salvar configuração, gerar preview e abrir links SVG/PNG/WhatsApp.
- [ ] `/operacao/recados`: enviar recado com/sem anexo, marcar como lido, apagar.
- [ ] `/operacao/viagens/:id`: validar abas Dados/Acompanhantes/Serviços/Documentos, upload e abertura de documento.

## Pronto para commit quando

- [x] Build passar.
- [x] Check de módulos passar.
- [ ] Migrações do Supabase aplicadas (ou explicitamente aceitas como pendentes para próximo deploy).
- [ ] Decisão sobre `package-lock.json`.
- [ ] QA manual mínimo concluído nos 4 fluxos acima.
