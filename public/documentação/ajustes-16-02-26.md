Cronogframa de ajustes

veja que fizemos alguns ajustes ontem e hoje, porém muitas coisas estão pendentes, portanto precisamos dar continuidade com o cronograma abaixo e resolver TODOS OS PROBLEMAS do sistema:

# ALTA PRIORIDADE ---> Ao tentar npm run build ou npm run dev está dando o erro ---> Error when evaluating SSR module /Users/allima97/Documents/GitHub/sgtur/astro.config.mjs: Identifier '__vite_ssr_export_default__' has already been declared

### 1-) Importação Vendas - Reservas Duplicadas

Permitir importação somente de número Reservas Duplicadas, DESDE QUE: Contratante / Número de Recibo sejam diferentes, POIS A LÓGICA É QUE TRATA-SE DA MESMA VIAGEM, PORÉM TEMOS MAIS DE UM CONTRATANTE, OU SEJA, CADA UM PAGANDO SUA PARTE NA VIAGEM, E TRATA-SE DA MESMA VIAGEM, POR ISSO, DEVEMOS AUTOMATICAMENTE FAZER A RELAÇÃO DOS RECIBOS (VIAJA COM) QUE JÁ TEMOS EM RECIBOS COMPLEMENTARES (VIAJA COM), arrume o que foi feito, pois a importação de vendas está falhando, veja erros --> ggqmvruerbaqxthhnxrm.supabase.co/rest/v1/vendas_recibos?select=id%2Cnumero_recibo%2Cvenda_id&numero_recibo=in.%285630-0000080429%29&vendas.company_id=eq.104037a0-e143-4cb7-ae81-fc31da188ae4&limit=1:1  Failed to load resource: the server responded with a status of 400 ()

### 2-)Correção de Dashboard - Meta Irreal

Corrigir meta irreal no Dashboard, pois para um Vendedor aparece meta irreal, deveria ser por exem. 370.000 e aparece 2.437.000,00 , sendo que em Comissões aparece Corretamente, ou seja está somando a meta da loja + a meta do vendedor, mas isso só está acontecendo com um vendedor.

### 3-) Tela de Comissionamento - Campos Errados

Verificar os campos em Comissionamento (kpis), pois aparecem  alguns KPIs errados, aparece -> Produtos com meta geral e Vendas Diferenciadas.

### 4-) Correções em To Do

Vamos arrumar a apresentação da lista QUANDO EM MOBILE do to do, e vamos renomear para Tarefas, tanto no meu como no seção. A cor do botão de + do to do, vamos padronizar com o azul que estamos usando em todos os botões, E SEMPRE COLOCAR OS ITENS COM PRIORIDADE ALTA EM PRIMEIRO LUGAR DA LISTA

vamos mudar a palhete de cores das categoria para as cores da imagem anexa.

Vamos corrigir a visão em lista, QUANDO EM MOBILE, está ficando horrível a apresentação dos itens, o Kanban está melhor do que a apresentação da Lista  quando em mobile.

### 5-) Itens no Menu - Esconder

Vamos garantir que o usuário que NÃO TENHA permissão de acesso a um determinado item do menu (seção), logo o item NÃO DEVE APAREÇER para ele no menu.

### 6-) orcamentos/importar

Botões QUANDO EM DESKTOP, FORA DOS PADRÕES (O TAMANHO ESTÁ GIGANTE)

### 7-) Importação de Contrato

vamos permitir que o usuário possa editar todos os produtos importados antes de salvar o contrato importado, assim como abre a opção do produto principal, vamos permitir que ele também possa editar os outros itens quando a importação tiver vários contratos importados juntos.

### 8-) Opção Ajuda

QUANDO EM MOBILE, VAMOS MUDAR A AJUDA PARA FICAR COM UM BOTÃO NO MENU, SEMPRE VISIVEL, POIS O BOTÃO FLUTUANDO ETÁ ATRAPALHANDO ALGUNS FORMULÁRIOS

### 9-) Cor Fundo Mural de Recado

Vamos mudar a cor de fundo de onde estão listados os usuários do sistema pra utilizar o mesmo azul da cor dos botões do sistema

### 10-) dashboard

Vamos garantir que aparecem os orçamentos, próximas viagens, Aniversariantes do mês, Follow-Up e Consultoria online, SOMENTE PARA O VENDEDOR QUE PERTENCE A VENDA, POR EXEMPLO, SE A VENDA PERTENCE A UM DETERMINADO VENDEDOR, ELA NÃO PODE APARECER PARA OUTRO VENDEDOR, DA MESMA FORMA OS OUTROS ITENS. SOMENTE GESTOR(ES) OU MASTER(ES) PODEM VER DE TODOS!

