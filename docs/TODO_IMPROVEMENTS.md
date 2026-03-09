# Melhorias no Sistema de To Do

**Data:** 16/02/2026  
**Issue:** #1 - Item 4  
**Status:** ✅ Implementado

## Visão Geral

O sistema de To Do foi completamente reformulado para proporcionar melhor organização, visualização e usabilidade. As melhorias incluem agrupamento por categoria, modo de visualização compacto, suporte a arquivos e redesign da interface.

## Principais Melhorias Implementadas

### 1. 🎨 Cor nas Categorias (Não nos Itens)

**Antes:**
- Cada item To Do tinha sua própria cor
- Inconsistência visual dentro da mesma categoria
- Dificultação na identificação rápida por categoria

**Depois:**
- Cor definida **apenas na categoria**
- Todos os itens herdam a cor da categoria
- Consistência visual e melhor organização
- Paleta de 24 cores disponíveis

**Impacto no Banco de Dados:**
```sql
-- Adicionada coluna cor nas categorias
alter table public.todo_categorias
  add column if not exists cor text;

-- Removida coluna cor dos itens (herdada da categoria)
alter table public.agenda_itens
  drop column if exists cor;
```

### 2. 📋 Agrupamento por Categoria

**Modo Kanban:**
- Itens agrupados visualmente por categoria dentro de cada coluna
- Cabeçalho com nome e cor da categoria
- Facilita identificação de tarefas relacionadas

**Exemplo Visual:**
```
┌────────────────────┐
│ A FAZER              │
├────────────────────┤
│ [DESENVOLVIMENTO]     │  ← Categoria 1
│  ● Tarefa A         │
│  ● Tarefa B         │
│                      │
│ [REUNIÕES]           │  ← Categoria 2
│  ● Tarefa C         │
│  ● Tarefa D         │
└────────────────────┘
```

### 3. 📄 Campo Arquivo

**Nova Funcionalidade:**
- Campo opcional para adicionar URL de arquivo/documento
- Suporte a links externos (Google Drive, Dropbox, etc.)
- Exibido na área de detalhes expansíveis
- Links clicáveis que abrem em nova aba

**Exemplo de Uso:**
- Anexar documentação de requisitos
- Link para planilhas relacionadas
- Compartilhar apresentações
- Referências externas

### 4. 📊 Modos de Visualização

#### Modo Kanban (Padrão)
- Visualização em colunas (A Fazer, Fazendo, Feito)
- Cards com bordas coloridas pela categoria
- Agrupamento visual por categoria
- Ideal para gerenciamento de fluxo de trabalho

#### Modo Lista Simples
- Visualização compacta em linhas
- Melhor para quando há muitos itens
- Informações condensadas em uma única linha:
  - Checkbox de conclusão
  - Título
  - Badge da categoria
  - Prioridade
  - Botão para expandir detalhes
  - Ações (editar/excluir)

**Seletor:**
- Dropdown no cabeçalho da lista
- Alterna entre "Kanban" e "Lista Simples"
- Preferência salva na sessão

### 5. ➕ Descrição Expansível

**Problema Anterior:**
- Descrições longas ocupavam muito espaço
- Dificuldade em ver muitos itens na tela
- Poluição visual

**Solução:**
- Descrição oculta por padrão
- Botão **"+"** circular com cor da categoria
- Clique expande e mostra:
  - Descrição completa
  - Link do arquivo (se existir)
- Botão muda para **"−"** quando expandido
- Clique novamente para recolher

**Benefícios:**
- Interface mais limpa
- Mais itens visíveis simultaneamente
- Detalhes disponíveis sob demanda

### 6. 🧹 Cabeçalho Compacto

**Otimizações:**
- Redução de padding e margens
- Fonte menor (14px ao invés de 16px)
- Remoção de espaçamentos desnecessários
- Altura das colunas reduzida

**Ganhos:**
- ~30% mais espaço útil na tela
- Melhor aproveitação em resoluções menores
- Visualização de mais itens sem scroll

### 7. 🔽 Botões no Rodapé

**Antes:**
- Botões misturados com o título
- Layout desorganizado
- Título com menos destaque

**Depois:**
- Botões movidos para rodapé do card
- Área separada por borda superior
- Dois grupos:
  - **Esquerda:** Botões de movimentação (◀ ▶)
  - **Direita:** Checkbox, Editar, Excluir

