-- =====================================================================
-- Orçamento Jack & Loli — estrutura do banco (rodar UMA vez no Supabase)
-- Supabase > SQL Editor > New query > colar tudo > Run (pode rodar de novo sem duplicar)
-- =====================================================================

-- Lançamentos (receitas, despesas, boleto pessoal e benefícios)
create table if not exists public.lancamentos (
  id          bigint generated always as identity primary key,
  data        date not null,
  tipo        text not null check (tipo in ('receita','despesa','boleto','beneficio_credito','beneficio_gasto')),
  grupo       text not null,
  item        text not null,
  valor       numeric(12,2) not null check (valor > 0),
  meio        text,
  usuario     text,
  obs         text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists lancamentos_data_idx on public.lancamentos (data);

-- Valor-alvo de cada meta do Boleto Pessoal (Metinhazinha ... Metazona)
create table if not exists public.metas (
  item        text primary key,
  alvo        numeric(12,2),
  updated_at  timestamptz not null default now()
);

-- Segurança: só quem fez login (vocês dois) lê e grava. Ninguém de fora.
alter table public.lancamentos enable row level security;
alter table public.metas       enable row level security;

drop policy if exists "familia_lancamentos" on public.lancamentos;
create policy "familia_lancamentos" on public.lancamentos
  for all to authenticated using (true) with check (true);

drop policy if exists "familia_metas" on public.metas;
create policy "familia_metas" on public.metas
  for all to authenticated using (true) with check (true);

revoke all on public.lancamentos, public.metas from anon;
grant select, insert, update, delete on public.lancamentos, public.metas to authenticated;

-- Dados importados da planilha (agosto a outubro/2026)
insert into public.lancamentos (data, tipo, grupo, item, valor, meio, usuario, obs)
select * from (values
  ('2026-08-01'::date, 'receita', 'Receitas Fixas', 'Renda Lílian (líquido)', 11000.00, 'Transferência Bancária', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Habitação', 'Conta de água', 261.27, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Habitação', 'Conta de energia', 131.71, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Habitação', 'Celular + TV + internet', 257.85, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Habitação', 'Semear', 136.50, 'Transferência Bancária', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Habitação', 'Faxineira', 1400.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Dívidas', 'Financiamento', 1099.47, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Dívidas', 'Cartão de crédito Lílian', 6845.56, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Dívidas', 'Cartão de crédito Jakson', 2252.17, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Transporte', 'Seguro do carro', 222.48, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Despesas Pessoais', 'Higiene pessoal', 270.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Outros', 'Doações', 100.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Outros', 'Dízimos', 500.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Outros', 'Manutenção e reparos', 235.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'despesa', 'Outros', 'Médicos esporádicos', 400.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'receita', 'Receitas Fixas', 'Renda Lílian (líquido)', 11000.00, 'Transferência Bancária', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Habitação', 'Celular + TV + internet', 231.67, 'Dinheiro', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Habitação', 'Semear', 136.50, 'Transferência Bancária', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Habitação', 'Faxineira', 1400.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Dívidas', 'Financiamento', 1099.47, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Dívidas', 'Cartão de crédito Jakson', 2252.17, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Transporte', 'Seguro do carro', 222.48, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Outros', 'Doações', 100.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'despesa', 'Outros', 'Dízimos', 500.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'receita', 'Receitas Fixas', 'Renda Lílian (líquido)', 11000.00, 'Transferência Bancária', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Habitação', 'Celular + TV + internet', 231.39, 'Dinheiro', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Habitação', 'Semear', 136.50, 'Transferência Bancária', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Habitação', 'Faxineira', 1400.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Dívidas', 'Financiamento', 1099.47, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Dívidas', 'Cartão de crédito Jakson', 2175.22, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Transporte', 'Seguro do carro', 222.48, 'Débito Automático', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Outros', 'Doações', 100.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'despesa', 'Outros', 'Dízimos', 500.00, 'Pix', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'beneficio_credito', 'Créditos', 'Vale Refeição', 700.00, 'Ticket Restaurante', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'beneficio_credito', 'Créditos', 'Vale Alimentação', 3000.00, 'Ticket Restaurante', 'Planilha', 'Importado da planilha'),
  ('2026-08-01', 'beneficio_credito', 'Créditos', 'Vale Combustível', 1012.00, 'Ticket Restaurante', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'beneficio_credito', 'Créditos', 'Vale Refeição', 700.00, 'Ticket Restaurante', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'beneficio_credito', 'Créditos', 'Vale Alimentação', 3000.00, 'Ticket Restaurante', 'Planilha', 'Importado da planilha'),
  ('2026-09-01', 'beneficio_credito', 'Créditos', 'Vale Combustível', 1012.00, 'Ticket Restaurante', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'beneficio_credito', 'Créditos', 'Vale Refeição', 700.00, 'Sodexo', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'beneficio_credito', 'Créditos', 'Vale Alimentação', 3000.00, 'Sodexo', 'Planilha', 'Importado da planilha'),
  ('2026-10-01', 'beneficio_credito', 'Créditos', 'Vale Combustível', 1012.00, 'Sodexo', 'Planilha', 'Importado da planilha')
) as v(data, tipo, grupo, item, valor, meio, usuario, obs)
where not exists (select 1 from public.lancamentos where obs = 'Importado da planilha');

insert into public.metas (item) values
  ('METINHAZINHA'), ('METINHA'), ('META'), ('METONA'), ('METAZONA')
on conflict do nothing;
