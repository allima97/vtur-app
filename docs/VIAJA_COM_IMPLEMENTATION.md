# Implementação de Vínculos Automáticos "Viaja Com"

## Objetivo

Permitir importação de reservas duplicadas quando são de **contratantes diferentes**, criando automaticamente vínculos "Viaja Com" entre os recibos.

## Arquivos Modificados

### 1. ✅ `src/lib/vendas/reciboReservaValidator.ts`
**Status**: Atualizado no commit anterior

**Mudanças**:
- Adiciona `cliente_id` ao tipo `NumeroLookup`
- Adiciona `ReciboRelacionado` type export
- `ensureReciboReservaUnicos` agora retorna `ReciboRelacionado[] | null`
- Validação de reservas agora considera cliente_id
- Permite reserva duplicada se cliente E recibo forem diferentes

### 2. ✅ `src/lib/vendas/viagaComManager.ts`
**Status**: Arquivo novo criado

**Funcionalidades**:
- `criarVinculosViajaComAutomaticos()`: Cria vínculos bidirecionais
- `buscarRecibosComplementares()`: Lista recibos vinculados

---

## 3. ⚠️ `src/components/islands/VendasCadastroIsland.tsx`
**Status**: REQUER MODIFICAÇÃO MANUAL

### Passo 1: Adicionar Imports (linha ~13)

```typescript
import { ensureReciboReservaUnicos, type ReciboRelacionado } from "../../lib/vendas/reciboReservaValidator";
import { criarVinculosViajaComAutomaticos } from "../../lib/vendas/viagaComManager";
```

### Passo 2: Modificar Função `salvarVenda`

Localizar a linha que contém:

```typescript
await ensureReciboReservaUnicos({
  client: supabase,
  companyId,
  ignoreVendaId: editId || null,
  numeros: recibos.map((r) => ({
    numero_recibo: r.numero_recibo,
    numero_reserva: r.numero_reserva,
  })),
});
```

**SUBSTITUIR POR:**

```typescript
// Valida duplicados e obtém recibos relacionados para "Viaja Com"
const recibosRelacionados = await ensureReciboReservaUnicos({
  client: supabase,
  companyId,
  ignoreVendaId: editId || null,
  numeros: recibos.map((r) => ({
    numero_recibo: r.numero_recibo,
    numero_reserva: r.numero_reserva,
    cliente_id: clienteId, // <-- NOVO: Cliente da venda atual
  })),
});

// Log informativo se houver recibos relacionados
if (recibosRelacionados && recibosRelacionados.length > 0) {
  console.log(`ℹ️ Reserva compartilhada detectada. Serão criados vínculos "Viaja Com" com ${recibosRelacionados.length} recibo(s).`);
  showToast(
    `Reserva compartilhada: será vinculada com outras vendas da mesma viagem`,
    "info"
  );
}
```

### Passo 3: Capturar IDs dos Recibos Inseridos

Localizar a seção de inserção de recibos. **ANTES DO LOOP**, adicionar:

```typescript
// Array para armazenar IDs dos recibos criados
const recibosInseridos: { id: string; numero_reserva?: string | null }[] = [];
```

**DENTRO DO LOOP** de inserção de recibos, após o `insert`, modificar o `select`:

```typescript
const { data: insertedRecibo, error: insertErr } = await supabase
  .from("vendas_recibos")
  .insert(insertPayload)
  .select("id, numero_reserva") // <-- ADICIONAR numero_reserva
  .single();

if (insertErr) throw insertErr;

// Adicionar ao array de recibos inseridos
recibosInseridos.push({
  id: insertedRecibo.id,
  numero_reserva: insertPayload.numero_reserva,
});
```

### Passo 4: Criar Vínculos Automáticos

**APÓS O LOOP** completo de inserção de recibos, adicionar:

