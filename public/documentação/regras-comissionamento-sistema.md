# Regras de Comissionamento do Sistema

Data da revisão: 29/03/2026  
Escopo desta documentação: registrar **como o sistema está aplicando hoje, no código**, as regras de comissão, meta, conciliação, ranking e relatório.

## Objetivo deste documento

Este documento foi feito para servir como mapa técnico e funcional do comissionamento do sistema.

A intenção aqui não é descrever a regra “ideal” ou “esperada”, e sim a regra **realmente implementada** hoje.

Isso é importante por 3 motivos:

1. Facilita identificar onde o sistema está correto.
2. Facilita localizar exatamente onde há divergência entre a regra de negócio e a implementação.
3. Facilita corrigir erros sem gerar regressões em outros módulos.

## Fontes do sistema revisadas

A documentação abaixo foi consolidada principalmente a partir destes arquivos:

- `src/lib/comissaoUtils.ts`
- `src/lib/comissao.ts`
- `src/lib/pagamentoUtils.ts`
- `src/lib/tipoPacote.ts`
- `src/lib/conciliacao/source.ts`
- `src/components/islands/ComissionamentoIsland.tsx`
- `src/components/islands/RelatorioVendasIsland.tsx`
- `src/components/islands/FechamentoComissaoIsland.tsx`
- `src/components/islands/RankingVendasIsland.tsx`
- `src/lib/vendas/saveContratoImport.ts`
- `src/components/islands/VendasCadastroIsland.tsx`

---

## 1. Conceitos-base do sistema

Antes da hierarquia das regras, é importante entender quais campos o sistema usa como base.

### 1.1. Venda x recibo x pagamento

No sistema, a comissão não nasce da venda como um bloco único. Ela nasce principalmente dos **recibos** da venda.

A venda guarda contexto e consolida totais, mas o cálculo em `operacao/comissionamento` e em `relatorios/vendas` acontece principalmente a partir de cada recibo.

### 1.2. Campo que realmente dirige a regra de comissão

Hoje, o campo principal para decidir a regra de comissão é o **tipo de produto gravado no recibo**.

No cadastro/importação, o sistema salva assim:

- `vendas_recibos.produto_id` = **ID do tipo de produto** usado na comissão
- `vendas_recibos.produto_resolvido_id` = produto operacional real da tabela `produtos`

Em outras palavras:

- `produto_resolvido_id` serve para destino, visualização e operação.
- `produto_id` do recibo é o campo que normalmente entra na lógica de comissão.

### 1.3. Tipo de pacote

O `tipo_pacote` funciona como uma camada de prioridade acima da regra base do tipo de produto.

Se existir regra cadastrada em `product_commission_rule_pacote`, ela entra antes da regra base do produto.

Se existir um registro de pacote, mas ele estiver sem `rule_id` e sem percentuais fixos válidos, o sistema faz fallback para a regra base do produto.

### 1.4. Normalização do tipo de pacote

O sistema **ignora o texto final entre parênteses** ao casar a regra do tipo de pacote.

Exemplo:

- `Cruzeiro (produto com régua abaixo de 10%)` vira `Cruzeiro`
- `Passagem Facial (produto especial)` vira `Passagem Facial`

A normalização remove sufixos finais entre parênteses de forma repetida e depois normaliza texto, espaços e caixa.

Isso significa que a regra é procurada pela chave limpa do tipo de pacote, e não pelo label visual completo.

---

## 2. Fórmulas-base usadas no sistema

## 2.1. Bruto do recibo

Regra atual:

- Se houver override de conciliação, usa `valor_bruto_override`.
- Se não houver override, usa `valor_total`.

Fórmula prática:

```text
bruto_recibo = valor_bruto_override ?? valor_total
```

## 2.2. Taxas efetivas

Regra atual:

- Se houver override de conciliação, usa `valor_taxas` diretamente.
- Se não houver override, usa `valor_taxas - valor_du`.

Fórmula prática:

```text
taxas_efetivas = valor_taxas                         (quando há override)
taxas_efetivas = valor_taxas - valor_du             (sem override)
```

## 2.3. Líquido comissionável do recibo

Regra atual:

- Se houver `valor_liquido_override`, ele prevalece.
- Caso contrário, o sistema tira o `RAV` do total e depois desconta as taxas efetivas.

