# UI Padronizacao do Sistema

Ultima atualizacao: 2026-03-14.

## Objetivo
Este documento define os padroes visuais e de interacao do sistema para reduzir inconsistencias entre telas e acelerar novas implementacoes.

## Escopo
Aplica-se a:
- Componentes React/Astro do app interno.
- Modulos com tema Sakai/PrimeReact.
- Acoes de tabela, botoes, formularios, alertas e textos do produto.

## Principios
- Consistencia antes de excecao.
- Clareza de leitura em desktop e mobile.
- Acessibilidade: todo icone de acao precisa de `title` e `aria-label`.
- Reuso: priorizar componentes base (`AppButton`, `TableActions`, `AppField`, `AlertMessage`, `AppCard`).

## Paleta SGVTur (Padrao atual do app)
- `ink` (texto principal): `#09112E`
- `ink-soft` (texto secundario): `#52607A`
- `accent` (destaques): `#8E28E2`
- `accent-strong` (destaque forte): `#5630FF`
- `surface` (cartoes/paineis): `#FFFFFF`
- `surface-alt` (fundos suaves): `#F4F1EB`
- `border` (linhas): `rgba(9, 17, 46, 0.14)`

## Theming PrimeReact (estrutura oficial)
- Tema deve ser carregado por `<link id="theme-link" ...>` no `BrandHead` (nao por import fixo de `theme.css` em componente React).
- Lista oficial de temas suportados: `src/lib/primeTheme.ts` (`PRIME_THEME_OPTIONS`).
- Troca de tema em runtime deve usar `changePrimeTheme(...)` em `src/lib/primeTheme.ts`.
- Em telas React, usar o hook `usePrimeTheme()` (`src/lib/usePrimeTheme.ts`) para evitar duplicacao de estado/eventos.
- Persistencia do tema no navegador: `localStorage` com chave `vtur:prime-theme`.
- Bootstrap inicial do tema (antes da hidratacao): `src/components/BrandHead.astro`.
- Sincronizacao dos assets (`theme.css` + fonts) para public:
  - Script: `scripts/sync-prime-themes.mjs`
  - Execucao automatica: `predev` e `prebuild` em `package.json`
- Locais oficiais de troca de tema para o usuario:
  - Menu lateral (`MenuIsland`)
  - `operacao/minhas-preferencias` (`MinhasPreferenciasIsland`)
  - `perfil/personalizar` (`PersonalizarMenuIsland`)
- Regra: nao voltar a importar `primereact/resources/themes/*/theme.css` diretamente no frontend.

## Cabecalhos de Secao e Pagina
- Cabecalho de pagina deve usar `HeaderPage`/`AppPageHeader` (nao criar variacoes locais).
- Titulo do cabecalho:
  - Peso alto (`800`), tracking levemente negativo, cor da paleta SGVTur.
- Subtitulo do cabecalho:
  - Cor `ink-soft`, leitura suave e sem opacidade excessiva.
- Cabecalho de secao em cards (`AppCard`):
  - Fundo suave com leve destaque da cor accent.
  - Linha inferior discreta para separar titulo/subtitulo do corpo.

## Acoes de Tabela (Padrao Oficial)
- Usar `TableActions` para a coluna de acoes.
- Acoes devem ser `icon-only` (sem texto visivel no botao).
- Estilo oficial de icones: sem borda fixa, com hover suave.
- Usar `variant: "ghost"` para acoes neutras.
- Usar `variant: "danger"` somente para excluir/remover.
- Evitar duplicidade de acao com o mesmo icone/significado na mesma linha.

## Estrutura de Tabelas e Cards (Padrao Oficial)
- Titulo/subtitulo/filtros devem ficar em um card/box superior.
- A grade (tabela) deve ficar em um card/box separado, abaixo.
- Nao usar card unico englobando cabecalho e tabela no mesmo bloco visual.
- Em componentes React com `AppCard`, a separacao e automatica para conteudos com tabela:
  - classe aplicada automaticamente: `vtur-app-card-has-table` ou `vtur-app-card-has-datatable`.
