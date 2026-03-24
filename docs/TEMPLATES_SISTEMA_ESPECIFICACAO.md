# Especificação Técnica - Novo Sistema de Templates de Mensagens

## Visão Geral

Sistema de templates visuais (1080x1080px) com preenchimento automático de conteúdo. Templates possuem áreas delimitadas e VAZIAS que são preenchidas dinamicamente pelo sistema.

## Hierarquia de Templates

```
ADMIN (Sistema)
    └── Templates padrão disponíveis para TODOS os usuários
        └── MASTER (Empresa)
            └── Templates disponíveis para sua empresa
                └── GESTOR (Equipe)
                    └── Templates disponíveis para sua equipe
                        └── USUÁRIO (Individual)
                            └── Templates pessoais
```

### Regras de Visibilidade

1. **Admin**: Cria templates do sistema (visíveis para todos)
2. **Master**: Cria templates para sua(s) empresa(s) + vê templates do admin
3. **Gestor**: Cria templates para sua equipe + vê templates do master + vê templates do admin
4. **Vendedor**: Cria templates pessoais + vê templates do gestor + vê templates do master + vê templates do admin

## Estrutura do Template Visual (1080x1080px)

### Áreas de Preenchimento Automático (DEVEM FICAR VAZIAS NO TEMPLATE)

```
┌─────────────────────────────────────────┐
│  TOP CLEAR SPACE: 150px                 │  ← Área do GREETING/TÍTULO
│  (Completamente vazia - sem texto       │
│   sem caixas, sem marcas)               │
├─────────────────────────────────────────┤
│                                         │
│  DYNAMIC TEXT                           │  ← Nome do Cliente
│  Prezado(a) [Nome do Cliente]           │
│                                         │
│  Área: ~80px altura                     │
│  Posição: ~150px do topo                │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  MENSAGEM PRINCIPAL                     │  ← Corpo da mensagem
│  (Máximo 6 linhas / 50 palavras)        │
│                                         │
│  Área: 300px altura                     │
│  Largura: ~800px                        │
│  Posição: centralizada                  │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  SIGNATURE AREA                         │  ← Assinatura
│  Com carinho,                           │
│  [Nome do Consultor]                    │
│  [Cargo do Consultor]                   │
│                                         │
│  Área: 120px altura                     │
│  Posição: inferior esquerda             │
│                                         │
├─────────────────────────────────────────┤
│                                    ┌────┤
│                                    │LOGO│  ← Logo da empresa
│                                    │    │
│                                    │120x│
│                                    │120 │
│                                    │ px │
│                                    └────┘
│                         Posição: inferior direita
│                         Margem: 40px das bordas
└─────────────────────────────────────────┘
```

### Áreas Vazias - Regras Importantes

1. **NENHUM TEXTO**: Não colocar textos de exemplo, Lorem Ipsum, ou placeholders
2. **NENHUMA CAIXA**: Não desenhar caixas, retângulos ou bordas indicando área
3. **NENHUMA MARCAÇÃO**: Não usar linhas pontilhadas, setas ou indicadores
4. **COMPLETAMENTE LIMPO**: O template deve ter apenas o background e elementos decorativos

## Template de Aniversário - Especificação Visual

### Dimensões
- **Tamanho**: 1080 x 1080 pixels
- **Formato**: PNG (com transparência onde necessário) ou JPG de alta qualidade
- **Resolução**: 300 DPI

### Paleta de Cores Sugerida
- **Primária**: `#FF6B9D` (Rosa celebrativo) ou `#FFD93D` (Amarelo ouro)
- **Secundária**: `#6BCB77` (Verde fresco) ou `#4D96FF` (Azul céu)
- **Fundo**: Gradiente suave ou cor sólida clara (evitar branco puro)
- **Elementos decorativos**: Cores vibrantes mas harmônicas

### Elementos Visuais (Decorativos apenas)

#### Obrigatórios Temáticos:
1. **Balões/Bexigas** (Aniversário)
   - Tamanho: variado, pequeno a médio
   - Posição: cantos superiores, laterais
   - Estilo: discreto, não invadir áreas de texto
   
