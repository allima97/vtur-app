-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.acomodacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT acomodacoes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.admin_avisos_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  assunto text NOT NULL,
  mensagem text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  sender_key text NOT NULL DEFAULT 'avisos'::text,
  CONSTRAINT admin_avisos_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.admin_email_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  smtp_host text,
  smtp_port integer,
  smtp_secure boolean NOT NULL DEFAULT true,
  smtp_user text,
  smtp_pass text,
  alerta_from_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  admin_from_email text,
  avisos_from_email text,
  financeiro_from_email text,
  suporte_from_email text,
  resend_api_key text,
  CONSTRAINT admin_email_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.agenda_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['evento'::text, 'todo'::text])),
  titulo text NOT NULL,
  descricao text,
  start_date date,
  end_date date,
  all_day boolean DEFAULT true,
  status text DEFAULT 'novo'::text CHECK (status = ANY (ARRAY['novo'::text, 'agendado'::text, 'em_andamento'::text, 'concluido'::text])),
  done boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  categoria_id uuid,
  prioridade text CHECK (prioridade = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text])),
  arquivo text,
  CONSTRAINT agenda_itens_pkey PRIMARY KEY (id),
  CONSTRAINT agenda_itens_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.todo_categorias(id)
);
CREATE TABLE public.auth_signup_debug (
  id bigint NOT NULL DEFAULT nextval('auth_signup_debug_id_seq'::regclass),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  auth_user_id uuid,
  auth_email text,
  err text,
  detail text,
  hint text,
  context text,
  CONSTRAINT auth_signup_debug_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campanhas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  titulo text NOT NULL,
  imagem_url text,
  imagem_path text,
  link_url text,
  link_instagram text,
  link_facebook text,
  data_campanha date NOT NULL,
  validade_ate date,
  regras text,
  status text NOT NULL DEFAULT 'ativa'::text CHECK (status = ANY (ARRAY['ativa'::text, 'inativa'::text, 'cancelada'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campanhas_pkey PRIMARY KEY (id),
  CONSTRAINT campanhas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT campanhas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.cidades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subdivisao_id uuid NOT NULL,
  nome text NOT NULL,
  latitude numeric,
  longitude numeric,
  populacao integer,
  created_at timestamp with time zone DEFAULT now(),
  descricao text,
  CONSTRAINT cidades_pkey PRIMARY KEY (id),
  CONSTRAINT cidades_subdivisao_id_fkey FOREIGN KEY (subdivisao_id) REFERENCES public.subdivisoes(id)
);
CREATE TABLE public.circuito_datas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  circuito_id uuid NOT NULL,
  data_inicio date NOT NULL,
  cidade_inicio_id uuid,
  dias_extra_antes integer NOT NULL DEFAULT 0,
  dias_extra_depois integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT circuito_datas_pkey PRIMARY KEY (id),
  CONSTRAINT circuito_datas_circuito_id_fkey FOREIGN KEY (circuito_id) REFERENCES public.circuitos(id),
  CONSTRAINT circuito_datas_cidade_inicio_id_fkey FOREIGN KEY (cidade_inicio_id) REFERENCES public.cidades(id)
);
CREATE TABLE public.circuito_dias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  circuito_id uuid NOT NULL,
  dia_numero integer NOT NULL,
  titulo text,
  descricao text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT circuito_dias_pkey PRIMARY KEY (id),
  CONSTRAINT circuito_dias_circuito_id_fkey FOREIGN KEY (circuito_id) REFERENCES public.circuitos(id)
);
CREATE TABLE public.circuito_dias_cidades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  circuito_dia_id uuid NOT NULL,
  cidade_id uuid NOT NULL,
  ordem integer NOT NULL DEFAULT 1,
  CONSTRAINT circuito_dias_cidades_pkey PRIMARY KEY (id),
  CONSTRAINT circuito_dias_cidades_circuito_dia_id_fkey FOREIGN KEY (circuito_dia_id) REFERENCES public.circuito_dias(id),
  CONSTRAINT circuito_dias_cidades_cidade_id_fkey FOREIGN KEY (cidade_id) REFERENCES public.cidades(id)
);
CREATE TABLE public.circuitos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo text,
  operador text,
  resumo text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT circuitos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cliente_acompanhantes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  company_id uuid NOT NULL,
  nome_completo text NOT NULL,
  cpf text,
  rg text,
  telefone text,
  grau_parentesco text,
  data_nascimento date,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cliente_acompanhantes_pkey PRIMARY KEY (id),
  CONSTRAINT cliente_acompanhantes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  CONSTRAINT cliente_acompanhantes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT cliente_acompanhantes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nascimento date,
  cpf character varying,
  telefone character varying,
  email text,
  endereco text,
  complemento text,
  cidade text,
  estado text,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  whatsapp character varying,
  rg character varying,
  genero character varying,
  nacionalidade character varying,
  tipo_cliente character varying,
  tags ARRAY,
  ativo boolean NOT NULL DEFAULT true,
  company_id uuid,
  cep text,
  numero text,
  active boolean DEFAULT true,
  classificacao text,
  created_by uuid,
  CONSTRAINT clientes_pkey PRIMARY KEY (id),
  CONSTRAINT clientes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT clientes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.comissionamento_geral (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL UNIQUE,
  meta_nao_atingida numeric,
  meta_atingida numeric,
  super_meta numeric,
  diferenciado numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comissionamento_geral_pkey PRIMARY KEY (id)
);
CREATE TABLE public.commission_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  beneficiary_user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'PAID'::text, 'REVERSED'::text])),
  payable_date date NOT NULL,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commission_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT commission_ledger_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sale(id),
  CONSTRAINT commission_ledger_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES public.sale_item(id)
);
CREATE TABLE public.commission_rule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  tipo USER-DEFINED NOT NULL DEFAULT 'GERAL'::commission_rule_type,
  meta_nao_atingida numeric,
  meta_atingida numeric,
  super_meta numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commission_rule_pkey PRIMARY KEY (id)
);
CREATE TABLE public.commission_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  meta_nao_atingida numeric,
  meta_atingida numeric,
  super_meta numeric,
  esc_ativado boolean NOT NULL DEFAULT false,
  esc_inicial_pct numeric,
  esc_final_pct numeric,
  esc_incremento_pct_meta numeric,
  esc_incremento_pct_comissao numeric,
  esc2_ativado boolean NOT NULL DEFAULT false,
  esc2_inicial_pct numeric,
  esc2_final_pct numeric,
  esc2_incremento_pct_meta numeric,
  esc2_incremento_pct_comissao numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  modo text NOT NULL DEFAULT 'FIXO'::text,
  CONSTRAINT commission_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.commission_tier (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL,
  faixa text NOT NULL CHECK (faixa = ANY (ARRAY['PRE'::text, 'POS'::text])),
  de_pct numeric NOT NULL,
  ate_pct numeric NOT NULL,
  inc_pct_meta numeric NOT NULL,
  inc_pct_comissao numeric NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commission_tier_pkey PRIMARY KEY (id),
  CONSTRAINT commission_tier_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rule(id)
);
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_empresa character varying NOT NULL,
  nome_fantasia character varying NOT NULL,
  cnpj character varying NOT NULL UNIQUE,
  endereco text,
  telefone character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  cidade character varying,
  estado character varying,
  owner_user_id uuid,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.company_billing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  plan_id uuid,
  status text NOT NULL DEFAULT 'trial'::text,
  valor_mensal numeric,
  ultimo_pagamento date,
  proximo_vencimento date,
  inicio_cobranca date,
  trial_ends_at date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_billing_pkey PRIMARY KEY (id),
  CONSTRAINT company_billing_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT company_billing_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id)
);
CREATE TABLE public.company_billing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  billing_id uuid,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  valor numeric,
  moeda text NOT NULL DEFAULT 'BRL'::text,
  referencia text,
  vencimento date,
  pago_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_billing_events_pkey PRIMARY KEY (id),
  CONSTRAINT company_billing_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT company_billing_events_billing_id_fkey FOREIGN KEY (billing_id) REFERENCES public.company_billing(id)
);
CREATE TABLE public.consultorias_online (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid,
  cliente_nome text NOT NULL,
  data_hora timestamp with time zone NOT NULL,
  lembrete text NOT NULL DEFAULT '15min'::text,
  destino text,
  quantidade_pessoas integer NOT NULL DEFAULT 1,
  orcamento_id uuid,
  taxa_consultoria numeric NOT NULL DEFAULT 0,
  notas text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('UTC'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('UTC'::text, now()),
  lembrete_enviado_em timestamp with time zone,
  lembrete_envios jsonb NOT NULL DEFAULT '{}'::jsonb,
  fechada boolean NOT NULL DEFAULT false,
  fechada_em timestamp with time zone,
  CONSTRAINT consultorias_online_pkey PRIMARY KEY (id),
  CONSTRAINT consultorias_online_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT consultorias_online_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
);
CREATE TABLE public.cron_log_alertas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text,
  total integer,
  pendentes integer,
  gerados integer,
  status_atualizados integer,
  webhook_status text,
  email_status text,
  dry_run boolean,
  dias_status jsonb,
  canal text,
  destinatario text,
  criado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT cron_log_alertas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.dashboard_widgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  widget text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  visivel boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  settings jsonb,
  CONSTRAINT dashboard_widgets_pkey PRIMARY KEY (id),
  CONSTRAINT dashboard_widgets_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id)
);
CREATE TABLE public.escala_dia (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  escala_mes_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  data date NOT NULL,
  tipo text NOT NULL,
  hora_inicio time without time zone,
  hora_fim time without time zone,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT escala_dia_pkey PRIMARY KEY (id),
  CONSTRAINT escala_dia_escala_mes_id_fkey FOREIGN KEY (escala_mes_id) REFERENCES public.escala_mes(id),
  CONSTRAINT escala_dia_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id)
);
CREATE TABLE public.escala_horario_usuario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  usuario_id uuid NOT NULL UNIQUE,
  seg_inicio time without time zone,
  seg_fim time without time zone,
  ter_inicio time without time zone,
  ter_fim time without time zone,
  qua_inicio time without time zone,
  qua_fim time without time zone,
  qui_inicio time without time zone,
  qui_fim time without time zone,
  sex_inicio time without time zone,
  sex_fim time without time zone,
  sab_inicio time without time zone,
  sab_fim time without time zone,
  dom_inicio time without time zone,
  dom_fim time without time zone,
  feriado_inicio time without time zone,
  feriado_fim time without time zone,
  auto_aplicar boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT escala_horario_usuario_pkey PRIMARY KEY (id),
  CONSTRAINT escala_horario_usuario_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT escala_horario_usuario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id)
);
CREATE TABLE public.escala_mes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  gestor_id uuid NOT NULL,
  periodo date NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'::text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT escala_mes_pkey PRIMARY KEY (id),
  CONSTRAINT escala_mes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT escala_mes_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.users(id)
);
CREATE TABLE public.estados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  pais_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT estados_pkey PRIMARY KEY (id)
);
CREATE TABLE public.feriados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  data date NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL,
  estado text,
  cidade text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feriados_pkey PRIMARY KEY (id),
  CONSTRAINT feriados_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.formas_pagamento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  paga_comissao boolean NOT NULL DEFAULT true,
  permite_desconto boolean NOT NULL DEFAULT false,
  desconto_padrao_pct numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT formas_pagamento_pkey PRIMARY KEY (id),
  CONSTRAINT formas_pagamento_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.fornecedores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  localizacao text NOT NULL CHECK (localizacao = ANY (ARRAY['brasil'::text, 'exterior'::text])),
  nome_completo text NOT NULL,
  nome_fantasia text,
  cnpj text,
  cep text,
  cidade text,
  estado text,
  telefone text,
  whatsapp text,
  telefone_emergencia text,
  responsavel text,
  tipo_faturamento text NOT NULL CHECK (tipo_faturamento = ANY (ARRAY['pre_pago'::text, 'semanal'::text, 'quinzenal'::text, 'mensal'::text])),
  principais_servicos text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fornecedores_pkey PRIMARY KEY (id),
  CONSTRAINT fornecedores_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.gestor_equipe_compartilhada (
  gestor_id uuid NOT NULL,
  gestor_base_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT gestor_equipe_compartilhada_pkey PRIMARY KEY (gestor_id),
  CONSTRAINT gestor_equipe_compartilhada_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.users(id),
  CONSTRAINT gestor_equipe_compartilhada_gestor_base_id_fkey FOREIGN KEY (gestor_base_id) REFERENCES public.users(id),
  CONSTRAINT gestor_equipe_compartilhada_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.gestor_vendedor (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gestor_id uuid,
  vendedor_id uuid,
  company_id uuid,
  pode_modificar boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  CONSTRAINT gestor_vendedor_pkey PRIMARY KEY (id),
  CONSTRAINT gestor_vendedor_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.users(id),
  CONSTRAINT gestor_vendedor_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.users(id),
  CONSTRAINT gestor_vendedor_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.historico_viagens_real (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  destino_id uuid NOT NULL,
  data_viagem date,
  produto text,
  valor numeric DEFAULT 0,
  recibos jsonb,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  valor_total numeric,
  CONSTRAINT historico_viagens_real_pkey PRIMARY KEY (id),
  CONSTRAINT historico_viagens_real_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id),
  CONSTRAINT historico_viagens_real_destino_id_fkey FOREIGN KEY (destino_id) REFERENCES public.produtos(id),
  CONSTRAINT historico_viagens_real_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
);
CREATE TABLE public.hotel (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  categoria integer NOT NULL CHECK (categoria >= 1 AND categoria <= 5),
  endereco text,
  timezone text NOT NULL DEFAULT 'UTC'::text,
  moeda_padrao text NOT NULL DEFAULT 'BRL'::text,
  ativo boolean NOT NULL DEFAULT true,
  CONSTRAINT hotel_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hotel_policy (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['CANCELAMENTO'::text, 'NOSHOW'::text])),
  dias_antes integer NOT NULL,
  penalidade_tipo text NOT NULL CHECK (penalidade_tipo = ANY (ARRAY['FIXED'::text, 'PERCENT'::text, 'PRIMEIRA_NOITE'::text])),
  penalidade_valor numeric NOT NULL,
  CONSTRAINT hotel_policy_pkey PRIMARY KEY (id),
  CONSTRAINT hotel_policy_rate_plan_id_fkey FOREIGN KEY (rate_plan_id) REFERENCES public.rate_plan(id)
);
CREATE TABLE public.hotel_rate (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL,
  moeda text NOT NULL,
  valor_base numeric NOT NULL,
  tipo_valor text NOT NULL CHECK (tipo_valor = ANY (ARRAY['PER_NOITE'::text, 'PER_PAX'::text])),
  inclui_taxas boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  CONSTRAINT hotel_rate_pkey PRIMARY KEY (id),
  CONSTRAINT hotel_rate_rate_plan_id_fkey FOREIGN KEY (rate_plan_id) REFERENCES public.rate_plan(id)
);
CREATE TABLE public.hotel_rate_occupancy (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hotel_rate_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['ADULT_EXTRA'::text, 'CHILD'::text, 'EXTRABED'::text])),
  valor numeric NOT NULL,
  CONSTRAINT hotel_rate_occupancy_pkey PRIMARY KEY (id),
  CONSTRAINT hotel_rate_occupancy_hotel_rate_id_fkey FOREIGN KEY (hotel_rate_id) REFERENCES public.hotel_rate(id)
);
CREATE TABLE public.hotel_rate_period (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hotel_rate_id uuid NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ajuste_tipo text NOT NULL CHECK (ajuste_tipo = ANY (ARRAY['FIXED'::text, 'PERCENT'::text])),
  ajuste_valor numeric NOT NULL,
  dias_semana ARRAY,
  CONSTRAINT hotel_rate_period_pkey PRIMARY KEY (id),
  CONSTRAINT hotel_rate_period_hotel_rate_id_fkey FOREIGN KEY (hotel_rate_id) REFERENCES public.hotel_rate(id)
);
CREATE TABLE public.hotel_room_type (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  nome text NOT NULL,
  capacidade_max integer NOT NULL,
  permite_extrabed boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  CONSTRAINT hotel_room_type_pkey PRIMARY KEY (id),
  CONSTRAINT hotel_room_type_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES public.hotel(id)
);
CREATE TABLE public.hotel_tax_fee (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['FIXED'::text, 'PERCENT'::text])),
  valor numeric NOT NULL,
  por text NOT NULL CHECK (por = ANY (ARRAY['PER_NOITE'::text, 'PER_PAX'::text, 'PER_RESERVA'::text])),
  paga_local boolean NOT NULL DEFAULT false,
  moeda text NOT NULL,
  CONSTRAINT hotel_tax_fee_pkey PRIMARY KEY (id),
  CONSTRAINT hotel_tax_fee_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES public.hotel(id)
);
CREATE TABLE public.inquiry (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  origin text NOT NULL CHECK (origin = ANY (ARRAY['CLIENT'::text, 'SELLER'::text])),
  client_id uuid,
  assigned_seller_id uuid,
  country_id uuid,
  city_id uuid,
  destination_id uuid,
  checkin date,
  checkout date,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  currency_preference text NOT NULL DEFAULT 'BRL'::text,
  status text NOT NULL DEFAULT 'OPEN'::text CHECK (status = ANY (ARRAY['OPEN'::text, 'IN_PROGRESS'::text, 'QUOTED'::text, 'CLOSED'::text, 'CANCELED'::text])),
  notes text,
  assigned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inquiry_preference (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL,
  preference_key text NOT NULL,
  preference_value text NOT NULL,
  CONSTRAINT inquiry_preference_pkey PRIMARY KEY (id),
  CONSTRAINT inquiry_preference_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.inquiry(id)
);
CREATE TABLE public.logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  modulo text NOT NULL,
  acao text NOT NULL,
  detalhes jsonb,
  ip text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT logs_pkey PRIMARY KEY (id),
  CONSTRAINT logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.master_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  master_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  doc_type text NOT NULL,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'master-docs'::text,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT master_documents_pkey PRIMARY KEY (id),
  CONSTRAINT master_documents_master_id_fkey FOREIGN KEY (master_id) REFERENCES public.users(id),
  CONSTRAINT master_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);