também em, dashobard os card/box Vendas por destino está com tamanho diferente (maior) que os dois a seguir Vendas por produto e Evolução das vendas no período, vamos corrigir.

### 11-) CAMPANHAS (com item no menu e colocar tambpem nos módulos)
Criar seção de Campanhas Disparadas aos clientes, com possibilidade de subir imagens das campanhas, links de instagram, facebook, com data da campanha, validade, regras, se está ativa, inativa, cancelada e também possibilidade de editar, excluir.

---

# Status (executado em 16/02/2026)

## ✅ ALTA PRIORIDADE (build/dev)
- Corrigido erro no `npm run build`/`npm run dev` (SSR) ajustando `astro.config.mjs`.

## ✅ 1) Importação Vendas - Reservas Duplicadas
- Corrigida validação de duplicidade (PostgREST 400) fazendo join correto em `vendas_recibos` com `vendas`.
- Reserva duplicada agora é **permitida** apenas se **contratante (cliente_id) e número do recibo forem diferentes**; quando permitido, cria vínculo automático “Viaja com” (`vendas_recibos_complementares`) na importação.

## ✅ 2) Dashboard - Meta Irreal
- Ajustado filtro/cálculo de metas para evitar somar metas indevidas no dashboard individual do vendedor.

## ✅ 3) Comissionamento - Campos/KPIs
- Ajustados KPIs para exibir “Vendas Diferenciadas” e “Produtos com meta geral” apenas quando aplicável (respeitando flag de exibição por produto).

## ✅ 4) Tarefas (To Do)
- Renomeado “To Do” para **Tarefas** no menu/rota/título.
- Melhorada a lista no mobile (evita texto “em pé”, ações quebram linha, sem scroll duplo).
- Botão “+” padronizado no azul dos botões.
- Ordenação: prioridade **Alta** sempre vem primeiro.
- Paleta de cores das categorias atualizada conforme imagem.

## ✅ 5) Menu - Esconder itens sem permissão
- Itens e seções do menu agora aparecem apenas quando o usuário tem permissão.

## ✅ 6) orcamentos/importar
- Ajustado layout dos botões no desktop para não ficarem gigantes (padronização com `mobile-stack-buttons`).
- Corrigido overflow horizontal no mobile (menu inferior não “estoura” a largura da tela).

## ✅ Orçamentos (consulta) (mobile)
- Na consulta de orçamentos, os **6 ícones de ações** agora ficam alinhados em **uma única linha** no mobile (mesmo padrão de botões/ícones das outras telas).

## ✅ 7) Importação de Contrato
- Importação agora permite editar também os produtos/tipo de pacote dos contratos “secundários” antes de salvar.

## ✅ 8) Ajuda (mobile)
- Ajuda no mobile ficou como botão fixo no menu inferior; botão flutuante não aparece no mobile.

## ✅ Menu (mobile) — Atalhos padrão
- No menu inferior do mobile, mantidos por padrão: **Dashboard**, **Tarefas**, **Agenda**, **Vendas**, **Ajuda** e **Mais**; os demais itens ficam dentro de **Mais** (menu completo).

## ✅ Agenda (mobile)
- No mobile, removido “Agenda (Eventos)” e o nome do mês agora aparece centralizado e no mesmo tamanho.

## ✅ 9) Mural de Recados
- UI suavizada (menos cores pesadas, cards mais discretos).
- Implementado envio de **imagens e arquivos** via Storage + tabela de anexos (com preview e limpeza ao apagar recado).

## ✅ 10) Dashboard (escopo vendedor/gestor/master)
- Orçamentos, próximas viagens, aniversariantes, follow-up e consultoria agora respeitam escopo do vendedor; gestor/master continuam vendo pelo escopo.
- Ajustado tamanho/altura dos cards dos gráficos para padronizar.

## ✅ 11) Campanhas
- Criado módulo de **Campanhas** (CRUD + upload de anexo imagem/PDF + links + status + validade + regras) com item no menu.
- Permissões: **todos os usuários podem visualizar**; apenas **Gestor/Master** podem criar/editar/excluir.
- Anexo: opção de **pré-visualizar** no sistema e **baixar** quando desejar.
- Regra de atribuição: **MASTER** pode criar campanha para **todas as filiais**; **GESTOR** cria apenas para **sua própria filial**.

