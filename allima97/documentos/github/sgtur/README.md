# Templates SQL (Supabase)

Aplicar na ordem:

1. `00_template_master_layout_lock.sql`
2. `01_seed_user_message_template_themes_official.sql`
3. `02_seed_user_message_templates_library_30.sql`
4. `03_seed_templates_for_existing_users.sql` (opcional)

Arquivos opcionais no modelo `crm_*` (não usados pelo módulo atual de Avisos):

1. `10_crm_message_templates_schema.sql`
2. `11_crm_message_templates_seed.sql`

## Como usar para um usuário específico

```sql
select public.seed_user_message_template_themes('UUID_USUARIO'::uuid, 'UUID_EMPRESA'::uuid, true);
select public.seed_user_message_templates('UUID_USUARIO'::uuid, 'UUID_EMPRESA'::uuid, true);
```

## Forçar atualização (sobrescrever biblioteca oficial)

```sql
select public.seed_user_message_template_themes('UUID_USUARIO'::uuid, 'UUID_EMPRESA'::uuid, true);
select public.seed_user_message_templates('UUID_USUARIO'::uuid, 'UUID_EMPRESA'::uuid, true);
```

Observação: o botão `Carregar biblioteca oficial SGVTUR` em `Parâmetros > Avisos` agora usa o catálogo local versionado no app e não depende dessas funções SQL para montar a biblioteca visual oficial.

Observação 2: os assets visuais oficiais atuais ficam em `public/assets/cards/themes-master/*`.