Fórmula prática:

```text
bruto_sem_rav = valor_total - valor_rav
liquido = valor_liquido_override ?? (bruto_sem_rav - taxas_efetivas)
```

Observação importante:

- Em `operacao/comissionamento` e `relatorios/vendas`, a comissão em valor usa sempre esta base líquida.

## 2.4. Base da meta

Regra atual:

- Se houver `valor_meta_override`, ele prevalece.
- Se `foco_valor = liquido`, a base da meta é o líquido.
- Se `foco_valor != liquido` e `usar_taxas_na_meta = true`, a base da meta é o bruto.
- Se `foco_valor != liquido` e `usar_taxas_na_meta = false`, a base da meta é o líquido.

Fórmula prática:

```text
base_meta = valor_meta_override
         ou liquido                    se foco_valor = liquido
         ou bruto                      se usar_taxas_na_meta = true
         ou liquido                    nos demais casos
```

## 2.5. Meta geral atingida

Fórmula-base:

```text
pct_meta_geral = (base_meta_total_periodo / meta_geral_planejada) * 100
```

Quando a meta geral é zero ou não existe, o percentual de meta fica zerado.

---

## 3. Tabelas e parâmetros que influenciam o comissionamento

## 3.1. `parametros_comissao`

Controla parâmetros gerais do módulo.

Campos importantes na prática:

- `usar_taxas_na_meta`
- `foco_valor`
- `conciliacao_sobrepoe_vendas`
- `conciliacao_regra_ativa`
- `conciliacao_tipo`
- `conciliacao_meta_nao_atingida`
- `conciliacao_meta_atingida`
- `conciliacao_super_meta`
- `conciliacao_tiers`
- `conciliacao_faixas_loja`

## 3.2. `commission_rule`

É a regra geral/escalonável.

Campos importantes:

- `tipo`: `GERAL` ou `ESCALONAVEL`
- `meta_nao_atingida`
- `meta_atingida`
- `super_meta`

## 3.3. `commission_tier`

É a régua detalhada da regra escalonável.

O código diferencia:

- faixa `PRE`
- faixa `POS`

Na prática:

- `PRE` é usada quando `pctMeta < 100`
- `POS` é usada quando `pctMeta >= 100`

A progressão funciona por degrau usando `floor`.

## 3.4. `product_commission_rule`

É a regra base por tipo de produto.

Ela pode funcionar de 2 jeitos:

- apontando para uma `commission_rule` via `rule_id`
- usando percentuais fixos próprios:
  - `fix_meta_nao_atingida`
  - `fix_meta_atingida`
  - `fix_super_meta`

## 3.5. `product_commission_rule_pacote`

É a regra por tipo de pacote.

Ela tem prioridade sobre a regra base do produto, quando existir e casar com o `tipo_pacote` normalizado.

Também pode funcionar de 2 jeitos:

- apontando para uma `commission_rule` via `rule_id`
- usando percentuais fixos próprios

## 3.6. `tipo_produtos`

Além de identificar o tipo do recibo, esta tabela também influencia o comissionamento.

Campos importantes na prática:

- `regra_comissionamento`
- `soma_na_meta`
- `usa_meta_produto`
- `meta_produto_valor`
- `comissao_produto_meta_pct`
- `descontar_meta_geral`
- `exibe_kpi_comissao`

## 3.7. `metas_vendedor`

Tabela da meta geral do vendedor no período.

Pontos importantes:

- o período é mensal
- em vários pontos o sistema usa `scope = vendedor`
- no fechamento também existe cenário `scope = equipe`

## 3.8. `metas_vendedor_produto`

É a meta específica por produto no período.

Ela não é a mesma coisa que `meta_produto_valor` em `tipo_produtos`.

Hoje o sistema usa dois conceitos diferentes:

1. `metas_vendedor_produto`: meta mensal planejada por produto.
2. `tipo_produtos.meta_produto_valor`: alvo interno do tipo para liberar comissão extra.

## 3.9. `formas_pagamento` e termos não comissionáveis

O sistema pode marcar um pagamento como não comissionável de 2 formas:

- `formas_pagamento.paga_comissao = false`
- o nome da forma cair em termos não comissionáveis configurados em `parametros_pagamentos_nao_comissionaveis`