2. **Elementos de Viagem** (discretos)
   - **Mala de viagem**: pequena, canto inferior ou lateral
   - **Avião**: silhueta pequena, pode estar "voando" em algum canto
   - **Passaporte/Bilhete**: pequeno, como elemento de fundo
   
3. **Confetes/Estrelas** (opcional, discreto)
   - Espalhados pelos cantos
   - Não centralizar

#### Posicionamento dos Elementos:
```
┌─────────────────────────────────────────┐
│  🎈                            ✈️       │  ← Balões e avião pequeno
│       🎈                                │
│                                         │
│         [ÁREA VAZIA - TÍTULO]           │
│                                         │
│                                         │
│  [ÁREA VAZIA - NOME CLIENTE]            │
│                                         │
│                                         │
│      [ÁREA VAZIA - MENSAGEM]            │
│      [       300px altura      ]        │
│      [        ~800px largura   ]        │
│                                         │
│                                         │
│  [ÁREA VAZIA - ASSINATURA]        🧳    │  ← Mala discreta
│                                    📷   │  ← Logo empresa
│                                         │
└─────────────────────────────────────────┘
```

### Restrições de Design

1. **NÃO colocar elementos nas áreas de texto**
2. **Manter margem mínima de 80px** das áreas de texto
3. **Elementos de viagem devem ser sutis** (20-30% da opacidade ou pequenos)
4. **Não usar fotos reais de pessoas** (ilustrações vetoriais ou elementos gráficos)
5. **Manter legibilidade**: fundo não deve atrapalhar a leitura do texto que será inserido

## Campos do Sistema (Preenchimento Automático)

### 1. Greeting/Título
- **Tag**: `{{greeting}}` ou `{{titulo}}`
- **Exemplo**: "Feliz Aniversário!"
- **Fonte**: Definida pelo tema (tamanho ~48-64px)
- **Posição**: Topo, centralizado

### 2. Nome do Cliente
- **Tag**: `{{primeiro_nome}}` ou `{{nome_completo}}`
- **Exemplo**: "Prezado(a) João"
- **Fonte**: Definida pelo tema (tamanho ~32-40px)
- **Posição**: Após o título

### 3. Mensagem Principal
- **Tag**: `{{mensagem}}`
- **Limite**: 6 linhas / 50 palavras
- **Fonte**: Definida pelo tema (tamanho ~24-28px)
- **Posição**: Centro do card

### 4. Assinatura
- **Tags**: `{{consultor}}` + `{{cargo_consultor}}`
- **Exemplo**: 
  ```
  Com carinho,
  Maria Silva
  Consultora de Viagens
  ```
- **Fonte**: Definida pelo tema (tamanho ~20-24px)
- **Posição**: Inferior esquerda

### 5. Logo
- **Tag**: `{{logo_empresa}}`
- **Tamanho máximo**: 120x120px
- **Posição**: Inferior direita
- **Formato**: PNG com transparência (será inserido pelo sistema)

## Estrutura de Dados

### Tabela: `message_templates_v2` (Nova)

```sql
create table message_templates_v2 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Hierarquia
  created_by uuid references auth.users(id) on delete cascade,
  scope text not null check (scope in ('system', 'company', 'team', 'user')),
  company_id uuid references companies(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade, -- opcional
  
  -- Template
  nome text not null,
  categoria text not null, -- aniversario, natal, boas_vindas, etc
  ocasiao text, -- ocasião específica
  
  -- Conteúdo (textos padrão)
  assunto text,
  titulo text not null, -- greeting
  corpo text not null, -- mensagem principal
  assinatura_padrao text, -- assinatura
  
  -- Asset visual
  theme_id uuid references card_themes(id) on delete set null,
  background_url text, -- URL da imagem de fundo
  background_storage_path text, -- Path no storage
  
  -- Dimensões e posições (JSON para flexibilidade)
  layout_config jsonb default '{
    "width_px": 1080,
    "height_px": 1080,
    "areas": {
      "title": {"x": 540, "y": 100, "width": 800, "height": 100, "align": "center"},
      "greeting": {"x": 540, "y": 200, "width": 800, "height": 80, "align": "center"},
      "message": {"x": 540, "y": 400, "width": 800, "height": 300, "align": "center"},
      "signature": {"x": 100, "y": 900, "width": 400, "height": 120, "align": "left"},
      "logo": {"x": 960, "y": 960, "width": 120, "height": 120, "align": "right"}
    }
  }'::jsonb,
  
  -- Estilos
  title_style jsonb,
  body_style jsonb,
  signature_style jsonb,
  
  -- Status
  ativo boolean default true,
  is_default boolean default false, -- template padrão para a categoria
  
  -- Metadados
  tags text[],
  description text
);
```

