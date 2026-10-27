# Orçamento J&L

App de orçamento familiar (Jack & Loli), baseado na planilha de controle orçamentário.

- **App:** pasta `docs/` (publicado pelo GitHub Pages)
- **Banco de dados:** Supabase, com login. Os dados **não** ficam neste repositório.
- `supabase/setup.sql` cria as tabelas e as regras de segurança.

A chave em `docs/config.js` é a chave pública ("publishable") do Supabase: ela é feita para ficar no app. Quem protege os dados é o login e as regras de segurança do banco.
