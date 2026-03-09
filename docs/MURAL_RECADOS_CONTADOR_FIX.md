# Correção: Contador de Notificações do Mural de Recados

**Issue:** #1 - Item 6  
**Data:** 16/02/2026  
**Status:** ✅ Resolvido

## Problema Identificado

O contador de notificações do Mural de Recados não zerava após o usuário ler os recados. O problema ocorria porque:

1. A marcação de leitura só acontecia ao abrir a conversa específica
2. Recados de "Todos da Empresa" não estavam sendo marcados como lidos automaticamente
3. O contador dependia do array `leituras` que podia estar desatualizado
4. Os listeners de realtime tinham filtros que impediam atualizações corretas

### Comportamento Esperado

- Contador deve **zerar automaticamente** quando usuário abre e visualiza uma thread
- Recados de "Todos da Empresa" devem ser **contabilizados individualmente** por usuário
- Contador deve refletir em **tempo real** o estado de leitura

## Solução Implementada

### 1. Marcação Automática de Leitura ao Abrir Thread

```typescript
// Novo useEffect que marca automaticamente ao abrir thread
useEffect(() => {
  if (!userId || !conversation.length || !selectedThreadId) return;
  
  // Evita marcar novamente se for a mesma thread
  if (lastOpenedThreadRef.current === selectedThreadId) return;
  lastOpenedThreadRef.current = selectedThreadId;

  const unreadIds = conversation
    .filter(recado => 
      recado.receiver_id === userId &&
      !recado.leituras?.some(entry => entry.user_id === userId)
    )
    .map(recado => recado.id);
  
  // Para thread de empresa, marcar TODOS os recados não lidos
  const companyUnreadIds = selectedThreadId === "company"
    ? conversation
        .filter(recado =>
          !recado.receiver_id &&
          !recado.leituras?.some(entry => entry.user_id === userId)
        )
        .map(recado => recado.id)
    : [];

  const allUnreadIds = [...unreadIds, ...companyUnreadIds];
  
  if (!allUnreadIds.length) return;

  // Marcar todos como lidos
  Promise.all(
    allUnreadIds.map(recadoId =>
      supabase.rpc("mural_recados_mark_read", { target_id: recadoId })
    )
  ).then(() => scheduleReloadRecados());
}, [selectedThreadId, conversation.length, userId]);
```

### 2. Adição de Referência para Evitar Marcação Duplicada

```typescript
const lastOpenedThreadRef = useRef<string | null>(null);
```

Esta referência garante que não vamos marcar os mesmos recados múltiplas vezes quando o componente re-renderizar.

### 3. Remoção de Filtros Restritivos no Realtime

**Antes:**
```typescript
.on("postgres_changes", {
  event: "INSERT",
  schema: "public",
  table: "mural_recados_leituras",
  filter: `company_id=eq.${companyId},user_id=eq.${userId}`, // ❌ Muito restritivo
}, () => scheduleReloadRecados())
```

**Depois:**
```typescript
.on("postgres_changes", {
  event: "INSERT",
  schema: "public",
  table: "mural_recados_leituras",
  // ✅ Sem filtro - escuta todas as leituras
}, () => scheduleReloadRecados())
```

Isso permite que o componente recarregue quando **qualquer** leitura é registrada, atualizando os contadores corretamente.

### 4. Recarga Automática Após Marcação

Após marcar os recados como lidos, o sistema automaticamente recarrega a lista para atualizar os contadores:

```typescript
if (!cancelled) {
  scheduleReloadRecados(); // Atualiza UI após marcação
}
```

## Infraestrutura Existente Utilizada

A solução utiliza a função RPC já existente no banco:

```sql
-- Função: mural_recados_mark_read(target_id uuid)
-- Definida em: database/migrations/20260214_mural_recados_leituras.sql

-- Marca um recado como lido pelo usuário atual
-- Valida permissões e insere/atualiza registro na tabela mural_recados_leituras
```

Também existe a função `mural_recados_unread_count()` que pode ser usada no futuro para contadores globais.

## Fluxo de Funcionamento

1. **Usuário abre uma thread** (conversa)
2. **useEffect detecta** que `selectedThreadId` mudou
3. **Sistema identifica** todos os recados não lidos daquela thread
4. **Para "Todos da Empresa"**: inclui TODOS os recados da empresa não lidos pelo usuário
5. **Marca todos** como lidos via RPC `mural_recados_mark_read`
6. **Realtime notifica** a mudança na tabela `mural_recados_leituras`
7. **Componente recarrega** os dados automaticamente
8. **Contador atualiza** para refletir o novo estado

## Testes Recomendados

### Teste 1: Recados Privados
1. Usuário A envia recado privado para Usuário B
2. Verificar que contador de B aumenta
3. B abre a conversa com A
4. **Espera-se:** Contador de B zera automaticamente

### Teste 2: Recados da Empresa
1. Usuário A envia recado para "Todos da Empresa"
2. Verificar que contador de todos os usuários aumenta
3. Usuário B abre a thread "Todos da empresa"
4. **Espera-se:** Contador de B zera, mas outros usuários continuam com contador

### Teste 3: Múltiplos Recados
1. Enviar 5 recados de "Todos da Empresa"
2. Usuário visualiza thread
3. **Espera-se:** Contador zera de uma vez (não gradualmente)

### Teste 4: Realtime
1. Usuário A e B estão online
2. A envia recado para B
3. **Espera-se:** Contador de B atualiza em tempo real
4. B abre conversa
5. **Espera-se:** Contador de B zera imediatamente

## Arquivos Modificados

- `src/components/islands/MuralRecadosIsland.tsx`
  - Adicionado `lastOpenedThreadRef`
  - Modificado useEffect de marcação automática
  - Removidos filtros do realtime subscription
  - Adicionada lógica para recados de empresa

## Próximos Passos (Opcional)

Para melhorias futuras, considerar:

1. **Badge no Menu Principal**: Usar `mural_recados_unread_count()` para mostrar contador global
2. **Notificações Push**: Integrar com sistema de notificações do navegador
3. **Sons de Notificação**: Adicionar feedback sonoro para novos recados
4. **Indicador Visual**: Destacar threads com mensagens não lidas com cor diferente

## Referências

- Issue Original: #1 - Item 6
- Migration: `database/migrations/20260214_mural_recados_leituras.sql`
- Componente: `src/components/islands/MuralRecadosIsland.tsx`
- Commit: df718ecbacd2b729c1b82e81de34d44764c9b14e