## ✅ Correção extra (17/02/2026) — Campanhas (mobile)
- Ajustado layout no mobile para seguir o padrão do sistema: ações não sobrepõem mais os elementos e botões de anexo/ações ficam menores e consistentes.
- Ações agora usam ícones padrão do sistema: **👁️** (visualizar), **⬇️** (baixar), **✏️** (editar) e **🗑️** (excluir).

## ✅ Migrações novas desta data (aplicar no Supabase)
1. `database/migrations/20260216_mural_recados_arquivos.sql`
2. `database/migrations/20260216_campanhas.sql`

## ✅ Correção extra (17/02/2026) — Tela de Login
- Restaurado layout/estilos da autenticação que haviam sido removidos em `src/styles/auth-extra.css`.

## ✅ Correção extra (17/02/2026) — Clientes (cadastro/histórico)
- Padronizado: “Adicionar acompanhante” aparece apenas no botão (sem texto repetido na seção) em `src/components/islands/ClientesIsland.tsx`.

## ✅ Melhoria extra (17/02/2026) — Nacionalidade (Clientes)
- Campo “Nacionalidade” agora inicia com **Brasileira** e possui sugestões (datalist) com as nacionalidades/países cadastrados (fallback automático) em `src/components/islands/ClientesIsland.tsx`.

## ✅ Correção extra (17/02/2026) — Permissões Master (403 / RLS em `modulo_acesso`)
- Corrigido erro **403 / 42501** (“new row violates row-level security policy”) ao salvar permissões no módulo Master.
- Ajustada a função `public.is_master_allowed_module(modulo)` para permitir módulos novos automaticamente (exceto `admin*` e `master*`).

## ✅ Migração nova (aplicar no Supabase)
1. `database/migrations/20260217_modulo_acesso_master_allowed_module_fix.sql`
2. `database/migrations/20260217_gestor_equipe_gestor_ids.sql`
3. `database/migrations/20260217_escalas_compartilhadas_gestor_base.sql`

## ✅ Correção extra (17/02/2026) — Agenda (mobile) (feriados longos)
- Em `operacao/agenda`, no mobile reduzido o tamanho do texto dos itens/feriados no calendário para evitar truncar/“sumir” em nomes longos.

## ✅ Correção extra (17/02/2026) — Escalas (legenda + folga)
- Em `parametros/escalas` e `Minha Escala`, legendas agora usam padrão `T - Trabalho`, `P - Plantão`, `F - Folga`, etc.
- Células com **Folga** agora exibem o texto “Folga” e ficam com fundo **laranja** (padronizado).

## ✅ Ajuste extra (17/02/2026) — Escalas (Gestor na equipe)
- Em `parametros/escalas`, quando o **MASTER** seleciona um gestor, a linha do **gestor** também aparece na tabela da escala (além dos vendedores).

## ✅ Ajuste extra (17/02/2026) — Escalas (Gestores na equipe compartilhada)
- Em `parametros/escalas`, quando existem **2+ gestores compartilhando a mesma equipe**, todos os gestores do grupo agora aparecem na tabela (para permitir revezamento com horários diferentes).

## ✅ Ajuste extra (17/02/2026) — Escalas (ordem alfabética)
- Em `parametros/escalas`, a ordem dos usuários na tabela agora segue **alfabética (A→Z)**, independente de ser vendedor ou gestor.

## ✅ Ajuste extra (17/02/2026) — Escalas (tabela única Master/Gestores)
- Quando existe **equipe compartilhada**, a escala mensal agora é **única** (salva/carregada sempre no **gestor base**), então qualquer alteração feita por **Master** ou por qualquer **Gestor** do grupo reflete para todos (prevalece a última alteração).
- Adicionado log de auditoria nas alterações de escala (`escala_dia_salva`, `escala_dia_removida`, `escala_dia_lote_salvo`, `escala_dia_lote_removido`).

## ✅ Ajuste extra (17/02/2026) — Equipe (Master)
- Em `parametros/equipe`, usuários **MASTER** agora podem acessar e gerenciar equipe/horários (mesmas ações do Gestor), sem bloquear com “Apenas gestores…”.

## ✅ Ajuste extra (17/02/2026) — Equipe (Horário de trabalho: gestores)
- Em `parametros/equipe` → “Horário de trabalho”, gestores da mesma loja agora aparecem em uma tabela própria (mesmas colunas/ações dos vendedores), permitindo configurar horários e auto-aplicar na Escala.
- Corrigido erro **400** ao salvar “Horários para toda a equipe” (upsert não deve enviar `id`, evitando `columns=...id` no PostgREST).
- No desktop, o botão **Novo usuário** agora fica alinhado no canto superior direito (padrão do sistema).

