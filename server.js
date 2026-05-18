const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const admin = require('firebase-admin');
const path = require('path');
const { LAYOUTS_BANCARIOS_PADRAO, normalizarBancoLayout, layoutBancoId } = require('./layouts-bancarios-padrao');
const { LAYOUT_QUALITY_CASES } = require('./layout-quality-cases');
const { LAYOUT_QUALITY_EVIDENCE } = require('./layout-quality-evidence');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8080;
const db = new Firestore();
const firestorePorProjeto = new Map();
admin.initializeApp({ projectId: 'projetos-app-sp' });
const adminAuth = admin.auth();
const DOMAIN = '@spassessoriacontabil.com.br';

app.use(express.json({ limit: '50mb' }));

// === Endpoint de versao (consumido pelo frontend para detectar atualizacoes) ===
const VERSION_FILE_PATH = require('path').join(__dirname, 'version.json');
let CACHED_VERSION = null;
let CACHED_VERSION_MTIME = 0;

function lerVersao() {
    const fs = require('fs');
    try {
        const stat = fs.statSync(VERSION_FILE_PATH);
        if (stat.mtimeMs !== CACHED_VERSION_MTIME) {
            CACHED_VERSION = JSON.parse(fs.readFileSync(VERSION_FILE_PATH, 'utf-8'));
            CACHED_VERSION_MTIME = stat.mtimeMs;
        }
        return CACHED_VERSION;
    } catch (e) {
        console.error('[version] erro ao ler version.json:', e.message);
        return { version: '0.0.0', build_date: null, release_notes: [] };
    }
}

app.get('/api/version', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(lerVersao());
});


app.get('/api/health', async (req, res) => {
  try {
    const test = await db.collection('planos').limit(1).get();
    res.json({ status: 'ok', versao: lerVersao().version || 'dev', firestore: 'connected', planos_existem: test.size > 0 });
  } catch (err) { res.status(500).json({ status: 'erro', erro: err.message }); }
});

async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Token ausente. Faca login no app.' });
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email || !decoded.email.endsWith(DOMAIN)) return res.status(403).json({ erro: 'Dominio nao autorizado' });
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    req.user = { uid: decoded.uid, email: decoded.email, is_admin: userDoc.exists && userDoc.data().is_admin === true };
    next();
  } catch (err) { return res.status(401).json({ erro: 'Token invalido', detalhe: err.message }); }
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ erro: 'Requer admin' });
  next();
}

app.use('/api', authRequired);

function chaveLayoutQualidade(banco, parser) {
  return normalizarBancoLayout(banco) + '_' + String(parser || '').trim();
}

function avaliarAprovacaoLayoutBanco(banco, parser) {
  const chave = chaveLayoutQualidade(banco, parser);
  const casosAprovados = (LAYOUT_QUALITY_CASES || []).filter(c => {
    return chaveLayoutQualidade(c.banco, c.parser) === chave && String(c.status || '').toLowerCase() === 'aprovado';
  });
  const evidenciasAprovadas = (LAYOUT_QUALITY_EVIDENCE || []).filter(e => {
    const etapa = String(e.etapa || '').toLowerCase();
    const status = String(e.status || '').toLowerCase();
    return chaveLayoutQualidade(e.banco, e.parser) === chave && (etapa === 'regressao_aprovada' || status.includes('regressao aprovada'));
  });
  return {
    apto: casosAprovados.length > 0 && evidenciasAprovadas.length > 0,
    casos_aprovados: casosAprovados.length,
    evidencias_aprovadas: evidenciasAprovadas.length,
    motivo: casosAprovados.length > 0 && evidenciasAprovadas.length > 0
      ? 'Layout possui caso aprovado e evidencia de regressao.'
      : 'Para aprovar, o layout precisa ter caso aprovado e evidencia de regressao cadastrados.'
  };
}

async function garantirLayoutsBancariosPadrao() {
  const col = db.collection('layouts_bancarios');
  const layoutsObsoletos = [
    'CLU_parsearArquivoTextoCludeItauCSV'
  ];
  await Promise.all(LAYOUTS_BANCARIOS_PADRAO.map(async layout => {
    const id = layoutBancoId(layout);
    const ref = col.doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        ...layout,
        ativo: true,
        origem: 'padrao_sistema',
        homologacao_status: layout.homologacao_status || 'em_teste',
        homologacao_observacao: layout.homologacao_observacao || '',
        criado_em: new Date(),
        atualizado_em: new Date()
      });
    } else {
      const atual = doc.data() || {};
      await ref.set({
        ...layout,
        ...atual,
        banco: layout.banco,
        nomeBanco: layout.nomeBanco,
        nome: layout.nome,
        parser: layout.parser,
        formato: layout.formato,
        confiabilidade: layout.confiabilidade,
        status: layout.status || atual.status || 'Ativo',
        ativo: atual.ativo !== false,
        ultimoTeste: atual.ultimoTeste || layout.ultimoTeste,
        observacao: layout.observacao || atual.observacao || '',
        homologacao_status: atual.homologacao_status || layout.homologacao_status || 'em_teste',
        homologacao_observacao: atual.homologacao_observacao || layout.homologacao_observacao || '',
        homologado_em: atual.homologado_em || null,
        homologado_por_email: atual.homologado_por_email || '',
        origem: atual.origem || 'padrao_sistema',
        atualizado_em: new Date()
      }, { merge: true });
    }
  }));
  await Promise.all(layoutsObsoletos.map(async id => {
    const ref = col.doc(id);
    const doc = await ref.get();
    if (doc.exists) {
      await ref.set({
        ativo: false,
        status: 'Inativo',
        substituido_por: 'CLU_parsearArquivoXLSXCludeItau',
        observacao: 'Layout obsoleto substituido pelo parser XLSX CLUDE Itau oficial.',
        atualizado_em: new Date()
      }, { merge: true });
    }
  }));
}

// ============================================================================
//  FOLHA DE PAGAMENTO IOB — Fase 1 — endpoints
//  Colar logo após `app.use('/api', authRequired);` (linha 41 do server.js)
//  Tudo dentro de /api/ herda o middleware authRequired automaticamente.
// ============================================================================

const pdfParse = require('pdf-parse');
const multer = require('multer');
const cryptoFolha = require('crypto');

const uploadFolha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const _parseValor = s => !s ? 0 : parseFloat(String(s).replace(/\./g, '').replace(',', '.'));

const _valorAposAncora = (linhas, ancoraRegex, posicao = 1, janela = 30) => {
  const idx = linhas.findIndex(l => ancoraRegex.test(l));
  if (idx === -1) return null;
  const valorRe = /^[\d.,]+$/;
  let achados = 0;
  for (let i = idx + 1; i < Math.min(idx + 1 + janela, linhas.length); i++) {
    const l = linhas[i].trim();
    if (valorRe.test(l) && /\d/.test(l)) {
      achados++;
      if (achados === posicao) return _parseValor(l);
    }
  }
  return null;
};

