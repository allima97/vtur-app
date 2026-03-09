-- 2026-03-23: Expande biblioteca oficial de templates do módulo Avisos
-- Inclui ocasiões sazonais e templates de relacionamento recorrente.

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
      and nome in (
        'Aniversário',
        'Feliz Natal',
        'Feliz Ano Novo',
        'Feliz Páscoa',
        'Dia das Mães',
        'Dia dos Pais',
        'Dia dos Namorados',
        'Dia do Cliente',
        'Feriado Prolongado',
        'Feriado Municipal',
        'Boas-vindas',
        'Pós-viagem / Feedback',
        'Cliente VIP',
        'Cliente Inativo',
        'Aniversário da Primeira Compra',
        'Mensagem Surpresa',
        'Campanha Sazonal'
      );
  end if;

  insert into public.user_message_templates (
    user_id, company_id, nome, categoria, assunto, titulo, corpo, assinatura, theme_id, ativo
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
    th.id,
    true
  from (
    values
      (
        'Aniversário',
        'aniversario',
        'Feliz aniversário, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], feliz aniversário!',
        E'Que seu novo ano seja cheio de viagens, conquistas e momentos inesquecíveis.\nAproveite cada instante!',
        '[ASSINATURA]',
        'aniversario_base_clean'
      ),
      (
        'Feliz Natal',
        'natal',
        'Feliz Natal, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], Feliz Natal!',
        E'Que a magia do Natal te leve a lugares incríveis e dias de paz com quem você ama.',
        '[ASSINATURA]',
        'natal_base_clean'
      ),
      (
        'Feliz Ano Novo',
        'ano_novo',
        'Feliz Ano Novo, [PRIMEIRO_NOME]!',
        '365 novos dias, 365 novas chances de viajar.',
        E'Que o novo ano traga saúde, prosperidade e novos roteiros inesquecíveis para você.',
        '[ASSINATURA]',
        'ano_novo_base_clean'
      ),
      (
        'Feliz Páscoa',
        'pascoa',
        'Feliz Páscoa, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], feliz Páscoa!',
        E'Que a Páscoa renove a esperança e traga paz, união e momentos felizes em família.',
        '[ASSINATURA]',
        'pascoa_base_clean'
      ),
      (
        'Dia das Mães',
        'dia_das_maes',
        'Feliz Dia das Mães, [PRIMEIRO_NOME]!',
        'Mãe: nosso primeiro e maior destino de amor.',
        E'Hoje celebramos quem nos guiou pelos melhores caminhos da vida. Um Dia das Mães cheio de amor para você!',
        '[ASSINATURA]',
        'dia_das_maes_base_clean'
      ),
      (
        'Dia dos Pais',
        'dia_dos_pais',
        'Feliz Dia dos Pais, [PRIMEIRO_NOME]!',
        'Para o melhor companheiro de aventuras: Feliz Dia dos Pais!',
        E'Desejamos um dia especial, com sorrisos e momentos inesquecíveis ao lado de quem você ama.',
        '[ASSINATURA]',
        'dia_dos_pais_base_clean'
      ),
      (
        'Dia dos Namorados',
        'dia_dos_namorados',
        'Feliz Dia dos Namorados, [PRIMEIRO_NOME]!',
        'O melhor lugar do mundo é ao lado de quem a gente ama.',
        E'Celebrar o amor é colecionar memórias únicas. Que seu dia seja especial e cheio de carinho.',
        '[ASSINATURA]',
        'dia_das_maes_base_clean'
      ),
      (
        'Dia do Cliente',
        'dia_do_cliente',
        'Feliz Dia do Cliente, [PRIMEIRO_NOME]!',
        'Nosso destino favorito é sempre a sua satisfação.',
        E'Hoje o dia é seu! Obrigado por escolher nossa equipe para transformar sonhos em memórias reais.',
        '[ASSINATURA]',
        'cliente_vip_base_clean'
      ),
      (
        'Feriado Prolongado',
        'feriado_prolongado',
        'Bom feriadão, [PRIMEIRO_NOME]!',
        'O feriadão chegou! Para onde vamos dessa vez?',
        E'Aproveite os dias de descanso para recarregar as energias. Quando quiser planejar a próxima viagem, estamos por aqui.',
        '[ASSINATURA]',
        'ferias_base_clean'
      ),
      (
        'Feriado Municipal',
        'feriado_municipal',
        'Bom feriado municipal, [PRIMEIRO_NOME]!',
        'Hoje é dia de celebrar nossa cidade!',
        E'Desejamos um excelente feriado municipal para você e sua família, com descanso e boas lembranças.',
        '[ASSINATURA]',
        'aniversario_base_clean'
      ),
      (
        'Boas-vindas',
        'boas_vindas',
        'Boas-vindas, [PRIMEIRO_NOME]!',
        'Seja muito bem-vindo(a)!',
        E'[SAUDACAO], [PRIMEIRO_NOME]! É uma alegria ter você com a gente. Conte conosco para criar experiências incríveis.',
        '[ASSINATURA]',
        'boas_vindas_base_clean'
      ),
      (
        'Pós-viagem / Feedback',
        'pos_viagem',
        'Como foi sua viagem, [PRIMEIRO_NOME]?',
        'Queremos saber como foi sua viagem!',
        E'[SAUDACAO], [PRIMEIRO_NOME]! Esperamos que tudo tenha corrido bem. Quando puder, envie seu feedback para nossa equipe.',
        '[ASSINATURA]',
        'pos_viagem_base_clean'
      ),
      (
        'Cliente VIP',
        'cliente_vip',
        'Você é VIP para nós, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], você é cliente VIP para nossa equipe!',
        E'Obrigado pela confiança de sempre. Vamos continuar criando viagens memoráveis juntos.',
        '[ASSINATURA]',
        'cliente_vip_base_clean'
      ),
      (
        'Cliente Inativo',
        'cliente_inativo',
        'Sentimos sua falta, [PRIMEIRO_NOME]!',
        '[PRIMEIRO_NOME], sentimos sua falta por aqui.',
        E'[SAUDACAO], [PRIMEIRO_NOME]! Quando quiser planejar a próxima viagem, será um prazer te atender novamente.',
        '[ASSINATURA]',
        'cliente_inativo_base_clean'
      ),
      (
        'Aniversário da Primeira Compra',
        'aniversario_primeira_compra',
        'Um ano de parceria, [PRIMEIRO_NOME]!',
        'Hoje celebramos sua primeira viagem com a gente!',
        E'Obrigado por fazer parte da nossa história. Que venham muitos novos destinos pela frente.',
        '[ASSINATURA]',
        'aniversario_primeira_compra_base_clean'
      ),
      (
        'Mensagem Surpresa',
        'mensagem_surpresa',
        'Uma mensagem especial para você, [PRIMEIRO_NOME]',
        'Passando para desejar um dia incrível!',
        E'Hoje não é nenhuma data especial, mas queríamos agradecer sua confiança e desejar uma semana maravilhosa.',
        '[ASSINATURA]',
        'aniversario_base_clean'
      ),
      (
        'Campanha Sazonal',
        'ferias',
        'Tem novidade para você, [PRIMEIRO_NOME]!',
        'Nova campanha no ar: bora viajar?',
        E'Preparamos ofertas sazonais com condições especiais para o seu próximo destino. Fale com a gente para aproveitar.',
        '[ASSINATURA]',
        'ferias_base_clean'
      )
  ) as s(nome, categoria, assunto, titulo, corpo, assinatura, theme_nome)
  left join public.user_message_template_themes th
    on th.user_id = p_user_id
    and th.nome = s.theme_nome
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
