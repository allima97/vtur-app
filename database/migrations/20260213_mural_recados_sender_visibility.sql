-- 2026-02-13: Allow senders to hide their private recados from their own view.
-- Adds visibility flags and a helper to mark a recado as hidden for the sender only.

alter table public.mural_recados
  add column if not exists sender_deleted boolean not null default false,
  add column if not exists receiver_deleted boolean not null default false;

-- Ensure new flags default to false for existing rows.
update public.mural_recados
set sender_deleted = false, receiver_deleted = false
where sender_deleted is null or receiver_deleted is null;

create or replace function public.mural_recados_hide_for_sender(target_id uuid)
returns void
language plpgsql
security definer
set row_security = off
as $$
begin
  update public.mural_recados
  set sender_deleted = true
  where id = target_id
    and sender_id = auth.uid()
    and receiver_id is not null;
end;
$$;

grant execute on function public.mural_recados_hide_for_sender(uuid) to authenticated, anon, service_role;