**Layout:**
```
┌─────────────────────────────────┐
│ Título da Tarefa            [+]│
├─────────────────────────────────┤
│ [Categoria] ● Prioridade    │
├─────────────────────────────────┤
│ [◀] [▶]         [☐] [✎] [🗑]│
└─────────────────────────────────┘
```

## Implementação Técnica

### Arquivos Modificados

1. **`database/migrations/20260216_todo_improvements.sql`**
   - Adiciona coluna `cor` na tabela `todo_categorias`
   - Adiciona coluna `arquivo` na tabela `agenda_itens`
   - Migra cores existentes dos itens para categorias
   - Remove coluna `cor` de `agenda_itens`

2. **`src/components/islands/TodoBoard.tsx`**
   - Novo state `viewMode` (kanban | lista)
   - Novo state `expandedItems` (Set de IDs expandidos)
   - Nova função `toggleExpand(id)`
   - Nova função `renderTodoCard()` com lógica condicional
   - Agrupamento `cardsByCategory` usando `useMemo`
   - Seletor de cor movido para categorias
   - Campo arquivo no formulário de To Do

### Novos Estados React

```typescript
const [viewMode, setViewMode] = useState<ViewMode>("kanban");
const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
const [catCor, setCatCor] = useState<string>(PALETTE[0].hex);
const [todoArquivo, setTodoArquivo] = useState("");
const [showCatColor, setShowCatColor] = useState(false);
```

### Estrutura de Agrupamento

```typescript
const cardsByCategory = useMemo(() => {
  const grouped: Record<string, any[]> = {};
  cards.forEach((card: any) => {
    const key = card.categoria_id || "sem_categoria";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(card);
  });
  return grouped;
}, [cards]);
```

### Renderização Condicional

```typescript
const renderTodoCard = (card: any, col: any) => {
  const isExpanded = expandedItems.has(card.id);
  const hasDetails = card.descricao || card.arquivo;

  if (viewMode === "lista") {
    // Renderiza modo lista
    return <div>...</div>;
  }

  // Renderiza modo kanban
  return <div>...</div>;
};
```

## Fluxo de Uso

### Criar Categoria com Cor

1. Clicar em "Nova Categoria"
2. Digitar nome da categoria
3. Selecionar cor da paleta (24 opções)
4. Salvar

### Criar To Do

1. Clicar em "+ Novo To Do"
2. Preencher:
   - Título (obrigatório)
   - Prioridade (Alta/Média/Baixa)
   - Categoria (herdará a cor)
   - Descrição (opcional)
   - Arquivo/Link (opcional)
3. Salvar
4. Item aparece na coluna "A Fazer"
5. Cor da borda = cor da categoria

### Visualizar Detalhes

1. Clicar no botão **"+"** circular
2. Card expande mostrando:
   - Descrição completa
   - Link do arquivo (clicável)
3. Clicar em **"−"** para recolher

### Alternar Modo de Visualização

1. No cabeçalho, usar dropdown
2. Selecionar "Kanban" ou "Lista Simples"
3. Interface atualiza instantaneamente

### Movimentar Itens

**Opção 1: Botões no Rodapé**
- Botão ◀ move para coluna anterior
- Botão ▶ move para próxima coluna

**Opção 2: Checkbox**
- Marcar checkbox move direto para "Feito"
- Desmarcar retorna para "Fazendo"

## Benefícios da Implementação

### Organização
- ✅ Agrupamento visual por categoria
- ✅ Consistência de cores
- ✅ Hierarquia clara de informações

### Performance Visual
- ✅ Interface mais limpa
- ✅ 30% mais espaço útil
- ✅ Mais itens visíveis sem scroll

### Usabilidade
- ✅ Detalhes sob demanda (botão +)
- ✅ Dois modos de visualização
- ✅ Botões organizados no rodapé
- ✅ Suporte a arquivos/links

### Flexibilidade
- ✅ Escolha entre Kanban e Lista
- ✅ Expansão individual de itens
- ✅ Paleta de 24 cores para categorias

## Comparação Antes/Depois

### Espaço Ocupado por Item

| Aspecto | Antes | Depois (Compacto) | Economia |
|---------|-------|-------------------|----------|
| Altura mínima do card | 140px | 95px | 32% |
| Altura com descrição | 200px+ | 95px (expandir +) | 52%+ |
| Padding cabeçalho | 16px | 10px | 38% |
| Font-size título | 16px | 14px | — |

