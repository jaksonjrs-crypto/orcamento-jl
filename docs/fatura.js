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
        itens: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: vp.height - i.transform[5], w: i.width || 0 }))
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
    // pedaços colados (sem espaço visível entre eles) se juntam sem espaço: "P" + "ARCELADO" = "PARCELADO"
    return out.map(l => {
      const its = l.itens.sort((a, b) => a.x - b.x); let txt = ""; let fim = null;
      for (const i of its) { txt += (fim === null ? "" : (i.w && i.x - fim < 0.6 ? "" : " ")) + i.s; fim = i.w ? i.x + i.w : null; }
      return txt.replace(/\s+/g, " ").trim();
    });
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

  // ---------- Inter ----------
  const MES_ABREV = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  function lerInter(paginas) {
    const txt = textoCorrido(paginas);
    const venc = (txt.match(/Data de Vencimento[\s\S]{0,60}?(\d{2}\/\d{2}\/\d{4})/) || txt.match(/VENCIMENTO[\s\S]{0,120}?(\d{2}\/\d{2}\/\d{4})/) || [])[1];
    const esperado = num((txt.match(/Despesas do m[êe]s\s+R\$\s*([\d.]+,\d{2})/) || [])[1] || "NaN");
    const totalFatura = num((txt.match(/Total da sua fatura\s+R\$\s*([\d.]+,\d{2})/) || [])[1] || "0");
    const itens = []; let secao = false; let cartao = ""; let primeiro = "";
    for (const l of linhasEmOrdem(paginas, 1)) {
      if (/Despesas da fatura/.test(l)) { secao = true; continue; }
      if (/Pr[óo]xima fatura|Fale com a gente|Encargos financeiros/.test(l)) { secao = false; continue; }
      if (!secao) continue;
      const cm = l.match(/^CART[ÃA]O\s+\d{4}\*{4}(\d{4})/); if (cm) { cartao = cm[1]; if (!primeiro) primeiro = cartao; continue; }
      const m = l.match(/^(\d{1,2}) de ([a-zç]{3})\.? (\d{4}) (.+?) (\+ )?R\$ ?([\d.]+,\d{2})$/i);
      if (!m) continue;
      let desc = m[4]; let parcela = "";
      const pm = desc.match(/^(.*?)\s*\(Parcela (\d+) de (\d+)\)/i);
      if (pm) { desc = pm[1]; parcela = pad(pm[2]) + "/" + pad(pm[3]); } else desc = desc.replace(/\s+-$/, "");
      if (m[5] || /PAGTO|PAGAMENTO/i.test(desc)) continue;   // pagamento da fatura anterior
      const mes = MES_ABREV[m[2].toLowerCase()]; if (!mes) continue;
      itens.push({ data: pad(m[1]) + "/" + pad(mes), ano: Number(m[3]), desc: desc.trim(), parcela, valor: num(m[6]), dica: "", cidade: "", titular: "", cartao });
    }
    return { banco: "Inter", final: primeiro, venc, itens, esperado, totalFatura, saldoAnterior: 0 };
  }

  // ---------- contas de consumo (um lançamento só) ----------
  function lerCemig(paginas) {
    const txt = textoCorrido(paginas);
    const m = txt.match(/([A-Z]{3}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+,\d{2})/);
    if (!m) throw new Error("Não encontrei referência, vencimento e valor na conta da Cemig.");
    const kwh = (txt.match(/Energia kWh\s+\S+\s+[\d.]+\s+[\d.]+\s+\d+\s+([\d.]+)/) || [])[1];
    const inj = (txt.match(/Energia Injetada\s+\S+\s+[\d.]+\s+[\d.]+\s+\d+\s+([\d.]+)/) || [])[1];
    const detalhe = [kwh ? kwh + " kWh consumidos" : "", inj ? inj + " kWh injetados (solar)" : ""].filter(Boolean).join(" · ");
    const debito = /ATEN[ÇC][ÃA]O:?\s*D[ÉE]BITO AUTOM/i.test(txt);
    return { tipo: "conta", empresa: "Cemig", grupo: "Habitação", item: "Conta de energia", ref: m[1], venc: m[2], valor: num(m[3]), detalhe, debito };
  }
  function lerCopasa(paginas) {
    const txt = textoCorrido(paginas);
    // o canhoto de pagamento traz "referência  vencimento  valor" (no topo, a data ao lado é a de emissão)
    const todas = [...txt.matchAll(/([A-Z]{3}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+R\$\s*([\d.]+,\d{2})/g)];
    const m = todas[todas.length - 1];
    if (!m) throw new Error("Não encontrei referência, vencimento e valor na conta da Copasa.");
    const m3 = (txt.match(/(\d+)\s*m³/) || [])[1];
    return { tipo: "conta", empresa: "Copasa", grupo: "Habitação", item: "Conta de água", ref: m[1], venc: m[2], valor: num(m[3]), detalhe: m3 ? m3 + " m³" : "" };
  }

  // ---------- cupom fiscal eletrônico (NFC-e) ----------
  function lerNFCe(paginas) {
    const ls = paginas.flatMap(p => linhas(p.itens));
    const txt = ls.join("\n");
    let emitente = "";
    const i = ls.findIndex(l => /CNPJ/i.test(l));
    if (i >= 0) {
      emitente = ls[i].replace(/^.*?CNPJ:?\s*[\d./-]+\s*/i, "").trim();
      const prox = ls[i + 1] || "";
      if (!emitente && prox) emitente = prox;
      else if (/^[A-ZÀ-Ú.& ]{1,12}$/.test(prox)) emitente += " " + prox;
    }
    const data = (txt.match(/NFC-?e[^\n]*?(\d{2}\/\d{2}\/\d{4})/i) || txt.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/) || [])[1];
    const total = num((txt.match(/Valor a pagar[^\d]{0,12}([\d.]+,\d{2})/i) || txt.match(/Valor total[^\d]{0,12}([\d.]+,\d{2})/i) || [])[1] || "NaN");
    const numero = (txt.match(/NFC-?e\s*n?[ºo°]?\s*(\d+)/i) || [])[1] || "";
    const fp = ls.findIndex(l => /FORMA DE PAGAMENTO/i.test(l));
    const forma = fp >= 0 ? ((ls[fp + 1] || "").match(/^(.*?)\s+[\d.]+,\d{2}$/) || [])[1] || "" : "";
    const itens = [];
    for (const l of ls) {
      const m = l.match(/^(\d{3,14})\s+(.+?)\s+\d+(?:,\d+)?\s+.*?([\d.]+,\d{2})$/);
      if (m) itens.push({ desc: m[2].trim(), valor: num(m[3]) });
    }
    if (!data || !isFinite(total)) throw new Error("Não encontrei a data ou o valor total no cupom.");
    const nome = emitente.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/\b(Sa|S\.a\.?|Ltda|Me|Eireli)\b\.?/gi, "").trim();
    return { tipo: "cupom", emitente: nome || "Cupom fiscal", data, venc: data, total, numero, forma: forma.trim(), itens };
  }

  // ---------- nota fiscal eletrônica (NF-e / DANFE) ----------
  function lerNFe(paginas) {
    const ls = paginas.flatMap(p => linhas(p.itens));
    const txt = ls.join("\n");
    let emitente = (txt.match(/Recebemos de\s+(.+?)\s+os produtos/i) || [])[1] || "";
    if (!emitente) { const i = ls.findIndex(l => /^DANFE$/.test(l)); emitente = i > 0 ? ls[i + 1] || "" : ""; }
    const data = (txt.match(/DATA D[AE] EMISS[ÃA]O[\s\S]{0,400}?(\d{2}\/\d{2}\/\d{4})/i) || [])[1];
    const iv = ls.findIndex(l => /VALOR TOTAL DA NOTA/i.test(l));
    const vals = iv >= 0 ? (ls[iv + 1] || "").match(/[\d.]+,\d{1,2}/g) : null;
    const total = vals ? num(vals[vals.length - 1]) : NaN;
    const numero = ((txt.match(/N[ºo°]\.?\s*([\d.]{5,})/) || [])[1] || "").replace(/\./g, "").replace(/^0+/, "");
    // produtos: a descrição pode quebrar em várias linhas antes/depois da linha com NCM e valores
    const ip = ls.findIndex(l => /DADOS DOS PRODUTOS/i.test(l));
    const itens = []; let pre = [];
    const limpa = t => t.replace(/^\S*\d\S*\s+/, "");   // tira o código do produto do começo da linha
    if (ip >= 0) for (const l of ls.slice(ip + 1, ip + 60)) {
      if (/DADOS ADICIONAIS|C[ÁA]LCULO DO ISSQN/i.test(l)) break;
      if (/^(C[ÓO]DIGO|PRODUTO|DESCRI[ÇC][ÃA]O)\b/i.test(l)) continue;
      const m = l.match(/^(.*?)\s+\d{8}\s+\d{3,4}\s+\d{4}\s+\S+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+([\d.]+,\d{2})/);
      if (m) { itens.push({ partes: pre.concat(limpa(m[1])), valor: num(m[2]) }); pre = []; }
      else pre.push(limpa(l));
    }
    if (itens.length && pre.length) itens[itens.length - 1].partes.push(...pre);
    for (const it of itens) {
      it.texto = it.partes.join(" ").replace(/\s+/g, " ").trim();
      it.desc = it.texto.replace(/\s*(INF\.?\s*CONTRIBUINTE|IMUNIDADE|INCISO|ISBN).*$/i, "").trim() || it.texto.slice(0, 40);
      delete it.partes;
    }
    if (!data || !isFinite(total)) throw new Error("Não encontrei a data de emissão ou o valor total da nota.");
    const nome = emitente.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/\b(Sa|S\.a\.?|Ltda|Me|Eireli)\b\.?/gi, "").replace(/\s+/g, " ").trim();
    return { tipo: "nfe", emitente: nome || "Nota fiscal", data, venc: data, total, numero, forma: "", itens };
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
    if (/Nota Fiscal de Consumidor|NFC-?e/i.test(txt) && /Valor (a pagar|total)/i.test(txt)) r = lerNFCe(paginas);
    else if (/DANFE/.test(txt) && /VALOR TOTAL DA NOTA/i.test(txt)) r = lerNFe(paginas);
    else if (/CEMIG/.test(txt) && /ENERGIA EL[ÉE]TRICA/i.test(txt)) r = lerCemig(paginas);
    else if (/COMPANHIA DE SANEAMENTO DE MG|COPASA/i.test(txt)) r = lerCopasa(paginas);
    else if (/SANTANDER/i.test(txt) && /Detalhamento da Fatura/i.test(txt)) r = lerSantander(paginas);
    else if (/Ita[úu]|ITAU UNIBANCO/i.test(txt) && /Lan[çc]amentos: compras e saques/.test(txt)) r = lerItau(paginas);
    else if (/BANCO INTER|bancointer|inter\.co/i.test(txt) && /Despesas da fatura/.test(txt)) r = lerInter(paginas);
    else throw new Error("Ainda não sei ler esse modelo de PDF. Hoje o app lê faturas Itaú, Santander e Inter, contas da Cemig e da Copasa, cupom fiscal eletrônico (NFC-e) e nota fiscal eletrônica (NF-e) em PDF.");
    if (!r.venc) throw new Error("Não encontrei a data de vencimento no PDF.");
    { const [d, m, a] = r.venc.split("/"); r.vencISO = `${a}-${m}-${d}`; }
    if (r.tipo === "conta") { r.chave = `${r.empresa} · ref. ${r.ref}`; return r; }
    if (r.tipo === "cupom") { r.chave = `NFC-e ${r.numero} · ${r.emitente}`; return r; }
    if (r.tipo === "nfe") { r.chave = `NF-e ${r.numero} · ${r.emitente}`; return r; }
    r.tipo = "cartao";
    for (const it of r.itens) it.dataCompra = it.ano ? `${it.ano}-${it.data.slice(3)}-${it.data.slice(0, 2)}` : it.data ? dataCompleta(it.data, r.venc) : null;
    marcarEstornos(r.itens);
    r.soma = Math.round(r.itens.reduce((a, i) => a + i.valor, 0) * 100) / 100;
    r.confere = isFinite(r.esperado) && Math.abs(r.soma - r.esperado) < 0.01;
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
    [/PIX CRED|CREDITO PESSOAL|EMPRESTIMO|EMPR[EÉ]STIMO/, "Dívidas", "Outros"],
    [/NETFLIX|DISNEY|PRIME ?VIDEO|AMAZON ?PRIME|GLOBOPLAY|MAX ?COM|HBO|DEEZER/, "Habitação", "Streaming (Prime, Netflix, Disney)"],
    [/SPOTIFY|APPLE ?COM|YOUTUBE|GOOGLE ?(STORAGE|ONE|PLAY)|AMAZON ?MUSIC/, "Lazer", "Spotify, música e outros"],
    [/ANTHROPIC|CLAUDE|OPENAI|CHATGPT|ABACUS|NELOGICA|TOP GAIN|HOTMART|HTM\*|UDEMY|ALURA|KIWIFY|INLAB|CURSO/, "Educação", "Cursos extracurriculares"],
    [/COLEGIO|ESCOLA|FACULDADE|UNIVERSIDADE/, "Educação", "Escola / faculdade"],
    [/LIVRAR|LIVRO|ISBN|EDITORA/, "Educação", "Livros"],
    [/DROGA|FARMA|DRUGSTORE|PACHECO|ARAUJO|PAGUE MENOS/, "Saúde", "Farmácia"],
    [/ODONTO|DENTIS/, "Saúde", "Dentista"],
    [/LABORAT|EXAME|DIAGNOST|IMAGEM|RADIOLOG/, "Saúde", "Exames e laboratório"],
    [/CLINICA|HOSPITAL|MEDIC|PSICOLOG|FISIOTER|FONOAUD|NUTRICION/, "Saúde", "Médicos e terapeutas"],
    [/POSTO|COMBUST|PETRO|JET ?FOX|SHELL|IPIRANGA|AUTO ?POSTO/, "Transporte", "Combustível"],
    [/LUBRIFIC|MECANIC|OFICINA|PNEU|AUTO ?PECAS/, "Transporte", "Mecânico / revisão"],
    [/PARK|ESTACION/, "Transporte", "Estacionamentos"],
    [/UBER|\b99\b|CABIFY/, "Transporte", "Apps de carro"],
    [/LAVA ?JATO|LAVAGEM/, "Transporte", "Lavagens"],
    [/SUPERMERC|MERCADO|ATACAD|SACOLAO|HORTI|SUPERBOX|EMPORIO|ACOUGUE|CARNES|PANIFIC|PADARIA|\bPAO\b|BISCOIT|ADEGA/, "Habitação", "Supermercado"],
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
