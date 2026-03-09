-- 2026-02-11: corrige visibilidade de usuarios corporativos para master/gestor
-- Regra: usuario com cargo GESTOR/VENDEDOR e company_id definido deve ser corporativo.

update public.users u
set uso_individual = false
from public.user_types ut
where ut.id = u.user_type_id
  and u.company_id is not null
  and (
    upper(coalesce(ut.name, '')) like '%GESTOR%'
    or upper(coalesce(ut.name, '')) like '%VENDEDOR%'
  )
  and coalesce(u.uso_individual, true) = true;
