-- 2026-02-15: Permitir que remetentes apaguem recados privados não lidos pelo destinatário

create or replace function public.mural_recados_delete_private_unread(target_id uuid)
returns void
language plpgsql
security definer
set row_security = off
as $$
declare
  recado record;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select id, sender_id, receiver_id
  into recado
  from public.mural_recados
  where id = target_id;

  if not found then
    raise exception 'Recado não encontrado.';
  end if;

  if recado.receiver_id is null then
    raise exception 'Somente recados privados podem ser apagados por este fluxo.';
  end if;

  if recado.sender_id <> auth.uid() then
    raise exception 'Somente o remetente pode apagar este recado.';
  end if;

  if exists (
    select 1
    from public.mural_recados_leituras l
    where l.recado_id = target_id
      and l.user_id = recado.receiver_id
  ) then
    raise exception 'O destinatário já leu este recado.';
  end if;

  delete from public.mural_recados
  where id = target_id;
end;
$$;

grant execute on function public.mural_recados_delete_private_unread(uuid) to authenticated, anon, service_role;
