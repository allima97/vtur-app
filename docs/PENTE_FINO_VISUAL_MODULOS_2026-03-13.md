# Pente-fino Visual dos Modulos Principais

Data: 2026-03-13

## Escopo revisado
- Cadastros
- Vendas
- Relatorios
- Admin

## Ajustes aplicados
- Separacao visual padrao entre box de cabecalho (titulo/subtitulo/filtros) e box de tabela.
- Tipografia de titulo/subtitulo de secoes de tabela padronizada.
- Espacamento entre cabecalho e tabela padronizado.
- Box da tabela (nativa) com borda, raio e sombra padronizados.
- DataTable com raio e sombra alinhados ao mesmo padrao.
- Estrutura legado Astro com `vtur-app-card` + tabela ajustada com `vtur-card-table-split`.

## Arquivos-base alterados para o padrao global
- `src/components/ui/primer/AppCard.tsx`
- `src/styles/sakai-alignment.css`
- `src/pages/dashboard/financeiro.astro`

## Auditoria e garantia de cobertura
- Script: `npm run check:table-standardization`
- Relatorio gerado em: `docs/TABELAS_PADRONIZACAO_CHECKLIST.md`
- Resultado atual: 59 arquivos com tabelas, 59 conformes, 0 pendentes.
