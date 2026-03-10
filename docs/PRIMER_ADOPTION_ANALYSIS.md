# Analise de adocao do Primer no vtur

Data: 2026-03-09

## Objetivo

Elevar o nivel visual e de consistencia do `vtur` usando a familia `Primer`, com foco em:

- padronizacao de componentes
- reducao de CSS disperso
- melhoria de acessibilidade e coerencia visual
- ganho de confianca e maturidade de produto

## O que a documentacao oficial mostra

### Primer React

Fontes oficiais:

- https://primer.style/product/getting-started/react/
- https://primer.style/product/components/
- https://github.com/primer/react

Pontos relevantes:

- `Primer React` e a implementacao React do design system do GitHub
- o setup oficial pede `ThemeProvider`, `BaseStyles` e import dos temas de `@primer/primitives`
- o pacote atual `@primer/react` esta no repositório oficial e hoje publica versao `38.14.0`
- o pacote atual trabalha com `react` e `react-dom` `18.x` ou `19.x`
- a biblioteca oferece componentes muito aderentes ao nosso produto:
  - `Button`
  - `IconButton`
  - `FormControl`
  - `TextInput`
  - `Textarea`
  - `Select`
  - `NavList`
  - `PageLayout`
  - `PageHeader`
  - `ActionList`
  - `ActionMenu`
  - `ConfirmationDialog`
  - `Spinner`
  - `Skeleton*`
  - `UnderlineNav`
  - `UnderlinePanels`
  - `RelativeTime`
  - `Label`
  - `Banner`
  - `InlineMessage`
  - `SegmentedControl`
  - `DataTable`

Observacao importante:

- alguns componentes de alto interesse aparecem hoje sob `@primer/react/experimental`, como `DataTable` e `Dialog`

### Primer Brand

Fonte oficial:

- https://primer.style/brand/getting-started/

Conclusao:

- para o `vtur-site`, a camada mais aderente da familia Primer nao e `@primer/react`, e sim `@primer/react-brand`
- `Primer Brand` foi desenhado para experiencias de marca, marketing e paginas institucionais

## Diagnostico do vtur hoje

Stack atual do app:

- `Astro 5`
- `React 18`
- `Tailwind`
- muito CSS global customizado em [global.css](/Users/allima97/Documents/GitHub/vtur-app/src/styles/global.css)

Indicadores do front atual no `vtur-app`:

- ocorrencias com `btn*`: `604`
- ocorrencias com `card*`: `466`
- ocorrencias com `form-*`: `2143`
- ocorrencias com `table-*`: `182`
- ocorrencias com `modal-*`: `258`

Leitura objetiva:

- o problema do `vtur` nao e falta de componentes
- o problema e excesso de variacao local e padroes repetidos sem uma camada central forte

## Onde o Primer encaixa muito bem

### 1. Estrutura de navegacao e shell

Melhor encaixe:

- `PageLayout`
- `PageHeader`
- `NavList`
- `ActionMenu`
- `ActionList`

Aplicacao no vtur:

- sidebar principal
- cabecalhos de pagina
- menus de acoes de linha
- menus secundarios e contextual actions

### 2. Formularios

Melhor encaixe:

- `FormControl`
- `TextInput`
- `Textarea`
- `Select`
- `Checkbox`
- `RadioGroup`
- `ToggleSwitch`
- `SegmentedControl`

Aplicacao no vtur:

- filtros de dashboard
- formularios de vendas
- cadastros
- parametros
- configuracoes

Esse e o bloco com maior retorno porque o sistema tem enorme volume de `form-*`.

### 3. Estados, feedback e mensagens

Melhor encaixe:

- `Banner`
- `InlineMessage`
- `Label`
- `StateLabel`
- `Spinner`
- `SkeletonBox`
- `SkeletonText`

Aplicacao no vtur:

- carregamento
- status de vendas
- mensagens de erro e sucesso
- empty states
- estados de aprovacao, comissao, SAC e follow-up

### 4. Confirmacoes e overlays

Melhor encaixe:

- `ConfirmationDialog`
- `Dialog` experimental
- `Popover`
- `Tooltip`
- `Overlay`

Aplicacao no vtur:

