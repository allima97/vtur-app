-- SGVTUR / Templates
-- Biblioteca oficial com 30 templates de relacionamento (compatível com módulo Avisos).
-- Usa tabela já existente: public.user_message_templates

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
        'Aniversário da Primeira Compra',
        'Aniversário da Primeira Viagem',
        'Feliz Natal',
        'Feliz Ano Novo',
        'Feliz Páscoa',
        'Dia das Mulheres',
        'Dia das Mães',
        'Dia dos Pais',
        'Dia dos Namorados',
        'Dia do Cliente',
        'Cliente VIP',
        'Cliente Premium',
        'Cliente Inativo',
        'Boas-vindas',
        'Mensagem Surpresa',
        'Pós-viagem / Feedback',
        'Sugestão de Destino',
        'Promoção Exclusiva',
        'Upgrade VIP',
        'Indicação de Cliente',
        'Lembrete de Passaporte',
        'Lembrete de Visto / Documentação',
        'Feriado Prolongado',
        'Campanha Sazonal',
        'Retorno de Viagem',
        'Pré-embarque',
        'Contagem Regressiva',
        'Oferta de Recompra',
        'Data Especial Personalizada'
      );
  end if;

  insert into public.user_message_templates (
    user_id,
    company_id,
    nome,
    categoria,
    assunto,
    titulo,
    corpo,
    assinatura,
    theme_id,
    layout_key,
    ativo
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
    'master-card-v1',
    true
  from (
    values
      (
        'Aniversário',
        'aniversario',
        'Feliz aniversário, {{cliente_nome}}!',
        '{{cliente_nome}}, feliz aniversário!',
        E'Que seu dia seja incrível!\nDesejo muita saúde, felicidade e momentos inesquecíveis.\nQue sua próxima viagem seja ainda mais especial!',
        '{{consultor_nome}}',
        'aniversario_base_clean'
      ),
      (
        'Aniversário da Primeira Compra',
        'aniversario_primeira_compra',
        'Celebrando sua primeira compra conosco, {{cliente_nome}}!',
        'Hoje celebramos sua primeira compra conosco.',
        E'Obrigado por confiar em nosso trabalho.\nQue venham muitas outras viagens incríveis!',
        '{{consultor_nome}}',
        'aniversario_primeira_compra_base_clean'
      ),
      (
        'Aniversário da Primeira Viagem',
        'aniversario_primeira_viagem',
        'Um marco especial da sua viagem, {{cliente_nome}}!',
        'Hoje lembramos com carinho da sua primeira viagem.',
        E'Foi um prazer fazer parte desse momento.\nQue venham muitas novas experiências inesquecíveis!',
        '{{consultor_nome}}',
        'pos_viagem_base_clean'
      ),
      (
        'Feliz Natal',
        'natal',
        'Feliz Natal, {{cliente_nome}}!',
        '{{cliente_nome}}, Feliz Natal!',
        E'Que o Natal traga paz, alegria e momentos especiais ao lado de quem você ama.\nDesejo também novas viagens e memórias inesquecíveis no próximo ano.',
        '{{consultor_nome}}',
        'natal_base_clean'
      ),
      (
        'Feliz Ano Novo',
        'ano_novo',
        'Feliz Ano Novo, {{cliente_nome}}!',
        '{{cliente_nome}}, Feliz Ano Novo!',
        E'Que o novo ano seja repleto de conquistas, felicidade e viagens inesquecíveis.\nObrigado pela confiança e parceria.',
        '{{consultor_nome}}',
        'ano_novo_base_clean'
      ),
      (
        'Feliz Páscoa',
        'pascoa',
        'Feliz Páscoa, {{cliente_nome}}!',
        '{{cliente_nome}}, Feliz Páscoa!',
        E'Que esta Páscoa seja marcada por renovação, paz e bons momentos.\nQue nunca faltem motivos para celebrar e viajar.',
        '{{consultor_nome}}',
        'pascoa_base_clean'
      ),
      (
        'Dia das Mulheres',
        'dia_das_mulheres',
        'Feliz Dia das Mulheres, {{cliente_nome}}!',
        '{{cliente_nome}}, Feliz Dia das Mulheres!',
        E'Hoje é dia de celebrar sua força, sua inspiração e sua essência.\nDesejo um dia especial, leve e cheio de boas emoções.',
        '{{consultor_nome}}',
        'dia_das_maes_base_clean'
      ),
      (
        'Dia das Mães',
        'dia_das_maes',
        'Feliz Dia das Mães, {{cliente_nome}}!',
        '{{cliente_nome}}, Feliz Dia das Mães!',
        E'Desejo um dia repleto de carinho, amor e momentos especiais.\nQue esta data seja tão bonita quanto as memórias que você constrói com quem ama.',
        '{{consultor_nome}}',
        'dia_das_maes_base_clean'
      ),
      (
        'Dia dos Pais',
        'dia_dos_pais',
        'Feliz Dia dos Pais, {{cliente_nome}}!',
        '{{cliente_nome}}, Feliz Dia dos Pais!',
        E'Hoje celebramos aqueles que inspiram, cuidam e deixam marcas inesquecíveis.\nDesejo um dia especial e cheio de bons momentos.',
        '{{consultor_nome}}',
        'dia_dos_pais_base_clean'
      ),
      (
        'Dia dos Namorados',
        'dia_dos_namorados',
        'Feliz Dia dos Namorados, {{cliente_nome}}!',
        '{{cliente_nome}}, Feliz Dia dos Namorados!',
        E'Viajar é ainda melhor quando compartilhamos momentos com quem amamos.\nDesejo uma data especial, cheia de amor e novas memórias.',
        '{{consultor_nome}}',
        'dia_das_maes_base_clean'
      ),
      (
        'Dia do Cliente',
        'dia_do_cliente',
        'Feliz Dia do Cliente, {{cliente_nome}}!',
        '{{cliente_nome}}, hoje o dia é seu!',
        E'Hoje queremos agradecer pela sua confiança e parceria.\nÉ um prazer fazer parte das suas experiências e viagens.',
        '{{consultor_nome}}',
        'cliente_vip_base_clean'
      ),
      (
        'Cliente VIP',
        'cliente_vip',
        'Você é cliente VIP, {{cliente_nome}}!',
        '{{cliente_nome}}, você é cliente VIP para nós.',
        E'Você é um cliente muito especial para nós.\nObrigado por sua confiança e por fazer parte da nossa trajetória.',
        '{{consultor_nome}}',
        'cliente_vip_base_clean'
      ),
      (
        'Cliente Premium',
        'cliente_premium',
        'Atendimento Premium para você, {{cliente_nome}}!',
        'Atendimento Premium para você.',
        E'Você faz parte de um grupo de clientes especiais que valorizamos muito.\nConte sempre conosco para experiências ainda mais exclusivas.',
        '{{consultor_nome}}',
        'cliente_vip_base_clean'
      ),
      (
        'Cliente Inativo',
        'cliente_inativo',
        'Sentimos sua falta, {{cliente_nome}}!',
        '{{cliente_nome}}, sentimos sua falta.',
        E'Faz um tempo que não planejamos uma viagem juntos.\nQuando quiser pensar no próximo destino, estarei por aqui para ajudar.',
        '{{consultor_nome}}',
        'cliente_inativo_base_clean'
      ),
      (
        'Boas-vindas',
        'boas_vindas',
        'Seja bem-vindo, {{cliente_nome}}!',
        'Seja bem-vindo!',
        E'É um prazer ter você conosco.\nEstamos prontos para ajudar a transformar seus planos em viagens inesquecíveis.',
        '{{consultor_nome}}',
        'boas_vindas_base_clean'
      ),
      (
        'Mensagem Surpresa',
        'mensagem_surpresa',
        'Uma mensagem especial para você, {{cliente_nome}}!',
        'Uma mensagem especial para você.',
        E'Passando para desejar uma ótima semana e lembrar que estou à disposição para sua próxima viagem.',
        '{{consultor_nome}}',
        'aniversario_base_clean'
      ),
      (
        'Pós-viagem / Feedback',
        'pos_viagem',
        'Como foi sua viagem, {{cliente_nome}}?',
        'Como foi sua viagem?',
        E'Espero que sua viagem tenha sido incrível.\nSe quiser, será um prazer ouvir sua experiência e ajudar no próximo planejamento.',
        '{{consultor_nome}}',
        'pos_viagem_base_clean'
      ),
      (
        'Sugestão de Destino',
        'sugestao_destino',
        'Tenho uma sugestão para você, {{cliente_nome}}!',
        'Tenho uma sugestão para você.',
        E'Separei uma sugestão de destino que pode combinar com seu perfil.\nSe quiser, posso te mostrar opções e valores.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Promoção Exclusiva',
        'promocao_exclusiva',
        'Oferta especial para você, {{cliente_nome}}!',
        'Oferta especial para você.',
        E'Separei uma condição especial que pode ser perfeita para sua próxima viagem.\nSe quiser, te envio os detalhes.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Upgrade VIP',
        'upgrade_vip',
        'Uma experiência ainda mais especial, {{cliente_nome}}!',
        'Uma experiência ainda mais especial.',
        E'Quero te apresentar uma possibilidade de upgrade para tornar sua próxima viagem ainda mais completa.\nSe fizer sentido para você, te explico tudo.',
        '{{consultor_nome}}',
        'cliente_vip_base_clean'
      ),
      (
        'Indicação de Cliente',
        'indicacao_cliente',
        'Indique alguém especial, {{cliente_nome}}!',
        'Indique alguém especial.',
        E'Se você conhece alguém que também ama viajar, será um prazer atender essa indicação com o mesmo cuidado.\nObrigado pela confiança.',
        '{{consultor_nome}}',
        'cliente_vip_base_clean'
      ),
      (
        'Lembrete de Passaporte',
        'lembrete_passaporte',
        'Lembrete importante, {{cliente_nome}}',
        'Lembrete importante',
        E'Passando para te lembrar de verificar a validade do seu passaporte para futuras viagens.\nSe precisar de apoio no planejamento, conte comigo.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Lembrete de Visto / Documentação',
        'lembrete_documentacao',
        'Atenção à documentação, {{cliente_nome}}',
        'Atenção à documentação',
        E'Antes da próxima viagem, vale conferir toda a documentação necessária para embarcar com tranquilidade.\nSe quiser, posso te orientar.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Feriado Prolongado',
        'feriado_prolongado',
        'Feriado chegando, {{cliente_nome}}!',
        'Feriado chegando',
        E'Um feriado prolongado pode ser a oportunidade ideal para uma viagem rápida e especial.\nSe quiser sugestões, estou à disposição.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Campanha Sazonal',
        'campanha_sazonal',
        'Hora de planejar sua próxima viagem, {{cliente_nome}}!',
        'Hora de planejar sua próxima viagem.',
        E'Temos uma campanha especial no ar e pode haver uma oportunidade perfeita para o seu próximo destino.\nSe quiser, te mostro as melhores opções.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Retorno de Viagem',
        'retorno_viagem',
        'Bem-vindo de volta, {{cliente_nome}}!',
        'Bem-vindo de volta!',
        E'Espero que seu retorno tenha sido tranquilo e que sua viagem tenha deixado ótimas lembranças.\nFoi um prazer participar desse momento.',
        '{{consultor_nome}}',
        'pos_viagem_base_clean'
      ),
      (
        'Pré-embarque',
        'pre_embarque',
        'Sua viagem está chegando, {{cliente_nome}}!',
        'Sua viagem está chegando.',
        E'Quero desejar um excelente embarque e uma experiência maravilhosa.\nSe precisar de qualquer apoio final, conte comigo.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Contagem Regressiva',
        'contagem_regressiva',
        'Falta pouco, {{cliente_nome}}!',
        'Falta pouco!',
        E'Está chegando o momento da sua viagem.\nQue a expectativa já esteja trazendo aquela sensação boa de viver algo especial.',
        '{{consultor_nome}}',
        'ferias_base_clean'
      ),
      (
        'Oferta de Recompra',
        'oferta_recompra',
        'Vamos planejar a próxima, {{cliente_nome}}?',
        'Vamos planejar a próxima?',
        E'Depois de uma boa viagem, sempre nasce a vontade da próxima.\nQuando quiser, posso te ajudar a planejar um novo roteiro.',
        '{{consultor_nome}}',
        'cliente_inativo_base_clean'
      ),
      (
        'Data Especial Personalizada',
        'data_especial',
        'Uma data especial para você, {{cliente_nome}}!',
        'Uma data especial',
        E'Hoje é uma data especial e não poderia deixar de te enviar uma mensagem com carinho.\nDesejo momentos felizes e muitas experiências incríveis.',
        '{{consultor_nome}}',
        'aniversario_base_clean'
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
