/* Leitor de faturas de cartão em PDF (Itaú e Santander) — roda no próprio aparelho, sem enviar nada para fora.
   Usado pelo app (window.Fatura) e pelos testes no Node (module.exports). */
(function (root) {
  "use strict";

  const NUM = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
  const RE_LINHA = new RegExp("^(\\d{2}/\\d{2})\\s+(.+?)\\s+(" + NUM + ")(?:\\s+" + NUM + ")?$");
  const num = s => Number(String(s).replace(/\./g, "").replace(",", "."));
  const pad = n => String(n).padStart(2, "0");

  // ---------- extração do texto com posições (pdf.js) ----------
  async function extrairPaginas(pdfjs, data, pedirSenha) {
    const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
    if (pedirSenha) {
      task.onPassword = (update, motivo) => {
        Promise.resolve(pedirSenha(motivo === 2 ? "errada" : "nova")).then(pw => {
          if (pw == null) task.destroy(); else update(pw);
        });
      };
    }
    const doc = await task.promise;
    const paginas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      paginas.push({
        largura: vp.width,
        itens: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: vp.height - i.transform[5] }))
      });
    }
    try { await task.destroy(); } catch (e) { /* ok */ }
    return paginas;
  }

  // agrupa os textos de uma coluna em linhas (mesma altura)
  function linhas(itens) {
    const ord = itens.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const out = [];
    for (const it of ord) {
      const l = out[out.length - 1];
      if (l && Math.abs(it.y - l.y) <= 2.2) l.itens.push(it); else out.push({ y: it.y, itens: [it] });
    }
    return out.map(l => l.itens.sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim());
  }

  // páginas -> linhas em ordem de leitura (coluna esquerda e depois direita)
  function linhasEmOrdem(paginas, corte) {
    const out = [];
    for (const p of paginas) {
      const c = p.largura * corte;
      out.push(...linhas(p.itens.filter(i => i.x < c)));
      out.push(...linhas(p.itens.filter(i => i.x >= c)));
    }
    return out;
  }
  const textoCorrido = paginas => paginas.map(p => linhas(p.itens).join("\n")).join("\n");

  function dataCompleta(ddmm, venc) {
    const [d, m] = ddmm.split("/").map(Number);
    const [, mv, av] = venc.split("/").map(Number);
    const ano = m > mv ? av - 1 : av;
    return `${ano}-${pad(m)}-${pad(d)}`;
  }

  // ---------- Itaú ----------
  function lerItau(paginas) {
    const txt = textoCorrido(paginas);
    const venc = (txt.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
    const final = (txt.match(/Cart[ãa]o\s+\d{4}\.X{4}\.X{4}\.(\d{4})/) || [])[1] || "";
    const totalFatura = num((txt.match(/Total desta fatura\s+(-?[\d.]+,\d{2})/) || [])[1] || "0");
    const esperado = num((txt.match(/Total dos lan[çc]amentos atuais\s+(-?[\d.]+,\d{2})/) || [])[1] || "NaN");
    const saldoAnterior = num((txt.match(/Saldo financiado\s+(-?[\d.]+,\d{2})/) || [])[1] || "0");
    const itens = []; let secao = null; let ult = null; let titular = "";
    for (const l of linhasEmOrdem(paginas, 0.57)) {
      if (/^Pagamentos efetuados/.test(l)) { secao = null; ult = null; continue; }
      if (/^Lan[çc]amentos: compras e saques/.test(l)) { secao = "nacional"; ult = null; continue; }
      if (/^Lan[çc]amentos internacionais/.test(l)) { secao = "internacional"; ult = null; continue; }
      if (/^(Compras parceladas|Lan[çc]amentos no cart[ãa]o|Total dos lan|Pr[óo]xima fatura|Limites de cr|Encargos)/.test(l)) { secao = null; ult = null; continue; }
      if (!secao) continue;
      if (/^[A-ZÀ-Ú][A-ZÀ-Ú ]{6,}$/.test(l) && !/\d/.test(l)) { titular = l; ult = null; continue; }
      const iof = l.match(/^Repasse de IOF em R\$\s+(-?[\d.]+,\d{2})/);
      if (iof) { itens.push({ data: null, desc: "IOF sobre compras internacionais", parcela: "", valor: num(iof[1]), dica: "iof", titular }); ult = null; continue; }
      const m = l.match(RE_LINHA);
      if (m) {
        let desc = m[2]; let parcela = "";
        const pm = desc.match(/^(.*?)\s+(\d{2}\/\d{2})$/); if (pm) { desc = pm[1]; parcela = pm[2]; }
        if (/^PAGAMENTO/i.test(desc) || /^Total /i.test(desc)) { ult = null; continue; }
        ult = { data: m[1], desc, parcela, valor: num(m[3]), dica: "", cidade: "", titular, internacional: secao === "internacional" };
        itens.push(ult); continue;
      }
      // linha abaixo da compra: "supermercado MONTES CLAROS" (categoria do Itaú + cidade)
      const c = l.match(/^([a-zà-úç]+)\s+(.*)$/);
      if (ult && c && !ult.dica) { ult.dica = c[1]; ult.cidade = c[2]; continue; }
    }
    return { banco: "Itaú", final, venc, itens, esperado, totalFatura, saldoAnterior };
  }

  // ---------- Santander ----------
  function lerSantander(paginas) {
    const txt = textoCorrido(paginas);
    const venc = (txt.match(/Vencimento[\s\S]{0,120}?(\d{2}\/\d{2}\/\d{4})/) || [])[1];
    const totalFatura = num((txt.match(/Total a Pagar[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/) || [])[1] || "0");
    const brasil = num((txt.match(/Total Despesas\/D[ée]bitos no Brasil\s+([\d.]+,\d{2})/) || [])[1] || "NaN");
    const exterior = num((txt.match(/Total Despesas\/D[ée]bitos no Exterior\s+([\d.]+,\d{2})/) || [])[1] || "0");
    const creditos = num((txt.match(/Total de cr[ée]ditos\s+([\d.]+,\d{2})/) || [])[1] || "0");
    const saldoAnterior = 0;
    const itens = []; let secao = null; let cartao = ""; let titular = ""; let primeiro = "";
    for (let l of linhasEmOrdem(paginas, 0.505)) {
      const cm = l.match(/^@?\s*(.+?)\s+-\s+\d{4}\s+X{4}\s+X{4}\s+(\d{4})/);
      if (cm) { titular = cm[1].replace(/^@\s*/, ""); cartao = cm[2] + (/^@/.test(l) ? " (virtual)" : ""); if (!primeiro) primeiro = cm[2]; secao = null; continue; }
      if (/^Pagamento e Demais Cr[ée]ditos/.test(l)) { secao = "creditos"; continue; }
      if (/^Parcelamentos$/.test(l)) { secao = "parcelas"; continue; }
      if (/^Despesas$/.test(l)) { secao = "despesas"; continue; }
      if (/^(VALOR TOTAL|Resumo da Fatura|Saldo total consolidado)/.test(l)) { secao = null; continue; }
      if (!secao || !cartao) continue;
      l = l.replace(/^\d\s+(?=\d{2}\/\d{2}\s)/, "");
      const m = l.match(RE_LINHA);
      if (!m) continue;
      let desc = m[2]; let parcela = "";
      const pm = desc.match(/^(.*?)\s+(\d{2}\/\d{2})$/); if (pm) { desc = pm[1]; parcela = pm[2]; }
      const valor = num(m[3]);
      if (!valor) continue;
      if (secao === "creditos" && /DEB AUTOM|PAGAMENTO|PGTO/i.test(desc)) continue;
      itens.push({ data: m[1], desc, parcela, valor, dica: "", cidade: "", titular, cartao });
    }
    return { banco: "Santander", final: primeiro, venc, itens, esperado: Math.round((brasil + exterior - creditos) * 100) / 100, totalFatura, saldoAnterior };
  }

  // ---------- estornos: um crédito anula uma compra de mesmo valor ----------
  function marcarEstornos(itens) {
    for (const neg of itens.filter(i => i.valor < 0)) {
      const par = itens.find(i => !i.estorno && i !== neg && i.valor === -neg.valor);
      if (par) { neg.estorno = true; par.estorno = true; }
    }
  }

  function ler(paginas) {
    const txt = textoCorrido(paginas);
    let r;
    if (/SANTANDER/i.test(txt) && /Detalhamento da Fatura/i.test(txt)) r = lerSantander(paginas);
    else if (/Ita[úu]|ITAU UNIBANCO/i.test(txt) && /Lan[çc]amentos: compras e saques/.test(txt)) r = lerItau(paginas);
    else throw new Error("Esse PDF não parece uma fatura Itaú ou Santander. Por enquanto o app lê só esses dois modelos.");
    if (!r.venc) throw new Error("Não encontrei a data de vencimento na fatura.");
    for (const it of r.itens) it.dataCompra = it.data ? dataCompleta(it.data, r.venc) : null;
    marcarEstornos(r.itens);
    r.soma = Math.round(r.itens.reduce((a, i) => a + i.valor, 0) * 100) / 100;
    r.confere = isFinite(r.esperado) && Math.abs(r.soma - r.esperado) < 0.01;
    const [d, m, a] = r.venc.split("/");
    r.vencISO = `${a}-${m}-${d}`;
    r.chave = `${r.banco} final ${r.final} · venc. ${r.venc}`;
    return r;
  }

  // ---------- classificação ----------
  // nome do estabelecimento sem acento, números e a cidade que o banco cola no fim ("REDE HAVANAMONTES CLARO")
  const chave = desc => String(desc).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, " ").replace(/[^A-Z&* ]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/(\S)MONTES ?C?L?A?R?O?S?( ?BRA?)?$/, "$1").replace(/ ?MONTES C(L(A(R(OS?)?)?)?)?( ?BRA?)?$/, "")
    .replace(/(\S) ?SAO PAULO$/, "$1").replace(/ BRA?$/, "").trim();

  const REGRAS = [
    [/ANUIDADE|TARIFA|IOF/, "Outros", "Tarifas bancárias"],
    [/NETFLIX|DISNEY|PRIME ?VIDEO|AMAZON ?PRIME|GLOBOPLAY|MAX ?COM|HBO|DEEZER/, "Habitação", "Streaming (Prime, Netflix, Disney)"],
    [/SPOTIFY|APPLE ?COM|YOUTUBE|GOOGLE ?(STORAGE|ONE|PLAY)/, "Lazer", "Spotify, música e outros"],
    [/ANTHROPIC|CLAUDE|OPENAI|CHATGPT|ABACUS|NELOGICA|TOP GAIN|HOTMART|UDEMY|ALURA|KIWIFY|CURSO/, "Educação", "Cursos extracurriculares"],
    [/COLEGIO|ESCOLA|FACULDADE|UNIVERSIDADE/, "Educação", "Outros"],
    [/LIVRAR|LIVRO/, "Educação", "Livros"],
    [/DROGA|FARMA|DRUGSTORE|PACHECO|ARAUJO|PAGUE MENOS/, "Saúde", "Farmácia"],
    [/ODONTO|DENTIS/, "Saúde", "Dentista"],
    [/CLINICA|LABORAT|HOSPITAL|MEDIC/, "Saúde", "Médicos e terapeutas"],
    [/POSTO|COMBUST|PETRO|JET ?FOX|SHELL|IPIRANGA|AUTO ?POSTO/, "Transporte", "Combustível"],
    [/LUBRIFIC|MECANIC|OFICINA|PNEU|AUTO ?PECAS/, "Transporte", "Mecânico / revisão"],
    [/PARK|ESTACION/, "Transporte", "Estacionamentos"],
    [/UBER|\b99\b|CABIFY/, "Transporte", "Apps de carro"],
    [/LAVA ?JATO|LAVAGEM/, "Transporte", "Lavagens"],
    [/SUPERMERC|MERCADO|ATACAD|SACOLAO|HORTI|SUPERBOX|COMERCIAL|EMPORIO|ACOUGUE|CARNES|PANIFIC|PADARIA|\bPAO\b|BISCOIT|ADEGA/, "Habitação", "Supermercado"],
    [/FEIRA/, "Habitação", "Feira"],
    [/RESTAUR|LANCH|PIZZA|BURGU|ESFIHA|SPOLETO|SUBWAY|DOMINOS|IFOOD|CHURRASC|SUSHI|GORDINHO|OUTBACK|MC ?DONALD|BURGER/, "Lazer", "Restaurantes"],
    [/\bBAR\b|CERVEJ|CAFE|CAFETERIA/, "Lazer", "Cafés, bares e boates"],
    [/CINEMA|INGRESSO|SYMPLA|PARQUE/, "Lazer", "Passeios"],
    [/STUDIO|SALAO|CABELEIR|BARBEAR|ESTETICA|MANICURE/, "Despesas Pessoais", "Cabeleireiro"],
    [/ACADEMIA|SMART ?FIT|CROSSFIT/, "Despesas Pessoais", "Academia"],
    [/PRIVALIA|RENNER|RIACHUELO|C ?& ?A\b|ZARA|SHEIN|ESTRIPULIA|CALCAD|MODA|ROUPA/, "Despesas Pessoais", "Vestuário"],
    [/BOTICARIO|NATURA|SEPHORA|COSMET|PERFUM/, "Despesas Pessoais", "Cosméticos"],
    [/CELULAR|\bVIVO\b|\bTIM\b|CLARO ?(S ?A|CELULAR|FIXO|NET)/, "Habitação", "Celular"],
    [/CASAS ?BA|MAGAZINE|MAGALU|AMAZON|MERCADOLIVRE|MERCADO LIVRE|SHOPEE|LEROY|TOK ?STOK|CAMICADO/, "Outros", "Utilidades domésticas e decoração"],
    [/IGREJA|DIZIMO|OFERTA/, "Outros", "Dízimos"],
    [/SUPLEMENT|GROWTH|PROFIT/, "Outros", "Suplementos academia"]
  ];
  const DICA_BANCO = {
    supermercado: ["Habitação", "Supermercado"], restaurante: ["Lazer", "Restaurantes"], saude: ["Saúde", "Farmácia"],
    "saúde": ["Saúde", "Farmácia"], educacao: ["Educação", "Cursos extracurriculares"], "educação": ["Educação", "Cursos extracurriculares"],
    "vestuário": ["Despesas Pessoais", "Vestuário"], vestuario: ["Despesas Pessoais", "Vestuário"],
    hospedagem: ["Lazer", "Passeios"], turismo: ["Lazer", "Passeios"], veiculos: ["Transporte", "Mecânico / revisão"], "veículos": ["Transporte", "Mecânico / revisão"]
  };

  // aprendidas = { "CHAVE": {grupo, item} } — correções que vocês fizeram antes
  function classificar(it, aprendidas) {
    const k = chave(it.desc);
    if (aprendidas && aprendidas[k]) return { grupo: aprendidas[k].grupo, item: aprendidas[k].item, origem: "aprendida" };
    if (it.dica === "iof") return { grupo: "Outros", item: "Tarifas bancárias", origem: "regra" };
    const sem = k.replace(/\s/g, "");
    for (const [re, grupo, item] of REGRAS) if (re.test(k) || re.test(sem)) return { grupo, item, origem: "regra" };
    const d = DICA_BANCO[(it.dica || "").toLowerCase()];
    if (d) return { grupo: d[0], item: d[1], origem: "banco" };
    return { grupo: "Outros", item: "Extras diários", origem: "palpite" };
  }

  const api = { extrairPaginas, ler, classificar, chave };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Fatura = api;
})(typeof window !== "undefined" ? window : globalThis);