Existe ainda um fallback interno com termos como:

- crédito diversos
- crédito pax
- vale viagem
- carta de crédito
- similares

Observação importante:

- cartão de crédito não é tratado automaticamente como não comissionável só por ter a palavra “crédito”; existe exceção específica para cartão.

---

## 4. Hierarquia real da comissão por recibo

Esta é a ordem real que o sistema tenta seguir hoje nos motores de comissão.

## 4.1. Hierarquia principal

```text
1. Existe override de conciliação com regra de comissão própria?
   Se sim, a conciliação pode mandar no cálculo.

2. Se não mandar a conciliação:
   Existe regra por tipo de pacote?
   Se sim, ela tem prioridade máxima.

3. Se não houver regra válida por tipo de pacote:
   Usa a regra base do tipo de produto.

4. A regra encontrada é fixa ou usa rule_id?
   - Se for fixa, aplica os percentuais fixos.
   - Se tiver rule_id, carrega a commission_rule.

5. Se o tipo de produto usa meta de produto extra:
   Soma ou substitui a parte geral conforme descontar_meta_geral.
```

## 4.2. Pseudocódigo didático da lógica atual

```text
para cada recibo:
  identificar produto_comissao_id
  normalizar tipo_pacote
  calcular bruto, taxas efetivas, liquido e base de meta

  se recibo tiver override de conciliacao:
    selection = resolveConciliacaoCommissionSelection(...)
    se selection.kind = CONCILIACAO:
      pct = regra da conciliacao
      ir para cálculo final
    se selection.kind = PRODUTO_DIFERENCIADO:
      continuar fluxo normal de produto/pacote

  regra_pacote = regra por tipo_pacote normalizado
  regra_produto = regra base do tipo de produto
  regra_final = regra_pacote || regra_produto

  se produto.regra_comissionamento = diferenciado:
    pct_referencia = pct_meta_produto_se_existir || pct_meta_geral
    pct = percentual fixo da regra_final
    fim

  se regra_final for fixa e sem rule_id:
    pct = percentual fixo da regra_final
  senao:
    pct = calcularPctPorRegra(commission_rule, pct_meta_geral)

  se produto usa meta_produto extra e atingiu alvo:
    somar extra ou recalcular diff conforme descontar_meta_geral

  comissao_em_valor = liquido * pct / 100
```

---

## 5. Como o sistema calcula `commission_rule`

## 5.1. Regra `GERAL`

Comportamento atual:

- `pctMeta < 100` usa `meta_nao_atingida`
- `100 <= pctMeta < 120` usa `meta_atingida`
- `pctMeta >= 120` usa `super_meta`

## 5.2. Regra `ESCALONAVEL`

Comportamento atual:

- se `pctMeta < 100`, o motor procura tier `PRE`
- se `pctMeta >= 100`, o motor procura tier `POS`
- o incremento é aplicado por degrau inteiro usando `floor`
- se não houver tier adequada e `pctMeta >= 120`, cai para `super_meta`

Fórmula-base da escada:

```text
steps = floor((pctMeta - de_pct) / inc_pct_meta)
pct = base + steps * (inc_pct_comissao / 100)
```

Observação importante:

- o sistema trabalha em pontos percentuais da meta e converte o incremento de comissão dividindo por 100.
- por isso, por exemplo, um incremento cadastrado como `1` significa `0,01` ponto percentual de comissão.

---

## 6. Como o sistema calcula regra fixa por produto ou pacote

Quando a regra de produto ou de pacote não usa `rule_id`, o sistema trata a configuração como regra fixa.

Comportamento atual:

- `pctMeta < 100` usa `fix_meta_nao_atingida`
- `100 <= pctMeta < 120` usa `fix_meta_atingida`
- `pctMeta >= 120` usa `fix_super_meta`

Isso vale tanto para:

- `product_commission_rule`
- `product_commission_rule_pacote`

---

## 7. Produtos diferenciados e meta de produto

Hoje existem 2 camadas diferentes relacionadas a produto.

## 7.1. Produto com `regra_comissionamento = diferenciado`

Quando o tipo de produto está marcado como `diferenciado`, o sistema trata esse produto de forma especial.

