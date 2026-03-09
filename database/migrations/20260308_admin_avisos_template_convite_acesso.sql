-- 2026-03-08: template padrao para convite de acesso com senha temporaria

do $$
declare
  has_sender_key boolean := false;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_avisos_templates'
      and column_name = 'sender_key'
  ) into has_sender_key;

  if not exists (
    select 1
    from public.admin_avisos_templates
    where lower(coalesce(nome, '')) = lower('Convite de Acesso')
  ) then
    if has_sender_key then
      insert into public.admin_avisos_templates (
        nome,
        assunto,
        mensagem,
        ativo,
        sender_key
      )
      values (
        'Convite de Acesso',
        'Convite de Acesso - {{empresa}}',
        'Olá {{nome}},

Seu acesso ao SGVTUR foi criado.

Dados de acesso:
- E-mail: {{email}}
- Senha temporária: {{senha}}

No primeiro acesso, você deverá alterar a senha obrigatoriamente.

Acesse: https://sgvtur.com/auth/login

Atenciosamente,
Equipe {{empresa}}',
        true,
        'avisos'
      );
    else
      insert into public.admin_avisos_templates (
        nome,
        assunto,
        mensagem,
        ativo
      )
      values (
        'Convite de Acesso',
        'Convite de Acesso - {{empresa}}',
        'Olá {{nome}},

Seu acesso ao SGVTUR foi criado.

Dados de acesso:
- E-mail: {{email}}
- Senha temporária: {{senha}}

No primeiro acesso, você deverá alterar a senha obrigatoriamente.

Acesse: https://sgvtur.com/auth/login

Atenciosamente,
Equipe {{empresa}}',
        true
      );
    end if;
  else
    if has_sender_key then
      update public.admin_avisos_templates
      set
        assunto = 'Convite de Acesso - {{empresa}}',
        mensagem = 'Olá {{nome}},

Seu acesso ao SGVTUR foi criado.

Dados de acesso:
- E-mail: {{email}}
- Senha temporária: {{senha}}

No primeiro acesso, você deverá alterar a senha obrigatoriamente.

Acesse: https://sgvtur.com/auth/login

Atenciosamente,
Equipe {{empresa}}',
        ativo = true,
        sender_key = coalesce(sender_key, 'avisos')
      where lower(coalesce(nome, '')) = lower('Convite de Acesso');
    else
      update public.admin_avisos_templates
      set
        assunto = 'Convite de Acesso - {{empresa}}',
        mensagem = 'Olá {{nome}},

Seu acesso ao SGVTUR foi criado.

Dados de acesso:
- E-mail: {{email}}
- Senha temporária: {{senha}}

No primeiro acesso, você deverá alterar a senha obrigatoriamente.

Acesse: https://sgvtur.com/auth/login

Atenciosamente,
Equipe {{empresa}}',
        ativo = true
      where lower(coalesce(nome, '')) = lower('Convite de Acesso');
    end if;
  end if;
end $$;
