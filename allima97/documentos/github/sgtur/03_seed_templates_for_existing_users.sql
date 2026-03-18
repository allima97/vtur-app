-- SGVTUR / Templates
-- Executa o seed de artes + biblioteca de 30 templates para todos os usuários existentes.
-- Rode este script depois de aplicar os arquivos 01 e 02.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id, u.company_id
    FROM public.users u
  LOOP
    PERFORM public.seed_user_message_template_themes(r.id, r.company_id, true);
    PERFORM public.seed_user_message_templates(r.id, r.company_id, true);
  END LOOP;
END $$;