Comportamento atual em `operacao/comissionamento` e `relatorios/vendas`:

- primeiro ele tenta usar a regra do pacote
- se não houver, usa a regra base do produto
- a aplicação é fixa, via `calcularPctFixoProduto`
- a referência de meta usada é:
  - `pctMetaProduto`, se existir meta em `metas_vendedor_produto`
  - caso contrário, `pctMetaGeral`

Ou seja:

- produto diferenciado não depende obrigatoriamente da meta geral
- se existir meta específica mensal do produto, ela passa a ser a referência daquele produto

## 7.2. Produto com meta extra (`usa_meta_produto`)

Esta é outra camada, diferente da anterior.

Quando o tipo de produto possui:

- `usa_meta_produto = true`
- `meta_produto_valor > 0`
- `comissao_produto_meta_pct > 0`

O sistema verifica se aquele produto bateu a meta interna configurada.

Se bateu, o sistema gera um extra de comissão.

A forma desse extra depende de `descontar_meta_geral`:

- se `descontar_meta_geral = false`, entra o percentual inteiro da meta do produto
- se `descontar_meta_geral = true`, entra só a diferença entre a comissão do produto e a comissão já aplicada pela regra geral

Em termos práticos:

- `descontar_meta_geral = false` = comissão do produto entra cheia
- `descontar_meta_geral = true` = entra só o adicional acima da comissão já existente

---

## 8. Conciliação

## 8.1. O que a conciliação pode fazer

Se `parametros_comissao.conciliacao_sobrepoe_vendas = true`, a conciliação pode substituir o recibo/venda operacional por um recibo sintético vindo da conciliação.

Na prática, o sistema:

1. busca documentos efetivados em `conciliacao_recibos`
2. monta recibos efetivos de conciliação
3. gera vendas sintéticas via `buildConciliacaoSyntheticVendas`
4. remove da base original os recibos operacionais ligados àqueles recibos conciliados

## 8.2. Campos de override da conciliação

Quando a conciliação entra, ela pode preencher:

- `valor_bruto_override`
- `valor_meta_override`
- `valor_liquido_override`
- `valor_comissao_loja`
- `percentual_comissao_loja`
- `faixa_comissao`
- `is_seguro_viagem`

Esses campos alteram diretamente a base do cálculo.

## 8.3. Cancelamento no mesmo mês

Existe uma regra importante de limpeza de base:

- se um recibo foi cancelado por conciliação no mesmo mês da venda, ele é removido da base de cálculo

Essa limpeza é feita por `filterRecibosCanceladosMesmoMes`.

## 8.4. Faixas da conciliação

O sistema resolve a faixa da conciliação com base em:

- `faixa_comissao`, quando vier preenchida
- ou `percentual_comissao_loja`
- ou `is_seguro_viagem`

Fallback padrão atual:

- seguro viagem ou percentual `>= 32` usa `SEGURO_32_35`
- percentual `>= 10` e `< 32` usa `MAIOR_OU_IGUAL_10`
- abaixo disso usa `MENOR_10`

## 8.5. Dois resultados possíveis da conciliação

A conciliação pode resultar em 2 caminhos:

### Caminho A: `CONCILIACAO`

Se a faixa configurada manda calcular por conciliação, o sistema usa a regra da própria faixa conciliada.

### Caminho B: `PRODUTO_DIFERENCIADO`

Se a faixa estiver configurada como `PRODUTO_DIFERENCIADO`, a conciliação não impõe a regra dela. Nesse caso, o sistema volta ao fluxo normal de produto/pacote.

Isso é muito importante para auditoria.

Nem toda venda conciliada usa a régua da conciliação. Algumas apenas usam os valores conciliados como base e mantêm a regra do produto/pacote.

---

## 9. Vendas lançadas manualmente

## 9.1. O que é salvo no recibo manual

No cadastro manual, cada recibo salva principalmente:

- `produto_id` = tipo de produto
- `produto_resolvido_id` = produto operacional resolvido
- `tipo_pacote`
- `valor_total`
- `valor_taxas`
- `valor_du`
- `valor_rav`
- `data_inicio`
- `data_fim`

## 9.2. DU e RAV

No cadastro manual, `DU` e `RAV` só aparecem e só são gravados em cenários específicos de tipo de pacote/tipo de produto.

