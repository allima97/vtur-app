-- 2026-03-25: Hotfix de dimensões inválidas nas artes de avisos (evita cards 0x0)

do $$
begin
  if to_regclass('public.user_message_template_themes') is null then
    raise notice 'Tabela public.user_message_template_themes não existe; hotfix ignorado.';
  else
    execute 'alter table public.user_message_template_themes add column if not exists width_px integer';
    execute 'alter table public.user_message_template_themes add column if not exists height_px integer';

    execute $q$
      update public.user_message_template_themes
      set width_px = 768
      where coalesce(width_px, 0) <= 0
    $q$;

    execute $q$
      update public.user_message_template_themes
      set height_px = 1365
      where coalesce(height_px, 0) <= 0
    $q$;

    execute 'alter table public.user_message_template_themes alter column width_px set default 768';
    execute 'alter table public.user_message_template_themes alter column height_px set default 1365';
    execute 'alter table public.user_message_template_themes alter column width_px set not null';
    execute 'alter table public.user_message_template_themes alter column height_px set not null';

    execute 'alter table public.user_message_template_themes drop constraint if exists user_message_template_themes_dimension_check';
    execute 'alter table public.user_message_template_themes add constraint user_message_template_themes_dimension_check check (width_px > 0 and height_px > 0)';
  end if;
end
$$;
