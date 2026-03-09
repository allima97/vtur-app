# Patch para MenuIsland.tsx - Correção de Visibilidade

## Instruções

Aplicar as seguintes mudanças no arquivo `src/components/islands/MenuIsland.tsx`

---

## Mudança 1: Adicionar variável `hasOperacaoSection`

**Localização**: Após a linha 165 (após `canRelatoriosSection`)

**Adicionar**:

```typescript
  // Valida se o usuário tem pelo menos uma permissão na seção Operação
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

---

## Mudança 2: Validar seção "Operação"

**Localização**: Linha ~586

**ANTES**:
```typescript
        {!menuIsSystemAdmin && (
          <div>
            <div className="sidebar-section-title">Operação</div>
            <ul className="sidebar-nav">
```

**DEPOIS**:
```typescript
        {!menuIsSystemAdmin && hasOperacaoSection && (
          <div>
            <div className="sidebar-section-title">Operação</div>
            <ul className="sidebar-nav">
```

---

## Mudança 3: Validar permissão em "Minha Escala"

**Localização**: Linha ~643

**ANTES**:
```typescript
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
```

**DEPOIS**:
```typescript
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

---

## Mudança 4: Validar permissão em "Documentação"

**Localização**: Linha ~913

**ANTES**:
```typescript
        {/* DOCUMENTAÇÃO */}
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
```

**DEPOIS**:
```typescript
        {/* DOCUMENTAÇÃO */}
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

---

## Resumo das Mudanças

| Linha | Descrição | Mudança |
|-------|-----------|----------|
| ~165 | Adicionar variável | `const hasOperacaoSection = ...` |
| ~586 | Condição Operação | `&& hasOperacaoSection` |
| ~643 | Permissão Minha Escala | `&& (canMenu("Escalas") \|\| canMenu("Operacao"))` |
| ~913 | Permissão Documentação | `&& canMenu("Documentacao")` |

---

## Aplicação do Patch

### Método 1: Manual

1. Abrir `src/components/islands/MenuIsland.tsx`
2. Localizar cada seção pelo número de linha
3. Aplicar as mudanças conforme descrito acima

### Método 2: Git Patch

Se houver um arquivo `.patch`, usar:

```bash
git apply menu-permissions.patch
```

---

## Validação

Após aplicar as mudanças:

1. ✅ Verificar que o arquivo compila sem erros
2. ✅ Testar login com diferentes perfis de usuário
3. ✅ Verificar menu desktop e mobile
4. ✅ Confirmar que seções aparecem/escondem corretamente

---

**Status**: Pronto para aplicar  
**Revisão**: Pendente  
**Testes**: Pendente