CREATE TABLE public.master_empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  master_id uuid NOT NULL,
  company_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  approved_by uuid,
  CONSTRAINT master_empresas_pkey PRIMARY KEY (id),
  CONSTRAINT master_empresas_master_id_fkey FOREIGN KEY (master_id) REFERENCES public.users(id),
  CONSTRAINT master_empresas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT master_empresas_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id)
);
CREATE TABLE public.metas_vendedor (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL,
  periodo date NOT NULL,
  meta_geral numeric NOT NULL DEFAULT 0.00,
  meta_diferenciada numeric NOT NULL DEFAULT 0.00,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  template_id uuid,
  scope text NOT NULL DEFAULT 'vendedor'::text,
  CONSTRAINT metas_vendedor_pkey PRIMARY KEY (id),
  CONSTRAINT metas_vendedor_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.commission_templates(id)
);
CREATE TABLE public.metas_vendedor_produto (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  meta_vendedor_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT metas_vendedor_produto_pkey PRIMARY KEY (id),
  CONSTRAINT metas_vendedor_produto_meta_vendedor_id_fkey FOREIGN KEY (meta_vendedor_id) REFERENCES public.metas_vendedor(id),
  CONSTRAINT metas_vendedor_produto_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.tipo_produtos(id)
);
CREATE TABLE public.modulo_acesso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  modulo character varying NOT NULL CHECK (TRIM(BOTH FROM COALESCE(modulo, ''::character varying)) <> ''::text),
  permissao character varying NOT NULL DEFAULT 'none'::character varying CHECK (permissao::text = ANY (ARRAY['none'::character varying, 'view'::character varying, 'create'::character varying, 'edit'::character varying, 'delete'::character varying, 'admin'::character varying]::text[])),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT modulo_acesso_pkey PRIMARY KEY (id),
  CONSTRAINT modulo_acesso_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id)
);
CREATE TABLE public.modulo_acesso_backup (
  id uuid,
  usuario_id uuid,
  modulo character varying,
  permissao character varying,
  ativo boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);
