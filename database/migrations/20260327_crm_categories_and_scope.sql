-- ================================================================
-- CRM: categorias de template, escopo de acesso e assinaturas salvas
-- ================================================================
-- Contexto: reformulação do módulo CRM (antes chamado "Avisos" nos
-- parâmetros). Cada template visual (arte/background) passa a ter:
--   • categoria_id  → agrupamento gerenciado pelo admin
--   • scope         → system | master | gestor | user
--   • greeting_text → texto do título pré-definido (ex.: "Feliz Aniversário!")
--   • limites       → máx. linhas e palavras da mensagem e da assinatura
--
-- Tabela de assinaturas salvas por usuário (3 linhas, tamanho por linha).
-- ================================================================

-- ── 1) Categorias gerenciadas pelo admin ──────────────────────────
create table if not exists public.crm_template_categories (
  id          uuid        primary key default gen_random_uuid(),
  nome        text        not null,
  descricao   text,
  icone       text        not null default 'pi pi-tag',
  sort_order  integer     not null default 0,
  ativo       boolean     not null default true,
  created_at  timestamptz          default now(),
  updated_at  timestamptz          default now()
);

create unique index if not exists crm_template_categories_nome_idx
  on public.crm_template_categories (lower(nome));

-- RLS: qualquer autenticado lê categorias ativas; só admin escreve
alter table public.crm_template_categories enable row level security;

drop policy if exists "crm_categories_select" on public.crm_template_categories;
create policy "crm_categories_select" on public.crm_template_categories
  for select using (ativo = true or public.is_admin(auth.uid()));

drop policy if exists "crm_categories_admin" on public.crm_template_categories;
create policy "crm_categories_admin" on public.crm_template_categories
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ── 2) Novas colunas em user_message_template_themes ─────────────
alter table public.user_message_template_themes
  add column if not exists categoria_id          uuid    references public.crm_template_categories(id),
  add column if not exists scope                 text    not null default 'user',
  add column if not exists greeting_text         text,
  add column if not exists mensagem_max_linhas   integer not null default 6,
  add column if not exists mensagem_max_palavras integer not null default 50,
  add column if not exists assinatura_max_linhas integer not null default 3,
  add column if not exists assinatura_max_palavras integer not null default 20;

alter table public.user_message_templates
  add column if not exists scope text not null default 'user';

alter table public.user_message_template_themes
  drop constraint if exists crm_theme_scope_check;
alter table public.user_message_template_themes
  add constraint crm_theme_scope_check
    check (scope in ('system', 'master', 'gestor', 'user'));

alter table public.user_message_templates
  drop constraint if exists user_message_templates_scope_check;
alter table public.user_message_templates
  add constraint user_message_templates_scope_check
    check (scope in ('system', 'master', 'gestor', 'user'));

-- ── 3) Assinaturas salvas por usuário ────────────────────────────
create table if not exists public.user_crm_assinaturas (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  company_id          uuid        references public.companies(id),
  nome                text        not null default 'Minha Assinatura',
  linha1              text,
  linha1_font_size    integer     not null default 40,
  linha1_italic       boolean     not null default true,
  linha2              text,
  linha2_font_size    integer     not null default 56,
  linha2_italic       boolean     not null default false,
  linha3              text,
  linha3_font_size    integer     not null default 38,
  linha3_italic       boolean     not null default false,
  is_default          boolean     not null default false,
  created_at          timestamptz          default now(),
  updated_at          timestamptz          default now()
);

-- Garante que cada usuário tenha no máximo uma assinatura padrão
create unique index if not exists user_crm_assinaturas_default_idx
  on public.user_crm_assinaturas (user_id)
  where is_default = true;

alter table public.user_crm_assinaturas enable row level security;

drop policy if exists "crm_assinaturas_own" on public.user_crm_assinaturas;
create policy "crm_assinaturas_own" on public.user_crm_assinaturas
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 4) Seed das categorias padrão ────────────────────────────────
insert into public.crm_template_categories (nome, icone, sort_order) values
  ('Aniversário',    'pi pi-gift',      1),
  ('Natal',          'pi pi-star',      2),
  ('Páscoa',         'pi pi-sun',       3),
  ('Ano Novo',       'pi pi-sparkles',  4),
  ('Dia das Mães',   'pi pi-heart',     5),
  ('Dia dos Pais',   'pi pi-heart',     6),
  ('Dia da Mulher',  'pi pi-heart',     7),
  ('Dia do Viajante','pi pi-map',       8),
  ('Geral',          'pi pi-tag',       9)
on conflict (lower(nome)) do nothing;

-- ── 5) Marca templates oficiais existentes como scope='system' ────
-- e tenta vincular à categoria pelo campo texto "categoria" já existente
do $$
declare
  cat record;
begin
  -- Atualiza scope para templates que parecem ser do sistema
  update public.user_message_template_themes
  set scope = 'system'
  where (
    lower(nome) like any (array[
      '%birthday%', '%christmas%', '%easter%', '%new-year%',
      '%mothers%', '%womens%', '%viajante%', '%aniversar%',
      '%natal%', '%pascal%', '%ano novo%', '%maes%', '%mulher%'
    ])
    or nome ~* '^(birthday|christmas|easter|new.year|mothers|womens|viajante)'
  )
  and scope = 'user';

  -- Vincula categoria_id pelo texto da coluna "categoria"
  for cat in select id, nome from public.crm_template_categories loop
    update public.user_message_template_themes t
    set categoria_id = cat.id
    where t.categoria_id is null
      and (
        lower(t.categoria) like '%' || lower(cat.nome) || '%'
        or lower(cat.nome) like '%' || lower(t.categoria) || '%'
      );
  end loop;
end $$;
