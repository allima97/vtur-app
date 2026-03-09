-- 2026-02-19: normaliza chave do modulo para evitar mismatch em checks de permissao

create or replace function public.normalize_modulo_key(modulo text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(modulo, ''));
$$;

-- Backfill: normaliza valores existentes
update public.modulo_acesso
set modulo = public.normalize_modulo_key(modulo)
where modulo is not null and modulo <> public.normalize_modulo_key(modulo);

-- Trigger para manter normalizado em inserts/updates
create or replace function public.modulo_acesso_normalize_modulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.modulo := public.normalize_modulo_key(new.modulo);
  return new;
end;
$$;

drop trigger if exists trg_modulo_acesso_normalize_modulo on public.modulo_acesso;
create trigger trg_modulo_acesso_normalize_modulo
before insert or update on public.modulo_acesso
for each row execute function public.modulo_acesso_normalize_modulo();