Se a tela entender que aquele recibo não usa DU/RAV, os campos são zerados no payload.

## 9.3. Pagamentos não comissionáveis na venda manual

Ao salvar manualmente, o sistema:

1. soma os pagamentos
2. identifica quais não pagam comissão
3. grava:
   - `valor_total_pago`
   - `valor_nao_comissionado`
   - `valor_total` da venda como valor comissionável

Fórmula gravada na venda:

```text
valor_nao_comissionado = soma dos pagamentos não comissionáveis
valor_total = total_pago - valor_nao_comissionado
```

Observação importante:

- isso altera a venda consolidada, mas a comissão posterior continua sendo recalculada em nível de recibo pelos módulos de comissão/relatório.

## 9.4. Desconto comercial manual

A venda manual grava também:

- `desconto_comercial_aplicado`
- `desconto_comercial_valor`

Esse desconto entra de forma diferente conforme o módulo, como explicado mais abaixo na seção de diferenças entre módulos.

---

## 10. Contratos importados

## 10.1. Data da venda importada

Na importação, existe uma proteção importante:

```text
data_venda_final = min(data_venda_informada, data_lancamento_de_hoje)
```

Ou seja:

- a importação não deixa a `data_venda` ficar no futuro em relação à data do lançamento/importação

## 10.2. O que é salvo nos recibos importados

Na importação, cada contrato gera um recibo com:

- `produto_id` = tipo de produto
- `produto_resolvido_id` = produto operacional resolvido/criado
- `tipo_pacote`
- `valor_total` = `total_pago` do contrato, ou `total_bruto` se necessário
- `valor_taxas`
- `valor_du`
- datas de início e fim

Observação importante:

- na importação atual, o payload do recibo importado não grava `valor_rav`
- na prática, importação e cadastro manual não estão iguais nesse ponto

## 10.3. Pagamentos importados

A importação deduplica pagamentos e resolve/cria a forma de pagamento.

Depois disso:

- identifica `paga_comissao`
- soma créditos não comissionáveis
- grava em `vendas_pagamentos`
- atualiza `vendas.valor_nao_comissionado`
- atualiza `vendas.valor_total` com o valor comissionável

A lógica de não comissionável é a mesma ideia do cadastro manual:

```text
valor_total_comissionavel = total_pago_final - total_creditos_nao_comissionados
```

## 10.4. Tipo de produto na importação

A importação tenta resolver o tipo de produto a partir de:

- hint do contrato
- nome do produto principal
- nome do destino
- palavras-chave como seguro, aéreo, carro, hotel, ingresso

Depois disso, ela resolve ou cria o produto operacional correspondente na cidade/destino.

---

## 11. `operacao/comissionamento`

Este módulo é hoje a principal referência de cálculo detalhado por produto/pacote.

## 11.1. Base do período

A consulta usa:

- `vendas_recibos.data_venda` para determinar competência
- apenas vendas não canceladas
- limpeza de recibos cancelados por conciliação no mesmo mês
- opcionalmente substituição por vendas sintéticas de conciliação

## 11.2. Como a meta geral é montada

O sistema só soma na meta geral os produtos cujo tipo tenha `soma_na_meta = true`.

Isso é extremamente importante.

Nem todo produto necessariamente soma na meta geral.

## 11.3. Como o bucket de comissão é formado

O agrupamento real da comissão em `operacao/comissionamento` usa esta chave lógica:

- produto de comissão
- tipo de pacote normalizado
- origem base ou conciliação
- faixa de comissão da conciliação
- percentual de comissão da loja na conciliação

Isso significa que 2 recibos do mesmo produto podem cair em buckets diferentes se:

- o tipo de pacote for diferente
- a conciliação trouxer faixas/percentuais diferentes

## 11.4. Como a comissão em valor é calculada

Comportamento atual:

```text
comissao_em_valor = liquido_do_bucket * pct_comissao_final / 100
```

A base em valor é sempre o líquido do recibo/bucket.

## 11.5. Meta de produto extra

Este módulo aplica a lógica de meta de produto extra (`usa_meta_produto`, `meta_produto_valor`, `comissao_produto_meta_pct`).

## 11.6. Tratamentos especiais de exibição

Este módulo separa visualmente alguns grupos como:

