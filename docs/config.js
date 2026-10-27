// Configuração do Supabase.
// Estes dois valores são públicos por natureza: quem protege os dados é o login
// e as regras de segurança (RLS) do banco. NUNCA coloque aqui a chave "service_role"/"secret".
window.ORCAMENTO_CONFIG = {
  supabaseUrl: "https://jfxmnmnblbhrpicxyqly.supabase.co",      // ex.: https://xxxxxxxx.supabase.co
  supabaseAnonKey: "sb_publishable_pwbGf2IgcymBnakFy-K5tA_6RxL7OAo"   // chave "anon public" / "publishable"
};
