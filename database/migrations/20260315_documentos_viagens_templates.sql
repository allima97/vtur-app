-- 2026-03-15: Documentos Viagens -> modelos editáveis (texto extraído + campos) + update por empresa

alter table public.documentos_viagens
  add column if not exists title text;

alter table public.documentos_viagens
  add column if not exists template_text text;

alter table public.documentos_viagens
  add column if not exists template_fields jsonb;

-- Backfill: título padrão vem do nome exibido
update public.documentos_viagens
set title = coalesce(title, display_name, file_name)
where title is null;

-- Permitir atualização do modelo por qualquer usuário da empresa (controlado por permissões na API)
-- Mantém delete restrito (uploader/admin) como já estava.
drop policy if exists "documentos_viagens_update" on public.documentos_viagens;
create policy "documentos_viagens_update" on public.documentos_viagens
  for update using (
    is_admin(auth.uid())
    or (
      auth.uid() is not null
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
  )
  with check (
    is_admin(auth.uid())
    or (
      auth.uid() is not null
      and updated_by = auth.uid()
      and (
        company_id = public.current_company_id()
        or (is_master(auth.uid()) and public.master_can_access_company(auth.uid(), company_id))
      )
    )
  );