- Passagem Facial
- Seguro Viagem
- Comissão + Seguro

Essas separações são de KPI/exibição, mas a base de cálculo continua obedecendo a hierarquia descrita acima.

---

## 12. `relatorios/vendas`

Hoje o relatório tenta espelhar a lógica de `operacao/comissionamento` para a coluna `%` e para o valor de comissão por recibo.

## 12.1. Período padrão

O relatório abre por padrão no mês corrente.

A competência do relatório usa `data_venda` do recibo.

## 12.2. Resumo do relatório

O resumo hoje é carregado com base completa do período selecionado, e não só com a página atual.

Ou seja:

- o card de resumo procura refletir todos os recibos do recorte do período
- a paginação não deveria mais reduzir os KPIs do resumo

## 12.3. Coluna `%`

A coluna `%` do relatório usa a base completa do período e do vendedor, e não apenas os recibos visíveis na página.

Isso é importante porque:

- filtros locais de tabela podem esconder linhas
- mas a comissão percentual precisa continuar respeitando o contexto completo do mês/período

## 12.4. Regra usada na linha do relatório

Hoje a linha do relatório segue esta ordem:

1. conciliação, se a faixa mandar calcular por conciliação
2. regra por tipo de pacote
3. regra base do tipo de produto
4. regra fixa ou `commission_rule`
5. meta de produto extra, se aplicável

## 12.5. Base da comissão em valor no relatório

Hoje o relatório calcula o valor da comissão com esta lógica:

```text
comissao_recibo = liquido_recibo * pct_recibo / 100
```

Ou seja, assim como em `operacao/comissionamento`, o relatório usa o líquido do recibo como base do valor da comissão.

## 12.6. Pagamentos não comissionáveis no relatório

O relatório carrega e calcula pagamentos não comissionáveis.

Ele também chega a montar `valor_comissionavel` por recibo com fator proporcional.

Porém, na implementação atual, a coluna de comissão e a coluna `%` **não usam esse fator proporcional** no cálculo final do recibo.

Na prática atual:

- o relatório considera `desconto comercial` e `valor_nao_comissionado` para montar contexto auxiliar
- mas o cálculo final da comissão por recibo usa o líquido puro do recibo
- portanto, hoje o relatório não reduz a comissão da linha proporcionalmente ao pagamento não comissionável

Essa é uma observação importante de auditoria.

## 12.7. Campo exibido na tabela

Hoje a tabela do relatório mostra `Tipo de pacote` no lugar de `Tipo de produto`.

Isso foi alinhado justamente para facilitar a leitura da regra aplicada por pacote.

---

## 13. `fechamento de comissão`

O fechamento não é igual ao módulo de comissionamento detalhado.

Ele tem uma lógica própria.

## 13.1. Base principal do fechamento

O fechamento parte de:

- `commission_templates`
- `parametros_comissao`
- meta do vendedor no período
- vendas/recibos do período

## 13.2. Template primeiro, override depois

O fluxo real do fechamento é:

1. calcula o `% base` pelo template (`commission_templates`)
2. depois ajusta esse percentual por produto/pacote/conciliacao
3. pondera pelo líquido efetivamente comissionável

Ou seja, o fechamento começa no template e depois tenta refinar.

## 13.3. Pagamentos não comissionáveis no fechamento

Diferente de `operacao/comissionamento` e `relatorios/vendas`, o fechamento **aplica fator proporcional** por venda com base em:

- desconto comercial explícito
- pagamentos não comissionáveis

Fórmula prática do fator:

```text
base_comissionavel = total_bruto_venda - desconto_aplicado - nao_comissionado
fator = base_comissionavel / total_bruto_venda
```

Esse fator é aplicado sobre bruto, taxas, líquido e base de meta quando a venda não é override de conciliação.

## 13.4. Meta de produto extra no fechamento

Hoje o fechamento **não implementa a mesma camada de meta de produto extra** presente em `operacao/comissionamento` e `relatorios/vendas`.

Ou seja:

- ele considera template
- considera produto/pacote
- considera conciliação
- mas não replica a lógica completa de `usa_meta_produto` + `meta_produto_valor` + `comissao_produto_meta_pct`

Isso é uma divergência real entre módulos.

---

