const crypto = require('crypto');
const XLSX = require('xlsx');

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseValor(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  let s = String(valor).trim();
  if (!s || /^-+$/.test(s)) return 0;
  const negativo = /^\s*-/.test(s) || /\((.*?)\)/.test(s);
  s = s.replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    const ultimoSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    const inteiro = s.slice(0, ultimoSep).replace(/[^\d]/g, '');
    const decimal = s.slice(ultimoSep + 1).replace(/[^\d]/g, '').slice(0, 2);
    s = inteiro + '.' + decimal.padEnd(2, '0');
  } else if (temVirgula) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = s.split('.');
    if (partes.length > 2) s = partes.slice(0, -1).join('') + '.' + partes[partes.length - 1];
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negativo && n > 0 ? -n : n;
}

function parseData(valor) {
  if (!valor && valor !== 0) return '';
  if (typeof valor === 'number' && valor > 25000) {
    const data = XLSX.SSF.parse_date_code(valor);
    if (data && data.y && data.m && data.d) {
      return `${data.y}-${String(data.m).padStart(2, '0')}-${String(data.d).padStart(2, '0')}`;
    }
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

function detectarSeparador(linha) {
  const candidatos = [';', ',', '\t', '|'];
  let melhor = ';';
  let score = 0;
  for (const sep of candidatos) {
    const atual = splitCsvLine(linha, sep).length;
    if (atual > score) {
      score = atual;
      melhor = sep;
    }
  }
  return melhor;
}

function splitCsvLine(linha, sep) {
  const out = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const ch = linha[i];
    const prox = linha[i + 1];
    if (ch === '"' && aspas && prox === '"') {
      atual += '"';
      i += 1;
    } else if (ch === '"') {
      aspas = !aspas;
    } else if (ch === sep && !aspas) {
      out.push(atual.trim());
      atual = '';
    } else {
      atual += ch;
    }
  }
  out.push(atual.trim());
  return out.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
}

function parseCsv(texto) {
  const linhas = String(texto || '').split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return [];
  const sep = detectarSeparador(linhas[0]);
  return linhas.map(l => splitCsvLine(l, sep));
}

function rowsFromXlsxBase64(base64) {
  const workbook = XLSX.read(Buffer.from(String(base64 || ''), 'base64'), { type: 'buffer', cellDates: false });
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
    rows.push(...sheetRows);
  }
  return rows;
}

function localizarHeader(rows) {
  let melhor = { idx: -1, score: 0, headers: [] };
  rows.forEach((row, idx) => {
    const headers = row.map(normalizarTexto);
    const joined = headers.join('|');
    const score =
      (/(date|data|transaction_date|data_da_transacao)/.test(joined) ? 2 : 0) +
      (/(description|descricao|operacao|detalhe)/.test(joined) ? 2 : 0) +
      (/(amount|valor|transaction_amount|settlement_net_amount|net_amount)/.test(joined) ? 2 : 0) +
      (/(fee|tarifa|custo)/.test(joined) ? 1 : 0);
    if (score > melhor.score) melhor = { idx, score, headers };
  });
  return melhor.score >= 4 ? melhor : { idx: -1, score: 0, headers: [] };
}

function idx(headers, nomes) {
  for (const nome of nomes) {
    const i = headers.indexOf(nome);
    if (i >= 0) return i;
  }
  return -1;
}

function primeiro(row, indices) {
  for (const i of indices) {
    if (i >= 0 && row[i] !== undefined && String(row[i]).trim() !== '') return row[i];
  }
  return '';
}

