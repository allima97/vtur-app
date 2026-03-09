-- 2026-03-21: Seed de templates padrão (Aniversário, Natal, Ano Novo, Páscoa)
-- Uso:
--   select public.seed_user_message_templates('UUID_DO_USUARIO'::uuid, 'UUID_DA_EMPRESA'::uuid, false);
--   select public.seed_user_message_templates('UUID_DO_USUARIO'::uuid, null, true); -- overwrite por nome

create or replace function public.seed_user_message_templates(
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
    delete from public.user_message_templates
    where user_id = p_user_id
      and nome in ('Aniversário', 'Feliz Natal', 'Feliz Ano Novo', 'Feliz Páscoa');
  end if;

  insert into public.user_message_templates (
    user_id, company_id, nome, categoria, assunto, titulo, corpo, assinatura, ativo
  )
  select
    p_user_id,
    p_company_id,
    s.nome,
    s.categoria,
    s.assunto,
    s.titulo,
    s.corpo,
    s.assinatura,
    true
  from (
    values
      (
        'Aniversário',
        'Aniversário',
        'Feliz aniversário, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], feliz aniversário!',
        E'Que seu novo ano seja cheio de viagens, conquistas e momentos inesquecíveis.\nAproveite cada instante!',
        '[ASSINATURA]'
      ),
      (
        'Feliz Natal',
        'Natal',
        'Feliz Natal, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], Feliz Natal!',
        E'Desejamos um Natal repleto de paz, alegria e momentos especiais ao lado de quem você ama.',
        '[ASSINATURA]'
      ),
      (
        'Feliz Ano Novo',
        'Ano Novo',
        'Feliz Ano Novo, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], feliz Ano Novo!',
        E'Que este novo ano traga saúde, prosperidade e muitas viagens incríveis para você.',
        '[ASSINATURA]'
      ),
      (
        'Feliz Páscoa',
        'Páscoa',
        'Feliz Páscoa, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], feliz Páscoa!',
        E'Que a Páscoa renove a esperança e traga dias de paz, união e felicidade.',
        '[ASSINATURA]'
      )
  ) as s(nome, categoria, assunto, titulo, corpo, assinatura)
  where not exists (
    select 1
    from public.user_message_templates t
    where t.user_id = p_user_id
      and t.nome = s.nome
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.seed_user_message_templates(uuid, uuid, boolean) to authenticated;