### Itens Visíveis em Tela 1080p

- **Antes:** ~4-5 itens por coluna
- **Depois (compacto):** ~7-8 itens por coluna
- **Ganho:** +60% de itens visíveis

## Testes Recomendados

### Teste 1: Criar Categoria com Cor
1. Criar categoria "Desenvolvimento" com cor verde
2. Criar categoria "Marketing" com cor roxa
3. **Espera-se:** Badges coloridos na seção de categorias

### Teste 2: Herança de Cor
1. Criar To Do na categoria "Desenvolvimento"
2. **Espera-se:** Borda esquerda do card em verde
3. Badge da categoria em verde

### Teste 3: Agrupamento
1. Criar 3 To Dos em "Desenvolvimento"
2. Criar 2 To Dos em "Marketing"
3. **Espera-se:** Itens agrupados por categoria nas colunas
4. Cabeçalhos de categoria visíveis

### Teste 4: Expansão de Detalhes
1. Criar To Do com descrição longa
2. **Espera-se:** Descrição oculta, botão "+" visível
3. Clicar em "+"
4. **Espera-se:** Descrição expandida, botão vira "−"
5. Clicar em "−"
6. **Espera-se:** Descrição recolhida

### Teste 5: Campo Arquivo
1. Criar To Do com link de arquivo
2. Expandir detalhes
3. **Espera-se:** Link clicável exibido
4. Clicar no link
5. **Espera-se:** Abre em nova aba

### Teste 6: Modo Lista
1. Alternar para "Lista Simples"
2. **Espera-se:** Layout em linhas compactas
3. Informações principais visíveis inline
4. Botão "+" para expandir mantido

### Teste 7: Botões no Rodapé
1. Verificar posição dos botões
2. **Espera-se:** ◀ ▶ à esquerda
3. ☐ ✎ 🗑 à direita
4. Separados por borda superior

### Teste 8: Responsividade Mobile
1. Acessar em dispositivo móvel
2. **Espera-se:** Tabs de filtro por status
3. Botão FAB "+" no canto inferior direito
4. Modo lista funcional

## Migração de Dados

A migration `20260216_todo_improvements.sql` cuida automaticamente de:

1. **Migrar cores existentes:**
   - Pega a cor mais comum dos itens de cada categoria
   - Define como cor padrão da categoria

2. **Definir cor padrão:**
   - Categorias sem cor recebem `#9ae6c7` (verde claro)

3. **Limpeza:**
   - Remove coluna `cor` dos itens após migração

**⚠️ Atenção:** Execute a migration em ambiente de desenvolvimento primeiro!

## Próximos Passos (Opcional)

### Melhorias Futuras

1. **Drag & Drop:**
   - Arrastar cards entre colunas
   - Reordenar dentro das categorias

2. **Filtros Avançados:**
   - Filtrar por categoria
   - Filtrar por prioridade
   - Busca por texto

3. **Upload de Arquivo:**
   - Upload direto ao invés de apenas URL
   - Integração com storage (Supabase Storage)

4. **Estatísticas:**
   - Gráfico de conclusão por categoria
   - Taxa de conclusão semanal
   - Tempo médio por tarefa

5. **Colaboração:**
   - Atribuir To Dos a membros da equipe
   - Comentários em tarefas
   - Notificações de atualizações

6. **Templates:**
   - Criar templates de To Dos recorrentes
   - Duplicar tarefas existentes

## Referências

- **Issue Original:** [#1 - Item 4](https://github.com/allima97/sgtur/issues/1)
- **Migration:** `database/migrations/20260216_todo_improvements.sql`
- **Componente:** `src/components/islands/TodoBoard.tsx`
- **Commits:**
  - Migration: [09580e0](https://github.com/allima97/sgtur/commit/09580e08c1e6e8e439182e4ffb405211020ab5b9)
  - Componente: [f8b4f7b](https://github.com/allima97/sgtur/commit/f8b4f7b711318b58bdb0948fba367a3c4dd92c7a)

## Suporte

Em caso de dúvidas ou problemas:
1. Verificar migração foi executada corretamente
2. Limpar cache do navegador
3. Verificar console do navegador para erros
4. Criar issue no repositório com detalhes
