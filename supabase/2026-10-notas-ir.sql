-- Notas guardadas para o Imposto de Renda. Pode rodar mais de uma vez.
-- Supabase > SQL Editor > New query > colar tudo > Run

-- 1) cada lançamento pode ter um arquivo (foto/PDF da nota) e ser marcado como dedutível no IR
alter table public.lancamentos add column if not exists anexo text;        -- caminho do arquivo no Storage
alter table public.lancamentos add column if not exists anexo_nome text;   -- nome original do arquivo
alter table public.lancamentos add column if not exists ir boolean not null default false;
alter table public.lancamentos add column if not exists ir_pessoa text;    -- para quem é a despesa (Lílian, Jakson, ...)

-- 2) pasta PRIVADA "notas" no Storage (só quem tem login acessa; até 10 MB por arquivo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas', 'notas', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) regras de acesso: só usuários logados (vocês dois) leem, enviam e apagam as notas
drop policy if exists "familia_notas_ler"    on storage.objects;
drop policy if exists "familia_notas_enviar" on storage.objects;
drop policy if exists "familia_notas_mudar"  on storage.objects;
drop policy if exists "familia_notas_apagar" on storage.objects;
create policy "familia_notas_ler"    on storage.objects for select to authenticated using (bucket_id = 'notas');
create policy "familia_notas_enviar" on storage.objects for insert to authenticated with check (bucket_id = 'notas');
create policy "familia_notas_mudar"  on storage.objects for update to authenticated using (bucket_id = 'notas') with check (bucket_id = 'notas');
create policy "familia_notas_apagar" on storage.objects for delete to authenticated using (bucket_id = 'notas');

select 'ok' as resultado,
  (select public from storage.buckets where id = 'notas') as pasta_publica,
  (select count(*) from information_schema.columns where table_name = 'lancamentos' and column_name in ('anexo','anexo_nome','ir','ir_pessoa')) as colunas_novas;
