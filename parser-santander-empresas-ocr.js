// =============================================================================
// Parser nativo PDF OCR - Santander Empresas "Extrato Consolidado Inteligente"
// Expoe window.parsearPDF_Santander_EmpresasOCR
// =============================================================================
(function(){
  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('santander-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  }

  function removerAcentos(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function reconstruirLinhaEspacadaPDF(s) {
    const raw = String(s || '').replace(/\u00a0/g, ' ').trim();
    if (!raw) return raw;
    const tokens = raw.split(/\s+/);
    const curtos = tokens.filter(function(t) { return t.length === 1; }).length;
    if (tokens.length < 8 || curtos / tokens.length < 0.65) return raw;

    let joined = tokens.join('');
    joined = joined
      .replace(/^(Segunda|Terca|Terça|Quarta|Quinta|Sexta|Sabado|Sábado|Domingo),(\d{1,2})de(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)de(20\d{2})$/i, '$1, $2 de $3 de $4')
      .replace(/^(InternetBankingEmpresarial)$/i, 'Internet Banking Empresarial')
      .replace(/(CREDITO|DEBITO)R\$/ig, ' $1 R$ ')
      .replace(/R\$/g, 'R$ ')
      .replace(/\s+/g, ' ')
      .trim();
    return joined;
  }

  function limparLinhaOCR(s) {
    return removerAcentos(reconstruirLinhaEspacadaPDF(s))
      .replace(/[—–_]+/g, ' ')
      .replace(/[¢©]/g, 'C')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseValorBR(raw) {
    let s = String(raw || '').trim()
      .replace(/[Oo]/g, '0')
      .replace(/[lI|]/g, '1');
    const neg = /-$/.test(s) || /^-/.test(s);
    s = s.replace(/-/g, '').replace(/[^0-9,.]/g, '');
    if (!s) return 0;

    const ultimoSeparador = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (ultimoSeparador >= 0 && s.length - ultimoSeparador - 1 === 2) {
      s = s.slice(0, ultimoSeparador).replace(/[.,]/g, '') + '.' + s.slice(ultimoSeparador + 1);
    } else if (/^\d{3,}$/.test(s)) {
      s = s.slice(0, -2) + '.' + s.slice(-2);
    } else {
      s = s.replace(/[.,]/g, '');
    }

    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return neg ? -Math.abs(n) : n;
  }

  function normalizarValorToken(s) {
    return String(s || '').replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/=\s*(?=\d)/g, '-');
  }

  function extrairValores(linha) {
    const text = normalizarValorToken(linha);
    const re = /(?:^|\s)(-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?|\d{3,}-)(?=\s|$)/g;
    const valores = Array.from(text.matchAll(re))
      .map(function(m){ return { raw: m[1], index: m.index + (m[0].match(/^\s/) ? 1 : 0), valor: parseValorBR(m[1]) }; })
      .filter(function(v){ return Math.abs(v.valor) > 0; });
    if (!valores.length && /(resgate|aplicacao|contamax|resg poup)/i.test(text)) {
      const m = text.match(/(?:^|\s)(\d{3,6})(?=\s+0,00\b)/);
      if (m) valores.push({ raw: m[1], index: m.index + (m[0].match(/^\s/) ? 1 : 0), valor: parseValorBR(m[1]) });
    }
    return valores;
  }

  function separarValorSaldoGluedSantander(raw) {
    const s = normalizarValorToken(raw).trim();
    const glued = s.match(/^(-?\d{1,3}(?:\.\d{3})*|-?\d+),(\d{2})(-?\d+,\d{2})$/);
    if (glued) return glued[1] + ',' + glued[2];
    return s;
  }

  function extrairMovimentoSantander(restLinha) {
    const text = normalizarValorToken(restLinha || '');
    const valores = extrairValores(text);
    if (valores.length) {
      const direto = valores.find(function(v) {
        const digits = String(v.raw || '').replace(/\D/g, '').length;
        return digits <= 11 || /^-/.test(String(v.raw || ''));
      });
      if (direto) return direto;
    }

    const regras = [
      /(000000)(-?[\d.]+,\d{2}(?:-?\d+,\d{2})?)$/,
      /(\d{11,14})(\d{6})(-?[\d.]+,\d{2}(?:-?\d+,\d{2})?)$/,
      /-\d(\d{6})(-?[\d.]+,\d{2}(?:-?\d+,\d{2})?)$/,
      /(\d{6})(-?[\d.]+,\d{2}(?:-?\d+,\d{2})?)$/
    ];
    for (let i = 0; i < regras.length; i++) {
      const m = text.match(regras[i]);
      if (!m) continue;
      const rawTail = m[m.length - 1];
      const raw = separarValorSaldoGluedSantander(rawTail);
      const valor = parseValorBR(raw);
      if (Math.abs(valor) > 0) {
        return {
          raw: raw,
          index: m.index + m[0].length - rawTail.length,
          valor: valor
        };
      }
    }
    return null;
  }

  function tokenDataISO(token, ref) {
    const raw = String(token || '').replace(/\D/g, '');
    let dia = '', mes = '';
    let ano = ref.ano || String(new Date().getFullYear());
    if (/^\d{8}$/.test(raw)) {
      dia = raw.slice(0, 2);
      mes = raw.slice(2, 4);
      ano = raw.slice(4, 8);
    } else if (/^\d{4}$/.test(raw)) {
      dia = raw.slice(0, 2);
      mes = raw.slice(2, 4);
    } else if (/^\d{5}$/.test(raw)) {
      dia = raw.slice(0, 2);
      mes = raw.slice(-2);
    } else {
      const m = String(token || '').match(/^(\d{2})\/(\d{2})$/);
      if (m) { dia = m[1]; mes = m[2]; }
    }
    const d = Number(dia), mm = Number(mes);
    if (!d || !mm || d > 31 || mm > 12) return '';
    return ano + '-' + mes.padStart(2, '0') + '-' + dia.padStart(2, '0');
  }

  function dataNoInicio(linha, ref) {
    const m = String(linha || '').match(/^(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{2}|\d{4,8})/);
    if (!m) return null;
    const iso = tokenDataISO(m[1], ref);
    return iso ? { iso: iso, token: m[1], rest: linha.slice(m[0].length).trim() } : null;
  }

  function referenciaPeriodo(texto) {
    const meses = {
      janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
      julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
    };
    const clean = removerAcentos(texto).toLowerCase();
    const periodo = clean.match(/periodos?:\s*(\d{2})\/(\d{2})\/(20\d{2})\s+a\s+(\d{2})\/(\d{2})\/(20\d{2})/);
    if (periodo) {
      return {
        ano: periodo[3],
        mes: periodo[2],
        inicio: periodo[3] + '-' + periodo[2] + '-' + periodo[1],
        fim: periodo[6] + '-' + periodo[5] + '-' + periodo[4]
      };
    }
    const m = clean.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(20\d{2})\b/);
    if (!m) return { ano: String(new Date().getFullYear()), mes: '' };
    return { ano: m[2], mes: meses[m[1]] || '' };
  }

  function mesPtParaNumero(nome) {
    const meses = {
      janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04', maio: '05', junho: '06',
      julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
    };
    return meses[removerAcentos(nome || '').toLowerCase()] || '';
  }

  function periodoInternetBanking(texto) {
    const matches = Array.from(String(texto || '').matchAll(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})\b/gi));
    if (!matches.length) {
      const numericMatches = Array.from(String(texto || '').matchAll(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/g))
        .map(function(m) { return { ano: m[3], mes: m[2], iso: m[3] + '-' + m[2] + '-' + m[1] }; })
        .filter(function(d) { return Number(d.mes) >= 1 && Number(d.mes) <= 12; })
        .sort(function(a, b) { return a.iso.localeCompare(b.iso); });
      if (!numericMatches.length) return { ano: String(new Date().getFullYear()), mes: '', inicio: '', fim: '' };
      const primeiraNumeric = numericMatches[0];
      const ultimaNumeric = numericMatches[numericMatches.length - 1];
      return {
        ano: primeiraNumeric.ano,
        mes: primeiraNumeric.mes,
        inicio: primeiraNumeric.ano + '-' + primeiraNumeric.mes + '-01',
        fim: new Date(Number(primeiraNumeric.ano), Number(primeiraNumeric.mes), 0).toISOString().slice(0, 10),
        primeiraData: primeiraNumeric.iso,
        ultimaData: ultimaNumeric.iso
      };
    }
    const datas = matches.map(function(m) {
      const mes = mesPtParaNumero(m[2]);
      return {
        ano: m[3],
        mes: mes,
        iso: m[3] + '-' + mes + '-' + String(m[1]).padStart(2, '0')
      };
    }).filter(function(d) { return d.mes; }).sort(function(a, b) { return a.iso.localeCompare(b.iso); });
    if (!datas.length) return { ano: String(new Date().getFullYear()), mes: '', inicio: '', fim: '' };
    const primeira = datas[0];
    const ultima = datas[datas.length - 1];
    return {
      ano: primeira.ano,
      mes: primeira.mes,
      inicio: primeira.ano + '-' + primeira.mes + '-01',
      fim: new Date(Number(primeira.ano), Number(primeira.mes), 0).toISOString().slice(0, 10),
      primeiraData: primeira.iso,
      ultimaData: ultima.iso
    };
  }

  function extrairMeta(texto) {
    const clean = limparLinhaOCR(texto);
    const nome = (clean.match(/Resumo\s*-\s*[^\n]+\n?Nome\s+(.+?)\s+Agencia/i) || clean.match(/Nome\s+(.+?)\s+Agencia/i) || [])[1] || '';
    const cc = clean.match(/Agencia\s+Conta Corrente\s+(\d{3,5})\s+([0-9.,-]+)/i);
    return {
      agencia: cc ? cc[1] : '',
      conta: cc ? cc[2].replace(/[,.]/g, '') : '',
      titular: nome.replace(/\s+/g, ' ').trim()
    };
  }

  function tipoPorDescricao(desc, valorRaw) {
    const d = limparLinhaOCR(desc).toLowerCase();
    if (/-$/.test(String(valorRaw || ''))) return 'D';
    if (/compra|cartao deb|pix enviado|tarifa|pagamento|aplicacao|ted enviada|doc enviado|debito|fornecedor/.test(d)) return 'D';
    if (/resgate|resg poup|pix recebido|deposito|credito|recebido|transferencia recebida/.test(d)) return 'C';
    return 'C';
  }

  function limparDescricao(desc) {
    return limparLinhaOCR(desc)
      .replace(/\bPAGAMENTOCARTAODECREDITO\b/ig, 'PAGAMENTO CARTAO DE CREDITO')
      .replace(/\bPAGAMENTOCARTAODEDEBITO\b/ig, 'PAGAMENTO CARTAO DE DEBITO')
      .replace(/\bAPLICACAOCONTAMAX\b/ig, 'APLICACAO CONTAMAX')
      .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, ' ')
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, ' ')
      .replace(/\bN[ºo]\s*Documento\b/ig, '')
      .replace(/\bMovimentos\s*\(R\$\).*$/i, '')
      .replace(/\bPagina:\s*\d+\s*\/?\s*\d*\b/i, '')
      .replace(/\s+-\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pareceExtratoSantander(texto) {
    const t = removerAcentos(texto || '').toLowerCase();
    const temSantander = /santander/.test(t);
    const temInternet = /internet banking empresarial/.test(t) && /agencia:\s*\d+/.test(t) && /conta:\s*\d+/.test(t);
    const temConta = /conta corrente|saldo de conta corrente|saldo disponivel|extrato consolidado inteligente/.test(t) || temInternet;
    const temMov = /movimentacao|movimentos\s*\(r\$?\)|creditos\s+debitos|total de creditos|total de debitos|data\s*historico\s*documento\s*valor|credito\s*r\$|debito\s*r\$|\d{2}\/\d{2}\/20\d{2}\s+(pix|ted|compra|pagamento|resgate|resg|aplicacao|tarifa|transferencia)/.test(t);
    return temSantander && temConta && temMov;
  }

  function parsearTexto_SantanderInternetBanking(textoPorPagina) {
    const paginas = Array.isArray(textoPorPagina) ? textoPorPagina : String(textoPorPagina || '').split(/\f/);
    const textoCompleto = paginas.join('\n').split(/\r?\n/).map(limparLinhaOCR).join('\n');
    const t = removerAcentos(textoCompleto).toLowerCase();
    if (!/internet banking empresarial/.test(t) || !/agencia:\s*\d+/.test(t) || !/conta:\s*\d+/.test(t)) {
      return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    }

    const linhas = textoCompleto.split(/\r?\n/).map(limparLinhaOCR).filter(Boolean);
    const ref = periodoInternetBanking(textoCompleto);
    const metaLinha = linhas.find(function(l) { return /Agencia:\s*\d+\s+Conta:\s*\d+/i.test(l); }) || '';
    const meta = metaLinha.match(/(.+?)\s*Agencia:\s*(\d+)\s+Conta:\s*(\d+)/i);
    const titular = meta ? meta[1].trim() : '';
    const agencia = meta ? meta[2] : '';
    const conta = meta ? meta[3] : '';
    const lancamentos = [];
    const vistos = new Set();
    let currentDate = '';

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const dataExtenso = linha.match(/^(?:segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo),\s*(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})$/i);
      if (dataExtenso) {
        const mes = mesPtParaNumero(dataExtenso[2]);
        currentDate = dataExtenso[3] + '-' + mes + '-' + String(dataExtenso[1]).padStart(2, '0');
        continue;
      }
      if (!currentDate) continue;
      if (/^(Internet Banking Empresarial|Central de Atendimento|SAC |Ouvidoria|0800|4004|Pagina:|\d+)$/i.test(linha)) continue;

      const m = linha.match(/^(.+?)(CREDITO|DEBITO)\s*R\$\s*([\d.]+,\d{2})$/i);
      if (!m) continue;
      const descricao = limparDescricao(m[1]);
      const tipo = removerAcentos(m[2]).toUpperCase() === 'DEBITO' ? 'D' : 'C';
      const valorAbs = Math.abs(parseValorBR(m[3]));
      if (!descricao || !valorAbs) continue;
      const valor = tipo === 'D' ? -valorAbs : valorAbs;
      const chave = [currentDate, descricao.toLowerCase(), valor.toFixed(2), tipo].join('|');
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      lancamentos.push({
        id: uuid(),
        data: currentDate,
        descricao: descricao,
        documento: '',
        valor: valor,
        tipo: tipo,
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: descricao,
        incomum: false,
        origem: 'pdf-santander-internet-banking'
      });
    }

    return {
      detectado: lancamentos.length > 0,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: 'santander-internet-banking-' + (agencia || 'x') + '-' + (conta || 'x') + '-' + ref.ano + (ref.mes || ''),
      banco_detectado: 'SANTANDER',
      conta_detectada: (agencia ? 'AG-' + agencia : '') + (conta ? '/CC-' + conta : ''),
      nome_conta_detectado: titular || 'INTERNET BANKING EMPRESARIAL SANTANDER',
      periodo_inicio: ref.inicio,
      periodo_fim: ref.fim,
      total_credito: lancamentos.filter(function(l) { return l.valor > 0; }).reduce(function(a, l) { return a + l.valor; }, 0),
      total_debito: lancamentos.filter(function(l) { return l.valor < 0; }).reduce(function(a, l) { return a + Math.abs(l.valor); }, 0)
    };
  }

  function parsearTexto_SantanderEmpresas(textoPorPagina) {
    const paginas = Array.isArray(textoPorPagina) ? textoPorPagina : String(textoPorPagina || '').split(/\f/);
    const textoCompleto = paginas.join('\n').split(/\r?\n/).map(limparLinhaOCR).join('\n');
    if (!pareceExtratoSantander(textoCompleto)) return { detectado: false, lancamentos: [], textoCompleto: textoCompleto };
    const internet = parsearTexto_SantanderInternetBanking(paginas);
    if (internet.detectado && internet.lancamentos.length) return internet;

    const isInternetBanking = /internet banking empresarial/i.test(textoCompleto)
      && /agencia:\s*\d+/i.test(textoCompleto)
      && /conta:\s*\d+/i.test(textoCompleto)
      && !/extrato consolidado inteligente/i.test(textoCompleto);
    const isInternetBankingOCRNumerico = isInternetBanking && !/Data\s*Historico\s*Documento\s*Valor|DataHistoricoDocumentoValor/i.test(textoCompleto);
    const ref = isInternetBankingOCRNumerico ? periodoInternetBanking(textoCompleto) : referenciaPeriodo(textoCompleto);
    const lancamentos = [];
    const vistos = new Set();
    let inMov = false;
    let aguardandoMovimentacao = false;
    let stopMov = false;
    let currentDate = '';

    const linhas = textoCompleto
      .split(/\r?\n/)
      .map(limparLinhaOCR)
      .filter(Boolean);

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (isInternetBankingOCRNumerico && (/^Saldo disponivel para uso:/i.test(linha) || /^Opcao de Pesquisa:/i.test(linha) || /^OpeCao de Pesquisa:/i.test(linha))) {
        inMov = true;
        stopMov = false;
        continue;
      }
      if (/^Conta Corrente$/i.test(linha)) {
        aguardandoMovimentacao = true;
        continue;
      }
      if (/^Movimentacao$/i.test(linha) && (aguardandoMovimentacao || /extrato consolidado inteligente/i.test(textoCompleto) || lancamentos.length)) {
        inMov = true;
        stopMov = false;
        aguardandoMovimentacao = false;
        continue;
      }
      if (/^Data\s*Historico\s*Documento\s*Valor/i.test(linha)) {
        inMov = true;
        stopMov = false;
        aguardandoMovimentacao = false;
        continue;
      }
      if (!inMov || stopMov) continue;
      if (/^Movimentacao$/i.test(linha) || /^Data\s+Descricao/i.test(linha) || /^Creditos\s+Debitos/i.test(linha)) continue;
      if (isInternetBankingOCRNumerico && /^Saldo em Investimentos com Resgate Automatico/i.test(linha)) {
        stopMov = true;
        continue;
      }
      if (/^(Saldos por Periodo|Compras com Cartao|Comprovantes de Pagamento|Transferencias entre Contas|Quer avancar|Fale Conosco|a = Bloqueio|b = Bloqueado|p = Lancamento|SaldoValor|Central de Atendimento)/i.test(linha)) {
        stopMov = true;
        continue;
      }
      if (/^SALDO EM/i.test(linha)) {
        if (/SALDO EM\s+\d{2}\/\d{2}/i.test(linha) && lancamentos.length) stopMov = true;
        continue;
      }

      const data = dataNoInicio(linha, ref);
      if (data) currentDate = data.iso;
      const restLinha = data ? data.rest : linha;
      if (!currentDate) continue;
      if (ref.fim && currentDate > ref.fim) continue;
      const mov = extrairMovimentoSantander(restLinha);
      if (!mov) continue;

      let descBase = restLinha.slice(0, mov.index).replace(/\d{4,12}\s*$/, '').trim();
      const extras = [];
      for (let j = i + 1; j < Math.min(i + 4, linhas.length); j++) {
        const prox = linhas[j];
        if (/^(Saldos por Periodo|Compras com Cartao|Comprovantes de Pagamento|Transferencias entre Contas|SALDO EM)/i.test(prox)) break;
        const proxData = dataNoInicio(prox, ref);
        const proxValores = extrairMovimentoSantander(proxData ? proxData.rest : prox);
        if (proxData && proxValores) break;
        if (/(Santander Empresas|EXTRATO CONSOLIDADO)|^(janeiro\/|fevereiro\/|marco\/|abril\/|maio\/|junho\/|julho\/|agosto\/|setembro\/|outubro\/|novembro\/|dezembro\/|Data Descricao|Creditos Debitos|Pagina:)/i.test(prox)) continue;
        if (!proxValores && !/^Pagina:/i.test(prox)) {
          extras.push((proxData ? proxData.rest : prox).replace(/^\d{2}\/\d{2}\s+/, '').trim());
        }
      }
      let descricao = limparDescricao([descBase].concat(extras).filter(Boolean).join(' - '));
      if (!descricao || /^-+$/.test(descricao)) descricao = 'Lancamento Santander';

      const tipo = (isInternetBankingOCRNumerico && /^-/.test(String(mov.raw || ''))) ? 'D' : tipoPorDescricao(descricao, mov.raw);
      const valor = tipo === 'D' ? -Math.abs(mov.valor) : Math.abs(mov.valor);
      if (!valor) continue;

      const chave = [currentDate, descricao.toLowerCase(), Math.abs(valor).toFixed(2), tipo].join('|');
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      lancamentos.push({
        id: uuid(),
        data: currentDate,
        descricao: descricao,
        documento: '',
        valor: valor,
        tipo: tipo,
        empresa: '',
        cnpj: '',
        categoria: 'Nao categorizado',
        contaDebito: '',
        contaCredito: '',
        historico: descricao,
        incomum: false,
        origem: isInternetBankingOCRNumerico ? 'pdf-santander-internet-banking' : 'pdf-santander-empresas-ocr'
      });
    }

    const meta = extrairMeta(textoCompleto);
    const metaInternet = isInternetBankingOCRNumerico ? ((textoCompleto.match(/(.+?)\s*Agencia:\s*(\d+)\s+Conta:\s*(\d+)/i) || [])) : [];
    return {
      detectado: true,
      lancamentos: lancamentos,
      textoCompleto: textoCompleto,
      fingerprint: (isInternetBankingOCRNumerico ? 'santander-internet-banking-ocr-' : 'santander-empresas-ocr-') + (meta.agencia || metaInternet[2] || 'x') + '-' + (meta.conta || metaInternet[3] || 'x') + '-' + ref.ano + (ref.mes || ''),
      banco_detectado: 'SANTANDER',
      conta_detectada: ((meta.agencia || metaInternet[2]) ? 'AG-' + (meta.agencia || metaInternet[2]) : '') + ((meta.conta || metaInternet[3]) ? '/CC-' + (meta.conta || metaInternet[3]) : ''),
      nome_conta_detectado: meta.titular || (metaInternet[1] ? metaInternet[1].trim() : '') || (isInternetBankingOCRNumerico ? 'INTERNET BANKING EMPRESARIAL SANTANDER' : 'CONTA CORRENTE SANTANDER'),
      periodo_inicio: ref.inicio || (ref.mes ? (ref.ano + '-' + ref.mes + '-01') : ''),
      periodo_fim: ref.fim || (ref.mes ? new Date(Number(ref.ano), Number(ref.mes), 0).toISOString().slice(0, 10) : '')
    };
  }

  async function extrairTextoPorPaginaComOCR(pdf) {
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js nao carregado para OCR');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const textos = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      if (typeof showToast === 'function') showToast('OCR Santander pagina ' + i + '/' + pdf.numPages + '...', 'success');
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.8 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const result = await Tesseract.recognize(canvas, 'por', {
        tessedit_pageseg_mode: '6',
        logger: m => console.log('[santander-ocr]', m.status, m.progress)
      });
      textos.push(result.data && result.data.text ? result.data.text : '');
    }
    return textos;
  }

  async function parsearPDF_Santander_EmpresasOCR(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textosPdf = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      textosPdf.push(textoNativoComLinhas(tc.items || []));
    }
    const textoNativo = textosPdf.join('\n');
    if (textoNativo.trim().length > 120 && pareceExtratoSantander(textoNativo)) {
      const nativo = parsearTexto_SantanderEmpresas(textosPdf);
      if (nativo && nativo.detectado && (nativo.lancamentos || []).length) return nativo;
      console.warn('[santander] texto nativo reconheceu Santander, mas nao extraiu lancamentos; tentando OCR');
    }

    const textosOCR = await extrairTextoPorPaginaComOCR(pdf);
    return parsearTexto_SantanderEmpresas(textosOCR);
  }

  async function parsearPDF_Santander_InternetBanking(arrayBuffer) {
    const resultado = await parsearPDF_Santander_EmpresasOCR(arrayBuffer);
    if (resultado && resultado.detectado && (resultado.lancamentos || []).some(function(l) { return l.origem === 'pdf-santander-internet-banking'; })) {
      return resultado;
    }
    return { detectado: false, lancamentos: [], textoCompleto: resultado && resultado.textoCompleto || '' };
  }

  function textoNativoComLinhas(items) {
    const linhas = [];
    (items || []).forEach(function(it) {
      const str = String((it && it.str) || '').trim();
      if (!str) return;
      const tr = it.transform || [];
      const x = Number(tr[4] || 0);
      const y = Number(tr[5] || 0);
      let linha = linhas.find(function(l) { return Math.abs(l.y - y) < 3; });
      if (!linha) {
        linha = { y: y, itens: [] };
        linhas.push(linha);
      }
      linha.itens.push({ x: x, str: str });
    });
    return linhas
      .sort(function(a, b) { return b.y - a.y; })
      .map(function(l) {
        return l.itens
          .sort(function(a, b) { return a.x - b.x; })
          .map(function(i) { return i.str; })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      })
      .filter(Boolean)
      .join('\n');
  }

  const api = {
    parsearPDF_Santander_EmpresasOCR: parsearPDF_Santander_EmpresasOCR,
    parsearPDF_Santander_InternetBanking: parsearPDF_Santander_InternetBanking,
    __test__: {
      parsearTexto_SantanderEmpresas: parsearTexto_SantanderEmpresas,
      parsearTexto_SantanderInternetBanking: parsearTexto_SantanderInternetBanking,
      pareceExtratoSantander: pareceExtratoSantander,
      extrairMovimentoSantander: extrairMovimentoSantander,
      separarValorSaldoGluedSantander: separarValorSaldoGluedSantander,
      limparDescricao: limparDescricao,
      periodoInternetBanking: periodoInternetBanking,
      referenciaPeriodo: referenciaPeriodo
    }
  };

  if (typeof window !== 'undefined') {
    window.parsearTexto_SantanderEmpresas = parsearTexto_SantanderEmpresas;
    window.parsearTexto_SantanderInternetBanking = parsearTexto_SantanderInternetBanking;
    window.parsearPDF_Santander_InternetBanking = parsearPDF_Santander_InternetBanking;
    window.parsearPDF_Santander_EmpresasOCR = parsearPDF_Santander_EmpresasOCR;
    console.log('[parser-santander-empresas-ocr] carregado');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