## 14. Ranking de vendas

O ranking não é um módulo de comissão. Ele é um módulo de desempenho/meta.

## 14.1. Base do ranking

O ranking usa:

- período mensal
- vendedor/equipe/empresa conforme perfil
- meta geral por vendedor
- base de meta calculada por recibo

## 14.2. Fórmula-base do ranking

A base usada no ranking é:

- líquido, se `foco_valor = liquido`
- bruto, se `usar_taxas_na_meta = true`
- líquido nos demais casos

## 14.3. Diferença importante do ranking para comissão

Hoje o ranking não espelha integralmente o líquido da comissão.

Na implementação atual:

- o ranking usa `valor_total` como bruto
- usa `valor_taxas` direto
- o líquido padrão fica `bruto - taxas`
- ele não faz o mesmo tratamento de `RAV` e `DU` da comissão detalhada quando não há override

Em outras palavras:

- ranking e comissão não são iguais por definição técnica atual
- o ranking mede desempenho/meta do período
- não é um espelho 1:1 do cálculo do recibo com DU/RAV

## 14.4. Conciliação no ranking

O ranking também pode usar vendas sintéticas de conciliação.

Se houver conciliação efetivada no período, ele monta linhas sintéticas semelhantes ao restante do sistema.

## 14.5. Ranking de seguro

O ranking trata seguro mais como agrupamento de produto/meta do que como regra especial de comissão.

Ele usa o produto/tipo identificado como seguro para montar ranking de produto e título de exibição.

---

## 15. Seguro Viagem

O seguro aparece em mais de um nível no sistema.

## 15.1. Como o sistema reconhece seguro

Em vários pontos, o sistema reconhece seguro por nome do produto/tipo contendo `seguro`.

Na conciliação, também pode haver o flag explícito `is_seguro_viagem`.

## 15.2. Efeito do seguro na conciliação

Quando a conciliação sinaliza seguro, o fallback de faixa tende a cair na faixa `SEGURO_32_35`.

Isso pode fazer o seguro seguir regra de conciliação diferente dos demais produtos.

## 15.3. Efeito do seguro em KPIs

No módulo de comissionamento, o seguro também aparece em KPIs específicos de exibição, como:

- comissão de seguro viagem
- comissão + seguro

## 15.4. Seguro não é sempre uma regra separada

Fora a conciliação e a identificação por nome, o seguro continua obedecendo a mesma hierarquia geral:

- pacote
- produto
- rule/fixo
- meta extra de produto, se configurada

---

## 16. Diferenças reais entre os módulos hoje

Esta seção é uma das mais importantes do documento.

Hoje o sistema **não aplica exatamente a mesma lógica em todos os módulos**.

## 16.1. `operacao/comissionamento`

- usa recibo como base principal
- usa líquido do recibo como base de comissão
- aplica regra por pacote/produto/conciliacao
- aplica meta de produto extra
- não reduz explicitamente a comissão por fator proporcional de pagamento não comissionável no cálculo principal atual

## 16.2. `relatorios/vendas`

- tenta espelhar `operacao/comissionamento`
- usa líquido do recibo como base de comissão
- aplica pacote/produto/conciliacao
- aplica meta de produto extra
- carrega pagamentos não comissionáveis, mas hoje não aplica esse fator proporcional na comissão final da linha

## 16.3. `fechamento de comissão`

- começa pelo template de comissão
- depois pondera por pacote/produto/conciliacao
- aplica fator proporcional por desconto e pagamento não comissionável
- hoje não replica a camada de meta de produto extra

## 16.4. `ranking de vendas`

- é meta/desempenho, não comissão
- usa base mensal
- não replica o tratamento completo de DU/RAV do cálculo de comissão

Conclusão prática:

- `operacao/comissionamento` e `relatorios/vendas` estão mais próximos entre si
- `fechamento` tem comportamento parcialmente diferente
- `ranking` tem objetivo diferente e também cálculo-base diferente

---

## 17. Checklist prático para auditar um recibo com divergência

Quando um recibo parecer errado, este é o caminho mais seguro para investigar.

## Etapa 1. Confirmar o produto de comissão

Verificar no recibo:

- `produto_id` do recibo
- `produto_resolvido_id`
- `tipo_pacote`