- Em telas Astro legadas com `class="vtur-app-card"`, aplicar `vtur-card-table-split` quando houver titulo + tabela.
- Para manter conformidade em novas entregas, executar:
  - `npm run check:table-standardization`
  - revisar `docs/TABELAS_PADRONIZACAO_CHECKLIST.md`

### Mapa recomendado de icones (PrimeIcons)
- Visualizar/Abrir: `pi pi-eye`
- Editar: `pi pi-pencil`
- Excluir/Remover: `pi pi-trash`
- Interacao/CRM: `pi pi-comments`
- Converter para venda: `pi pi-shopping-cart`

## Botoes (fora de tabela)
- Botao principal de fluxo: `AppButton` com `variant="primary"`.
- Acao secundaria: `variant="secondary"`.
- Acao destrutiva: `variant="danger"`.
- Evitar misturar varios estilos para a mesma funcao na mesma tela.

### Orcamentos (padrao oficial de barras de acao)
- Todas as barras de acao do modulo `orcamentos/*` devem usar a classe `orcamentos-action-bar`.
- Containers recomendados:
  - `mobile-stack-buttons orcamentos-action-bar`
  - `vtur-quote-top-actions orcamentos-action-bar`
- Botoes de acao (nao icon-only) nesse contexto devem seguir:
  - `border-radius: 12px`
  - `min-height: 42px`
  - `padding: 10px 16px`
  - sem sombra no botao principal da barra
- Excecoes:
  - botoes icon-only (`.btn-icon` / `.p-button-icon-only`) mantem o padrao proprio de icones.
  - em `orcamentos/personalizados/[id]` (editor de roteiro), no desktop os botoes da barra de info podem usar `min-width: 150px` para manter legibilidade.
- Referencia de implementacao:
  - `src/styles/global.css` (classe `orcamentos-action-bar`)
  - `src/components/islands/QuoteManualIsland.tsx`
  - `src/components/islands/QuoteImportIsland.tsx`
  - `src/components/islands/QuoteDetailIsland.tsx`
  - `src/components/islands/RoteiroListIsland.tsx`
  - `src/components/islands/RoteiroEditIsland.tsx`
  - `src/pages/orcamentos/consulta.astro`
  - `src/pages/orcamentos/personalizados/visualizar/[id].astro`

## Formularios
- Usar `AppField` para inputs, selects e textareas.
- Labels curtas e claras.
- Mensagens de erro objetivas e proximas ao campo/contexto.
- Em mobile, campos e acoes devem empilhar com largura total quando necessario.

## Alertas e Mensagens
- Usar `AlertMessage`.
- Variantes:
  - `success`: confirmacao positiva.
  - `info`: comunicados neutros.
  - `warning`: atencao (cor laranja).
  - `error`: falha bloqueante ou problema de operacao.

## Texto e Linguagem (pt-BR)
- Garantir acentuacao correta em todo texto de UI.
- Ex.: `Relatorio -> Relatório`, `Relatorios -> Relatórios`, `Periodo -> Período`, `Consolidacao -> Consolidação`, `medio -> médio`.
- Preferir termos curtos e orientados a acao.

## KPIs e Cards Resumo
- Em cards de KPI, manter label e valor centralizados quando o contexto for leitura rapida de indicadores.
- Evitar quebra visual desnecessaria entre label e valor.

## Checklist rapido para novas telas
- Existe componente base para este elemento?
- A coluna de acoes usa `TableActions`?
- Os icones seguem o mapa recomendado?
- Nao existe acao duplicada com o mesmo objetivo?
- Textos estao em pt-BR com acentuacao correta?
- Desktop e mobile estao consistentes?

## Governanca
- Em novas demandas de layout/estilo, este documento deve ser a referencia inicial.
- Caso seja necessario desviar do padrao, registrar a justificativa no PR/commit.
- Sempre que um ajuste de padrao visual global/modular for aplicado, atualizar este documento no mesmo PR/commit.