## ✅ Correção extra (17/02/2026) — Importar Contratos (dev) (Outdated Optimize Dep)
- Corrigido erro de hidratação no `vendas/importar` durante `npm run dev` (504 `Outdated Optimize Dep` do `lucide-react`) adicionando `lucide-react` em `vite.optimizeDeps.include` no `astro.config.mjs`.
- Corrigido também o erro 504 `Outdated Optimize Dep` do `jspdf` ao abrir `orcamentos/consulta` (PDF) adicionando `jspdf`/`jspdf-autotable` em `vite.optimizeDeps.include`.
- Para evitar travar a tela de orçamentos no dev caso o cache do Vite esteja desatualizado, a geração de PDF do orçamento agora é carregada **sob demanda** (dynamic import) ao clicar em “PDF”.
- Corrigido também o erro 504 `Outdated Optimize Dep` do `xlsx` ao abrir `operacao/controle-sac` adicionando `xlsx` em `vite.optimizeDeps.include` e carregando o Excel **sob demanda** no clique de exportação.
- Os relatórios (`relatorios/*`) também passaram a carregar o módulo de Excel **sob demanda** para evitar erro de hidratação quando o cache do Vite estiver desatualizado.
- PDFs de tabelas (relatórios/controle-sac) agora carregam `jspdf`/`jspdf-autotable` **sob demanda** via `src/lib/pdf.ts` (dynamic import), evitando erro de hidratação por depender dessas libs no load.
- No dev, adicionado auto-reload quando ocorrer erro de hidratação capturado pelo Astro (logado no console) ou erro de hooks (`Invalid hook call` / `useContext` null) após reotimização de deps.
- No `astro.config.mjs`, `vite.optimizeDeps` foi reforçado com `noDiscovery: true` + `force: true` e includes adicionais para reduzir reotimizações em runtime (principal causa do 504 `Outdated Optimize Dep` ao navegar entre telas).
- `xlsx` e `jspdf`/`jspdf-autotable` foram movidos para `optimizeDeps.exclude` (mantendo carregamento **sob demanda**) para reduzir ainda mais a chance de 504 `Outdated Optimize Dep` em relatórios/PDF no dev.
- Se voltar a ocorrer em ambiente local, use `npm run dev:clean` (limpa `node_modules/.vite`) e recarregue a página.
- Se aparecer “Port XXXX is in use”/`ENOTEMPTY` ao otimizar deps, verifique se não existem 2 instâncias do `astro dev` rodando ao mesmo tempo e finalize a antiga antes de iniciar novamente.

## ✅ Correção extra (17/02/2026) — Importar Contratos (mobile)
- No mobile, os botões **Extrair**, **Pré-visualizar PDF** e **Limpar** agora seguem o padrão `mobile-stack-buttons`.
- Upload do PDF padronizado com botão “Escolher arquivo” e texto “Nenhum arquivo escolhido” abaixo no mobile.

## ✅ Correção extra (17/02/2026) — Comissionamento (KPIs Progresso)
- Em `operacao/comissionamento` (card “Como está seu Progresso”), mantido apenas: **Meta do mês**, **Total Bruto**, **Taxas**, **Total Líquido** e **Vendas** (nessa ordem).

## ✅ Melhoria extra (17/02/2026) — Mural de Recados (UI)
- Layout do mural atualizado para um visual mais **clean/elegante** (estilo chat): sidebar clara com **busca**, lista com **avatares** e badge de não lidas, header com avatar/estado e bolhas com tema mais suave.

## ✅ Correção extra (17/02/2026) — Comissionamento (Valores a Receber)
- O card “**Seus Valores a Receber**” agora aparece sempre que houver resumo calculado (não fica oculto quando Gestor/Master está com filtro “Todos”).

## ✅ Correção extra (17/02/2026) — Mural de Recados (mobile overflow)
- Ajustado layout/CSS do mural no mobile para **não estourar a largura** (sem overflow horizontal): header quebra em linhas quando necessário, bubbles com `min-width: 0`, textos longos com ellipsis e quebra segura (`overflow-wrap`) para evitar “scroll” lateral.

## ✅ Correção extra (17/02/2026) — Mural de Recados (badge no menu)
- O item “Mural de Recados” no menu voltou a exibir **quantidade de mensagens não lidas** (atualiza via realtime + fallback com refresh/poll).
- Migração para corrigir o contador no Supabase (Master sem `company_id`/recados privados): `database/migrations/20260217_mural_recados_unread_count_fix.sql`.

