-- 2026-02-04: permissões padrão para novos módulos

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'parametros_formas_pagamento', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'parametros'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'parametros_formas_pagamento'
  );

insert into public.modulo_acesso (usuario_id, modulo, permissao, ativo)
select ma.usuario_id, 'vendas_importar', ma.permissao, ma.ativo
from public.modulo_acesso ma
where ma.modulo = 'vendas_consulta'
  and not exists (
    select 1 from public.modulo_acesso m2
    where m2.usuario_id = ma.usuario_id
      and m2.modulo = 'vendas_importar'
  );
