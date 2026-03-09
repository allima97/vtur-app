-- Permite metas por vendedor e por equipe no mesmo periodo sem conflito.
-- Ajusta a chave unica para considerar o campo "scope".

begin;

update public.metas_vendedor
set scope = 'vendedor'
where scope is null;

alter table public.metas_vendedor
  alter column scope set default 'vendedor';

alter table public.metas_vendedor
  alter column scope set not null;

alter table public.metas_vendedor
  drop constraint if exists metas_vendedor_vendedor_id_periodo_key;

alter table public.metas_vendedor
  add constraint metas_vendedor_vendedor_id_periodo_scope_key
  unique (vendedor_id, periodo, scope);

commit;