function parsearMercadoPagoRows(rows, options = {}) {
  const header = localizarHeader(rows);
  if (header.idx < 0) throw new Error('Relatorio Mercado Pago sem cabecalho reconhecido');
  const headers = header.headers;
  const iData = idx(headers, ['transaction_date', 'date', 'data', 'data_da_transacao', 'data_de_liberacao', 'release_date']);
  const iDesc = idx(headers, ['description', 'descricao', 'detail', 'detalhe', 'operation', 'operacao', 'transaction_type']);
  const iTipo = idx(headers, ['transaction_type', 'tipo', 'tipo_de_transacao', 'operation_type']);
  const iRef = idx(headers, ['source_id', 'external_reference', 'referencia_externa', 'payment_id', 'id']);
  const iBruto = idx(headers, ['transaction_amount', 'gross_amount', 'valor_bruto', 'valor', 'amount']);
  const iLiquido = idx(headers, ['settlement_net_amount', 'net_amount', 'valor_liquido', 'liquido']);
  const iFee = idx(headers, ['fee_amount', 'mercadopago_fee', 'tarifa', 'custo', 'taxa']);
  const usarLiquido = options.baseValor !== 'bruto_com_taxa';
  const importacaoId = options.importacaoId || `mp_${Date.now()}`;
  const lancamentos = [];

  rows.slice(header.idx + 1).forEach((row, rowIndex) => {
    const data = parseData(row[iData]);
    const bruto = parseValor(row[iBruto]);
    const liquido = parseValor(row[iLiquido]);
    const taxa = Math.abs(parseValor(row[iFee]));
    const valorPrincipal = usarLiquido && liquido !== 0 ? liquido : bruto;
    if (!data || valorPrincipal === 0) return;
    const tipo = String(row[iTipo] || '').trim();
    const ref = String(primeiro(row, [iRef]) || '').trim();
    const descBase = String(row[iDesc] || tipo || 'Mercado Pago').trim();
    const descricao = [descBase, tipo && tipo !== descBase ? tipo : '', ref ? `ID ${ref}` : '']
      .filter(Boolean)
      .join(' - ')
      .replace(/\s+/g, ' ')
      .trim();
    lancamentos.push({
      id: crypto.randomUUID(),
      data,
      descricao,
      valor: valorPrincipal,
      empresa: '',
      cnpj: '',
      categoria: 'Mercado Pago',
      contaDebito: '',
      contaCredito: '',
      historico: '',
      incomum: false,
      origem: 'mercado_pago',
      banco: 'MP',
      bancoNome: 'Mercado Pago',
      importacaoId,
      layoutNome: 'MERCADO_PAGO_ACCOUNT_MONEY',
      linhaOrigem: header.idx + rowIndex + 2
    });
    if (!usarLiquido && taxa > 0) {
      lancamentos.push({
        id: crypto.randomUUID(),
        data,
        descricao: `Tarifa Mercado Pago - ${descricao}`,
        valor: -taxa,
        empresa: '',
        cnpj: '',
        categoria: 'Tarifas Mercado Pago',
        contaDebito: '',
        contaCredito: '',
        historico: '',
        incomum: false,
        origem: 'mercado_pago_taxa',
        banco: 'MP',
        bancoNome: 'Mercado Pago',
        importacaoId,
        layoutNome: 'MERCADO_PAGO_ACCOUNT_MONEY',
        linhaOrigem: header.idx + rowIndex + 2
      });
    }
  });
  return lancamentos;
}

function parsearRelatorioMercadoPago(payload = {}) {
  const importacaoId = payload.importacaoId || `mp_${Date.now()}`;
  let rows = [];
  if (payload.xlsxBase64) {
    rows = rowsFromXlsxBase64(payload.xlsxBase64);
  } else if (payload.csv || payload.texto) {
    rows = parseCsv(payload.csv || payload.texto);
  } else {
    throw new Error('Envie csv, texto ou xlsxBase64 do relatorio Mercado Pago');
  }
  const lancamentos = parsearMercadoPagoRows(rows, {
    baseValor: payload.baseValor || 'liquido',
    importacaoId
  });
  const totalCredito = lancamentos.filter(l => l.valor > 0).reduce((a, l) => a + l.valor, 0);
  const totalDebito = lancamentos.filter(l => l.valor < 0).reduce((a, l) => a + Math.abs(l.valor), 0);
  return {
    ok: true,
    importacaoId,
    layout: 'MERCADO_PAGO_ACCOUNT_MONEY',
    baseValor: payload.baseValor || 'liquido',
    total: lancamentos.length,
    totalCredito,
    totalDebito,
    lancamentos
  };
}

function getMpEnv() {
  return {
    clientId: process.env.MERCADO_PAGO_CLIENT_ID || process.env.MP_CLIENT_ID || '',
    clientSecret: process.env.MERCADO_PAGO_CLIENT_SECRET || process.env.MP_CLIENT_SECRET || '',
    redirectUri: process.env.MERCADO_PAGO_REDIRECT_URI || process.env.MP_REDIRECT_URI || '',
    accountReportUrl: process.env.MERCADO_PAGO_ACCOUNT_REPORT_URL || 'https://api.mercadopago.com/v1/account/settlement_report',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || ''
  };
}

function registrarRotasPublicasMercadoPago(app, { db }) {
  app.get('/mercadopago/oauth/callback', async (req, res) => {
    const { code, state } = req.query || {};
    const env = getMpEnv();
    try {
      if (!code || !state) return res.status(400).send('Codigo ou state ausente.');
      if (!env.clientId || !env.clientSecret || !env.redirectUri) {
        return res.status(503).send('Credenciais Mercado Pago nao configuradas no servidor.');
      }
      const stateDoc = await db.collection('mercadopago_oauth_states').doc(String(state)).get();
      if (!stateDoc.exists) return res.status(400).send('State invalido ou expirado.');
      const stateData = stateDoc.data() || {};
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code: String(code),
        redirect_uri: env.redirectUri
      });
      const tokenResp = await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const tokenJson = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok) throw new Error(tokenJson.message || tokenJson.error || 'Falha ao obter token Mercado Pago');
      const cnpj = somenteDigitos(stateData.cnpj);
      await db.collection('mercadopago_integracoes').doc(cnpj).set({
        cnpj,
        user_id: tokenJson.user_id || '',
        public_key: tokenJson.public_key || '',
        access_token: tokenJson.access_token || '',
        refresh_token: tokenJson.refresh_token || '',
        token_type: tokenJson.token_type || 'Bearer',
        expires_in: tokenJson.expires_in || null,
        scope: tokenJson.scope || '',
        conectado_em: new Date(),
        atualizado_em: new Date(),
        conectado_por_uid: stateData.uid || '',
        conectado_por_email: stateData.email || ''
      }, { merge: true });
      await db.collection('mercadopago_oauth_states').doc(String(state)).delete().catch(() => {});
      res.send('<!doctype html><meta charset="utf-8"><title>Mercado Pago conectado</title><body style="font-family:Arial;padding:32px"><h2>Mercado Pago conectado com sucesso.</h2><p>Voce ja pode voltar ao Consultor Contabil.</p></body>');
    } catch (err) {
      console.error('[mercadopago/oauth/callback]', err);
      res.status(500).send('Erro ao conectar Mercado Pago: ' + err.message);
    }
  });
}

