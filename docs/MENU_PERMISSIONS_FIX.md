# Correção de Visibilidade do Menu por Permissões

## Objetivo

Garantir que **TODOS** os itens do menu só apareçam para usuários que tenham as permissões adequadas.

## Problemas Identificados

### 1. Seção "Operação" sem Validação Total

**Problema**: A seção "Operação" aparece sempre que `!menuIsSystemAdmin`, mas deveria só aparecer se o usuário tiver pelo menos UMA permissão nos itens.

**Localização**: Linha ~586

**Solução**: Adicionar validação:

```typescript
// ANTES (linha 586)
{!menuIsSystemAdmin && (
  <div>
    <div className="sidebar-section-title">Operação</div>
    <ul className="sidebar-nav">

// DEPOIS
const hasOperacaoSection = 
  canMenu("Dashboard") ||
  canMenu("Agenda") ||
  canMenu("Operacao") ||
  canMenu("Todo") ||
  canMenu("Mural de Recados") ||
  canMenu("Vendas") ||
  canMenu("Importar Contratos") ||
  canMenu("Orcamentos") ||
  canMenu("Consultoria Online") ||
  canMenu("Comissionamento") ||
  canMenu("Controle de SAC") ||
  canMenu("Clientes");

{!menuIsSystemAdmin && hasOperacaoSection && (
  <div>
    <div className="sidebar-section-title">Operação</div>
    <ul className="sidebar-nav">
```

### 2. Item "Minha Escala" sem Permissão

**Problema**: Item "Minha Escala" só verifica se é vendedor (`menuIsVendedor`), não valida permissão.

**Localização**: Linha ~643

**Solução**:

```typescript
// ANTES
{menuIsVendedor && (
  <li>
    <a
      className={`sidebar-link ${activePage === "perfil-escala" ? "active" : ""}`}
      href="/perfil/escala"
      onClick={handleNavClick}
    >
      <span>📅</span>Minha Escala
    </a>
  </li>
)}

// DEPOIS
{menuIsVendedor && (canMenu("Escalas") || canMenu("Operacao")) && (
  <li>
    <a
      className={`sidebar-link ${activePage === "perfil-escala" ? "active" : ""}`}
      href="/perfil/escala"
      onClick={handleNavClick}
    >
      <span>📅</span>Minha Escala
    </a>
  </li>
)}
```

### 3. Seção "Documentação" sem Permissão

**Problema**: Seção "Documentação" aparece para todos os usuários autenticados sem validação de permissão.

**Localização**: Linha ~913

**Solução**:

```typescript
// ANTES
{menuUserId && !menuIsSystemAdmin && (
  <div>
    <div className="sidebar-section-title">Documentação</div>
    <ul className="sidebar-nav">
      <li>
        <a
          className={`sidebar-link ${activePage === "documentacao" ? "active" : ""}`}
          href="/documentacao"
          onClick={handleNavClick}
        >
          <span>📚</span>Documentação
        </a>
      </li>
    </ul>
  </div>
)}

// DEPOIS
{menuUserId && !menuIsSystemAdmin && canMenu("Documentacao") && (
  <div>
    <div className="sidebar-section-title">Documentação</div>
    <ul className="sidebar-nav">
      <li>
        <a
          className={`sidebar-link ${activePage === "documentacao" ? "active" : ""}`}
          href="/documentacao"
          onClick={handleNavClick}
        >
          <span>📚</span>Documentação
        </a>
      </li>
    </ul>
  </div>
)}
```

### 4. Bottom Navigation Mobile - Validações Incompletas

**Problema**: Alguns itens no `mobileNavItems` são adicionados sem validação de permissão adequada.

**Localização**: Linha ~496 - 542

**Status**: Já está correto! Todos os itens mobile já validam permissões com `canMenu()`.

---

## Resumo das Mudanças

### Arquivos Modificados

1. `src/components/islands/MenuIsland.tsx`

### Variáveis Adicionadas

```typescript
// Após linha 165 (junto com outras constantes de seções)
const hasOperacaoSection = 
  canMenu("Dashboard") ||
  canMenu("Agenda") ||
  canMenu("Operacao") ||
  canMenu("Todo") ||
  canMenu("Mural de Recados") ||
  canMenu("Vendas") ||
  canMenu("Importar Contratos") ||
  canMenu("Orcamentos") ||
  canMenu("Consultoria Online") ||
  canMenu("Comissionamento") ||
  canMenu("Controle de SAC") ||
  canMenu("Clientes");
```

### Linhas Modificadas

1. **Linha ~586**: `{!menuIsSystemAdmin && (` → `{!menuIsSystemAdmin && hasOperacaoSection && (`
2. **Linha ~643**: `{menuIsVendedor && (` → `{menuIsVendedor && (canMenu("Escalas") || canMenu("Operacao")) && (`
3. **Linha ~913**: `{menuUserId && !menuIsSystemAdmin && (` → `{menuUserId && !menuIsSystemAdmin && canMenu("Documentacao") && (`

---

## Testes

### Cenário 1: Usuário sem Nenhuma Permissão

**Configuração**: Usuário sem permissões em nenhum módulo

**Resultado Esperado**:
- ❌ Nenhum item de menu visível (exceto Perfil e Sair)
- ❌ Nenhuma seção visível
- ❌ Bottom navigation mobile vazio (exceto botão "Mais")

### Cenário 2: Usuário Vendedor com Permissão em "Vendas"

**Configuração**: 
- Tipo: Vendedor
- Permissões: Vendas (view)

**Resultado Esperado**:
- ✅ Seção "Operação" visível
- ✅ Item "Vendas" visível
- ❌ "Minha Escala" NÃO visível (sem permissão em Escalas)
- ❌ Outras seções não visíveis

### Cenário 3: Usuário Vendedor com Permissão em "Escalas"

**Configuração**: 
- Tipo: Vendedor
- Permissões: Escalas (view)

**Resultado Esperado**:
- ✅ Seção "Operação" visível
- ✅ Item "Minha Escala" visível
- ❌ Outros itens não visíveis (sem outras permissões)

### Cenário 4: Usuário com Permissão em "Documentacao"

**Configuração**: 
- Permissões: Documentacao (view)

**Resultado Esperado**:
- ✅ Seção "Documentação" visível
- ✅ Item "Documentação" visível

### Cenário 5: Usuário SEM Permissão em "Documentacao"

**Configuração**: 
- Permissões: Outras (mas NÃO Documentacao)

**Resultado Esperado**:
- ❌ Seção "Documentação" NÃO visível

---

## Checklist de Implementação

- [ ] Adicionar variável `hasOperacaoSection`
- [ ] Modificar condição da seção "Operação"
- [ ] Adicionar validação de permissão em "Minha Escala"
- [ ] Adicionar validação de permissão em "Documentação"
- [ ] Testar todos os cenários
- [ ] Verificar menu mobile
- [ ] Verificar menu desktop
- [ ] Criar PR para `main`

---

## Próximos Passos

1. Aplicar mudanças no arquivo `MenuIsland.tsx`
2. Executar testes locais
3. Validar com diferentes perfis de usuário
4. Criar Pull Request

---

**Autor**: Sistema SGTUR  
**Data**: 2026-02-16  
**Branch**: `fix/menu-permissions-visibility`  
**Issue**: Item 5 - Itens no Menu - Esconder
