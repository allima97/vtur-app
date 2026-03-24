-- 2026-03-24: Nova estrutura de templates de mensagens com hierarquia
-- Admin > Master > Gestor > Usuário
-- Templates visuais com áreas vazias para preenchimento automático

-- ============================================
-- 1. Tabela de Temas Visuais (Assets)
-- ============================================

create table if not exists card_themes_v2 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Hierarquia (quem criou e quem pode ver)
  created_by uuid references auth.users(id) on delete cascade,
  scope text not null check (scope in ('system', 'company', 'team', 'user')),
  company_id uuid references companies(id) on delete cascade,
  gestor_id uuid references users(id) on delete cascade, -- para scope='team' (gestor da equipe)
  
  -- Identificação
  nome text not null, -- ex: "Aniversário Balões Coloridos"
  slug text unique not null, -- ex: "aniversario-baloes-coloridos"
  categoria text not null, -- ex: "aniversario", "natal", "boas-vindas"
  description text,
  tags text[],
  
  -- Asset visual
  storage_path text not null,
  asset_url text not null,
  width_px integer default 1080,
  height_px integer default 1080,
  file_size_bytes integer,
  mime_type text default 'image/png',
  
  -- Estilos padrão de texto (JSON flexível)
  title_style jsonb default '{
    "fontFamily": "Cormorant Garamond, Georgia, serif",
    "fontSize": "56px",
    "fontWeight": "700",
    "color": "#1D2744",
    "textAlign": "center",
    "lineHeight": "1.1"
  }'::jsonb,
  
  greeting_style jsonb default '{
    "fontFamily": "Alegreya Sans, Arial, sans-serif",
    "fontSize": "36px",
    "fontWeight": "500",
    "color": "#1D2744",
    "textAlign": "center",
    "lineHeight": "1.2"
  }'::jsonb,
  
  body_style jsonb default '{
    "fontFamily": "Alegreya Sans, Arial, sans-serif",
    "fontSize": "28px",
    "fontWeight": "400",
    "color": "#1D2744",
    "textAlign": "center",
    "lineHeight": "1.4"
  }'::jsonb,
  
  signature_style jsonb default '{
    "fontFamily": "Alegreya Sans, Arial, sans-serif",
    "fontSize": "24px",
    "fontWeight": "400",
    "color": "#1D2744",
    "textAlign": "left",
    "lineHeight": "1.3"
  }'::jsonb,
  
  -- Configuração de posições das áreas (coordenadas absolutas 1080x1080)
  layout_config jsonb default '{
    "width_px": 1080,
    "height_px": 1080,
    "areas": {
      "title": {
        "x": 540,
        "y": 100,
        "width": 800,
        "height": 100,
        "align": "center"
      },
      "greeting": {
        "x": 540,
        "y": 220,
        "width": 800,
        "height": 80,
        "align": "center"
      },
      "message": {
        "x": 540,
        "y": 400,
        "width": 800,
        "height": 300,
        "align": "center"
      },
      "signature": {
        "x": 100,
        "y": 880,
        "width": 400,
        "height": 120,
        "align": "left"
      },
      "logo": {
        "x": 960,
        "y": 960,
        "width": 120,
        "height": 120,
        "align": "center"
      }
    }
  }'::jsonb,
  
  -- Status
  ativo boolean default true,
  is_default boolean default false,
  
  -- Metadados
  version integer default 1,
  metadata jsonb default '{}'::jsonb
);

-- Índices
create index idx_card_themes_v2_scope on card_themes_v2(scope);
create index idx_card_themes_v2_company on card_themes_v2(company_id) where company_id is not null;
create index idx_card_themes_v2_gestor on card_themes_v2(gestor_id) where gestor_id is not null;
create index idx_card_themes_v2_categoria on card_themes_v2(categoria);
create index idx_card_themes_v2_ativo on card_themes_v2(ativo);
create index idx_card_themes_v2_slug on card_themes_v2(slug);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_card_themes_v2_updated_at 
    BEFORE UPDATE ON card_themes_v2 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- 2. Tabela de Templates de Mensagens
-- ============================================