function registrarRotasMercadoPago(app, { db, adminRequired }) {
  app.get('/api/empresas/:cnpj/mercadopago/status', async (req, res) => {
    const cnpj = somenteDigitos(req.params.cnpj);
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const env = getMpEnv();
    const doc = await db.collection('mercadopago_integracoes').doc(cnpj).get();
    const dados = doc.exists ? doc.data() || {} : {};
    res.json({
      ok: true,
      conectado: doc.exists && !!dados.access_token,
      cnpj,
      user_id: dados.user_id || '',
      conectado_em: dados.conectado_em || null,
      atualizado_em: dados.atualizado_em || null,
      oauth_configurado: !!(env.clientId && env.clientSecret && env.redirectUri),
      relatorio_automatico_configurado: !!(env.clientId && env.clientSecret && env.redirectUri && env.accountReportUrl),
      relatorio_endpoint_padrao: !process.env.MERCADO_PAGO_ACCOUNT_REPORT_URL
    });
  });

  app.post('/api/empresas/:cnpj/mercadopago/oauth-url', adminRequired, async (req, res) => {
    const cnpj = somenteDigitos(req.params.cnpj);
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const env = getMpEnv();
    if (!env.clientId || !env.redirectUri) {
      return res.status(503).json({ erro: 'Configure MERCADO_PAGO_CLIENT_ID e MERCADO_PAGO_REDIRECT_URI no servidor.' });
    }
    const state = crypto.randomBytes(24).toString('hex');
    await db.collection('mercadopago_oauth_states').doc(state).set({
      cnpj,
      uid: req.user && req.user.uid,
      email: req.user && req.user.email,
      criado_em: new Date()
    });
    const url = new URL('https://auth.mercadopago.com.br/authorization');
    url.searchParams.set('client_id', env.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('platform_id', 'mp');
    url.searchParams.set('redirect_uri', env.redirectUri);
    url.searchParams.set('state', state);
    res.json({ ok: true, auth_url: url.toString(), state });
  });

  app.post('/api/empresas/:cnpj/mercadopago/preview-report', async (req, res) => {
    try {
      const cnpj = somenteDigitos(req.params.cnpj);
      if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
      const resultado = parsearRelatorioMercadoPago(Object.assign({}, req.body || {}, {
        importacaoId: (req.body && req.body.importacaoId) || `mp_${cnpj}_${Date.now()}`
      }));
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  });

  app.post('/api/empresas/:cnpj/mercadopago/solicitar-relatorio', adminRequired, async (req, res) => {
    const cnpj = somenteDigitos(req.params.cnpj);
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const env = getMpEnv();
    if (!env.clientId || !env.clientSecret || !env.redirectUri || !env.accountReportUrl) {
      return res.status(501).json({
        erro: 'Relatorio automatico Mercado Pago ainda sem OAuth configurado.',
        detalhe: 'Configure MERCADO_PAGO_CLIENT_ID, MERCADO_PAGO_CLIENT_SECRET e MERCADO_PAGO_REDIRECT_URI no servidor.'
      });
    }
    const doc = await db.collection('mercadopago_integracoes').doc(cnpj).get();
    const dados = doc.exists ? doc.data() || {} : {};
    if (!dados.access_token) return res.status(409).json({ erro: 'Empresa sem Mercado Pago conectado.' });
    try {
      const r = await fetch(env.accountReportUrl, {
        method: 'POST',
        headers: {
          Authorization: `${dados.token_type || 'Bearer'} ${dados.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body || {})
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ erro: json.message || json.error || 'Falha Mercado Pago', detalhe: json });
      res.json({ ok: true, resposta: json });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  });
}

module.exports = {
  parsearRelatorioMercadoPago,
  parsearMercadoPagoRows,
  registrarRotasMercadoPago,
  registrarRotasPublicasMercadoPago,
  normalizarTexto,
  parseValor
};