- excluir registros
- confirmar alteracoes sensiveis
- modais de personalizacao
- acoes de linha e menus flutuantes

### 5. Tabelas e listas

Melhor encaixe:

- `DataTable` experimental
- `ActionMenu`
- `IconButton`
- `RelativeTime`

Aplicacao no vtur:

- vendas
- clientes
- ranking
- parametros
- logs
- master/permissoes

## Onde o Primer nao deve ser forcado

### 1. Reescrita total imediata

Nao faz sentido substituir tudo de uma vez.

O volume atual de classes e telas e alto. Uma troca completa agora aumentaria risco de regressao em:

- responsividade
- filtros
- tabelas mobile
- permissoes
- fluxos com muitos estados

### 2. Componentes muito especificos do negocio

Exemplos:

- dashboards de KPI com regras comerciais
- telas de importacao
- dossie de viagem
- layouts especiais de ranking
- formularios longos e fortemente condicionais

Aqui o certo e usar `Primer` como base visual e de comportamento, nao como substituicao literal de toda a estrutura.

### 3. Modais e tabelas avancadas sem piloto

Como `Dialog` e `DataTable` ainda aparecem em uso experimental na propria documentacao, o melhor caminho e:

- validar em telas piloto
- medir UX e responsividade
- so depois expandir

## Recomendacao de arquitetura

### Para o vtur-app

Adotar `@primer/react` como camada de produto.

Pacotes-alvo iniciais:

- `@primer/react`
- `@primer/primitives`
- `@primer/octicons-react`

### Para o vtur-site

Se quisermos aderencia total a familia Primer no institucional, a escolha correta e:

- `@primer/react-brand`

Motivo:

- a linha `Brand` foi criada para marketing, storytelling, secoes institucionais, hero sections, comparativos e CTAs
- isso combina melhor com `vtur.com.br` do que a linha `Product UI`

## Estrategia recomendada para o vtur

### Fase 1. Fundacao

Objetivo:

- instalar `Primer React`
- configurar `ThemeProvider` e `BaseStyles`
- alinhar tokens basicos do `vtur` sem perder identidade

Entregas:

- provider global
- tema com cores do `vtur`
- mapeamento de tipografia e espacos

### Fase 2. Criar wrappers internos

Objetivo:

- nao espalhar `Primer` cru pelo sistema inteiro

Entregas:

- `AppButton`
- `AppField`
- `AppSelect`
- `AppCard`
- `AppSectionHeader`
- `AppConfirmDialog`
- `AppStatusBadge`

Beneficio:

- o produto continua com linguagem propria
- a troca de biblioteca no futuro fica mais controlada

### Fase 3. Piloto em telas de alto impacto

Ordem sugerida:

1. autenticacao
2. sidebar e header
3. filtros padrao
4. modais de confirmacao
5. dashboard geral

Essas areas dao mais retorno visual e menor risco do que uma tela de vendas completa logo de inicio.

### Fase 4. Formularios padrao

Trocar a base de:

- inputs
- selects
- labels
- help text
- validacao visual
- buttons

### Fase 5. Tabelas

Pilotos sugeridos:

1. `MasterPermissoesIsland`
2. `FormasPagamentoIsland`
3. `LogsIsland`

Essas telas sao boas candidatas porque:

- tem estrutura previsivel
- pouca densidade visual de cards especiais
- alto ganho com acoes de linha e acessibilidade

### Fase 6. Dashboards e telas complexas

Aplicar o Primer onde ele agrega:

- headers
- filtros
- cards de suporte
- estados
- menus de acoes

Sem forcar substituicao total dos blocos de negocio.

## Minha recomendacao objetiva

Sim, vale adotar a familia Primer no `vtur`.

Mas do jeito certo:

- `@primer/react` no `vtur-app`
- `@primer/react-brand` no `vtur-site`
- migracao progressiva
- wrappers internos para preservar identidade do produto
- piloto primeiro em shell, formularios base e dialogs

## Proximo passo recomendado

Executar uma prova de conceito controlada no `vtur-app` com:

1. provider global do Primer
2. substituicao do shell lateral
3. padrao de botoes
4. padrao de campos
5. `ConfirmationDialog` em uma tela real

Se esse piloto ficar bom, seguimos modulo a modulo.
