-- Importação de fatura de cartão (PDF). Pode rodar mais de uma vez.
-- Supabase > SQL Editor > New query > colar tudo > Run

-- 1) cada compra importada guarda de qual fatura veio (para agrupar na lista e reimportar sem duplicar)
alter table public.lancamentos add column if not exists fatura text;
create index if not exists lancamentos_fatura_idx on public.lancamentos (fatura);

-- 2) estornos da fatura entram com valor negativo (antes só aceitava valor > 0)
alter table public.lancamentos drop constraint if exists lancamentos_valor_check;
alter table public.lancamentos add constraint lancamentos_valor_check check (valor <> 0);

-- 3) categorias que vocês corrigiram: na próxima fatura o mesmo estabelecimento já vem certo
create table if not exists public.regras (
  chave       text primary key,   -- nome do estabelecimento normalizado (ex.: "REDE HAVANA")
  grupo       text not null,
  item        text not null,
  updated_at  timestamptz not null default now()
);
alter table public.regras enable row level security;
drop policy if exists "familia_regras" on public.regras;
create policy "familia_regras" on public.regras for all to authenticated using (true) with check (true);
revoke all on public.regras from anon;
grant select, insert, update, delete on public.regras to authenticated;

select 'ok' as resultado,
  (select count(*) from information_schema.columns where table_name = 'lancamentos' and column_name = 'fatura') as coluna_fatura,
  (select count(*) from public.regras) as regras;