async function parseResumoIOB(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  const texto = data.text;
  const linhas = texto.split('\n').map(l => l.trim());

  if (!/R\s*e\s*s\s*u\s*m\s*o\s+G\s*e\s*r\s*a\s*l/i.test(texto)) {
    throw new Error('PDF não parece ser um Resumo Geral IOB');
  }

  const empresa = (texto.match(/Empresa\s*:\s*(.+)/) || [])[1]?.trim();
  const cnpj = (texto.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*CNPJ/) || [])[1];
  const periodoMatch = texto.match(/(\d{2}\/\d{2}\/\d{4})\s*\n?\s*a\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  const competencia = periodoMatch ? `${periodoMatch[1].slice(3, 5)}/${periodoMatch[1].slice(6, 10)}` : null;
  const dataLancamento = periodoMatch ? periodoMatch[2] : null;

  const valorReGlobal = /(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;
  const codigoIni = /^(\d{3})/;

  function extrairRubrica(linha) {
    const matchCodigo = linha.match(codigoIni);
    if (!matchCodigo) return null;
    const matches = [...linha.matchAll(valorReGlobal)];
    if (matches.length < 4) return null;

    let candidatos = matches.slice(-4);
    let [vAtivos, vDemitidos, vAfastados, vTotal] = candidatos.map(m => _parseValor(m[0]));
    const avisos = [];

    if (Math.abs((vAtivos + vDemitidos + vAfastados) - vTotal) > 0.01) {
      const valStr = candidatos[0][0];
      let consertou = false;
      for (let i = 1; i < valStr.length - 4; i++) {
        const tentativa = _parseValor(valStr.slice(i));
        if (!isNaN(tentativa) && Math.abs(tentativa + vDemitidos + vAfastados - vTotal) < 0.01) {
          vAtivos = tentativa;
          consertou = true;
          avisos.push(`detalhamento_corrigido (original=${valStr})`);
          break;
        }
      }
      if (!consertou) avisos.push('detalhamento_inconsistente');
    }

    const idxValorAtivos = matches[matches.length - 4].index;
    return {
      codigo: matchCodigo[1],
      nome: linha.slice(3, idxValorAtivos).trim(),
      valor_ativos: vAtivos, valor_demitidos: vDemitidos,
      valor_afastados: vAfastados, valor_total: vTotal,
      ...(avisos.length ? { avisos } : {}),
    };
  }

  const rubricas = [];
  let secao = null;
  for (const linha of linhas) {
    if (/^ADICIONAIS\s*\/\s*DESCONTOS/i.test(linha) || /Valores pagos aos Funcion/i.test(linha)) { secao = 'ADICIONAIS'; continue; }
    if (/^TOTAL DE ADICIONAIS/i.test(linha)) { secao = 'DESCONTOS'; continue; }
    if (/^TOTAL DE DESCONTOS/i.test(linha) || /^TOTAL L[ÍI]QUIDO/i.test(linha)) { secao = null; continue; }
    if (!secao) continue;
    const r = extrairRubrica(linha);
    if (r && r.valor_total > 0) {
      r.tipo = secao === 'ADICIONAIS' ? 'PROVENTO' : 'DESCONTO';
      rubricas.push(r);
    }
  }

  const encargos = {
    fgts_mensal:        _valorAposAncora(linhas, /^FGTS Mensal:$/, 1),
    multa_fgts:         _valorAposAncora(linhas, /^FGTS Mensal:$/, 2),
    fgts_13:            _valorAposAncora(linhas, /^FGTS Mensal:$/, 3),
    base_pis_folha:     _valorAposAncora(linhas, /^Base PIS Folha:$/, 1),
    pis_folha:          _valorAposAncora(linhas, /^Base PIS Folha:$/, 2),
    base_irrf:          _valorAposAncora(linhas, /^Base PIS Folha:$/, 3),
    valor_irrf:         _valorAposAncora(linhas, /^Base PIS Folha:$/, 4),
    inss_empregados:    _valorAposAncora(linhas, /^Empregados\/Avulsos:$/, 1),
    inss_empresa:       _valorAposAncora(linhas, /^Empregados\/Avulsos:$/, 2),
    inss_terceiros:     _valorAposAncora(linhas, /^Empregados\/Avulsos:$/, 3),
    salario_maternidade:_valorAposAncora(linhas, /^Empregados\/Avulsos:$/, 4),
    salario_familia:    _valorAposAncora(linhas, /^Contribuintes Individuais:$/, 2),
  };
  const ratMatch = texto.match(/RAT Emp\s*\(RAT x FAP\s*=\s*([\d,]+)\s*%\)/);
  encargos.rat_aliquota = ratMatch ? _parseValor(ratMatch[1]) : null;

  return {
    empresa, cnpj, competencia, data_lancamento: dataLancamento,
    rubricas, encargos_patronais: encargos,
    totais: { liquido_pagar: _parseValor((texto.match(/TOTAL L[ÍI]QUIDO A PAGAR\s*([\d.,]+)/) || [])[1]) },
    raw_text_hash: cryptoFolha.createHash('sha256').update(texto).digest('hex').slice(0, 16),
  };
}

// POST /api/folha/parse-resumo  (auth herdada de app.use('/api', authRequired))
app.post('/api/folha/parse-resumo', uploadFolha.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'arquivo PDF não enviado (campo "pdf")' });
    const resultado = await parseResumoIOB(req.file.buffer);
    res.json(resultado);
  } catch (err) {
    console.error('parse-resumo erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/folha/registrar-importacao
app.post('/api/folha/registrar-importacao', async (req, res) => {
  try {
    const { cnpj, competencia, raw_text_hash, total_lancamentos, total_valor } = req.body;
    if (!cnpj || !competencia || !raw_text_hash) {
      return res.status(400).json({ erro: 'campos obrigatórios: cnpj, competencia, raw_text_hash' });
    }
    const docRef = await db.collection('folha_importacoes').add({
      owner_uid: req.user.uid,
      cnpj, competencia, raw_text_hash,
      total_lancamentos: total_lancamentos || 0,
      total_valor: total_valor || 0,
      criado_em: new Date(),
    });
    res.json({ id: docRef.id });
  } catch (err) {
    console.error('registrar-importacao erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/folha/empresas-do-plano/:planoId
app.get('/api/folha/empresas-do-plano/:planoId', async (req, res) => {
  try {
    const { planoId } = req.params;
    if (!planoId) return res.status(400).json({ erro: 'planoId obrigatório' });
    const snap = await db.collection('empresas')
      .where('plano_id', '==', planoId)
      .where('ativo', '==', true)
      .get();
    const empresas = snap.docs.map(d => {
      const data = d.data();
      const cnpjLimpo = d.id;
      const cnpjFmt = cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      return {
        cnpj: cnpjLimpo,
        cnpj_formatado: cnpjFmt,
        razao_social: data.razao_social || null,
        numero_filial_iob: data.numero_filial_iob || null,
      };
    });
    res.json({ planoId, empresas });
  } catch (err) {
    console.error('empresas-do-plano erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/folha/mapeamento/:cnpj
app.get('/api/folha/mapeamento/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido' });
    const snap = await db.collection('folha_mapeamentos')
      .where('cnpj', '==', cnpjLimpo).limit(1).get();
    if (snap.empty) return res.json({ encontrado: false });
    const doc = snap.docs[0];
    res.json({ encontrado: true, id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('get mapeamento erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/folha/mapeamento/:cnpj
app.put('/api/folha/mapeamento/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido' });
    const { regras, encargos, origem_padrao, numero_filial } = req.body;
    const snap = await db.collection('folha_mapeamentos')
      .where('cnpj', '==', cnpjLimpo).limit(1).get();
    const dados = {
      cnpj: cnpjLimpo,
      owner_uid: req.user.uid,
      regras: regras || {},
      encargos: encargos || {},
      origem_padrao: origem_padrao || '',
      numero_filial: numero_filial || '',
      atualizado_em: new Date(),
      atualizado_por_email: req.user.email,
    };
    if (snap.empty) {
      const ref = await db.collection('folha_mapeamentos').add({ ...dados, criado_em: new Date() });
      return res.status(201).json({ id: ref.id, ...dados });
    }
    const ref = db.collection('folha_mapeamentos').doc(snap.docs[0].id);
    await ref.set(dados, { merge: true });
    res.json({ id: ref.id, ...dados });
  } catch (err) {
    console.error('put mapeamento erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/folha/checar-duplicidade
app.get('/api/folha/checar-duplicidade', async (req, res) => {
  try {
    const { cnpj, competencia, hash } = req.query;
    if (!cnpj || !competencia) return res.status(400).json({ erro: 'cnpj e competencia obrigatórios' });
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    const snap = await db.collection('folha_importacoes')
      .where('cnpj', '==', cnpjLimpo)
      .where('competencia', '==', competencia)
      .get();
    if (snap.empty) return res.json({ ja_importado: false });
    const importacoes = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        criado_em: data.criado_em ? data.criado_em.toDate().toISOString() : null,
        total_lancamentos: data.total_lancamentos || 0,
        total_valor: data.total_valor || 0,
        hash_match: hash ? (data.raw_text_hash === hash) : false,
      };
    });
    res.json({ ja_importado: true, importacoes });
  } catch (err) {
    console.error('checar-duplicidade erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});




// Historicos Padrao IOB SAGE
require('./historicos-routes')(app, db);
app.get('/api/me', (req, res) => res.json(req.user));

app.post('/api/validar', async (req, res) => {
  try {
    const { cnpj, conta_cod, valor } = req.body;
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (!cnpjLimpo || !conta_cod) return res.status(400).json({ aprovado: false, motivo: 'Campos obrigatorios' });
    const empresaDoc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!empresaDoc.exists) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'CNPJ nao cadastrado', req.user, valor);
      return res.json({ aprovado: false, motivo: 'CNPJ ' + cnpj + ' nao esta cadastrado', log_id: logId });
    }
    const empresa = empresaDoc.data();
    if (empresa.ativo === false) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'Empresa inativa', req.user, valor);
      return res.json({ aprovado: false, motivo: 'Empresa inativa', log_id: logId });
    }
    const contasRef = db.collection('planos').doc(empresa.plano_id).collection('contas');
    const contaSnap = await contasRef.where('cod', '==', conta_cod).limit(1).get();
    if (contaSnap.empty) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'Conta nao pertence ao plano ' + empresa.plano_id, req.user, valor);
      return res.json({ aprovado: false, motivo: 'Conta ' + conta_cod + ' nao pertence ao plano ' + empresa.plano_id, plano_id: empresa.plano_id, empresa: empresa.razao_social, log_id: logId });
    }
    const conta = contaSnap.docs[0].data();
    if (conta.analitica === false) {
      const logId = await registrarLog(cnpjLimpo, conta_cod, false, 'Conta sintetica', req.user, valor);
      return res.json({ aprovado: false, motivo: 'Conta sintetica', log_id: logId });
    }
    const logId = await registrarLog(cnpjLimpo, conta_cod, true, 'OK', req.user, valor);
    res.json({ aprovado: true, motivo: 'OK', empresa: empresa.razao_social, plano_id: empresa.plano_id, conta: { cod: conta.cod, desc: conta.desc }, log_id: logId });
  } catch (err) { res.status(500).json({ aprovado: false, motivo: 'Erro interno', erro: err.message }); }
});

async function registrarLog(cnpj, conta_cod, aprovado, motivo, user, valor) {
  const ref = await db.collection('logs_validacao').add({ timestamp: new Date(), cnpj, conta_cod, aprovado, motivo, usuario_uid: user.uid, usuario_email: user.email, valor: valor || null });
  return ref.id;
}

// PLANOS - COLABORATIVO (todos veem, todos criam/editam, so admin deleta)
app.get('/api/planos', async (req, res) => {
  try { const snap = await db.collection('planos').get(); res.json(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/planos', async (req, res) => {
  try {
    const { id, codigo, nome, tipo, base } = req.body;
    if (!id || !codigo || !nome) return res.status(400).json({ erro: 'id, codigo, nome obrigatorios' });
    const existente = await db.collection('planos').doc(id).get();
    if (existente.exists) return res.status(409).json({ erro: 'Plano ja existe' });
    await db.collection('planos').doc(id).set({ codigo, nome, tipo: tipo || 'custom', base: base || '5G0001', global: true, owner_uid: null, ativo: true, created_at: new Date(), created_by: req.user.uid, created_by_email: req.user.email });
    res.status(201).json({ id, codigo, nome });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/planos/:id/contas', async (req, res) => {
  try {
    const planoDoc = await db.collection('planos').doc(req.params.id).get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    const snap = await db.collection('planos').doc(req.params.id).collection('contas').orderBy('cod').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/planos/:id/contas', async (req, res) => {
  try {
    const { cod, desc, analitica, ref_rfb } = req.body;
    if (!cod || !desc) return res.status(400).json({ erro: 'cod e desc obrigatorios' });
    const ref = await db.collection('planos').doc(req.params.id).collection('contas').add({ cod, desc, analitica: analitica !== false, ref_rfb: ref_rfb || null, created_by: req.user.uid });
    res.status(201).json({ id: ref.id, cod, desc });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Fase Zero+: substituir array completo de contas (upsert)
app.put('/api/planos/:id/contas', async (req, res) => {
  try {
    const { contas } = req.body;
    if (!Array.isArray(contas)) return res.status(400).json({ erro: 'contas[] obrigatorio' });
    const planoRef = db.collection('planos').doc(req.params.id);
    const planoDoc = await planoRef.get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    
    const subRef = planoRef.collection('contas');
    
    // 1. Deletar contas atuais em batch (max 500 por batch do Firestore)
    const atuais = await subRef.get();
    let deletadas = 0;
    for (let i = 0; i < atuais.docs.length; i += 400) {
      const chunk = atuais.docs.slice(i, i + 400);
      const batchDel = db.batch();
      chunk.forEach(d => batchDel.delete(d.ref));
      await batchDel.commit();
      deletadas += chunk.length;
    }
    
    // 2. Escrever novas em batch
    let inseridas = 0;
    for (let i = 0; i < contas.length; i += 400) {
      const chunk = contas.slice(i, i + 400);
      const batchAdd = db.batch();
      chunk.forEach(c => {
        const ref = subRef.doc();
        batchAdd.set(ref, {
          cod: c.codigo || c.cod || '',
          desc: c.descricao || c.desc || '',
          reduzido: c.reduzido || '',
          ref_rfb: c.reduzido || c.ref_rfb || null,
          analitica: c.analitica !== false,
          created_by: req.user.uid,
          created_at: new Date()
        });
      });
      await batchAdd.commit();
      inseridas += chunk.length;
    }
    
    res.json({ ok: true, deletadas, inseridas, plano_id: req.params.id });
  } catch (err) {
    console.error('[PUT contas] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// === Fase 5a: Memoria de classificacao por CNPJ ===
// Coleção 'aprendizado' com chave composta {cnpj}_{hash}
// para evitar subcoleções e simplificar queries.

function _validarReduzidoFB(s) {
  // reduzido = numero (1-14 digitos), aceita string vazia para null
  if (!s) return null;
  const clean = String(s).replace(/\D/g, '');
  return /^\d{1,14}$/.test(clean) ? clean.padStart(14, '0').slice(-14) : null;
}

// Lista todos os padroes aprendidos da empresa
app.get('/api/empresas/:cnpj/aprendizado', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const snap = await db.collection('aprendizado').where('cnpj', '==', cnpj).get();
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ total: lista.length, aprendizado: lista });
  } catch (err) {
    console.error('[GET aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// Salva um padrao aprendido
app.post('/api/empresas/:cnpj/aprendizado', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const { hash, descricao_normalizada, descricao_exemplo, contaDebito, contaCredito, codigoHistorico, historico, historicoPadraoDescricao } = req.body;
    if (!hash || !descricao_normalizada) return res.status(400).json({ erro: 'hash e descricao_normalizada obrigatorios' });
    
    // Validar codigoHistorico (4 digitos)
    const codHist = codigoHistorico ? String(codigoHistorico).replace(/\D/g, '').padStart(4, '0').slice(-4) : null;
    if (codHist && !/^\d{4}$/.test(codHist)) return res.status(400).json({ erro: 'codigoHistorico invalido' });
    
    const docId = cnpj + '_' + hash;
    const ref = db.collection('aprendizado').doc(docId);
    const existing = await ref.get();
    const now = new Date();
    
    const dados = {
      cnpj: cnpj,
      hash: hash,
      descricao_normalizada: String(descricao_normalizada).substring(0, 200),
      descricao_exemplo: String(descricao_exemplo || '').substring(0, 200),
      contaDebito: contaDebito || '',
      contaCredito: contaCredito || '',
      codigoHistorico: codHist || '',
      historico: String(historico || '').substring(0, 200),
      historicoPadraoDescricao: String(historicoPadraoDescricao || '').substring(0, 200),
      vezes_usado: existing.exists ? (existing.data().vezes_usado || 0) + 1 : 1,
      criado_em: existing.exists ? existing.data().criado_em : now,
      ultima_vez: now,
      created_by: req.user.uid,
      created_by_email: req.user.email
    };
    
    await ref.set(dados);
    res.json({ ok: true, docId: docId, vezes_usado: dados.vezes_usado });
  } catch (err) {
    console.error('[POST aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.put('/api/empresas/:cnpj/aprendizado/:hash', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
    const hash = req.params.hash;
    if (cnpj.length !== 14 || !hash) return res.status(400).json({ erro: 'CNPJ e hash obrigatorios' });
    const docId = cnpj + '_' + hash;
    const ref = db.collection('aprendizado').doc(docId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'Padrao nao encontrado' });
    const body = req.body || {};
    const atualizacao = {
      contaDebito: body.contaDebito || '',
      contaCredito: body.contaCredito || '',
      codigoHistorico: body.codigoHistorico ? String(body.codigoHistorico).replace(/\D/g, '').padStart(4, '0').slice(-4) : '',
      historico: String(body.historico || '').substring(0, 200),
      historicoPadraoDescricao: String(body.historicoPadraoDescricao || '').substring(0, 200),
      atualizado_em: new Date(),
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email
    };
    await ref.set(atualizacao, { merge: true });
    res.json({ ok: true, docId, ...atualizacao });
  } catch (err) {
    console.error('[PUT aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// Remove um padrao aprendido
app.delete('/api/empresas/:cnpj/aprendizado/:hash', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
    const hash = req.params.hash;
    if (cnpj.length !== 14 || !hash) return res.status(400).json({ erro: 'CNPJ e hash obrigatorios' });
    const docId = cnpj + '_' + hash;
    await db.collection('aprendizado').doc(docId).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.delete('/api/planos/:id', adminRequired, async (req, res) => {
  try {
    const planoRef = db.collection('planos').doc(req.params.id);
    const planoDoc = await planoRef.get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    const contasSnap = await planoRef.collection('contas').get();
    const batch = db.batch();
    contasSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(planoRef);
    await batch.commit();
    res.json({ deleted: req.params.id, contas_removidas: contasSnap.size });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// EMPRESAS - COLABORATIVO
app.get('/api/empresas', async (req, res) => {
  try {
    let query = db.collection('empresas');
    if (!req.user.is_admin) query = query.where('owner_uid', '==', req.user.uid);
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ cnpj: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==================== LISTAR EMPRESAS COM AGREGACOES (Gestao) ====================
app.get('/api/empresas/listar', async (req, res) => {
  try {
    const { q, banco, status, periodo_de, periodo_ate, sort, order, limit, offset, admin_ver_tudo } = req.query || {};
    let query = db.collection('empresas');
    const verTudo = req.user.is_admin && admin_ver_tudo === '1';
    if (!req.user.is_admin || !verTudo) query = query.where('owner_uid', '==', req.user.uid);
    const snap = await query.get();
    let empresas = snap.docs.map(d => ({ cnpj: d.id, ...d.data() }));

    // Carregar nomes dos planos para enriquecer (uma passada so)
    const planoIds = Array.from(new Set(empresas.map(e => e.plano_id).filter(Boolean)));
    const planoNomes = {};
    await Promise.all(planoIds.map(async id => {
      try {
        const p = await db.collection('planos').doc(id).get();
        if (p.exists) planoNomes[id] = p.data().nome || p.data().name || id;
      } catch (e) {}
    }));

    // Enriquecer cada empresa com dados da sessao atual
    const enriched = await Promise.all(empresas.map(async emp => {
      let totalLanc = 0, periodoAtual = null, status_calc = 'nunca_processado', ultimoSaveBy = null, ultimoSaveAt = null;
      try {
        const sessDoc = await db.collection('empresas').doc(emp.cnpj).collection('sessoes').doc('current').get();
        if (sessDoc.exists) {
          const sd = sessDoc.data();
          totalLanc = (sd.resumo && sd.resumo.total_lancamentos) || 0;
          periodoAtual = (sd.resumo && sd.resumo.periodo) || null;
          ultimoSaveBy = sd.updated_by_email || null;
          ultimoSaveAt = sd.updated_at || null;
          status_calc = totalLanc > 0 ? 'em_andamento' : 'pendente';
        }
      } catch (e) {}
      let totalRel = 0;
      try {
        const relSnap = await db.collection('empresas').doc(emp.cnpj).collection('relatorios').get();
        totalRel = relSnap.size;
        if (totalRel > 0 && status_calc !== 'em_andamento') status_calc = 'fechado';
      } catch (e) {}
      return {
        cnpj: emp.cnpj,
        razao_social: emp.razao_social || '',
        banco: emp.banco || null,
        plano_id: emp.plano_id || null,
        plano_nome: emp.plano_id ? (planoNomes[emp.plano_id] || emp.plano_id) : null,
        owner_uid: emp.owner_uid || null,
        owner_email: emp.created_by_email || emp.last_session_by_email || null,
        ativo: emp.ativo !== false,
        created_at: emp.created_at || null,
        updated_at: emp.updated_at || ultimoSaveAt || null,
        last_session_at: ultimoSaveAt,
        last_session_by_email: ultimoSaveBy,
        total_lancamentos: totalLanc,
        periodo_atual: periodoAtual,
        total_relatorios: totalRel,
        status: status_calc
      };
    }));

    // Aplicar filtros em memoria
    let filtered = enriched;
    if (q) {
      const ql = String(q).toLowerCase();
      filtered = filtered.filter(e => (e.razao_social || '').toLowerCase().includes(ql) || e.cnpj.includes(ql.replace(/\D/g, '')));
    }
    if (banco) filtered = filtered.filter(e => e.banco === banco);
    if (status && status !== 'todas') filtered = filtered.filter(e => e.status === status);
    if (periodo_de || periodo_ate) {
      filtered = filtered.filter(e => {
        if (!e.periodo_atual) return false;
        const [ini] = String(e.periodo_atual).split(' a ');
        if (periodo_de && ini < periodo_de) return false;
        if (periodo_ate && ini > periodo_ate) return false;
        return true;
      });
    }

    // Ordenar
    const sortField = sort || 'last_session_at';
    const ord = (order === 'asc') ? 1 : -1;
    filtered.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (va && va._seconds) va = va._seconds;
      if (vb && vb._seconds) vb = vb._seconds;
      if (va && va.toDate) va = va.toDate().getTime();
      if (vb && vb.toDate) vb = vb.toDate().getTime();
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va > vb) return ord;
      if (va < vb) return -ord;
      return 0;
    });

    const total = filtered.length;
    const off = parseInt(offset, 10) || 0;
    const lim = Math.min(parseInt(limit, 10) || 24, 100);
    const page = filtered.slice(off, off + lim);

    // Lista unica de bancos para popular filtro
    const bancos = Array.from(new Set(enriched.map(e => e.banco).filter(Boolean))).sort();

    res.json({ total, offset: off, limit: lim, empresas: page, bancos, is_admin: !!req.user.is_admin, admin_ver_tudo: verTudo });
  } catch (e) {
    console.error('listar empresas erro:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/empresas/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const doc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    res.json({ cnpj: doc.id, ...doc.data() });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/empresas', async (req, res) => {
  try {
    const { cnpj, plano_id } = req.body;
    const razao_social = req.body.razao_social || req.body['razão_social'] || '';
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 digitos' });
    if (!razao_social || !plano_id) return res.status(400).json({ erro: 'razao_social e plano_id obrigatorios' });
    const planoDoc = await db.collection('planos').doc(plano_id).get();
    if (!planoDoc.exists) return res.status(400).json({ erro: 'Plano ' + plano_id + ' nao existe' });
    await db.collection('empresas').doc(cnpjLimpo).set({ razao_social, plano_id, owner_uid: req.user.uid, ativo: true, created_at: new Date(), updated_at: new Date(), created_by: req.user.uid, created_by_email: req.user.email });
    res.status(201).json({ cnpj: cnpjLimpo, razao_social, plano_id });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/empresas/:cnpj/ativar', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const ref = db.collection('empresas').doc(cnpjLimpo);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    await ref.update({ ativo: true, updated_at: new Date(), reactivated_by: req.user.uid, reactivated_by_email: req.user.email, reactivated_at: new Date() });
    res.json({ cnpj: cnpjLimpo, ativo: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==================== LAYOUTS PARSER (memorizacao por CNPJ) ====================
app.post('/api/layouts_parser/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { fingerprint, arquivo_exemplo, total_lancamentos, origem } = req.body || {};
    if (!fingerprint) return res.status(400).json({ erro: 'fingerprint obrigatorio' });
    const ref = db.collection('empresas').doc(cnpjLimpo).collection('layouts_parser').doc(fingerprint);
    const doc = await ref.get();
    const agora = new Date();
    if (doc.exists) {
      await ref.update({
        ultimo_uso: agora,
        total_usos: (doc.data().total_usos || 0) + 1,
        ultimo_arquivo: arquivo_exemplo || null,
        ultimo_total_lancamentos: total_lancamentos || 0
      });
    } else {
      await ref.set({
        fingerprint, origem: origem || 'unknown',
        criado_em: agora, criado_por: req.user.email,
        ultimo_uso: agora, total_usos: 1,
        ultimo_arquivo: arquivo_exemplo || null,
        ultimo_total_lancamentos: total_lancamentos || 0,
        validado: false
      });
    }
    res.json({ ok: true, fingerprint });
  } catch (e) { console.error('layouts_parser POST erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/layouts_parser/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('layouts_parser').get();
    res.json({ layouts: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/importacoes/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { fingerprint, banco, conta, nome_conta, periodo_inicio, periodo_fim, total_lancamentos, arquivo_exemplo } = req.body || {};
    if (!fingerprint) return res.status(400).json({ erro: 'fingerprint obrigatorio' });
    const ref = db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(fingerprint);
    const doc = await ref.get();
    const agora = new Date();
    if (doc.exists) {
      await ref.update({
        atualizado_em: agora, atualizado_por: req.user.email,
        total_lancamentos: total_lancamentos || 0,
        ultimo_arquivo: arquivo_exemplo || null,
        total_atualizacoes: (doc.data().total_atualizacoes || 0) + 1
      });
    } else {
      await ref.set({
        fingerprint, banco: banco || '', conta: conta || '', nome_conta: nome_conta || '',
        periodo_inicio: periodo_inicio || '', periodo_fim: periodo_fim || '',
        total_lancamentos: total_lancamentos || 0,
        arquivo_exemplo: arquivo_exemplo || null,
        criado_em: agora, criado_por: req.user.email, criado_por_uid: req.user.uid,
        atualizado_em: agora, total_atualizacoes: 0
      });
    }
    res.json({ ok: true, fingerprint });
  } catch (e) { console.error('importacoes POST erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/importacoes/:cnpj/:fingerprint', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const doc = await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(req.params.fingerprint).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Importacao nao encontrada' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/importacoes/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').get();
    res.json({ importacoes: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/importacoes/:cnpj/:fingerprint', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    await db.collection('empresas').doc(cnpjLimpo).collection('importacoes').doc(req.params.fingerprint).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/empresas/:cnpj', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const doc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    await db.collection('empresas').doc(cnpjLimpo).delete();
    res.json({ deleted: cnpjLimpo });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/logs', async (req, res) => {
  try {
    const { cnpj, limit } = req.query;
    const lim = Math.min(parseInt(limit) || 100, 500);
    let query;
    if (cnpj) {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      query = db.collection('logs_validacao').where('cnpj', '==', cnpjLimpo).orderBy('timestamp', 'desc').limit(lim);
    } else {
      query = db.collection('logs_validacao').orderBy('timestamp', 'desc').limit(lim);
    }
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/users', adminRequired, async (req, res) => {
  try { const snap = await db.collection('users').get(); res.json(snap.docs.map(d => ({ uid: d.id, ...d.data() }))); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/users/:uid/promote', adminRequired, async (req, res) => {
  try { await db.collection('users').doc(req.params.uid).set({ is_admin: true, updated_at: new Date(), updated_by: req.user.uid }, { merge: true }); res.json({ uid: req.params.uid, is_admin: true }); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/users/:uid/demote', adminRequired, async (req, res) => {
  try {
    if (req.params.uid === req.user.uid) return res.status(400).json({ erro: 'Admin nao pode remover proprio status' });
    await db.collection('users').doc(req.params.uid).set({ is_admin: false, updated_at: new Date(), updated_by: req.user.uid }, { merge: true });
    res.json({ uid: req.params.uid, is_admin: false });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==================== PROXY GEMINI (protege API key) ====================
app.post('/api/ai/gemini', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ erro: 'GEMINI_API_KEY nao configurada no servidor' });
    const model = (req.body && req.body._model) || 'gemini-2.5-flash';
    const payload = Object.assign({}, req.body || {});
    delete payload._model;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    console.error('proxy gemini erro:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ==================== VINCULAR PLANO A EMPRESA (ADMIN) ====================
app.post('/api/admin/trocar-plano-empresa', adminRequired, async (req, res) => {
  try {
    const { cnpj, novo_plano_id, descartar_classificacoes } = req.body || {};
    if (!cnpj || !novo_plano_id) return res.status(400).json({ erro: 'cnpj e novo_plano_id obrigatorios' });
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });

    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const empresaDoc = await empresaRef.get();
    if (!empresaDoc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    const empresaData = empresaDoc.data();

    const novoPlanoRef = db.collection('planos').doc(novo_plano_id);
    const novoPlanoDoc = await novoPlanoRef.get();
    if (!novoPlanoDoc.exists) return res.status(404).json({ erro: 'Plano novo nao encontrado' });
    const novoPlanoData = novoPlanoDoc.data();

    let planoAnteriorNome = '';
    if (empresaData.plano_id) {
      try {
        const antDoc = await db.collection('planos').doc(empresaData.plano_id).get();
        if (antDoc.exists) planoAnteriorNome = antDoc.data().nome || '';
      } catch (e) {}
    }

    let totalAfetados = 0;
    if (descartar_classificacoes) {
      try {
        const sessRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('ativa');
        const sessDoc = await sessRef.get();
        if (sessDoc.exists) {
          const sess = sessDoc.data();
          if (sess.state_json) {
            const st = JSON.parse(sess.state_json);
            if (Array.isArray(st.entries)) {
              totalAfetados = st.entries.length;
              st.entries.forEach(function(e){ e.contaDebito=''; e.contaCredito=''; e.categoria='Nao categorizado'; e.historico=''; });
              await sessRef.update({ state_json: JSON.stringify(st), atualizado_em: new Date(), atualizado_por: req.user.email });
            }
          }
        }
      } catch (e) { console.warn('trocar-plano: erro ao limpar classificacoes:', e.message); }
    }

    await empresaRef.update({ plano_id: novo_plano_id, plano_nome: novoPlanoData.nome || '', trocado_em: new Date(), trocado_por: req.user.email });

    await db.collection('empresas').doc(cnpjLimpo).collection('historico_planos').add({
      plano_anterior_id: empresaData.plano_id || null,
      plano_anterior_nome: planoAnteriorNome,
      plano_novo_id: novo_plano_id,
      plano_novo_nome: novoPlanoData.nome || '',
      descartou_classificacoes: !!descartar_classificacoes,
      total_lancamentos_afetados: totalAfetados,
      quando: new Date(),
      por_email: req.user.email,
      por_uid: req.user.uid
    });

    res.json({ ok: true, plano_novo_nome: novoPlanoData.nome, total_afetados: totalAfetados });
  } catch (e) { console.error('trocar-plano-empresa:', e); res.status(500).json({ erro: e.message }); }
});

// Fase 4: contexto IA dinamico via BrasilAPI + cache Firestore
app.get('/api/empresas/:cnpj/contexto-ia', async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const force = req.query.force === '1' || req.query.refresh === '1';

    const ref = db.collection('empresas').doc(cnpj);
    const snap = await ref.get();

    if (!force && snap.exists) {
      const d = snap.data() || {};
      if (d.contexto_ia && d.contexto_ia.cnae_descricao) {
        return res.json(Object.assign({ origem: 'cache' }, d.contexto_ia));
      }
    }

    let brasilapi;
    try {
      const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
      if (!r.ok) {
        return res.status(502).json({ erro: 'BrasilAPI HTTP ' + r.status, cnpj: cnpj });
      }
      brasilapi = await r.json();
    } catch (eFetch) {
      console.warn('[contexto-ia] falha BrasilAPI:', eFetch.message);
      if (snap.exists) {
        const d = snap.data() || {};
        if (d.contexto_ia) return res.json(Object.assign({ origem: 'cache-fallback' }, d.contexto_ia));
      }
      return res.status(502).json({ erro: 'BrasilAPI indisponivel: ' + eFetch.message });
    }

    const ctx = {
      cnpj: cnpj,
      razao_social: brasilapi.razao_social || brasilapi.nome_empresarial || '',
      nome_fantasia: brasilapi.nome_fantasia || '',
      cnae_principal: brasilapi.cnae_fiscal ? String(brasilapi.cnae_fiscal) : '',
      cnae_descricao: brasilapi.cnae_fiscal_descricao || '',
      natureza_juridica: brasilapi.natureza_juridica || '',
      porte: brasilapi.porte || '',
      situacao: brasilapi.descricao_situacao_cadastral || '',
      municipio: brasilapi.municipio || '',
      uf: brasilapi.uf || '',
      atualizado_em: new Date().toISOString()
    };

    await ref.set({ contexto_ia: ctx }, { merge: true });
    res.json(Object.assign({ origem: 'brasilapi' }, ctx));
  } catch (e) {
    console.error('[contexto-ia] erro:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/empresas/:cnpj/historico-planos', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('historico_planos').orderBy('quando', 'desc').limit(50).get();
    res.json({ historico: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/admin/vincular-empresa-plano', adminRequired, async (req, res) => {
  try {
    const { cnpj, plano_id } = req.body || {};
    const razao_social = req.body.razao_social || req.body['razão_social'] || '';
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 digitos' });
    if (!plano_id) return res.status(400).json({ erro: 'plano_id obrigatorio' });
    const planoDoc = await db.collection('planos').doc(plano_id).get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const empresaDoc = await empresaRef.get();
    const dados = { plano_id, ativo: true, updated_at: new Date(), vinculado_por_uid: req.user.uid, vinculado_por_email: req.user.email, vinculado_em: new Date() };
    if (razao_social) dados.razao_social = razao_social;
    if (!empresaDoc.exists) { dados.created_at = new Date(); dados.created_by = req.user.uid; dados.created_by_email = req.user.email; dados.owner_uid = req.user.uid; }
    await empresaRef.set(dados, { merge: true });
    res.json({ ok: true, cnpj: cnpjLimpo, plano_id });
  } catch (e) { console.error('vincular-empresa-plano erro:', e); res.status(500).json({ erro: e.message }); }
});

// ==================== SESSAO DE TRABALHO (state persistente) ====================
async function checarAcessoEmpresa(cnpj, user) {
  const doc = await db.collection('empresas').doc(cnpj).get();
  if (!doc.exists) return { ok: false, status: 404, erro: 'Empresa nao encontrada' };
  const emp = doc.data();
  if (!user.is_admin && emp.owner_uid !== user.uid) return { ok: false, status: 403, erro: 'Sem permissao para esta empresa' };
  return { ok: true, empresa: emp };
}

function serializarFiscal(data) {
  const out = { ...(data || {}) };
  Object.keys(out).forEach(k => {
    const v = out[k];
    if (v && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
  });
  return out;
}

function serializarDataSegura(v) {
  if (!v) return '';
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.fim) return serializarDataSegura(v.fim);
    if (v.notAfter) return serializarDataSegura(v.notAfter);
    if (v.valid_to) return serializarDataSegura(v.valid_to);
  }
  return String(v);
}

function parseValorFiscal(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizarFiscalBody(body) {
  const statusPermitidos = new Set(['EM_ABERTO', 'PAGO', 'PAGO_COM_DIFERENCA', 'VENCIDO', 'PARCELADO', 'COMPENSADO', 'EM_ANALISE', 'PENDENTE_RECEITA']);
  const origemPermitida = new Set(['manual', 'importado', 'arquivo', 'banco', 'SERPRO']);
  const b = body || {};
  const status = String(b.status || 'EM_ABERTO').trim().toUpperCase();
  const origem = String(b.origem || 'manual').trim();
  if (!statusPermitidos.has(status)) throw new Error('status fiscal invalido');
  if (!origemPermitida.has(origem)) throw new Error('origem fiscal invalida');
  return {
    competencia: String(b.competencia || '').trim(),
    tributo: String(b.tributo || '').trim().toUpperCase(),
    codigo_receita: String(b.codigo_receita || '').trim(),
    valor_apurado: parseValorFiscal(b.valor_apurado),
    valor_pago: parseValorFiscal(b.valor_pago),
    vencimento: String(b.vencimento || '').trim(),
    data_pagamento: String(b.data_pagamento || '').trim(),
    numero_documento: String(b.numero_documento || '').trim(),
    origem,
    status,
    pendencia_ecac: String(b.pendencia_ecac || '').trim(),
    anexo_url: String(b.anexo_url || '').trim(),
    observacoes: String(b.observacoes || '').trim().slice(0, 1200)
  };
}

const FISCAL_GATEWAY_URL = (process.env.FISCAL_GATEWAY_URL || 'https://consultor-fiscal-inteligente-631239634290.us-central1.run.app').replace(/\/+$/, '');
const FISCAL_GATEWAY_TOKEN = String(process.env.FISCAL_GATEWAY_TOKEN || process.env.CONSULTOR_FISCAL_GATEWAY_TOKEN || '').trim();

function fiscalGatewayHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (FISCAL_GATEWAY_TOKEN) {
    headers.Authorization = `Bearer ${FISCAL_GATEWAY_TOKEN}`;
    headers['X-Fiscal-Gateway-Token'] = FISCAL_GATEWAY_TOKEN;
  }
  return headers;
}

async function fiscalGatewayJson(pathGateway, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  try {
    const resp = await fetch(FISCAL_GATEWAY_URL + pathGateway, {
      method: options.method || 'GET',
      headers: fiscalGatewayHeaders(),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await resp.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
    if (!resp.ok) {
      const msg = data.erro || data.error || data.message || `Gateway fiscal retornou HTTP ${resp.status}`;
      const err = new Error(msg);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function fiscalDocId(prefixo, partes) {
  const texto = [prefixo, ...(partes || [])]
    .filter(Boolean)
    .join('_')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 140);
  return texto || `${prefixo}_${Date.now()}`;
}

function fiscalCompetenciaDeItem(item) {
  if (!item) return '';
  if (item.competencia) {
    const m = String(item.competencia).match(/(\d{4})[-/](\d{2})|(\d{2})[-/](\d{4})/);
    if (m && m[1]) return `${m[1]}-${m[2]}`;
    if (m && m[3]) return `${m[4]}-${m[3]}`;
    return String(item.competencia).slice(0, 7);
  }
  if (item.anoPA && item.mesPA) return `${item.anoPA}-${String(item.mesPA).padStart(2, '0')}`;
  if (item.periodoApuracao) return fiscalCompetenciaDeItem({ competencia: item.periodoApuracao });
  return '';
}

function fiscalStatusSerpro(item) {
  const status = String(item?.statusPagamento || item?.status || item?.situacao || '').toLowerCase();
  if (/pago|quitad|baixad/.test(status)) return 'PAGO';
  if (/vencid|atras/.test(status)) return 'VENCIDO';
  if (/parcel/.test(status)) return 'PARCELADO';
  if (/compens/.test(status)) return 'COMPENSADO';
  if (/analise|process/.test(status)) return 'EM_ANALISE';
  if (/pend|devedor|omiss|irregular/.test(status)) return 'PENDENTE_RECEITA';
  return 'EM_ABERTO';
}

function primeiroValorFiscal(item, campos) {
  for (const campo of campos) {
    if (item && item[campo] != null && item[campo] !== '') return parseValorFiscal(item[campo]);
  }
  return 0;
}

function normalizarItensSerpro(fonte, itens) {
  const lista = Array.isArray(itens) ? itens : [];
  if (fonte === 'DAS') {
    return lista.map(item => {
      const valor = primeiroValorFiscal(item, ['valor', 'valorTotal', 'valor_total', 'valorPrincipal', 'total']);
      const status = fiscalStatusSerpro(item);
      return {
        id: fiscalDocId('SERPRO_DAS', [item.id, item.empresaCnpj, item.competencia, item.tipo, item.numeroDas || item.numeroDocumento]),
        competencia: fiscalCompetenciaDeItem(item),
        tributo: 'DAS',
        codigo_receita: item.codigoReceita || item.codigo_receita || '',
        valor_apurado: valor,
        valor_pago: status === 'PAGO' ? primeiroValorFiscal(item, ['valorPago', 'valor_pago', 'valor', 'valorTotal']) : primeiroValorFiscal(item, ['valorPago', 'valor_pago']),
        vencimento: String(item.vencimento || item.dataVencimento || '').slice(0, 10),
        data_pagamento: String(item.dataPagamento || item.pagamentoEm || '').slice(0, 10),
        numero_documento: String(item.numeroDas || item.numeroDocumento || item.id || '').trim(),
        origem: 'SERPRO',
        status,
        pendencia_ecac: '',
        anexo_url: item.url || item.link || '',
        observacoes: `DAS importado do app fiscal/SERPRO. Tipo: ${item.tipo || 'regular'}.`
      };
    }).filter(item => item.competencia || item.numero_documento);
  }

  if (fonte === 'DCTFWEB') {
    return lista.map(item => {
      const valor = primeiroValorFiscal(item, ['valor', 'valorTotal', 'saldoAPagar', 'valorPrincipal', 'totalDebito']);
      return {
        id: fiscalDocId('SERPRO_DCTFWEB', [item.id, item.empresaCnpj, item.anoPA, item.mesPA, item.categoria, item.numeroRecibo]),
        competencia: fiscalCompetenciaDeItem(item),
        tributo: 'DCTFWEB',
        codigo_receita: item.codigoReceita || item.codigo_receita || '',
        valor_apurado: valor,
        valor_pago: primeiroValorFiscal(item, ['valorPago', 'valor_pago']),
        vencimento: String(item.vencimento || item.dataVencimento || '').slice(0, 10),
        data_pagamento: String(item.dataPagamento || '').slice(0, 10),
        numero_documento: String(item.numeroRecibo || item.recibo || item.id || '').trim(),
        origem: 'SERPRO',
        status: fiscalStatusSerpro(item),
        pendencia_ecac: String(item.situacao || '').trim(),
        anexo_url: item.url || item.link || '',
        observacoes: `DCTFWeb sincronizada via app fiscal/SERPRO. Categoria: ${item.categoria || 'GERAL_MENSAL'}.`
      };
    }).filter(item => item.competencia || item.numero_documento);
  }

  if (fonte === 'CAIXA_POSTAL') {
    return lista.map(item => ({
      id: fiscalDocId('SERPRO_CAIXA', [item.id, item.empresaCnpj, item.dataEnvio, item.assunto || item.titulo]),
      competencia: fiscalCompetenciaDeItem({ competencia: String(item.dataEnvio || item.data || '').slice(0, 7) }),
      tributo: 'OUTROS',
      codigo_receita: '',
      valor_apurado: 0,
      valor_pago: 0,
      vencimento: '',
      data_pagamento: '',
      numero_documento: String(item.id || '').trim(),
      origem: 'SERPRO',
      status: 'PENDENTE_RECEITA',
      pendencia_ecac: String(item.assunto || item.titulo || 'Mensagem e-CAC').trim(),
      anexo_url: '',
      observacoes: String(item.resumo || item.conteudo || 'Mensagem pendente na Caixa Postal e-CAC.').slice(0, 1200)
    })).filter(item => item.pendencia_ecac || item.numero_documento);
  }

  return [];
}

const FISCAL_CERT_SENSITIVE_KEYS = new Set([
  'senha', 'password', 'passphrase', 'certificado', 'certificate', 'pfx', 'p12',
  'privatekey', 'private_key', 'chaveprivada', 'conteudo', 'content', 'base64',
  'pem', 'key', 'arquivo', 'file', 'buffer'
]);

function fiscalCertCampoSeguro(chave) {
  const normalizada = String(chave || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return !FISCAL_CERT_SENSITIVE_KEYS.has(normalizada);
}

function serializarCertificadoFiscal(pathFonte, data = {}) {
  return {
    cadastrado: true,
    fonte: 'firebase',
    origem: pathFonte,
    cnpj_escritorio: data.cnpj_escritorio || data.cnpj || data.documento || '',
    razao_social: data.razao_social || data.nome || data.nome_empresa || data.empresa || '',
    validade: serializarDataSegura(data.validade || data.expires_at || data.data_validade || data.valid_to || ''),
    status: data.status || (data.ativo === false ? 'inativo' : 'ativo'),
    ultimo_uso_em: serializarDataSegura(data.ultimo_uso_em || data.last_used_at || data.updated_at || data.atualizado_em || ''),
    observacao: data.observacao || data.descricao || data.nome_arquivo || data.filename || ''
  };
}

function firestoreCertificadoFiscal() {
  const projectId = process.env.FISCAL_CERT_PROJECT_ID || process.env.CERTIFICADO_ESCRITORIO_PROJECT_ID || '';
  if (!projectId) return { db, projectId: '' };
  if (!firestorePorProjeto.has(projectId)) firestorePorProjeto.set(projectId, new Firestore({ projectId }));
  return { db: firestorePorProjeto.get(projectId), projectId };
}

async function lerDocumentoCertificadoFiscal(pathDoc, firestoreAtual, projectId) {
  if (!pathDoc || !String(pathDoc).includes('/')) return null;
  const snap = await firestoreAtual.doc(String(pathDoc).replace(/^\/+|\/+$/g, '')).get();
  if (!snap.exists) return null;
  const origem = projectId ? `${projectId}/${snap.ref.path}` : snap.ref.path;
  return serializarCertificadoFiscal(origem, snap.data());
}

async function localizarCertificadoFiscal() {
  const fonte = firestoreCertificadoFiscal();
  const certDb = fonte.db;
  const certProjectId = fonte.projectId;
  const caminhoEnv = process.env.FISCAL_CERT_DOC_PATH || process.env.CERTIFICADO_ESCRITORIO_DOC_PATH;
  const porEnv = await lerDocumentoCertificadoFiscal(caminhoEnv, certDb, certProjectId);
  if (porEnv) return porEnv;

  const documentosCandidatos = [
    'configuracoes/certificado_escritorio',
    'configuracoes/certificado-a1',
    'configuracoes/certificadoA1',
    'certificados/escritorio',
    'certificados/escritorio_a1',
    'certificados/principal',
    'certificados/default',
    'certificados/current',
    'certificados_digitais/escritorio',
    'certificados_digitais/principal',
    'certificados_a1/escritorio',
    'ecac_certificados/escritorio',
    'serpro_certificados/escritorio'
  ];

  for (const pathDoc of documentosCandidatos) {
    const encontrado = await lerDocumentoCertificadoFiscal(pathDoc, certDb, certProjectId);
    if (encontrado) return encontrado;
  }

  const colecoesCandidatas = [
    'certificados',
    'certificados_digitais',
    'certificados_a1',
    'ecac_certificados',
    'serpro_certificados',
    'empresa_certificados',
    'configuracoes'
  ];
  const chavesIndicadoras = ['validade', 'data_validade', 'expires_at', 'cnpj', 'cnpj_escritorio', 'arquivo_nome', 'nome_arquivo', 'pfx', 'p12', 'certificado'];

  for (const nomeColecao of colecoesCandidatas) {
    const snap = await certDb.collection(nomeColecao).limit(10).get();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const chaves = Object.keys(data);
      const pareceCertificado = chaves.some(k => chavesIndicadoras.includes(String(k).toLowerCase())) ||
        /cert/i.test(doc.id) ||
        /escritorio|principal|default|current/i.test(doc.id);
      if (!pareceCertificado) continue;
      const dadosSeguros = {};
      Object.entries(data).forEach(([k, v]) => {
        if (fiscalCertCampoSeguro(k)) dadosSeguros[k] = v;
      });
      const origem = certProjectId ? `${certProjectId}/${doc.ref.path}` : doc.ref.path;
      return serializarCertificadoFiscal(origem, dadosSeguros);
    }
  }
  return null;
}

app.get('/api/fiscal/certificado-status', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const encontrado = await localizarCertificadoFiscal();
    if (!encontrado) {
      return res.json({
        cadastrado: false,
        status: 'nao_localizado',
        fonte: 'firebase',
        observacao: 'Defina FISCAL_CERT_DOC_PATH ou grave o certificado em uma colecao padrao para ativar a integracao.'
      });
    }
    res.json(encontrado);
  } catch (err) {
    console.error('certificado-status erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/fiscal/serpro-status', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const statusGateway = await fiscalGatewayJson('/api/internal/plano-contas/status', { timeoutMs: 12000 });
    res.json({
      ok: true,
      gateway_url: FISCAL_GATEWAY_URL,
      token_configurado: !!FISCAL_GATEWAY_TOKEN,
      ...statusGateway
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, erro: err.message });
  }
});

app.get('/api/empresas/:cnpj/fiscal/impostos', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos').orderBy('competencia', 'desc').limit(300).get();
    const itens = snap.docs.map(d => ({ id: d.id, ...serializarFiscal(d.data()) }));
    const resumo = itens.reduce((acc, item) => {
      acc.total++;
      acc.valor_apurado += Number(item.valor_apurado || 0);
      acc.valor_pago += Number(item.valor_pago || 0);
      acc.status[item.status || 'EM_ABERTO'] = (acc.status[item.status || 'EM_ABERTO'] || 0) + 1;
      if (['EM_ABERTO', 'VENCIDO', 'PENDENTE_RECEITA', 'PAGO_COM_DIFERENCA'].includes(item.status)) acc.pendencias++;
      return acc;
    }, { total: 0, valor_apurado: 0, valor_pago: 0, pendencias: 0, status: {} });
    res.json({ cnpj: cnpjLimpo, resumo, itens });
  } catch (err) {
    console.error('fiscal impostos GET erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/empresas/:cnpj/fiscal/impostos', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const dados = normalizarFiscalBody(req.body);
    if (!dados.competencia || !dados.tributo) return res.status(400).json({ erro: 'competencia e tributo obrigatorios' });
    const ref = await db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos').add({
      ...dados,
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email,
      atualizado_em: new Date(),
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email
    });
    res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('fiscal impostos POST erro:', err);
    res.status(400).json({ erro: err.message });
  }
});

app.put('/api/empresas/:cnpj/fiscal/impostos/:id', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const dados = normalizarFiscalBody(req.body);
    const ref = db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'registro fiscal nao encontrado' });
    await ref.set({
      ...dados,
      atualizado_em: new Date(),
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email
    }, { merge: true });
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    console.error('fiscal impostos PUT erro:', err);
    res.status(400).json({ erro: err.message });
  }
});

app.delete('/api/empresas/:cnpj/fiscal/impostos/:id', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    await db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('fiscal impostos DELETE erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/empresas/:cnpj/fiscal/sincronizar-serpro', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });

    const statusGateway = await fiscalGatewayJson('/api/internal/plano-contas/status', { timeoutMs: 12000 });
    const avisos = [];
    if (!FISCAL_GATEWAY_TOKEN) {
      avisos.push('FISCAL_GATEWAY_TOKEN ainda nao esta configurado neste app. Status SERPRO consultado, sem importacao protegida.');
      return res.json({
        ok: true,
        cnpj: cnpjLimpo,
        modo: 'status_only',
        gateway: statusGateway,
        resumo: { importados: 0, atualizados: 0 },
        avisos
      });
    }

    const payload = await fiscalGatewayJson('/api/internal/plano-contas/fiscal/sync', {
      method: 'POST',
      timeoutMs: 30000,
      body: {
        cnpj: cnpjLimpo,
        competencia: String(req.body?.competencia || '').trim()
      }
    });

    const itens = [
      ...normalizarItensSerpro('DAS', payload.das),
      ...normalizarItensSerpro('DCTFWEB', payload.dctfweb),
      ...normalizarItensSerpro('CAIXA_POSTAL', payload.caixaPostal)
    ];

    const impostosRef = db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos');
    const agora = new Date();
    let gravados = 0;
    for (const item of itens) {
      const ref = impostosRef.doc(item.id);
      await ref.set({
        ...item,
        sincronizado_em: agora,
        atualizado_em: agora,
        atualizado_por_uid: req.user.uid,
        atualizado_por_email: req.user.email,
        criado_por_origem: 'SERPRO_BRIDGE'
      }, { merge: true });
      gravados++;
    }

    await db.collection('empresas').doc(cnpjLimpo).collection('fiscal_sync_logs').add({
      origem: 'SERPRO',
      gateway_url: FISCAL_GATEWAY_URL,
      gateway_modes: payload.modes || statusGateway,
      total_das: Array.isArray(payload.das) ? payload.das.length : 0,
      total_dctfweb: Array.isArray(payload.dctfweb) ? payload.dctfweb.length : 0,
      total_caixa_postal: Array.isArray(payload.caixaPostal) ? payload.caixaPostal.length : 0,
      total_gravado: gravados,
      erros: payload.erros || [],
      criado_em: agora,
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    });

    res.json({
      ok: true,
      cnpj: cnpjLimpo,
      modo: 'sincronizado',
      gateway: statusGateway,
      resumo: { importados: gravados, atualizados: gravados },
      erros: payload.erros || [],
      avisos
    });
  } catch (err) {
    console.error('sincronizar-serpro erro:', err);
    res.status(err.status || 500).json({
      erro: err.message,
      detalhe: err.data && (err.data.erro || err.data.error) ? (err.data.erro || err.data.error) : undefined
    });
  }
});

app.post('/api/empresas/:cnpj/sessao', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { state_json, resumo } = req.body || {};
    if (!state_json) return res.status(400).json({ erro: 'state_json obrigatorio' });
    const sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    const chunksRef = sessaoRef.collection('chunks');
    const chunksAntigos = await chunksRef.get();
    if (!chunksAntigos.empty) {
      const batchChunks = db.batch();
      chunksAntigos.docs.forEach(d => batchChunks.delete(d.ref));
      await batchChunks.commit();
    }
    const payloadSessao = {
      resumo: resumo || null,
      updated_at: new Date(),
      updated_by_uid: req.user.uid,
      updated_by_email: req.user.email
    };
    const limiteChunk = 450000;
    if (String(state_json).length > limiteChunk) {
      const partes = [];
      for (let i = 0; i < state_json.length; i += limiteChunk) partes.push(state_json.slice(i, i + limiteChunk));
      const batch = db.batch();
      partes.forEach((parte, idx) => {
        batch.set(chunksRef.doc(String(idx).padStart(4, '0')), { idx, parte });
      });
      await batch.commit();
      payloadSessao.state_json = null;
      payloadSessao.state_chunked = true;
      payloadSessao.state_chunks = partes.length;
      payloadSessao.state_bytes = state_json.length;
    } else {
      payloadSessao.state_json = state_json;
      payloadSessao.state_chunked = false;
      payloadSessao.state_chunks = 0;
      payloadSessao.state_bytes = state_json.length;
    }
    await sessaoRef.set(payloadSessao, { merge: true });
    await db.collection('empresas').doc(cnpjLimpo).set({ last_session_at: new Date(), last_session_by_email: req.user.email }, { merge: true });
    res.json({ ok: true, chunked: !!payloadSessao.state_chunked, chunks: payloadSessao.state_chunks || 0 });
  } catch (e) { console.error('salvar sessao erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/empresas/:cnpj/sessao', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const doc = await db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current').get();
    if (!doc.exists) return res.json({ encontrada: false });
    const dados = doc.data();
    if (dados && dados.state_chunked) {
      const chunks = await doc.ref.collection('chunks').orderBy('idx').get();
      dados.state_json = chunks.docs.map(d => d.data().parte || '').join('');
    }
    res.json({ encontrada: true, ...dados });
  } catch (e) { console.error('carregar sessao erro:', e); res.status(500).json({ erro: e.message }); }
});

app.post('/api/empresas/:cnpj/relatorio', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const { periodo, state_json, resumo } = req.body || {};
    if (!periodo || !state_json) return res.status(400).json({ erro: 'periodo e state_json obrigatorios' });
    const periodoKey = String(periodo).replace(/[^0-9-]/g, '');
    await db.collection('empresas').doc(cnpjLimpo).collection('relatorios').doc(periodoKey).set({
      periodo, state_json, resumo: resumo || null,
      fechado_em: new Date(), fechado_por_uid: req.user.uid, fechado_por_email: req.user.email
    });
    res.status(201).json({ ok: true, periodo: periodoKey });
  } catch (e) { console.error('salvar relatorio erro:', e); res.status(500).json({ erro: e.message }); }
});

app.get('/api/empresas/:cnpj/relatorios', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('relatorios').orderBy('fechado_em', 'desc').limit(100).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ==================== ACCESS LOGS ====================
app.post('/api/auth/log', async (req, res) => {
  try {
    const { event } = req.body || {};
    const evento = ['login', 'logout', 'signup'].includes(event) ? event : 'login';
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
    const user_agent = (req.headers['user-agent'] || '').slice(0, 300);
    await db.collection('access_logs').add({
      timestamp: new Date(), uid: req.user.uid, email: req.user.email,
      event: evento, ip, user_agent
    });
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();
    const updates = {
      last_login_at: new Date(),
      last_email: req.user.email,
      login_count: admin.firestore.FieldValue.increment(evento === 'login' ? 1 : 0)
    };
    if (!userDoc.exists || !userDoc.data().created_at) {
      updates.created_at = new Date();
    }
    await userRef.set(updates, { merge: true });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/admin/access-logs', adminRequired, async (req, res) => {
  try {
    const { email, limit, event } = req.query;
    const lim = Math.min(parseInt(limit) || 200, 1000);
    let query = db.collection('access_logs').orderBy('timestamp', 'desc');
    if (email) query = query.where('email', '==', email);
    if (event) query = query.where('event', '==', event);
    query = query.limit(lim);
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/admin/summary', adminRequired, async (req, res) => {
  try {
    const [users, logs] = await Promise.all([
      db.collection('users').get(),
      db.collection('access_logs').orderBy('timestamp', 'desc').limit(500).get()
    ]);
    const agora = Date.now();
    const dia = 24 * 60 * 60 * 1000;
    const logins24h = logs.docs.filter(d => {
      const t = d.data().timestamp;
      const ts = t && t.toMillis ? t.toMillis() : (t ? new Date(t).getTime() : 0);
      return d.data().event === 'login' && (agora - ts) < dia;
    }).length;
    res.json({
      total_users: users.size,
      admins: users.docs.filter(d => d.data().is_admin === true).length,
      logins_24h: logins24h,
      logs_amostrados: logs.size
    });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/layouts-bancarios', async (req, res) => {
  try {
    await garantirLayoutsBancariosPadrao();
    const snap = await db.collection('layouts_bancarios').get();
    const layouts = snap.docs.map(d => {
        const data = d.data() || {};
        const qualidade = avaliarAprovacaoLayoutBanco(data.banco, data.parser);
        return {
          id: d.id,
          ...data,
          qualidade,
          qualidade_apto_aprovacao: qualidade.apto,
          qualidade_casos_aprovados: qualidade.casos_aprovados,
          qualidade_evidencias_aprovadas: qualidade.evidencias_aprovadas
        };
      })
      .sort((a, b) => String(a.banco || '').localeCompare(String(b.banco || '')) || String(a.nome || '').localeCompare(String(b.nome || '')));
    res.json({ layouts });
  } catch (err) {
    console.error('layouts-bancarios GET erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/layouts-bancarios/:id/homologacao', adminRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ erro: 'id obrigatorio' });
    const statusPermitidos = new Set(['em_teste', 'homologado', 'aprovado', 'bloqueado']);
    const body = req.body || {};
    const homologacao_status = String(body.homologacao_status || '').trim();
    if (!statusPermitidos.has(homologacao_status)) return res.status(400).json({ erro: 'homologacao_status invalido' });
    const ref = db.collection('layouts_bancarios').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'layout nao encontrado' });
    const layoutAtual = doc.data() || {};
    if (homologacao_status === 'aprovado') {
      const avaliacao = avaliarAprovacaoLayoutBanco(layoutAtual.banco, layoutAtual.parser);
      if (!avaliacao.apto) {
        return res.status(409).json({
          erro: 'Layout ainda nao pode ser aprovado automaticamente',
          detalhe: avaliacao.motivo,
          qualidade: avaliacao
        });
      }
    }
    const patch = {
      homologacao_status,
      homologacao_observacao: String(body.homologacao_observacao || '').slice(0, 600),
      homologado_em: new Date(),
      homologado_por_uid: req.user.uid,
      homologado_por_email: req.user.email,
      atualizado_em: new Date()
    };
    await ref.set(patch, { merge: true });
    await db.collection('layout_events').add({
      tipo: 'homologacao',
      layout_id: id,
      banco: layoutAtual.banco || '',
      nomeBanco: layoutAtual.nomeBanco || '',
      layout: layoutAtual.nome || layoutAtual.layout || '',
      parser: layoutAtual.parser || '',
      homologacao_status,
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    });
    res.json({ ok: true, id, ...patch });
  } catch (err) {
    console.error('layouts-bancarios homologacao erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/layout-quality', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const casos = (LAYOUT_QUALITY_CASES || []).map(c => ({ ...c }));
    const evidencias = (LAYOUT_QUALITY_EVIDENCE || []).map(e => ({ ...e, banco: normalizarBancoLayout(e.banco) }));
    const cobertos = new Set(casos.map(c => normalizarBancoLayout(c.banco) + '_' + c.parser));
    const layoutsOficiais = (LAYOUTS_BANCARIOS_PADRAO || [])
      .filter(l => l.status !== 'Inativo')
      .map(l => ({ ...l, banco: normalizarBancoLayout(l.banco) }));
    const evidenciasPorLayout = new Set(evidencias.map(e => e.banco + '_' + e.parser));
    const aprovacao_layouts = layoutsOficiais.map(l => ({
      id: layoutBancoId(l),
      banco: l.banco,
      nomeBanco: l.nomeBanco,
      layout: l.nome,
      parser: l.parser,
      formato: l.formato,
      confiabilidade: l.confiabilidade,
      ultimoTeste: l.ultimoTeste,
      ...avaliarAprovacaoLayoutBanco(l.banco, l.parser)
    }));
    const pendentes = layoutsOficiais
      .filter(l => !cobertos.has(l.banco + '_' + l.parser))
      .map(l => ({
        banco: l.banco,
        nomeBanco: l.nomeBanco,
        layout: l.nome,
        parser: l.parser,
        formato: l.formato,
        confiabilidade: l.confiabilidade,
        ultimoTeste: l.ultimoTeste,
        possuiEvidencia: evidenciasPorLayout.has(l.banco + '_' + l.parser),
        observacao: l.observacao
      }));
    const cobertura = layoutsOficiais.length
      ? Math.round(((layoutsOficiais.length - pendentes.length) / layoutsOficiais.length) * 100)
      : 0;
    const resumo = {
      total_casos: casos.length,
      aprovados: casos.filter(c => c.status === 'Aprovado').length,
      bancos: [...new Set(casos.map(c => c.banco).filter(Boolean))].length,
      parsers: [...new Set(casos.map(c => c.parser).filter(Boolean))].length,
      evidencias: evidencias.length,
      layouts_oficiais: layoutsOficiais.length,
      layouts_pendentes: pendentes.length,
      layouts_aprovaveis: aprovacao_layouts.filter(l => l.apto).length,
      cobertura
    };
    const porBancoMap = new Map();
    layoutsOficiais.forEach(l => {
      const key = l.banco;
      if (!porBancoMap.has(key)) porBancoMap.set(key, { banco: key, nomeBanco: l.nomeBanco || '', layouts: 0, regressao: 0, evidencias: 0, alta: 0, media: 0 });
      const item = porBancoMap.get(key);
      item.layouts++;
      if (String(l.confiabilidade || '').toLowerCase() === 'alta') item.alta++;
      else item.media++;
      if (cobertos.has(l.banco + '_' + l.parser)) item.regressao++;
      if (evidenciasPorLayout.has(l.banco + '_' + l.parser)) item.evidencias++;
    });
    const confiabilidade_bancos = Array.from(porBancoMap.values()).map(item => {
      const coberturaBanco = item.layouts ? Math.round((item.regressao / item.layouts) * 100) : 0;
      const score = Math.min(100, Math.round((coberturaBanco * 0.7) + ((item.alta / Math.max(item.layouts, 1)) * 30)));
      return { ...item, cobertura: coberturaBanco, score };
    }).sort((a, b) => b.score - a.score || String(a.banco).localeCompare(String(b.banco)));
    res.json({ resumo, casos, pendentes, evidencias, aprovacao_layouts, confiabilidade_bancos });
  } catch (err) {
    console.error('layout-quality GET erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/layouts-bancarios/uso', async (req, res) => {
  try {
    const body = req.body || {};
    const banco = normalizarBancoLayout(body.banco);
    const parser = String(body.parser || '').trim();
    if (!banco || !parser) return res.status(400).json({ erro: 'banco e parser obrigatorios' });
    const base = LAYOUTS_BANCARIOS_PADRAO.find(l => normalizarBancoLayout(l.banco) === banco && l.parser === parser) || {};
    const nome = body.nome || body.layout || base.nome || parser;
    const id = layoutBancoId({ banco, parser });
    const ref = db.collection('layouts_bancarios').doc(id);
    const doc = await ref.get();
    const atual = doc.exists ? doc.data() : {};
    await ref.set({
      ...base,
      ...atual,
      banco,
      parser,
      nome,
      nomeBanco: body.nomeBanco || atual.nomeBanco || base.nomeBanco || '',
      formato: body.formato || atual.formato || base.formato || 'PDF',
      confiabilidade: body.confiabilidade || atual.confiabilidade || base.confiabilidade || 'Media',
      status: 'Ativo',
      ativo: true,
      ultimoTeste: body.arquivo_exemplo || atual.ultimoTeste || base.ultimoTeste || '',
      ultimo_arquivo: body.arquivo_exemplo || atual.ultimo_arquivo || '',
      ultimo_uso_em: new Date(),
      ultimo_uso_por_uid: req.user.uid,
      ultimo_uso_por_email: req.user.email,
      total_usos: (atual.total_usos || 0) + 1,
      origem: atual.origem || base.origem || 'importador',
      atualizado_em: new Date()
    }, { merge: true });
    await db.collection('layout_events').add({
      tipo: 'sucesso',
      banco,
      nomeBanco: body.nomeBanco || atual.nomeBanco || base.nomeBanco || '',
      layout: nome,
      parser,
      formato: body.formato || atual.formato || base.formato || 'PDF',
      arquivo: body.arquivo_exemplo || '',
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    });
    res.json({ ok: true, id });
  } catch (err) {
    console.error('layouts-bancarios uso erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/layout-rejections', async (req, res) => {
  try {
    const body = req.body || {};
    const banco = normalizarBancoLayout(body.banco || '');
    const arquivo = String(body.arquivo || '').slice(0, 220);
    const motivo = String(body.motivo || '').slice(0, 1200);
    if (!arquivo || !motivo) return res.status(400).json({ erro: 'arquivo e motivo obrigatorios' });
    const doc = {
      banco,
      nomeBanco: body.nomeBanco || '',
      layout: body.layout || '',
      parser: body.parser || '',
      arquivo,
      tamanho: Number(body.tamanho || 0),
      formato: String(body.formato || '').slice(0, 20),
      empresa: String(body.empresa || '').slice(0, 220),
      cnpj: String(body.cnpj || '').replace(/\D/g, ''),
      periodo_inicio: body.periodo_inicio || '',
      periodo_fim: body.periodo_fim || '',
      motivo,
      status: body.status || 'pendente_parametrizacao',
      origem: body.origem || 'extrator',
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    };
    const ref = await db.collection('layout_rejections').add(doc);
    res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('layout-rejections POST erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/layout-rejections', adminRequired, async (req, res) => {
  try {
    const lim = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const snap = await db.collection('layout_rejections').orderBy('criado_em', 'desc').limit(lim).get();
    res.json({ rejeicoes: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error('layout-rejections GET erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/layout-rejections/:id', adminRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ erro: 'id obrigatorio' });
    const statusPermitidos = new Set(['pendente_parametrizacao', 'em_parametrizacao', 'resolvido', 'ignorado']);
    const body = req.body || {};
    const status = String(body.status || '').trim();
    if (status && !statusPermitidos.has(status)) return res.status(400).json({ erro: 'status invalido' });
    const ref = db.collection('layout_rejections').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'rejeicao nao encontrada' });
    const patch = {
      atualizado_em: new Date(),
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email
    };
    if (status) patch.status = status;
    if (typeof body.observacao_admin === 'string') patch.observacao_admin = body.observacao_admin.slice(0, 600);
    await ref.set(patch, { merge: true });
    res.json({ ok: true, id, ...patch });
  } catch (err) {
    console.error('layout-rejections PATCH erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/layout-quality/ops', adminRequired, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const lim = Math.min(parseInt(req.query.limit, 10) || 500, 1000);
    const [eventosSnap, rejeicoesSnap] = await Promise.all([
      db.collection('layout_events').orderBy('criado_em', 'desc').limit(lim).get(),
      db.collection('layout_rejections').orderBy('criado_em', 'desc').limit(lim).get()
    ]);
    const usuarios = new Map();
    const bancos = new Map();
    const meses = new Map();
    const status = {};
    const mesEvento = (valor) => {
      const ms = valor && typeof valor.toMillis === 'function'
        ? valor.toMillis()
        : (valor ? new Date(valor).getTime() : 0);
      if (!ms || Number.isNaN(ms)) return 'sem-mes';
      return new Date(ms).toISOString().slice(0, 7);
    };
    const ensureUsuario = (email) => {
      const key = email || 'sem-email';
      if (!usuarios.has(key)) usuarios.set(key, { email: key, sucessos: 0, rejeicoes: 0, pendentes: 0, em_parametrizacao: 0, resolvidos: 0, ignorados: 0, bancos: new Set() });
      return usuarios.get(key);
    };
    const ensureBanco = (banco, nomeBanco) => {
      const key = banco || 'sem-banco';
      if (!bancos.has(key)) bancos.set(key, { banco: key, nomeBanco: nomeBanco || '', sucessos: 0, rejeicoes: 0 });
      const item = bancos.get(key);
      if (!item.nomeBanco && nomeBanco) item.nomeBanco = nomeBanco;
      return item;
    };
    const ensureMes = (mes) => {
      const key = mes || 'sem-mes';
      if (!meses.has(key)) meses.set(key, { mes: key, sucessos: 0, rejeicoes: 0, bancos: new Map(), colaboradores: new Map() });
      return meses.get(key);
    };
    const ensureItemMes = (map, key, extra) => {
      const id = key || 'sem-identificacao';
      if (!map.has(id)) map.set(id, { id, sucessos: 0, rejeicoes: 0, ...(extra || {}) });
      const item = map.get(id);
      if (extra) Object.keys(extra).forEach(k => { if (!item[k] && extra[k]) item[k] = extra[k]; });
      return item;
    };
    eventosSnap.docs.forEach(d => {
      const e = d.data() || {};
      const u = ensureUsuario(e.criado_por_email || e.ultimo_uso_por_email || '');
      u.sucessos++;
      if (e.banco) u.bancos.add(e.banco);
      const b = ensureBanco(e.banco, e.nomeBanco);
      b.sucessos++;
      const mes = ensureMes(mesEvento(e.criado_em || e.ultimo_uso_em));
      mes.sucessos++;
      ensureItemMes(mes.bancos, e.banco, { banco: e.banco || 'sem-banco', nomeBanco: e.nomeBanco || '' }).sucessos++;
      ensureItemMes(mes.colaboradores, e.criado_por_email || e.ultimo_uso_por_email || 'sem-email', { email: e.criado_por_email || e.ultimo_uso_por_email || 'sem-email' }).sucessos++;
    });
    rejeicoesSnap.docs.forEach(d => {
      const r = d.data() || {};
      const st = r.status || 'pendente_parametrizacao';
      status[st] = (status[st] || 0) + 1;
      const u = ensureUsuario(r.criado_por_email || '');
      u.rejeicoes++;
      if (r.banco) u.bancos.add(r.banco);
      if (st === 'pendente_parametrizacao') u.pendentes++;
      if (st === 'em_parametrizacao') u.em_parametrizacao++;
      if (st === 'resolvido') u.resolvidos++;
      if (st === 'ignorado') u.ignorados++;
      const b = ensureBanco(r.banco, r.nomeBanco);
      b.rejeicoes++;
      const mes = ensureMes(mesEvento(r.criado_em));
      mes.rejeicoes++;
      ensureItemMes(mes.bancos, r.banco, { banco: r.banco || 'sem-banco', nomeBanco: r.nomeBanco || '' }).rejeicoes++;
      ensureItemMes(mes.colaboradores, r.criado_por_email || 'sem-email', { email: r.criado_por_email || 'sem-email' }).rejeicoes++;
    });
    const por_colaborador = Array.from(usuarios.values()).map(u => {
      const total = u.sucessos + u.rejeicoes;
      return {
        ...u,
        bancos: Array.from(u.bancos),
        taxa_acerto: total ? Math.round((u.sucessos / total) * 100) : 0,
        total
      };
    }).sort((a, b) => b.total - a.total || b.taxa_acerto - a.taxa_acerto);
    const por_banco = Array.from(bancos.values()).map(b => {
      const total = b.sucessos + b.rejeicoes;
      return { ...b, total, taxa_acerto: total ? Math.round((b.sucessos / total) * 100) : 0 };
    }).sort((a, b) => b.total - a.total || String(a.banco).localeCompare(String(b.banco)));
    const alertas = [];
    por_banco.forEach(b => {
      if (b.rejeicoes >= 3 && b.taxa_acerto < 80) {
        alertas.push({
          tipo: 'banco',
          severidade: b.taxa_acerto < 50 || b.rejeicoes >= 10 ? 'alta' : 'media',
          titulo: `${b.banco} ${b.nomeBanco || ''}`.trim(),
          detalhe: `${b.rejeicoes} rejeicao(oes), taxa ${b.taxa_acerto}%`,
          banco: b.banco,
          nomeBanco: b.nomeBanco || '',
          taxa_acerto: b.taxa_acerto,
          rejeicoes: b.rejeicoes,
          sucessos: b.sucessos
        });
      }
    });
    por_colaborador.forEach(u => {
      const pendencias = (u.pendentes || 0) + (u.em_parametrizacao || 0);
      if (pendencias >= 3 || (u.rejeicoes >= 5 && u.taxa_acerto < 75)) {
        alertas.push({
          tipo: 'colaborador',
          severidade: pendencias >= 10 || u.taxa_acerto < 50 ? 'alta' : 'media',
          titulo: u.email || 'sem-email',
          detalhe: `${pendencias} pendencia(s), ${u.rejeicoes} rejeicao(oes), taxa ${u.taxa_acerto}%`,
          email: u.email,
          pendencias,
          taxa_acerto: u.taxa_acerto,
          rejeicoes: u.rejeicoes,
          sucessos: u.sucessos
        });
      }
    });
    alertas.sort((a, b) => {
      const peso = s => s === 'alta' ? 2 : 1;
      return peso(b.severidade) - peso(a.severidade) || (b.rejeicoes || b.pendencias || 0) - (a.rejeicoes || a.pendencias || 0);
    });
    const mensal = Array.from(meses.values()).map(m => {
      const total = m.sucessos + m.rejeicoes;
      const bancosMes = Array.from(m.bancos.values()).map(b => {
        const itemTotal = b.sucessos + b.rejeicoes;
        return { ...b, total: itemTotal, taxa_acerto: itemTotal ? Math.round((b.sucessos / itemTotal) * 100) : 0 };
      }).sort((a, b) => b.rejeicoes - a.rejeicoes || b.total - a.total || String(a.banco).localeCompare(String(b.banco))).slice(0, 8);
      const colaboradoresMes = Array.from(m.colaboradores.values()).map(u => {
        const itemTotal = u.sucessos + u.rejeicoes;
        return { ...u, total: itemTotal, taxa_acerto: itemTotal ? Math.round((u.sucessos / itemTotal) * 100) : 0 };
      }).sort((a, b) => b.rejeicoes - a.rejeicoes || b.total - a.total || String(a.email).localeCompare(String(b.email))).slice(0, 8);
      return {
        mes: m.mes,
        sucessos: m.sucessos,
        rejeicoes: m.rejeicoes,
        total,
        taxa_acerto: total ? Math.round((m.sucessos / total) * 100) : 0,
        bancos: bancosMes,
        colaboradores: colaboradoresMes
      };
    }).sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
    res.json({
      resumo: {
        sucessos: eventosSnap.size,
        rejeicoes: rejeicoesSnap.size,
        pendentes: status.pendente_parametrizacao || 0,
        em_parametrizacao: status.em_parametrizacao || 0,
        resolvidos: status.resolvido || 0,
        ignorados: status.ignorado || 0
      },
      status,
      por_colaborador,
      por_banco,
      mensal,
      alertas: alertas.slice(0, 20)
    });
  } catch (err) {
    console.error('layout-quality ops erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// Rota da pagina admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// AuditAI — app React buildado
app.use('/auditai', express.static(path.join(__dirname, 'auditai'), { index: 'index.html' }));
app.get('/auditai*', (req, res) => {
  res.sendFile(path.join(__dirname, 'auditai', 'index.html'));
});

app.use(express.static(__dirname, { index: 'index.html' }));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });


// ═══════════════════════════════════════════════════════════════════════════
// GEMINI SDK ENDPOINTS — AuditAI e Extratos (admin-only)
// Separado do proxy /api/ai/gemini existente (que continua aberto para o
// classificador IA do plano-contas-iob usado por todos os usuarios).
// ═══════════════════════════════════════════════════════════════════════════
let _geminiClient = null;
function getGeminiClient() {
  if (_geminiClient) return _geminiClient;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const { GoogleGenAI } = require('@google/genai');
  _geminiClient = new GoogleGenAI({ apiKey: key });
  return _geminiClient;
}

app.post('/api/gemini/generate', adminRequired, async (req, res) => {
  const client = getGeminiClient();
  if (!client) return res.status(503).json({ erro: 'GEMINI_API_KEY nao configurada' });
  const { model = 'gemini-2.5-flash', contents, config = {}, systemInstruction } = req.body || {};
  if (!contents) return res.status(400).json({ erro: 'contents obrigatorio' });
  try {
    const response = await client.models.generateContent({
      model,
      contents,
      config: Object.assign({}, config, systemInstruction ? { systemInstruction } : {})
    });
    res.json({ text: response.text || '', raw: response });
  } catch (err) {
    console.error('[gemini/generate]', err && err.message);
    const status = err && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ erro: (err && err.message) || 'Erro Gemini' });
  }
});

app.post('/api/gemini/chat', adminRequired, async (req, res) => {
  const client = getGeminiClient();
  if (!client) return res.status(503).json({ erro: 'GEMINI_API_KEY nao configurada' });
  const { model = 'gemini-2.5-pro', history = [], message, systemInstruction, tools } = req.body || {};
  if (!message) return res.status(400).json({ erro: 'message obrigatorio' });
  try {
    const cfg = {};
    if (systemInstruction) cfg.systemInstruction = systemInstruction;
    if (tools) cfg.tools = tools;
    const chat = client.chats.create({ model, history, config: cfg });
    const result = await chat.sendMessage({ message });
    res.json({ text: result.text || '' });
  } catch (err) {
    console.error('[gemini/chat]', err && err.message);
    res.status(500).json({ erro: (err && err.message) || 'Erro chat' });
  }
});


app.listen(PORT, () => {
  const versao = lerVersao().version || require('./package.json').version || 'dev';
  console.log('[plano-contas-iob v' + versao + '] porta ' + PORT);
  garantirLayoutsBancariosPadrao().catch(err => console.error('[layouts bancarios] bootstrap falhou:', err && err.message));
});
