// =============================================================================
// Parser nativo PDF - Banco do Brasil "Cliente - Conta atual"
// Detecta pelo cabecalho G<16digitos> + "Cliente - Conta atual"
// Expoe window.parsearPDF_BB_ContaAtual
// =============================================================================
(function(){

  function extrairMeta(texto) {
    const agM = texto.match(/Ag[eê]ncia\s+([0-9]+-[0-9X])/i);
    const ccM = texto.match(/Conta\s+corrente\s+([0-9]+-[0-9X])\s*([A-Z0-9 .&\-]+?)(?:\r?\n|Per[ií]odo)/i);
    const perM = texto.match(/Per[ií]odo\s+do\s+extrato\s+([0-9]{2}\s*\/\s*[0-9]{4})/i);
    return {
      agencia: agM ? agM[1] : '',
      conta: ccM ? ccM[1] : '',
      titular: ccM ? ccM[2].trim() : '',
      periodo: perM ? perM[1].replace(/\s+/g,'') : ''
    };
  }

  function parseValorBR(s) {
    if (!s) return 0;
    const n = parseFloat(String(s).trim().replace(/\./g,'').replace(',','.'));
    return isNaN(n) ? 0 : n;
  }

  function extrairCNPJ(txt) {
    const m = String(txt||'').match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (m) return m[0];
    const m2 = String(txt||'').match(/(\d{14})(?=\s|$)/);
    if (m2) {
      const c = m2[1];
      return c.slice(0,2)+'.'+c.slice(2,5)+'.'+c.slice(5,8)+'/'+c.slice(8,12)+'-'+c.slice(12,14);
    }
    return '';
  }

  async function parsearPDF_BB_ContaAtual(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let textoCompleto = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const linhas = {};
      tc.items.forEach(it => {
        const y = Math.round(it.transform[5]);
        if (!linhas[y]) linhas[y] = [];
        linhas[y].push({ x: it.transform[4], s: it.str });
      });
      const ys = Object.keys(linhas).map(Number).sort((a,b) => b - a);
      ys.forEach(y => {
        const linha = linhas[y].sort((a,b) => a.x - b.x).map(o => o.s).join(' ').replace(/\s+/g,' ').trim();
        if (linha) textoCompleto += linha + '\n';
      });
    }

    // Deteccao: header G<16digitos> + "Cliente - Conta atual" + colunas do BB
    const ehBB = /G\d{16}/.test(textoCompleto)
              && /Cliente\s*-\s*Conta\s*atual/i.test(textoCompleto)
              && /Dt\.?\s*balancete/i.test(textoCompleto)
              && /Hist[oó]rico/i.test(textoCompleto);

    if (!ehBB) {
      return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    }

    const meta = extrairMeta(textoCompleto);
    const linhas = textoCompleto.split(/\r?\n/);

    // Regex principal: linhas de lancamento
    // Ex: "02/01/2026 0000 14175 976 TED-Credito em Conta 33.934.603 430,00 C"
    const reLanc = /^(\d{2}\/\d{2}\/\d{4})\s+(?:\d{4}\s+)?(\d{3,6})\s+(\d{3})\s+(.+?)\s+([\d.]+)?\s*([\d.]+,\d{2})\s*([CD])\s*(?:[\d.,]+\s*[CD])?\s*$/;

    const lancamentos = [];
    const IGNORAR = /^(Saldo\s+Anterior|S\s*A\s*L\s*D\s*O|BB\s+RF\s+CP\s+Empresa\s+[AÁ]gil|Tar\.\s*agrupadas)/i;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      if (!linha || linha.length < 20) continue;

      const m = linha.match(reLanc);
      if (!m) continue;

      const dataBR = m[1];
      const loteHist = m[4].trim();
      const valor = parseValorBR(m[6]);
      const tipo = m[7]; // C ou D

      if (IGNORAR.test(loteHist)) continue;
      if (valor === 0) continue;

      // Descricao complementar: proximas 1-2 linhas se nao forem novo lancamento
      let descExtra = [];
      for (let k = 1; k <= 2 && (i+k) < linhas.length; k++) {
        const prox = linhas[i+k].trim();
        if (!prox) break;
        if (reLanc.test(prox)) break;
        if (/^\d{2}\/\d{2}\/\d{4}/.test(prox)) break;
        if (IGNORAR.test(prox)) break;
        descExtra.push(prox);
      }

      const extras = descExtra.join(' ').replace(/\s+/g,' ').trim();
      const cnpj = extrairCNPJ(loteHist + ' ' + extras);

      // Monta historico rico: tipo-operacao + fornecedor + CNPJ
      const histLimpo = loteHist.replace(/\s+\d{9,}\s*$/,'').trim();
      let descricao = histLimpo;
      if (extras) descricao += ' - ' + extras.replace(cnpj, '').replace(/\s+-\s+$/,'').trim();
      if (cnpj && !descricao.includes(cnpj)) descricao += ' - CNPJ ' + cnpj;
      descricao = descricao.replace(/\s{2,}/g,' ').replace(/\s+-\s+-\s+/g,' - ').trim();

      // Data ISO
      const [dd, mm, yyyy] = dataBR.split('/');
      const dataISO = yyyy + '-' + mm + '-' + dd;

      lancamentos.push({
        data: dataISO,
        descricao: descricao,
        valor: tipo === 'D' ? -Math.abs(valor) : Math.abs(valor),
        tipo: tipo === 'D' ? 'D' : 'C',
        cnpj: cnpj
      });
    }

    const fingerprint = 'bb-conta-atual-' + (meta.agencia || 'x') + '-' + (meta.conta || 'x') + '-' + (meta.periodo || 'x');

    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: fingerprint,
      banco_detectado: 'BB',
      conta_detectada: (meta.agencia ? 'AG-' + meta.agencia : '') + (meta.conta ? '/CC-' + meta.conta : ''),
      nome_conta_detectado: meta.titular || 'CONTA CORRENTE BB'
    };
  }

  window.parsearPDF_BB_ContaAtual = parsearPDF_BB_ContaAtual;
  console.log('[parser-bb-conta-atual] carregado');
})();
