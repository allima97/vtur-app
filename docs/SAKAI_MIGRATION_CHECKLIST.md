# Sakai/PrimeReact Migration Checklist

Atualizado em 2026-03-10.

## Fase 1 (concluída)

- [x] Dependências base do template Sakai adicionadas:
  - `primereact`
  - `primeicons`
  - `primeflex`
- [x] Provider global trocado para `PrimeReactProvider` no wrapper central.
- [x] Tema base Prime/Sakai importado globalmente no wrapper.
- [x] Wrappers centrais migrados:
  - `AppButton`
  - `AppField`
  - `AppCard`
  - `AppToolbar`
  - `AppDialog`
  - `AppNoticeDialog`
  - `AppPageHeader`
  - `AlertMessage`
  - `DataTable`
  - `EmptyState`
- [x] Build validado após migração dos wrappers.

## Fase 2 (em andamento)

- [x] Migrar imports diretos de `@primer/react` ainda existentes nas islands/componentes.
  - Status atual: 0 ocorrências em `src/`.
- [x] Criar camada de compatibilidade para APIs legadas (`Dialog`, `Select`, `TextInput`, `Textarea`, `NavList`) em:
  - `src/components/ui/primer/legacyCompat.tsx`
- [x] Substituir ícones textuais/emoji por `primeicons` nos módulos prioritários (`Menu`, `Dashboards` incluindo Admin/Performance e ações de tabela padrão).
- [ ] Revisar tabelas legadas (`table-default`) para `DataTable`/estilo Prime unificado.
- [ ] Revisar formulários legados (`form-input`, `form-select`) para `AppField`/controles Prime.
- [ ] Ajustar dialogs específicos ainda fora dos wrappers.

## Fase 3 (visual e UX)

- [ ] Aproximar tokens visuais do Sakai (spacing, radius, shadow, palettes) em todo o app.
- [ ] Revisão responsiva completa dos fluxos críticos.
- [ ] Revisão de contraste/acessibilidade.

## Verificação mínima para cada lote

- [x] `ASTRO_TELEMETRY_DISABLED=1 npm run build`
- [ ] Smoke test manual das telas alteradas (desktop + mobile)
- [x] `npm run check:modulos`
