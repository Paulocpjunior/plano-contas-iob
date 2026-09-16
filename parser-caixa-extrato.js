// =============================================================================
// Parser nativo PDF - Caixa Economica Federal "Extrato por periodo"
// Expoe window.parsearPDF_Caixa_Extrato
// =============================================================================
(function() {
  function parseValorBR(s) {
    if (!s) return 0;
    const cleaned = String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDataBR(s) {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'caixa-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizarHistoricoCaixa(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function historicoCaixaPorDescricao(descricao, tipo) {
    const d = normalizarHistoricoCaixa(descricao);
    const regras = [
      { re: /\b(DEB IOF|IOF)\b/, hist: 'IOF' },
      { re: /\b(DEB JUROS|JUROS)\b/, hist: 'JUROS' },
      { re: /\b(D TAR|TARIFA|TAR)\b/, hist: 'TARIFA BANCARIA' },
      { re: /\b(ENVIO TED|CRED TED|TED)\b/, hist: 'TED' },
      { re: /\b(PIX)\b/, hist: 'PIX' },
      { re: /\b(PAG FORNEC|DEB PAG|PAGAMENTO|PAG)\b/, hist: 'PAGAMENTO' },
      { re: /\b(DEP DIN|DEPOSITO|DEP)\b/, hist: 'DEPOSITO' },
      { re: /\b(CRED REMUN|REND|REMUN)\b/, hist: 'RENDIMENTOS' },
      { re: /\b(PREMIOSEG|SEGURO)\b/, hist: 'SEGURO' },
      { re: /\b(COMPRA)\b/, hist: 'COMPRA' },
      { re: /\b(TRANSDEB|TRANSF|TRANSFERENCIA)\b/, hist: 'TRANSFERENCIA' },
      { re: /\b(MP TS|TS MKP|MKP)\b/, hist: 'MARKETPLACE' },
      { re: /\b(AZCX|CR COM EXT)\b/, hist: 'CARTAO/LOTERICA' },
      { re: /\b(PREST EMP)\b/, hist: 'EMPRESTIMO' }
    ];
    const regra = regras.find(function(r) { return r.re.test(d); });
    if (regra) return regra.hist;
    return d.slice(0, 40) || (tipo === 'C' ? 'CREDITO CAIXA' : 'DEBITO CAIXA');
  }

  function extrairPeriodoCaixa(texto) {
    const anoMes = String(texto || '').match(/M[eê]s:\s*([A-Za-zÀ-ÿ]+)\/(\d{4})/i);
    const periodo = String(texto || '').match(/Per[ií]odo:\s*(\d{1,2})\s*-\s*(\d{1,2})/i);
    const meses = {
      janeiro: '01', fevereiro: '02', marco: '03', abril: '04',
      maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
      outubro: '10', novembro: '11', dezembro: '12'
    };
    if (!anoMes) return { inicio: '', fim: '' };
    const chave = normalizarHistoricoCaixa(anoMes[1]).toLowerCase().replace(/[^a-z]/g, '');
    const mes = meses[chave] || '';
    const ano = anoMes[2];
    if (!mes) return { inicio: '', fim: '' };
    const diaIni = periodo ? String(periodo[1]).padStart(2, '0') : '01';
    const diaFim = periodo ? String(periodo[2]).padStart(2, '0') : new Date(Number(ano), Number(mes), 0).getDate();
    return { inicio: ano + '-' + mes + '-' + diaIni, fim: ano + '-' + mes + '-' + diaFim };
  }

  function extrairContaCaixa(texto) {
    const m = String(texto || '').match(/Conta:\s*([0-9|.\-\s]+)/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }

  function extrairNomeClienteCaixa(texto) {
    const m = String(texto || '').match(/Cliente:\s*([^\n\r]+)/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }

  function parseLinhaCaixa(raw) {
    const line = String(raw || '').replace(/\s+/g, ' ').trim();
    const m = line.match(/^(\d{2}\/\d{2}\/\d{4})\s*(\d{6})\s*(.*?)([\d.]+,\d{2})\s*([CD])\s*([\d.]+,\d{2})\s*([CD])$/);
    if (!m) return null;

    const descricao = m[3].trim();
    if (!descricao || /^SALDO\s+(ANTERIOR|DIA)$/i.test(descricao)) return null;

    const tipo = m[5] === 'D' ? 'D' : 'C';
    const valorAbs = Math.abs(parseValorBR(m[4]));
    if (!valorAbs) return null;

    const saldoAbs = Math.abs(parseValorBR(m[6]));
    return {
      data: parseDataBR(m[1]),
      documento: m[2],
      descricao: descricao,
      valor: tipo === 'D' ? -valorAbs : valorAbs,
      tipo: tipo,
      saldo: m[7] === 'D' ? -saldoAbs : saldoAbs
    };
  }

  function parsearTextoCaixaExtrato(textoCompleto) {
    const texto = String(textoCompleto || '');
    const periodo = extrairPeriodoCaixa(texto);
    const conta = extrairContaCaixa(texto);
    const cliente = extrairNomeClienteCaixa(texto);
    const lancamentos = [];

    texto.split(/\r?\n/).forEach(function(linha) {
      const parsed = parseLinhaCaixa(linha);
      if (!parsed) return;
      const historico = historicoCaixaPorDescricao(parsed.descricao, parsed.tipo);
      lancamentos.push({
        id: uuid(),
        data: parsed.data,
        descricao: parsed.descricao,
        documento: parsed.documento,
        valor: parsed.valor,
        tipo: parsed.tipo,
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: historico,
        codigoHistorico: '',
        incomum: false,
        origem: 'pdf-caixa-extrato',
        saldo: parsed.saldo
      });
    });

    const cabecalhoCaixa = /CA\.?IXA|Gerenciador\.caixa|SIIBC|Extrato por per[ií]odo/i.test(texto);
    const gradeCaixa = /Data\s*Mov\.?\s*Nr\.?\s*Doc\.?\s*Hist[oó]rico\s*Valor\s*Saldo/i.test(texto);
    const estruturaCaixa = /\bCliente:/i.test(texto) && /\bConta:/i.test(texto) && /\bM[eê]s:/i.test(texto);
    const ehCaixa = (cabecalhoCaixa || gradeCaixa || estruturaCaixa) && lancamentos.length >= 3;

    if (!ehCaixa) {
      return { detectado: false, lancamentos: [], textoCompleto: texto };
    }

    const totalCredito = lancamentos
      .filter(function(l) { return l.valor > 0; })
      .reduce(function(acc, l) { return acc + l.valor; }, 0);
    const totalDebito = lancamentos
      .filter(function(l) { return l.valor < 0; })
      .reduce(function(acc, l) { return acc + Math.abs(l.valor); }, 0);

    return {
      detectado: lancamentos.length > 0,
      lancamentos: lancamentos,
      textoCompleto: texto,
      fingerprint: 'caixa-extrato-periodo-textual-v1',
      banco_detectado: 'CAIXA ECONOMICA FEDERAL',
      conta_detectada: conta,
      nome_conta_detectado: cliente || 'CONTA CORRENTE CAIXA',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      total_credito: Number(totalCredito.toFixed(2)),
      total_debito: Number(totalDebito.toFixed(2)),
      saldo_final: lancamentos.length ? lancamentos[lancamentos.length - 1].saldo : 0
    };
  }

  // Variante com Data/Data Efetiva e historicos multilinha: a posicao define
  // cada coluna, pois a ordem textual mistura valor, sinal e saldo.
  function parsearPaginasCaixaModerno(paginas) {
    const texto = paginas.flat().map(i => i.str).join('');
    const compacto = texto.replace(/\s+/g, '');
    if (!/Saldoanterioraoper[ií]odosolicitado/i.test(compacto) || !/DataEfetiva/i.test(compacto) || !/CAIXA/i.test(texto)) return { detectado: false, lancamentos: [] };
    const periodo = compacto.match(/Extratonoper[ií]odode(\d{2}\/\d{2}\/\d{4})[àa](\d{2}\/\d{2}\/\d{4})/i);
    const inicial = compacto.match(/Saldoanterioraoper[ií]odosolicitadoR\$([\d.]+,\d{2})([CD])/i);
    if (!periodo || !periodo[1] || !inicial) throw new Error('CAIXA: periodo ou saldo inicial ilegivel.');
    const centavos = s => Math.round(parseValorBR(s) * 100);
    let saldoCent = centavos(inicial[1]) * (inicial[2] === 'D' ? -1 : 1);
    const saldoInicial = saldoCent / 100;
    const lancamentos = [];
    for (const itens of paginas) {
      const cab = nome => itens.find(i => i.str.trim() === nome);
      const docCab = cab('Documento'), histCab = cab('Histórico'), valorCab = cab('Valor'), saldoCab = cab('Saldo');
      if (!docCab || !histCab || !valorCab || !saldoCab) throw new Error('CAIXA: colunas nao reconhecidas.');
      const dx=docCab.transform[4], hx=histCab.transform[4], vx=valorCab.transform[4], sx=saldoCab.transform[4];
      const limiteValor = hx + (vx-hx)*0.75, limiteSaldo = (vx+sx)/2;
      const juntar = arr => arr.sort((a,b) => Math.abs(a.transform[5]-b.transform[5])>2 ? b.transform[5]-a.transform[5] : a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      const docs = itens.filter(i => Math.abs(i.transform[4]-dx)<3 && /^\d{6}$/.test(i.str.trim())).sort((a,b)=>b.transform[5]-a.transform[5]);
      const datasPagina = itens.filter(i => i.transform[4]<dx-10 && /^\d{2}\/\d{2}\/\d{4}$/.test(i.str.trim()));
      const saldosDia = itens.filter(i => /^SALDO DIA$/.test(i.str.trim()));
      if (datasPagina.length !== docs.length + saldosDia.length) throw new Error('CAIXA: quantidade de movimentos incompleta.');
      for (const doc of docs) {
        const y = doc.transform[5];
        const faixa = itens.filter(i => Math.abs(i.transform[5]-y)<22);
        const dataItem = faixa.find(i => i.transform[4]<dx-10 && /^\d{2}\/\d{2}\/\d{4}$/.test(i.str.trim()) && Math.abs(i.transform[5]-y)<9);
        const descricao = juntar(faixa.filter(i=>i.transform[4]>=hx-2 && i.transform[4]<limiteValor));
        const valorRaw = juntar(faixa.filter(i=>i.transform[4]>=limiteValor && i.transform[4]<limiteSaldo)).replace(/\s/g,'');
        const saldoRaw = juntar(faixa.filter(i=>i.transform[4]>=limiteSaldo)).replace(/\s/g,'');
        const valorMatch = valorRaw.match(/^(-?)R\$([\d.]+,\d{2})$/), saldoMatch=saldoRaw.match(/^R\$([\d.]+,\d{2})([CD])$/);
        if (!dataItem || !descricao || !valorMatch || !saldoMatch) throw new Error('CAIXA: movimento incompleto no documento '+doc.str+'.');
        const valorCent = centavos(valorMatch[2]) * (valorMatch[1] ? -1 : 1);
        const proximoSaldo = centavos(saldoMatch[1]) * (saldoMatch[2]==='D'?-1:1);
        if (saldoCent + valorCent !== proximoSaldo) throw new Error('CAIXA: movimento diverge do saldo no documento '+doc.str+'.');
        saldoCent=proximoSaldo;
        const tipo=valorCent<0?'D':'C';
        lancamentos.push({id:uuid(),data:parseDataBR(dataItem.str.trim()),documento:doc.str.trim(),descricao,valor:valorCent/100,tipo,saldo:saldoCent/100,historico:historicoCaixaPorDescricao(descricao,tipo),contaDebito:'',contaCredito:'',codigoHistorico:'',categoria:'Nao categorizado',incomum:false,origem:'pdf-caixa-extrato'});
      }
    }
    if (!lancamentos.length) throw new Error('CAIXA: nenhum movimento reconhecido.');
    const inicio=parseDataBR(periodo[1]), fim=parseDataBR(periodo[2]);
    const datas=lancamentos.map(l=>l.data).sort();
    const conta = paginas.flat().map(i => i.str).join(' ').match(/Ag[eê]ncia:\s*(\d+)\s*Conta:\s*([\d-]+)/i);
    return {detectado:true,lancamentos,textoCompleto:texto,fingerprint:'caixa-extrato-multilinha-v1',banco_detectado:'104',cnpj_detectado:(texto.match(/CNPJ:\s*([\d./-]+)/i)||[])[1]||'',conta_detectada:conta?'AG-'+conta[1]+'/CC-'+conta[2]:'',nome_conta_detectado:conta?'AG-'+conta[1]+'/CC-'+conta[2]:'CAIXA',periodo_inicio:inicio<datas[0]?inicio:datas[0],periodo_fim:fim>datas[datas.length-1]?fim:datas[datas.length-1],periodo_solicitado_inicio:inicio,periodo_solicitado_fim:fim,saldo_inicial:saldoInicial,saldo_final:saldoCent/100,total_credito:lancamentos.reduce((s,l)=>s+Math.max(Math.round(l.valor*100),0),0)/100,total_debito:lancamentos.reduce((s,l)=>s+Math.max(-Math.round(l.valor*100),0),0)/100};
  }

  async function parsearPDF_Caixa_Extrato(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = '';
    const paginas = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      paginas.push(tc.items);
      const byY = {};
      tc.items.forEach(function(it) {
        const y = Math.round(it.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x: Math.round(it.transform[4]), s: it.str });
      });
      Object.keys(byY).map(Number).sort(function(a, b) { return b - a; }).forEach(function(y) {
        const line = byY[y]
          .sort(function(a, b) { return a.x - b.x; })
          .map(function(i) { return i.s; })
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) textoCompleto += line + '\n';
      });
    }

    const moderno = parsearPaginasCaixaModerno(paginas);
    return moderno.detectado ? moderno : parsearTextoCaixaExtrato(textoCompleto);
  }

  const api = {
    parsearPDF_Caixa_Extrato: parsearPDF_Caixa_Extrato,
    __test__: {
      parsearPaginasCaixaModerno,
      parseValorBR: parseValorBR,
      parseDataBR: parseDataBR,
      parseLinhaCaixa: parseLinhaCaixa,
      historicoCaixaPorDescricao: historicoCaixaPorDescricao,
      parsearTextoCaixaExtrato: parsearTextoCaixaExtrato
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearPDF_Caixa_Extrato = parsearPDF_Caixa_Extrato;
    console.log('[parser-caixa-extrato] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
