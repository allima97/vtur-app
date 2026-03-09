-- 2026-02-06: bucket público para imagens da documentação

insert into storage.buckets (id, name, public)
select 'system-docs', 'system-docs', true
where not exists (
  select 1 from storage.buckets where id = 'system-docs'
);