```typescript
// Cria vínculos "Viaja Com" automaticamente para reservas compartilhadas
if (recibosInseridos.length > 0 && recibosRelacionados) {
  try {
    const vinculosCriados = await criarVinculosViajaComAutomaticos({
      client: supabase,
      vendaId: vendaId!,
      recibosNovos: recibosInseridos,
      recibosRelacionados: recibosRelacionados,
    });
    
    if (vinculosCriados > 0) {
      console.log(`✓ ${vinculosCriados} vínculos "Viaja Com" criados automaticamente`);
      showToast(
        `Vínculos "Viaja Com" criados: ${vinculosCriados} conexões`,
        "success"
      );
    }
  } catch (errorVinculo) {
    console.error("Erro ao criar vínculos Viaja Com:", errorVinculo);
    // Não bloqueia a venda, apenas registra o erro
    showToast(
      "Venda salva, mas houve erro ao criar vínculos automáticos",
      "warning"
    );
  }
}
```

---

## Testes

### Cenário 1: Reserva Duplicada com Clientes Diferentes ✅

**Dados:**
- Reserva: `ABC123`
- Cliente 1: João Silva
- Cliente 2: Maria Santos
- Recibo 1: `R001`
- Recibo 2: `R002`

**Resultado Esperado:**
- ✅ Ambas vendas são salvas
- ✅ Vínculos "Viaja Com" criados automaticamente
- ✅ Toast informativo exibido

### Cenário 2: Reserva Duplicada com Mesmo Cliente ❌

**Dados:**
- Reserva: `ABC123`
- Cliente: João Silva (mesmo)
- Recibo: `R003`

**Resultado Esperado:**
- ❌ Erro: "RESERVA_DUPLICADA"
- ❌ Venda bloqueada

### Cenário 3: Mesmo Recibo ❌

**Dados:**
- Recibo: `R001` (já existe)

**Resultado Esperado:**
- ❌ Erro: "RECIBO_DUPLICADO"
- ❌ Venda bloqueada

---

## Estrutura de Dados

### Tabela: `vendas_recibos_complementares`

```sql
CREATE TABLE vendas_recibos_complementares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  recibo_id UUID NOT NULL REFERENCES vendas_recibos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venda_id, recibo_id)
);
```

### Exemplo de Vínculos Criados

**Venda A** (João - Reserva ABC123):
```json
{
  "venda_id": "uuid-venda-a",
  "recibo_id": "uuid-recibo-b" // aponta para recibo de Maria
}
```

**Venda B** (Maria - Reserva ABC123):
```json
{
  "venda_id": "uuid-venda-b",
  "recibo_id": "uuid-recibo-a" // aponta para recibo de João
}
```

---

## Logs e Debugging

### Console Logs Esperados

```
✓ Reserva duplicada permitida: ABC123 (contratantes diferentes)
ℹ️ Reserva compartilhada detectada. Serão criados vínculos "Viaja Com" com 1 recibo(s).
🔗 Criando vínculos "Viaja Com" para 1 recibo(s) relacionado(s)
  ✓ Vínculo criado: Reserva ABC123 (uuid-novo ↔ uuid-existente)
✓ Total de 2 vínculos criados automaticamente
```

---

## Rollback

Caso necessário reverter:

```bash
git checkout main src/lib/vendas/reciboReservaValidator.ts
git rm src/lib/vendas/viagaComManager.ts
# Reverter mudanças manuais em VendasCadastroIsland.tsx
```

---

## Checklist de Implementação

- [x] `reciboReservaValidator.ts` atualizado
- [x] `viagaComManager.ts` criado
- [ ] Imports adicionados em `VendasCadastroIsland.tsx`
- [ ] Validação modificada para capturar recibos relacionados
- [ ] Array `recibosInseridos` criado
- [ ] Select de insert modificado para incluir `numero_reserva`
- [ ] Função `criarVinculosViajaComAutomaticos` chamada
- [ ] Testes executados
- [ ] Pull Request criado

---

## Próximos Passos

1. Aplicar modificações manuais em `VendasCadastroIsland.tsx`
2. Testar cenários descritos acima
3. Verificar logs no console
4. Validar vínculos criados no banco
5. Criar Pull Request para `main`

---

**Autor**: Implementação automática - Sistema SGTUR  
**Data**: 2026-02-16  
**Branch**: `feat/reserva-duplicada-viaja-com`
