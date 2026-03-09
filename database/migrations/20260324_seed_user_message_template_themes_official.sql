-- 2026-03-24: Seed oficial de temas visuais "base clean" do módulo Avisos
-- Usa backgrounds limpos (sem texto) e estilos padronizados de render.

create or replace function public.seed_user_message_template_themes(
  p_user_id uuid,
  p_company_id uuid default null,
  p_overwrite boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id é obrigatório';
  end if;

  if p_overwrite then
    delete from public.user_message_template_themes
    where user_id = p_user_id
      and nome in (
        'aniversario_base_clean',
        'natal_base_clean',
        'ano_novo_base_clean',
        'pascoa_base_clean',
        'dia_das_maes_base_clean',
        'dia_dos_pais_base_clean',
        'boas_vindas_base_clean',
        'pos_viagem_base_clean',
        'cliente_vip_base_clean',
        'cliente_inativo_base_clean',
        'aniversario_primeira_compra_base_clean',
        'ferias_base_clean'
      );
  end if;

  insert into public.user_message_template_themes (
    user_id,
    company_id,
    categoria,
    nome,
    storage_path,
    asset_url,
    width_px,
    height_px,
    title_style,
    body_style,
    signature_style,
    ativo
  )
  select
    p_user_id,
    p_company_id,
    s.categoria,
    s.nome,
    s.storage_path,
    s.asset_url,
    768,
    1365,
    '{
      "x": 384,
      "y": 455,
      "width": 560,
      "fontFamily": "Cormorant Garamond, Georgia, serif",
      "fontSize": 58,
      "fontWeight": 700,
      "lineHeight": 1.02,
      "textAlign": "center",
      "color": "#0B0B0B"
    }'::jsonb,
    '{
      "x": 384,
      "y": 760,
      "width": 520,
      "fontFamily": "Inter, Arial, sans-serif",
      "fontSize": 26,
      "fontWeight": 500,
      "lineHeight": 1.34,
      "textAlign": "center",
      "color": "#111111"
    }'::jsonb,
    '{
      "x": 545,
      "y": 1180,
      "width": 170,
      "fontFamily": "Inter, Arial, sans-serif",
      "fontSize": 23,
      "fontStyle": "italic",
      "fontWeight": 500,
      "lineHeight": 1.18,
      "textAlign": "left",
      "color": "#111111"
    }'::jsonb,
    true
  from (
    values
      ('aniversario', 'aniversario_base_clean', 'themes/aniversario/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/aniversario/base-clean.png'),
      ('natal', 'natal_base_clean', 'themes/natal/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/natal/base-clean.png'),
      ('ano_novo', 'ano_novo_base_clean', 'themes/ano-novo/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/ano-novo/base-clean.png'),
      ('pascoa', 'pascoa_base_clean', 'themes/pascoa/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/pascoa/base-clean.png'),
      ('dia_das_maes', 'dia_das_maes_base_clean', 'themes/dia-das-maes/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/dia-das-maes/base-clean.png'),
      ('dia_dos_pais', 'dia_dos_pais_base_clean', 'themes/dia-dos-pais/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/dia-dos-pais/base-clean.png'),
      ('boas_vindas', 'boas_vindas_base_clean', 'themes/boas-vindas/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/boas-vindas/base-clean.png'),
      ('pos_viagem', 'pos_viagem_base_clean', 'themes/pos-viagem/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/pos-viagem/base-clean.png'),
      ('cliente_vip', 'cliente_vip_base_clean', 'themes/cliente-vip/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/cliente-vip/base-clean.png'),
      ('cliente_inativo', 'cliente_inativo_base_clean', 'themes/cliente-inativo/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/cliente-inativo/base-clean.png'),
      ('aniversario_primeira_compra', 'aniversario_primeira_compra_base_clean', 'themes/aniversario-primeira-compra/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/aniversario-primeira-compra/base-clean.png'),
      ('ferias', 'ferias_base_clean', 'themes/ferias/base-clean.png', 'https://ggqmvruerbaqxthhnxrm.supabase.co/storage/v1/object/public/message-template-themes/themes/ferias/base-clean.png')
  ) as s(categoria, nome, storage_path, asset_url)
  where not exists (
    select 1
    from public.user_message_template_themes t
    where t.user_id = p_user_id
      and t.nome = s.nome
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.seed_user_message_template_themes(uuid, uuid, boolean) to authenticated;