CREATE TABLE public.mural_recado_respostas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recado_id uuid NOT NULL,
  company_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  conteudo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mural_recado_respostas_pkey PRIMARY KEY (id),
  CONSTRAINT mural_recado_respostas_recado_id_fkey FOREIGN KEY (recado_id) REFERENCES public.mural_recados(id),
  CONSTRAINT mural_recado_respostas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT mural_recado_respostas_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id)
);
CREATE TABLE public.mural_recados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  receiver_id uuid,
  assunto text,
  conteudo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sender_deleted boolean NOT NULL DEFAULT false,
  receiver_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT mural_recados_pkey PRIMARY KEY (id),
  CONSTRAINT mural_recados_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT mural_recados_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id),
  CONSTRAINT mural_recados_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id)
);
CREATE TABLE public.mural_recados_arquivos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  recado_id uuid NOT NULL,
  uploaded_by uuid,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'mural-recados'::text,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mural_recados_arquivos_pkey PRIMARY KEY (id),
  CONSTRAINT mural_recados_arquivos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT mural_recados_arquivos_recado_id_fkey FOREIGN KEY (recado_id) REFERENCES public.mural_recados(id),
  CONSTRAINT mural_recados_arquivos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);
CREATE TABLE public.mural_recados_leituras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  recado_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mural_recados_leituras_pkey PRIMARY KEY (id),
  CONSTRAINT mural_recados_leituras_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT mural_recados_leituras_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT mural_recados_leituras_recado_id_fkey FOREIGN KEY (recado_id) REFERENCES public.mural_recados(id)
);
CREATE TABLE public.paises (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo_iso character NOT NULL UNIQUE,
  continente text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT paises_pkey PRIMARY KEY (id)
);
CREATE TABLE public.parametros_cambios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  owner_user_id uuid,
  moeda text NOT NULL,
  data date NOT NULL,
  valor numeric NOT NULL,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT parametros_cambios_pkey PRIMARY KEY (id),
  CONSTRAINT parametros_cambios_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT parametros_cambios_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.parametros_comissao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid UNIQUE,
  owner_user_id uuid,
  usar_taxas_na_meta boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  foco_valor text NOT NULL DEFAULT 'bruto'::text,
  modo_corporativo boolean NOT NULL DEFAULT false,
  politica_cancelamento text NOT NULL DEFAULT 'cancelar_venda'::text,
  foco_faturamento text DEFAULT 'bruto'::text,
  exportacao_pdf boolean DEFAULT false,
  exportacao_excel boolean DEFAULT false,
  CONSTRAINT parametros_comissao_pkey PRIMARY KEY (id),
  CONSTRAINT parametros_comissao_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT parametros_comissao_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.parametros_pagamentos_nao_comissionaveis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  termo text NOT NULL,
  termo_normalizado text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT parametros_pagamentos_nao_comissionaveis_pkey PRIMARY KEY (id),
  CONSTRAINT parametros_pagamentos_nao_comissionaveis_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT parametros_pagamentos_nao_comissionaveis_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.parametros_sistema (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid UNIQUE,
  usar_taxas_na_meta boolean NOT NULL DEFAULT false,
  foco_valor text NOT NULL DEFAULT 'bruto'::text,
  modo_corporativo boolean NOT NULL DEFAULT false,
  politica_cancelamento text NOT NULL DEFAULT 'cancelar_venda'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT parametros_sistema_pkey PRIMARY KEY (id),
  CONSTRAINT parametros_sistema_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.payment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'AUTHORIZED'::text, 'PAID'::text, 'CANCELED'::text, 'REFUNDED'::text])),
  method text NOT NULL CHECK (method = ANY (ARRAY['PIX'::text, 'CREDIT_CARD'::text, 'DEBIT_CARD'::text, 'BOLETO'::text, 'BANK_TRANSFER'::text, 'CASH'::text, 'OTHER'::text])),
  currency text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  paid_at timestamp with time zone,
  external_ref text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_pkey PRIMARY KEY (id),
  CONSTRAINT payment_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sale(id)
);
CREATE TABLE public.payment_installment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  installment_no integer NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  status text NOT NULL DEFAULT 'PENDING'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'CANCELED'::text, 'REFUNDED'::text])),
  paid_at timestamp with time zone,
  CONSTRAINT payment_installment_pkey PRIMARY KEY (id),
  CONSTRAINT payment_installment_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payment(id)
);
CREATE TABLE public.plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  valor_mensal numeric NOT NULL DEFAULT 0,
  moeda text NOT NULL DEFAULT 'BRL'::text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pricing_rule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true,
  item_type text CHECK (item_type = ANY (ARRAY['HOTEL'::text, 'TRANSFER'::text, 'TOUR'::text, 'PACKAGE'::text])),
  product_id uuid,
  destination_id uuid,
  country_id uuid,
  channel text NOT NULL DEFAULT 'B2C'::text CHECK (channel = ANY (ARRAY['B2C'::text, 'B2B'::text])),
  markup_type text NOT NULL CHECK (markup_type = ANY (ARRAY['FIXED'::text, 'PERCENT'::text])),
  markup_value numeric NOT NULL,
  commission_type text CHECK (commission_type = ANY (ARRAY['FIXED'::text, 'PERCENT'::text])),
  commission_value numeric,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pricing_rule_pkey PRIMARY KEY (id)
);
CREATE TABLE public.product_commission_rule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL UNIQUE,
  rule_id uuid NOT NULL,
  fix_meta_nao_atingida numeric,
  fix_meta_atingida numeric,
  fix_super_meta numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT product_commission_rule_pkey PRIMARY KEY (id),
  CONSTRAINT product_commission_rule_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.tipo_produtos(id),
  CONSTRAINT product_commission_rule_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rule(id)
);
CREATE TABLE public.product_commission_rule_pacote (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL,
  tipo_pacote text NOT NULL,
  rule_id uuid,
  fix_meta_nao_atingida numeric,
  fix_meta_atingida numeric,
  fix_super_meta numeric,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT product_commission_rule_pacote_pkey PRIMARY KEY (id),
  CONSTRAINT product_commission_rule_pacote_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.tipo_produtos(id),
  CONSTRAINT product_commission_rule_pacote_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rule(id)
);
CREATE TABLE public.produtos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome character varying NOT NULL,
  cidade_id uuid,
  informacoes_importantes text,
  atracao_principal text,
  melhor_epoca character varying,
  duracao_sugerida character varying,
  nivel_preco character varying,
  imagem_url text,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tipo_produto uuid,
  destino text,
  fornecedor_id uuid,
  todas_as_cidades boolean NOT NULL DEFAULT false,
  valor_neto numeric,
  margem numeric,
  valor_venda numeric,
  moeda text,
  cambio numeric,
  valor_em_reais numeric,
  circuito_id uuid,
  CONSTRAINT produtos_pkey PRIMARY KEY (id),
  CONSTRAINT produtos_tipo_produto_fkey FOREIGN KEY (tipo_produto) REFERENCES public.tipo_produtos(id),
  CONSTRAINT produtos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id),
  CONSTRAINT produtos_circuito_id_fkey FOREIGN KEY (circuito_id) REFERENCES public.circuitos(id)
);
CREATE TABLE public.produtos_tarifas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL,
  acomodacao text NOT NULL,
  qte_pax integer NOT NULL,
  tipo text,
  validade_de date NOT NULL,
  validade_ate date NOT NULL,
  valor_neto numeric NOT NULL,
  padrao text NOT NULL CHECK (padrao = ANY (ARRAY['Manual'::text, 'Padrao'::text])),
  margem numeric,
  valor_venda numeric NOT NULL,
  moeda text NOT NULL,
  cambio numeric NOT NULL,
  valor_em_reais numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT produtos_tarifas_pkey PRIMARY KEY (id),
  CONSTRAINT produtos_tarifas_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id)
);
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quote (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  client_id uuid,
  status USER-DEFINED NOT NULL DEFAULT 'DRAFT'::quote_status,
  currency text NOT NULL DEFAULT 'BRL'::text,
  total numeric NOT NULL DEFAULT 0,
  average_confidence numeric,
  source_file_path text,
  source_file_url text,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_negociacao text NOT NULL DEFAULT 'Enviado'::text CHECK (status_negociacao = ANY (ARRAY['Enviado'::text, 'Negociando'::text, 'Fechado'::text, 'Perdido'::text])),
  subtotal numeric,
  taxes numeric,
  client_name text,
  client_whatsapp text,
  client_email text,
  destino_cidade_id uuid,
  data_embarque date,
  data_final date,
  last_interaction_at timestamp with time zone,
  last_interaction_notes text,
  CONSTRAINT quote_pkey PRIMARY KEY (id),
  CONSTRAINT quote_destino_cidade_id_fkey FOREIGN KEY (destino_cidade_id) REFERENCES public.cidades(id),
  CONSTRAINT quote_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT quote_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clientes(id)
);
CREATE TABLE public.quote_import_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'INFO'::text,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quote_import_log_pkey PRIMARY KEY (id),
  CONSTRAINT quote_import_log_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quote(id)
);
CREATE TABLE public.quote_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  item_type text NOT NULL,
  title text,
  product_name text,
  city_name text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  currency text NOT NULL DEFAULT 'BRL'::text,
  confidence numeric,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  order_index integer NOT NULL DEFAULT 0,
  taxes_amount numeric NOT NULL DEFAULT 0,
  cidade_id uuid,
  CONSTRAINT quote_item_pkey PRIMARY KEY (id),
  CONSTRAINT quote_item_cidade_id_fkey FOREIGN KEY (cidade_id) REFERENCES public.cidades(id),
  CONSTRAINT quote_item_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quote(id)
);
CREATE TABLE public.quote_item_segment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_item_id uuid NOT NULL,
  segment_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quote_item_segment_pkey PRIMARY KEY (id),
  CONSTRAINT quote_item_segment_quote_item_id_fkey FOREIGN KEY (quote_item_id) REFERENCES public.quote_item(id)
);
CREATE TABLE public.quote_print_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  company_id uuid,
  logo_url text,
  consultor_nome text,
  filial_nome text,
  endereco_linha1 text,
  endereco_linha2 text,
  endereco_linha3 text,
  telefone text,
  whatsapp text,
  email text,
  rodape_texto text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  logo_path text,
  imagem_complementar_url text,
  imagem_complementar_path text,
  whatsapp_codigo_pais text,
  CONSTRAINT quote_print_settings_pkey PRIMARY KEY (id),
  CONSTRAINT quote_print_settings_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id),
  CONSTRAINT quote_print_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.rate_plan (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_type_id uuid NOT NULL,
  codigo text NOT NULL,
  regime text NOT NULL,
  reembolsavel boolean NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  CONSTRAINT rate_plan_pkey PRIMARY KEY (id),
  CONSTRAINT rate_plan_room_type_id_fkey FOREIGN KEY (room_type_id) REFERENCES public.hotel_room_type(id)
);
CREATE TABLE public.recibos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  valor numeric NOT NULL,
  descricao text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recibos_pkey PRIMARY KEY (id),
  CONSTRAINT recibos_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id),
  CONSTRAINT recibos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.tipo_produtos(id)
);
CREATE TABLE public.sac_controle (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  recibo text,
  tour text,
  data_solicitacao date,
  motivo text,
  contratante_pax text,
  ok_quando text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text DEFAULT 'aberto'::text,
  responsavel text,
  prazo date,
  CONSTRAINT sac_controle_pkey PRIMARY KEY (id),
  CONSTRAINT sac_controle_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT sac_controle_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT sac_controle_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.sac_interacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sac_id uuid NOT NULL,
  data_interacao date,
  descricao text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sac_interacoes_pkey PRIMARY KEY (id),
  CONSTRAINT sac_interacoes_sac_id_fkey FOREIGN KEY (sac_id) REFERENCES public.sac_controle(id),
  CONSTRAINT sac_interacoes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.sale (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL UNIQUE,
  client_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'CREATED'::text CHECK (status = ANY (ARRAY['CREATED'::text, 'CONFIRMED'::text, 'CANCELLED'::text])),
  currency text NOT NULL,
  total numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  financial_status text NOT NULL DEFAULT 'UNPAID'::text CHECK (financial_status = ANY (ARRAY['UNPAID'::text, 'PARTIALLY_PAID'::text, 'PAID'::text, 'REFUNDED'::text, 'CANCELLED'::text])),
  paid_total numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  cancelled_at timestamp with time zone,
  cancellation_reason text,
  cancellation_penalty numeric NOT NULL DEFAULT 0,
  CONSTRAINT sale_pkey PRIMARY KEY (id)
);
CREATE TABLE public.sale_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  quote_item_id uuid NOT NULL,
  product_id uuid NOT NULL,
  item_type text NOT NULL,
  quantity integer NOT NULL,
  net_unit numeric,
  markup_amount numeric,
  commission_amount numeric,
  gross_unit numeric,
  taxes numeric,
  total_item numeric,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sale_item_pkey PRIMARY KEY (id),
  CONSTRAINT sale_item_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sale(id)
);
CREATE TABLE public.servico_fornecedor_price (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  servico_fornecedor_id uuid NOT NULL,
  moeda text NOT NULL,
  valor_base numeric NOT NULL,
  tipo_valor text NOT NULL CHECK (tipo_valor = ANY (ARRAY['PER_PAX'::text, 'PER_RESERVA'::text, 'PER_DIA'::text])),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT servico_fornecedor_price_pkey PRIMARY KEY (id),
  CONSTRAINT servico_fornecedor_price_servico_fornecedor_id_fkey FOREIGN KEY (servico_fornecedor_id) REFERENCES public.servicos_fornecedor(id)
);
CREATE TABLE public.servico_fornecedor_price_period (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  servico_fornecedor_price_id uuid NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ajuste_tipo text NOT NULL CHECK (ajuste_tipo = ANY (ARRAY['FIXED'::text, 'PERCENT'::text])),
  ajuste_valor numeric NOT NULL,
  CONSTRAINT servico_fornecedor_price_period_pkey PRIMARY KEY (id),
  CONSTRAINT servico_fornecedor_price_period_price_id_fkey FOREIGN KEY (servico_fornecedor_price_id) REFERENCES public.servico_fornecedor_price(id)
);
CREATE TABLE public.servico_price (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL,
  moeda text NOT NULL,
  valor_base numeric NOT NULL,
  tipo_valor text NOT NULL CHECK (tipo_valor = ANY (ARRAY['PER_PAX'::text, 'PER_RESERVA'::text, 'PER_DIA'::text])),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT servico_price_pkey PRIMARY KEY (id),
  CONSTRAINT servico_price_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES public.servicos(id)
);
CREATE TABLE public.servico_price_period (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  servico_price_id uuid NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ajuste_tipo text NOT NULL CHECK (ajuste_tipo = ANY (ARRAY['FIXED'::text, 'PERCENT'::text])),
  ajuste_valor numeric NOT NULL,
  CONSTRAINT servico_price_period_pkey PRIMARY KEY (id),
  CONSTRAINT servico_price_period_servico_price_id_fkey FOREIGN KEY (servico_price_id) REFERENCES public.servico_price(id)
);
CREATE TABLE public.servicos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT servicos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.servicos_fornecedor (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT servicos_fornecedor_pkey PRIMARY KEY (id),
  CONSTRAINT servicos_fornecedor_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id)
);
CREATE TABLE public.subdivisoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pais_id uuid NOT NULL,
  codigo_admin1 text NOT NULL,
  nome text NOT NULL,
  tipo text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subdivisoes_pkey PRIMARY KEY (id),
  CONSTRAINT subdivisoes_pais_id_fkey FOREIGN KEY (pais_id) REFERENCES public.paises(id)
);
CREATE TABLE public.system_documentation (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  markdown text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT system_documentation_pkey PRIMARY KEY (id),
  CONSTRAINT system_documentation_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.system_documentation_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL,
  slug text NOT NULL,
  markdown text NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT system_documentation_versions_pkey PRIMARY KEY (id),
  CONSTRAINT system_documentation_versions_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.system_documentation(id),
  CONSTRAINT system_documentation_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.tipo_pacotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  rule_id uuid,
  fix_meta_nao_atingida numeric,
  fix_meta_atingida numeric,
  fix_super_meta numeric,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tipo_pacotes_pkey PRIMARY KEY (id),
  CONSTRAINT tipo_pacotes_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.commission_rule(id)
);
CREATE TABLE public.tipo_produtos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo character varying NOT NULL,
  regra_comissionamento character varying NOT NULL CHECK (regra_comissionamento::text = ANY (ARRAY['geral'::character varying, 'diferenciado'::character varying]::text[])),
  soma_na_meta boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  nome text,
  usa_meta_produto boolean NOT NULL DEFAULT false,
  meta_produto_valor numeric,
  comissao_produto_meta_pct numeric,
  descontar_meta_geral boolean NOT NULL DEFAULT true,
  exibe_kpi_comissao boolean NOT NULL DEFAULT true,
  CONSTRAINT tipo_produtos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.todo_categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#f97316'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT todo_categorias_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_convites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_user_id uuid,
  invited_email text NOT NULL,
  company_id uuid NOT NULL,
  user_type_id uuid,
  invited_by uuid NOT NULL,
  invited_by_role text NOT NULL DEFAULT 'GESTOR'::text CHECK (upper(invited_by_role) = ANY (ARRAY['ADMIN'::text, 'MASTER'::text, 'GESTOR'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (lower(status) = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  accepted_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '01:00:00'::interval),
  CONSTRAINT user_convites_pkey PRIMARY KEY (id),
  CONSTRAINT user_convites_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES public.users(id),
  CONSTRAINT user_convites_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT user_convites_user_type_id_fkey FOREIGN KEY (user_type_id) REFERENCES public.user_types(id),
  CONSTRAINT user_convites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);
CREATE TABLE public.user_type_default_perms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_type_id uuid NOT NULL,
  modulo text NOT NULL,
  permissao text NOT NULL DEFAULT 'none'::text CHECK (lower(permissao) = ANY (ARRAY['none'::text, 'view'::text, 'create'::text, 'edit'::text, 'delete'::text, 'admin'::text])),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_type_default_perms_pkey PRIMARY KEY (id),
  CONSTRAINT user_type_default_perms_user_type_id_fkey FOREIGN KEY (user_type_id) REFERENCES public.user_types(id)
);
CREATE TABLE public.user_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  nome_completo character varying,
  cpf character varying UNIQUE,
  data_nascimento date,
  telefone character varying,
  cidade character varying,
  estado character varying,
  user_type_id uuid,
  uso_individual boolean DEFAULT true,
  company_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  email text UNIQUE,
  rg text,
  whatsapp text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  created_by_gestor boolean NOT NULL DEFAULT false,
  welcome_email_sent boolean NOT NULL DEFAULT false,
  participa_ranking boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  password_changed_at timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT users_user_type_id_fkey FOREIGN KEY (user_type_id) REFERENCES public.user_types(id),
  CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.vendas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  destino_id uuid NOT NULL,
  data_lancamento date NOT NULL,
  data_embarque date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  produto_id uuid,
  valor_total numeric DEFAULT 0,
  status character varying DEFAULT 'aberto'::character varying,
  notas text,
  numero_venda text UNIQUE,
  cancelada boolean NOT NULL DEFAULT false,
  vendedor_id uuid,
  destino_cidade_id uuid,
  data_final date,
  desconto_comercial_aplicado boolean DEFAULT false,
  desconto_comercial_valor numeric,
  valor_total_bruto numeric,
  valor_total_pago numeric,
  valor_taxas numeric,
  valor_nao_comissionado numeric,
  company_id uuid,
  data_venda date NOT NULL,
  CONSTRAINT vendas_pkey PRIMARY KEY (id),
  CONSTRAINT vendas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT vendas_destino_id_fkey FOREIGN KEY (destino_id) REFERENCES public.produtos(id),
  CONSTRAINT vendas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  CONSTRAINT vendas_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.tipo_produtos(id),
  CONSTRAINT vendas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.users(id),
  CONSTRAINT vendas_destino_cidade_id_fkey FOREIGN KEY (destino_cidade_id) REFERENCES public.cidades(id)
);
CREATE TABLE public.vendas_pagamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  forma_pagamento_id uuid,
  company_id uuid NOT NULL,
  forma_nome text,
  operacao text,
  plano text,
  valor_bruto numeric,
  desconto_valor numeric,
  valor_total numeric,
  parcelas jsonb,
  parcelas_qtd integer,
  parcelas_valor numeric,
  vencimento_primeira date,
  paga_comissao boolean,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vendas_pagamentos_pkey PRIMARY KEY (id),
  CONSTRAINT vendas_pagamentos_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id),
  CONSTRAINT vendas_pagamentos_forma_pagamento_id_fkey FOREIGN KEY (forma_pagamento_id) REFERENCES public.formas_pagamento(id),
  CONSTRAINT vendas_pagamentos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.vendas_recibos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  produto_id uuid,
  numero_recibo text,
  valor_total numeric,
  valor_taxas numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data_inicio date,
  data_fim date,
  produto_resolvido_id uuid,
  numero_reserva text,
  contrato_path text,
  contrato_url text,
  tipo_pacote text,
  CONSTRAINT vendas_recibos_pkey PRIMARY KEY (id),
  CONSTRAINT vendas_recibos_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id),
  CONSTRAINT vendas_recibos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.tipo_produtos(id),
  CONSTRAINT vendas_recibos_produto_resolvido_id_fkey FOREIGN KEY (produto_resolvido_id) REFERENCES public.produtos(id)
);
CREATE TABLE public.vendas_recibos_complementares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  recibo_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vendas_recibos_complementares_pkey PRIMARY KEY (id),
  CONSTRAINT vendas_recibos_complementares_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id),
  CONSTRAINT vendas_recibos_complementares_recibo_id_fkey FOREIGN KEY (recibo_id) REFERENCES public.vendas_recibos(id)
);
CREATE TABLE public.vendas_recibos_notas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  recibo_id uuid NOT NULL,
  company_id uuid NOT NULL,
  notas jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vendas_recibos_notas_pkey PRIMARY KEY (id),
  CONSTRAINT vendas_recibos_notas_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id),
  CONSTRAINT vendas_recibos_notas_recibo_id_fkey FOREIGN KEY (recibo_id) REFERENCES public.vendas_recibos(id),
  CONSTRAINT vendas_recibos_notas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.viagem_acompanhantes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL,
  acompanhante_id uuid NOT NULL,
  company_id uuid NOT NULL,
  papel text CHECK (papel = ANY (ARRAY['passageiro'::text, 'responsavel'::text])),
  documento_url text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT viagem_acompanhantes_pkey PRIMARY KEY (id),
  CONSTRAINT viagem_acompanhantes_viagem_id_fkey FOREIGN KEY (viagem_id) REFERENCES public.viagens(id),
  CONSTRAINT viagem_acompanhantes_acompanhante_id_fkey FOREIGN KEY (acompanhante_id) REFERENCES public.cliente_acompanhantes(id),
  CONSTRAINT viagem_acompanhantes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT viagem_acompanhantes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.viagem_documentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL,
  company_id uuid NOT NULL,
  titulo text NOT NULL,
  tipo text CHECK (tipo = ANY (ARRAY['voucher'::text, 'bilhete'::text, 'roteiro'::text, 'seguro'::text, 'passaporte'::text, 'outro'::text])),
  url text,
  mime_type text,
  size_bytes bigint,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT viagem_documentos_pkey PRIMARY KEY (id),
  CONSTRAINT viagem_documentos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT viagem_documentos_viagem_id_fkey FOREIGN KEY (viagem_id) REFERENCES public.viagens(id),
  CONSTRAINT viagem_documentos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.viagem_passageiros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  company_id uuid NOT NULL,
  papel text NOT NULL CHECK (papel = ANY (ARRAY['passageiro'::text, 'responsavel'::text])),
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT viagem_passageiros_pkey PRIMARY KEY (id),
  CONSTRAINT viagem_passageiros_viagem_id_fkey FOREIGN KEY (viagem_id) REFERENCES public.viagens(id),
  CONSTRAINT viagem_passageiros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  CONSTRAINT viagem_passageiros_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT viagem_passageiros_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.viagem_servicos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL,
  company_id uuid NOT NULL,
  tipo text CHECK (tipo = ANY (ARRAY['aereo'::text, 'hotel'::text, 'terrestre'::text, 'seguro'::text, 'passeio'::text, 'outro'::text])),
  fornecedor text,
  descricao text,
  status text DEFAULT 'ativo'::text,
  data_inicio date,
  data_fim date,
  valor numeric,
  moeda text DEFAULT 'BRL'::text,
  voucher_url text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT viagem_servicos_pkey PRIMARY KEY (id),
  CONSTRAINT viagem_servicos_viagem_id_fkey FOREIGN KEY (viagem_id) REFERENCES public.viagens(id),
  CONSTRAINT viagem_servicos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT viagem_servicos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.viagens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid,
  orcamento_id uuid,
  company_id uuid NOT NULL,
  responsavel_user_id uuid,
  origem text,
  destino text,
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'planejada'::text CHECK (status = ANY (ARRAY['planejada'::text, 'confirmada'::text, 'em_viagem'::text, 'concluida'::text, 'cancelada'::text])),
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  cliente_id uuid,
  recibo_id uuid,
  follow_up_text text,
  follow_up_fechado boolean NOT NULL DEFAULT false,
  CONSTRAINT viagens_pkey PRIMARY KEY (id),
  CONSTRAINT viagens_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.vendas(id),
  CONSTRAINT viagens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT viagens_responsavel_user_id_fkey FOREIGN KEY (responsavel_user_id) REFERENCES public.users(id),
  CONSTRAINT viagens_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  CONSTRAINT viagens_recibo_id_fkey FOREIGN KEY (recibo_id) REFERENCES public.vendas_recibos(id)
);