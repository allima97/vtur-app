# Análise da Estrutura do Projeto SGTUR

**Data:** 16/02/2026  
**Análise realizada por:** IA - Perplexity

## 📊 Visão Geral do Projeto

### Stack Tecnológica
- **Framework:** Astro 5.16.6
- **UI Framework:** React 18.3.1
- **Database:** Supabase
- **Styling:** Tailwind CSS 3.4.13
- **Deployment:** Cloudflare (via @astrojs/cloudflare)
- **Bibliotecas principais:**
  - FullCalendar (calendário/agenda)
  - Recharts (gráficos)
  - Stream Chat (chat em tempo real)
  - jsPDF (geração de PDFs)
  - xlsx (importação/exportação Excel)
  - Tesseract.js (OCR)

### Arquitetura Atual
```
sgtur/
├── src/
│   ├── components/
│   │   ├── forms/          # Formulários reutilizáveis
│   │   ├── islands/        # Componentes interativos (React Islands)
│   │   └── ui/             # Componentes UI base
│   ├── config/             # Configurações
│   ├── layouts/            # Layouts Astro
│   ├── lib/                # Utilitários e helpers
│   ├── pages/              # Páginas e rotas
│   │   ├── api/            # Endpoints API
│   │   ├── admin/          # Área administrativa
│   │   ├── cadastros/      # Cadastros gerais
│   │   ├── clientes/       # Gestão de clientes
│   │   ├── comissoes/      # Sistema de comissões
│   │   ├── dashboard/      # Dashboards
│   │   ├── vendas/         # Gestão de vendas
│   │   └── ...
│   ├── styles/             # Estilos globais
│   └── types/              # TypeScript types
├── database/               # Scripts de banco de dados
├── public/                 # Arquivos estáticos
└── scripts/                # Scripts auxiliares
```

---

## 🔍 Análise por Módulo

### 1. **Sistema de Vendas e Importação**

#### Arquivo Analisado: `src/pages/api/importar-vendas.ts`