Pergunta-chave:

- a regra está sendo lida pelo tipo de produto correto?

## Etapa 2. Confirmar a chave limpa do tipo de pacote

Verificar:

- valor visual do `tipo_pacote`
- valor limpo sem texto final entre parênteses

Pergunta-chave:

- existe regra em `product_commission_rule_pacote` para essa chave limpa?

## Etapa 3. Confirmar se existe regra por pacote

Se existir regra por pacote:

- ela deveria ganhar da regra base do produto

Se não existir:

- a regra deve subir para `product_commission_rule`

## Etapa 4. Confirmar se a regra é fixa ou escalonável

Verificar:

- se existe `rule_id`
- se existem percentuais `fix_*`
- se a `commission_rule` é `GERAL` ou `ESCALONAVEL`

## Etapa 5. Confirmar a meta usada

Verificar:

- `pctMetaGeral`
- se existe `metas_vendedor_produto` para aquele produto
- se o produto é `diferenciado`
- se o produto usa `meta_produto_valor`

Pergunta-chave:

- esse produto está olhando para meta geral, meta do produto do mês ou meta extra do tipo?

## Etapa 6. Confirmar se houve conciliação

Verificar no recibo:

- `valor_*_override`
- `percentual_comissao_loja`
- `faixa_comissao`
- `is_seguro_viagem`

Pergunta-chave:

- a conciliação assumiu a regra ou apenas sobrepôs os valores?

## Etapa 7. Confirmar se o módulo é comissão, fechamento, ranking ou relatório

Pergunta-chave:

- estamos comparando módulos equivalentes?

Hoje esta pergunta é obrigatória, porque os módulos ainda não são perfeitamente simétricos.

---

## 18. Resumo executivo da hierarquia correta do sistema hoje

Se quisermos resumir o sistema atual em poucas linhas, ele funciona assim:

1. A venda grava contexto, mas a comissão nasce principalmente do recibo.
2. O tipo de produto do recibo é a base principal da regra.
3. O tipo de pacote tem prioridade máxima quando existe regra para ele.
4. O texto visual entre parênteses no tipo de pacote é ignorado na hora de casar regra.
5. A comissão em valor usa base líquida do recibo nos módulos principais.
6. A conciliação pode substituir recibos inteiros e também pode impor regra própria.
7. Produtos diferenciados e meta de produto são camadas separadas.
8. Ranking não é espelho da comissão.
9. Fechamento não é idêntico ao relatório/comissionamento.
10. Pagamentos não comissionáveis existem no cadastro/importação, mas o uso deles ainda não é uniforme entre todos os módulos.

---

## 19. Pontos que merecem revisão futura

Com base no código atual, os pontos abaixo merecem atenção especial porque podem gerar divergência entre expectativa de negócio e resultado real:

1. Uniformizar o uso de `valor_nao_comissionado` e desconto comercial entre `comissionamento`, `relatório` e `fechamento`.
2. Uniformizar a camada de `meta_produto` entre `comissionamento`, `relatório` e `fechamento`.
3. Decidir se `ranking` deve continuar com base própria ou se deve espelhar DU/RAV da comissão.
4. Revisar se toda importação deveria gravar `RAV` quando aplicável, para manter simetria com o cadastro manual.
5. Criar diagnóstico por recibo exibindo:
   - produto de comissão
   - tipo de pacote limpo
   - regra aplicada
   - `% meta geral`
   - `% meta produto`
   - origem da regra: pacote, produto, conciliação ou meta extra

---

## 20. Conclusão

Hoje o sistema já possui uma hierarquia consistente de comissão, mas ela está espalhada em módulos com objetivos diferentes.

A estrutura real atual pode ser resumida assim:

- `tipo_pacote` manda primeiro
- depois vem a regra do tipo de produto
- depois a `commission_rule` ou o fixo
- conciliação pode sobrepor tudo ou apenas parte
- meta de produto pode adicionar uma camada extra
- relatório, fechamento e ranking ainda não são 100% idênticos entre si

Por isso, sempre que houver divergência, o melhor caminho é validar primeiro:

- qual módulo está sendo comparado
- qual recibo está sendo usado
- qual produto de comissão foi lido
- qual tipo de pacote limpo foi usado
- qual meta serviu de referência