create table if not exists message_templates_v2 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Hierarquia
  created_by uuid references auth.users(id) on delete cascade,
  scope text not null check (scope in ('system', 'company', 'team', 'user')),
  company_id uuid references companies(id) on delete cascade,
  gestor_id uuid references users(id) on delete cascade,
  
  -- Identificação
  nome text not null, -- ex: "Aniversário Padrão"
  slug text not null, -- ex: "aniversario-padrao"
  categoria text not null, -- ex: "aniversario"
  ocasiao text, -- ex: "aniversario_cliente", "aniversario_casamento"
  description text,
  tags text[],
  
  -- Referência ao tema visual
  theme_id uuid references card_themes_v2(id) on delete set null,
  
  -- Conteúdo do template (variáveis entre {{}})
  assunto text, -- Assunto do email/WhatsApp: "Feliz Aniversário, {{primeiro_nome}}!"
  titulo text not null, -- Título no card: "Feliz Aniversário!"
  corpo text not null, -- Corpo da mensagem (até 50 palavras)
  assinatura_padrao text, -- Assinatura padrão
  
  -- Variáveis esperadas (para validação)
  required_vars text[] default '{primeiro_nome,consultor,cargo_consultor}'::text[],
  optional_vars text[] default '{mensagem_personalizada,logo_url}'::text[],
  
  -- Overrides de estilo (opcional, mescla com theme)
  title_style_override jsonb,
  greeting_style_override jsonb,
  body_style_override jsonb,
  signature_style_override jsonb,
  
  -- Status e visibilidade
  ativo boolean default true,
  is_default boolean default false, -- template padrão para a categoria
  is_favorite boolean default false,
  
  -- Controle de uso
  usage_count integer default 0,
  last_used_at timestamp with time zone,
  
  -- Metadados
  metadata jsonb default '{}'::jsonb,
  version integer default 1
);

-- Índices
create index idx_message_templates_v2_scope on message_templates_v2(scope);
create index idx_message_templates_v2_company on message_templates_v2(company_id) where company_id is not null;
create index idx_message_templates_v2_gestor on message_templates_v2(gestor_id) where gestor_id is not null;
create index idx_message_templates_v2_categoria on message_templates_v2(categoria);
create index idx_message_templates_v2_ocasiao on message_templates_v2(ocasiao);
create index idx_message_templates_v2_theme on message_templates_v2(theme_id);
create index idx_message_templates_v2_ativo on message_templates_v2(ativo);
create index idx_message_templates_v2_slug on message_templates_v2(slug);
create index idx_message_templates_v2_created_by on message_templates_v2(created_by);

-- Trigger para updated_at
CREATE TRIGGER update_message_templates_v2_updated_at 
    BEFORE UPDATE ON message_templates_v2 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Constraint unique para slug (escopo global)
-- Templates do sistema não podem ter slug duplicado
CREATE UNIQUE INDEX idx_card_themes_v2_unique_slug_system ON card_themes_v2(slug) WHERE scope = 'system';
CREATE UNIQUE INDEX idx_message_templates_v2_unique_slug_system ON message_templates_v2(slug) WHERE scope = 'system';


-- ============================================
-- 3. Tabela de Renderizações (Cards Gerados)
-- ============================================

create table if not exists card_renders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  
  -- Referências
  template_id uuid references message_templates_v2(id) on delete set null,
  theme_id uuid references card_themes_v2(id) on delete set null,
  created_by uuid references auth.users(id) on delete cascade,
  
  -- Dados usados na renderização
  cliente_id uuid references clientes(id) on delete set null,
  variables jsonb not null, -- Todas as variáveis usadas
  
  -- Arquivo gerado
  storage_path text not null,
  asset_url text not null,
  width_px integer default 1080,
  height_px integer default 1080,
  file_size_bytes integer,
  mime_type text default 'image/png',
  
  -- Status
  status text default 'active' check (status in ('active', 'deleted', 'expired')),
  expires_at timestamp with time zone,
  
  -- Uso
  download_count integer default 0,
  sent_count integer default 0, -- quantas vezes foi enviado
  
  -- Metadados
  metadata jsonb default '{}'::jsonb
);

-- Índices
create index idx_card_renders_template on card_renders(template_id);
create index idx_card_renders_created_by on card_renders(created_by);
create index idx_card_renders_cliente on card_renders(cliente_id);
create index idx_card_renders_status on card_renders(status);
create index idx_card_renders_created_at on card_renders(created_at);


-- ============================================
-- 4. Funções Auxiliares
-- ============================================

-- Função para buscar templates visíveis para um usuário
CREATE OR REPLACE FUNCTION get_visible_templates(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  categoria text,
  scope text,
  theme_name text,
  theme_asset_url text
) AS $$
DECLARE
  v_company_id uuid;
  v_gestor_ids uuid[];
  v_user_type_name text;
