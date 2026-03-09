-- Busca de cidades acento-insensível (ex: Maceio -> Maceió)

-- Evita depender da extensão unaccent (que pode estar em outro schema/assinatura)
-- Implementa normalização simples por translate(), suficiente para nomes PT-BR.
create or replace function public.strip_accents(value text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(value, ''),
    'áàâãäåāăąÁÀÂÃÄÅĀĂĄéèêëēĕėęěÉÈÊËĒĔĖĘĚíìîïĩīĭįİÍÌÎÏĨĪĬĮóòôõöōŏőÓÒÔÕÖŌŎŐúùûüũūŭůűųÚÙÛÜŨŪŬŮŰŲçÇñÑýÿÝ',
    'aaaaaaaaaAAAAAAAAAeeeeeeeeeEEEEEEEEEiiiiiiiiiIIIIIIIIIoooooooooOOOOOOOOOuuuuuuuuuUUUUUUUUUccnnyyY'
  );
$$;

-- Necessário porque o Postgres não permite alterar o tipo de retorno
-- (OUT params/rowtype) de uma função existente via CREATE OR REPLACE.
drop function if exists public.buscar_cidades(text, integer);

create or replace function public.buscar_cidades(q text, limite integer default 10)
returns table (
  id uuid,
  nome text,
  subdivisao_nome text,
  pais_nome text
)
language sql
stable
as $$
  select
    c.id,
    c.nome,
    s.nome as subdivisao_nome,
    p.nome as pais_nome
  from public.cidades c
  left join public.subdivisoes s on s.id = c.subdivisao_id
  left join public.paises p on p.id = s.pais_id
  where
    q is not null
    and length(trim(q)) >= 2
    and public.strip_accents(lower(c.nome)) like '%' || public.strip_accents(lower(trim(q))) || '%'
  order by c.nome
  limit greatest(1, least(coalesce(limite, 10), 200));
$$;

grant execute on function public.buscar_cidades(text, integer) to anon, authenticated;
