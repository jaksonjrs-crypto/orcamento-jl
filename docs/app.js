/* Orçamento Jack & Loli — app sem dependências que conversa direto com o Supabase. */
(function () {
  "use strict";

  // ===================== CATEGORIAS (iguais à planilha) =====================
  const TIPOS = {
    despesa: { label: "Despesa", chip: "t-neg", grupos: {
      "Habitação": ["Aluguel", "Condomínio", "IPTU", "Conta de água", "Conta de energia", "Seguro residencial", "Conta de gás", "Celular + TV + internet", "Celular", "Streaming (Prime, Netflix, Disney)", "Supermercado", "Feira", "Semear", "Faxineira"],
      "Dívidas": ["Financiamento", "Cheque especial", "Cartão de crédito Lílian", "Cartão de crédito Jakson", "Tributos atrasados", "Outros"],
      "Saúde": ["Plano de saúde", "Médicos e terapeutas", "Dentista", "Exames e laboratório", "Farmácia", "Outros"],
      "Transporte": ["Licenciamento + multas", "IPVA + seguro obrigatório", "Seguro do carro", "Combustível", "Estacionamentos", "Lavagens", "Mecânico / revisão", "Multas", "Pedágios + tag", "Apps de carro"],
      "Despesas Pessoais": ["Pós-graduação", "Material escolar", "Higiene pessoal", "Cosméticos", "Cabeleireiro", "Vestuário", "Academia", "Seguro de vida", "Outros"],
      "Educação": ["Escola / faculdade", "Cursos extracurriculares", "Livros", "Outros"],
      "Lazer": ["Restaurantes", "Cafés, bares e boates", "Livraria, jornais e revistas", "Spotify, música e outros", "Passeios", "Outros"],
      "Outros": ["Tarifas bancárias", "Ajuda aos pais", "Doações", "Dízimos", "Extras diários", "Manutenção e reparos", "Médicos esporádicos", "Remédios", "Suplementos academia", "Presente de Natal", "Presentes do mês", "Utilidades domésticas e decoração", "Manutenção do veículo", "Outros"]
    }},
    receita: { label: "Receita", chip: "", grupos: {
      "Receitas Fixas": ["Renda Lílian (líquido)", "Renda Jakson (líquido)", "Outros"],
      "Receitas Variáveis": ["13º salário líquido", "Férias", "Bônus e extras"]
    }},
    boleto: { label: "Boleto Pessoal", chip: "t-boleto", grupos: {
      "Boleto Pessoal": ["METINHAZINHA", "METINHA", "META", "METONA", "METAZONA"]
    }},
    beneficio_credito: { label: "Benefício recebido", chip: "t-benef", grupos: {
      "Créditos": ["Ticket Alimentação", "Ticket Refeição", "Ticket Combustível"]
    }},
    beneficio_gasto: { label: "Gasto c/ benefício", chip: "t-benef", grupos: {
      "Ticket Alimentação": ["Supermercado", "Açougue", "Padaria", "Hortifruti", "Farmácia", "Suplementos", "Outros"],
      "Ticket Refeição": ["Restaurante", "Lanchonete", "Pizzaria", "Padaria", "Supermercado", "iFood", "Outros"],
      "Ticket Combustível": ["Combustível", "Outros"]
    }}
  };
  const ORDEM_TIPOS = ["despesa", "receita", "boleto", "beneficio_credito", "beneficio_gasto"];
  const METAS_DESC = {
    METINHAZINHA: "3 meses · um jantar, um sapato, uma blusinha",
    METINHA: "6 meses · reserva de emergência",
    META: "1 ano · viagem internacional",
    METONA: "10 anos · casa própria",
    METAZONA: "30 anos · aposentadoria"
  };
  const FAIXAS = [
    { key: "essenciais", nome: "Despesas essenciais", pct: 0.55, grupos: ["Habitação", "Dívidas", "Saúde", "Transporte", "Despesas Pessoais"] },
    { key: "educacao", nome: "Educação", pct: 0.05, grupos: ["Educação"] },
    { key: "livres", nome: "Gastos livres", pct: 0.10, grupos: ["Lazer", "Outros"] },
    { key: "boleto", nome: "Boleto Pessoal", pct: 0.30, boleto: true }
  ];
  const GRUPOS_DESPESA = Object.keys(TIPOS.despesa.grupos);
  const MEIOS = ["Pix", "Débito Automático", "Transferência Bancária", "Cartão de Crédito", "Cartão de Débito", "Dinheiro", "Boleto", "Cartão Ticket", "Ticket Restaurante", "Sodexo", "Outro"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const MESES_C = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // ===================== UTIL =====================
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = v => brl.format(v || 0);
  const pct = v => (isFinite(v) ? (v * 100).toFixed(1).replace(".", ",") + "%" : "—");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const mesKey = (y, m) => `${y}-${pad(m)}`;
  const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  function parseValor(s) {
    if (typeof s === "number") return s;
    s = String(s || "").trim().replace(/[R$\s]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  const fmtValorInput = v => (v == null || v === "" ? "" : Number(v).toFixed(2).replace(".", ","));
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }
  const ICON = {
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>'
  };

  // ===================== SUPABASE (REST direto) =====================
  const CFG = window.ORCAMENTO_CONFIG || {};
  const BASE = String(CFG.supabaseUrl || "").replace(/\/+$/, "");
  const KEY = String(CFG.supabaseAnonKey || "");
  const SKEY = "orcamento.sessao";
  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { sessao = null; }

  function salvarSessao(s) {
    sessao = s;
    try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch (e) { /* sem storage */ }
  }
  function sessaoDe(r) {
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600), user: r.user };
  }
  async function authReq(path, body, token) {
    const res = await fetch(BASE + "/auth/v1/" + path, {
      method: path === "user" ? "PUT" : "POST",
      headers: Object.assign({ apikey: KEY, "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
      body: JSON.stringify(body || {})
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(j.error_description || j.msg || j.message || ("Erro " + res.status)); e.status = res.status; e.code = j.error_code || j.error; throw e; }
    return j;
  }
  async function login(email, senha) { salvarSessao(sessaoDe(await authReq("token?grant_type=password", { email, password: senha }))); }
  async function renovar() {
    if (!sessao || !sessao.refresh_token) throw new Error("sem sessão");
    salvarSessao(sessaoDe(await authReq("token?grant_type=refresh_token", { refresh_token: sessao.refresh_token })));
  }
  async function token() {
    if (!sessao) throw new Error("sem sessão");
    if (sessao.expires_at - 60 < Date.now() / 1000) await renovar();
    return sessao.access_token;
  }
  async function sair() {
    try { if (sessao) await fetch(BASE + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + sessao.access_token } }); } catch (e) { /* ok */ }
    salvarSessao(null); dados = null; render();
  }
  async function api(path, { method = "GET", body, headers = {} } = {}, tentou = false) {
    let tk;
    try { tk = await token(); } catch (e) { salvarSessao(null); render(); throw new Error("Sessão expirada. Entre de novo."); }
    const res = await fetch(BASE + "/rest/v1/" + path, {
      method,
      headers: Object.assign({ apikey: KEY, Authorization: "Bearer " + tk, "Content-Type": "application/json" }, headers),
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 && !tentou) { try { await renovar(); return api(path, { method, body, headers }, true); } catch (e) { salvarSessao(null); render(); throw new Error("Sessão expirada. Entre de novo."); } }
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || ("Erro " + res.status)); }
    if (res.status === 204) return null;
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }
  async function carregarTudo() {
    const todos = []; const passo = 1000;
    for (let i = 0; ; i += passo) {
      const page = await api("lancamentos?select=*&order=data.desc,id.desc", { headers: { Range: `${i}-${i + passo - 1}`, "Range-Unit": "items" } });
      todos.push(...page);
      if (page.length < passo) break;
    }
    let metas = [];
    try { metas = await api("metas?select=*"); } catch (e) { metas = []; }
    const regras = {};
    try { (await api("regras?select=*")).forEach(r => { regras[r.chave] = { grupo: r.grupo, item: r.item }; }); } catch (e) { /* tabela ainda não criada */ }
    return { lanc: todos.map(x => Object.assign(x, { valor: Number(x.valor) })), metas, regras };
  }

  // ===================== ESTADO =====================
  const agora = new Date();
  const st = { tab: "mes", ano: agora.getFullYear(), mes: agora.getMonth() + 1, filtro: "todos", editando: null, form: null, abertos: {} };
  let dados = null; let carregando = false; let erroCarga = "";
  const nomeUsuario = () => (sessao && sessao.user && sessao.user.user_metadata && sessao.user.user_metadata.nome) || "";

  async function recarregar(silencioso) {
    if (carregando) return;
    carregando = true; erroCarga = "";
    if (!silencioso) render();
    try { dados = await carregarTudo(); }
    catch (e) { erroCarga = e.message; }
    carregando = false; render();
  }

  // ===================== CÁLCULOS =====================
  const doMes = (y, m) => (dados ? dados.lanc.filter(l => l.data.slice(0, 7) === mesKey(y, m)) : []);
  function resumo(lista) {
    const r = { renda: 0, boleto: 0, grupos: {}, itens: {}, bCred: {}, bGasto: {}, receitas: {} };
    for (const l of lista) {
      if (l.tipo === "receita") { r.renda += l.valor; r.receitas[l.item] = (r.receitas[l.item] || 0) + l.valor; }
      else if (l.tipo === "boleto") { r.boleto += l.valor; r.itens["Boleto Pessoal|" + l.item] = (r.itens["Boleto Pessoal|" + l.item] || 0) + l.valor; }
      else if (l.tipo === "despesa") {
        r.grupos[l.grupo] = (r.grupos[l.grupo] || 0) + l.valor;
        const k = l.grupo + "|" + l.item; r.itens[k] = (r.itens[k] || 0) + l.valor;
      }
      else if (l.tipo === "beneficio_credito") r.bCred[l.item] = (r.bCred[l.item] || 0) + l.valor;
      else if (l.tipo === "beneficio_gasto") { r.bGasto[l.grupo] = r.bGasto[l.grupo] || {}; r.bGasto[l.grupo][l.item] = (r.bGasto[l.grupo][l.item] || 0) + l.valor; }
    }
    r.faixas = {};
    for (const f of FAIXAS) r.faixas[f.key] = f.boleto ? r.boleto : sum(f.grupos, g => r.grupos[g]);
    r.despesas = sum(Object.values(r.grupos));
    r.total = r.despesas + r.boleto;
    r.saldo = r.renda - r.total;
    r.benefCred = sum(Object.values(r.bCred));
    r.benefGasto = sum(Object.values(r.bGasto), g => sum(Object.values(g)));
    return r;
  }

  // ===================== RENDER =====================
  function render() {
    const app = $("#app");
    if (!BASE || !KEY) { app.innerHTML = telaConfig(); return; }
    if (!sessao) { app.innerHTML = telaLogin(); ligarLogin(); return; }
    if (!nomeUsuario()) { app.innerHTML = telaNome(); ligarNome(); return; }
    if (!dados && !carregando && !erroCarga) { recarregar(); return; }
    let corpo;
    if (!dados) corpo = erroCarga ? `<div class="card"><p class="neg">${esc(erroCarga)}</p><button class="btn" data-act="reload">Tentar de novo</button></div>` : `<div class="empty"><span class="spin"></span> Carregando lançamentos…</div>`;
    else if (st.tab === "mes") corpo = telaMes();
    else if (st.tab === "lancar") corpo = telaLancar();
    else if (st.tab === "lista") corpo = telaLista();
    else corpo = telaAno();
    const titulo = { mes: "Resumo do mês", lancar: st.editando ? "Editar lançamento" : "Novo lançamento", lista: "Lançamentos", ano: "Relatório do ano" }[st.tab];
    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div><h1>${titulo}</h1><div class="who">Olá, ${esc(nomeUsuario())}</div></div>
          <div style="display:flex;gap:6px">
            <button class="iconbtn" data-act="reload" aria-label="Atualizar">${carregando ? '<span class="spin"></span>' : ICON.refresh}</button>
            <button class="iconbtn" data-act="sair" aria-label="Sair">${ICON.out}</button>
          </div>
        </header>
        <main class="content">${corpo}</main>
      </div>
      <div class="tabbar"><nav>
        ${tabBtn("mes", "Mês", ICON.home)}
        ${tabBtn("lancar", "Lançar", `<span class="i">${ICON.plus}</span>`, "plus")}
        ${tabBtn("lista", "Lista", ICON.list)}
        ${tabBtn("ano", "Ano", ICON.chart)}
      </nav></div>`;
    ligarGeral();
    if (dados && st.tab === "lancar") ligarForm();
    if (dados && st.tab === "ano") ligarAno();
  }
  const tabBtn = (t, label, ic, cls = "") => `<button class="${cls} ${st.tab === t ? "on" : ""}" data-tab="${t}">${ic}<span>${label}</span></button>`;
  const navMes = () => `
    <div class="monthnav">
      <button class="iconbtn" data-act="mes-" aria-label="Mês anterior">${ICON.left}</button>
      <div class="label">${MESES[st.mes - 1]} ${st.ano}</div>
      <button class="iconbtn" data-act="mes+" aria-label="Próximo mês">${ICON.right}</button>
    </div>`;

  function telaConfig() {
    return `<div class="login"><h1>Quase pronto</h1><p>Falta preencher o endereço e a chave do Supabase no arquivo <b>config.js</b>.</p></div>`;
  }
  function telaLogin() {
    return `<form class="login" id="flogin" autocomplete="on">
      <img class="logo" src="icon.svg" alt="">
      <h1>Orçamento J&amp;L</h1>
      <p>Entre com seu e-mail e senha.</p>
      <div class="field"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username" required></div>
      <div class="field"><label for="pw">Senha</label><input id="pw" type="password" autocomplete="current-password" required></div>
      <div class="err" id="lerr"></div>
      <button class="btn" type="submit">Entrar</button>
    </form>`;
  }
  function ligarLogin() {
    $("#flogin").addEventListener("submit", async ev => {
      ev.preventDefault();
      const b = $("#flogin .btn"); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      try { await login($("#em").value.trim(), $("#pw").value); dados = null; render(); }
      catch (e) {
        $("#lerr").textContent = e.status === 400 || /invalid/i.test(e.message) ? "E-mail ou senha incorretos." : "Não foi possível entrar: " + e.message;
        b.disabled = false; b.textContent = "Entrar";
      }
    });
  }
  function telaNome() {
    return `<form class="login" id="fnome">
      <h1>Como você quer ser chamado?</h1>
      <p>Esse nome aparece nos lançamentos que você fizer.</p>
      <div class="field"><label for="nm">Seu nome</label><input id="nm" required maxlength="30" placeholder="Ex.: Jakson"></div>
      <div class="err" id="nerr"></div>
      <button class="btn" type="submit">Continuar</button>
    </form>`;
  }
  function ligarNome() {
    $("#fnome").addEventListener("submit", async ev => {
      ev.preventDefault();
      const nome = $("#nm").value.trim(); if (!nome) return;
      try {
        const u = await authReq("user", { data: { nome } }, await token());
        sessao.user = u; salvarSessao(sessao); render();
      } catch (e) { $("#nerr").textContent = e.message; }
    });
  }

  // ---------- MÊS ----------
  function telaMes() {
    const lista = doMes(st.ano, st.mes);
    const r = resumo(lista);
    const temRenda = r.renda > 0;
    const faixas = FAIXAS.map(f => {
      const real = r.faixas[f.key]; const alvo = r.renda * f.pct; const p = temRenda ? real / r.renda : NaN;
      const w = temRenda ? Math.min(100, (real / alvo) * 100) : 0;
      const over = !f.boleto && temRenda && real > alvo + 0.005;
      const nota = f.boleto
        ? (temRenda ? (real >= alvo ? "Meta do mês atingida" : `Faltam ${money(alvo - real)} para a meta`) : "")
        : (temRenda ? (over ? `Passou ${money(real - alvo)} da meta` : `Sobram ${money(alvo - real)}`) : "");
      return `<div class="faixa">
        <div class="top"><div class="name">${f.nome} <small>meta ${Math.round(f.pct * 100)}%</small></div><div class="num"><b>${money(real)}</b></div></div>
        <div class="track"><div class="fill ${f.boleto ? "boleto" : over ? "over" : ""}" style="width:${w}%"></div></div>
        <div class="sub"><span>${pct(p)} da renda · meta ${money(alvo)}</span><span class="${over ? "neg" : ""}">${nota}</span></div>
      </div>`;
    }).join("");
    const gruposOrd = GRUPOS_DESPESA.filter(g => r.grupos[g]).sort((a, b) => r.grupos[b] - r.grupos[a]);
    const maxG = Math.max(1, ...gruposOrd.map(g => r.grupos[g]));
    const grupos = gruposOrd.map(g => {
      const itens = Object.keys(r.itens).filter(k => k.startsWith(g + "|")).sort((a, b) => r.itens[b] - r.itens[a])
        .map(k => `<div><span>${esc(k.split("|")[1])}</span><span class="num">${money(r.itens[k])}</span></div>`).join("");
      return `<div class="grp ${st.abertos[g] ? "open" : ""}"><button data-grp="${esc(g)}">
        <span class="gname">${esc(g)}</span><span class="num"><b>${money(r.grupos[g])}</b></span>
        <span class="bar"><i style="width:${(r.grupos[g] / maxG) * 100}%"></i></span>
        <span class="gpct">${temRenda ? pct(r.grupos[g] / r.renda) + " da renda" : ""}</span><span></span>
      </button><div class="items">${itens}</div></div>`;
    }).join("");
    const receitas = Object.entries(r.receitas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span class="num">${money(v)}</span></div>`).join("");
    const tickets = [...new Set([...Object.keys(r.bCred), ...Object.keys(r.bGasto)])];
    const benefRows = tickets.map(t => {
      const c = r.bCred[t] || 0; const gs = r.bGasto[t] || {}; const g = sum(Object.values(gs));
      const det = Object.entries(gs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><span>${esc(k)}</span><span class="num">${money(v)}</span></div>`).join("");
      return `<div class="grp ${st.abertos["b:" + t] ? "open" : ""}"><button data-grp="b:${esc(t)}">
        <span class="gname">${esc(t)}</span><span class="num ${c - g < 0 ? "neg" : "pos"}"><b>${money(c - g)}</b></span>
        <span class="bar"><i style="width:${c ? Math.min(100, (g / c) * 100) : 100}%;background:var(--benef)"></i></span>
        <span class="gpct">recebido ${money(c)} · gasto ${money(g)}</span><span></span>
      </button><div class="items">${det || "<div><span>Nenhum gasto</span><span></span></div>"}</div></div>`;
    }).join("");
    const benef = tickets.length ? `<div class="card"><h2>Benefícios do mês <span class="hint">· saldo de cada cartão no mês</span></h2>${benefRows}
        <div class="kv total" style="border-top:1px solid var(--line);margin-top:4px;padding-top:10px"><span>Saldo dos benefícios</span><span class="num ${r.benefCred - r.benefGasto < 0 ? "neg" : "pos"}">${money(r.benefCred - r.benefGasto)}</span></div></div>` : "";
    return `${navMes()}
      <div class="card hero">
        <div class="k">Saldo disponível no mês</div>
        <div class="big num ${r.saldo < 0 ? "neg" : ""}">${money(r.saldo)}</div>
        <div class="row">
          <div class="stat"><div class="k">Renda</div><div class="v num pos">${money(r.renda)}</div></div>
          <div class="stat"><div class="k">Despesas + boleto</div><div class="v num neg">${money(r.total)}</div></div>
        </div>
        ${r.saldo < 0 ? `<div class="alert">Renda extra a fazer: ${money(-r.saldo)}</div>` : ""}
        ${!lista.length ? `<p class="muted small" style="margin:12px 0 0">Nenhum lançamento neste mês ainda.</p>` : ""}
      </div>
      <div class="card"><h2>Regra 55 · 5 · 10 · 30 ${temRenda ? "" : '<span class="hint">· lance a renda do mês para ver as metas</span>'}</h2>${faixas}</div>
      ${grupos ? `<div class="card"><h2>Despesas por categoria <span class="hint">· toque para ver os itens</span></h2>${grupos}</div>` : ""}
      ${receitas ? `<div class="card"><h2>Receitas</h2>${receitas}</div>` : ""}
      ${benef}`;
  }

  // ---------- NOTAS GUARDADAS (arquivos para o Imposto de Renda) ----------
  // Os arquivos ficam no Storage do Supabase (pasta privada "notas"), só para quem tem login.
  const BUCKET = "notas";
  const PESSOAS_BASE = ["Lílian", "Jakson"];
  const OUTRA_PESSOA = "＋ Outra pessoa…";
  // sugestão do que costuma ser dedutível (o contador confirma)
  const IR_SUGERIDO = {
    "Saúde": ["Plano de saúde", "Médicos e terapeutas", "Dentista", "Exames e laboratório"],
    "Outros": ["Médicos esporádicos"],
    "Educação": ["Escola / faculdade"],
    "Despesas Pessoais": ["Pós-graduação"]
  };
  const irSugerido = (tipo, grupo, item) => tipo === "despesa" && (IR_SUGERIDO[grupo] || []).includes(item);
  function pessoasIR() {
    const s = PESSOAS_BASE.slice();
    if (dados) dados.lanc.forEach(l => { if (l.ir_pessoa && !s.includes(l.ir_pessoa)) s.push(l.ir_pessoa); });
    return s;
  }
  function pessoaPadrao() { const n = semAcento(nomeUsuario()); return n.startsWith("JAK") ? "Jakson" : "Lílian"; }
  const slugNota = s => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "nota";
  const caminhoUrl = p => p.split("/").map(encodeURIComponent).join("/");

  // fotos grandes da câmera viram JPEG menor (~300 KB) antes de subir
  async function prepararArquivo(file) {
    const tipo = file.type || (/\.pdf$/i.test(file.name || "") ? "application/pdf" : "");
    if (/^image\//.test(tipo) && !/gif|svg/.test(tipo)) {
      try {
        const bmp = await createImageBitmap(file);
        const escala = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise(res => c.toBlob(res, "image/jpeg", 0.82));
        if (blob && blob.size < file.size) return { blob, tipo: "image/jpeg", ext: "jpg" };
      } catch (e) { /* formato que o navegador não decodifica: sobe o original */ }
      return { blob: file, tipo, ext: (tipo.split("/")[1] || "jpg").replace("jpeg", "jpg") };
    }
    if (tipo === "application/pdf") return { blob: file, tipo, ext: "pdf" };
    throw new Error("Envie uma foto ou um arquivo PDF.");
  }
  async function enviarNota(file, data, nome) {
    const p = await prepararArquivo(file);
    if (p.blob.size > 10 * 1024 * 1024) throw new Error("Arquivo maior que 10 MB.");
    const caminho = `${data.slice(0, 4)}/${data}_${slugNota(nome)}_${Date.now().toString(36)}.${p.ext}`;
    const res = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${caminhoUrl(caminho)}`, {
      method: "POST", body: p.blob,
      headers: { apikey: KEY, Authorization: "Bearer " + (await token()), "Content-Type": p.tipo, "x-upsert": "true" }
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error("Não foi possível guardar a nota: " + (j.message || j.error || "erro " + res.status)); }
    return { anexo: caminho, anexo_nome: file.name || `nota.${p.ext}` };
  }
  async function baixarNota(caminho) {
    const res = await fetch(`${BASE}/storage/v1/object/authenticated/${BUCKET}/${caminhoUrl(caminho)}`, { headers: { apikey: KEY, Authorization: "Bearer " + (await token()) } });
    if (!res.ok) throw new Error("Não encontrei o arquivo da nota (erro " + res.status + ").");
    return res.blob();
  }
  async function apagarNotas(caminhos) {
    caminhos = caminhos.filter(Boolean); if (!caminhos.length) return;
    try {
      await fetch(`${BASE}/storage/v1/object/${BUCKET}`, { method: "DELETE", body: JSON.stringify({ prefixes: caminhos }),
        headers: { apikey: KEY, Authorization: "Bearer " + (await token()), "Content-Type": "application/json" } });
    } catch (e) { /* sobra um arquivo solto, sem prejuízo */ }
  }
  // mostra a nota (foto na tela; PDF em botão para abrir) com opção de compartilhar (WhatsApp, e-mail…)
  async function verNota(origem, nome) {
    const bg = abrirFolha(`<div class="empty" id="nv"><span class="spin"></span> Abrindo a nota…</div>
      <div class="btns" style="margin-top:12px"><button class="btn ghost" data-x="fechar">Fechar</button></div>`, true);
    try {
      const blob = origem instanceof Blob ? origem : await baixarNota(origem);
      const url = URL.createObjectURL(blob);
      const arq = nome || (typeof origem === "string" ? origem.split("/").pop() : "nota");
      const img = /^image\//.test(blob.type);
      $("#nv", bg).outerHTML = `<h3>📎 ${esc(arq)}</h3>
        ${img ? `<img src="${url}" alt="Nota" style="width:100%;border-radius:10px;border:1px solid var(--line)">` : `<p class="muted">Arquivo PDF (${(blob.size / 1024).toFixed(0)} KB).</p>`}
        <div class="btns" style="margin-top:12px">
          <a class="btn" href="${url}" target="_blank" rel="noopener" ${img ? "" : `download="${esc(arq)}"`}>${img ? "Abrir em tela cheia" : "Abrir PDF"}</a>
          ${navigator.canShare ? `<button class="btn ghost" data-x="compartilhar">Compartilhar</button>` : ""}
        </div>`;
      bg.addEventListener("click", async ev => {
        if (!ev.target.closest('[data-x="compartilhar"]')) return;
        const file = new File([blob], arq, { type: blob.type });
        try { if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: arq }); else toast("Este aparelho não compartilha arquivos daqui."); }
        catch (e) { /* cancelado */ }
      });
    } catch (e) { const nv = $("#nv", bg); if (nv) nv.innerHTML = `<p class="neg">${esc(e.message)}</p>`; }
  }

  // campos de nota + IR reaproveitados no Lançar e nas importações
  function camposIR(pref, tipo, ir, pessoa, pessoaNova) {
    if (tipo !== "despesa") return "";
    const ps = pessoasIR(); if (pessoa && pessoa !== OUTRA_PESSOA && !ps.includes(pessoa)) ps.push(pessoa);
    return `<label class="linha irlinha"><input type="checkbox" id="${pref}ir" ${ir ? "checked" : ""}> Dedutível no Imposto de Renda</label>
      ${ir ? `<div class="field"><label for="${pref}irp">Para quem</label><select id="${pref}irp">${ps.concat(OUTRA_PESSOA).map(p => `<option ${p === (pessoa || pessoaPadrao()) ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
      ${pessoa === OUTRA_PESSOA ? `<div class="field"><label for="${pref}irn">Nome</label><input id="${pref}irn" maxlength="30" placeholder="Ex.: nome do filho" value="${esc(pessoaNova || "")}"></div>` : ""}` : ""}`;
  }
  function lerPessoa(pref, root) {
    const sel = $(`#${pref}irp`, root); if (!sel) return pessoaPadrao();
    return sel.value === OUTRA_PESSOA ? (($(`#${pref}irn`, root) || {}).value || "").trim() : sel.value;
  }

  // ---------- pacote do IR: todas as notas do ano + resumo, num .zip ----------
  let jszipCarregado = null;
  function carregarJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return jszipCarregado || (jszipCarregado = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = "vendor/jszip.min.js";
      s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error("Não carreguei o gerador de .zip. Verifique a internet."));
      document.head.appendChild(s);
    }));
  }
  function csvLinhas(linhas) {
    return "﻿" + linhas.map(l => l.map(c => {
      if (typeof c === "number") return c.toFixed(2).replace(".", ",");
      const s = String(c == null ? "" : c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(";")).join("\r\n");
  }
  async function pacoteIR(y) {
    const doAno = dados.lanc.filter(l => l.data.startsWith(String(y)) && (l.ir || l.anexo)).sort((a, b) => a.data.localeCompare(b.data));
    if (!doAno.length) { toast("Nenhuma nota ou despesa dedutível em " + y); return; }
    const bg = abrirFolha(`<h3>📦 Notas de ${y}</h3><div class="empty" id="zp"><span class="spin"></span> Preparando…</div>`);
    try {
      const JSZip = await carregarJSZip();
      const zip = new JSZip(); const raiz = zip.folder(`Notas ${y}`);
      const L = [["Data", "Dedutível IR", "Para quem", "Categoria", "Item", "Valor (R$)", "Pagamento", "Observação", "Arquivo"]];
      let n = 0; const falhas = [];
      for (const l of doAno) {
        let arquivo = "";
        if (l.anexo) {
          $("#zp", bg).innerHTML = `<span class="spin"></span> Baixando nota ${++n} de ${doAno.filter(x => x.anexo).length}…`;
          const pasta = l.ir ? (l.ir_pessoa || "Sem nome") : "Outras notas";
          const nomeArq = l.anexo.split("/").pop();
          try { raiz.folder(pasta).file(nomeArq, await baixarNota(l.anexo)); arquivo = `${pasta}/${nomeArq}`; }
          catch (e) { falhas.push(l); arquivo = "(não baixou)"; }
        }
        L.push([l.data.split("-").reverse().join("/"), l.ir ? "Sim" : "Não", l.ir_pessoa || "", l.grupo, l.item, l.valor, l.meio, l.obs, arquivo || (l.ir ? "SEM NOTA" : "")]);
      }
      L.push([]); L.push(["TOTAL DEDUTÍVEL POR PESSOA"]);
      const porP = {}; doAno.filter(l => l.ir).forEach(l => { porP[l.ir_pessoa || "Sem nome"] = (porP[l.ir_pessoa || "Sem nome"] || 0) + l.valor; });
      Object.entries(porP).forEach(([p, v]) => L.push([p, "", "", "", "", v]));
      raiz.file(`Resumo IR ${y}.csv`, csvLinhas(L));
      $("#zp", bg).innerHTML = `<span class="spin"></span> Gerando o arquivo .zip…`;
      const blob = await zip.generateAsync({ type: "blob" });
      const nome = `Notas-IR-${y}.zip`;
      const url = URL.createObjectURL(blob);
      $("#zp", bg).outerHTML = `<p>${doAno.filter(l => l.anexo).length - falhas.length} notas + planilha-resumo (${(blob.size / 1048576).toFixed(1)} MB).</p>
        ${falhas.length ? `<p class="neg small">${falhas.length} nota(s) não baixaram. Tente de novo mais tarde.</p>` : ""}
        <div class="btns"><a class="btn" href="${url}" download="${nome}">Baixar .zip</a>
        ${navigator.canShare && navigator.canShare({ files: [new File([blob], nome, { type: "application/zip" })] }) ? `<button class="btn ghost" data-x="share">Enviar (WhatsApp, e-mail…)</button>` : ""}
        <button class="btn ghost" data-x="fechar">Fechar</button></div>`;
      bg.addEventListener("click", async ev => {
        const x = ev.target.closest("[data-x]"); if (!x) return;
        if (x.dataset.x === "fechar") bg.remove();
        if (x.dataset.x === "share") { try { await navigator.share({ files: [new File([blob], nome, { type: "application/zip" })], title: nome }); } catch (e) { /* cancelado */ } }
      });
    } catch (e) { bg.remove(); toast("Erro: " + e.message); }
  }

  // ---------- LANÇAR ----------
  function formPadrao() {
    const hoje = hojeISO();
    const data = hoje.slice(0, 7) === mesKey(st.ano, st.mes) ? hoje : `${mesKey(st.ano, st.mes)}-01`;
    const tipo = (st.form && st.form.tipo) || "despesa";
    const grupo = (st.form && st.form.tipo === tipo && st.form.grupo) || Object.keys(TIPOS[tipo].grupos)[0];
    return { tipo, grupo, item: "", valor: "", data, meio: (st.form && st.form.meio) || "Pix", obs: "" };
  }
  const OUTRO = "＋ Outro nome…";
  const grupoLivre = t => t.startsWith("beneficio");
  function gruposDe(tipo) {
    const g = Object.keys(TIPOS[tipo].grupos);
    if (grupoLivre(tipo) && dados) dados.lanc.forEach(l => { if (l.tipo === tipo && !g.includes(l.grupo)) g.push(l.grupo); });
    if (grupoLivre(tipo) && tipo === "beneficio_gasto" && dados) dados.lanc.forEach(l => { if (l.tipo === "beneficio_credito" && l.item !== "Outros" && !g.includes(l.item)) g.push(l.item); });
    return g;
  }
  function itensDe(tipo, grupo) {
    const it = (TIPOS[tipo].grupos[grupo] || []).slice();
    if (dados) dados.lanc.forEach(l => { if (l.tipo === tipo && l.grupo === grupo && !it.includes(l.item)) it.push(l.item); });
    return it;
  }
  function telaLancar() {
    const f = st.form || (st.form = formPadrao());
    const grupos = gruposDe(f.tipo);
    if (f.grupo !== OUTRO && !grupos.includes(f.grupo)) { if (f.grupo && st.editando) grupos.push(f.grupo); else f.grupo = grupos[0]; }
    const itens = f.grupo === OUTRO ? [] : itensDe(f.tipo, f.grupo);
    if (f.item && f.item !== OUTRO && !itens.includes(f.item)) itens.push(f.item);
    if (!f.item) f.item = itens[0] || OUTRO;
    if (f.ir === undefined) f.ir = irSugerido(f.tipo, f.grupo, f.item);
    const temNota = f.arquivo || (f.anexo && !f.removerAnexo);
    const nomeNota = f.arquivo ? f.arquivo.name || "foto" : f.anexo_nome || (f.anexo || "").split("/").pop();
    const meios = MEIOS.slice(); if (f.meio && !meios.includes(f.meio)) meios.push(f.meio);
    const opt = (arr, v) => arr.map(x => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("");
    const ed = st.editando;
    return `<form id="flanc" novalidate>
      <div class="seg">${ORDEM_TIPOS.map(t => `<button type="button" class="chip ${TIPOS[t].chip} ${f.tipo === t ? "on" : ""}" data-tipo="${t}">${TIPOS[t].label}</button>`).join("")}</div>
      <div class="field"><label for="fv">Valor</label><input id="fv" class="money num" inputmode="decimal" placeholder="0,00" value="${esc(f.valor)}" autocomplete="off"></div>
      <div class="field"><label for="fg">${f.tipo.startsWith("beneficio") ? "Cartão / benefício" : "Categoria"}</label><select id="fg">${opt(grupoLivre(f.tipo) ? grupos.concat(OUTRO) : grupos, f.grupo)}</select></div>
      ${f.grupo === OUTRO ? `<div class="field"><label for="fgn">Nome do cartão / benefício</label><input id="fgn" maxlength="40" placeholder="Ex.: Ticket Saúde" value="${esc(f.grupoNovo || "")}"></div>` : ""}
      <div class="field"><label for="fi">Item</label><select id="fi">${opt(itens.concat(OUTRO), f.item)}</select></div>
      ${f.item === OUTRO ? `<div class="field"><label for="fin">Nome do item</label><input id="fin" maxlength="40" placeholder="Digite o nome" value="${esc(f.itemNovo || "")}"></div>` : ""}
      ${f.tipo === "boleto" ? `<div class="metainfo">${esc(METAS_DESC[f.item] || "")}</div>` : ""}
      <div class="row2">
        <div class="field"><label for="fd">Data</label><input id="fd" type="date" value="${esc(f.data)}"></div>
        <div class="field"><label for="fm">Pagamento</label><select id="fm">${opt(meios, f.meio)}</select></div>
      </div>
      <div class="field"><label for="fo">Observação (opcional)</label><input id="fo" maxlength="140" value="${esc(f.obs)}"></div>
      <div class="notabox">
        ${temNota ? `<div class="notaok"><span>📎 ${esc(nomeNota)}${f.arquivo ? ' <span class="muted small">(será enviada ao salvar)</span>' : ""}</span>
            <span><button type="button" class="linkbtn" data-act="ver-nota">Ver</button><button type="button" class="linkbtn neg" data-act="tirar-nota">Remover</button></span></div>`
          : `<button type="button" class="btn ghost" data-act="anexar">📎 Anexar nota (foto ou PDF)</button>`}
        <input type="file" id="fanexo" accept="image/*,application/pdf" hidden>
        ${camposIR("f", f.tipo, f.ir, f.ir_pessoa, f.ir_pessoaNova)}
      </div>
      <div class="err" id="ferr"></div>
      <div class="btns">
        <button class="btn" type="submit">${ed ? "Salvar alterações" : "Salvar lançamento"}</button>
        ${ed ? `<div class="btns two"><button type="button" class="btn ghost" data-act="cancelar">Cancelar</button><button type="button" class="btn danger" data-act="excluir">Excluir</button></div>` : ""}
      </div>
      ${ed ? `<p class="muted small" style="margin-top:12px">Lançado por ${esc(ed.usuario || "—")}</p>` : ""}
    </form>`;
  }
  function lerForm() {
    const f = st.form;
    f.valor = $("#fv").value; f.grupo = $("#fg").value; f.item = $("#fi").value;
    f.data = $("#fd").value; f.meio = $("#fm").value; f.obs = $("#fo").value;
    f.grupoNovo = $("#fgn") ? $("#fgn").value : f.grupoNovo; f.itemNovo = $("#fin") ? $("#fin").value : f.itemNovo;
    if ($("#fir")) f.ir = $("#fir").checked;
    if ($("#firp")) f.ir_pessoa = $("#firp").value;
    if ($("#firn")) f.ir_pessoaNova = $("#firn").value;
  }
  function ligarForm() {
    const form = $("#flanc");
    $$("[data-tipo]").forEach(b => b.addEventListener("click", () => {
      lerForm(); st.form.tipo = b.dataset.tipo; st.form.grupo = Object.keys(TIPOS[st.form.tipo].grupos)[0]; st.form.item = "";
      if (st.form.tipo.startsWith("beneficio") && !["Cartão Ticket", "Ticket Restaurante", "Sodexo"].includes(st.form.meio)) st.form.meio = "Cartão Ticket";
      render();
    }));
    const reSugerir = () => { if (!st.form.irManual) st.form.ir = undefined; };
    $("#fg").addEventListener("change", () => { lerForm(); st.form.item = st.form.grupo === OUTRO ? OUTRO : ""; reSugerir(); render(); const n = $("#fgn"); if (n) n.focus(); });
    $("#fi").addEventListener("change", () => { lerForm(); reSugerir(); render(); const n = $("#fin"); if (n) n.focus(); });
    const fir = $("#fir"); if (fir) fir.addEventListener("change", () => { lerForm(); st.form.irManual = true; render(); });
    const firp = $("#firp"); if (firp) firp.addEventListener("change", () => { lerForm(); render(); const n = $("#firn"); if (n) n.focus(); });
    const fan = $("#fanexo"); if (fan) fan.addEventListener("change", () => { const a = fan.files[0]; fan.value = ""; if (!a) return; lerForm(); st.form.arquivo = a; st.form.removerAnexo = false; render(); });
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); lerForm();
      const f = st.form; const v = parseValor(f.valor);
      const podeNegativo = st.editando && st.editando.fatura;
      if (!isFinite(v) || v === 0 || (v < 0 && !podeNegativo)) { $("#ferr").textContent = "Informe um valor maior que zero."; $("#fv").focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) { $("#ferr").textContent = "Informe a data."; return; }
      const grupo = f.grupo === OUTRO ? (f.grupoNovo || "").trim() : f.grupo;
      const item = f.item === OUTRO ? (f.itemNovo || "").trim() : f.item;
      if (!grupo) { $("#ferr").textContent = "Digite o nome do cartão / benefício."; return; }
      if (!item) { $("#ferr").textContent = "Digite o nome do item."; return; }
      const reg = { data: f.data, tipo: f.tipo, grupo, item, valor: v, meio: f.meio, obs: f.obs.trim() || null };
      reg.ir = f.tipo === "despesa" && !!f.ir;
      reg.ir_pessoa = reg.ir ? (f.ir_pessoa === OUTRA_PESSOA ? (f.ir_pessoaNova || "").trim() : (f.ir_pessoa || pessoaPadrao())) : null;
      if (reg.ir && !reg.ir_pessoa) { $("#ferr").textContent = "Digite o nome da pessoa do Imposto de Renda."; return; }
      const b = form.querySelector("[type=submit]"); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      let antigo = null;
      try {
        if (f.arquivo) { b.innerHTML = '<span class="spin"></span> Enviando a nota…'; Object.assign(reg, await enviarNota(f.arquivo, f.data, item)); antigo = st.editando && st.editando.anexo; }
        else if (f.removerAnexo && st.editando) { reg.anexo = null; reg.anexo_nome = null; antigo = st.editando.anexo; }
        if (st.editando) {
          await api("lancamentos?id=eq." + st.editando.id, { method: "PATCH", body: reg });
          if (st.editando.fatura && reg.tipo === "despesa" && (grupo !== st.editando.grupo || item !== st.editando.item))
            aprender([{ desc: descDaObs(st.editando.obs), grupo, item }]).catch(() => {});
          toast("Lançamento atualizado");
          st.editando = null; st.form = null; st.tab = "lista";
        } else {
          reg.usuario = nomeUsuario();
          await api("lancamentos", { method: "POST", body: reg, headers: { Prefer: "return=minimal" } });
          toast(`Lançamento de ${money(v)} salvo`);
          const [y, m] = f.data.split("-").map(Number); st.ano = y; st.mes = m;
          st.form = Object.assign(formPadrao(), { tipo: f.tipo, grupo, meio: f.meio, data: f.data });
        }
        if (antigo) apagarNotas([antigo]);
        await recarregar(true);
      } catch (e) { $("#ferr").textContent = "Não foi possível salvar: " + e.message; b.disabled = false; b.textContent = "Tentar de novo"; }
    });
    if (!st.editando) setTimeout(() => { const v = $("#fv"); if (v && !v.value && window.matchMedia("(pointer:fine)").matches) v.focus(); }, 50);
  }
  async function excluirAtual() {
    if (!st.editando || !confirm("Excluir este lançamento? Essa ação não pode ser desfeita.")) return;
    try {
      await api("lancamentos?id=eq." + st.editando.id, { method: "DELETE" });
      if (st.editando.anexo) apagarNotas([st.editando.anexo]);
      toast("Lançamento excluído"); st.editando = null; st.form = null; st.tab = "lista"; await recarregar(true);
    } catch (e) { toast("Erro: " + e.message); }
  }
  function abrirEdicao(id) {
    const l = dados.lanc.find(x => String(x.id) === String(id)); if (!l) return;
    st.editando = l;
    st.form = { tipo: l.tipo, grupo: l.grupo, item: l.item, valor: fmtValorInput(l.valor), data: l.data, meio: l.meio || "Outro", obs: l.obs || "",
      ir: !!l.ir, irManual: true, ir_pessoa: l.ir_pessoa || undefined, anexo: l.anexo || null, anexo_nome: l.anexo_nome || null };
    st.tab = "lancar"; render(); window.scrollTo(0, 0);
  }

  // ---------- LISTA ----------
  const FILTROS = { todos: "Todos", receita: "Receitas", despesa: "Despesas", boleto: "Boleto", beneficio: "Benefícios" };
  function telaLista() {
    let lista = doMes(st.ano, st.mes);
    const r = resumo(lista);
    if (st.filtro !== "todos") lista = lista.filter(l => st.filtro === "beneficio" ? l.tipo.startsWith("beneficio") : l.tipo === st.filtro);
    let html = navMes();
    html += `<div class="seg">${Object.entries(FILTROS).map(([k, v]) => `<button class="chip ${st.filtro === k ? "on" : ""}" data-filtro="${k}">${v}</button>`).join("")}</div>`;
    html += `<div class="sumline"><span>Renda <b class="num pos">${money(r.renda)}</b></span><span>Despesas + boleto <b class="num neg">${money(r.total)}</b></span></div>`;
    if (!lista.length) html += `<div class="empty">Nenhum lançamento ${st.filtro === "todos" ? "neste mês" : "com esse filtro"}.</div>`;
    let dia = ""; const faturasVistas = new Set();
    for (const l of lista) {
      if (l.data !== dia) { dia = l.data; const [y, m, d] = dia.split("-"); html += `<div class="day">${Number(d)} de ${MESES[Number(m) - 1]}</div>`; }
      if (l.fatura) {
        if (faturasVistas.has(l.fatura)) continue;
        faturasVistas.add(l.fatura);
        html += blocoFatura(l.fatura, lista.filter(x => x.fatura === l.fatura));
        continue;
      }
      const sinal = l.tipo === "receita" || l.tipo === "beneficio_credito" ? "+" : "−";
      const cls = l.tipo === "receita" ? "pos" : l.tipo === "despesa" ? "neg" : "";
      const letra = { receita: "R", despesa: "D", boleto: "B", beneficio_credito: "V", beneficio_gasto: "V" }[l.tipo];
      html += `<button class="tx" data-edit="${l.id}">
        <span class="dot ${l.tipo}">${letra}</span>
        <span><div class="t1">${esc(l.item)}${l.anexo ? " 📎" : ""}${l.ir ? ' <span class="irtag">IR</span>' : ""}</div><div class="t2">${esc(l.grupo)} · ${esc(l.meio || "—")} · ${esc(l.usuario || "—")}${l.obs ? " · " + esc(l.obs) : ""}</div></span>
        <span class="v num ${cls}">${sinal} ${money(l.valor)}</span>
      </button>`;
    }
    html += `<div class="btns" style="margin-top:16px">
      <button class="btn ghost" data-act="importar">📄 Importar PDF (fatura, conta ou cupom)</button>
      <button class="btn ghost" data-act="copiar">Copiar lançamentos do mês anterior</button></div>
      <input type="file" id="fpdf" accept="application/pdf,.pdf" hidden>`;
    return html;
  }
  function abrirCopia() {
    const pm = st.mes === 1 ? 12 : st.mes - 1; const py = st.mes === 1 ? st.ano - 1 : st.ano;
    const ant = doMes(py, pm).filter(l => !l.fatura).sort((a, b) => a.data.localeCompare(b.data));
    const bg = document.createElement("div"); bg.className = "sheet-bg";
    const lastDay = new Date(st.ano, st.mes, 0).getDate();
    const jaTem = new Set(doMes(st.ano, st.mes).map(l => l.tipo + "|" + l.grupo + "|" + l.item));
    bg.innerHTML = `<div class="sheet">
      <h3>Copiar de ${MESES[pm - 1]} para ${MESES[st.mes - 1]}</h3>
      <p class="muted small">Marque as contas que se repetem e ajuste o valor, se mudou.</p>
      ${ant.length ? ant.map(l => { const ja = jaTem.has(l.tipo + "|" + l.grupo + "|" + l.item); return `<label class="check">
          <input type="checkbox" data-id="${l.id}" ${!ja && (l.tipo === "receita" || l.tipo === "beneficio_credito" || /fixa|Financiamento|Faxineira|Seguro|Semear|Dízimo|Doações|internet/i.test(l.grupo + " " + l.item)) ? "checked" : ""}>
          <span><div class="t1">${esc(l.item)}</div><div class="t2">${esc(l.grupo)} · dia ${Number(l.data.slice(8))}${ja ? ' · <b class="neg">já lançado neste mês</b>' : ""}</div></span>
          <input type="text" inputmode="decimal" data-v="${l.id}" value="${fmtValorInput(l.valor)}">
        </label>`; }).join("") : `<div class="empty">Nada lançado em ${MESES[pm - 1]}.</div>`}
      <div class="btns two" style="margin-top:14px"><button class="btn ghost" data-x="fechar">Cancelar</button><button class="btn" data-x="ok" ${ant.length ? "" : "disabled"}>Copiar</button></div>
    </div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", async ev => {
      const x = ev.target.closest("[data-x]");
      if (ev.target === bg || (x && x.dataset.x === "fechar")) { bg.remove(); return; }
      if (x && x.dataset.x === "ok") {
        const regs = [];
        for (const cb of $$("input[type=checkbox]:checked", bg)) {
          const l = ant.find(a => String(a.id) === cb.dataset.id); const v = parseValor($(`[data-v="${cb.dataset.id}"]`, bg).value);
          if (!(v > 0)) { toast("Valor inválido em " + l.item); return; }
          const d = Math.min(Number(l.data.slice(8)), lastDay);
          regs.push({ data: `${mesKey(st.ano, st.mes)}-${pad(d)}`, tipo: l.tipo, grupo: l.grupo, item: l.item, valor: v, meio: l.meio, obs: l.obs, usuario: nomeUsuario() });
        }
        if (!regs.length) { toast("Marque pelo menos um item"); return; }
        x.disabled = true; x.innerHTML = '<span class="spin"></span>';
        try { await api("lancamentos", { method: "POST", body: regs, headers: { Prefer: "return=minimal" } }); bg.remove(); toast(`${regs.length} lançamento(s) copiados`); await recarregar(true); }
        catch (e) { toast("Erro: " + e.message); x.disabled = false; x.textContent = "Copiar"; }
      }
    });
  }

  // ---------- IMPORTAR FATURA DO CARTÃO (PDF) ----------
  // O PDF é lido aqui no aparelho (pdf.js + fatura.js); só as compras revisadas vão para o banco.
  const SENHAS_KEY = "orcamento.senhasPdf";
  let pdfjsMod = null;
  async function carregarPdfjs() {
    if (pdfjsMod) return pdfjsMod;
    const base = new URL("vendor/", location.href).href;
    pdfjsMod = await import(base + "pdf.min.mjs");
    pdfjsMod.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
    return pdfjsMod;
  }
  const descDaObs = obs => String(obs || "").split(" · ")[0];
  const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

  function abrirFolha(html, fechavel) {
    const bg = document.createElement("div"); bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet">${html}</div>`;
    document.body.appendChild(bg);
    if (fechavel) bg.addEventListener("click", ev => { const x = ev.target.closest("[data-x]"); if (x && x.dataset.x === "fechar") bg.remove(); });
    return bg;
  }
  function senhasSalvas() { try { return JSON.parse(localStorage.getItem(SENHAS_KEY) || "[]"); } catch (e) { return []; } }
  function pedirSenhaFactory() {
    const fila = senhasSalvas().slice(); let lembrar = null; let pediu = false;
    const fn = motivo => {
      if (fila.length) return fila.shift();
      pediu = true;
      return new Promise(res => {
        const bg = abrirFolha(`<h3>Fatura protegida por senha</h3>
          <p class="muted small">${motivo === "errada" ? '<b class="neg">Senha incorreta.</b> ' : ""}Digite a senha do PDF (geralmente os primeiros números do CPF). Ela é usada só aqui no celular.</p>
          <div class="field"><input id="pdfpw" type="password" autocomplete="off" inputmode="text"></div>
          <label class="small linha"><input type="checkbox" id="pdflemb"> Lembrar esta senha neste aparelho</label>
          <div class="btns two" style="margin-top:12px"><button class="btn ghost" data-x="cancelar">Cancelar</button><button class="btn" data-x="ok">Abrir</button></div>`);
        const inp = $("#pdfpw", bg); setTimeout(() => inp.focus(), 50);
        const fim = pw => { bg.remove(); res(pw); };
        bg.addEventListener("click", ev => {
          const x = ev.target.closest("[data-x]"); if (!x) return;
          if (x.dataset.x === "cancelar") fim(null);
          else { lembrar = $("#pdflemb", bg).checked ? inp.value : null; fim(inp.value); }
        });
        inp.addEventListener("keydown", ev => { if (ev.key === "Enter") $('[data-x="ok"]', bg).click(); });
      });
    };
    fn.depois = () => {
      if (!pediu || !lembrar) return;
      const l = senhasSalvas(); if (!l.includes(lembrar)) l.push(lembrar);
      try { localStorage.setItem(SENHAS_KEY, JSON.stringify(l)); } catch (e) { /* sem storage */ }
    };
    return fn;
  }

  async function importarFatura(file) {
    const aguarde = abrirFolha(`<div class="empty"><span class="spin"></span> Lendo a fatura…</div>`);
    try {
      if (!window.Fatura) throw new Error("O leitor de faturas não carregou. Atualize a página e tente de novo.");
      const pdfjs = await carregarPdfjs();
      const data = new Uint8Array(await file.arrayBuffer());
      const pedir = pedirSenhaFactory();
      const paginas = await window.Fatura.extrairPaginas(pdfjs, data, pedir);
      pedir.depois();
      const r = window.Fatura.ler(paginas);
      aguarde.remove();
      if (r.tipo === "conta") abrirConta(r, file); else if (r.tipo === "cupom" || r.tipo === "nfe") abrirCupom(r, file); else abrirRevisao(r);
    } catch (e) {
      aguarde.remove();
      const txt = String((e && (e.name + " " + e.message)) || e);
      const msg = /Password|Worker was destroyed|destroyed/i.test(txt) ? "A fatura não foi aberta: a senha não foi informada."
        : /Invalid PDF|InvalidPDF/i.test(txt) ? "Esse arquivo não é um PDF válido." : (e && e.message) || txt;
      abrirFolha(`<h3>Não consegui ler esse PDF</h3><p class="muted">${esc(msg)}</p><div class="btns"><button class="btn" data-x="fechar">Ok</button></div>`, true);
    }
  }

  function opcoesCategoria(sel) {
    return GRUPOS_DESPESA.map(g => `<optgroup label="${esc(g)}">${itensDe("despesa", g).map(i => {
      const v = g + "|" + i; return `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(i)}</option>`;
    }).join("")}</optgroup>`).join("");
  }

  function abrirRevisao(r) {
    const aprendidas = (dados && dados.regras) || {};
    const itens = r.itens.map((it, i) => {
      const c = window.Fatura.classificar(it, aprendidas);
      return Object.assign({}, it, { i, sug: c.grupo + "|" + c.item, origem: c.origem });
    });
    const [vy, vm] = r.vencISO.split("-").map(Number);
    const jaImportada = dados.lanc.some(l => l.fatura === r.chave);
    const titulares = [...new Set(r.itens.map(i => semAcento(String(i.titular || "").split(" ")[0])).filter(Boolean))];
    const unicos = doMes(vy, vm).filter(l => l.tipo === "despesa" && !l.fatura && /cart[ãa]o/i.test(l.item));
    const cartoes = new Set(r.itens.map(i => i.cartao).filter(Boolean));
    const conferir = itens.filter(i => i.origem === "palpite" && !i.estorno).length;
    const linha = it => `<div class="rv ${it.origem === "palpite" && !it.estorno ? "conferir" : ""} ${it.estorno ? "estorno" : ""}">
        <input type="checkbox" data-i="${it.i}" ${it.estorno ? "" : "checked"}>
        <div><div class="t1">${esc(it.desc)}${it.parcela ? ` <span class="muted">${esc(it.parcela)}</span>` : ""}</div>
          <div class="t2">${it.data ? "compra " + esc(it.data) : "taxa"}${it.cartao && cartoes.size > 1 ? " · final " + esc(it.cartao) : ""}${it.estorno ? " · estorno: anula outro lançamento de mesmo valor" : ""}${it.origem === "palpite" && !it.estorno ? " · confira a categoria" : ""}${it.origem === "aprendida" ? " · categoria que vocês escolheram antes" : ""}</div>
          <select data-cat="${it.i}">${opcoesCategoria(it.sug)}</select></div>
        <div class="v num ${it.valor < 0 ? "pos" : ""}">${it.valor < 0 ? "+ " + money(-it.valor) : money(it.valor)}</div>
      </div>`;
    const bg = abrirFolha(`
      <h3>💳 ${esc(r.chave)}</h3>
      <p class="muted small">Será lançada em <b>${MESES[vm - 1]} de ${vy}</b> (mês do vencimento), com cada compra na sua categoria.</p>
      <div class="kv"><span>Compras lidas</span><span class="num">${itens.length} · ${money(r.soma)}</span></div>
      <div class="kv"><span>Total de lançamentos impresso na fatura</span><span class="num">${isFinite(r.esperado) ? money(r.esperado) : "—"}</span></div>
      <div class="${r.confere ? "okbox" : "alert"}">${r.confere ? "✓ Confere com o total da fatura" : "⚠ A soma não bate com o total da fatura. Confira se o PDF está completo."}</div>
      ${r.saldoAnterior > 0 ? `<p class="muted small">A fatura cobra também ${money(r.saldoAnterior)} de saldo da fatura anterior. Não é compra nova, por isso não entra aqui.</p>` : ""}
      ${jaImportada ? `<div class="alert">Essa fatura já foi importada antes. Ao salvar, a importação anterior será substituída.</div>` : ""}
      ${unicos.length ? `<h4>Lançamento único do cartão</h4><p class="muted small">Se algum destes for desta mesma fatura, marque para remover e não contar duas vezes. Se for de outro cartão, deixe desmarcado.</p>
        ${unicos.map(l => `<label class="small linha"><input type="checkbox" data-unico="${l.id}" ${titulares.some(t => semAcento(l.item).includes(t)) && [r.totalFatura, r.esperado, r.soma].some(v => isFinite(v) && v > 0 && Math.abs(l.valor - v) <= v * 0.02) ? "checked" : ""}> Remover “${esc(l.item)}” (${money(l.valor)})</label>`).join("")}` : ""}
      <h4>Compras ${conferir ? `<span class="muted small">· ${conferir} para conferir a categoria</span>` : ""}</h4>
      <div>${itens.map(linha).join("")}</div>
      <div class="sumline" style="margin-top:10px" id="rvsoma"></div>
      <div class="btns two" style="margin-top:10px"><button class="btn ghost" data-x="fechar">Cancelar</button><button class="btn" data-x="ok">Salvar</button></div>`, true);
    const somar = () => {
      const sel = itens.filter(it => $(`[data-i="${it.i}"]`, bg).checked);
      $("#rvsoma", bg).innerHTML = `<span>Selecionadas: <b>${sel.length}</b></span><span><b class="num">${money(sum(sel, x => x.valor))}</b></span>`;
      $('[data-x="ok"]', bg).textContent = `Salvar ${sel.length} compras`;
    };
    somar();
    bg.addEventListener("change", ev => { if (ev.target.matches("[data-i]")) somar(); });
    bg.addEventListener("click", async ev => {
      const x = ev.target.closest('[data-x="ok"]'); if (!x) return;
      const sel = itens.filter(it => $(`[data-i="${it.i}"]`, bg).checked);
      if (!sel.length) { toast("Marque pelo menos uma compra"); return; }
      const corrigidas = [];
      const regs = sel.map(it => {
        const escolha = $(`[data-cat="${it.i}"]`, bg).value; const [grupo, item] = escolha.split("|");
        if (escolha !== it.sug) corrigidas.push({ desc: it.desc, grupo, item });
        return {
          data: r.vencISO, tipo: "despesa", grupo, item, valor: it.valor, meio: "Cartão de Crédito", usuario: nomeUsuario(), fatura: r.chave,
          obs: [it.desc + (it.parcela ? " " + it.parcela : ""), it.data ? "compra " + it.data : "", it.cartao ? "final " + it.cartao : ""].filter(Boolean).join(" · ")
        };
      });
      const remover = $$("[data-unico]:checked", bg).map(c => c.dataset.unico);
      x.disabled = true; x.innerHTML = '<span class="spin"></span>';
      try {
        if (jaImportada) await api("lancamentos?fatura=eq." + encodeURIComponent(r.chave), { method: "DELETE" });
        for (let i = 0; i < regs.length; i += 200) await api("lancamentos", { method: "POST", body: regs.slice(i, i + 200), headers: { Prefer: "return=minimal" } });
        if (remover.length) await api("lancamentos?id=in.(" + remover.join(",") + ")", { method: "DELETE" });
        if (corrigidas.length) await aprender(corrigidas).catch(() => {});
        bg.remove();
        st.ano = vy; st.mes = vm; st.tab = "lista"; st.filtro = "todos"; st.abertos["f:" + r.chave] = false;
        toast(`${regs.length} compras importadas`);
        await recarregar(true); window.scrollTo(0, 0);
      } catch (e) { toast("Erro ao salvar: " + e.message); x.disabled = false; x.textContent = "Tentar de novo"; }
    });
  }

  // conta de luz/água: vira um lançamento só, substituindo o do mês se já existir
  function abrirConta(r, file) {
    const doMesConta = iso => { const [y, m] = iso.split("-").map(Number); return doMes(y, m); };
    const candidatos = iso => doMesConta(iso).filter(l => l.tipo === "despesa" && !l.fatura && l.grupo === r.grupo && l.item === r.item)
      .concat(dados.lanc.filter(l => String(l.obs || "").startsWith(r.chave)))
      .filter((l, i, a) => a.findIndex(x => x.id === l.id) === i);
    const icone = r.empresa === "Cemig" ? "💡" : "🚿";
    const bg = abrirFolha(`
      <h3>${icone} ${esc(r.chave)}</h3>
      <p class="muted small">${esc(r.detalhe || "")}</p>
      <div class="field"><label>Valor</label><input id="cv" class="money num" inputmode="decimal" value="${fmtValorInput(r.valor)}"></div>
      <div class="field"><label>Categoria</label><select id="cc">${opcoesCategoria(r.grupo + "|" + r.item)}</select></div>
      <div class="row2">
        <div class="field"><label>Data (vencimento)</label><input id="cd" type="date" value="${r.vencISO}"></div>
        <div class="field"><label>Pagamento</label><select id="cm">${MEIOS.map(x => `<option ${x === (r.debito ? "Débito Automático" : "Boleto") ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      </div>
      <p class="muted small" style="margin-top:-4px">Entra no mês do vencimento. Se preferir no mês de referência (${esc(r.ref)}), mude a data.</p>
      <label class="linha"><input type="checkbox" id="cguardar" checked> 📎 Guardar este PDF junto do lançamento</label>
      <div id="csub"></div>
      <div class="btns two" style="margin-top:12px"><button class="btn ghost" data-x="fechar">Cancelar</button><button class="btn" data-x="ok">Salvar</button></div>`, true);
    const subs = () => {
      const c = candidatos($("#cd", bg).value || r.vencISO);
      $("#csub", bg).innerHTML = c.length ? `<h4>Já existe no mês</h4>${c.map(l => `<label class="small linha"><input type="checkbox" data-sub="${l.id}" checked> Substituir “${esc(l.item)}” de ${l.data.split("-").reverse().join("/")} (${money(l.valor)})</label>`).join("")}` : "";
    };
    subs(); $("#cd", bg).addEventListener("change", subs);
    bg.addEventListener("click", async ev => {
      const x = ev.target.closest('[data-x="ok"]'); if (!x) return;
      const v = parseValor($("#cv", bg).value); const data = $("#cd", bg).value;
      if (!(v > 0)) { toast("Valor inválido"); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { toast("Informe a data"); return; }
      const [grupo, item] = $("#cc", bg).value.split("|");
      const reg = { data, tipo: "despesa", grupo, item, valor: v, meio: $("#cm", bg).value, usuario: nomeUsuario(), obs: [r.chave, r.detalhe].filter(Boolean).join(" · ") };
      const remover = $$("[data-sub]:checked", bg).map(c => c.dataset.sub);
      x.disabled = true; x.innerHTML = '<span class="spin"></span>';
      try {
        if (file && $("#cguardar", bg).checked) Object.assign(reg, await enviarNota(file, data, r.chave));
        await api("lancamentos", { method: "POST", body: reg, headers: { Prefer: "return=minimal" } });
        if (remover.length) {
          apagarNotas(dados.lanc.filter(l => remover.includes(String(l.id))).map(l => l.anexo));
          await api("lancamentos?id=in.(" + remover.join(",") + ")", { method: "DELETE" });
        }
        bg.remove();
        const [y, m] = data.split("-").map(Number); st.ano = y; st.mes = m; st.tab = "lista"; st.filtro = "todos";
        toast(`${item} de ${money(v)} salva`);
        await recarregar(true); window.scrollTo(0, 0);
      } catch (e) { toast("Erro ao salvar: " + e.message); x.disabled = false; x.textContent = "Tentar de novo"; }
    });
  }

  // cupom fiscal eletrônico (NFC-e): um lançamento com o total, na categoria da loja
  function abrirCupom(r, file) {
    let c = window.Fatura.classificar({ desc: r.emitente }, (dados && dados.regras) || {});
    if (c.origem === "palpite" && r.itens.length) { const ci = window.Fatura.classificar({ desc: r.itens[0].texto || r.itens[0].desc }, (dados && dados.regras) || {}); if (ci.origem !== "palpite") c = ci; }
    const f = r.forma.toLowerCase();
    const meioPadrao = /cr[eé]dito/.test(f) ? "Cartão de Crédito" : /d[eé]bito/.test(f) ? "Cartão de Débito" : /dinheiro/.test(f) ? "Dinheiro" : /pix/.test(f) ? "Pix"
      : /alimenta/.test(f) ? "Ticket Alimentação" : /refei/.test(f) ? "Ticket Refeição" : "Outro";
    const opcoesPago = MEIOS.filter(m => !["Ticket Restaurante", "Sodexo"].includes(m)).concat(["Ticket Alimentação", "Ticket Refeição", "Ticket Combustível"]);
    const ja = dados.lanc.filter(l => String(l.obs || "").includes(r.chave));
    const bg = abrirFolha(`
      <h3>🧾 ${esc(r.emitente)}</h3>
      <p class="muted small">${r.tipo === "nfe" ? "Nota fiscal" : "Cupom fiscal"} ${esc(r.numero ? "nº " + r.numero : "")} · ${esc(r.data)}${r.forma ? " · pago com: " + esc(r.forma) : ""}</p>
      ${r.tipo === "nfe" ? `<p class="muted small">Compras online costumam ser pagas no cartão de crédito. Se foi o caso, ela já vem na fatura: não precisa lançar a nota.</p>` : ""}
      ${r.itens.length ? `<div class="small" style="margin-bottom:10px">${r.itens.map(i => `<div class="kv"><span>${esc(i.desc)}</span><span class="num">${money(i.valor)}</span></div>`).join("")}</div>` : ""}
      <div class="field"><label>Valor total</label><input id="uv" class="money num" inputmode="decimal" value="${fmtValorInput(r.total)}"></div>
      <div class="field"><label>Categoria</label><select id="uc">${opcoesCategoria(c.grupo + "|" + c.item)}</select></div>
      <div class="row2">
        <div class="field"><label>Data</label><input id="ud" type="date" value="${r.vencISO}"></div>
        <div class="field"><label>Pago com</label><select id="um">${opcoesPago.map(x => `<option ${x === meioPadrao ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      </div>
      <div id="uaviso"></div>
      <label class="linha"><input type="checkbox" id="uguardar" checked> 📎 Guardar este PDF junto do lançamento</label>
      <div id="uirbox">${camposIR("u", "despesa", irSugerido("despesa", c.grupo, c.item), pessoaPadrao())}</div>
      ${ja.length ? `<div class="alert">Esse cupom já foi lançado. Ao salvar, o lançamento anterior será substituído.</div>` : ""}
      <div class="btns two" style="margin-top:12px"><button class="btn ghost" data-x="fechar">Cancelar</button><button class="btn" data-x="ok">Salvar</button></div>`, true);
    const aviso = () => {
      const m = $("#um", bg).value;
      $("#uaviso", bg).innerHTML = m === "Cartão de Crédito" ? `<div class="alert">Pago no cartão de crédito: essa compra também vai aparecer na fatura. Se vocês importam a fatura, não lance o cupom, para não contar duas vezes.</div>`
        : /^Ticket/.test(m) ? `<p class="muted small">Vai entrar como gasto do benefício (${esc(m)}), descontando do saldo do ticket.</p>` : "";
    };
    aviso(); $("#um", bg).addEventListener("change", aviso);
    let irManual = false;
    const redesenharIR = () => {
      const ticket = /^Ticket/.test($("#um", bg).value);
      const [g, i] = $("#uc", bg).value.split("|");
      const atual = $("#uir", bg);
      const marcado = irManual && atual ? atual.checked : irSugerido("despesa", g, i);
      const pessoa = $("#uirp", bg) ? $("#uirp", bg).value : pessoaPadrao();
      $("#uirbox", bg).innerHTML = ticket ? "" : camposIR("u", "despesa", marcado, pessoa, ($("#uirn", bg) || {}).value);
    };
    bg.addEventListener("change", ev => {
      if (ev.target.id === "uir") { irManual = true; redesenharIR(); }
      else if (ev.target.id === "uirp" || ev.target.id === "um" || (ev.target.id === "uc" && !irManual)) redesenharIR();
    });
    bg.addEventListener("click", async ev => {
      const x = ev.target.closest('[data-x="ok"]'); if (!x) return;
      const v = parseValor($("#uv", bg).value); const data = $("#ud", bg).value; const pago = $("#um", bg).value;
      if (!(v > 0)) { toast("Valor inválido"); return; }
      const [grupo, item] = $("#uc", bg).value.split("|");
      const obs = [r.chave, r.itens.slice(0, 3).map(i => i.desc).join(", ") + (r.itens.length > 3 ? "…" : "")].filter(Boolean).join(" · ");
      let reg;
      if (/^Ticket/.test(pago)) {
        const lista = TIPOS.beneficio_gasto.grupos[pago] || ["Outros"];
        const it = lista.includes(item) ? item : item === "Restaurantes" && lista.includes("Restaurante") ? "Restaurante" : "Outros";
        reg = { data, tipo: "beneficio_gasto", grupo: pago, item: it, valor: v, meio: "Cartão Ticket", usuario: nomeUsuario(), obs };
      } else {
        reg = { data, tipo: "despesa", grupo, item, valor: v, meio: pago, usuario: nomeUsuario(), obs };
        const irBox = $("#uir", bg);
        reg.ir = !!(irBox && irBox.checked); reg.ir_pessoa = reg.ir ? lerPessoa("u", bg) : null;
        if (reg.ir && !reg.ir_pessoa) { toast("Digite o nome da pessoa do IR"); return; }
      }
      x.disabled = true; x.innerHTML = '<span class="spin"></span>';
      try {
        if (file && $("#uguardar", bg).checked) Object.assign(reg, await enviarNota(file, data, r.emitente));
        await api("lancamentos", { method: "POST", body: reg, headers: { Prefer: "return=minimal" } });
        if (ja.length) { apagarNotas(ja.map(l => l.anexo)); await api("lancamentos?id=in.(" + ja.map(l => l.id).join(",") + ")", { method: "DELETE" }); }
        if (reg.tipo === "despesa" && $("#uc", bg).value !== c.grupo + "|" + c.item) aprender([{ desc: r.emitente, grupo, item }]).catch(() => {});
        bg.remove();
        const [y, m] = data.split("-").map(Number); st.ano = y; st.mes = m; st.tab = "lista"; st.filtro = "todos";
        toast(`${r.tipo === "nfe" ? "Nota" : "Cupom"} de ${money(v)} salvo`);
        await recarregar(true); window.scrollTo(0, 0);
      } catch (e) { toast("Erro ao salvar: " + e.message); x.disabled = false; x.textContent = "Tentar de novo"; }
    });
  }

  // guarda as categorias que vocês corrigiram, para a próxima fatura já vir certa
  async function aprender(lista) {
    const rows = []; const vistos = new Set();
    for (const x of lista) {
      const k = window.Fatura ? window.Fatura.chave(x.desc) : "";
      if (!k || vistos.has(k)) continue;
      vistos.add(k); rows.push({ chave: k, grupo: x.grupo, item: x.item, updated_at: new Date().toISOString() });
    }
    if (!rows.length) return;
    await api("regras", { method: "POST", body: rows, headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
    if (dados) { dados.regras = dados.regras || {}; rows.forEach(r => { dados.regras[r.chave] = { grupo: r.grupo, item: r.item }; }); }
  }

  function blocoFatura(key, itens) {
    const total = sum(itens, l => l.valor);
    const lin = itens.slice().sort((a, b) => a.id - b.id).map(l => {
      const compra = (String(l.obs || "").match(/compra (\d{2}\/\d{2})/) || [])[1];
      return `<button class="tx mini" data-edit="${l.id}">
        <span><div class="t1">${esc(descDaObs(l.obs) || l.item)}${l.ir ? ' <span class="irtag">IR</span>' : ""}</div><div class="t2">${esc(l.grupo)} › ${esc(l.item)}${compra ? " · " + compra : ""}</div></span>
        <span class="v num ${l.valor < 0 ? "pos" : "neg"}">${l.valor < 0 ? "+ " + money(-l.valor) : "− " + money(l.valor)}</span></button>`;
    }).join("");
    return `<div class="fat ${st.abertos["f:" + key] ? "open" : ""}">
      <button class="tx" data-fat="${esc(key)}">
        <span class="dot despesa">💳</span>
        <span><div class="t1">${esc(key)}</div><div class="t2">${itens.length} compras · toque para ${st.abertos["f:" + key] ? "fechar" : "ver"}</div></span>
        <span class="v num neg">− ${money(total)}</span></button>
      <div class="fatitems">${lin}
        <button class="btn danger" data-act="excluir-fatura" data-key="${esc(key)}" style="margin:4px 0 12px">Excluir esta fatura inteira</button></div>
    </div>`;
  }
  async function excluirFatura(key) {
    if (!key || !confirm(`Excluir todas as compras da fatura “${key}”? Você pode importá-la de novo depois.`)) return;
    try { await api("lancamentos?fatura=eq." + encodeURIComponent(key), { method: "DELETE" }); toast("Fatura excluída"); await recarregar(true); }
    catch (e) { toast("Erro: " + e.message); }
  }

  // ---------- ANO ----------
  function porMes(y) { const out = []; for (let m = 1; m <= 12; m++) out.push(resumo(doMes(y, m))); return out; }
  function telaAno() {
    const y = st.ano; const ms = porMes(y);
    const ativos = ms.map((r, i) => (r.renda || r.total ? i : -1)).filter(i => i >= 0);
    const tot = resumo(dados.lanc.filter(l => l.data.slice(0, 4) === String(y)));
    const base = ms.find(r => r.total > 0);
    const nav = `<div class="monthnav"><button class="iconbtn" data-act="ano-" aria-label="Ano anterior">${ICON.left}</button><div class="label">${y}</div><button class="iconbtn" data-act="ano+" aria-label="Próximo ano">${ICON.right}</button></div>`;
    if (!ativos.length) return nav + `<div class="empty">Nenhum lançamento em ${y}.</div>`;

    // gráfico receita x despesa
    const W = 360, H = 170, top = 10, bot = 22, left = 4; const maxV = Math.max(1, ...ms.map(r => Math.max(r.renda, r.total)));
    const bw = (W - left * 2) / 12; let bars = "";
    ms.forEach((r, i) => {
      const x = left + i * bw; const h1 = (r.renda / maxV) * (H - top - bot); const h2 = (r.total / maxV) * (H - top - bot);
      bars += `<rect x="${x + bw * .14}" y="${H - bot - h1}" width="${bw * .34}" height="${h1}" rx="2" fill="var(--pos)"><title>${MESES_C[i]} renda ${money(r.renda)}</title></rect>`;
      bars += `<rect x="${x + bw * .52}" y="${H - bot - h2}" width="${bw * .34}" height="${h2}" rx="2" fill="var(--neg)"><title>${MESES_C[i]} despesas ${money(r.total)}</title></rect>`;
      bars += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--ink-3)">${MESES_C[i][0]}</text>`;
    });
    const chart = `<div class="card chart"><h2>Receita x despesa</h2><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita e despesa por mês"><line x1="0" x2="${W}" y1="${H - bot}" y2="${H - bot}" stroke="var(--line)"/>${bars}</svg>
      <div class="legend"><span style="--c:var(--pos)">Renda</span><span style="--c:var(--neg)">Despesas + boleto</span></div></div>`;

    // tabela mensal
    const cols = ativos;
    const linha = (nome, f, cls = "") => `<tr class="${cls}"><td>${nome}</td>${cols.map(i => `<td class="num">${f(ms[i], i)}</td>`).join("")}</tr>`;
    const tabela = `<div class="card"><h2>Mês a mês</h2><div class="scrollx"><table class="grid">
      <thead><tr><th></th>${cols.map(i => `<th>${MESES_C[i]}</th>`).join("")}</tr></thead><tbody>
      ${linha("Renda", r => money(r.renda))}
      ${linha("Despesas + boleto", r => money(r.total))}
      ${linha("Saldo", r => `<span class="${r.saldo < 0 ? "neg" : "pos"}">${money(r.saldo)}</span>`, "tot")}
      ${linha("Renda extra a fazer", r => (r.saldo < 0 ? `<span class="neg">${money(-r.saldo)}</span>` : "—"))}
      ${linha("Inflação familiar", r => (base && r.total ? pct(r.total / base.total - 1) : "—"))}
      </tbody></table></div><p class="muted small" style="margin:8px 0 0">Inflação familiar: quanto o gasto do mês variou em relação ao primeiro mês do ano com gastos.</p></div>`;

    // categorias x mês
    const cats = [...GRUPOS_DESPESA.filter(g => tot.grupos[g]), "Boleto Pessoal"];
    const valCat = (r, g) => (g === "Boleto Pessoal" ? r.boleto : r.grupos[g] || 0);
    const tabCat = `<div class="card"><h2>Gastos por categoria</h2><div class="scrollx"><table class="grid">
      <thead><tr><th></th>${cols.map(i => `<th>${MESES_C[i]}</th>`).join("")}<th>Total</th><th>Média</th><th>% renda</th></tr></thead><tbody>
      ${cats.map(g => `<tr><td>${esc(g)}</td>${cols.map(i => `<td class="num">${valCat(ms[i], g) ? money(valCat(ms[i], g)) : "—"}</td>`).join("")}
        <td class="num"><b>${money(valCat(tot, g))}</b></td><td class="num">${money(valCat(tot, g) / cols.length)}</td><td class="num">${tot.renda ? pct(valCat(tot, g) / tot.renda) : "—"}</td></tr>`).join("")}
      <tr class="tot"><td>Total</td>${cols.map(i => `<td class="num">${money(ms[i].total)}</td>`).join("")}<td class="num">${money(tot.total)}</td><td class="num">${money(tot.total / cols.length)}</td><td class="num">${tot.renda ? pct(tot.total / tot.renda) : "—"}</td></tr>
      </tbody></table></div></div>`;

    // como gasto (pilha)
    const cores = ["#1f7a45", "#b4382f", "#c4851c", "#2f5d9a", "#7a4fa3", "#3a8f8f", "#a34f7a", "#6b7d2a", "#5d5f58"];
    const partes = cats.map((g, i) => ({ g, v: valCat(tot, g), c: g === "Boleto Pessoal" ? "var(--boleto)" : cores[i % cores.length] })).filter(p => p.v > 0).sort((a, b) => b.v - a.v);
    const totP = sum(partes, p => p.v) || 1;
    const como = `<div class="card"><h2>Como gastamos em ${y}</h2>
      <div class="stack">${partes.map(p => `<i style="width:${(p.v / totP) * 100}%;background:${p.c}" title="${esc(p.g)}"></i>`).join("")}</div>
      <div class="legend">${partes.map(p => `<span style="--c:${p.c}">${esc(p.g)} ${pct(p.v / totP)}</span>`).join("")}</div></div>`;

    // regra 55/5/10/30 no ano
    const faixasAno = `<div class="card"><h2>Regra 55 · 5 · 10 · 30 no ano</h2>${FAIXAS.map(f => {
      const real = tot.faixas[f.key]; const alvo = tot.renda * f.pct; const over = !f.boleto && real > alvo + 0.005;
      return `<div class="faixa"><div class="top"><div class="name">${f.nome} <small>meta ${Math.round(f.pct * 100)}%</small></div><div class="num"><b>${money(real)}</b></div></div>
        <div class="track"><div class="fill ${f.boleto ? "boleto" : over ? "over" : ""}" style="width:${tot.renda ? Math.min(100, (real / alvo) * 100) : 0}%"></div></div>
        <div class="sub"><span>${tot.renda ? pct(real / tot.renda) : "—"} da renda · meta ${money(alvo)}</span></div></div>`;
    }).join("")}</div>`;

    // boleto pessoal (acumulado de todos os anos)
    const metasMap = {}; (dados.metas || []).forEach(m => { metasMap[m.item] = m.alvo == null ? null : Number(m.alvo); });
    const boletoAll = {}; dados.lanc.filter(l => l.tipo === "boleto").forEach(l => { boletoAll[l.item] = (boletoAll[l.item] || 0) + l.valor; });
    const metas = `<div class="card"><h2>Boleto Pessoal · metas <span class="hint">· guardado até hoje</span></h2>${TIPOS.boleto.grupos["Boleto Pessoal"].map(it => {
      const g = boletoAll[it] || 0; const alvo = metasMap[it];
      return `<div class="meta-row"><div class="top"><b>${it}</b><span class="num"><b>${money(g)}</b>${alvo ? ` <span class="muted small">de ${money(alvo)}</span>` : ""}</span></div>
        <div class="desc">${esc(METAS_DESC[it])}</div>
        ${alvo ? `<div class="track"><div class="fill boleto" style="width:${Math.min(100, (g / alvo) * 100)}%"></div></div>` : ""}
        <div class="alvo">Valor-alvo: <input inputmode="decimal" data-alvo="${it}" value="${alvo ? fmtValorInput(alvo) : ""}" placeholder="definir"> ${alvo ? pct(g / alvo) : ""}</div></div>`;
    }).join("")}</div>`;

    const irAno = dados.lanc.filter(l => l.data.startsWith(String(y)) && l.ir);
    const notasAno = dados.lanc.filter(l => l.data.startsWith(String(y)) && l.anexo).length;
    const porPessoa = {}; irAno.forEach(l => { const p = l.ir_pessoa || "Sem nome"; porPessoa[p] = porPessoa[p] || { v: 0, n: 0, sem: 0 }; porPessoa[p].v += l.valor; porPessoa[p].n++; if (!l.anexo) porPessoa[p].sem++; });
    const irCard = `<div class="card"><h2>Imposto de Renda ${y} <span class="hint">· despesas marcadas como dedutíveis</span></h2>
      ${Object.keys(porPessoa).length ? Object.entries(porPessoa).map(([p, o]) => `<div class="kv"><span>${esc(p)} <span class="muted small">· ${o.n} despesa(s)${o.sem ? ` · <b class="neg">${o.sem} sem nota</b>` : ""}</span></span><span class="num"><b>${money(o.v)}</b></span></div>`).join("")
        : `<p class="muted small">Nenhuma despesa marcada como dedutível ainda. Ao lançar consulta, dentista, exame, plano de saúde ou escola, marque "Dedutível no Imposto de Renda" e anexe a nota.</p>`}
      <p class="muted small" style="margin:8px 0">${notasAno} nota(s) guardada(s) em ${y}. Farmácia e cursos livres normalmente não são dedutíveis; quem confirma é o contador.</p>
      <div class="btns"><button class="btn" data-act="zip-ir" ${irAno.length || notasAno ? "" : "disabled"}>📦 Baixar notas de ${y} para o contador (.zip)</button></div></div>`;
    const exp = `<div class="card"><h2>Exportar</h2><div class="btns">
      <button class="btn ghost" data-act="csv-grade">Baixar planilha do ano</button>
      <button class="btn ghost" data-act="csv-lanc">Baixar todos os lançamentos de ${y}</button></div>
      <p class="muted small" style="margin:8px 0 0">Os arquivos abrem no Excel e no Google Planilhas.</p></div>`;
    return nav + chart + faixasAno + tabela + tabCat + como + metas + irCard + exp;
  }
  function ligarAno() {
    $$("[data-alvo]").forEach(inp => inp.addEventListener("change", async () => {
      const v = inp.value.trim() ? parseValor(inp.value) : null;
      if (v !== null && !(v > 0)) { toast("Valor inválido"); return; }
      try {
        await api("metas", { method: "POST", body: { item: inp.dataset.alvo, alvo: v, updated_at: new Date().toISOString() }, headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
        toast("Meta atualizada"); await recarregar(true);
      } catch (e) { toast("Erro: " + e.message); }
    }));
  }

  // ---------- EXPORTAÇÃO ----------
  function baixar(nome, linhas) {
    const csv = "﻿" + linhas.map(l => l.map(c => {
      if (typeof c === "number") return c.toFixed(2).replace(".", ",");
      const s = String(c == null ? "" : c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportarGrade() {
    const y = st.ano; const ms = porMes(y); const L = [];
    L.push([`ORÇAMENTO DOMÉSTICO JACK e LOLI — ${y}`]); L.push(["Item", ...MESES_C, "Total"]);
    const linhaItens = (tipo, grupo, itens) => {
      const vals = itens.map(it => { const row = [it]; let t = 0; for (let m = 1; m <= 12; m++) { const v = sum(doMes(y, m).filter(l => l.tipo === tipo && l.grupo === grupo && l.item === it), l => l.valor); row.push(v); t += v; } row.push(t); return row; });
      return vals;
    };
    const itensDe = (tipo, grupo) => { const s = new Set(TIPOS[tipo].grupos[grupo] || []); dados.lanc.filter(l => l.tipo === tipo && l.grupo === grupo && l.data.startsWith(String(y))).forEach(l => s.add(l.item)); return [...s]; };
    const bloco = (titulo, tipo, grupos) => {
      L.push([]); L.push([titulo.toUpperCase()]);
      for (const g of grupos) {
        const rows = linhaItens(tipo, g, itensDe(tipo, g));
        if (grupos.length > 1) L.push(["  " + g]);
        rows.forEach(r => L.push(r));
        const tr = ["Total " + g]; for (let i = 1; i <= 13; i++) tr.push(sum(rows, r => r[i])); L.push(tr);
      }
    };
    bloco("Receitas", "receita", Object.keys(TIPOS.receita.grupos));
    bloco("Boleto Pessoal (30%)", "boleto", ["Boleto Pessoal"]);
    bloco("Despesas", "despesa", GRUPOS_DESPESA);
    bloco("Benefícios recebidos", "beneficio_credito", gruposDe("beneficio_credito"));
    bloco("Gastos com benefícios", "beneficio_gasto", gruposDe("beneficio_gasto"));
    L.push([]); L.push(["RESUMO"]);
    const res = (nome, f) => { const r = [nome]; ms.forEach(x => r.push(f(x))); r.push(sum(ms, f)); L.push(r); };
    res("Renda total", r => r.renda);
    FAIXAS.forEach(f => res(`${f.nome} (${Math.round(f.pct * 100)}%)`, r => r.faixas[f.key]));
    res("Total despesas", r => r.total);
    res("Saldo disponível", r => r.saldo);
    res("Renda extra a fazer", r => (r.saldo < 0 ? -r.saldo : 0));
    baixar(`orcamento_${y}.csv`, L);
  }
  function exportarLanc() {
    const y = String(st.ano);
    const L = [["Data", "Tipo", "Categoria", "Item", "Valor", "Pagamento", "Quem lançou", "Observação"]];
    dados.lanc.filter(l => l.data.startsWith(y)).slice().sort((a, b) => a.data.localeCompare(b.data))
      .forEach(l => L.push([l.data.split("-").reverse().join("/"), TIPOS[l.tipo] ? TIPOS[l.tipo].label : l.tipo, l.grupo, l.item, l.valor, l.meio, l.usuario, l.obs]));
    baixar(`lancamentos_${y}.csv`, L);
  }

  // ---------- EVENTOS GERAIS ----------
  function ligarGeral() {
    $$("[data-tab]").forEach(b => b.addEventListener("click", () => {
      const t = b.dataset.tab;
      if (t === "lancar" && st.editando) { st.editando = null; st.form = null; }
      if (t === "lancar" && st.tab !== "lancar") st.form = null;
      st.tab = t; render(); window.scrollTo(0, 0);
    }));
    $$("[data-act]").forEach(b => b.addEventListener("click", ev => {
      const a = b.dataset.act;
      if (a === "reload") recarregar();
      else if (a === "sair") { if (confirm("Sair do app neste celular?")) sair(); }
      else if (a === "mes-" || a === "mes+") {
        st.mes += a === "mes+" ? 1 : -1;
        if (st.mes < 1) { st.mes = 12; st.ano--; } if (st.mes > 12) { st.mes = 1; st.ano++; }
        render();
      }
      else if (a === "ano-" || a === "ano+") { st.ano += a === "ano+" ? 1 : -1; render(); }
      else if (a === "cancelar") { st.editando = null; st.form = null; st.tab = "lista"; render(); }
      else if (a === "excluir") excluirAtual();
      else if (a === "copiar") abrirCopia();
      else if (a === "importar") { const i = $("#fpdf"); if (i) i.click(); }
      else if (a === "excluir-fatura") excluirFatura(b.dataset.key);
      else if (a === "anexar") { const i = $("#fanexo"); if (i) i.click(); }
      else if (a === "ver-nota") { const f = st.form; if (f.arquivo) verNota(f.arquivo, f.arquivo.name); else if (f.anexo) verNota(f.anexo, f.anexo_nome); }
      else if (a === "tirar-nota") { lerForm(); if (st.form.arquivo) st.form.arquivo = null; else st.form.removerAnexo = true; render(); }
      else if (a === "zip-ir") pacoteIR(st.ano);
      else if (a === "csv-grade") exportarGrade();
      else if (a === "csv-lanc") exportarLanc();
    }));
    $$("[data-grp]").forEach(b => b.addEventListener("click", () => { const g = b.dataset.grp; st.abertos[g] = !st.abertos[g]; b.parentElement.classList.toggle("open"); }));
    $$("[data-filtro]").forEach(b => b.addEventListener("click", () => { st.filtro = b.dataset.filtro; render(); }));
    $$("[data-edit]").forEach(b => b.addEventListener("click", () => abrirEdicao(b.dataset.edit)));
    $$("[data-fat]").forEach(b => b.addEventListener("click", () => { const k = "f:" + b.dataset.fat; st.abertos[k] = !st.abertos[k]; render(); }));
    const fp = $("#fpdf"); if (fp) fp.addEventListener("change", () => { const f = fp.files[0]; fp.value = ""; if (f) importarFatura(f); });
  }

  // atualiza ao voltar para o app (para ver o que o outro lançou)
  document.addEventListener("visibilitychange", () => { if (!document.hidden && sessao && dados && st.tab !== "lancar") recarregar(true); });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  render();
})();