### Tabela: `card_themes_v2` (Assets Visuais)

```sql
create table card_themes_v2 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  
  -- Hierarquia (mesma lógica)
  created_by uuid references auth.users(id) on delete cascade,
  scope text not null check (scope in ('system', 'company', 'team', 'user')),
  company_id uuid references companies(id) on delete cascade,
  
  -- Identificação
  nome text not null,
  categoria text not null, -- aniversario, natal, etc
  
  -- Asset
  storage_path text not null,
  asset_url text not null,
  width_px integer default 1080,
  height_px integer default 1080,
  
  -- Estilos padrão
  title_style jsonb,
  body_style jsonb,
  signature_style jsonb,
  
  -- Status
  ativo boolean default true
);
```

## API de Renderização

### Endpoint: `POST /api/v1/cards/render`

```typescript
interface RenderCardRequest {
  template_id: string;
  variables: {
    // Campos dinâmicos
    greeting?: string;        // Título
    primeiro_nome?: string;   // Nome do cliente
    nome_completo?: string;
    mensagem?: string;        // Corpo da mensagem
    consultor?: string;       // Nome do consultor
    cargo_consultor?: string; // Cargo
    logo_url?: string;        // URL do logo
    
    // Overrides de estilo (opcional)
    title_color?: string;
    body_color?: string;
  };
  output_format?: 'png' | 'jpg' | 'base64';
}

interface RenderCardResponse {
  image_url: string;      // URL da imagem gerada
  image_base64?: string;  // Base64 se solicitado
  expires_at?: string;    // Data de expiração do asset
}
```

## Fluxo de Uso

### 1. Admin cria template do sistema
```
Upload da imagem de fundo (vazia, apenas decoração)
↓
Define categorias e ocasiões
↓
Define textos padrão
↓
Template disponível para todos
```

### 2. Usuário utiliza template
```
Seleciona template da biblioteca
↓
Sistema pré-preenche com dados do cliente
↓
Usuário pode editar mensagem
↓
Sistema renderiza imagem final com todos os textos
↓
Disponível para download/envio
```

## Checklist para Designer

- [ ] Dimensões exatas: 1080x1080px
- [ ] Resolução: 300 DPI
- [ ] Áreas de texto completamente VAZIAS (sem caixas, textos ou marcas)
- [ ] Elementos decorativos posicionados nos cantos (não sobrepostos às áreas de texto)
- [ ] Margem mínima de 80px das áreas de texto
- [ ] Elementos de viagem discretos e harmônicos
- [ ] Cores vibrantes mas que não atrapalham legibilidade
- [ ] Formato PNG ou JPG de alta qualidade
- [ ] Testar contraste: simular texto branco e preto sobre o fundo

## Exemplos de Templates Futuros

| Ocasião | Elementos Visuais |
|---------|------------------|
| Aniversário | Balões, confetes, avião, mala |
| Natal | Árvore, neve, presentes, globo terrestre |
| Ano Novo | Fogos, champagne, passaporte carimbado |
| Páscoa | Ovos, coelhos, flores, maleta de viagem |
| Dia das Mães | Flores, corações, avião com rastro de coração |
| Boas-vindas | Portão de embarque, tapete vermelho, avião |