BEGIN
  -- Buscar dados do usuário (incluindo nome do tipo via join)
  SELECT u.company_id, ut.name INTO v_company_id, v_user_type_name
  FROM users u
  LEFT JOIN user_types ut ON ut.id = u.user_type_id
  WHERE u.id = p_user_id;
  
  -- Buscar gestores do vendedor (gestores que têm este vendedor na equipe)
  SELECT array_agg(gestor_id) INTO v_gestor_ids
  FROM gestor_vendedor 
  WHERE vendedor_id = p_user_id AND ativo = true;
  
  RETURN QUERY
  SELECT 
    t.id,
    t.nome,
    t.categoria,
    t.scope,
    th.nome as theme_name,
    th.asset_url as theme_asset_url
  FROM message_templates_v2 t
  LEFT JOIN card_themes_v2 th ON th.id = t.theme_id
  WHERE t.ativo = true
    AND (
      -- Templates do sistema (admin)
      t.scope = 'system'
      OR
      -- Templates da empresa do usuário
      (t.scope = 'company' AND t.company_id = v_company_id)
      OR
      -- Templates do gestor (equipe)
      (t.scope = 'team' AND t.gestor_id = ANY(COALESCE(v_gestor_ids, ARRAY[]::uuid[])))
      OR
      -- Templates pessoais do usuário
      (t.scope = 'user' AND t.created_by = p_user_id)
    )
  ORDER BY 
    CASE t.scope 
      WHEN 'system' THEN 1 
      WHEN 'company' THEN 2 
      WHEN 'team' THEN 3 
      ELSE 4 
    END,
    t.categoria,
    t.nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 5. Políticas RLS (Row Level Security)
-- ============================================

-- Habilitar RLS
ALTER TABLE card_themes_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_renders ENABLE ROW LEVEL SECURITY;

-- Políticas para card_themes_v2
CREATE POLICY "card_themes_v2_select_policy" ON card_themes_v2
  FOR SELECT USING (
    ativo = true AND (
      scope = 'system'
      OR (scope = 'company' AND company_id IN (SELECT company_id FROM users WHERE id = auth.uid()))
      OR (scope = 'team' AND gestor_id IN (SELECT gestor_id FROM gestor_vendedor WHERE vendedor_id = auth.uid()))
      OR (scope = 'user' AND created_by = auth.uid())
    )
  );

CREATE POLICY "card_themes_v2_insert_policy" ON card_themes_v2
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
  );

CREATE POLICY "card_themes_v2_update_policy" ON card_themes_v2
  FOR UPDATE USING (
    created_by = auth.uid()
    OR (scope = 'company' AND company_id IN (
      SELECT u.company_id 
      FROM users u
      JOIN user_types ut ON ut.id = u.user_type_id
      WHERE u.id = auth.uid() AND ut.name IN ('admin', 'master')
    ))
  );

CREATE POLICY "card_themes_v2_delete_policy" ON card_themes_v2
  FOR DELETE USING (
    created_by = auth.uid()
    OR (scope = 'company' AND company_id IN (
      SELECT u.company_id 
      FROM users u
      JOIN user_types ut ON ut.id = u.user_type_id
      WHERE u.id = auth.uid() AND ut.name IN ('admin', 'master')
    ))
  );

-- Políticas para message_templates_v2 (mesma lógica)
CREATE POLICY "message_templates_v2_select_policy" ON message_templates_v2
  FOR SELECT USING (
    ativo = true AND (
      scope = 'system'
      OR (scope = 'company' AND company_id IN (SELECT company_id FROM users WHERE id = auth.uid()))
      OR (scope = 'team' AND gestor_id IN (SELECT gestor_id FROM gestor_vendedor WHERE vendedor_id = auth.uid()))
      OR (scope = 'user' AND created_by = auth.uid())
    )
  );

CREATE POLICY "message_templates_v2_insert_policy" ON message_templates_v2
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "message_templates_v2_update_policy" ON message_templates_v2
  FOR UPDATE USING (
    created_by = auth.uid()
    OR (scope = 'company' AND company_id IN (
      SELECT u.company_id 
      FROM users u
      JOIN user_types ut ON ut.id = u.user_type_id
      WHERE u.id = auth.uid() AND ut.name IN ('admin', 'master')
    ))
  );

CREATE POLICY "message_templates_v2_delete_policy" ON message_templates_v2
  FOR DELETE USING (
    created_by = auth.uid()
    OR (scope = 'company' AND company_id IN (
      SELECT u.company_id 
      FROM users u
      JOIN user_types ut ON ut.id = u.user_type_id
      WHERE u.id = auth.uid() AND ut.name IN ('admin', 'master')
    ))
  );

-- Políticas para card_renders
CREATE POLICY "card_renders_select_policy" ON card_renders
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "card_renders_insert_policy" ON card_renders
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "card_renders_delete_policy" ON card_renders
  FOR DELETE USING (created_by = auth.uid());


-- ============================================
-- 6. Dados Iniciais (Templates do Sistema)
-- ============================================

