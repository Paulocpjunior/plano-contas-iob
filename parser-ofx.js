// =============================================================================
// Parser OFX compartilhado - extratos bancarios
// Mantem saldos fora da importacao e preserva historico por MEMO/NAME.
// =============================================================================
(function(root) {
  function parseValorOFX(valor) {
    let s = String(valor || '').trim();
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function decodificarEntidadesOFX(texto) {
    return String(texto || '')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function limparTextoOFX(texto) {
    return decodificarEntidadesOFX(texto)
      .replace(/\uFFFD/g, 'Í')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizarBusca(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tagOFX(bloco, nome) {
    const reFechada = new RegExp('<' + nome + '>([\\s\\S]*?)<\\/' + nome + '>', 'i');
    const fechada = String(bloco || '').match(reFechada);
    if (fechada) return limparTextoOFX(fechada[1]);

    const reSgml = new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i');
    const sgml = String(bloco || '').match(reSgml);
    return sgml ? limparTextoOFX(sgml[1]) : '';
  }

  function descricaoEhSaldoOFX(descricao) {
    const d = normalizarBusca(descricao);
    if (!d) return false;
    if (/\b(COBRANCA|COBRANCAO|COBRANÇA|IOF|I\s*O\s*F|JUROS|TARIFA|ENCARGO)\b/.test(d)) {
      return false;
    }
    return /^SALDO(\s|$)/.test(d)
      || /^BALANCE(\s|$)/.test(d)
      || /\bSALDO\s+(ANTERIOR|INICIAL|DO\s+DIA|TOTAL|FINAL|DISPONIVEL|DISPONIVEL\s+DIA|BLOQUEADO)\b/.test(d)
      || /\bSALDO\s+TOTAL\s+DISPONIVEL\s+DIA\b/.test(d);
  }

  function historicoOFXPorDescricao(descricao, tipo) {
    const d = normalizarBusca(descricao);
    if (!d) return tipo === 'C' ? 'CREDITO' : 'DEBITO';
    const regras = [
      { re: /\b(PIX|QRCODE|QR CODE)\b/, hist: 'PIX' },
      { re: /\b(BOLETO|TITULO|CONVENIO)\b/, hist: 'BOLETO' },
      { re: /\b(SISPAG|SALARIO|FOLHA)\b/, hist: 'FOLH' },
      { re: /\b(GIRO|PRONAMPE|EMPRESTIMO|AMORTIZACAO|AMORTIZACAO)\b/, hist: 'EMPR' },
      { re: /\b(TED|DOC|TRANSFERENCIA|TRANSF)\b/, hist: 'TRAN' },
      { re: /\b(RENDIMENTO|RENDIMENTOS|REND)\b/, hist: 'VLR.' },
      { re: /\b(TARIFA|IOF|JUROS|ENCARGO)\b/, hist: 'TARI' },
      { re: /\b(COBRANCA|COBRANÇA)\b/, hist: 'COBR' },
      { re: /\b(DEPOSITO|DEPOS|DEP)\b/, hist: 'DEPO' },
      { re: /\b(PAGAMENTO|PAGAR)\b/, hist: 'PAGA' },
      { re: /\b(ESTORNO)\b/, hist: 'ESTO' },
      { re: /\b(APLICACAO|APLIC)\b/, hist: 'APLI' },
      { re: /\b(RESGATE|RESG)\b/, hist: 'RESG' }
    ];
    const achada = regras.find(function(r) { return r.re.test(d); });
    if (achada) return achada.hist;
    return d.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4) || (tipo === 'C' ? 'CRED' : 'DEBI');
  }

  function juntarDescricoesOFX(partes) {
    const vistas = new Set();
    const saida = [];
    partes.forEach(function(parte) {
      const texto = limparTextoOFX(parte);
      if (!texto) return;
      const chave = normalizarBusca(texto);
      if (vistas.has(chave)) return;
      vistas.add(chave);
      saida.push(texto);
    });
    return saida.join(' - ').replace(/\s+-\s+$/g, '').trim();
  }

  function uuidOFX(bloco, indice) {
    if (root && root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    const fitid = tagOFX(bloco, 'FITID') || String(indice + 1);
    return 'ofx-' + fitid.replace(/[^A-Za-z0-9_-]/g, '') + '-' + indice;
  }

  function parseOFXText(texto) {
    const entries = [];
    const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
    let m;
    let idx = 0;
    while ((m = re.exec(String(texto || ''))) !== null) {
      const b = m[1];
      const dt = tagOFX(b, 'DTPOSTED');
      const val = parseValorOFX(tagOFX(b, 'TRNAMT'));
      const memo = tagOFX(b, 'MEMO');
      const name = tagOFX(b, 'NAME');
      const trntype = tagOFX(b, 'TRNTYPE');
      const fitid = tagOFX(b, 'FITID');
      const checknum = tagOFX(b, 'CHECKNUM');
      const descricao = juntarDescricoesOFX([name, memo, trntype && !memo && !name ? trntype : '']);

      if (!dt || !Number.isFinite(val) || val === 0) {
        idx += 1;
        continue;
      }
      if (descricaoEhSaldoOFX(descricao)) {
        idx += 1;
        continue;
      }

      const tipo = val < 0 ? 'D' : 'C';
      const descFinal = descricao || ('Lancamento OFX ' + (fitid || checknum || idx + 1));
      entries.push({
        id: uuidOFX(b, idx),
        data: dt.slice(0, 4) + '-' + dt.slice(4, 6) + '-' + dt.slice(6, 8),
        descricao: descFinal,
        descricao_memoria: descFinal,
        memoriaDescricoes: [descFinal, memo, name].filter(Boolean),
        documento: fitid || checknum || '',
        valor: val,
        tipo: tipo,
        empresa: '',
        cnpj: '',
        categoria: 'Não categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: historicoOFXPorDescricao(descFinal, tipo),
        incomum: false,
        origem: 'ofx'
      });
      idx += 1;
    }
    return entries;
  }

  const api = {
    parseOFXText: parseOFXText,
    parseValorOFX: parseValorOFX,
    descricaoEhSaldoOFX: descricaoEhSaldoOFX,
    historicoOFXPorDescricao: historicoOFXPorDescricao,
    __test__: {
      tagOFX: tagOFX,
      limparTextoOFX: limparTextoOFX,
      normalizarBusca: normalizarBusca
    }
  };

  if (typeof root !== 'undefined') {
    root.SP_ParseOFX = api;
    if (root.console && root.console.log) root.console.log('[parser-ofx] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