## ✅ Ajuste extra (17/02/2026) — Consultoria (tabela clean)
- Padronizada a tabela “Consultorias agendadas” no mobile para o mesmo estilo clean das outras páginas (remove “gap” colorido/roxo atrás dos cards e mantém bordas neutras).

## ✅ Ajuste extra (17/02/2026) — Dossiê da Viagem (toolbar)
- No “Dossiê da Viagem”, exibido **Cliente: Nome** no mesmo card/toolbar dos botões **Voltar** e **Atualizar** (sem criar card extra no desktop; no mobile o cliente aparece dentro de um card/box roxo para não ficar “solto”).

## ✅ Melhoria extra (17/02/2026) — Tarefas (mobile UX)
- Em `operacao/todo`, removido o conteúdo de dentro de card/box no mobile para ganhar área útil e melhorar leitura.
- No mobile, o menu inferior em **Tarefas** vira um menu “dedicado”: **A Fazer**, **Fazendo**, **Feito** e **Categorias** (com cores por etapa), mantendo **Ajuda** e **Mais**.
- Adicionada visão **Categorias** no mobile (lista clean + contadores + ações) com botão **+ Categoria** e item fixo “Sem categoria”.
- No mobile, o cabeçalho de **A Fazer / Fazendo / Feito** agora segue as mesmas cores do desktop; o título **Tarefas** fica em um card/box branco separado como cabeçalho geral.

## ✅ Ajuste extra (17/02/2026) — Agenda/Controle SAC (mobile: datas/feriados)
- Em `operacao/agenda`, removido card/box duplicado; cadastro de evento fica fechado por padrão e abre **somente** via botão de adicionar (modal) — no mobile é o **+** flutuante.
- Em `operacao/agenda` (mobile), o mês fica em um card/box separado e o calendário em outro; os botões de visualização ficam no topo e o “Adicionar evento” virou botão flutuante **+** (mesmo padrão do To Do).
- Feriados na agenda agora ficam **somente com cor de fundo** na célula (sem texto) + tooltip no hover; lista “Feriados do Mês” aparece abaixo do calendário.
- Em `operacao/controle-sac` e `operacao/agenda`, campos `date/time` padronizados para ocupar **100% da largura** no mobile.

## ✅ Ajuste extra (17/02/2026) — Agenda (mobile: hidratação + semana)
- Corrigidos erros de hidratação (SSR/React) no calendário evitando renderizar o `FullCalendar` no servidor; o calendário só monta após detectar viewport no client (`viewportReady`), eliminando `className did not match`/`Hydration failed`.
- Semana (mobile) com cabeçalho/horários ainda menores e toolbar mais compacta (font/padding), evitando “encavalar” os dias sem depender de layout com scroll horizontal.
- Feriados (background) agora usam `title` vazio (mantendo o nome em `descricao`) para garantir que não apareça texto dentro da célula; o nome continua disponível no tooltip e na lista “Feriados do Mês”.
- Em mobile, os botões de visualização agora seguem a ordem **Mês / Semana / Dia / Lista** (sem estourar a tela).
- No week view (mobile), o cabeçalho do dia ficou em 2 linhas (ex: `Dom` e abaixo `15/02`).
- Na lista abaixo do calendário, o título agora é apenas **“Feriados do Mês”** (sem repetir o mês).
- Correção: removido o uso de configuração que exigia **ScrollGrid** (plugin premium), eliminando o erro `No ScrollGrid implementation` e a mensagem “Your license key is invalid. More Info” na Agenda.

## ✅ Ajuste extra (17/02/2026) — Layout (sessão + títulos)
- “Sessão ativa • XXm XXs” removido do topo (fica rodando em background); o usuário só vê o **aviso de sessão quase expirando** (modal) quando estiver prestes a encerrar.
- Reduzido espaçamento vertical de títulos e do wrapper (`page-content-wrap`) para subir o conteúdo; no desktop o título fica alinhado ao topo do menu (SGVTur).
- No mobile pequeno (<=640px), removido o “vazio” do topo: como o botão de menu superior fica oculto, o `app-main` não reserva mais espaço para ele.

## ✅ Ajuste extra (17/02/2026) — Consultoria/Campanhas (header padrão)
- Em `consultoria-online` e `operacao/campanhas`, o topo da página agora usa o padrão `HeaderPage` (título fora do card/box), com cor e descrição da seção como nas outras páginas.

## ✅ Ajuste extra (17/02/2026) — Mural de Recados (mobile: card duplicado)
- Em `operacao/recados`, removido o card/box externo (evita “card dentro de card” no mobile) e padronizado o cabeçalho usando `HeaderPage`.