-- Inserir tema de aniversário (placeholder - será atualizado com asset real)
INSERT INTO card_themes_v2 (
  id,
  created_by,
  scope,
  nome,
  slug,
  categoria,
  description,
  storage_path,
  asset_url,
  width_px,
  height_px,
  title_style,
  greeting_style,
  body_style,
  signature_style,
  layout_config,
  ativo,
  is_default
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  null, -- sistema
  'system',
  'Aniversário Balões e Viagem',
  'aniversario-baloes-viagem',
  'aniversario',
  'Template de aniversário com balões coloridos e elementos discretos de viagem (avião, mala). Áreas de texto devem ficar vazias no asset.',
  'assets/cards/themes-v2/aniversario-baloes-viagem.png',
  '/assets/cards/themes-v2/aniversario-baloes-viagem.png',
  1080,
  1080,
  '{
    "fontFamily": "Cormorant Garamond, Georgia, serif",
    "fontSize": "56px",
    "fontWeight": "700",
    "color": "#1D2744",
    "textAlign": "center",
    "lineHeight": "1.1"
  }'::jsonb,
  '{
    "fontFamily": "Alegreya Sans, Arial, sans-serif",
    "fontSize": "36px",
    "fontWeight": "500",
    "color": "#1D2744",
    "textAlign": "center",
    "lineHeight": "1.2"
  }'::jsonb,
  '{
    "fontFamily": "Alegreya Sans, Arial, sans-serif",
    "fontSize": "28px",
    "fontWeight": "400",
    "color": "#1D2744",
    "textAlign": "center",
    "lineHeight": "1.5"
  }'::jsonb,
  '{
    "fontFamily": "Alegreya Sans, Arial, sans-serif",
    "fontSize": "22px",
    "fontWeight": "400",
    "color": "#1D2744",
    "textAlign": "left",
    "lineHeight": "1.4"
  }'::jsonb,
  '{
    "width_px": 1080,
    "height_px": 1080,
    "areas": {
      "title": {"x": 540, "y": 100, "width": 800, "height": 100, "align": "center"},
      "greeting": {"x": 540, "y": 220, "width": 800, "height": 80, "align": "center"},
      "message": {"x": 540, "y": 400, "width": 800, "height": 300, "align": "center"},
      "signature": {"x": 100, "y": 880, "width": 400, "height": 120, "align": "left"},
      "logo": {"x": 960, "y": 960, "width": 120, "height": 120, "align": "center"}
    }
  }'::jsonb,
  true,
  true
) ON CONFLICT (slug) WHERE scope = 'system' DO NOTHING;

-- Inserir template de aniversário
INSERT INTO message_templates_v2 (
  id,
  created_by,
  scope,
  nome,
  slug,
  categoria,
  ocasiao,
  description,
  theme_id,
  assunto,
  titulo,
  corpo,
  assinatura_padrao,
  required_vars,
  ativo,
  is_default
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  null, -- sistema
  'system',
  'Feliz Aniversário',
  'feliz-aniversario',
  'aniversario',
  'aniversario_cliente',
  'Template clássico de aniversário com balões coloridos e elementos de viagem discretos.',
  '11111111-1111-1111-1111-111111111111',
  'Feliz Aniversário, {{primeiro_nome}}! 🎉',
  'Feliz Aniversário!',
  'Hoje é um dia especial para celebrar você!

Que este novo ano de vida traga muitas alegrias, saúde e momentos inesquecíveis. E que sua próxima viagem seja ainda mais incrível!

Aproveite seu dia!',
  'Com carinho,
{{consultor}}
{{cargo_consultor}}',
  ARRAY['primeiro_nome', 'consultor', 'cargo_consultor'],
  true,
  true
) ON CONFLICT (slug) WHERE scope = 'system' DO NOTHING;


-- ============================================
-- 7. Comentários e Documentação
-- ============================================

COMMENT ON TABLE card_themes_v2 IS 'Temas visuais (assets de imagem) para cards de mensagens. Hierarquia: system > company > team > user';
COMMENT ON TABLE message_templates_v2 IS 'Templates de mensagens com conteúdo de texto. Referencia um tema visual. Hierarquia: system > company > team > user';
COMMENT ON TABLE card_renders IS 'Cards renderizados (imagens finais geradas) com dados específicos do cliente';

COMMENT ON COLUMN card_themes_v2.scope IS 'Nível de visibilidade: system (todos), company (empresa), team (equipe), user (pessoal)';
COMMENT ON COLUMN card_themes_v2.layout_config IS 'Configuração JSON com coordenadas das áreas de texto no template';
COMMENT ON COLUMN message_templates_v2.required_vars IS 'Array de variáveis obrigatórias para renderizar o template';