**Status Atual:**
- ✅ Implementação básica funcional
- ⚠️ Falta validação de duplicatas (Item #1 dos ajustes)
- ⚠️ Falta lógica de "Viaja Com" (recibos complementares)
- ⚠️ Sem tratamento robusto de erros
- ⚠️ Sem logs de auditoria

**Problemas Identificados:**
```typescript
// Código atual
const vendas = json.filter((row: any) => 
  row['CONSULTOR'] && row['VALOR TOTAL']
).map((row: any) => ({
  consultor: row['CONSULTOR'],
  valor: Number(row['VALOR TOTAL']) || 0,
  data: row['DATA'],
  recibo: row['RECIBO/LOC'],
}));
```

**Problemas:**
1. Não verifica duplicatas
2. Não valida se contratante/recibo são diferentes
3. Não cria relacionamento "Viaja Com"
4. Tipagem fraca (`any`)
5. Sem validação de formato de dados

**Sugestões de Melhoria:**

```typescript
// ✨ CÓDIGO MELHORADO SUGERIDO

import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { supabaseServer } from '../../lib/supabase-server';

// 🎯 Tipagem forte
interface VendaImportada {
  consultor: string;
  contratante: string;
  recibo: string;
  valor: number;
  data: string;
  numeroReserva?: string;
}

interface VendaDuplicada {
  numeroReserva: string;
  vendas: VendaImportada[];
}

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  
  if (!file) {
    return new Response(
      JSON.stringify({ error: 'Arquivo não enviado.' }), 
      { status: 400 }
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: null });

    // 🔍 Validar e mapear vendas
    const vendasImportadas: VendaImportada[] = json
      .filter((row: any) => 
        row['CONSULTOR'] && 
        row['CONTRATANTE'] && 
        row['VALOR TOTAL'] && 
        row['RECIBO/LOC']
      )
      .map((row: any) => ({
        consultor: String(row['CONSULTOR']).trim(),
        contratante: String(row['CONTRATANTE']).trim(),
        recibo: String(row['RECIBO/LOC']).trim(),
        valor: Number(row['VALOR TOTAL']) || 0,
        data: row['DATA'],
        numeroReserva: row['NUMERO_RESERVA'] ? String(row['NUMERO_RESERVA']).trim() : undefined,
      }));

    // 🎯 Agrupar por número de reserva
    const reservasAgrupadas = vendasImportadas.reduce((acc, venda) => {
      if (!venda.numeroReserva) return acc;
      
      if (!acc[venda.numeroReserva]) {
        acc[venda.numeroReserva] = [];
      }
      acc[venda.numeroReserva].push(venda);
      return acc;
    }, {} as Record<string, VendaImportada[]>);

    // 🔄 Processar duplicatas permitidas
    const vendasParaImportar: VendaImportada[] = [];
    const relacionamentosViajacom: Array<{reserva: string, recibos: string[]}> = [];
    const errosValidacao: string[] = [];

    for (const [numeroReserva, vendas] of Object.entries(reservasAgrupadas)) {
      if (vendas.length === 1) {
        // Reserva única - importar normalmente
        vendasParaImportar.push(vendas[0]);
      } else {
        // 🎯 LÓGICA DE DUPLICATAS (Item #1)
        // Verificar se contratantes ou recibos são diferentes
        const contratantesUnicos = new Set(vendas.map(v => v.contratante));
        const recibosUnicos = new Set(vendas.map(v => v.recibo));

        if (contratantesUnicos.size > 1 || recibosUnicos.size > 1) {
          // ✅ Permitir importação - mesma viagem, múltiplos contratantes
          vendasParaImportar.push(...vendas);
          
          // 🔗 Criar relacionamento "Viaja Com"
          relacionamentosViajacom.push({
            reserva: numeroReserva,
            recibos: Array.from(recibosUnicos)
          });
        } else {
          // ❌ Duplicata real - mesmo contratante e mesmo recibo
          errosValidacao.push(
            `Reserva ${numeroReserva}: Duplicata não permitida (mesmo contratante e recibo)`
          );
        }
      }
    }

    // 💾 Salvar no banco de dados
    const supabase = supabaseServer;
    
    // Inserir vendas
    const { data: vendasInseridas, error: erroVendas } = await supabase
      .from('vendas')
      .insert(vendasParaImportar)
      .select();

    if (erroVendas) {
      throw new Error(`Erro ao inserir vendas: ${erroVendas.message}`);
    }

    // 🔗 Inserir relacionamentos "Viaja Com"
    if (relacionamentosViajacom.length > 0) {
      const recibosComplementares = relacionamentosViajacom.flatMap(rel => 
        rel.recibos.map((recibo, index) => ({
          reserva_numero: rel.reserva,
          recibo_principal: rel.recibos[0],
          recibo_complementar: recibo,
          ordem: index
        }))
      );

      await supabase
        .from('recibos_complementares')
        .insert(recibosComplementares);
    }

    // 📊 Log de auditoria
    await supabase.from('logs_importacao').insert({
      tipo: 'vendas',
      total_linhas: json.length,
      importadas: vendasParaImportar.length,
      erros: errosValidacao.length,
      detalhes: { errosValidacao, relacionamentosViajacom }
    });

    return new Response(
      JSON.stringify({ 
        sucesso: true,
        importados: vendasParaImportar.length,
        relacionamentosViajacom: relacionamentosViajacom.length,
        erros: errosValidacao.length > 0 ? errosValidacao : undefined
      }), 
      { status: 200 }
    );

  } catch (e: any) {
    console.error('Erro ao processar importação:', e);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao processar arquivo.',
        detalhes: e.message 
      }), 
      { status: 500 }
    );
  }
};
```

**Melhorias Implementadas:**
- ✅ Tipagem forte com interfaces
- ✅ Validação de duplicatas com lógica de negócio
- ✅ Sistema de relacionamento "Viaja Com"
- ✅ Logs de auditoria
- ✅ Tratamento robusto de erros
- ✅ Feedback detalhado ao usuário

---

### 2. **Dashboard e KPIs**

#### Componentes Analisados:
- `DashboardGeralIsland.tsx` (99KB)
- `DashboardGestorIsland.tsx` (45KB) 
- `ComissionamentoIsland.tsx` (50KB)

**Problemas Identificados:**

#### Item #2: Meta Irreal no Dashboard
**Sintoma:** Vendedores aparecem com meta de R$ 2.437.000 ao invés de R$ 370.000

**Possíveis Causas:**
1. Erro de multiplicação por 100 (centavos → reais)
2. Soma incorreta de metas de múltiplos períodos
3. Conversão de moeda errada
4. Join incorreto com tabela de metas

**Solução Sugerida:**
```typescript
// ❌ ERRO COMUM: Multiplicar valor que já está em reais
const metaErrada = metaBanco * 100; // Se metaBanco já é 370000, vira 37000000

// ✅ CORRETO: Verificar formato do banco
const metaCorreta = typeof metaBanco === 'number' 
  ? metaBanco 
  : parseFloat(metaBanco.replace(',', '.'));

// 🔍 Adicionar validação
if (metaCorreta > 10000000) { // Meta > 10 milhões é suspeita
  console.warn('Meta suspeita detectada:', { vendedor, meta: metaCorreta });
}
```

#### Item #3: KPIs Errados no Comissionamento
**Problema:** Aparecem "Produtos com meta geral" e "Vendas Diferenciadas" quando não deveriam

**Sugestão:** Revisar filtros de query e lógica de agrupamento

```typescript
// ✅ FILTRO CORRETO
const kpis = await supabase
  .from('comissoes')
  .select(`
    *,
    vendedor:vendedores(*),
    produto:produtos(*)
  `)
  .eq('mes_referencia', mesAtual)
  .not('produto_id', 'is', null) // Excluir vendas sem produto
  .order('valor_comissao', { ascending: false });
```

---

### 3. **Sistema To Do (Item #4)**

#### Arquivo Analisado: `src/components/islands/TodoBoard.tsx`

**Status Atual:**
- ✅ Funcionalidade básica implementada
- ✅ Sistema de categorias funcional
- ✅ Sistema de cores implementado
- ❌ **Cor no item** (deveria herdar da categoria)
- ❌ **Agrupamento por categoria**
- ❌ **Campo "Arquivo"**
- ❌ **UI compacta com expansão (+)**
- ❌ **Visualização em lista simples**

**Código Melhorado Sugerido:**

```typescript
// 🎨 MELHORIA 1: Cor herdada da categoria

type Categoria = {
  id: string;
  nome: string;
  cor: string; // ✨ NOVO: Cor da categoria
};

type TodoItem = {
  id: string;
  titulo: string;
  descricao?: string | null;
  done: boolean;
  categoria_id?: string | null;
  prioridade?: "alta" | "media" | "baixa" | null;
  // cor?: string | null; // ❌ REMOVIDO: Não deve ter cor própria
  status?: "novo" | "agendado" | "em_andamento" | "concluido" | null;
  arquivo_url?: string | null; // ✨ NOVO: URL do arquivo anexo
};

// 🎯 MELHORIA 2: Agrupamento por categoria
const todosAgrupados = useMemo(() => {
  const grupos: Record<string, TodoItem[]> = {};
  
  categorias.forEach(cat => {
    grupos[cat.id] = todos.filter(t => t.categoria_id === cat.id);
  });
  
  // To-dos sem categoria
  grupos['sem_categoria'] = todos.filter(t => !t.categoria_id);
  
  return grupos;
}, [todos, categorias]);

// 🎨 MELHORIA 3: UI Compacta com expansão
function TodoCard({ todo, categoria }: { todo: TodoItem; categoria?: Categoria }) {
  const [expanded, setExpanded] = useState(false);
  const cor = categoria?.cor || '#e2e8f0';

  return (
    <div 
      className="todo-card-compact"
      style={{ borderLeft: `4px solid ${cor}` }}
    >
      {/* Cabeçalho sempre visível */}
      <div className="todo-card-header">
        <input type="checkbox" checked={todo.done} onChange={...} />
        <span>{todo.titulo}</span>
        {todo.arquivo_url && <span>📎</span>}
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? '−' : '+'}
        </button>
      </div>

      {/* Detalhes expansíveis */}
      {expanded && (
        <div className="todo-card-details">
          {todo.descricao && <p>{todo.descricao}</p>}
          {todo.arquivo_url && (
            <a href={todo.arquivo_url} target="_blank" rel="noopener noreferrer">
              📎 Ver arquivo
            </a>
          )}
          <div className="todo-card-actions">
            <button onClick={...}>Editar</button>
            <button onClick={...}>Excluir</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 📋 MELHORIA 4: Visualização em Lista Simples
function TodoListView() {
  return (
    <table className="todo-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Categoria</th>
          <th>Título</th>
          <th>Prioridade</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {todos.map(todo => {
          const categoria = categorias.find(c => c.id === todo.categoria_id);
          return (
            <tr key={todo.id} style={{ borderLeft: `3px solid ${categoria?.cor}` }}>
              <td><input type="checkbox" checked={todo.done} /></td>
              <td>{categoria?.nome || '—'}</td>
              <td>{todo.titulo}</td>
              <td>{todo.prioridade}</td>
              <td>
                <button>Editar</button>
                <button>Excluir</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

**Schema de Banco Atualizado:**
```sql
-- Adicionar cor nas categorias
ALTER TABLE todo_categorias 
ADD COLUMN cor VARCHAR(7) DEFAULT '#e2e8f0';

-- Remover cor dos itens
ALTER TABLE agenda_itens 
DROP COLUMN IF EXISTS cor;

-- Adicionar campo arquivo
ALTER TABLE agenda_itens 
ADD COLUMN arquivo_url TEXT;
```

---

### 4. **Sistema de Permissões e Menu (Item #5)**

#### Arquivo: `src/components/islands/MenuIsland.tsx` (42KB)

**Problema:** Itens aparecem no menu mesmo sem permissão

**Solução:**

```typescript
// ✅ FILTRO DE MENU POR PERMISSÕES

import { usePermissoes } from '../lib/use-permissoes';

function MenuIsland() {
  const { hasPermission } = usePermissoes();
  
  const menuItems = [
    { 
      path: '/dashboard', 
      label: 'Dashboard', 
      icon: '📊',
      permission: 'dashboard.view' 
    },
    { 
      path: '/vendas', 
      label: 'Vendas', 
      icon: '💰',
      permission: 'vendas.view' 
    },
    { 
      path: '/comissoes', 
      label: 'Comissões', 
      icon: '💵',
      permission: 'comissoes.view' 
    },
    // ...
  ];

  // 🔒 Filtrar itens baseado em permissões
  const menuItemsFiltrados = menuItems.filter(item => 
    !item.permission || hasPermission(item.permission)
  );

  return (
    <nav>
      {menuItemsFiltrados.map(item => (
        <a key={item.path} href={item.path}>
          {item.icon} {item.label}
        </a>
      ))}
    </nav>
  );
}
```

---

### 5. **Mural de Recados (Item #6)**

#### Arquivo: `src/components/islands/MuralRecadosIsland.tsx` (29KB)

**Problema:** Contador não zera após usuário ler mensagem de "Todos da Empresa"

**Solução:**

```typescript
// ✅ LÓGICA DE LEITURA INDIVIDUALIZADA

// Schema de banco atualizado
/*
CREATE TABLE recados_leituras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recado_id UUID REFERENCES recados(id),
  usuario_id UUID REFERENCES usuarios(id),
  lido_em TIMESTAMP DEFAULT NOW(),
  UNIQUE(recado_id, usuario_id)
);
*/

// Ao clicar no recado
async function marcarComoLido(recadoId: string, usuarioId: string) {
  const { error } = await supabase
    .from('recados_leituras')
    .insert({
      recado_id: recadoId,
      usuario_id: usuarioId
    })
    .onConflict('recado_id,usuario_id')
    .ignore(); // Se já foi lido, ignora

  if (!error) {
    // Atualizar contador local
    setContadorRecados(prev => Math.max(0, prev - 1));
  }
}

// Query para contar recados não lidos
async function buscarRecadosNaoLidos(usuarioId: string) {
  const { data, error } = await supabase
    .from('recados')
    .select(`
      id,
      recados_leituras!left(
        usuario_id
      )
    `)
    .or(`destinatario_id.eq.${usuarioId},destinatario_tipo.eq.todos`)
    .is('recados_leituras.usuario_id', null); // Não lidos

  return data?.length || 0;
}
```

---

### 6. **Importação de Contrato (Item #7)**

#### Arquivo: `src/components/islands/VendaContratoImportIsland.tsx` (69KB)

**Problema:** Só permite editar produto principal antes de salvar

**Solução:**

```typescript
// ✅ PERMITIR EDIÇÃO DE TODOS OS PRODUTOS

function ContratoImportPreview({ contratosImportados }: Props) {
  const [produtosEditaveis, setProdutosEditaveis] = useState(
    contratosImportados.flatMap(c => c.produtos)
  );

  return (
    <div>
      <h3>Produtos Importados</h3>
      {produtosEditaveis.map((produto, index) => (
        <ProdutoEditavel
          key={index}
          produto={produto}
          onChange={(novoProduto) => {
            setProdutosEditaveis(prev => {
              const updated = [...prev];
              updated[index] = novoProduto;
              return updated;
            });
          }}
        />
      ))}
      <button onClick={() => salvarContratos(produtosEditaveis)}>
        Salvar Todos
      </button>
    </div>
  );
}

function ProdutoEditavel({ produto, onChange }: ProdutoEditavelProps) {
  return (
    <div className="produto-card">
      <input
        value={produto.nome}
        onChange={e => onChange({ ...produto, nome: e.target.value })}
      />
      <input
        type="number"
        value={produto.valor}
        onChange={e => onChange({ ...produto, valor: parseFloat(e.target.value) })}
      />
      {/* Mais campos editáveis... */}
    </div>
  );
}
```

---

### 7. **Campo Data da Venda (Item #8)**

**Solução:**

```tsx
// ✅ DESTAQUE VISUAL COM TOOLTIP

function CampoDataVenda() {
  return (
    <div className="form-group destacado">
      <label 
        className="form-label"
        style={{ 
          color: '#c2410c', // Laranja escuro
          fontWeight: 700 
        }}
      >
        Data da Venda
        <button 
          type="button"
          className="tooltip-trigger"
          title="Informações"
        >
          ⓘ
        </button>
      </label>
      <input
        type="date"
        className="form-input"
        style={{
          borderColor: '#c2410c',
          borderWidth: '2px',
          background: '#fff7ed'
        }}
      />
      <div 
        className="form-help"
        style={{ 
          color: '#c2410c',
          fontWeight: 600,
          fontSize: '0.875rem',
          marginTop: '0.5rem'
        }}
      >
        ⚠️ Informe a data que a venda foi realizada, pois isso implica no mês de comissão e na Emissão da Nota Fiscal!
      </div>
    </div>
  );
}
```

**CSS adicional:**
```css
.form-group.destacado {
  padding: 1rem;
  background: #fffbeb;
  border-left: 4px solid #c2410c;
  border-radius: 0.5rem;
}
```

---

### 8. **Nova Seção: Campanhas (Item #9)**

**Schema de Banco:**

```sql
CREATE TABLE campanhas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  imagem_url TEXT,
  link_instagram VARCHAR(255),
  link_facebook VARCHAR(255),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  regras TEXT,
  status VARCHAR(20) DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa', 'cancelada')),
  criado_em TIMESTAMP DEFAULT NOW(),
  criado_por UUID REFERENCES usuarios(id),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campanhas_status ON campanhas(status);
CREATE INDEX idx_campanhas_data ON campanhas(data_inicio, data_fim);
```

**Componente:**

```typescript
// src/components/islands/CampanhasIsland.tsx

import React, { useState, useEffect } from 'react';
import { supabaseBrowser } from '../../lib/supabase-browser';

type Campanha = {
  id: string;
  titulo: string;
  descricao?: string;
  imagem_url?: string;
  link_instagram?: string;
  link_facebook?: string;
  data_inicio: string;
  data_fim: string;
  regras?: string;
  status: 'ativa' | 'inativa' | 'cancelada';
};

export default function CampanhasIsland() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Campanha | null>(null);
  const [form, setForm] = useState<Partial<Campanha>>({});
  
  useEffect(() => {
    carregarCampanhas();
  }, []);

  async function carregarCampanhas() {
    const { data } = await supabaseBrowser
      .from('campanhas')
      .select('*')
      .order('data_inicio', { ascending: false });
    
    if (data) setCampanhas(data);
  }

  async function salvarCampanha(e: React.FormEvent) {
    e.preventDefault();
    
    if (editando) {
      await supabaseBrowser
        .from('campanhas')
        .update(form)
        .eq('id', editando.id);
    } else {
      await supabaseBrowser
        .from('campanhas')
        .insert(form);
    }
    
    setModalOpen(false);
    setEditando(null);
    setForm({});
    carregarCampanhas();
  }

  async function excluirCampanha(id: string) {
    if (!confirm('Deseja realmente excluir esta campanha?')) return;
    
    await supabaseBrowser
      .from('campanhas')
      .delete()
      .eq('id', id);
    
    carregarCampanhas();
  }

  return (
    <div className="campanhas-container">
      <div className="header">
        <h2>Campanhas Disparadas</h2>
        <button 
          className="btn btn-primary" 
          onClick={() => setModalOpen(true)}
        >
          + Nova Campanha
        </button>
      </div>

      <div className="campanhas-grid">
        {campanhas.map(campanha => (
          <div key={campanha.id} className="campanha-card">
            {campanha.imagem_url && (
              <img src={campanha.imagem_url} alt={campanha.titulo} />
            )}
            <div className="campanha-content">
              <h3>{campanha.titulo}</h3>
              <p>{campanha.descricao}</p>
              
              <div className="campanha-info">
                <span>Início: {new Date(campanha.data_inicio).toLocaleDateString()}</span>
                <span>Fim: {new Date(campanha.data_fim).toLocaleDateString()}</span>
              </div>

              <div className="campanha-links">
                {campanha.link_instagram && (
                  <a href={campanha.link_instagram} target="_blank" rel="noopener">
                    📸 Instagram
                  </a>
                )}
                {campanha.link_facebook && (
                  <a href={campanha.link_facebook} target="_blank" rel="noopener">
                    👍 Facebook
                  </a>
                )}
              </div>

              <div className="campanha-status">
                <span className={`badge badge-${campanha.status}`}>
                  {campanha.status}
                </span>
              </div>

              <div className="campanha-actions">
                <button 
                  onClick={() => {
                    setEditando(campanha);
                    setForm(campanha);
                    setModalOpen(true);
                  }}
                >
                  Editar
                </button>
                <button 
                  className="btn-danger"
                  onClick={() => excluirCampanha(campanha.id)}
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de criação/edição */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h3>{editando ? 'Editar' : 'Nova'} Campanha</h3>
            <form onSubmit={salvarCampanha}>
              <input
                placeholder="Título"
                value={form.titulo || ''}
                onChange={e => setForm({...form, titulo: e.target.value})}
                required
              />
              <textarea
                placeholder="Descrição"
                value={form.descricao || ''}
                onChange={e => setForm({...form, descricao: e.target.value})}
              />
              <input
                placeholder="URL da Imagem"
                value={form.imagem_url || ''}
                onChange={e => setForm({...form, imagem_url: e.target.value})}
              />
              <input
                placeholder="Link Instagram"
                value={form.link_instagram || ''}
                onChange={e => setForm({...form, link_instagram: e.target.value})}
              />
              <input
                placeholder="Link Facebook"
                value={form.link_facebook || ''}
                onChange={e => setForm({...form, link_facebook: e.target.value})}
              />
              <input
                type="date"
                placeholder="Data Início"
                value={form.data_inicio || ''}
                onChange={e => setForm({...form, data_inicio: e.target.value})}
                required
              />
              <input
                type="date"
                placeholder="Data Fim"
                value={form.data_fim || ''}
                onChange={e => setForm({...form, data_fim: e.target.value})}
                required
              />
              <textarea
                placeholder="Regras da campanha"
                value={form.regras || ''}
                onChange={e => setForm({...form, regras: e.target.value})}
              />
              <select
                value={form.status || 'ativa'}
                onChange={e => setForm({...form, status: e.target.value as any})}
              >
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="cancelada">Cancelada</option>
              </select>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 🎨 Sugestões Gerais de UI/UX

### 1. **Design System Consistente**

**Problema:** Múltiplos estilos inline, falta de padronização

**Solução:** Criar arquivo de design tokens

```typescript
// src/config/design-tokens.ts

export const colors = {
  primary: '#2563eb',
  secondary: '#7c3aed',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#0ea5e9',
  
  // Backgrounds
  bgPrimary: '#ffffff',
  bgSecondary: '#f8fafc',
  bgTertiary: '#e2e8f0',
  
  // Text
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textTertiary: '#94a3b8',
  
  // Borders
  border: '#e2e8f0',
  borderHover: '#cbd5e1',
};

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
};

export const typography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
};

export const borderRadius = {
  none: '0',
  sm: '0.125rem',
  base: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
};
```

### 2. **Componentes Reutilizáveis**

```typescript
// src/components/ui/Button.tsx

import { colors } from '../../config/design-tokens';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props 
}: ButtonProps) {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'all 0.2s',
  };

  const variantStyles = {
    primary: {
      background: colors.primary,
      color: '#ffffff',
    },
    secondary: {
      background: colors.bgTertiary,
      color: colors.textPrimary,
    },
    danger: {
      background: colors.danger,
      color: '#ffffff',
    },
    success: {
      background: colors.success,
      color: '#ffffff',
    },
    ghost: {
      background: 'transparent',
      color: colors.primary,
      border: `1px solid ${colors.border}`,
    },
  };

  const sizeStyles = {
    sm: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
    md: { padding: '0.75rem 1.5rem', fontSize: '1rem' },
    lg: { padding: '1rem 2rem', fontSize: '1.125rem' },
  };

  return (
    <button
      style={{
        ...baseStyles,
        ...variantStyles[variant],
        ...sizeStyles[size],
      }}
      disabled={disabled || loading}
      className={className}
      {...props}
    >
      {loading && <span className="spinner" />}
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
```

### 3. **Feedback Visual Aprimorado**

```typescript
// src/components/ui/Toast.tsx

import { useEffect } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  message: string;
  duration?: number;
  onClose: () => void;
}

export function Toast({ type, message, duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ⓘ',
  };

  const colors = {
    success: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        background: colors[type].bg,
        border: `2px solid ${colors[type].border}`,
        color: colors[type].text,
        padding: '1rem 1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        zIndex: 9999,
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
        {icons[type]}
      </span>
      <span style={{ fontWeight: 600 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          fontSize: '1.5rem',
          cursor: 'pointer',
          marginLeft: '0.5rem',
        }}
      >
        ×
      </button>
    </div>
  );
}
```

### 4. **Loading States**

```typescript
// src/components/ui/Skeleton.tsx

export function Skeleton({ width, height }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width: width || '100%',
        height: height || '1rem',
        background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: '0.25rem',
      }}
    />
  );
}

// CSS
/*
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
*/
```

### 5. **Responsividade Aprimorada**

```typescript
// src/hooks/use-breakpoint.ts

import { useState, useEffect } from 'react';

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<keyof typeof breakpoints>('lg');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      
      if (width < breakpoints.sm) {
        setBreakpoint('sm');
        setIsMobile(true);
      } else if (width < breakpoints.md) {
        setBreakpoint('md');
        setIsMobile(true);
      } else if (width < breakpoints.lg) {
        setBreakpoint('lg');
        setIsMobile(false);
      } else if (width < breakpoints.xl) {
        setBreakpoint('xl');
        setIsMobile(false);
      } else {
        setBreakpoint('2xl');
        setIsMobile(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { breakpoint, isMobile };
}
```

---

## 🔧 Sugestões de Arquitetura

### 1. **Separação de Concerns**

**Problema:** Componentes grandes misturando lógica de negócio e UI

**Solução:** Padrão de Custom Hooks

```typescript
// ❌ ANTES: Tudo no componente
function VendasConsultaIsland() {
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from('vendas').select();
      setVendas(data);
      setLoading(false);
    }
    load();
  }, []);
  
  // 100 linhas de JSX...
}

// ✅ DEPOIS: Hook customizado
function useVendas() {
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    carregarVendas();
  }, []);
  
  async function carregarVendas() {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: err } = await supabase
        .from('vendas')
        .select('*')
        .order('data_venda', { ascending: false });
      
      if (err) throw err;
      setVendas(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  
  return { vendas, loading, error, refetch: carregarVendas };
}

// Componente limpo
function VendasConsultaIsland() {
  const { vendas, loading, error } = useVendas();
  
  if (loading) return <Skeleton />;
  if (error) return <ErrorMessage message={error} />;
  
  return (
    <VendasTable vendas={vendas} />
  );
}
```

### 2. **Validação de Dados**

```typescript
// src/lib/validators.ts

import { z } from 'zod'; // Recomendação: adicionar Zod ao projeto

export const vendaSchema = z.object({
  consultor: z.string().min(1, 'Consultor é obrigatório'),
  contratante: z.string().min(1, 'Contratante é obrigatório'),
  valor: z.number().positive('Valor deve ser positivo'),
  data_venda: z.string().datetime('Data inválida'),
  recibo: z.string().min(1, 'Recibo é obrigatório'),
  numero_reserva: z.string().optional(),
});

export const campanhaSchema = z.object({
  titulo: z.string().min(3, 'Título deve ter no mínimo 3 caracteres'),
  descricao: z.string().optional(),
  data_inicio: z.string().date(),
  data_fim: z.string().date(),
  status: z.enum(['ativa', 'inativa', 'cancelada']),
}).refine(data => {
  return new Date(data.data_fim) > new Date(data.data_inicio);
}, {
  message: 'Data de fim deve ser posterior à data de início',
  path: ['data_fim'],
});
```

### 3. **Error Boundaries**

```typescript
// src/components/ErrorBoundary.tsx

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    
    // Enviar para serviço de monitoramento (ex: Sentry)
    // Sentry.captureException(error, { extra: errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Algo deu errado 😕</h2>
          <p>Estamos trabalhando para resolver o problema.</p>
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="btn btn-primary"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 4. **Otimização de Performance**

```typescript
// Memoização de componentes pesados
import { memo } from 'react';

const VendaCardMemoized = memo(VendaCard, (prevProps, nextProps) => {
  return prevProps.venda.id === nextProps.venda.id && 
         prevProps.venda.updated_at === nextProps.venda.updated_at;
});

// Virtual scrolling para listas grandes
import { FixedSizeList } from 'react-window';

function ListaVendasVirtualizada({ vendas }: { vendas: Venda[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={vendas.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <VendaCard venda={vendas[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

## 📝 Checklist de Implementação

### Prioridade ALTA (Bugs críticos)
- [ ] Item #2: Corrigir meta irreal no Dashboard
- [ ] Item #3: Corrigir KPIs no Comissionamento
- [ ] Item #6: Corrigir contador do Mural de Recados

### Prioridade MÉDIA (Melhorias de UX)
- [ ] Item #1: Implementar lógica de duplicatas na importação
- [ ] Item #4: Refatorar To Do Board
  - [ ] Remover cor dos itens (herdar da categoria)
  - [ ] Adicionar cor nas categorias
  - [ ] Implementar agrupamento por categoria
  - [ ] Adicionar campo arquivo
  - [ ] UI compacta com expansão
  - [ ] Visualização em lista simples
- [ ] Item #5: Filtrar menu por permissões
- [ ] Item #7: Permitir edição de todos os produtos na importação
- [ ] Item #8: Destacar campo Data da Venda

### Prioridade BAIXA (Novas funcionalidades)
- [ ] Item #9: Criar seção de Campanhas
  - [ ] Schema de banco
  - [ ] Componente React
  - [ ] Upload de imagens
  - [ ] Integração com redes sociais

### Melhorias Gerais
- [ ] Criar Design System com tokens
- [ ] Implementar componentes reutilizáveis
- [ ] Adicionar Error Boundaries
- [ ] Implementar validação com Zod
- [ ] Adicionar testes unitários (Jest + React Testing Library)
- [ ] Configurar CI/CD
- [ ] Documentar componentes (Storybook)
- [ ] Implementar sistema de logs
- [ ] Adicionar monitoramento de performance

---

## 🚀 Próximos Passos

1. **Revisar e aprovar** este documento
2. **Criar branches** para cada item
3. **Implementar correções críticas** (Prioridade ALTA)
4. **Implementar melhorias de UX** (Prioridade MÉDIA)
5. **Testar** cada feature em ambiente de desenvolvimento
6. **Deploy** gradual em produção
7. **Monitorar** e coletar feedback dos usuários

---

## 📚 Referências

- [Astro Docs](https://docs.astro.build)
- [Supabase Docs](https://supabase.com/docs)
- [React Patterns](https://reactpatterns.com)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/)

---

**Documento vivo:** Este arquivo deve ser atualizado conforme as implementações forem realizadas.
