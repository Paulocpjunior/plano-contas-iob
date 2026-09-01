const express = require('express');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { validarVersaoParaNovaImportacao } = require('./session-import-version-guard');
const { avaliarRevisaoSessao } = require('./session-revision-guard');
const { aplicarPlanoNaSessao, usuarioPodeAcessarEmpresa } = require('./empresa-plano-vinculo');
const admin = require('firebase-admin');
const path = require('path');
const { LAYOUTS_BANCARIOS_PADRAO, normalizarBancoLayout, layoutBancoId } = require('./layouts-bancarios-padrao');
const { LAYOUTS_FISCAIS_PADRAO } = require('./layouts-fiscais-padrao');
const { LAYOUT_QUALITY_CASES } = require('./layout-quality-cases');
const { LAYOUT_QUALITY_EVIDENCE } = require('./layout-quality-evidence');
const { criarGovernancaRejeicao, prepararAtualizacao, resumirSla } = require('./layout-quality-workflow');
const { FINGERPRINT_VERSAO, categoriaDaRejeicao, fingerprintCasoRejeicao, fingerprintEfetivo, agruparCasosRejeicao } = require('./layout-rejection-case');
const { registrarRotasMercadoPago, registrarRotasPublicasMercadoPago } = require('./mercadopago-integration');
const registrarRotasReinf = require('./reinf-routes');
const cryptoAdmin = require('crypto');
const { montarPreviaExclusao, aplicarExclusao, fingerprintsImportacaoLiberados } = require('./admin-exclusao-lancamentos');
const { aplicarNoEstado: aplicarMigracaoSageNoEstado, prepararStaging: prepararStagingMigracaoSage, removerLoteDoEstado: removerMigracaoSageDoEstado, sha256: hashMigracaoSage } = require('./migracao-sage-executor');
const { camposCadastroEmpresa, codigoEmpresaDe, empresaBateBusca } = require('./empresa-cadastro');
const { statusWhatsappCfi, enviarWhatsappCfi } = require('./whatsapp-cfi-client');
const { buscarRegimeNoCfi } = require('./cfi-regime-client');
const { exigeSaldoAbertura, periodoInicialEmpresa, validarSaldosAbertura, proximoPeriodo, saldosParaTransporte } = require('./implantacao-contabil');
const { avaliarProntidaoContabil } = require('./prontidao-contabil');
const { avaliarProgressaoEmpresa, resumirProgressao, usuarioAtribuido } = require('./progressao-contabil');
const { sanitizarAcompanhamento } = require('./acompanhamento-contabil');
const ProgressaoAlertas = require('./progressao-alertas');
const { avaliarParametrizacaoRegime, sanitizarParametrizacaoRegime } = require('./parametrizacao-regime');
const { atribuirResponsavel, camposCarteira, normalizarResponsaveis, removerResponsavel } = require('./carteira-contabil');
const RelatoriosContabeis = require('./relatorios-contabeis');
const AtivoImobilizado = require('./ativo-imobilizado');
const AtivoImobilizadoContabil = require('./ativo-imobilizado-contabil');
const ConciliacaoContabil = require('./conciliacao-contabil');
const ConciliacaoDetalhada = require('./conciliacao-detalhada');
const HomologacaoPiloto = require('./homologacao-piloto');
const GraphEmail = require('./graph-email-provider');
const { ACOES_ADMIN_CCI, textoBaseAjuda, parecePerguntaAdministrativa, buscarOrientacaoAjuda } = require('./ajuda-cci-base');
const { conteudo: MANUAL_CCI } = require('./manual-cci-base');
const { extractAccountingPdf } = require('./auditai/pdf-contabil-extractor');
const { validarCoberturaFiscal, montarMatrizTributos, validarPayloadFiscalConnector, resumirItensFiscais } = require('./fiscal-payments-contract');
const {
  ENCODING_PLAIN,
  LIMITE_CHUNK_SESSAO,
  codificarStateJson,
  decodificarPayload,
  stateJsonDoBody,
  dividirPayload,
} = require('./session-state-codec');
const {
  verificarTamanhoJson,
  aplicarHeadersSeguranca,
  criarLimitador,
} = require('./http-hardening');
const { criarObservabilidadeHttp } = require('./observability');
const { carregarRuntimeConfig, identidadePublica } = require('./runtime-config');
const { montarEventoAuditoriaAdmin, registrarAuditoriaAdmin } = require('./admin-audit-trail');

const app = express();
app.set('trust proxy', true);
app.set('etag', false);
app.disable('x-powered-by');
const PORT = process.env.PORT || 8080;
const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || process.env.GEMINI_FLASH_MODEL || 'gemini-3.7-flash';
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_PRO_MODEL || GEMINI_DEFAULT_MODEL;
const GEMINI_ALLOW_CLIENT_MODEL = String(process.env.GEMINI_ALLOW_CLIENT_MODEL || '').toLowerCase() === 'true';
const runtimeConfig = carregarRuntimeConfig(process.env);
const db = new Firestore({
  projectId: runtimeConfig.dataProjectId,
  databaseId: runtimeConfig.dataDatabaseId,
});
const firestorePorProjeto = new Map();
admin.initializeApp({ projectId: runtimeConfig.authProjectId });
const adminAuth = admin.auth();
const DOMAIN = '@spassessoriacontabil.com.br';

app.use(aplicarHeadersSeguranca);
app.use(criarObservabilidadeHttp());
app.use('/api', criarLimitador({
  janelaMs: 60 * 1000,
  maximo: 3000,
  chave: (req) => req.ip || req.socket?.remoteAddress || 'ip-desconhecido',
}));
app.use(express.json({ limit: '100mb', verify: verificarTamanhoJson }));

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
    res.set('Clear-Site-Data', '"cache"');
    res.json(lerVersao());
});


app.get('/api/health', async (req, res) => {
  try {
    const test = await db.collection('planos').limit(1).get();
    res.json({ status: 'ok', versao: lerVersao().version || 'dev', firestore: 'connected', planos_existem: test.size > 0, gemini_model: GEMINI_DEFAULT_MODEL, projects: identidadePublica(runtimeConfig) });
  } catch (err) { res.status(500).json({ status: 'erro', erro: err.message }); }
});

registrarRotasPublicasMercadoPago(app, { db });

async function authRequired(req, res, next) {
  const rotaInternaAlertas = '/api/internal/progressao-contabil/processar-alertas';
  const caminho = String(req.originalUrl || '').split('?')[0];
  const tokenInterno = String(req.get && req.get('x-cci-alert-token') || '');
  const segredoInterno = String(process.env.CCI_PROGRESSAO_ALERT_TOKEN || '');
  const tokenInternoValido = caminho === rotaInternaAlertas
    && tokenInterno.length > 0
    && tokenInterno.length === segredoInterno.length
    && cryptoAdmin.timingSafeEqual(Buffer.from(tokenInterno), Buffer.from(segredoInterno));
  if (tokenInternoValido) {
    req.internalScheduler = true;
    return next();
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Token ausente. Faca login no app.' });
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email || !decoded.email.endsWith(DOMAIN)) return res.status(403).json({ erro: 'Dominio nao autorizado' });
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    req.user = { uid: decoded.uid, email: decoded.email, name: decoded.name || decoded.email, is_admin: userDoc.exists && userDoc.data().is_admin === true };
    next();
  } catch (err) { return res.status(401).json({ erro: 'Token invalido', detalhe: err.message }); }
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({
    erro: 'Esta função é exclusiva para administradores. Procure um administrador e informe a empresa, a tela e a ação desejada.',
    codigo: 'ADMIN_REQUIRED',
    procurar_ajuda: true
  });
  next();
}

app.use('/api', authRequired);
app.use('/api', criarLimitador({
  janelaMs: 60 * 1000,
  maximo: 1200,
  chave: (req) => req.user && req.user.uid || req.ip || 'usuario-desconhecido',
}));
app.use('/api/empresas/:cnpj/sessao', criarLimitador({
  janelaMs: 60 * 1000,
  maximo: 240,
  aplicar: (req) => req.method === 'POST',
  chave: (req) => `${req.user && req.user.uid || 'usuario'}:${String(req.params.cnpj || '').replace(/\D/g, '')}`,
}));
app.use('/api/admin/empresas/:cnpj/migracao-sage', criarLimitador({
  janelaMs: 60 * 1000,
  maximo: 30,
  aplicar: (req) => req.method === 'POST',
  chave: (req) => `${req.user && req.user.uid || 'usuario'}:${String(req.params.cnpj || '').replace(/\D/g, '')}`,
}));
app.use('/api/gemini', criarLimitador({
  janelaMs: 60 * 1000,
  maximo: 60,
  aplicar: (req) => req.method === 'POST',
  chave: (req) => req.user && req.user.uid || req.ip || 'usuario-desconhecido',
}));

app.post('/api/auditai/extrair-pdf-contabil', adminRequired, async (req, res) => {
  const base64 = String((req.body && req.body.data) || '').replace(/^data:application\/pdf;base64,/, '');
  if (!base64) return res.status(400).json({ erro: 'PDF não informado.', codigo: 'PDF_AUSENTE' });
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      return res.status(400).json({ erro: 'Arquivo PDF inválido.', codigo: 'PDF_INVALIDO' });
    }
    const result = await extractAccountingPdf(buffer);
    return res.json(result);
  } catch (error) {
    const structuredTextMissing = error && error.code === 'PDF_SEM_TEXTO_ESTRUTURADO';
    console.error('[auditai/pdf-local]', error && error.message);
    return res.status(structuredTextMissing ? 422 : 500).json({
      erro: structuredTextMissing
        ? 'O PDF não contém texto contábil estruturado. O AuditAI tentará a leitura assistida por imagem.'
        : 'Não foi possível extrair o PDF contábil localmente.',
      codigo: structuredTextMissing ? 'PDF_SEM_TEXTO_ESTRUTURADO' : 'PDF_EXTRACAO_LOCAL_ERRO',
    });
  }
});

// Gate de departamento do SaaS (08/08): pergunta ao cadastro central do CFI
// se o usuário está vinculado ao módulo Contábil. Nasce em MODO AVISO — vira
// bloqueio pela env DEPARTAMENTO_GATE_MODO=bloqueio quando os vínculos
// estiverem preenchidos no Gerenciar Usuários do CFI.
require('./departamento-gate').registrarGateDepartamento(app);
registrarRotasReinf(app, { db });
registrarRotasMercadoPago(app, { db, adminRequired });

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
    casos_ids: casosAprovados.map(c => c.id),
    evidencias_ids: evidenciasAprovadas.map(e => e.id),
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
const { parseSageFolhaFpimp } = require('./parser-sage-folha-fpimp');

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
// Aceita o Resumo Geral em PDF e o arquivo texto FPIMPnnnn.mm da SAGE Folha.
app.post('/api/folha/parse-resumo', uploadFolha.fields([{ name: 'arquivo', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const arquivo = ((req.files && req.files.arquivo) || (req.files && req.files.pdf) || [])[0];
    if (!arquivo) return res.status(400).json({ erro: 'arquivo não enviado' });
    const cnpjLimpo = String(req.body && req.body.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ da empresa ativa não informado' });
    const acesso = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
    const ehPdf = arquivo.buffer.slice(0, 5).toString('ascii') === '%PDF-';
    let resultado;
    if (ehPdf) {
      resultado = await parseResumoIOB(arquivo.buffer);
      resultado.formato = 'resumo_geral_pdf';
      resultado.layout = 'Resumo Geral IOB/SAGE (PDF)';
      resultado.nome_arquivo = arquivo.originalname;
      if (resultado.cnpj && resultado.cnpj.replace(/\D/g, '') !== cnpjLimpo) {
        return res.status(409).json({ erro: 'O CNPJ do PDF não corresponde à empresa ativa.' });
      }
    } else {
      resultado = parseSageFolhaFpimp(arquivo.buffer, {
        nomeArquivo: arquivo.originalname,
        codigoEmpresa: codigoEmpresaDe(acesso.empresa)
      });
      resultado.cnpj = cnpjLimpo;
      resultado.empresa = acesso.empresa.razao_social || '';
    }
    res.json(resultado);
  } catch (err) {
    console.error('parse-resumo erro:', err.message);
    res.status(400).json({ erro: err.message });
  }
});

// POST /api/folha/registrar-importacao
app.post('/api/folha/registrar-importacao', async (req, res) => {
  try {
    const { cnpj, competencia, raw_text_hash, total_lancamentos, total_valor } = req.body;
    if (!cnpj || !competencia || !raw_text_hash) {
      return res.status(400).json({ erro: 'campos obrigatórios: cnpj, competencia, raw_text_hash' });
    }
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido' });
    const acesso = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
    const docRef = await db.collection('folha_importacoes').add({
      owner_uid: req.user.uid,
      cnpj: cnpjLimpo, competencia, raw_text_hash,
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
    const empresas = snap.docs
      .filter(d => usuarioPodeAcessarEmpresa(d.data() || {}, req.user))
      .map(d => {
      const data = d.data();
      const cnpjLimpo = d.id;
      const cnpjFmt = cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      return {
        cnpj: cnpjLimpo,
        cnpj_formatado: cnpjFmt,
        razao_social: data.razao_social || null,
        codigo_empresa: codigoEmpresaDe(data) || null,
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
    const acesso = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
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
    const acesso = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
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
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido' });
    const acesso = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
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

function snapshotAprendizadoAudit(dados) {
  if (!dados) return null;
  return {
    descricao_normalizada: dados.descricao_normalizada || '',
    descricao_exemplo: dados.descricao_exemplo || '',
    contaDebito: dados.contaDebito || '',
    contaCredito: dados.contaCredito || '',
    codigoHistorico: dados.codigoHistorico || '',
    historico: dados.historico || '',
    historicoPadraoDescricao: dados.historicoPadraoDescricao || '',
    direcao: dados.direcao || ''
  };
}

async function registrarEventoAprendizado(tipo, cnpj, hash, antes, depois, req) {
  try {
    await db.collection('aprendizado_events').add({
      tipo,
      cnpj,
      hash,
      antes: snapshotAprendizadoAudit(antes),
      depois: snapshotAprendizadoAudit(depois),
      criado_em: new Date(),
      criado_por_uid: req.user && req.user.uid || '',
      criado_por_email: req.user && req.user.email || '',
      origem: 'memoria_empresa'
    });
  } catch (err) {
    console.warn('[aprendizado_events] falha ao registrar auditoria:', err.message || err);
  }
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
    const { hash, descricao_normalizada, descricao_exemplo, contaDebito, contaCredito, codigoHistorico, historico, historicoPadraoDescricao, bancoCodigo, bancoNome, layoutParser, layoutNome, escopo, direcao } = req.body;
    if (!hash || !descricao_normalizada) return res.status(400).json({ erro: 'hash e descricao_normalizada obrigatorios' });
    const descricaoNormalizada = String(descricao_normalizada || '').trim().toLowerCase();
    const tokensDescricao = descricaoNormalizada.split(/\s+/).filter(token => token.length >= 3);
    const cobrancaEscopada = descricaoNormalizada === 'cobranca'
      && !!String(bancoCodigo || '').trim()
      && ['credito', 'debito'].includes(String(direcao || '').toLowerCase());
    if (tokensDescricao.length < 2 && !cobrancaEscopada) {
      return res.status(400).json({ erro: 'Padrao generico exige identificacao adicional; cobranca so pode ser memorizada com banco e direcao.' });
    }
    
    // Validar codigoHistorico (4 digitos)
    const codHist = codigoHistorico ? String(codigoHistorico).replace(/\D/g, '').padStart(4, '0').slice(-4) : null;
    if (codHist && !/^\d{4}$/.test(codHist)) return res.status(400).json({ erro: 'codigoHistorico invalido' });
    
    const docId = cnpj + '_' + hash;
    const ref = db.collection('aprendizado').doc(docId);
    const existing = await ref.get();
    if (existing.exists && !req.user.is_admin) {
      return res.status(403).json({ erro: 'Somente administradores podem alterar uma memorizacao existente.' });
    }
    const now = new Date();
    
    const dados = {
      cnpj: cnpj,
      hash: hash,
      descricao_normalizada: descricaoNormalizada.substring(0, 200),
      descricao_exemplo: String(descricao_exemplo || '').substring(0, 200),
      contaDebito: contaDebito || '',
      contaCredito: contaCredito || '',
      codigoHistorico: codHist || '',
      historico: String(historico || '').substring(0, 200),
      historicoPadraoDescricao: String(historicoPadraoDescricao || '').substring(0, 200),
      bancoCodigo: String(bancoCodigo || '').substring(0, 20),
      bancoNome: String(bancoNome || '').substring(0, 120),
      layoutParser: String(layoutParser || '').substring(0, 120),
      layoutNome: String(layoutNome || '').substring(0, 160),
      escopo: String(escopo || '').substring(0, 40),
      direcao: ['credito', 'debito'].includes(String(direcao || '').toLowerCase()) ? String(direcao).toLowerCase() : '',
      vezes_usado: existing.exists ? (existing.data().vezes_usado || 0) + 1 : 1,
      criado_em: existing.exists ? existing.data().criado_em : now,
      ultima_vez: now,
      auditavel: true,
      fonte_ultima_alteracao: 'memorizar_lancamento',
      atualizado_em: now,
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email,
      created_by: req.user.uid,
      created_by_email: req.user.email
    };
    
    await ref.set(dados);
    await registrarEventoAprendizado(existing.exists ? 'atualizado_por_memorizacao' : 'criado', cnpj, hash, existing.exists ? existing.data() : null, dados, req);
    res.json({ ok: true, docId: docId, vezes_usado: dados.vezes_usado });
  } catch (err) {
    console.error('[POST aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.put('/api/empresas/:cnpj/aprendizado/:hash', adminRequired, async (req, res) => {
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
      ...(body.bancoCodigo !== undefined ? { bancoCodigo: String(body.bancoCodigo || '').substring(0, 20) } : {}),
      ...(body.bancoNome !== undefined ? { bancoNome: String(body.bancoNome || '').substring(0, 120) } : {}),
      ...(body.layoutParser !== undefined ? { layoutParser: String(body.layoutParser || '').substring(0, 120) } : {}),
      ...(body.layoutNome !== undefined ? { layoutNome: String(body.layoutNome || '').substring(0, 160) } : {}),
      ...(body.escopo !== undefined ? { escopo: String(body.escopo || '').substring(0, 40) } : {}),
      ...(body.direcao !== undefined ? { direcao: ['credito', 'debito'].includes(String(body.direcao || '').toLowerCase()) ? String(body.direcao).toLowerCase() : '' } : {}),
      atualizado_em: new Date(),
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email,
      auditavel: true,
      fonte_ultima_alteracao: 'modal_memoria_empresa'
    };
    await ref.set(atualizacao, { merge: true });
    await registrarEventoAprendizado('editado', cnpj, hash, doc.data(), { ...doc.data(), ...atualizacao }, req);
    res.json({ ok: true, docId, ...atualizacao });
  } catch (err) {
    console.error('[PUT aprendizado] erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// Remove um padrao aprendido
app.delete('/api/empresas/:cnpj/aprendizado/:hash', adminRequired, async (req, res) => {
  try {
    const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
    const hash = req.params.hash;
    if (cnpj.length !== 14 || !hash) return res.status(400).json({ erro: 'CNPJ e hash obrigatorios' });
    const docId = cnpj + '_' + hash;
    const ref = db.collection('aprendizado').doc(docId);
    const doc = await ref.get();
    await ref.delete();
    await registrarEventoAprendizado('excluido', cnpj, hash, doc.exists ? doc.data() : null, null, req);
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

async function listarEmpresasAcessiveis(user, opcoes) {
  const opts = opcoes || {};
  if (user && user.is_admin && opts.somenteVinculadas !== true) {
    const snap = await db.collection('empresas').get();
    return snap.docs;
  }
  const uid = user && user.uid ? String(user.uid) : '';
  if (!uid) return [];
  const consultas = [
    db.collection('empresas').where('owner_uid', '==', uid).get(),
    db.collection('empresas').where('vinculado_por_uid', '==', uid).get(),
    db.collection('empresas').where('acesso_uids', 'array-contains', uid).get(),
    db.collection('empresas').where('carteira_uids', 'array-contains', uid).get()
  ];
  const resultados = await Promise.all(consultas);
  const unicos = new Map();
  resultados.forEach(function(snap) {
    snap.docs.forEach(function(doc) { unicos.set(doc.id, doc); });
  });
  return Array.from(unicos.values());
}

async function validarCodigoEmpresaUnico(codigo, cnpjIgnorado) {
  if (!codigo) return { ok: true };
  const snap = await db.collection('empresas').where('codigo_empresa', '==', codigo).limit(2).get();
  const conflito = snap.docs.find(function (doc) { return doc.id !== cnpjIgnorado; });
  if (!conflito) return { ok: true };
  const dados = conflito.data() || {};
  return {
    ok: false,
    erro: 'Numero da empresa ' + codigo + ' ja pertence a ' + (dados.razao_social || conflito.id) + '.'
  };
}

function tokenBearerRequisicao(req) {
  const auth = String(req && req.headers && req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function validarConfiguracaoContabilEmpresa(empresa) {
  if (!empresa || empresa.modo_contabil !== 'cci_exclusivo') return { ok: true };
  if (!periodoInicialEmpresa(empresa)) {
    return { ok: false, erro: 'Informe a data de inicio da escrituracao no CCI para usar o modo CCI exclusivo.' };
  }
  return { ok: true };
}

async function sincronizarRegimeTributarioCfi(cnpj, req) {
  const cadastro = await buscarRegimeNoCfi({ cnpj, token: tokenBearerRequisicao(req) });
  const regime = cadastro.regime || {};
  if (!regime.codigo || !regime.nome) throw new Error('O cadastro fiscal do CFI nao informou um regime tributario valido.');
  const regimeNormalizado = ({
    ISENTO: 'ISENTA', ISENCAO: 'ISENTA',
    IMUNIDADE: 'IMUNE',
    TERCEIROSETOR: 'TERCEIRO_SETOR', TERCEIRO_SETOR: 'TERCEIRO_SETOR', '3_SETOR': 'TERCEIRO_SETOR'
  })[String(regime.codigo).trim().toUpperCase().replace(/[\s-]+/g, '_')] || String(regime.codigo).trim().toUpperCase();
  const campos = {
    regime_tributario_codigo: regimeNormalizado,
    regime_tributario_nome: String(regime.nome),
    regime_tributario_origem: 'CFI',
    regime_tributario_cfi_id: cadastro.id || '',
    regime_tributario_cfi_fonte: cadastro.fonte || '',
    regime_tributario_sincronizado_em: new Date(),
    regime_tributario_sincronizado_por_uid: req.user.uid,
    regime_tributario_sincronizado_por_email: req.user.email,
  };
  const cnae = cadastro.cnae_principal || cadastro.cnae || cadastro.cnaePrincipal || (cadastro.empresa && (cadastro.empresa.cnae_principal || cadastro.empresa.cnae));
  const cnaeDescricao = cadastro.cnae_descricao || cadastro.descricao_cnae || cadastro.cnaeDescricao || (cadastro.empresa && (cadastro.empresa.cnae_descricao || cadastro.empresa.descricao_cnae));
  if (cnae) campos.cnae_principal = String(cnae).replace(/\D/g, '').slice(0, 7);
  if (cnaeDescricao) campos.cnae_principal_descricao = String(cnaeDescricao).trim().slice(0, 300);
  await db.collection('empresas').doc(cnpj).set(campos, { merge: true });
  return { cadastro, campos };
}

function saldosOrdenados(saldos) {
  const ordenados = {};
  Object.keys(saldos || {}).sort().forEach(function (conta) {
    ordenados[conta] = Number(saldos[conta]);
  });
  return ordenados;
}

function hashSaldosAbertura(saldos) {
  return cryptoAdmin.createHash('sha256').update(JSON.stringify(saldosOrdenados(saldos))).digest('hex');
}

// EMPRESAS - COLABORATIVO
app.get('/api/empresas', async (req, res) => {
  try {
    const docs = await listarEmpresasAcessiveis(req.user);
    res.json(docs.map(function (d) {
      const empresa = { cnpj: d.id, ...d.data() };
      return { ...empresa, prontidao_contabil: avaliarProntidaoContabil(empresa) };
    }));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==================== LISTAR EMPRESAS COM AGREGACOES (Gestao) ====================
app.get('/api/empresas/listar', async (req, res) => {
  try {
    const { q, banco, status, periodo_de, periodo_ate, sort, order, limit, offset, modo } = req.query || {};
    const verTudo = !!req.user.is_admin;
    const docs = verTudo
      ? (await db.collection('empresas').get()).docs
      : await listarEmpresasAcessiveis(req.user, { somenteVinculadas: true });
    let empresas = docs.map(d => ({ cnpj: d.id, ...d.data() }));

    // O primeiro passo do CCI usa somente o cadastro-base. Nao consulta planos,
    // sessoes, relatorios ou lancamentos de cada empresa antes da ativacao.
    if (modo === 'ativacao') {
      let leves = empresas.map(function (emp) {
        return {
          cnpj: emp.cnpj,
          razao_social: emp.razao_social || '',
          codigo_empresa: codigoEmpresaDe(emp),
          whatsapp: emp.whatsapp || emp.whatsapp_cliente || '',
          ativo: emp.ativo !== false,
          owner_email: emp.created_by_email || null,
          responsaveis: normalizarResponsaveis(emp.responsaveis),
          modo_contabil: emp.modo_contabil || '',
          inicio_escrituracao_cci: emp.inicio_escrituracao_cci || '',
          regime_tributario_codigo: emp.regime_tributario_codigo || '',
          regime_tributario_nome: emp.regime_tributario_nome || '',
          plano_id: emp.plano_id || null,
          saldo_abertura_status: emp.saldo_abertura_status || '',
          saldo_abertura_periodo: emp.saldo_abertura_periodo || '',
          prontidao_contabil: avaliarProntidaoContabil(emp)
        };
      });
      if (q) leves = leves.filter(function (empresa) { return empresaBateBusca(q, empresa); });
      leves.sort(function (a, b) {
        const ca = String(a.codigo_empresa || '9999');
        const cb = String(b.codigo_empresa || '9999');
        return ca.localeCompare(cb) || String(a.razao_social).localeCompare(String(b.razao_social), 'pt-BR');
      });
      const totalLeve = leves.length;
      const offLeve = parseInt(offset, 10) || 0;
      const limLeve = Math.min(parseInt(limit, 10) || 24, 100);
      return res.json({
        total: totalLeve,
        offset: offLeve,
        limit: limLeve,
        empresas: leves.slice(offLeve, offLeve + limLeve),
        bancos: [],
        modo: 'ativacao',
        is_admin: !!req.user.is_admin,
        admin_ver_tudo: verTudo
      });
    }

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
        codigo_empresa: codigoEmpresaDe(emp),
        whatsapp: emp.whatsapp || emp.whatsapp_cliente || '',
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
        status: status_calc,
        prontidao_contabil: avaliarProntidaoContabil(emp)
      };
    }));

    // Aplicar filtros em memoria
    let filtered = enriched;
    if (q) {
      filtered = filtered.filter(function (empresa) { return empresaBateBusca(q, empresa); });
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

app.get('/api/empresas/:cnpj/plano-contexto', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const empresaDoc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!empresaDoc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    const empresa = empresaDoc.data() || {};
    if (!usuarioPodeAcessarEmpresa(empresa, req.user)) return res.status(403).json({ erro: 'Sem permissao para esta empresa' });
    if (!empresa.plano_id) return res.json({ planos: {} });
    const planoRef = db.collection('planos').doc(empresa.plano_id);
    const [planoDoc, contasSnap] = await Promise.all([
      planoRef.get(),
      planoRef.collection('contas').orderBy('cod').get()
    ]);
    if (!planoDoc.exists) return res.status(409).json({ erro: 'Plano vinculado nao encontrado' });
    const plano = planoDoc.data() || {};
    const contas = contasSnap.docs.map(function (doc) {
      const conta = doc.data() || {};
      const reduzido = conta.ref_rfb || conta.refRfb || conta.reduzido || conta.ref || conta.codigo_reduzido || conta.codigoReduzido || '';
      return {
        id: doc.id,
        codigo: conta.cod || conta.codigo || '',
        descricao: conta.desc || conta.descricao || '',
        reduzido: String(reduzido).trim(),
        analitica: conta.analitica !== false
      };
    });
    const chave = (plano.nome || plano.name || empresa.plano_id) + ' - ' + (empresa.razao_social || cnpjLimpo);
    res.json({
      planos: {
        [chave]: {
          cnpj: cnpjLimpo,
          codigo: plano.codigo || '',
          plano_id: empresa.plano_id,
          empresa: empresa.razao_social || '',
          tipo: plano.tipo || '',
          global: plano.global === true,
          owner_uid: empresa.owner_uid || null,
          contas
        }
      }
    });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/empresas/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const doc = await db.collection('empresas').doc(cnpjLimpo).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    if (!usuarioPodeAcessarEmpresa(doc.data(), req.user)) return res.status(403).json({ erro: 'Sem permissao para esta empresa' });
    const empresa = { cnpj: doc.id, ...doc.data() };
    res.json({ ...empresa, prontidao_contabil: avaliarProntidaoContabil(empresa) });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/empresas', async (req, res) => {
  try {
    const { cnpj, plano_id } = req.body;
    const razao_social = req.body.razao_social || req.body['razão_social'] || '';
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 digitos' });
    if (!razao_social || !plano_id) return res.status(400).json({ erro: 'razao_social e plano_id obrigatorios' });
    const cadastro = camposCadastroEmpresa(req.body);
    if (!cadastro.ok) return res.status(400).json({ erro: cadastro.erro });
    if (!cadastro.campos.modo_contabil) cadastro.campos.modo_contabil = 'ponte_sage';
    if (!cadastro.campos.tipo_estabelecimento) cadastro.campos.tipo_estabelecimento = 'MATRIZ';
    const configuracao = validarConfiguracaoContabilEmpresa(cadastro.campos);
    if (!configuracao.ok) return res.status(400).json({ erro: configuracao.erro });
    const estrutura = await validarEstruturaMatrizFilial(cnpjLimpo, cadastro.campos, req.user, null);
    if (!estrutura.ok) return res.status(estrutura.status || 400).json({ erro: estrutura.erro, codigo: estrutura.codigo });
    const codigoUnico = await validarCodigoEmpresaUnico(cadastro.campos.codigo_empresa, cnpjLimpo);
    if (!codigoUnico.ok) return res.status(409).json({ erro: codigoUnico.erro });
    const planoDoc = await db.collection('planos').doc(plano_id).get();
    if (!planoDoc.exists) return res.status(400).json({ erro: 'Plano ' + plano_id + ' nao existe' });
    await db.collection('empresas').doc(cnpjLimpo).set({ ...cadastro.campos, razao_social, plano_id, owner_uid: req.user.uid, ativo: true, created_at: new Date(), updated_at: new Date(), created_by: req.user.uid, created_by_email: req.user.email });
    let regimeCfi = null;
    let regimeAviso = null;
    try { regimeCfi = await sincronizarRegimeTributarioCfi(cnpjLimpo, req); }
    catch (e) { regimeAviso = e.message; console.warn('[empresa] regime CFI pendente:', e.message); }
    res.status(201).json({ cnpj: cnpjLimpo, razao_social, plano_id, ...cadastro.campos, regime_cfi: regimeCfi && regimeCfi.cadastro || null, regime_aviso: regimeAviso });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/empresas/:cnpj/ativar', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const ref = db.collection('empresas').doc(cnpjLimpo);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    if (!usuarioPodeAcessarEmpresa(doc.data(), req.user)) return res.status(403).json({ erro: 'Sem permissao para esta empresa' });
    await ref.update({ ativo: true, updated_at: new Date(), reactivated_by: req.user.uid, reactivated_by_email: req.user.email, reactivated_at: new Date() });
    res.json({ cnpj: cnpjLimpo, ativo: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.patch('/api/empresas/:cnpj/cadastro', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const cadastro = camposCadastroEmpresa(req.body);
    if (!cadastro.ok) return res.status(400).json({ erro: cadastro.erro });
    if (!Object.keys(cadastro.campos).length) return res.status(400).json({ erro: 'Nenhum campo de cadastro informado' });
    if (cadastro.campos.razao_social !== undefined && !cadastro.campos.razao_social) {
      return res.status(400).json({ erro: 'Razao social nao pode ficar vazia' });
    }
    const codigoUnico = await validarCodigoEmpresaUnico(cadastro.campos.codigo_empresa, cnpjLimpo);
    if (!codigoUnico.ok) return res.status(409).json({ erro: codigoUnico.erro });
    const futuro = { ...chk.empresa, ...cadastro.campos };
    const configuracao = validarConfiguracaoContabilEmpresa(futuro);
    if (!configuracao.ok) return res.status(400).json({ erro: configuracao.erro });
    const estrutura = await validarEstruturaMatrizFilial(cnpjLimpo, cadastro.campos, req.user, chk.empresa);
    if (!estrutura.ok) return res.status(estrutura.status || 400).json({ erro: estrutura.erro, codigo: estrutura.codigo });
    const alterouImplantacao = (
      cadastro.campos.modo_contabil !== undefined
      && cadastro.campos.modo_contabil !== chk.empresa.modo_contabil
    ) || (
      cadastro.campos.inicio_escrituracao_cci !== undefined
      && cadastro.campos.inicio_escrituracao_cci !== chk.empresa.inicio_escrituracao_cci
    );
    await db.collection('empresas').doc(cnpjLimpo).set({
      ...cadastro.campos,
      ...(alterouImplantacao ? {
        saldo_abertura_status: futuro.modo_contabil === 'cci_exclusivo' ? 'pendente' : FieldValue.delete(),
        saldo_abertura_hash: FieldValue.delete(),
        saldo_abertura_periodo: FieldValue.delete(),
        saldo_abertura_aprovado_em: FieldValue.delete(),
        saldo_abertura_aprovado_por_uid: FieldValue.delete(),
        saldo_abertura_aprovado_por_email: FieldValue.delete(),
      } : {}),
      updated_at: new Date(),
      cadastro_atualizado_por_uid: req.user.uid,
      cadastro_atualizado_por_email: req.user.email
    }, { merge: true });
    const atualizado = await db.collection('empresas').doc(cnpjLimpo).get();
    res.json({ ok: true, cnpj: cnpjLimpo, ...atualizado.data() });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/empresas/:cnpj/regime-cfi/sincronizar', async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const sincronizado = await sincronizarRegimeTributarioCfi(cnpjLimpo, req);
    res.json({ ok: true, cnpj: cnpjLimpo, cadastro: sincronizado.cadastro, regime: sincronizado.campos });
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message, codigo: e.codigo || 'ERRO_SINCRONIZAR_REGIME_CFI' });
  }
});

app.get('/api/empresas/:cnpj/parametrizacao-regime', async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    res.json({ ok: true, cnpj: cnpjLimpo, is_admin: !!req.user.is_admin, cnae_principal: chk.empresa.cnae_principal || '', cnae_principal_descricao: chk.empresa.cnae_principal_descricao || '', ...avaliarParametrizacaoRegime(chk.empresa) });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'Falha ao consultar parametrização tributária.' });
  }
});

app.put('/api/empresas/:cnpj/parametrizacao-regime', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    if (chk.empresa.regime_tributario_origem !== 'CFI') {
      return res.status(409).json({ erro: 'Sincronize primeiro o regime tributário oficial do CFI.', codigo: 'REGIME_CFI_PENDENTE' });
    }
    const validacao = sanitizarParametrizacaoRegime(chk.empresa.regime_tributario_codigo, req.body || {});
    if (!validacao.ok) return res.status(400).json({ erro: validacao.erro, codigo: 'PARAMETRIZACAO_INVALIDA', pendencias: validacao.pendencias || [] });
    const parametrizacao = {
      ...validacao.valor,
      confirmado_em: new Date(),
      confirmado_por_uid: req.user.uid,
      confirmado_por_email: req.user.email,
      origem_regime: 'CFI'
    };
    await db.collection('empresas').doc(cnpjLimpo).set({
      parametrizacao_tributaria: parametrizacao,
      parametrizacao_tributaria_atualizada_em: new Date(),
      updated_at: new Date()
    }, { merge: true });
    const empresaAtualizada = { ...chk.empresa, parametrizacao_tributaria: parametrizacao };
    res.json({ ok: true, cnpj: cnpjLimpo, ...avaliarParametrizacaoRegime(empresaAtualizada) });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'Falha ao salvar parametrização tributária.' });
  }
});

app.post('/api/empresas/:cnpj/parametrizacao-regime/validar-ia', adminRequired, async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const regime = String(chk.empresa.regime_tributario_codigo || '');
    if (!['ISENTA', 'IMUNE', 'TERCEIRO_SETOR'].includes(regime)) return res.status(409).json({ erro: 'O cruzamento especial é destinado a entidades isentas, imunes ou do Terceiro Setor.' });
    const cnae = String((req.body && req.body.cnae_principal) || chk.empresa.cnae_principal || '').replace(/\D/g, '').slice(0, 7);
    if (!cnae) return res.status(400).json({ erro: 'CNAE principal ausente no cadastro do CFI.' });
    const client = getGeminiClient();
    if (!client) return res.status(503).json({ erro: 'Gemini não configurado no servidor.' });
    const model = resolverModeloGemini(null, GEMINI_DEFAULT_MODEL);
    const prompt = [
      'Atue como revisor tributário brasileiro. Não decida o enquadramento e não substitua o contador.',
      'Cruze apenas a coerência entre o cadastro informado, o CNAE principal e os pontos documentais que precisam ser conferidos.',
      'Responda em JSON válido com as chaves parecer (string), alertas (array de strings) e documentos_a_conferir (array de strings).',
      'Empresa: ' + String(chk.empresa.razao_social || cnpj),
      'Situação tributária informada pelo CFI: ' + regime,
      'CNAE principal: ' + cnae + ' - ' + String(chk.empresa.cnae_principal_descricao || ''),
      'Fundamento informado pelo usuário: ' + String((req.body && req.body.fundamento_legal) || '')
    ].join('\n');
    const resposta = await client.models.generateContent({ model, contents: prompt, config: { responseMimeType: 'application/json' } });
    let parecer;
    try { parecer = JSON.parse(String(resposta.text || '{}')); } catch (_) { parecer = { parecer: String(resposta.text || ''), alertas: ['A IA não retornou JSON estruturado. Revise manualmente.'], documentos_a_conferir: [] }; }
    res.json({
      status: 'concluida', cnae, modelo: model,
      parecer: String(parecer.parecer || '').slice(0, 3000),
      alertas: Array.isArray(parecer.alertas) ? parecer.alertas.map(String).slice(0, 20) : [],
      documentos_a_conferir: Array.isArray(parecer.documentos_a_conferir) ? parecer.documentos_a_conferir.map(String).slice(0, 20) : [],
      orientativo: true
    });
  } catch (erro) {
    console.error('validar regime por IA erro:', erro);
    res.status(erro.status || 500).json({ erro: erro.message || 'Falha no cruzamento orientativo por IA.' });
  }
});

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const status = await statusWhatsappCfi(token);
    res.json(status);
  } catch (err) {
    res.status(err.status || 502).json({ erro: err.message, acao: err.acao || null, faltas: err.faltas || null });
  }
});

app.post('/api/empresas/:cnpj/whatsapp/enviar', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const empresa = chk.empresa || {};
    const para = empresa.whatsapp || empresa.whatsapp_cliente || '';
    if (!para) return res.status(409).json({ erro: 'WhatsApp nao cadastrado para esta empresa.' });
    const variaveis = req.body && req.body.variaveis && typeof req.body.variaveis === 'object' && !Array.isArray(req.body.variaveis)
      ? req.body.variaveis : {};
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const resultado = await enviarWhatsappCfi({
      token,
      para,
      template: req.body && req.body.template,
      variaveis,
      referencia: 'cci:empresa:' + cnpjLimpo
    });
    res.json(resultado);
  } catch (err) {
    const status = err.status || (err.indeterminado ? 502 : 500);
    res.status(status).json({ erro: err.message, acao: err.acao || null, faltas: err.faltas || null, opcoes: err.opcoes || null, indeterminado: err.indeterminado === true });
  }
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

// ==================== CARTEIRA CONTABIL (ADMIN) ====================
// Uma empresa pode ter um responsavel principal e varios colaboradores de apoio.
// O criador e os acessos legados continuam validos; a carteira concede acesso adicional.
app.get('/api/admin/carteira-responsaveis', adminRequired, async (req, res) => {
  try {
    const [empresasSnap, usuariosSnap] = await Promise.all([
      db.collection('empresas').get(),
      db.collection('users').get()
    ]);
    const empresas = empresasSnap.docs.map(function(doc) {
      const dados = doc.data() || {};
      return {
        cnpj: doc.id,
        razao_social: dados.razao_social || '',
        codigo_empresa: codigoEmpresaDe(dados),
        owner_email: dados.created_by_email || '',
        responsaveis: normalizarResponsaveis(dados.responsaveis)
      };
    }).sort(function(a, b) {
      return String(a.codigo_empresa || '9999').localeCompare(String(b.codigo_empresa || '9999'))
        || a.razao_social.localeCompare(b.razao_social, 'pt-BR');
    });
    const usuarios = usuariosSnap.docs.map(function(doc) {
      const dados = doc.data() || {};
      const email = String(dados.last_email || dados.email || '').trim().toLowerCase();
      return {
        uid: doc.id,
        nome: String(dados.last_name || dados.name || email || doc.id),
        email,
        is_admin: dados.is_admin === true
      };
    }).filter(function(usuario) { return !!usuario.email; }).sort(function(a, b) {
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
    res.json({ empresas, usuarios });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/admin/empresas/:cnpj/responsaveis', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const colaboradorUid = String((req.body && req.body.colaborador_uid) || '').trim();
    const papel = req.body && req.body.papel === 'principal' ? 'principal' : 'apoio';
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    if (!colaboradorUid) return res.status(400).json({ erro: 'Colaborador obrigatorio' });
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const usuarioRef = db.collection('users').doc(colaboradorUid);
    const resultado = await db.runTransaction(async function(transacao) {
      const [empresaDoc, usuarioDoc] = await transacao.getAll(empresaRef, usuarioRef);
      if (!empresaDoc.exists) { const e = new Error('Empresa nao encontrada'); e.status = 404; throw e; }
      if (!usuarioDoc.exists) { const e = new Error('Colaborador nao encontrado'); e.status = 404; throw e; }
      const usuarioDados = usuarioDoc.data() || {};
      const email = String(usuarioDados.last_email || usuarioDados.email || '').trim().toLowerCase();
      if (!email) { const e = new Error('Colaborador ainda nao possui e-mail registrado no CCI'); e.status = 409; throw e; }
      const responsaveis = atribuirResponsavel(empresaDoc.data().responsaveis, {
        uid: colaboradorUid,
        nome: usuarioDados.last_name || usuarioDados.name || email,
        email
      }, papel, { uid: req.user.uid, email: req.user.email, quando: new Date() });
      transacao.set(empresaRef, {
        ...camposCarteira(responsaveis),
        carteira_atualizada_em: new Date(),
        carteira_atualizada_por_uid: req.user.uid,
        carteira_atualizada_por_email: req.user.email
      }, { merge: true });
      return responsaveis;
    });
    res.json({ ok: true, cnpj: cnpjLimpo, responsaveis: resultado });
  } catch (err) { res.status(err.status || 500).json({ erro: err.message }); }
});

app.delete('/api/admin/empresas/:cnpj/responsaveis/:uid', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const colaboradorUid = String(req.params.uid || '').trim();
    if (cnpjLimpo.length !== 14 || !colaboradorUid) return res.status(400).json({ erro: 'Empresa e colaborador obrigatorios' });
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const resultado = await db.runTransaction(async function(transacao) {
      const empresaDoc = await transacao.get(empresaRef);
      if (!empresaDoc.exists) { const e = new Error('Empresa nao encontrada'); e.status = 404; throw e; }
      const responsaveis = removerResponsavel(empresaDoc.data().responsaveis, colaboradorUid);
      transacao.set(empresaRef, {
        ...camposCarteira(responsaveis),
        carteira_atualizada_em: new Date(),
        carteira_atualizada_por_uid: req.user.uid,
        carteira_atualizada_por_email: req.user.email
      }, { merge: true });
      return responsaveis;
    });
    res.json({ ok: true, cnpj: cnpjLimpo, responsaveis: resultado });
  } catch (err) { res.status(err.status || 500).json({ erro: err.message }); }
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
function resolverModeloGemini(modeloSolicitado, modeloFallback) {
  if (GEMINI_ALLOW_CLIENT_MODEL && modeloSolicitado) return modeloSolicitado;
  return modeloFallback;
}

app.post('/api/ai/gemini', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ erro: 'GEMINI_API_KEY nao configurada no servidor' });
    const model = resolverModeloGemini(req.body && req.body._model, GEMINI_DEFAULT_MODEL);
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
async function sincronizarPlanoSessaoEmpresa(cnpj, planoId, planoNome, user, opcoes) {
  const sessaoRef = db.collection('empresas').doc(cnpj).collection('sessoes').doc('current');
  const sessaoInicial = await carregarSessaoAtualPorRef(sessaoRef);
  if (!sessaoInicial.encontrada || !sessaoInicial.stateJson) {
    return { sincronizada: false, motivo: 'sem_sessao', totalAfetados: 0 };
  }
  let tokenTrava = null;
  try {
    tokenTrava = await adquirirTravaSessao(sessaoRef, user, 'sincronizar_plano');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    const atualizada = aplicarPlanoNaSessao(sessao.stateJson, planoId, planoNome, opcoes);
    if (!atualizada.alterado) {
      await liberarTravaSessao(sessaoRef, tokenTrava);
      tokenTrava = null;
      return { sincronizada: true, motivo: 'ja_atualizada', totalAfetados: 0 };
    }
    const resumo = {
      ...(sessao.dados.resumo || {}),
      plano_id: planoId,
      plano_nome: planoNome || planoId
    };
    const gravacao = await gravarSessaoBloqueada(
      sessaoRef,
      atualizada.stateJson,
      resumo,
      user,
      { exigirRevisao: true }
    );
    tokenTrava = null;
    return {
      sincronizada: true,
      motivo: 'atualizada',
      totalAfetados: atualizada.totalAfetados,
      session_revision: gravacao.revisao
    };
  } catch (e) {
    if (tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    throw e;
  }
}

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

    await empresaRef.update({ plano_id: novo_plano_id, plano_nome: novoPlanoData.nome || '', trocado_em: new Date(), trocado_por: req.user.email });
    let sincronizacaoSessao = { sincronizada: false, totalAfetados: 0 };
    try {
      sincronizacaoSessao = await sincronizarPlanoSessaoEmpresa(
        cnpjLimpo,
        novo_plano_id,
        novoPlanoData.nome || novo_plano_id,
        req.user,
        { descartarClassificacoes: !!descartar_classificacoes }
      );
    } catch (e) {
      console.warn('trocar-plano: erro ao sincronizar sessao:', e.message);
    }
    const totalAfetados = sincronizacaoSessao.totalAfetados || 0;

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
    await registrarAuditoriaAdmin(db, {
      evento: 'plano_contas_alterado',
      categoria: 'plano_contas',
      acao: 'trocar_plano_empresa',
      resultado: { status: 'sucesso', httpStatus: 200 },
      cnpj: cnpjLimpo,
      escopo: { recurso: 'empresas', recursoId: cnpjLimpo },
      detalhes: {
        plano_anterior_id: empresaData.plano_id || '',
        plano_novo_id: novo_plano_id,
        descartou_classificacoes: !!descartar_classificacoes,
        total_lancamentos_afetados: totalAfetados,
        sessao_sincronizada: sincronizacaoSessao.sincronizada === true,
      },
      user: req.user,
    });

    res.json({
      ok: true,
      plano_novo_nome: novoPlanoData.nome,
      plano_novo_id: novo_plano_id,
      total_afetados: totalAfetados,
      sessao_sincronizada: sincronizacaoSessao.sincronizada === true
    });
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
    if (!snap.exists) return res.status(404).json({ erro: 'Empresa nao encontrada' });
    if (!usuarioPodeAcessarEmpresa(snap.data(), req.user)) return res.status(403).json({ erro: 'Sem permissao para esta empresa' });
    const empresaCadastrada = snap.data() || {};
    const regimeOficial = {
      regime_tributario_codigo: empresaCadastrada.regime_tributario_codigo || '',
      regime_tributario_nome: empresaCadastrada.regime_tributario_nome || '',
      regime_tributario_origem: empresaCadastrada.regime_tributario_origem || '',
      parametrizacao_tributaria_status: avaliarParametrizacaoRegime(empresaCadastrada).status
    };

    if (!force) {
      const d = empresaCadastrada;
      if (d.contexto_ia && d.contexto_ia.cnae_descricao) {
        return res.json(Object.assign({ origem: 'cache' }, d.contexto_ia, regimeOficial));
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
      const d = empresaCadastrada;
      if (d.contexto_ia) return res.json(Object.assign({ origem: 'cache-fallback' }, d.contexto_ia, regimeOficial));
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
    res.json(Object.assign({ origem: 'brasilapi' }, ctx, regimeOficial));
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

async function vincularEmpresaPlanoHandler(req, res, opts = {}) {
  try {
    const { cnpj, plano_id } = req.body || {};
    const razao_social = req.body.razao_social || req.body['razão_social'] || '';
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 digitos' });
    if (!plano_id) return res.status(400).json({ erro: 'plano_id obrigatorio' });
    const planoDoc = await db.collection('planos').doc(plano_id).get();
    if (!planoDoc.exists) return res.status(404).json({ erro: 'Plano nao encontrado' });
    const planoData = planoDoc.data() || {};
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const empresaDoc = await empresaRef.get();
    const empresaAtual = empresaDoc.exists ? (empresaDoc.data() || {}) : null;
    const cadastro = camposCadastroEmpresa(req.body);
    if (!cadastro.ok) return res.status(400).json({ erro: cadastro.erro });
    if (!empresaAtual && !cadastro.campos.modo_contabil) cadastro.campos.modo_contabil = 'ponte_sage';
    if (!empresaAtual && !cadastro.campos.tipo_estabelecimento) cadastro.campos.tipo_estabelecimento = 'MATRIZ';
    const configuracao = validarConfiguracaoContabilEmpresa({ ...(empresaAtual || {}), ...cadastro.campos });
    if (!configuracao.ok) return res.status(400).json({ erro: configuracao.erro });
    const estrutura = await validarEstruturaMatrizFilial(cnpjLimpo, cadastro.campos, req.user, empresaAtual);
    if (!estrutura.ok) return res.status(estrutura.status || 400).json({ erro: estrutura.erro, codigo: estrutura.codigo });
    const codigoUnico = await validarCodigoEmpresaUnico(cadastro.campos.codigo_empresa, cnpjLimpo);
    if (!codigoUnico.ok) return res.status(409).json({ erro: codigoUnico.erro });
    const isAdmin = !!(req.user && req.user.is_admin);
    const adminOverride = opts.adminOverride === true;

    if (!isAdmin && !adminOverride && empresaAtual) {
      const ownerUid = empresaAtual.owner_uid || '';
      const planoAtual = empresaAtual.plano_id || '';
      const usuarioEhOwner = ownerUid && ownerUid === req.user.uid;
      const empresaSemDono = !ownerUid;
      const empresaSemPlano = !planoAtual;
      const mesmoPlano = planoAtual && planoAtual === plano_id;
      if (!usuarioEhOwner && !empresaSemDono && !empresaSemPlano && !mesmoPlano) {
        return res.status(403).json({ erro: 'Sem permissao para trocar o plano desta empresa. Solicite ao administrador.' });
      }
    }

    const dados = {
      ...cadastro.campos,
      plano_id,
      plano_nome: planoData.nome || planoData.name || plano_id,
      ativo: true,
      updated_at: new Date(),
      vinculado_por_uid: req.user.uid,
      vinculado_por_email: req.user.email,
      vinculado_em: new Date(),
      acesso_uids: FieldValue.arrayUnion(req.user.uid),
      acesso_emails: FieldValue.arrayUnion(req.user.email)
    };
    if (razao_social) dados.razao_social = razao_social;
    if (!empresaDoc.exists) { dados.created_at = new Date(); dados.created_by = req.user.uid; dados.created_by_email = req.user.email; dados.owner_uid = req.user.uid; }
    await empresaRef.set(dados, { merge: true });
    let sincronizacaoSessao = { sincronizada: false };
    try {
      sincronizacaoSessao = await sincronizarPlanoSessaoEmpresa(
        cnpjLimpo,
        plano_id,
        dados.plano_nome,
        req.user,
        { descartarClassificacoes: false }
      );
    } catch (e) {
      console.warn('vincular-empresa-plano: erro ao sincronizar sessao:', e.message);
    }
    let regimeCfi = null;
    let regimeAviso = null;
    try { regimeCfi = await sincronizarRegimeTributarioCfi(cnpjLimpo, req); }
    catch (e) { regimeAviso = e.message; console.warn('[vincular] regime CFI pendente:', e.message); }
    await registrarAuditoriaAdmin(db, {
      evento: empresaAtual ? 'vinculo_plano_atualizado' : 'vinculo_plano_criado',
      categoria: 'plano_contas',
      acao: 'vincular_empresa_plano',
      resultado: { status: 'sucesso', httpStatus: 200 },
      cnpj: cnpjLimpo,
      escopo: { recurso: 'empresas', recursoId: cnpjLimpo },
      detalhes: {
        plano_anterior_id: empresaAtual && empresaAtual.plano_id || '',
        plano_novo_id: plano_id,
        sessao_sincronizada: sincronizacaoSessao.sincronizada === true,
        origem_admin: opts.adminOverride === true,
      },
      user: req.user,
    });
    res.json({
      ok: true,
      cnpj: cnpjLimpo,
      plano_id,
      plano_nome: dados.plano_nome,
      codigo_empresa: dados.codigo_empresa !== undefined ? dados.codigo_empresa : codigoEmpresaDe(empresaAtual),
      whatsapp: dados.whatsapp !== undefined ? dados.whatsapp : ((empresaAtual && empresaAtual.whatsapp) || ''),
      modo_contabil: dados.modo_contabil !== undefined ? dados.modo_contabil : ((empresaAtual && empresaAtual.modo_contabil) || 'ponte_sage'),
      inicio_escrituracao_cci: dados.inicio_escrituracao_cci !== undefined ? dados.inicio_escrituracao_cci : ((empresaAtual && empresaAtual.inicio_escrituracao_cci) || ''),
      sessao_sincronizada: sincronizacaoSessao.sincronizada === true,
      regime_cfi: regimeCfi && regimeCfi.cadastro || null,
      regime_aviso: regimeAviso
    });
  } catch (e) { console.error('vincular-empresa-plano erro:', e); res.status(500).json({ erro: e.message }); }
}

app.post('/api/vincular-empresa-plano', async (req, res) => {
  return vincularEmpresaPlanoHandler(req, res);
});

app.post('/api/admin/vincular-empresa-plano', adminRequired, async (req, res) => {
  return vincularEmpresaPlanoHandler(req, res, { adminOverride: true });
});

// ==================== SESSAO DE TRABALHO (state persistente) ====================
async function checarAcessoEmpresa(cnpj, user) {
  const doc = await db.collection('empresas').doc(cnpj).get();
  if (!doc.exists) return { ok: false, status: 404, erro: 'Empresa nao encontrada' };
  const emp = doc.data();
  if (!usuarioPodeAcessarEmpresa(emp, user)) return { ok: false, status: 403, erro: 'Sem permissao para esta empresa' };
  return { ok: true, empresa: emp };
}

async function validarEstruturaMatrizFilial(cnpj, campos, user, empresaAtual) {
  const atual = empresaAtual || {};
  const tipo = String(campos.tipo_estabelecimento !== undefined ? campos.tipo_estabelecimento : (atual.tipo_estabelecimento || 'MATRIZ')).toUpperCase();
  const matrizCnpj = String(campos.matriz_cnpj !== undefined ? campos.matriz_cnpj : (atual.matriz_cnpj || '')).replace(/\D/g, '');
  if (tipo === 'FILIAL') {
    if (!matrizCnpj) return { ok: false, status: 400, codigo: 'MATRIZ_OBRIGATORIA', erro: 'Selecione a matriz desta filial.' };
    if (matrizCnpj === cnpj) return { ok: false, status: 409, codigo: 'AUTO_VINCULO_MATRIZ', erro: 'Uma empresa nao pode ser matriz e filial de si mesma.' };
    const matrizDoc = await db.collection('empresas').doc(matrizCnpj).get();
    if (!matrizDoc.exists) return { ok: false, status: 404, codigo: 'MATRIZ_NAO_ENCONTRADA', erro: 'A matriz selecionada nao esta cadastrada no CCI.' };
    const matriz = matrizDoc.data() || {};
    if (!usuarioPodeAcessarEmpresa(matriz, user)) return { ok: false, status: 403, codigo: 'SEM_ACESSO_MATRIZ', erro: 'Sem permissao para vincular esta matriz.' };
    if (String(matriz.tipo_estabelecimento || 'MATRIZ').toUpperCase() === 'FILIAL') {
      return { ok: false, status: 409, codigo: 'MATRIZ_EH_FILIAL', erro: 'A empresa escolhida ja e filial. Selecione a matriz principal do grupo.' };
    }
  }
  if (tipo === 'FILIAL' && String(atual.tipo_estabelecimento || 'MATRIZ').toUpperCase() !== 'FILIAL') {
    const filhos = await db.collection('empresas').where('matriz_cnpj', '==', cnpj).limit(1).get();
    if (!filhos.empty) {
      return { ok: false, status: 409, codigo: 'MATRIZ_COM_FILIAIS', erro: 'Esta empresa possui filiais vinculadas e nao pode ser transformada em filial.' };
    }
  }
  return { ok: true, tipo_estabelecimento: tipo, matriz_cnpj: tipo === 'FILIAL' ? matrizCnpj : '' };
}

app.get('/api/empresas/:cnpj/estrutura-matriz-filial', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const [todasSnap, filiaisSnap] = await Promise.all([
      db.collection('empresas').get(),
      db.collection('empresas').where('matriz_cnpj', '==', cnpj).get()
    ]);
    const visiveis = todasSnap.docs
      .filter(function (doc) { return usuarioPodeAcessarEmpresa(doc.data() || {}, req.user); })
      .map(function (doc) { return { cnpj: doc.id, ...(doc.data() || {}) }; });
    const matrizes = visiveis
      .filter(function (empresa) { return empresa.cnpj !== cnpj && String(empresa.tipo_estabelecimento || 'MATRIZ').toUpperCase() !== 'FILIAL'; })
      .map(function (empresa) { return { cnpj: empresa.cnpj, razao_social: empresa.razao_social || '', codigo_empresa: empresa.codigo_empresa || '' }; });
    const filiais = filiaisSnap.docs
      .filter(function (doc) { return usuarioPodeAcessarEmpresa(doc.data() || {}, req.user); })
      .map(function (doc) { const empresa = doc.data() || {}; return { cnpj: doc.id, razao_social: empresa.razao_social || '', codigo_empresa: empresa.codigo_empresa || '' }; });
    let matriz = null;
    const matrizCnpj = String(chk.empresa.matriz_cnpj || '').replace(/\D/g, '');
    if (matrizCnpj) {
      const encontrada = visiveis.find(function (empresa) { return empresa.cnpj === matrizCnpj; });
      if (encontrada) matriz = { cnpj: encontrada.cnpj, razao_social: encontrada.razao_social || '', codigo_empresa: encontrada.codigo_empresa || '' };
    }
    res.json({
      cnpj,
      tipo_estabelecimento: String(chk.empresa.tipo_estabelecimento || 'MATRIZ').toUpperCase(),
      matriz_cnpj: matrizCnpj,
      matriz,
      matrizes_disponiveis: matrizes,
      filiais
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

function lerEstadoContabil(stateJson) {
  try {
    const estado = JSON.parse(String(stateJson || '{}'));
    return {
      entries: Array.isArray(estado.entries) ? estado.entries : [],
      relatoriosContabeis: estado.relatoriosContabeis && typeof estado.relatoriosContabeis === 'object'
        ? estado.relatoriosContabeis
        : {}
    };
  } catch (e) {
    throw erroSessao('A sessão contábil está ilegível. Nenhuma alteração foi realizada.', 409, 'SESSAO_CONTABIL_INVALIDA');
  }
}

async function carregarContasContabeisEmpresa(empresa) {
  const planoId = String(empresa && empresa.plano_id || '').trim();
  if (!planoId) return [];
  const snap = await db.collection('planos').doc(planoId).collection('contas').get();
  return snap.docs.map(function (doc) {
    const conta = doc.data() || {};
    return {
      id: doc.id,
      codigo: conta.cod || conta.codigo || doc.id,
      descricao: conta.desc || conta.descricao || '',
      reduzido: conta.ref_rfb || conta.refRfb || conta.reduzido || conta.ref || conta.codigo_reduzido || conta.codigoReduzido || '',
      analitica: conta.analitica !== false
    };
  });
}

function assinaturaEstadoPeriodo(estado, periodo) {
  const saldosOriginais = estado && estado.relatoriosContabeis && estado.relatoriosContabeis.saldosIniciais
    ? estado.relatoriosContabeis.saldosIniciais[periodo] || {}
    : {};
  const saldos = {};
  Object.keys(saldosOriginais).sort().forEach(function (conta) { saldos[conta] = saldosOriginais[conta]; });
  return hashSessao(RelatoriosContabeis.assinaturaPeriodo((estado && estado.entries) || [], periodo) + '|' + JSON.stringify(saldos));
}

async function impedirAlteracaoPeriodosFechados(cnpj, stateJsonAtual, stateJsonNovo, periodosCarregados) {
  const periodos = periodosCarregados || await db.collection('empresas').doc(cnpj).collection('periodos_contabeis').get();
  const fechados = periodos.docs.filter(function (doc) { return String((doc.data() || {}).status) === 'fechado'; });
  if (!fechados.length) return;
  const atual = lerEstadoContabil(stateJsonAtual);
  const novo = lerEstadoContabil(stateJsonNovo);
  const alterados = fechados.map(function (doc) { return doc.id; }).filter(function (periodo) {
    return assinaturaEstadoPeriodo(atual, periodo) !== assinaturaEstadoPeriodo(novo, periodo);
  });
  if (alterados.length) {
    throw erroSessao(
      'O período ' + alterados.join(', ') + ' está encerrado. Reabra a competência antes de alterar seus lançamentos.',
      409,
      'PERIODO_CONTABIL_FECHADO'
    );
  }
}

async function impedirSobrescritaSaldosTransportados(cnpj, stateJsonNovo, transportesCarregados) {
  const snap = transportesCarregados || await db.collection('empresas').doc(cnpj).collection('transportes_saldos').where('status', '==', 'vigente').get();
  if (snap.empty) return;
  const novo = lerEstadoContabil(stateJsonNovo);
  const saldosPorPeriodo = novo.relatoriosContabeis && novo.relatoriosContabeis.saldosIniciais || {};
  const divergentes = snap.docs.filter(function (doc) {
    const transporte = doc.data() || {};
    const informados = saldosPorPeriodo[doc.id];
    if (!informados || !Object.keys(informados).length) return false;
    return hashSaldosAbertura(informados) !== hashSaldosAbertura(transporte.saldos || {});
  }).map(function (doc) { return doc.id; });
  if (divergentes.length) {
    throw erroSessao('Os saldos de ' + divergentes.join(', ') + ' foram transportados por fechamento e não podem ser substituídos manualmente. Reabra a competência de origem.', 409, 'SALDOS_TRANSPORTADOS_PROTEGIDOS');
  }
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

const { buscarFechamentosNoCfi, buscarMovimentoFiscalNoCfi } = require('./reinf/cfi-notas-client');
const { lancamentosDoFechamento, conferirContraLancado, resumirImportacao } = require('./reinf/fechamento-cfi');

const FISCAL_GATEWAY_URL = (process.env.FISCAL_GATEWAY_URL || 'https://consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app').replace(/\/+$/, '');
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
    const baseQuery = db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos').orderBy('competencia', 'desc');
    const docs = [];
    let ultimo = null;
    while (docs.length < 10000) {
      let query = baseQuery.limit(500);
      if (ultimo) query = query.startAfter(ultimo);
      const pagina = await query.get();
      if (pagina.empty) break;
      docs.push(...pagina.docs);
      ultimo = pagina.docs[pagina.docs.length - 1];
      if (pagina.size < 500) break;
    }
    if (docs.length >= 10000) {
      throw new Error('Consulta fiscal excedeu o teto de seguranca de 10.000 registros; total nao exibido para evitar truncamento silencioso.');
    }
    const itens = docs.map(d => ({ id: d.id, ...serializarFiscal(d.data()) }));
    const resumo = resumirItensFiscais(itens);
    res.json({ cnpj: cnpjLimpo, resumo, itens });
  } catch (err) {
    console.error('fiscal impostos GET erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

// ============================================================================
// 🔒 O FECHAMENTO DO MÊS VEM DO CFI — fase 5 do túnel (26/08)
//
// Paulo: *"o departamento contábil, através do CCI, deve fazer a importação com
// a mesma exatidão dos valores apurados e o mês fechado"*.
//
// Hoje esse número é DIGITADO aqui (o `fiscalValorApurado` da aba de impostos).
// Estas duas rotas trocam a digitação pelo CARIMBO — imutável e versionado.
//
// A régua está em `reinf/fechamento-cfi.js` (PURO, testado); aqui é só I/O.
// ============================================================================

/** O Bearer do usuário logado AQUI — é ele que abre a porta do CFI. */
function tokenDoUsuario(req) {
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

/**
 * O que dá para importar nesta competência — CONSULTA PURA, não grava nada.
 *
 * Sem `cnpj` responde pela carteira inteira; com ele, por um cliente só.
 */
app.get('/api/fiscal/fechamentos-cfi', async (req, res) => {
  try {
    const competencia = String(req.query.competencia || '').trim();
    const cnpj = String(req.query.cnpj || '').replace(/\D/g, '');
    if (cnpj) {
      const chk = await checarAcessoEmpresa(cnpj, req.user);
      if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    }
    const doCfi = await buscarFechamentosNoCfi({ competencia, cnpj: cnpj || undefined, token: tokenDoUsuario(req) });
    const linhas = doCfi.fechamentos.map((l) => ({ ...l, plano: lancamentosDoFechamento(l) }));
    return res.json({
      ok: true,
      competencia: doCfi.competencia,
      resumo: resumirImportacao(doCfi.fechamentos),
      fechamentos: linhas,
    });
  } catch (err) {
    // ⚠️ Falha do outro app NÃO vira lista vazia: vazio aqui se leria como
    // "nenhum cliente fechou o mês", e o Contábil concluiria que não há o que
    // importar. O erro sobe com a frase que diz o que fazer.
    console.error('fechamentos-cfi GET erro:', err);
    return res.status(502).json({ erro: err.message });
  }
});

// Consulta pura CFI -> CCI. O navegador nunca recebe credencial de banco e o
// CCI nao le o Firestore fiscal diretamente; o token da sessao e validado nos
// dois apps. A gravacao continua ocorrendo somente depois da previa do modal.
app.get('/api/fiscal/movimento-cfi', async (req, res) => {
  try {
    const cnpj = String(req.query.cnpj || '').replace(/\D/g, '');
    const competencia = String(req.query.competencia || '').trim();
    const movimento = String(req.query.movimento || '').trim();
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido.' });
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const payload = await buscarMovimentoFiscalNoCfi({
      cnpj, competencia, movimento, token: tokenDoUsuario(req),
    });
    return res.json(payload);
  } catch (err) {
    console.error('movimento-cfi GET erro:', err);
    return res.status(502).json({ erro: err.message });
  }
});

/**
 * Importa o fechamento de UMA empresa para `fiscal_impostos`.
 *
 * ⚠️ UMA EMPRESA POR VEZ, como do lado do CFI — é a família do *"ninguém emite
 * em série"*: importação em lote multiplicaria o erro por 200 antes de alguém
 * ver. E o id do documento é DETERMINÍSTICO (`cfi_<competência>_<tributo>`),
 * então reimportar SOBRESCREVE em vez de duplicar — duas linhas do mesmo
 * tributo na mesma competência dobrariam o `valor_apurado` do resumo.
 */
app.post('/api/empresas/:cnpj/fiscal/importar-fechamento-cfi', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });

    const competencia = String(req.body?.competencia || '').trim();
    const doCfi = await buscarFechamentosNoCfi({ competencia, cnpj: cnpjLimpo, token: tokenDoUsuario(req) });
    const linha = (doCfi.fechamentos || [])[0] || null;
    if (!linha) return res.status(404).json({ erro: 'O Consultor Fiscal não conhece esta empresa nesta competência.' });

    const plano = lancamentosDoFechamento(linha);
    // A recusa é 409, nunca 500: "não pode importar" é RESPOSTA, não falha —
    // e ela carrega o motivo e a ação (mês aberto é trabalho do Fiscal; mês
    // reaberto é uma conversa entre os dois departamentos).
    if (!plano.podeImportar) return res.status(409).json({ erro: plano.recusa, estado: linha.estado });

    const impostosRef = db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos');
    const snap = await impostosRef.where('competencia', '==', linha.competencia).get();
    const jaGravados = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const conferencia = conferirContraLancado(plano.lancamentos, jaGravados);

    const agora = new Date();
    for (const l of plano.lancamentos) {
      const id = `cfi_${String(l.competencia).replace(/\W/g, '')}_${String(l.tributo).replace(/\W/g, '')}`;
      await impostosRef.doc(id).set({
        ...l,
        importado_em: agora,
        importado_por_uid: req.user.uid,
        importado_por_email: req.user.email,
        atualizado_em: agora,
        atualizado_por_uid: req.user.uid,
        atualizado_por_email: req.user.email,
        criado_por_origem: 'CFI_FECHAMENTO',
      }, { merge: true });
    }

    return res.json({
      ok: true,
      competencia: linha.competencia,
      gravados: plano.lancamentos.length,
      // O TOTAL DA FICHA vem para CONFERÊNCIA e NÃO foi lançado: ele é a soma,
      // e o resumo desta tela soma `valor_apurado`.
      totalDaFicha: plano.totalDaFicha,
      semApurado: plano.semApurado,
      conferencia,
      carimbo: plano.carimbo,
    });
  } catch (err) {
    console.error('importar-fechamento-cfi erro:', err);
    return res.status(502).json({ erro: err.message });
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
    if (doc.data()?.criado_por_origem === 'CFI_FISCAL_CONNECTOR') {
      return res.status(409).json({ erro: 'Registro importado do CFI e somente leitura. Atualize pela fonte oficial.' });
    }
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
    const ref = db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'registro fiscal nao encontrado' });
    if (doc.data()?.criado_por_origem === 'CFI_FISCAL_CONNECTOR') {
      return res.status(409).json({ erro: 'Registro importado do CFI nao pode ser excluido no CCI.' });
    }
    await ref.delete();
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
      return res.status(503).json({
        ok: false,
        erro: 'Conector fiscal protegido nao configurado; nenhum valor foi importado.',
        gateway: statusGateway
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
    let itens;
    let coberturaResumo;
    let matrizTributos;
    try {
      itens = validarPayloadFiscalConnector(payload);
      coberturaResumo = validarCoberturaFiscal(payload.cobertura);
      matrizTributos = montarMatrizTributos(coberturaResumo);
    } catch (e) {
      e.status = 502;
      e.data = payload;
      throw e;
    }

    const impostosRef = db.collection('empresas').doc(cnpjLimpo).collection('fiscal_impostos');
    const agora = new Date();
    const idsRecebidos = new Set(itens.map(item => String(item.id)));
    const existentesSnap = await impostosRef.where('criado_por_origem', '==', 'CFI_FISCAL_CONNECTOR').get();
    const competenciaSolicitada = String(req.body?.competencia || '').trim();
    const obsoletos = existentesSnap.docs.filter(doc => {
      const anterior = doc.data() || {};
      return (!competenciaSolicitada || anterior.competencia === competenciaSolicitada) && !idsRecebidos.has(doc.id);
    });
    if (itens.length + obsoletos.length + 1 > 500) {
      return res.status(409).json({
        ok: false,
        erro: 'Reconciliacao fiscal excedeu o limite atomico de 500 operacoes; nenhum valor foi alterado.'
      });
    }

    const batch = db.batch();
    for (const item of itens) {
      const ref = impostosRef.doc(item.id);
      batch.set(ref, {
        ...item,
        sincronizado_em: agora,
        atualizado_em: agora,
        atualizado_por_uid: req.user.uid,
        atualizado_por_email: req.user.email,
        criado_por_origem: 'CFI_FISCAL_CONNECTOR'
      });
    }

    for (const doc of obsoletos) {
      batch.set(doc.ref, {
        contabilizavel: false,
        valor_pago: 0,
        status: 'EM_ANALISE',
        pendencia_ecac: 'Registro nao retornado pela fonte na ultima consulta; confirmacao suspensa.',
        sincronizado_em: agora,
        atualizado_em: agora,
        atualizado_por_uid: req.user.uid,
        atualizado_por_email: req.user.email
      }, { merge: true });
    }

    const logRef = db.collection('empresas').doc(cnpjLimpo).collection('fiscal_sync_logs').doc();
    batch.set(logRef, {
      origem: 'CFI_FISCAL_CONNECTOR',
      gateway_url: FISCAL_GATEWAY_URL,
      gateway_modes: payload.modes || statusGateway,
      contrato: payload.contrato,
      credencial: payload.credencial || null,
      cobertura: payload.cobertura || null,
      cobertura_resumo: coberturaResumo,
      matriz_tributos: matrizTributos,
      resumo_origem: payload.resumo || null,
      total_gravado: itens.length,
      total_confirmacao_suspensa: obsoletos.length,
      avisos: payload.avisos || [],
      criado_em: agora,
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    });
    await batch.commit();

    res.json({
      ok: true,
      cnpj: cnpjLimpo,
      modo: 'sincronizado',
      gateway: statusGateway,
      resumo: { importados: itens.length, atualizados: itens.length, confirmacoes_suspensas: obsoletos.length, ...(payload.resumo || {}) },
      cobertura: payload.cobertura || {},
      cobertura_resumo: coberturaResumo,
      matriz_tributos: matrizTributos,
      credencial: payload.credencial || null,
      avisos: [...avisos, ...(payload.avisos || [])]
    });
  } catch (err) {
    console.error('sincronizar-serpro erro:', err);
    res.status(err.status || 500).json({
      erro: err.message,
      detalhe: err.data && (err.data.erro || err.data.error) ? (err.data.erro || err.data.error) : undefined
    });
  }
});

function erroSessao(mensagem, status, codigo) {
  const erro = new Error(mensagem);
  erro.status = status || 500;
  erro.codigo = codigo || 'ERRO_SESSAO';
  return erro;
}

function hashSessao(stateJson) {
  return cryptoAdmin.createHash('sha256').update(String(stateJson || ''), 'utf8').digest('hex');
}

function tokenPreviaExclusao(stateJson, cnpj, filtros) {
  return hashSessao([hashSessao(stateJson), cnpj, JSON.stringify(filtros || {})].join('|'));
}

function novaRevisaoSessao() {
  return cryptoAdmin.randomBytes(18).toString('hex');
}

function millisTimestamp(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
}

function dividirTexto(texto, limite) {
  return dividirPayload(texto, limite);
}

async function gravarPartes(colecaoRef, partes, geracao) {
  let batch = db.batch();
  let operacoes = 0;
  for (let idx = 0; idx < partes.length; idx++) {
    const id = `${geracao}_${String(idx).padStart(4, '0')}`;
    batch.set(colecaoRef.doc(id), { geracao, idx, parte: partes[idx] });
    operacoes++;
    if (operacoes >= 450) {
      await batch.commit();
      batch = db.batch();
      operacoes = 0;
    }
  }
  if (operacoes) await batch.commit();
}

async function excluirDocumentosEmLotes(documentos) {
  let batch = db.batch();
  let operacoes = 0;
  for (const documento of documentos) {
    batch.delete(documento.ref);
    operacoes++;
    if (operacoes >= 450) {
      await batch.commit();
      batch = db.batch();
      operacoes = 0;
    }
  }
  if (operacoes) await batch.commit();
}

async function limparChunksAntigos(sessaoRef, geracaoAtual) {
  const chunks = await sessaoRef.collection('chunks').get();
  const antigos = chunks.docs.filter(documento => {
    if (!geracaoAtual) return true;
    return String(documento.data().geracao || '') !== String(geracaoAtual);
  });
  if (antigos.length) await excluirDocumentosEmLotes(antigos);
}

async function carregarSessaoAtualPorRef(sessaoRef) {
  const doc = await sessaoRef.get();
  if (!doc.exists) return { encontrada: false, doc, dados: null, stateJson: '' };
  const dados = doc.data() || {};
  let payload = typeof dados.state_payload === 'string'
    ? dados.state_payload
    : (typeof dados.state_json === 'string' ? dados.state_json : '');
  if (dados.state_chunked) {
    const chunks = await sessaoRef.collection('chunks').get();
    const geracao = String(dados.state_generation || '');
    const partes = chunks.docs
      .map(documento => documento.data() || {})
      .filter(parte => !geracao || String(parte.geracao || '') === geracao)
      .sort((a, b) => Number(a.idx || 0) - Number(b.idx || 0));
    if (Number(dados.state_chunks || 0) !== partes.length) {
      throw erroSessao('A sessão está incompleta no armazenamento. Nenhuma alteração foi realizada.', 409, 'SESSAO_INCOMPLETA');
    }
    payload = partes.map(parte => parte.parte || '').join('');
  }
  const stateJson = decodificarPayload(payload, dados.state_encoding || ENCODING_PLAIN);
  return {
    encontrada: true,
    doc,
    dados,
    stateJson,
    updateMillis: millisTimestamp(doc.updateTime),
  };
}

async function adquirirTravaSessao(sessaoRef, user, tipo, updateMillisEsperado) {
  const token = novaRevisaoSessao();
  const agora = Date.now();
  await db.runTransaction(async transacao => {
    const atual = await transacao.get(sessaoRef);
    const dados = atual.exists ? (atual.data() || {}) : {};
    const trava = dados.session_write_lock || null;
    if (trava && millisTimestamp(trava.expires_at) > agora) {
      throw erroSessao('A sessão está sendo atualizada. Aguarde alguns segundos e tente novamente.', 409, 'SESSAO_EM_ATUALIZACAO');
    }
    if (updateMillisEsperado != null && millisTimestamp(atual.updateTime) !== Number(updateMillisEsperado)) {
      throw erroSessao('A sessão mudou depois da prévia. Gere uma nova prévia antes de excluir.', 409, 'PREVIA_DESATUALIZADA');
    }
    transacao.set(sessaoRef, {
      session_write_lock: {
        token,
        tipo,
        uid: user.uid,
        email: user.email,
        acquired_at: new Date(agora),
        expires_at: new Date(agora + (15 * 60 * 1000)),
      },
    }, { merge: true });
  });
  return token;
}

async function liberarTravaSessao(sessaoRef, token) {
  try {
    await db.runTransaction(async transacao => {
      const atual = await transacao.get(sessaoRef);
      const trava = atual.exists ? (atual.data().session_write_lock || null) : null;
      if (trava && trava.token === token) {
        transacao.set(sessaoRef, { session_write_lock: admin.firestore.FieldValue.delete() }, { merge: true });
      }
    });
  } catch (erro) {
    console.warn('[sessao] falha ao liberar trava:', erro.message || erro);
  }
}

async function gravarDocumentoJson(ref, stateJson, metadados) {
  const partes = dividirTexto(stateJson, LIMITE_CHUNK_SESSAO);
  const chunked = String(stateJson).length > LIMITE_CHUNK_SESSAO;
  const geracao = chunked ? novaRevisaoSessao() : null;
  if (chunked) await gravarPartes(ref.collection('chunks'), partes, geracao);
  await ref.set({
    ...(metadados || {}),
    state_json: chunked ? null : stateJson,
    state_chunked: chunked,
    state_chunks: chunked ? partes.length : 0,
    state_bytes: String(stateJson).length,
    state_generation: geracao,
  });
  await limparChunksAntigos(ref, geracao).catch(erro => console.warn('[sessao] limpeza de chunks antigos falhou:', erro.message || erro));
}

async function gravarSessaoBloqueada(sessaoRef, stateJson, resumo, user, opcoes) {
  const opts = opcoes || {};
  const codificado = codificarStateJson(stateJson);
  const partes = dividirTexto(codificado.payload, LIMITE_CHUNK_SESSAO);
  const chunked = codificado.payload.length > LIMITE_CHUNK_SESSAO;
  const geracao = chunked ? novaRevisaoSessao() : null;
  if (chunked) await gravarPartes(sessaoRef.collection('chunks'), partes, geracao);
  const revisao = novaRevisaoSessao();
  const dadosSessao = {
    resumo: resumo || null,
    updated_at: new Date(),
    updated_by_uid: user.uid,
    updated_by_email: user.email,
    state_json: codificado.encoding === ENCODING_PLAIN && !chunked ? codificado.payload : null,
    state_payload: codificado.encoding !== ENCODING_PLAIN && !chunked ? codificado.payload : null,
    state_encoding: codificado.encoding,
    state_chunked: chunked,
    state_chunks: chunked ? partes.length : 0,
    state_bytes: codificado.bytesOriginais,
    state_stored_bytes: codificado.bytesArmazenados,
    state_generation: geracao,
    session_revision: revisao,
    require_session_revision: opts.exigirRevisao === true,
    session_write_lock: admin.firestore.FieldValue.delete(),
  };
  if (opts.empresaRef && opts.atualizacaoEmpresa) {
    const batch = db.batch();
    batch.set(sessaoRef, dadosSessao, { merge: true });
    batch.set(opts.empresaRef, opts.atualizacaoEmpresa, { merge: true });
    await batch.commit();
  } else {
    await sessaoRef.set(dadosSessao, { merge: true });
  }
  if (chunked || opts.limparChunksAntigos !== false) {
    await limparChunksAntigos(sessaoRef, geracao).catch(erro => console.warn('[sessao] limpeza de chunks antigos falhou:', erro.message || erro));
  }
  return {
    revisao,
    chunked,
    chunks: chunked ? partes.length : 0,
    encoding: codificado.encoding,
    stateBytes: codificado.bytesOriginais,
    storedBytes: codificado.bytesArmazenados,
  };
}

async function gravarTextoBackup(backupRef, subcolecao, texto) {
  const partes = dividirTexto(texto, LIMITE_CHUNK_SESSAO);
  const geracao = novaRevisaoSessao();
  if (partes.length) await gravarPartes(backupRef.collection(subcolecao), partes, geracao);
  return { geracao, partes: partes.length, bytes: String(texto || '').length };
}

async function carregarTextoBackup(backupRef, subcolecao, metadados) {
  const meta = metadados || {};
  const geracao = String(meta.geracao || '');
  const esperado = Number(meta.partes || 0);
  if (!geracao || !Number.isInteger(esperado) || esperado < 1) {
    throw erroSessao('O backup do lote de migração está incompleto.', 409, 'BACKUP_MIGRACAO_INCOMPLETO');
  }
  const snap = await backupRef.collection(subcolecao).get();
  const partes = snap.docs
    .map(doc => doc.data() || {})
    .filter(item => String(item.geracao || '') === geracao)
    .sort((a, b) => Number(a.idx || 0) - Number(b.idx || 0));
  if (partes.length !== esperado) {
    throw erroSessao('O backup do lote de migração está incompleto.', 409, 'BACKUP_MIGRACAO_INCOMPLETO');
  }
  return partes.map(item => String(item.parte || '')).join('');
}

async function prepararBackupMetadadosImportacao(cnpj, fingerprints, backupRef) {
  const unicos = [...new Set((fingerprints || []).map(String).filter(fp => fp && fp.length <= 500 && !fp.includes('/')))];
  if (!unicos.length) return [];
  const refs = unicos.map(fingerprint => db.collection('empresas').doc(cnpj).collection('importacoes').doc(fingerprint));
  const documentos = [];
  for (let inicio = 0; inicio < refs.length; inicio += 300) {
    documentos.push(...await db.getAll(...refs.slice(inicio, inicio + 300)));
  }
  let batch = db.batch();
  let operacoes = 0;
  const existentes = [];
  for (let idx = 0; idx < documentos.length; idx++) {
    const documento = documentos[idx];
    const fingerprint = unicos[idx];
    const idBackup = cryptoAdmin.createHash('sha256').update(fingerprint).digest('hex');
    batch.set(backupRef.collection('importacoes_metadata').doc(idBackup), {
      fingerprint,
      existia: documento.exists,
      dados: documento.exists ? documento.data() : null,
    });
    if (documento.exists) existentes.push({ fingerprint, ref: documento.ref });
    operacoes++;
    if (operacoes >= 450) {
      await batch.commit();
      batch = db.batch();
      operacoes = 0;
    }
  }
  if (operacoes) await batch.commit();
  return existentes;
}

async function excluirMetadadosImportacao(documentos) {
  if (!documentos || !documentos.length) return;
  await excluirDocumentosEmLotes(documentos.map(item => ({ ref: item.ref })));
}

function parsearStateJson(stateJson) {
  try {
    const state = JSON.parse(stateJson);
    if (!state || typeof state !== 'object' || !Array.isArray(state.entries)) {
      throw new Error('entries ausente');
    }
    return state;
  } catch (erro) {
    throw erroSessao('A sessão da empresa não possui uma estrutura válida de lançamentos. Nenhuma alteração foi realizada.', 422, 'SESSAO_INVALIDA');
  }
}

app.post('/api/empresas/:cnpj/sessao', async (req, res) => {
  let sessaoRef = null;
  let tokenTrava = null;
  const inicioPersistencia = Date.now();
  const temposPersistencia = {};
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    temposPersistencia.acesso = Date.now() - inicioPersistencia;
    const { resumo, session_revision, client_version } = req.body || {};
    const state_json = stateJsonDoBody(req.body || {});
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    sessaoRef = empresaRef.collection('sessoes').doc('current');
    tokenTrava = await adquirirTravaSessao(sessaoRef, req.user, 'autosave');
    temposPersistencia.trava = Date.now() - inicioPersistencia - temposPersistencia.acesso;
    const [atual, periodosContabeis, transportesSaldos] = await Promise.all([
      carregarSessaoAtualPorRef(sessaoRef),
      empresaRef.collection('periodos_contabeis').get(),
      empresaRef.collection('transportes_saldos').where('status', '==', 'vigente').get(),
    ]);
    temposPersistencia.leituras = Date.now() - inicioPersistencia - temposPersistencia.acesso - temposPersistencia.trava;
    const exigirRevisao = !!(atual.dados && atual.dados.require_session_revision);
    const resultadoRevisao = avaliarRevisaoSessao({
      revisaoAtual: atual.dados && atual.dados.session_revision,
      revisaoCliente: session_revision,
      revisaoObrigatoria: exigirRevisao,
    });
    if (!resultadoRevisao.ok) {
      const concorrente = resultadoRevisao.codigo === 'SESSAO_CONCORRENTE';
      throw erroSessao(
        concorrente
          ? 'Outra tela ou colaborador salvou esta empresa primeiro. Suas alterações locais não foram sobrescritas; confira-as antes de recarregar.'
          : 'Esta sessão foi alterada por um administrador. Recarregue a empresa antes de salvar novamente.',
        409,
        resultadoRevisao.codigo
      );
    }
    await impedirAlteracaoPeriodosFechados(cnpjLimpo, atual.stateJson, state_json, periodosContabeis);
    await impedirSobrescritaSaldosTransportados(cnpjLimpo, state_json, transportesSaldos);
    const versaoServidor = lerVersao().version || '';
    const validacaoVersao = validarVersaoParaNovaImportacao({
      stateJsonNovo: state_json,
      stateJsonAtual: atual.stateJson,
      versaoCliente: client_version,
      versaoServidor,
    });
    if (!validacaoVersao.ok) {
      throw erroSessao(
        'A versão do aplicativo aberta está desatualizada. A nova importação não foi gravada. Recarregue a página e importe novamente.',
        409,
        'SESSAO_DESATUALIZADA'
      );
    }

    // Rede de segurança anterior: ao zerar uma sessão com lançamentos, mantém uma cópia de um nível.
    const qtdNova = resumo ? Number(resumo.total_lancamentos || 0) : 0;
    const qtdAtual = atual.dados && atual.dados.resumo ? Number(atual.dados.resumo.total_lancamentos || 0) : 0;
    if (!qtdNova && qtdAtual > 0 && atual.stateJson) {
      try {
        const anteriorRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('anterior');
        await gravarDocumentoJson(anteriorRef, atual.stateJson, {
          resumo: atual.dados.resumo || null,
          backup_de: 'current',
          backup_em: new Date(),
          backup_por_uid: req.user.uid,
          backup_por_email: req.user.email,
        });
      } catch (erroBackup) {
        console.warn('[sessao] backup pre-sobrescrita falhou:', erroBackup.message || erroBackup);
      }
    }

    const atualizacaoEmpresa = { last_session_at: new Date(), last_session_by_email: req.user.email };
    if (chk.empresa.modo_contabil === 'cci_exclusivo' && chk.empresa.saldo_abertura_status === 'aprovado') {
      const periodoInicial = periodoInicialEmpresa(chk.empresa);
      const estadoNovo = lerEstadoContabil(state_json);
      const saldosNovos = periodoInicial && estadoNovo.relatoriosContabeis && estadoNovo.relatoriosContabeis.saldosIniciais
        ? estadoNovo.relatoriosContabeis.saldosIniciais[periodoInicial] || {}
        : {};
      if (!periodoInicial || hashSaldosAbertura(saldosNovos) !== String(chk.empresa.saldo_abertura_hash || '')) {
        atualizacaoEmpresa.saldo_abertura_status = 'pendente_reaprovacao';
        atualizacaoEmpresa.saldo_abertura_hash = FieldValue.delete();
        atualizacaoEmpresa.saldo_abertura_invalidado_em = new Date();
        atualizacaoEmpresa.saldo_abertura_invalidado_por_uid = req.user.uid;
        atualizacaoEmpresa.saldo_abertura_invalidado_por_email = req.user.email;
      }
    }
    const resultado = await gravarSessaoBloqueada(sessaoRef, state_json, resumo, req.user, {
      exigirRevisao,
      empresaRef,
      atualizacaoEmpresa,
      limparChunksAntigos: !!(atual.dados && atual.dados.state_chunked),
    });
    temposPersistencia.gravacao = Date.now() - inicioPersistencia - temposPersistencia.acesso - temposPersistencia.trava - temposPersistencia.leituras;
    tokenTrava = null;
    const totalPersistencia = Date.now() - inicioPersistencia;
    res.setHeader('Server-Timing', [
      `access;dur=${temposPersistencia.acesso}`,
      `lock;dur=${temposPersistencia.trava}`,
      `reads;dur=${temposPersistencia.leituras}`,
      `write;dur=${temposPersistencia.gravacao}`,
      `total;dur=${totalPersistencia}`,
    ].join(', '));
    console.info('[sessao-perf]', JSON.stringify({
      status: 200,
      total_ms: totalPersistencia,
      ...temposPersistencia,
      state_bytes: resultado.stateBytes,
      stored_bytes: resultado.storedBytes,
      chunked: resultado.chunked,
    }));
    res.json({
      ok: true,
      chunked: resultado.chunked,
      chunks: resultado.chunks,
      encoding: resultado.encoding,
      state_bytes: resultado.stateBytes,
      stored_bytes: resultado.storedBytes,
      session_revision: resultado.revisao,
    });
  } catch (e) {
    if (sessaoRef && tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    console.error('salvar sessao erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_SALVAR_SESSAO' });
  }
});

app.get('/api/empresas/:cnpj/sessao', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada) return res.json({ encontrada: false });
    const dados = { ...sessao.dados, state_json: sessao.stateJson };
    delete dados.session_write_lock;
    res.json({ encontrada: true, ...dados });
  } catch (e) {
    console.error('carregar sessao erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_CARREGAR_SESSAO' });
  }
});

function idLoteMigracaoSage(valor) {
  const id = String(valor || '');
  return /^sage_\d{6}_[a-f0-9]{24}$/.test(id) ? id : '';
}

async function carregarLoteMigracaoSage(loteRef) {
  const armazenamento = await carregarSessaoAtualPorRef(loteRef);
  if (!armazenamento.encontrada || !armazenamento.stateJson) {
    throw erroSessao('Lote de migração SAGE não encontrado ou incompleto.', 404, 'LOTE_MIGRACAO_NAO_ENCONTRADO');
  }
  try {
    return { armazenamento, staging: JSON.parse(armazenamento.stateJson) };
  } catch (_) {
    throw erroSessao('Staging do lote de migração está corrompido.', 409, 'STAGING_MIGRACAO_INVALIDO');
  }
}

app.post('/api/admin/empresas/:cnpj/migracao-sage/staging', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const contasPlano = await carregarContasContabeisEmpresa(chk.empresa);
    const contasCciValidas = [...new Set(contasPlano.flatMap(conta => [conta.id, conta.codigo, conta.reduzido]).map(String).filter(Boolean))];
    const staging = prepararStagingMigracaoSage({ ...(req.body || {}), empresa_cnpj: cnpjLimpo, contas_cci_validas: contasCciValidas });
    const loteRef = db.collection('empresas').doc(cnpjLimpo).collection('migracoes_sage').doc(staging.lote_id);
    const existente = await loteRef.get();
    if (existente.exists) {
      const anterior = existente.data() || {};
      if (String(anterior.staging_hash || '') !== staging.staging_hash) {
        throw erroSessao('O identificador do lote já existe com outro conteúdo.', 409, 'STAGING_HASH_CONFLITANTE');
      }
      if (anterior.status && anterior.status !== 'gravando_staging') {
        return res.status(anterior.status === 'rejeitado' ? 422 : 200).json({
          ok: anterior.status !== 'rejeitado',
          idempotente: true,
          lote_id: staging.lote_id,
          status: anterior.status,
          staging_hash: staging.staging_hash,
          resumo: anterior.resumo || staging.resumo,
          erros_gerais: staging.erros_gerais,
          rejeicoes: staging.rejeicoes.slice(0, 500),
          rejeicoes_truncadas: staging.rejeicoes.length > 500,
        });
      }
    } else {
      await loteRef.create({
        status: 'gravando_staging',
        staging_hash: staging.staging_hash,
        lote_id: staging.lote_id,
        empresa_cnpj: cnpjLimpo,
        criado_em: new Date(),
        criado_por_uid: req.user.uid,
        criado_por_email: req.user.email,
      });
    }
    const status = staging.apto ? 'staged' : 'rejeitado';
    await gravarDocumentoJson(loteRef, JSON.stringify(staging), {
      status,
      staging_hash: staging.staging_hash,
      lote_id: staging.lote_id,
      empresa_cnpj: cnpjLimpo,
      codigo_empresa_sage: staging.codigo_empresa_sage,
      competencia: staging.competencia,
      fonte: staging.fonte,
      de_para_hash: staging.de_para_hash,
      plano_cci_hash: staging.plano_cci_hash,
      resumo: staging.resumo,
      total_oficial: staging.total_oficial,
      atualizado_em: new Date(),
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email,
    });
    await registrarAuditoriaAdmin(db, {
      evento: staging.apto ? 'migracao_sage_staging_criado' : 'migracao_sage_staging_rejeitado',
      categoria: 'migracao',
      acao: 'preparar_staging_sage',
      resultado: { status: staging.apto ? 'sucesso' : 'bloqueado', httpStatus: staging.apto ? 201 : 422 },
      cnpj: cnpjLimpo,
      escopo: { recurso: 'migracoes_sage', recursoId: staging.lote_id, periodo: staging.competencia, loteId: staging.lote_id },
      detalhes: { recebidos: staging.resumo.recebidos, aceitos: staging.resumo.aceitos, rejeitados: staging.resumo.rejeitados, staging_hash: staging.staging_hash },
      user: req.user,
    });
    return res.status(staging.apto ? 201 : 422).json({
      ok: staging.apto,
      idempotente: false,
      lote_id: staging.lote_id,
      status,
      staging_hash: staging.staging_hash,
      resumo: staging.resumo,
      erros_gerais: staging.erros_gerais,
      rejeicoes: staging.rejeicoes.slice(0, 500),
      rejeicoes_truncadas: staging.rejeicoes.length > 500,
    });
  } catch (erro) {
    console.error('staging migracao SAGE erro:', erro);
    return res.status(erro.status || 500).json({ erro: erro.message, codigo: erro.codigo || 'ERRO_STAGING_MIGRACAO' });
  }
});

app.get('/api/admin/empresas/:cnpj/migracao-sage/lotes', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpjLimpo).collection('migracoes_sage').orderBy('atualizado_em', 'desc').limit(100).get();
    const lotes = snap.docs.map(doc => {
      const dados = doc.data() || {};
      return {
        lote_id: doc.id,
        status: dados.status || 'desconhecido',
        staging_hash: dados.staging_hash || null,
        competencia: dados.competencia || null,
        fonte: dados.fonte || null,
        resumo: dados.resumo || null,
        total_oficial: dados.total_oficial || null,
        aceite: dados.aceite || null,
        aplicado_em: dados.aplicado_em || null,
        revertido_em: dados.revertido_em || null,
      };
    });
    return res.json({ ok: true, lotes });
  } catch (erro) {
    console.error('listar lotes migracao SAGE erro:', erro);
    return res.status(erro.status || 500).json({ erro: erro.message, codigo: erro.codigo || 'ERRO_LISTAR_MIGRACOES' });
  }
});

app.get('/api/admin/empresas/:cnpj/migracao-sage/:loteId', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const loteId = idLoteMigracaoSage(req.params.loteId);
    if (cnpjLimpo.length !== 14 || !loteId) return res.status(400).json({ erro: 'Empresa ou lote inválido.' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const loteRef = db.collection('empresas').doc(cnpjLimpo).collection('migracoes_sage').doc(loteId);
    const { armazenamento, staging } = await carregarLoteMigracaoSage(loteRef);
    const dados = armazenamento.dados || {};
    return res.json({
      ok: true,
      lote_id: loteId,
      status: dados.status,
      staging_hash: staging.staging_hash,
      competencia: staging.competencia,
      fonte: staging.fonte,
      de_para_hash: staging.de_para_hash,
      plano_cci_hash: staging.plano_cci_hash,
      resumo: staging.resumo,
      total_oficial: staging.total_oficial,
      erros_gerais: staging.erros_gerais,
      rejeicoes: staging.rejeicoes.slice(0, 1000),
      rejeicoes_truncadas: staging.rejeicoes.length > 1000,
      aceite: dados.aceite || null,
    });
  } catch (erro) {
    console.error('detalhar lote migracao SAGE erro:', erro);
    return res.status(erro.status || 500).json({ erro: erro.message, codigo: erro.codigo || 'ERRO_DETALHAR_MIGRACAO' });
  }
});

app.post('/api/admin/empresas/:cnpj/migracao-sage/:loteId/aplicar', adminRequired, async (req, res) => {
  let sessaoRef = null;
  let tokenTrava = null;
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const loteId = idLoteMigracaoSage(req.params.loteId);
    const body = req.body || {};
    const aceite = body.aceite || {};
    if (cnpjLimpo.length !== 14 || !loteId) return res.status(400).json({ erro: 'Empresa ou lote inválido.' });
    if (body.confirmacao !== 'MIGRAR' || aceite.termo_aceite !== true) return res.status(400).json({ erro: 'Confirme MIGRAR e o termo de aceite formal.' });
    if (String(aceite.responsavel_contabil || '').trim().length < 5) return res.status(400).json({ erro: 'Informe o responsável contábil pelo aceite.' });
    if (String(aceite.funcao || '').trim().length < 4) return res.status(400).json({ erro: 'Informe a função ou identificação profissional do responsável.' });
    if (String(aceite.observacao || '').trim().length < 10) return res.status(400).json({ erro: 'Registre a evidência do aceite com pelo menos 10 caracteres.' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const loteRef = db.collection('empresas').doc(cnpjLimpo).collection('migracoes_sage').doc(loteId);
    const { armazenamento, staging } = await carregarLoteMigracaoSage(loteRef);
    const loteDados = armazenamento.dados || {};
    if (String(body.staging_hash || '') !== staging.staging_hash) throw erroSessao('O staging mudou ou não corresponde à prévia aceita.', 409, 'STAGING_HASH_DIVERGENTE');
    const contasPlanoAtuais = await carregarContasContabeisEmpresa(chk.empresa);
    const aliasesPlanoAtuais = [...new Set(contasPlanoAtuais.flatMap(conta => [conta.id, conta.codigo, conta.reduzido]).map(String).filter(Boolean))].sort();
    if (hashMigracaoSage(aliasesPlanoAtuais) !== String(staging.plano_cci_hash || '')) {
      throw erroSessao('O plano de contas mudou depois do staging. Gere uma nova prévia antes de migrar.', 409, 'PLANO_CCI_ALTERADO_APOS_STAGING');
    }
    if (loteDados.status === 'revertido') return res.status(409).json({ erro: 'O lote já foi revertido e não pode ser reaplicado.', codigo: 'LOTE_REVERTIDO' });
    if (!['staged', 'aplicando', 'aplicado'].includes(loteDados.status)) return res.status(409).json({ erro: 'O lote não está apto para aplicação.', codigo: 'LOTE_NAO_APTO' });
    sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    tokenTrava = await adquirirTravaSessao(sessaoRef, req.user, 'migracao_sage');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) throw erroSessao('A empresa não possui sessão contábil para receber a migração.', 409, 'SESSAO_NAO_ENCONTRADA');
    if (loteDados.status === 'aplicado') {
      if (hashSessao(sessao.stateJson) !== String(loteDados.hash_estado_depois || '')) {
        throw erroSessao('A sessão mudou após a aplicação do lote. Reaplicação automática bloqueada.', 409, 'SESSAO_ALTERADA_APOS_MIGRACAO');
      }
      await liberarTravaSessao(sessaoRef, tokenTrava);
      tokenTrava = null;
      return res.json({ ok: true, lote_id: loteId, status: 'aplicado', idempotente: true, quantidade: Number(loteDados.quantidade_aplicada || 0), session_revision: loteDados.session_revision_aplicacao || null });
    }
    const estado = parsearStateJson(sessao.stateJson);
    let backupMeta = loteDados.backup_estado_anterior || null;
    let hashAntes = loteDados.hash_estado_antes || null;
    if (!backupMeta) {
      hashAntes = hashSessao(sessao.stateJson);
      backupMeta = await gravarTextoBackup(loteRef, 'estado_anterior_chunks', sessao.stateJson);
      await loteRef.set({
        status: 'aplicando',
        hash_estado_antes: hashAntes,
        backup_estado_anterior: backupMeta,
        aceite: {
          termo_aceite: true,
          responsavel_contabil: String(aceite.responsavel_contabil).trim().slice(0, 180),
          funcao: String(aceite.funcao || '').trim().slice(0, 120),
          observacao: String(aceite.observacao).trim().slice(0, 500),
          aceito_em: new Date(),
          aceito_por_uid: req.user.uid,
          aceito_por_email: req.user.email,
        },
        atualizado_em: new Date(),
      }, { merge: true });
    }
    const aplicacao = aplicarMigracaoSageNoEstado(estado, staging, new Date(), req.user);
    const novoStateJson = JSON.stringify(estado);
    await impedirAlteracaoPeriodosFechados(cnpjLimpo, sessao.stateJson, novoStateJson);
    const resumo = { ...(sessao.dados.resumo || {}), total_lancamentos: estado.entries.length, ultima_migracao_sage_lote: loteId };
    let resultadoSessao = null;
    if (!aplicacao.idempotente) resultadoSessao = await gravarSessaoBloqueada(sessaoRef, novoStateJson, resumo, req.user, { exigirRevisao: true });
    else await liberarTravaSessao(sessaoRef, tokenTrava);
    tokenTrava = null;
    const hashDepois = hashSessao(novoStateJson);
    await loteRef.set({
      status: 'aplicado',
      hash_estado_antes: hashAntes,
      hash_estado_depois: hashDepois,
      backup_estado_anterior: backupMeta,
      quantidade_aplicada: staging.aceitos.length,
      aplicado_em: new Date(),
      aplicado_por_uid: req.user.uid,
      aplicado_por_email: req.user.email,
      session_revision_aplicacao: resultadoSessao && resultadoSessao.revisao || loteDados.session_revision_aplicacao || null,
      atualizado_em: new Date(),
    }, { merge: true });
    await registrarAuditoriaAdmin(db, {
      evento: 'migracao_sage_lote_aplicado', categoria: 'migracao', acao: 'aplicar_lote_sage',
      resultado: { status: 'sucesso', httpStatus: aplicacao.idempotente ? 200 : 201 }, cnpj: cnpjLimpo,
      escopo: { recurso: 'migracoes_sage', recursoId: loteId, periodo: staging.competencia, loteId },
      detalhes: { quantidade: staging.aceitos.length, idempotente: aplicacao.idempotente, staging_hash: staging.staging_hash, hash_estado_depois: hashDepois }, user: req.user,
    });
    return res.status(aplicacao.idempotente ? 200 : 201).json({ ok: true, lote_id: loteId, status: 'aplicado', idempotente: aplicacao.idempotente, quantidade: staging.aceitos.length, session_revision: resultadoSessao && resultadoSessao.revisao || null });
  } catch (erro) {
    if (sessaoRef && tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    console.error('aplicar migracao SAGE erro:', erro);
    return res.status(erro.status || 500).json({ erro: erro.message, codigo: erro.codigo || 'ERRO_APLICAR_MIGRACAO' });
  }
});

app.post('/api/admin/empresas/:cnpj/migracao-sage/:loteId/reverter', adminRequired, async (req, res) => {
  let sessaoRef = null;
  let tokenTrava = null;
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const loteId = idLoteMigracaoSage(req.params.loteId);
    const body = req.body || {};
    const motivo = String(body.motivo || '').trim();
    if (cnpjLimpo.length !== 14 || !loteId) return res.status(400).json({ erro: 'Empresa ou lote inválido.' });
    if (body.confirmacao !== 'REVERTER' || motivo.length < 10) return res.status(400).json({ erro: 'Confirme REVERTER e informe o motivo com pelo menos 10 caracteres.' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const loteRef = db.collection('empresas').doc(cnpjLimpo).collection('migracoes_sage').doc(loteId);
    const loteDoc = await loteRef.get();
    if (!loteDoc.exists) return res.status(404).json({ erro: 'Lote não encontrado.' });
    const lote = loteDoc.data() || {};
    if (lote.status === 'revertido') return res.json({ ok: true, lote_id: loteId, status: 'revertido', idempotente: true });
    if (lote.status !== 'aplicado') return res.status(409).json({ erro: 'Somente lote aplicado pode ser revertido.', codigo: 'LOTE_NAO_APLICADO' });
    sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    tokenTrava = await adquirirTravaSessao(sessaoRef, req.user, 'rollback_migracao_sage');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) throw erroSessao('A sessão contábil não foi encontrada.', 409, 'SESSAO_NAO_ENCONTRADA');
    const estadoAnterior = await carregarTextoBackup(loteRef, 'estado_anterior_chunks', lote.backup_estado_anterior);
    if (hashSessao(estadoAnterior) !== String(lote.hash_estado_antes || '')) throw erroSessao('O backup anterior não corresponde ao hash registrado.', 409, 'BACKUP_MIGRACAO_DIVERGENTE');
    const estado = parsearStateJson(sessao.stateJson);
    let reversao;
    try {
      reversao = removerMigracaoSageDoEstado(estado, loteId);
    } catch (erroReversao) {
      throw erroSessao(erroReversao.message, 409, 'LANCAMENTO_MIGRADO_ALTERADO');
    }
    if (reversao.quantidade !== Number(lote.quantidade_aplicada || 0)) {
      throw erroSessao('A quantidade do lote na sessão diverge da aplicação registrada.', 409, 'LOTE_MIGRACAO_INCOMPLETO');
    }
    const estadoRevertidoJson = JSON.stringify(estado);
    await impedirAlteracaoPeriodosFechados(cnpjLimpo, sessao.stateJson, estadoRevertidoJson);
    const resumo = { ...(sessao.dados.resumo || {}), total_lancamentos: estado.entries.length, ultima_migracao_sage_revertida: loteId };
    const resultado = await gravarSessaoBloqueada(sessaoRef, estadoRevertidoJson, resumo, req.user, { exigirRevisao: true });
    tokenTrava = null;
    const hashDepoisReversao = hashSessao(estadoRevertidoJson);
    await loteRef.set({
      status: 'revertido', revertido_em: new Date(), revertido_por_uid: req.user.uid,
      revertido_por_email: req.user.email, motivo_reversao: motivo.slice(0, 500),
      session_revision_reversao: resultado.revisao, hash_estado_depois_reversao: hashDepoisReversao,
      quantidade_revertida: reversao.quantidade, atualizado_em: new Date(),
    }, { merge: true });
    await registrarAuditoriaAdmin(db, {
      evento: 'migracao_sage_lote_revertido', categoria: 'migracao', acao: 'reverter_lote_sage',
      resultado: { status: 'sucesso', httpStatus: 200 }, cnpj: cnpjLimpo,
      escopo: { recurso: 'migracoes_sage', recursoId: loteId, periodo: lote.competencia, loteId },
      detalhes: { quantidade: reversao.quantidade, motivo, hash_estado_depois_reversao: hashDepoisReversao }, user: req.user,
    });
    return res.json({ ok: true, lote_id: loteId, status: 'revertido', idempotente: false, session_revision: resultado.revisao });
  } catch (erro) {
    if (sessaoRef && tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    console.error('reverter migracao SAGE erro:', erro);
    return res.status(erro.status || 500).json({ erro: erro.message, codigo: erro.codigo || 'ERRO_REVERTER_MIGRACAO' });
  }
});

app.post('/api/admin/exclusao-lancamentos/preview', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.body && req.body.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'Selecione uma empresa com CNPJ válido.' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) return res.status(404).json({ erro: 'A empresa não possui uma sessão de lançamentos salva.' });
    const state = parsearStateJson(sessao.stateJson);
    const previa = montarPreviaExclusao(state.entries, req.body.filtros || req.body);
    res.json({
      ok: true,
      empresa: { cnpj: cnpjLimpo, razao_social: chk.empresa.razao_social || chk.empresa.nome || cnpjLimpo },
      previa,
      previewToken: tokenPreviaExclusao(sessao.stateJson, cnpjLimpo, previa.filtros),
      sessaoAtualizadaEm: sessao.dados.updated_at || null,
    });
  } catch (e) {
    console.error('preview exclusao lancamentos erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_PREVIEW_EXCLUSAO' });
  }
});

app.post('/api/admin/exclusao-lancamentos/executar', adminRequired, async (req, res) => {
  let sessaoRef = null;
  let tokenTrava = null;
  let backupRef = null;
  try {
    const body = req.body || {};
    const cnpjLimpo = String(body.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'Selecione uma empresa com CNPJ válido.' });
    if (body.confirmacao !== 'EXCLUIR') return res.status(400).json({ erro: 'Digite EXCLUIR exatamente para confirmar.' });
    if (!/^[a-f0-9]{64}$/.test(String(body.previewToken || ''))) return res.status(400).json({ erro: 'Prévia inválida. Gere uma nova prévia.' });
    const quantidadeEsperada = Number(body.quantidadeEsperada);
    if (!Number.isInteger(quantidadeEsperada) || quantidadeEsperada <= 0) return res.status(400).json({ erro: 'A quantidade esperada para exclusão é inválida.' });
    const chavesSelecionadas = Array.isArray(body.chavesSelecionadas) ? [...new Set(body.chavesSelecionadas.map(String).filter(Boolean))] : [];
    if (!chavesSelecionadas.length || chavesSelecionadas.length > 500) return res.status(400).json({ erro: 'Selecione ao menos uma importação válida.' });
    if (chavesSelecionadas.some(chave => chave.length > 500)) return res.status(400).json({ erro: 'Uma das importações selecionadas possui um identificador inválido.' });

    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) return res.status(404).json({ erro: 'A empresa não possui uma sessão de lançamentos salva.' });
    const state = parsearStateJson(sessao.stateJson);
    const exclusao = aplicarExclusao(state.entries, body.filtros || body, chavesSelecionadas);
    if (tokenPreviaExclusao(sessao.stateJson, cnpjLimpo, exclusao.resumo.filtros) !== body.previewToken) {
      throw erroSessao('A sessão ou os filtros mudaram depois da prévia. Gere uma nova prévia antes de excluir.', 409, 'PREVIA_DESATUALIZADA');
    }
    if (exclusao.resumo.quantidadeRemovida !== quantidadeEsperada) {
      throw erroSessao('A quantidade de lançamentos mudou. Gere uma nova prévia antes de excluir.', 409, 'QUANTIDADE_DIVERGENTE');
    }

    tokenTrava = await adquirirTravaSessao(sessaoRef, req.user, 'exclusao_admin', sessao.updateMillis);
    const estadoAnteriorHash = hashSessao(sessao.stateJson);
    const removidosJson = JSON.stringify(exclusao.removidos);
    const fingerprintsLiberados = fingerprintsImportacaoLiberados(exclusao.mantidos, exclusao.removidos);
    state.entries = exclusao.mantidos;
    const novoStateJson = JSON.stringify(state);
    const novoResumo = {
      ...(sessao.dados.resumo || {}),
      total_lancamentos: exclusao.resumo.quantidadeDepois,
      ultima_exclusao_admin_em: new Date().toISOString(),
      ultima_exclusao_admin_quantidade: exclusao.resumo.quantidadeRemovida,
    };

    backupRef = db.collection('empresas').doc(cnpjLimpo).collection('exclusoes_admin').doc();
    await backupRef.set({
      status: 'gravando_backup',
      cnpj: cnpjLimpo,
      empresa: chk.empresa.razao_social || chk.empresa.nome || cnpjLimpo,
      data_inicial: exclusao.resumo.dataInicial,
      data_final: exclusao.resumo.dataFinal,
      filtros: exclusao.resumo.filtros,
      chaves_importacao: chavesSelecionadas,
      quantidade_antes: exclusao.resumo.quantidadeAntes,
      quantidade_removida: exclusao.resumo.quantidadeRemovida,
      quantidade_depois: exclusao.resumo.quantidadeDepois,
      creditos_removidos: exclusao.resumo.creditosRemovidos,
      debitos_removidos: exclusao.resumo.debitosRemovidos,
      fingerprints_importacao_liberados: fingerprintsLiberados,
      hash_estado_anterior: estadoAnteriorHash,
      hash_estado_novo: hashSessao(novoStateJson),
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email,
    });
    const backupEstado = await gravarTextoBackup(backupRef, 'estado_anterior_chunks', sessao.stateJson);
    const backupRemovidos = await gravarTextoBackup(backupRef, 'lancamentos_removidos_chunks', removidosJson);
    const metadadosImportacao = await prepararBackupMetadadosImportacao(cnpjLimpo, fingerprintsLiberados, backupRef);
    await backupRef.set({
      status: 'backup_pronto',
      estado_anterior_backup: backupEstado,
      lancamentos_removidos_backup: backupRemovidos,
      importacoes_metadata_backup: metadadosImportacao.length,
      backup_concluido_em: new Date(),
    }, { merge: true });

    let resultado;
    try {
      resultado = await gravarSessaoBloqueada(sessaoRef, novoStateJson, novoResumo, req.user, { exigirRevisao: true });
      tokenTrava = null;
    } catch (erroAplicacao) {
      await backupRef.set({ status: 'backup_pronto_falha_aplicacao', falha_aplicacao: String(erroAplicacao.message || erroAplicacao).slice(0, 500) }, { merge: true });
      throw erroAplicacao;
    }
    const avisos = [];
    try {
      await excluirMetadadosImportacao(metadadosImportacao);
    } catch (erroMetadata) {
      avisos.push('Os lançamentos foram excluídos, mas alguns marcadores de importação não puderam ser liberados automaticamente.');
      console.warn('[exclusao-admin] metadados de importacao:', erroMetadata.message || erroMetadata);
    }
    await backupRef.set({
      status: avisos.length ? 'aplicado_com_aviso' : 'aplicado',
      aplicado_em: new Date(),
      session_revision_nova: resultado.revisao,
      avisos,
    }, { merge: true }).catch(erro => console.warn('[exclusao-admin] atualizar backup aplicado falhou:', erro.message || erro));
    await db.collection('empresas').doc(cnpjLimpo).set({ last_session_at: new Date(), last_session_by_email: req.user.email }, { merge: true })
      .catch(erro => console.warn('[exclusao-admin] atualizar empresa falhou:', erro.message || erro));
    await registrarAuditoriaAdmin(db, {
      evento: 'exclusao_lancamentos_importacao',
      categoria: 'exclusao',
      acao: 'excluir_lancamentos_importados',
      resultado: { status: 'sucesso', httpStatus: 200 },
      cnpj: cnpjLimpo,
      escopo: { recurso: 'sessoes', recursoId: 'current', loteId: backupRef.id },
      detalhes: {
        quantidade_antes: exclusao.resumo.quantidadeAntes,
        quantidade_removida: exclusao.resumo.quantidadeRemovida,
        quantidade_depois: exclusao.resumo.quantidadeDepois,
        creditos_removidos: exclusao.resumo.creditosRemovidos,
        debitos_removidos: exclusao.resumo.debitosRemovidos,
        importacoes_liberadas: metadadosImportacao.length,
      },
      user: req.user,
    }).catch(erroAudit => console.warn('[exclusao-admin] audit log falhou:', erroAudit.message || erroAudit));
    res.json({ ok: true, backupId: backupRef.id, resumo: exclusao.resumo, importacoesLiberadas: metadadosImportacao.length, avisos, session_revision: resultado.revisao });
  } catch (e) {
    if (sessaoRef && tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    if (backupRef) {
      await backupRef.set({ status: 'falha', falha: String(e.message || e).slice(0, 500), falha_em: new Date() }, { merge: true }).catch(() => {});
    }
    console.error('executar exclusao lancamentos erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_EXECUTAR_EXCLUSAO' });
  }
});

function normalizarBemAtivo(body) {
  const b = body || {};
  const statusPermitidos = new Set(['ativo', 'em_construcao', 'mantido_venda', 'baixado']);
  const classe = AtivoImobilizado.classeFiscal(String(b.classe_fiscal || 'customizado'));
  return {
    descricao: String(b.descricao || '').trim().slice(0, 180),
    patrimonio: String(b.patrimonio || '').trim().slice(0, 60),
    classe_fiscal: classe.id,
    data_aquisicao: AtivoImobilizado.dataISO(b.data_aquisicao),
    data_disponivel_uso: AtivoImobilizado.dataISO(b.data_disponivel_uso),
    data_mantido_venda: AtivoImobilizado.dataISO(b.data_mantido_venda),
    custo: AtivoImobilizado.numero(b.custo),
    valor_residual: AtivoImobilizado.numero(b.valor_residual),
    vida_util_meses: Math.round(AtivoImobilizado.numero(b.vida_util_meses)),
    taxa_fiscal_anual: AtivoImobilizado.numero(b.taxa_fiscal_anual === '' || b.taxa_fiscal_anual == null ? classe.taxaAnual : b.taxa_fiscal_anual),
    metodo: 'linear',
    condicao: String(b.condicao || 'novo') === 'usado' ? 'usado' : 'novo',
    data_primeiro_uso: AtivoImobilizado.dataISO(b.data_primeiro_uso),
    conta_ativo: String(b.conta_ativo || '').trim().slice(0, 40),
    conta_depreciacao_acumulada: String(b.conta_depreciacao_acumulada || '').trim().slice(0, 40),
    conta_despesa_depreciacao: String(b.conta_despesa_depreciacao || '').trim().slice(0, 40),
    conta_contrapartida_aquisicao: String(b.conta_contrapartida_aquisicao || '').trim().slice(0, 40),
    centro_custo: String(b.centro_custo || '').trim().slice(0, 80),
    localizacao: String(b.localizacao || '').trim().slice(0, 120),
    fornecedor: String(b.fornecedor || '').trim().slice(0, 160),
    documento: String(b.documento || '').trim().slice(0, 80),
    fundamento_taxa: String(b.fundamento_taxa || '').trim().slice(0, 800),
    observacoes: String(b.observacoes || '').trim().slice(0, 1200),
    status: statusPermitidos.has(String(b.status || 'ativo')) ? String(b.status || 'ativo') : 'ativo'
  };
}

app.get('/api/empresas/:cnpj/ativos-imobilizados', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const snap = await db.collection('empresas').doc(cnpj).collection('ativos_imobilizados').orderBy('descricao').limit(1000).get();
    const itens = snap.docs.map(function (doc) {
      const dados = doc.data() || {};
      return { id: doc.id, ...dados, criado_em: serializarDataSegura(dados.criado_em), atualizado_em: serializarDataSegura(dados.atualizado_em), baixa_em: serializarDataSegura(dados.baixa_em) };
    });
    res.json({ itens, referencias_fiscais: AtivoImobilizado.CLASSES_FISCAIS });
  } catch (e) { console.error('listar ativos imobilizados erro:', e); res.status(500).json({ erro: e.message }); }
});

app.post('/api/empresas/:cnpj/ativos-imobilizados', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const dados = normalizarBemAtivo(req.body);
    const validacao = AtivoImobilizado.validar(dados);
    if (!validacao.ok) return res.status(400).json({ erro: validacao.erros.join(' '), validacao });
    const ref = db.collection('empresas').doc(cnpj).collection('ativos_imobilizados').doc();
    await ref.set({ ...dados, criado_em: new Date(), criado_por_uid: req.user.uid, criado_por_email: req.user.email, atualizado_em: new Date(), atualizado_por_uid: req.user.uid, atualizado_por_email: req.user.email, versao_regra: 'CPC27-IN1700-2026', lancamento_automatico: false });
    res.status(201).json({ id: ref.id, ...dados, validacao });
  } catch (e) { console.error('cadastrar ativo imobilizado erro:', e); res.status(500).json({ erro: e.message }); }
});

app.put('/api/empresas/:cnpj/ativos-imobilizados/:id', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const ref = db.collection('empresas').doc(cnpj).collection('ativos_imobilizados').doc(String(req.params.id || ''));
    const atual = await ref.get();
    if (!atual.exists) return res.status(404).json({ erro: 'Bem não encontrado.' });
    if (String((atual.data() || {}).status) === 'baixado') return res.status(409).json({ erro: 'Bem baixado não pode ser editado; a trilha histórica foi preservada.' });
    const dados = normalizarBemAtivo({ ...(atual.data() || {}), ...(req.body || {}) });
    const validacao = AtivoImobilizado.validar(dados);
    if (!validacao.ok) return res.status(400).json({ erro: validacao.erros.join(' '), validacao });
    await ref.set({ ...dados, atualizado_em: new Date(), atualizado_por_uid: req.user.uid, atualizado_por_email: req.user.email }, { merge: true });
    res.json({ id: ref.id, ...dados, validacao });
  } catch (e) { console.error('atualizar ativo imobilizado erro:', e); res.status(500).json({ erro: e.message }); }
});

app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/baixa', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    res.status(409).json({ erro: 'A baixa direta foi desativada. Gere a prévia contábil e aprove o evento patrimonial antes de alterar o bem.', codigo: 'BAIXA_EXIGE_PREVIA_CONTABIL' });
  } catch (e) { console.error('baixar ativo imobilizado erro:', e); res.status(500).json({ erro: e.message }); }
});

async function previaEventoAtivoEmpresa(empresaRef, bemId, tipo, dados, stateJson) {
  const [bemDoc, geradosSnap] = await Promise.all([
    empresaRef.collection('ativos_imobilizados').doc(bemId).get(),
    empresaRef.collection('ativos_lancamentos').get()
  ]);
  if (!bemDoc.exists) throw erroSessao('Bem não encontrado.', 404, 'ATIVO_NAO_ENCONTRADO');
  const bem = { id: bemDoc.id, ...(bemDoc.data() || {}) };
  const chavesSessao = stateJson ? parsearStateJson(stateJson).entries.map(function (item) { return String(item.chave || ''); }).filter(Boolean) : [];
  const chaves = geradosSnap.docs.map(function (doc) { return String((doc.data() || {}).chave || doc.id); }).concat(chavesSessao);
  return AtivoImobilizadoContabil.previaEvento(bem, tipo, dados, chaves);
}

app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/eventos/previa', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const empresaRef = db.collection('empresas').doc(cnpj);
    const sessao = await carregarSessaoAtualPorRef(empresaRef.collection('sessoes').doc('current'));
    const tipo = String(req.body && req.body.tipo || '').trim();
    const previa = await previaEventoAtivoEmpresa(empresaRef, String(req.params.id || ''), tipo, req.body || {}, sessao.stateJson || '');
    if (previa.periodo) {
      const periodoDoc = await empresaRef.collection('periodos_contabeis').doc(previa.periodo).get();
      if (periodoDoc.exists && String((periodoDoc.data() || {}).status) === 'fechado') return res.status(409).json({ erro: 'Reabra a competência antes de contabilizar o evento patrimonial.', codigo: 'PERIODO_CONTABIL_FECHADO' });
    }
    res.json({ ...previa, hash_previa: hashSessao(JSON.stringify({ lancamentos: previa.lancamentos, mutacao_bem: previa.mutacao_bem })) });
  } catch (e) { res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_PREVIA_EVENTO_ATIVO' }); }
});

app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/eventos/aprovar', async (req, res) => {
  let sessaoRef = null;
  let tokenTrava = null;
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const bemId = String(req.params.id || '');
    const tipo = String(req.body && req.body.tipo || '').trim();
    const hashPrevia = String(req.body && req.body.hash_previa || '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const empresaRef = db.collection('empresas').doc(cnpj);
    sessaoRef = empresaRef.collection('sessoes').doc('current');
    tokenTrava = await adquirirTravaSessao(sessaoRef, req.user, 'evento_ativo_' + tipo);
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) throw erroSessao('Sessão contábil não encontrada.', 409, 'SESSAO_NAO_ENCONTRADA');
    const previa = await previaEventoAtivoEmpresa(empresaRef, bemId, tipo, req.body || {}, sessao.stateJson);
    if (!previa.ok) throw erroSessao(previa.erros[0] || 'Evento patrimonial sem lançamento válido.', 409, 'ATIVO_SEM_LANCAMENTOS');
    const periodoDoc = await empresaRef.collection('periodos_contabeis').doc(previa.periodo).get();
    if (periodoDoc.exists && String((periodoDoc.data() || {}).status) === 'fechado') throw erroSessao('Reabra a competência antes de contabilizar o evento patrimonial.', 409, 'PERIODO_CONTABIL_FECHADO');
    const hashAtual = hashSessao(JSON.stringify({ lancamentos: previa.lancamentos, mutacao_bem: previa.mutacao_bem }));
    if (!hashPrevia || hashAtual !== hashPrevia) throw erroSessao('A prévia mudou. Revise o evento antes de aprovar.', 409, 'PREVIA_DESATUALIZADA');
    const state = parsearStateJson(sessao.stateJson);
    const agora = new Date().toISOString();
    previa.lancamentos.forEach(function (lancamento, indice) {
      state.entries.push({
        ...lancamento,
        id: 'ativo-' + cryptoAdmin.createHash('sha1').update(lancamento.chave).digest('hex').slice(0, 16),
        codigoHistorico: '', historicoPadraoDescricao: '', incomum: false,
        empresa: chk.empresa.razao_social || '', cnpj, categoria: 'Ativo imobilizado',
        importacaoId: 'ativo-' + previa.periodo, importacaoTitulo: 'Ativo imobilizado - ' + previa.periodo,
        criadoAutomaticoEm: agora, aprovadoPorEmail: req.user.email, ordem: indice + 1
      });
    });
    const contas = await carregarContasContabeisEmpresa(chk.empresa);
    const validacao = RelatoriosContabeis.validar(state.entries, previa.periodo, contas);
    if (!validacao.ok) throw erroSessao(validacao.erros[0].mensagem, 409, 'LANCAMENTOS_ATIVO_INVALIDOS');
    const resumo = { ...(sessao.dados && sessao.dados.resumo || {}), total_lancamentos: state.entries.length };
    const resultado = await gravarSessaoBloqueada(sessaoRef, JSON.stringify(state), resumo, req.user, { exigirRevisao: true });
    tokenTrava = null;
    const batch = db.batch();
    previa.lancamentos.forEach(function (lancamento) {
      const id = cryptoAdmin.createHash('sha256').update(lancamento.chave).digest('hex');
      batch.create(empresaRef.collection('ativos_lancamentos').doc(id), { ...lancamento, periodo: previa.periodo, aprovado_em: new Date(), aprovado_por_uid: req.user.uid, aprovado_por_email: req.user.email, session_revision: resultado.revisao });
    });
    const mutacao = { ...(previa.mutacao_bem || {}), atualizado_em: new Date(), atualizado_por_uid: req.user.uid, atualizado_por_email: req.user.email };
    if (tipo === 'aquisicao') mutacao.aquisicao_contabilizada_em = new Date();
    if (tipo === 'baixa') { mutacao.baixa_em = new Date(); mutacao.baixa_por_uid = req.user.uid; mutacao.baixa_por_email = req.user.email; }
    batch.set(empresaRef.collection('ativos_imobilizados').doc(bemId), mutacao, { merge: true });
    batch.create(empresaRef.collection('auditoria_contabil').doc(), { tipo: 'ATIVO_' + tipo.toUpperCase() + '_APROVADO', periodo: previa.periodo, bem_id: bemId, quantidade: previa.lancamentos.length, total: previa.total, quando: new Date(), por_uid: req.user.uid, por_email: req.user.email });
    await batch.commit();
    res.status(201).json({ ok: true, tipo, periodo: previa.periodo, quantidade: previa.lancamentos.length, total: previa.total, session_revision: resultado.revisao });
  } catch (e) {
    if (sessaoRef && tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_APROVAR_EVENTO_ATIVO' });
  }
});

app.post('/api/empresas/:cnpj/ativos-imobilizados/depreciacao/previa', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const periodo = String(req.body && req.body.periodo || '').trim();
    if (!RelatoriosContabeis.periodoValido(periodo)) return res.status(400).json({ erro: 'Competência inválida.' });
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const empresaRef = db.collection('empresas').doc(cnpj);
    const [bensSnap, geradosSnap, periodoDoc, sessao] = await Promise.all([
      empresaRef.collection('ativos_imobilizados').get(),
      empresaRef.collection('ativos_lancamentos').where('periodo', '==', periodo).get(),
      empresaRef.collection('periodos_contabeis').doc(periodo).get(),
      carregarSessaoAtualPorRef(empresaRef.collection('sessoes').doc('current'))
    ]);
    if (periodoDoc.exists && String((periodoDoc.data() || {}).status) === 'fechado') return res.status(409).json({ erro: 'Reabra a competência antes de gerar lançamentos do ativo.', codigo: 'PERIODO_CONTABIL_FECHADO' });
    const bens = bensSnap.docs.map(function (doc) { return { id: doc.id, ...(doc.data() || {}) }; });
    const chavesSessao = sessao.encontrada && sessao.stateJson ? parsearStateJson(sessao.stateJson).entries.map(function (item) { return String(item.chave || ''); }).filter(Boolean) : [];
    const jaGerados = geradosSnap.docs.map(function (doc) { return String((doc.data() || {}).chave || doc.id); }).concat(chavesSessao);
    const previa = AtivoImobilizadoContabil.previaDepreciacao(bens, periodo, jaGerados);
    res.json({ ...previa, hash_previa: hashSessao(JSON.stringify(previa.lancamentos)) });
  } catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
});

app.post('/api/empresas/:cnpj/ativos-imobilizados/depreciacao/aprovar', async (req, res) => {
  let sessaoRef = null;
  let tokenTrava = null;
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const periodo = String(req.body && req.body.periodo || '').trim();
    const hashPrevia = String(req.body && req.body.hash_previa || '');
    if (!RelatoriosContabeis.periodoValido(periodo)) return res.status(400).json({ erro: 'Competência inválida.' });
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const empresaRef = db.collection('empresas').doc(cnpj);
    const periodoDoc = await empresaRef.collection('periodos_contabeis').doc(periodo).get();
    if (periodoDoc.exists && String((periodoDoc.data() || {}).status) === 'fechado') return res.status(409).json({ erro: 'Reabra a competência antes de gerar lançamentos do ativo.', codigo: 'PERIODO_CONTABIL_FECHADO' });
    sessaoRef = empresaRef.collection('sessoes').doc('current');
    tokenTrava = await adquirirTravaSessao(sessaoRef, req.user, 'ativo_imobilizado');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) throw erroSessao('Sessão contábil não encontrada.', 409, 'SESSAO_NAO_ENCONTRADA');
    const [bensSnap, geradosSnap] = await Promise.all([
      empresaRef.collection('ativos_imobilizados').get(),
      empresaRef.collection('ativos_lancamentos').where('periodo', '==', periodo).get()
    ]);
    const chavesSessao = parsearStateJson(sessao.stateJson).entries.map(function (item) { return String(item.chave || ''); }).filter(Boolean);
    const previa = AtivoImobilizadoContabil.previaDepreciacao(
      bensSnap.docs.map(function (doc) { return { id: doc.id, ...(doc.data() || {}) }; }),
      periodo,
      geradosSnap.docs.map(function (doc) { return String((doc.data() || {}).chave || doc.id); }).concat(chavesSessao)
    );
    if (!previa.ok) throw erroSessao(previa.erros[0] || 'Nenhuma depreciação pendente nesta competência.', 409, 'ATIVO_SEM_LANCAMENTOS');
    const hashAtual = hashSessao(JSON.stringify(previa.lancamentos));
    if (!hashPrevia || hashAtual !== hashPrevia) throw erroSessao('A prévia mudou. Revise os valores antes de aprovar.', 409, 'PREVIA_DESATUALIZADA');
    const state = parsearStateJson(sessao.stateJson);
    const agora = new Date().toISOString();
    previa.lancamentos.forEach(function (lancamento, indice) {
      state.entries.push({
        ...lancamento,
        id: 'ativo-' + periodo.replace('-', '') + '-' + cryptoAdmin.createHash('sha1').update(lancamento.chave).digest('hex').slice(0, 12),
        codigoHistorico: '', historicoPadraoDescricao: '', incomum: false,
        empresa: chk.empresa.razao_social || '', cnpj,
        categoria: 'Ativo imobilizado', importacaoId: 'ativo-' + periodo,
        importacaoTitulo: 'Ativo imobilizado - ' + periodo,
        criadoAutomaticoEm: agora, aprovadoPorEmail: req.user.email, ordem: indice + 1
      });
    });
    const contas = await carregarContasContabeisEmpresa(chk.empresa);
    const validacao = RelatoriosContabeis.validar(state.entries, periodo, contas);
    if (!validacao.ok) throw erroSessao(validacao.erros[0].mensagem, 409, 'LANCAMENTOS_ATIVO_INVALIDOS');
    const resumo = { ...(sessao.dados && sessao.dados.resumo || {}), total_lancamentos: state.entries.length };
    const resultado = await gravarSessaoBloqueada(sessaoRef, JSON.stringify(state), resumo, req.user, { exigirRevisao: true });
    tokenTrava = null;
    const batch = db.batch();
    previa.lancamentos.forEach(function (lancamento) {
      const id = cryptoAdmin.createHash('sha256').update(lancamento.chave).digest('hex');
      batch.create(empresaRef.collection('ativos_lancamentos').doc(id), { ...lancamento, periodo, chave: lancamento.chave, aprovado_em: new Date(), aprovado_por_uid: req.user.uid, aprovado_por_email: req.user.email, session_revision: resultado.revisao });
    });
    await batch.commit();
    await empresaRef.collection('auditoria_contabil').add({ tipo: 'DEPRECIACAO_APROVADA', periodo, quantidade: previa.lancamentos.length, total: previa.total, quando: new Date(), por_uid: req.user.uid, por_email: req.user.email });
    res.status(201).json({ ok: true, periodo, quantidade: previa.lancamentos.length, total: previa.total, session_revision: resultado.revisao });
  } catch (e) {
    if (sessaoRef && tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_APROVAR_DEPRECIACAO' });
  }
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

// ==================== NUCLEO CONTABIL / FECHAMENTOS ====================
app.get('/api/empresas/:cnpj/contabilidade/periodos', async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const [snap, transportesSnap, conciliacoesSnap] = await Promise.all([
      empresaRef.collection('periodos_contabeis').get(),
      empresaRef.collection('transportes_saldos').get(),
      empresaRef.collection('conciliacoes_bancarias').get()
    ]);
    const periodos = snap.docs.map(function (doc) {
      const dados = doc.data() || {};
      return {
        periodo: doc.id,
        status: dados.status || 'aberto',
        fechamento_id: dados.fechamento_id || null,
        hash: dados.hash || null,
        resumo: dados.resumo || null,
        fechado_em: serializarDataSegura(dados.fechado_em),
        fechado_por_email: dados.fechado_por_email || null,
        reaberto_em: serializarDataSegura(dados.reaberto_em),
        reaberto_por_email: dados.reaberto_por_email || null,
        motivo_reabertura: dados.motivo_reabertura || null
      };
    }).sort(function (a, b) { return b.periodo.localeCompare(a.periodo); });
    res.json({
      periodos,
      transportes: transportesSnap.docs.map(function (doc) { const d = doc.data() || {}; return { id: doc.id, ...d, gerado_em: serializarDataSegura(d.gerado_em) }; }),
      conciliacoes: conciliacoesSnap.docs.map(function (doc) { const d = doc.data() || {}; return { id: doc.id, ...d, aprovado_em: serializarDataSegura(d.aprovado_em) }; }),
      is_admin: !!req.user.is_admin,
      implantacao: {
        modo_contabil: chk.empresa.modo_contabil || 'ponte_sage',
        inicio_escrituracao_cci: chk.empresa.inicio_escrituracao_cci || '',
        regime_tributario_codigo: chk.empresa.regime_tributario_codigo || '',
        regime_tributario_nome: chk.empresa.regime_tributario_nome || '',
        regime_tributario_origem: chk.empresa.regime_tributario_origem || '',
        parametrizacao_tributaria: avaliarParametrizacaoRegime(chk.empresa),
        saldo_abertura_status: chk.empresa.saldo_abertura_status || '',
        saldo_abertura_periodo: chk.empresa.saldo_abertura_periodo || '',
        saldo_abertura_aprovado_em: serializarDataSegura(chk.empresa.saldo_abertura_aprovado_em),
        saldo_abertura_aprovado_por_email: chk.empresa.saldo_abertura_aprovado_por_email || null,
      }
    });
  } catch (e) {
    console.error('listar periodos contabeis erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_LISTAR_PERIODOS' });
  }
});

app.get('/api/empresas/:cnpj/contabilidade/homologacao-piloto', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const empresaRef = db.collection('empresas').doc(cnpj);
    const [periodosSnap, transportesSnap, conciliacoesSnap, ativosSnap, ativosLancamentosSnap] = await Promise.all([
      empresaRef.collection('periodos_contabeis').get(),
      empresaRef.collection('transportes_saldos').get(),
      empresaRef.collection('conciliacoes_bancarias').get(),
      empresaRef.collection('ativos_imobilizados').get(),
      empresaRef.collection('ativos_lancamentos').get()
    ]);
    const dados = function (snap) { return snap.docs.map(function (doc) { return { id: doc.id, ...(doc.data() || {}) }; }); };
    res.json(HomologacaoPiloto.avaliarHomologacaoPiloto({
      empresa: chk.empresa,
      periodos: dados(periodosSnap),
      transportes: dados(transportesSnap),
      conciliacoes: dados(conciliacoesSnap),
      ativos: dados(ativosSnap),
      ativos_lancamentos: dados(ativosLancamentosSnap),
      meta_fechamentos: 2
    }));
  } catch (e) {
    console.error('homologacao piloto erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_HOMOLOGACAO_PILOTO' });
  }
});

async function saldosIniciaisContabeis(empresaRef, estado, periodo) {
  const explicitos = estado.relatoriosContabeis && estado.relatoriosContabeis.saldosIniciais
    ? estado.relatoriosContabeis.saldosIniciais[periodo] || null
    : null;
  if (explicitos && Object.keys(explicitos).length) return { saldos: explicitos, origem: 'informado' };
  const transporte = await empresaRef.collection('transportes_saldos').doc(periodo).get();
  if (transporte.exists && String((transporte.data() || {}).status || 'vigente') === 'vigente') {
    return { saldos: (transporte.data() || {}).saldos || {}, origem: 'transporte', transporte: transporte.data() || {} };
  }
  return { saldos: {}, origem: 'ausente' };
}

async function avaliarConciliacaoDetalhadaDaRequisicao(cnpj, entrada, usuario) {
  const periodo = String(entrada && entrada.periodo || '').trim();
  const conta = String(entrada && entrada.conta || '').trim();
  const chk = await checarAcessoEmpresa(cnpj, usuario);
  if (!chk.ok) {
    const erro = new Error(chk.erro);
    erro.status = chk.status;
    throw erro;
  }
  if (!RelatoriosContabeis.periodoValido(periodo) || !conta) {
    const erro = new Error('Informe competência e conta bancária.');
    erro.status = 400;
    throw erro;
  }
  const empresaRef = db.collection('empresas').doc(cnpj);
  const sessao = await carregarSessaoAtualPorRef(empresaRef.collection('sessoes').doc('current'));
  if (!sessao.encontrada || !sessao.stateJson) {
    const erro = new Error('Sessão contábil não encontrada.');
    erro.status = 409;
    throw erro;
  }
  const estado = lerEstadoContabil(sessao.stateJson);
  const avaliacao = ConciliacaoDetalhada.avaliar({
    periodo,
    conta,
    tolerancia_dias: entrada.tolerancia_dias,
    movimentos_extrato: entrada.movimentos_extrato,
    lancamentos: estado.entries
  });
  return { avaliacao, empresaRef, sessao };
}

app.post('/api/empresas/:cnpj/contabilidade/conciliacoes/movimentos/avaliar', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido.' });
    const resultado = await avaliarConciliacaoDetalhadaDaRequisicao(cnpj, req.body || {}, req.user);
    if (resultado.avaliacao.status === 'invalida') return res.status(400).json(resultado.avaliacao);
    res.json(resultado.avaliacao);
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message, codigo: 'ERRO_AVALIAR_CONCILIACAO_DETALHADA' });
  }
});

app.post('/api/empresas/:cnpj/contabilidade/conciliacoes/movimentos/aprovar', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido.' });
    const resultado = await avaliarConciliacaoDetalhadaDaRequisicao(cnpj, req.body || {}, req.user);
    const avaliacao = resultado.avaliacao;
    if (avaliacao.status === 'invalida') return res.status(400).json(avaliacao);
    if (!req.body.hash_previa || req.body.hash_previa !== avaliacao.hash_previa) {
      return res.status(409).json({ erro: 'Os lançamentos ou dados do extrato mudaram. Gere uma nova prévia antes de aprovar.', codigo: 'CONCILIACAO_DETALHADA_PREVIA_DESATUALIZADA', avaliacao });
    }
    if (!avaliacao.ok) {
      return res.status(409).json({ erro: 'A conferência detalhada ainda possui movimentos pendentes.', codigo: 'CONCILIACAO_DETALHADA_PENDENTE', avaliacao });
    }
    const chave = ConciliacaoContabil.chave(avaliacao.periodo, avaliacao.conta);
    const conciliacaoRef = resultado.empresaRef.collection('conciliacoes_detalhadas').doc(chave);
    const auditoriaRef = resultado.empresaRef.collection('auditoria_contabil').doc();
    const aprovadoEm = new Date();
    const documento = {
      schema: 'conciliacao_detalhada_v1',
      periodo: avaliacao.periodo,
      conta: avaliacao.conta,
      status: 'conciliada',
      tolerancia_dias: avaliacao.tolerancia_dias,
      hash_previa: avaliacao.hash_previa,
      session_revision: resultado.sessao.dados && resultado.sessao.dados.session_revision || null,
      resumo: avaliacao.resumo,
      correspondencias: avaliacao.correspondencias.map(function (item) {
        return {
          tipo: item.tipo,
          extrato_ids: (item.extrato || []).map(function (movimento) { return movimento.id; }),
          contabil_ids: (item.contabil || []).map(function (movimento) { return movimento.id; }),
          valor: item.valor,
          confianca: item.confianca,
          explicacao: item.explicacao
        };
      }),
      aprovado_em: aprovadoEm,
      aprovado_por_uid: req.user.uid,
      aprovado_por_email: req.user.email
    };
    const batch = db.batch();
    batch.set(conciliacaoRef, documento);
    batch.create(auditoriaRef, {
      tipo: 'CONCILIACAO_DETALHADA_APROVADA',
      periodo: avaliacao.periodo,
      conta: avaliacao.conta,
      hash_previa: avaliacao.hash_previa,
      resumo: avaliacao.resumo,
      quando: aprovadoEm,
      por_uid: req.user.uid,
      por_email: req.user.email
    });
    await batch.commit();
    res.status(201).json({ ok: true, id: chave, periodo: avaliacao.periodo, conta: avaliacao.conta, hash_previa: avaliacao.hash_previa, resumo: avaliacao.resumo });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_APROVAR_CONCILIACAO_DETALHADA' });
  }
});

app.post('/api/empresas/:cnpj/contabilidade/conciliacoes/avaliar', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const periodo = String(req.body && req.body.periodo || '').trim();
    const conta = String(req.body && req.body.conta || '').trim();
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    if (!RelatoriosContabeis.periodoValido(periodo) || !conta) return res.status(400).json({ erro: 'Informe competência e conta bancária.' });
    const empresaRef = db.collection('empresas').doc(cnpj);
    const sessao = await carregarSessaoAtualPorRef(empresaRef.collection('sessoes').doc('current'));
    if (!sessao.encontrada || !sessao.stateJson) return res.status(409).json({ erro: 'Sessão contábil não encontrada.' });
    const estado = lerEstadoContabil(sessao.stateJson);
    const contas = await carregarContasContabeisEmpresa(chk.empresa);
    const abertura = await saldosIniciaisContabeis(empresaRef, estado, periodo);
    const linha = RelatoriosContabeis.balancete(estado.entries, periodo, contas, abertura.saldos).find(function (item) {
      return String(item.conta) === conta || String(item.reduzido).replace(/^0+/, '') === conta.replace(/^0+/, '') || String(item.codigoCompleto) === conta;
    });
    const avaliacao = ConciliacaoContabil.avaliar({ periodo, conta, saldo_contabil: linha ? linha.saldoAtual : 0, saldo_extrato: req.body.saldo_extrato });
    res.json({ ...avaliacao, origem_saldo_inicial: abertura.origem, movimentos: linha ? { saldo_anterior: linha.saldoAnterior, debitos: linha.debitos, creditos: linha.creditos } : { saldo_anterior: 0, debitos: 0, creditos: 0 } });
  } catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
});

app.post('/api/empresas/:cnpj/contabilidade/conciliacoes/aprovar', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const chk = await checarAcessoEmpresa(cnpj, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const periodo = String(req.body && req.body.periodo || '').trim();
    const conta = String(req.body && req.body.conta || '').trim();
    const empresaRef = db.collection('empresas').doc(cnpj);
    const sessao = await carregarSessaoAtualPorRef(empresaRef.collection('sessoes').doc('current'));
    if (!sessao.encontrada || !sessao.stateJson) return res.status(409).json({ erro: 'Sessão contábil não encontrada.' });
    const estado = lerEstadoContabil(sessao.stateJson);
    const contas = await carregarContasContabeisEmpresa(chk.empresa);
    const abertura = await saldosIniciaisContabeis(empresaRef, estado, periodo);
    const linha = RelatoriosContabeis.balancete(estado.entries, periodo, contas, abertura.saldos).find(function (item) { return String(item.conta) === conta || String(item.reduzido).replace(/^0+/, '') === conta.replace(/^0+/, '') || String(item.codigoCompleto) === conta; });
    const avaliacao = ConciliacaoContabil.avaliar({ periodo, conta, saldo_contabil: linha ? linha.saldoAtual : 0, saldo_extrato: req.body.saldo_extrato });
    if (!avaliacao.ok) return res.status(409).json({ erro: 'A conciliação possui diferença de R$ ' + Math.abs(avaliacao.diferenca).toFixed(2) + '.', codigo: 'CONCILIACAO_COM_DIFERENCA', avaliacao });
    const chave = ConciliacaoContabil.chave(periodo, conta);
    await empresaRef.collection('conciliacoes_bancarias').doc(chave).set({
      ...avaliacao, movimentos: linha ? { saldo_anterior: linha.saldoAnterior, debitos: linha.debitos, creditos: linha.creditos } : null,
      origem_saldo_inicial: abertura.origem, hash_periodo: assinaturaEstadoPeriodo(estado, periodo), status: 'conciliada',
      aprovado_em: new Date(), aprovado_por_uid: req.user.uid, aprovado_por_email: req.user.email
    });
    await empresaRef.set({ contas_bancarias_conciliacao: FieldValue.arrayUnion(conta) }, { merge: true });
    await empresaRef.collection('auditoria_contabil').add({ tipo: 'CONCILIACAO_BANCARIA_APROVADA', periodo, conta, quando: new Date(), por_uid: req.user.uid, por_email: req.user.email });
    res.json({ ok: true, id: chave, ...avaliacao });
  } catch (e) { res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_CONCILIACAO' }); }
});

app.post('/api/empresas/:cnpj/contabilidade/saldos-abertura/aprovar', async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const periodo = String(req.body && req.body.periodo || '').trim();
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    if (!RelatoriosContabeis.periodoValido(periodo)) return res.status(400).json({ erro: 'Competencia invalida. Use AAAA-MM.' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    if (chk.empresa.modo_contabil !== 'cci_exclusivo') {
      return res.status(409).json({ erro: 'A aprovacao da abertura e obrigatoria somente para empresas no modo CCI exclusivo.', codigo: 'MODO_CONTABIL_NAO_EXCLUSIVO' });
    }
    const periodoInicial = periodoInicialEmpresa(chk.empresa);
    if (!periodoInicial) return res.status(409).json({ erro: 'Configure a data de inicio da escrituracao no CCI.', codigo: 'INICIO_ESCRITURACAO_AUSENTE' });
    if (periodo !== periodoInicial) {
      return res.status(409).json({ erro: 'A abertura deve ser aprovada na competencia inicial ' + periodoInicial + '.', codigo: 'PERIODO_ABERTURA_INCORRETO' });
    }
    const sessaoRef = db.collection('empresas').doc(cnpjLimpo).collection('sessoes').doc('current');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) return res.status(409).json({ erro: 'Salve os saldos iniciais antes de solicitar a aprovacao.', codigo: 'SESSAO_NAO_ENCONTRADA' });
    const estado = lerEstadoContabil(sessao.stateJson);
    const saldos = (estado.relatoriosContabeis.saldosIniciais || {})[periodo] || {};
    const contas = await carregarContasContabeisEmpresa(chk.empresa);
    const validacao = validarSaldosAbertura(saldos, contas);
    if (!validacao.ok) {
      return res.status(409).json({ erro: validacao.erros.map(function (item) { return item.mensagem; }).join(' '), codigo: 'SALDOS_ABERTURA_INVALIDOS', validacao });
    }
    const hash = hashSaldosAbertura(saldos);
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    await empresaRef.set({
      saldo_abertura_status: 'aprovado',
      saldo_abertura_periodo: periodo,
      saldo_abertura_hash: hash,
      saldo_abertura_resumo: validacao,
      saldo_abertura_aprovado_em: new Date(),
      saldo_abertura_aprovado_por_uid: req.user.uid,
      saldo_abertura_aprovado_por_email: req.user.email,
    }, { merge: true });
    await empresaRef.collection('auditoria_contabil').add({
      tipo: 'SALDOS_ABERTURA_APROVADOS',
      periodo,
      hash,
      resumo: validacao,
      quando: new Date(),
      por_uid: req.user.uid,
      por_email: req.user.email,
    });
    res.json({ ok: true, periodo, hash, validacao });
  } catch (e) {
    console.error('aprovar saldos abertura erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_APROVAR_SALDOS_ABERTURA' });
  }
});

app.post('/api/empresas/:cnpj/contabilidade/relatorios/enviar-email', async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });

    const entrada = req.body || {};
    const destinatario = String(entrada.email || '').trim().toLowerCase();
    const periodo = String(entrada.periodo || '').trim();
    const tipo = String(entrada.tipo || '').trim().toLowerCase();
    const tiposPermitidos = { balancete: 'Balancete', balancete_anual: 'Balancete Anual Analítico', razao: 'Razão Analítico', diario: 'Livro Diário', dre: 'Demonstração do Resultado do Exercício', balanco: 'Balanço Patrimonial', analise: 'Análise Econômico-Financeira' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) return res.status(400).json({ erro: 'E-mail do destinatário inválido.' });
    if (!tiposPermitidos[tipo]) return res.status(400).json({ erro: 'Tipo de relatório inválido.' });
    const periodoValido = tipo === 'balancete_anual' ? /^\d{4}$/.test(periodo) : RelatoriosContabeis.periodoValido(periodo);
    if (!periodoValido) return res.status(400).json({ erro: tipo === 'balancete_anual' ? 'Ano inválido. Use AAAA.' : 'Competência inválida. Use AAAA-MM.' });

    const base64Limpo = String(entrada.pdf_base64 || '')
      .replace(/^data:application\/pdf;base64,/i, '')
      .replace(/\s/g, '');
    if (!base64Limpo || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Limpo)) return res.status(400).json({ erro: 'PDF inválido ou ausente.' });
    const pdfBuffer = Buffer.from(base64Limpo, 'base64');
    if (!pdfBuffer.length || pdfBuffer.length > 4 * 1024 * 1024) return res.status(413).json({ erro: 'O PDF deve ter no máximo 4 MB.' });
    if (pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') return res.status(400).json({ erro: 'O arquivo enviado não é um PDF válido.' });

    const nomeEmpresa = String(chk.empresa.razao_social || chk.empresa.empresa || chk.empresa.nome || 'Empresa').trim();
    const assunto = String(entrada.assunto || `${tiposPermitidos[tipo]} — ${nomeEmpresa} — ${periodo}`).trim().slice(0, 180);
    const mensagem = String(entrada.mensagem || 'Segue, em anexo, o relatório contábil solicitado.').trim().slice(0, 3000);
    const escapar = (valor) => String(valor || '').replace(/[&<>"']/g, (caractere) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere]);
    const html = `
      <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,sans-serif;color:#14213d">
        <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe4f0">
          <div style="padding:24px 28px;background:linear-gradient(135deg,#07152f,#2454d7);color:#fff">
            <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#bcd3ff">Departamento Contábil</div>
            <h1 style="margin:8px 0 0;font-size:24px">${escapar(tiposPermitidos[tipo])}</h1>
          </div>
          <div style="padding:28px">
            <p style="margin:0 0 16px;line-height:1.6">${escapar(mensagem).replace(/\n/g, '<br>')}</p>
            <table style="width:100%;border-collapse:collapse;background:#f7f9fc;border-radius:8px">
              <tr><td style="padding:10px 12px;color:#667085">Empresa</td><td style="padding:10px 12px;font-weight:700">${escapar(nomeEmpresa)}</td></tr>
              <tr><td style="padding:10px 12px;color:#667085">CNPJ</td><td style="padding:10px 12px;font-weight:700">${escapar(cnpjLimpo)}</td></tr>
              <tr><td style="padding:10px 12px;color:#667085">Competência</td><td style="padding:10px 12px;font-weight:700">${escapar(periodo)}</td></tr>
            </table>
            <p style="margin:20px 0 0;color:#667085;font-size:13px">O relatório contábil está anexado em formato PDF.</p>
          </div>
          <div style="padding:16px 28px;background:#07152f;color:#bcd3ff;font-size:12px;text-align:center">Desenvolvido by SP Assessoria Contábil. Todos os direitos reservados.</div>
        </div>
      </div>`;

    const remetente = process.env.GRAPH_REMETENTE || process.env.NOTIF_REMETENTE_EMAIL;
    if (!GraphEmail.configurado() || !remetente) return res.status(503).json({ erro: 'Envio de e-mail temporariamente indisponível.' });
    const nomeArquivo = String(entrada.nome_arquivo || `CCI_${tipo}_${periodo}_${cnpjLimpo}.pdf`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150);
    const envio = await GraphEmail.enviarEmail({
      remetente,
      para: destinatario,
      assunto,
      html,
      anexos: [{ name: nomeArquivo, contentType: 'application/pdf', contentBytes: base64Limpo }]
    });
    if (!envio.ok) return res.status(502).json({ erro: envio.error || 'Não foi possível enviar o e-mail.' });

    try {
      await db.collection('empresas').doc(cnpjLimpo).collection('relatorios_contabeis_envios').add({
        canal: 'email',
        departamento: 'contabil',
        destinatario,
        assunto,
        tipo,
        periodo,
        nome_arquivo: nomeArquivo,
        tamanho_bytes: pdfBuffer.length,
        enviado_em: new Date(),
        enviado_por_uid: req.user.uid,
        enviado_por_email: req.user.email
      });
    } catch (erroAuditoria) {
      console.error('auditoria do envio de relatorio contabil falhou:', erroAuditoria);
    }
    res.json({ ok: true, destinatario, tipo, periodo });
  } catch (e) {
    console.error('enviar relatorio contabil por email erro:', e);
    res.status(500).json({ erro: e.message || 'Falha ao enviar relatório por e-mail.' });
  }
});

app.post('/api/empresas/:cnpj/contabilidade/fechar', async (req, res) => {
  let sessaoRef = null;
  let tokenTrava = null;
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const periodo = String(req.body && req.body.periodo || '').trim();
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    if (!RelatoriosContabeis.periodoValido(periodo)) return res.status(400).json({ erro: 'Competencia invalida. Use AAAA-MM.' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const parametrizacaoTributaria = avaliarParametrizacaoRegime(chk.empresa);
    if (chk.empresa.modo_contabil === 'cci_exclusivo' && !parametrizacaoTributaria.ok) {
      return res.status(409).json({
        erro: 'Conclua a parametrização de ' + parametrizacaoTributaria.regime_nome + ' antes de encerrar o período. ' + (parametrizacaoTributaria.pendencias[0] ? parametrizacaoTributaria.pendencias[0].mensagem : ''),
        codigo: 'PARAMETRIZACAO_TRIBUTARIA_PENDENTE',
        pendencias: parametrizacaoTributaria.pendencias
      });
    }
    if (exigeSaldoAbertura(chk.empresa, periodo)) {
      const inicial = periodoInicialEmpresa(chk.empresa);
      if (chk.empresa.saldo_abertura_status !== 'aprovado' || chk.empresa.saldo_abertura_periodo !== inicial) {
        return res.status(409).json({
          erro: 'Cadastre e aprove os saldos de abertura de ' + (inicial || 'competencia inicial') + ' antes de encerrar o periodo.',
          codigo: 'SALDOS_ABERTURA_PENDENTES'
        });
      }
    }
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const periodoRef = empresaRef.collection('periodos_contabeis').doc(periodo);
    const periodoAtual = await periodoRef.get();
    if (periodoAtual.exists && String((periodoAtual.data() || {}).status) === 'fechado') {
      return res.status(409).json({ erro: 'Esta competência já está encerrada.', codigo: 'PERIODO_CONTABIL_FECHADO' });
    }
    sessaoRef = empresaRef.collection('sessoes').doc('current');
    tokenTrava = await adquirirTravaSessao(sessaoRef, req.user, 'fechamento_contabil');
    const sessao = await carregarSessaoAtualPorRef(sessaoRef);
    if (!sessao.encontrada || !sessao.stateJson) throw erroSessao('Nenhuma sessão contábil encontrada para a empresa.', 409, 'SESSAO_NAO_ENCONTRADA');
    const estado = lerEstadoContabil(sessao.stateJson);
    const contas = await carregarContasContabeisEmpresa(chk.empresa);
    const aberturaContabil = await saldosIniciaisContabeis(empresaRef, estado, periodo);
    const saldosIniciais = aberturaContabil.saldos;
    const validacao = RelatoriosContabeis.validar(estado.entries, periodo, contas);
    if (!validacao.quantidade) throw erroSessao('Não há lançamentos contábeis nesta competência.', 409, 'SEM_MOVIMENTO_CONTABIL');
    if (!validacao.ok) throw erroSessao('O período possui inconsistências e não pode ser encerrado.', 409, 'VALIDACAO_CONTABIL_FALHOU');
    const contasBancarias = Array.isArray(chk.empresa.contas_bancarias_conciliacao) ? chk.empresa.contas_bancarias_conciliacao.map(String).filter(Boolean) : [];
    if (contasBancarias.length) {
      const conciliacoesSnap = await empresaRef.collection('conciliacoes_bancarias').where('periodo', '==', periodo).get();
      const conciliadas = new Map(conciliacoesSnap.docs.map(function (doc) { const d = doc.data() || {}; return [String(d.conta), d]; }));
      const hashAtualPeriodo = assinaturaEstadoPeriodo(estado, periodo);
      const pendentes = contasBancarias.filter(function (conta) {
        const registro = conciliadas.get(conta);
        return !registro || registro.status !== 'conciliada' || registro.hash_periodo !== hashAtualPeriodo;
      });
      if (pendentes.length) throw erroSessao('Concilie novamente as contas bancárias antes do fechamento: ' + pendentes.join(', ') + '.', 409, 'CONCILIACAO_BANCARIA_PENDENTE');
    }
    const fotografia = RelatoriosContabeis.snapshot({
      periodo,
      lancamentos: estado.entries,
      contas,
      saldosIniciais,
      empresa: { cnpj: cnpjLimpo, razao_social: chk.empresa.razao_social || '', codigo_empresa: codigoEmpresaDe(chk.empresa), plano_id: chk.empresa.plano_id || null }
    });
    const fotografiaSemHash = { ...fotografia };
    delete fotografiaSemHash.hash;
    fotografia.hash = hashSessao(JSON.stringify(fotografiaSemHash));
    const proximo = proximoPeriodo(periodo);
    const saldosTransportados = saldosParaTransporte(fotografia.balancete);
    const transporteRef = empresaRef.collection('transportes_saldos').doc(proximo);
    const transporteAtual = await transporteRef.get();
    if (transporteAtual.exists && String((transporteAtual.data() || {}).status || 'vigente') === 'vigente' && String((transporteAtual.data() || {}).origem_hash || '') !== fotografia.hash) {
      throw erroSessao('Já existe um transporte diferente para ' + proximo + '. Reabra a sequência contábil antes de substituir.', 409, 'TRANSPORTE_SALDOS_CONFLITANTE');
    }
    const fechamentoRef = empresaRef.collection('fechamentos_contabeis').doc();
    await gravarDocumentoJson(fechamentoRef, JSON.stringify(fotografia), {
      periodo,
      hash: fotografia.hash,
      schema: fotografia.schema,
      resumo: validacao,
      session_revision: sessao.dados && sessao.dados.session_revision || null,
      fechado_em: new Date(),
      fechado_por_uid: req.user.uid,
      fechado_por_email: req.user.email
    });
    const fechamentoBatch = db.batch();
    fechamentoBatch.set(periodoRef, {
      status: 'fechado',
      fechamento_id: fechamentoRef.id,
      hash: fotografia.hash,
      resumo: validacao,
      fechado_em: new Date(),
      fechado_por_uid: req.user.uid,
      fechado_por_email: req.user.email,
      reaberto_em: FieldValue.delete(),
      reaberto_por_uid: FieldValue.delete(),
      reaberto_por_email: FieldValue.delete(),
      motivo_reabertura: FieldValue.delete()
    }, { merge: true });
    fechamentoBatch.set(transporteRef, {
      status: 'vigente', periodo_origem: periodo, periodo_destino: proximo,
      origem_fechamento_id: fechamentoRef.id, origem_hash: fotografia.hash,
      saldos: saldosTransportados, quantidade_contas: Object.keys(saldosTransportados).length,
      gerado_em: new Date(), gerado_por_uid: req.user.uid, gerado_por_email: req.user.email
    });
    fechamentoBatch.create(db.collection('admin_audit_logs').doc(), montarEventoAuditoriaAdmin({
      evento: 'periodo_contabil_fechado',
      categoria: 'fechamento',
      acao: 'fechar_competencia',
      resultado: { status: 'sucesso', httpStatus: 201 },
      cnpj: cnpjLimpo,
      escopo: { recurso: 'periodos_contabeis', recursoId: periodo, periodo, loteId: fechamentoRef.id },
      detalhes: {
        hash: fotografia.hash,
        quantidade_lancamentos: validacao.quantidade,
        quantidade_contas_transportadas: Object.keys(saldosTransportados).length,
        periodo_destino: proximo,
      },
      user: req.user,
    }));
    await fechamentoBatch.commit();
    await empresaRef.collection('auditoria_contabil').add({ tipo: 'SALDOS_TRANSPORTADOS', periodo_origem: periodo, periodo_destino: proximo, origem_hash: fotografia.hash, quantidade_contas: Object.keys(saldosTransportados).length, quando: new Date(), por_uid: req.user.uid, por_email: req.user.email });
    await liberarTravaSessao(sessaoRef, tokenTrava);
    tokenTrava = null;
    res.status(201).json({ ok: true, periodo, status: 'fechado', fechamento_id: fechamentoRef.id, hash: fotografia.hash, resumo: validacao, transporte: { periodo: proximo, quantidade_contas: Object.keys(saldosTransportados).length } });
  } catch (e) {
    if (sessaoRef && tokenTrava) await liberarTravaSessao(sessaoRef, tokenTrava);
    console.error('fechar periodo contabil erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_FECHAR_PERIODO' });
  }
});

app.post('/api/empresas/:cnpj/contabilidade/reabrir', adminRequired, async (req, res) => {
  try {
    const cnpjLimpo = String(req.params.cnpj || '').replace(/\D/g, '');
    const periodo = String(req.body && req.body.periodo || '').trim();
    const motivo = String(req.body && req.body.motivo || '').trim();
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    if (!RelatoriosContabeis.periodoValido(periodo)) return res.status(400).json({ erro: 'Competencia invalida. Use AAAA-MM.' });
    if (motivo.length < 10) return res.status(400).json({ erro: 'Informe o motivo da reabertura com pelo menos 10 caracteres.' });
    const chk = await checarAcessoEmpresa(cnpjLimpo, req.user);
    if (!chk.ok) return res.status(chk.status).json({ erro: chk.erro });
    const periodoRef = db.collection('empresas').doc(cnpjLimpo).collection('periodos_contabeis').doc(periodo);
    const atual = await periodoRef.get();
    if (!atual.exists || String((atual.data() || {}).status) !== 'fechado') {
      return res.status(409).json({ erro: 'A competência não está encerrada.', codigo: 'PERIODO_NAO_FECHADO' });
    }
    const empresaRef = db.collection('empresas').doc(cnpjLimpo);
    const proximo = proximoPeriodo(periodo);
    const proximoDoc = await empresaRef.collection('periodos_contabeis').doc(proximo).get();
    if (proximoDoc.exists && String((proximoDoc.data() || {}).status) === 'fechado') {
      return res.status(409).json({ erro: 'Reabra primeiro a competência posterior ' + proximo + ' para preservar a cadeia de saldos.', codigo: 'PERIODO_POSTERIOR_FECHADO' });
    }
    const reaberturaBatch = db.batch();
    reaberturaBatch.set(periodoRef, {
      status: 'reaberto',
      reaberto_em: new Date(),
      reaberto_por_uid: req.user.uid,
      reaberto_por_email: req.user.email,
      motivo_reabertura: motivo
    }, { merge: true });
    reaberturaBatch.set(empresaRef.collection('transportes_saldos').doc(proximo), {
      status: 'invalidado', invalidado_em: new Date(), invalidado_por_uid: req.user.uid,
      invalidado_por_email: req.user.email, motivo_invalidacao: 'Reabertura da competência de origem ' + periodo
    }, { merge: true });
    reaberturaBatch.create(db.collection('admin_audit_logs').doc(), montarEventoAuditoriaAdmin({
      evento: 'periodo_contabil_reaberto',
      categoria: 'fechamento',
      acao: 'reabrir_competencia',
      resultado: { status: 'sucesso', httpStatus: 200 },
      cnpj: cnpjLimpo,
      escopo: { recurso: 'periodos_contabeis', recursoId: periodo, periodo },
      detalhes: { motivo, periodo_transporte_invalidado: proximo },
      user: req.user,
    }));
    await reaberturaBatch.commit();
    await periodoRef.collection('eventos').add({ tipo: 'reabertura', motivo, timestamp: new Date(), uid: req.user.uid, email: req.user.email });
    res.json({ ok: true, periodo, status: 'reaberto' });
  } catch (e) {
    console.error('reabrir periodo contabil erro:', e);
    res.status(e.status || 500).json({ erro: e.message, codigo: e.codigo || 'ERRO_REABRIR_PERIODO' });
  }
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
      last_name: req.user.name || req.user.email,
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

async function mapearComConcorrencia(itens, limite, tarefa) {
  const resultado = new Array(itens.length);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.min(Math.max(1, limite), itens.length) }, async function () {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultado[indice] = await tarefa(itens[indice], indice);
    }
  });
  await Promise.all(trabalhadores);
  return resultado;
}

async function avaliarProgressaoPersistida(empresa, competencia, agora, diasSemAtividade) {
  const empresaRef = db.collection('empresas').doc(empresa.cnpj);
  const contasBancarias = Array.isArray(empresa.contas_bancarias_conciliacao) ? empresa.contas_bancarias_conciliacao : [];
  const [sessao, periodoDoc, conciliacoesSnap, acompanhamentoDoc] = await Promise.all([
    carregarSessaoAtualPorRef(empresaRef.collection('sessoes').doc('current')),
    empresaRef.collection('periodos_contabeis').doc(competencia).get(),
    contasBancarias.length
      ? empresaRef.collection('conciliacoes_bancarias').where('periodo', '==', competencia).get()
      : Promise.resolve({ docs: [] }),
    empresaRef.collection('acompanhamento_contabil').doc(competencia).get()
  ]);
  const estado = sessao.encontrada && sessao.stateJson ? lerEstadoContabil(sessao.stateJson) : { entries: [] };
  const conciliacoes = conciliacoesSnap.docs.map(function (doc) { return { id: doc.id, ...(doc.data() || {}) }; });
  return avaliarProgressaoEmpresa({
    cnpj: empresa.cnpj,
    empresa: { ...empresa, codigo_empresa: codigoEmpresaDe(empresa), responsaveis: normalizarResponsaveis(empresa.responsaveis) },
    competencia,
    entries: estado.entries,
    periodo: periodoDoc.exists ? (periodoDoc.data() || {}) : {},
    acompanhamento: acompanhamentoDoc.exists ? (acompanhamentoDoc.data() || {}) : {},
    conciliacoes,
    hash_periodo: estado.entries.length ? assinaturaEstadoPeriodo(estado, competencia) : '',
    sessao_atualizada_em: sessao.dados && sessao.dados.updated_at,
    agora,
    dias_sem_atividade: diasSemAtividade
  });
}

// Caixa operacional do colaborador. A configuração de canais permanece no ADMIN;
// aqui cada responsável vê apenas as solicitações atribuídas a ele.
app.get('/api/minhas-pendencias-contabeis', async (req, res) => {
  try {
    const empresasSnap = await db.collection('empresas').get();
    const atribuidas = empresasSnap.docs.map(function (doc) {
      return { cnpj: doc.id, ...(doc.data() || {}) };
    }).filter(function (empresa) {
      return usuarioAtribuido({ ...empresa, responsaveis: normalizarResponsaveis(empresa.responsaveis) }, req.user);
    });
    const agora = new Date();
    const porEmpresa = await mapearComConcorrencia(atribuidas, 6, async function (empresa) {
      const acompanhamentoSnap = await db.collection('empresas').doc(empresa.cnpj).collection('acompanhamento_contabil').get();
      const abertos = acompanhamentoSnap.docs.filter(function (doc) {
        const dados = doc.data() || {};
        return String(dados.revisao_status || 'nao_solicitada') !== 'aprovada';
      });
      return await mapearComConcorrencia(abertos, 3, async function (doc) {
        const avaliacao = await avaliarProgressaoPersistida(empresa, doc.id, agora, 5);
        return {
          cnpj: avaliacao.cnpj,
          codigo_empresa: avaliacao.codigo_empresa,
          razao_social: avaliacao.razao_social,
          competencia: avaliacao.competencia,
          status: avaliacao.status,
          etapa: avaliacao.etapa,
          etapa_nome: avaliacao.etapa_nome,
          percentual: avaliacao.percentual,
          motivo: avaliacao.motivo_parada,
          proxima_acao: avaliacao.proxima_acao,
          prazo: avaliacao.acompanhamento.prazo,
          prioridade: avaliacao.acompanhamento.prioridade,
          impedimento: avaliacao.acompanhamento.impedimento,
          observacao: avaliacao.acompanhamento.observacao,
          revisao_status: avaliacao.acompanhamento.revisao_status,
          evidencia_titulo: avaliacao.acompanhamento.evidencia_titulo,
          evidencia_url: avaliacao.acompanhamento.evidencia_url,
          solicitado_em: avaliacao.acompanhamento.atualizado_em,
          solicitado_por_email: avaliacao.acompanhamento.atualizado_por_email,
          areas: avaliacao.areas.filter(function (area) { return area.esperada; }).map(function (area) {
            return { area: area.area, nome: area.nome, total: area.total, classificados: area.classificados, pendentes: area.pendentes, concluida: area.concluida };
          }),
          aviso_automatico: avaliacao.acompanhamento.alerta_ativo ? {
            ativo: true,
            dias: avaliacao.acompanhamento.alerta_dias,
            proximo_alerta_em: avaliacao.proximo_alerta_em,
            ultimo_alerta_em: avaliacao.acompanhamento.ultimo_alerta_em
          } : { ativo: false }
        };
      });
    });
    const pendencias = porEmpresa.flat().sort(function (a, b) {
      const prioridade = { critica: 0, alta: 1, normal: 2, baixa: 3 };
      return (prioridade[a.prioridade] ?? 9) - (prioridade[b.prioridade] ?? 9)
        || String(a.prazo || '9999-12-31').localeCompare(String(b.prazo || '9999-12-31'))
        || String(a.codigo_empresa || '999999').localeCompare(String(b.codigo_empresa || '999999'));
    });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, total: pendencias.length, pendencias });
  } catch (erro) {
    console.error('minhas pendencias contabeis erro:', erro);
    res.status(500).json({ erro: erro.message, codigo: 'ERRO_MINHAS_PENDENCIAS_CONTABEIS' });
  }
});

// Visão somente leitura: consolida contratos existentes sem criar um segundo fluxo contábil.
app.get('/api/admin/progressao-contabil', adminRequired, async (req, res) => {
  try {
    const competencia = String(req.query.competencia || '').trim() || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'
    }).format(new Date()).slice(0, 7);
    if (!RelatoriosContabeis.periodoValido(competencia)) return res.status(400).json({ erro: 'Competência inválida. Use AAAA-MM.' });
    const diasSemAtividade = Math.min(60, Math.max(1, Number(req.query.dias_sem_atividade) || 5));
    const busca = String(req.query.busca || '').trim().toLocaleLowerCase('pt-BR');
    const colaborador = String(req.query.colaborador || '').trim().toLowerCase();
    const empresasSnap = await db.collection('empresas').get();
    let empresas = empresasSnap.docs.map(function (doc) { return { cnpj: doc.id, ...(doc.data() || {}) }; });
    if (busca) {
      empresas = empresas.filter(function (empresa) {
        return [empresa.cnpj, codigoEmpresaDe(empresa), empresa.razao_social, empresa.nome].some(function (valor) {
          return String(valor || '').toLocaleLowerCase('pt-BR').includes(busca);
        });
      });
    }
    if (colaborador) {
      empresas = empresas.filter(function (empresa) {
        return normalizarResponsaveis(empresa.responsaveis).some(function (pessoa) {
          return String(pessoa.uid || '').toLowerCase() === colaborador || String(pessoa.email || '').toLowerCase() === colaborador;
        });
      });
    }
    const geradoEm = new Date();
    const progressao = await mapearComConcorrencia(empresas, 8, async function (empresa) {
      try {
        return await avaliarProgressaoPersistida(empresa, competencia, geradoEm, diasSemAtividade);
      } catch (erroEmpresa) {
        const avaliacao = avaliarProgressaoEmpresa({
          cnpj: empresa.cnpj,
          empresa: { ...empresa, codigo_empresa: codigoEmpresaDe(empresa), responsaveis: normalizarResponsaveis(empresa.responsaveis) },
          competencia,
          agora: geradoEm,
          dias_sem_atividade: diasSemAtividade
        });
        return { ...avaliacao, status: 'atencao', erro_leitura: String(erroEmpresa.message || erroEmpresa).slice(0, 240), motivo_parada: 'Dados da empresa precisam de revisão técnica' };
      }
    });
    progressao.sort(function (a, b) {
      const ordem = { parada: 0, sem_responsavel: 1, atencao: 2, em_andamento: 3, finalizada: 4 };
      return (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9)
        || String(a.codigo_empresa || '999999').localeCompare(String(b.codigo_empresa || '999999'))
        || a.razao_social.localeCompare(b.razao_social, 'pt-BR');
    });
    const consolidado = resumirProgressao(progressao);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, competencia, dias_sem_atividade: diasSemAtividade, gerado_em: geradoEm.toISOString(), ...consolidado, empresas: progressao });
  } catch (err) {
    console.error('progressao contabil admin erro:', err);
    res.status(500).json({ erro: err.message, codigo: 'ERRO_PROGRESSAO_CONTABIL' });
  }
});

app.put('/api/admin/progressao-contabil/:cnpj/:competencia/acompanhamento', adminRequired, async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    const competencia = String(req.params.competencia || '').trim();
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido.' });
    if (!RelatoriosContabeis.periodoValido(competencia)) return res.status(400).json({ erro: 'Competência inválida. Use AAAA-MM.' });
    const empresaRef = db.collection('empresas').doc(cnpj);
    const empresaDoc = await empresaRef.get();
    if (!empresaDoc.exists) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    const acompanhamento = sanitizarAcompanhamento(req.body || {});
    const agora = new Date();
    const registro = {
      ...acompanhamento,
      competencia,
      atualizado_em: agora,
      atualizado_por_uid: req.user.uid,
      atualizado_por_email: req.user.email
    };
    const acompanhamentoRef = empresaRef.collection('acompanhamento_contabil').doc(competencia);
    const auditoriaRef = db.collection('admin_audit_logs').doc();
    const auditoria = montarEventoAuditoriaAdmin({
      evento: 'acompanhamento_contabil_atualizado',
      categoria: 'fechamento',
      acao: 'atualizar_acompanhamento_contabil',
      resultado: { status: 'sucesso', httpStatus: 200 },
      cnpj,
      escopo: { recurso: 'acompanhamento_contabil', recursoId: competencia, periodo: competencia },
      detalhes: {
        prazo: acompanhamento.prazo || null,
        prioridade: acompanhamento.prioridade,
        revisao_status: acompanhamento.revisao_status,
        possui_impedimento: !!acompanhamento.impedimento,
        possui_evidencia: !!acompanhamento.evidencia_url,
        areas_esperadas: acompanhamento.areas_esperadas,
        alerta_ativo: acompanhamento.alerta_ativo,
        alerta_dias: acompanhamento.alerta_dias,
        canais_alerta: acompanhamento.canais_alerta
      },
      user: req.user
    });
    const lote = db.batch();
    lote.set(acompanhamentoRef, registro, { merge: true });
    lote.create(auditoriaRef, auditoria);
    await lote.commit();
    res.json({ ok: true, cnpj, competencia, acompanhamento: { ...registro, atualizado_em: agora.toISOString() } });
  } catch (err) {
    console.error('atualizar acompanhamento contabil erro:', err);
    res.status(err.status || 500).json({ erro: err.message, codigo: err.codigo || 'ERRO_ACOMPANHAMENTO_CONTABIL' });
  }
});

async function processarAlertasProgressao(competencia, cnpjAlvo) {
  if (!RelatoriosContabeis.periodoValido(competencia)) {
    const erro = new Error('Competência inválida. Use AAAA-MM.');
    erro.status = 400;
    throw erro;
  }
  const agora = new Date();
  const snap = cnpjAlvo
    ? await db.collection('empresas').where(admin.firestore.FieldPath.documentId(), '==', cnpjAlvo).get()
    : await db.collection('empresas').get();
  const empresas = snap.docs.map(function (doc) { return { cnpj: doc.id, ...(doc.data() || {}) }; });
  const remetente = process.env.GRAPH_REMETENTE || process.env.NOTIF_REMETENTE_EMAIL || '';
  const teamsWebhookUrl = process.env.CCI_PROGRESSAO_TEAMS_WEBHOOK_URL || '';
  const resultados = await mapearComConcorrencia(empresas, 4, async function (empresa) {
    try {
      const avaliacao = await avaliarProgressaoPersistida(empresa, competencia, agora, 5);
      if (!ProgressaoAlertas.podeEnviar(avaliacao, agora)) return { cnpj: empresa.cnpj, status: 'nao_devido' };
      const envio = await ProgressaoAlertas.enviar(avaliacao, {
        remetente,
        teamsWebhookUrl,
        enviarEmail: GraphEmail.enviarEmail
      });
      const sucessos = envio.resultados.filter(function (item) { return item.ok; }).length;
      const registro = {
        competencia,
        criado_em: agora,
        status: envio.ok ? 'enviado' : (sucessos ? 'parcial' : 'falhou'),
        canais: envio.resultados.map(function (item) {
          return { canal: item.canal, destinatario: item.destinatario || '', ok: item.ok === true, erro: item.error || '' };
        }),
        dias_sem_atividade: avaliacao.dias_sem_atividade,
        etapa: avaliacao.etapa,
        percentual: avaliacao.percentual
      };
      const empresaRef = db.collection('empresas').doc(empresa.cnpj);
      const lote = db.batch();
      lote.create(empresaRef.collection('alertas_progressao').doc(), registro);
      if (sucessos) lote.set(empresaRef.collection('acompanhamento_contabil').doc(competencia), {
        ultimo_alerta_em: agora,
        ultimo_alerta_status: registro.status,
        ultimo_alerta_canais: registro.canais
      }, { merge: true });
      await lote.commit();
      return { cnpj: empresa.cnpj, status: registro.status, canais: registro.canais };
    } catch (erro) {
      return { cnpj: empresa.cnpj, status: 'erro', erro: String(erro.message || erro).slice(0, 300) };
    }
  });
  return {
    competencia,
    processadas: resultados.length,
    enviados: resultados.filter(function (item) { return item.status === 'enviado'; }).length,
    parciais: resultados.filter(function (item) { return item.status === 'parcial'; }).length,
    falhas: resultados.filter(function (item) { return ['falhou', 'erro'].includes(item.status); }).length,
    ignorados: resultados.filter(function (item) { return item.status === 'nao_devido'; }).length,
    resultados
  };
}

app.post('/api/admin/progressao-contabil/processar-alertas', adminRequired, async (req, res) => {
  try {
    const competencia = String(req.body && req.body.competencia || '').trim();
    const cnpj = String(req.body && req.body.cnpj || '').replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ inválido.' });
    const resultado = await processarAlertasProgressao(competencia, cnpj || '');
    res.json({ ok: true, ...resultado });
  } catch (erro) {
    res.status(erro.status || 500).json({ erro: erro.message, codigo: 'ERRO_ALERTAS_PROGRESSAO' });
  }
});

app.post('/api/internal/progressao-contabil/processar-alertas', async (req, res) => {
  const segredo = String(process.env.CCI_PROGRESSAO_ALERT_TOKEN || '');
  const recebido = String(req.get('x-cci-alert-token') || '');
  if (!segredo || !recebido || recebido !== segredo) return res.status(403).json({ erro: 'Agendador não autorizado.' });
  try {
    const competencia = String(req.body && req.body.competencia || '').trim() || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'
    }).format(new Date()).slice(0, 7);
    const resultado = await processarAlertasProgressao(competencia, '');
    res.json({ ok: true, ...resultado });
  } catch (erro) {
    res.status(erro.status || 500).json({ erro: erro.message, codigo: 'ERRO_ALERTAS_PROGRESSAO' });
  }
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

app.get('/api/layouts-fiscais', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const layouts = (LAYOUTS_FISCAIS_PADRAO || [])
    .filter(layout => layout.status !== 'Inativo')
    .map(layout => ({ ...layout }));
  res.json({ layouts });
});

app.get('/api/layouts-bancarios/rascunhos', adminRequired, async (req, res) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const snap = await db.collection('layouts_bancarios_rascunhos')
      .orderBy('criado_em', 'desc')
      .limit(limite)
      .get();
    const rascunhos = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
    res.set('Cache-Control', 'no-store');
    res.json({ rascunhos });
  } catch (err) {
    console.error('layouts-bancarios rascunhos GET erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/layouts-bancarios/rascunhos', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const banco = normalizarBancoLayout(body.banco);
    const nomeBanco = String(body.nomeBanco || '').trim().slice(0, 120);
    const nome = String(body.nome || '').trim().slice(0, 160);
    const arquivo = path.basename(String(body.arquivo || '').trim()).slice(0, 220);
    const sha256 = String(body.sha256 || '').trim().toLowerCase();
    const formatosPermitidos = new Set(['PDF textual', 'PDF imagem / OCR', 'OFX', 'CSV', 'XLSX']);
    const formato = formatosPermitidos.has(body.formato) ? body.formato : 'PDF textual';
    const tamanho = Math.max(0, Math.min(Number(body.tamanho || 0), 25 * 1024 * 1024));
    const paginas = Math.max(0, Math.min(parseInt(body.paginas, 10) || 0, 5000));
    const caracteresTexto = Math.max(0, Math.min(parseInt(body.caracteres_texto, 10) || 0, 100000000));
    if (!banco || !nomeBanco || !nome || !arquivo) {
      return res.status(400).json({ erro: 'banco, nomeBanco, nome e arquivo sao obrigatorios' });
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return res.status(400).json({ erro: 'sha256 do arquivo-modelo invalido' });
    }
    if (!tamanho) return res.status(400).json({ erro: 'tamanho do arquivo-modelo invalido' });

    const duplicado = await db.collection('layouts_bancarios_rascunhos').where('sha256', '==', sha256).limit(1).get();
    if (!duplicado.empty) {
      const existente = duplicado.docs[0];
      return res.json({ ok: true, id: existente.id, status: (existente.data() || {}).status || 'rascunho', duplicado: true });
    }

    const parserSolicitado = String(body.parser_detectado || '').trim().slice(0, 120);
    const layoutOficial = LAYOUTS_BANCARIOS_PADRAO.find(layout => {
      return normalizarBancoLayout(layout.banco) === banco && layout.parser === parserSolicitado;
    });
    const parserDetectado = layoutOficial ? parserSolicitado : '';
    const resultadoRaw = body.resultado_teste && typeof body.resultado_teste === 'object' ? body.resultado_teste : {};
    const resultadoTeste = parserDetectado ? {
      lancamentos: Math.max(0, Math.min(parseInt(resultadoRaw.lancamentos, 10) || 0, 1000000)),
      total_credito: Number(Number(resultadoRaw.total_credito || 0).toFixed(2)),
      total_debito: Number(Number(resultadoRaw.total_debito || 0).toFixed(2)),
      periodo_inicio: String(resultadoRaw.periodo_inicio || '').slice(0, 10),
      periodo_fim: String(resultadoRaw.periodo_fim || '').slice(0, 10)
    } : null;
    const status = parserDetectado ? 'em_teste' : 'rascunho';
    const documento = {
      banco,
      nomeBanco,
      nome,
      formato,
      observacao: String(body.observacao || '').trim().slice(0, 600),
      arquivo,
      mime_type: String(body.mime_type || '').trim().slice(0, 120),
      tamanho,
      sha256,
      paginas,
      caracteres_texto: caracteresTexto,
      pdf_textual: body.pdf_textual === true,
      parser_detectado: parserDetectado,
      layout_detectado: layoutOficial ? layoutOficial.nome : '',
      resultado_teste: resultadoTeste,
      arquivo_bruto_armazenado: false,
      status,
      origem: 'admin_novo_layout',
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email,
      atualizado_em: new Date()
    };
    const ref = await db.collection('layouts_bancarios_rascunhos').add(documento);
    await db.collection('layout_events').add({
      tipo: 'rascunho_criado',
      rascunho_id: ref.id,
      banco,
      nomeBanco,
      layout: nome,
      parser: parserDetectado,
      arquivo,
      sha256,
      status,
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    });
    res.status(201).json({ ok: true, id: ref.id, status, arquivo_bruto_armazenado: false });
  } catch (err) {
    console.error('layouts-bancarios rascunhos POST erro:', err);
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
    let avaliacaoAprovacao = null;
    if (homologacao_status === 'aprovado') {
      const avaliacao = avaliarAprovacaoLayoutBanco(layoutAtual.banco, layoutAtual.parser);
      if (!avaliacao.apto) {
        return res.status(409).json({
          erro: 'Layout ainda nao pode ser aprovado automaticamente',
          detalhe: avaliacao.motivo,
          qualidade: avaliacao
        });
      }
      avaliacaoAprovacao = avaliacao;
    }
    const patch = {
      homologacao_status,
      homologacao_observacao: String(body.homologacao_observacao || '').slice(0, 600),
      homologado_em: new Date(),
      homologado_por_uid: req.user.uid,
      homologado_por_email: req.user.email,
      atualizado_em: new Date()
    };
    if (avaliacaoAprovacao) {
      patch.homologacao_versao = lerVersao().version;
      patch.homologacao_casos_ids = avaliacaoAprovacao.casos_ids;
      patch.homologacao_evidencias_ids = avaliacaoAprovacao.evidencias_ids;
    }
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
    const layoutsDbSnap = await db.collection('layouts_bancarios').get();
    const statusLayoutsDb = new Map(layoutsDbSnap.docs.map(d => [d.id, d.data() || {}]));
    const evidenciasPorLayout = new Set(evidencias.map(e => e.banco + '_' + e.parser));
    const aprovacao_layouts = layoutsOficiais.map(l => {
      const id = layoutBancoId(l);
      const dbLayout = statusLayoutsDb.get(id) || {};
      return {
        id,
        banco: l.banco,
        nomeBanco: l.nomeBanco,
        layout: l.nome,
        parser: l.parser,
        formato: l.formato,
        confiabilidade: l.confiabilidade,
        ultimoTeste: l.ultimoTeste,
        homologacao_status: dbLayout.homologacao_status || 'em_teste',
        homologacao_observacao: dbLayout.homologacao_observacao || '',
        homologado_por_email: dbLayout.homologado_por_email || '',
        homologado_em: dbLayout.homologado_em || null,
        homologacao_versao: dbLayout.homologacao_versao || '',
        homologacao_casos_ids: dbLayout.homologacao_casos_ids || [],
        homologacao_evidencias_ids: dbLayout.homologacao_evidencias_ids || [],
        total_usos: dbLayout.total_usos || 0,
        ultimo_uso_em: dbLayout.ultimo_uso_em || null,
        ...avaliarAprovacaoLayoutBanco(l.banco, l.parser)
      };
    });
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
      layouts_aprovados_operacao: aprovacao_layouts.filter(l => l.homologacao_status === 'aprovado').length,
      layouts_em_teste: aprovacao_layouts.filter(l => l.homologacao_status === 'em_teste').length,
      layouts_bloqueados: aprovacao_layouts.filter(l => l.homologacao_status === 'bloqueado').length,
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
    res.json({ resumo, casos, pendentes, evidencias, aprovacao_layouts, confiabilidade_bancos, versao_publicada: lerVersao().version });
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

function normalizarDiagnosticoLayout(body) {
  const diag = body && typeof body.diagnostico === 'object' && body.diagnostico ? body.diagnostico : {};
  const motivo = String(body.motivo || diag.motivo || '');
  const layoutsRaw = Array.isArray(body.layouts_tentados)
    ? body.layouts_tentados
    : (Array.isArray(diag.layouts_tentados) ? diag.layouts_tentados : []);
  let categoria = String(body.categoria_erro || diag.categoria_erro || '').trim();
  if (!categoria) {
    if (/parser n[aã]o carregado|parser nao carregado/i.test(motivo)) categoria = 'parser_nao_carregado';
    else if (/total de cr[eé]dito divergente|total de debito divergente|total de d[eé]bito divergente/i.test(motivo)) categoria = 'total_oficial_divergente';
    else if (/Nenhuma transa/i.test(motivo)) categoria = 'sem_transacoes';
    else if (/layout n[aã]o reconhecido|nao reconhecido neste arquivo|não reconhecido neste arquivo/i.test(motivo)) categoria = 'layout_nao_reconhecido';
    else categoria = 'falha_importacao';
  }
  let acao = String(body.acao_sugerida || diag.acao_sugerida || '').trim();
  if (!acao) {
    if (categoria === 'parser_nao_carregado') acao = 'Verificar se o script do parser esta publicado no HTML e se o cache-buster da versao foi atualizado.';
    else if (categoria === 'total_oficial_divergente') acao = 'Conferir totais oficiais do PDF e ajustar regra do layout antes de liberar para producao.';
    else if (categoria === 'sem_transacoes') acao = 'Validar se o arquivo tem linhas transacionais ou se o modelo deve ser tratado por layout fiscal/financeiro especifico.';
    else if (categoria === 'layout_nao_reconhecido') acao = 'Testar o arquivo na Central de Qualidade e anexar evidencia antes de aprovar o layout.';
    else acao = 'Revisar o arquivo rejeitado na Central de Qualidade e registrar evidencia da correcao.';
  }
  return {
    categoria_erro: categoria.slice(0, 90),
    acao_sugerida: acao.slice(0, 500),
    layouts_tentados: layoutsRaw.map(v => String(v || '').slice(0, 180)).filter(Boolean).slice(0, 20),
    parser_selecionado: String(body.parser || diag.parser_selecionado || '').slice(0, 120),
    layout_selecionado: String(body.layout || diag.layout_selecionado || '').slice(0, 220),
    versao_app: String(body.versao_app || diag.versao_app || '').slice(0, 40)
  };
}

app.post('/api/layout-rejections', async (req, res) => {
  try {
    const body = req.body || {};
    const banco = normalizarBancoLayout(body.banco || '');
    const arquivo = String(body.arquivo || '').slice(0, 220);
    const motivo = String(body.motivo || '').slice(0, 1200);
    if (!arquivo || !motivo) return res.status(400).json({ erro: 'arquivo e motivo obrigatorios' });
    const diagnostico = normalizarDiagnosticoLayout({ ...body, motivo });
    const criadoEm = new Date();
    const governanca = criarGovernancaRejeicao({ categoria_erro: diagnostico.categoria_erro, criado_em: criadoEm });
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
      diagnostico,
      categoria_erro: diagnostico.categoria_erro,
      acao_sugerida: diagnostico.acao_sugerida,
      layouts_tentados: diagnostico.layouts_tentados,
      versao_app: diagnostico.versao_app,
      status: 'pendente_parametrizacao',
      ...governanca,
      origem: body.origem || 'extrator',
      criado_em: criadoEm,
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    };
    doc.caso_fingerprint = fingerprintCasoRejeicao(doc);
    doc.caso_fingerprint_versao = FINGERPRINT_VERSAO;
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
    const snap = await db.collection('layout_rejections').orderBy('criado_em', 'desc').limit(1000).get();
    const agora = new Date();
    const documentos = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    const casos = agruparCasosRejeicao(documentos);
    const contagemPorCaso = new Map(casos.map(caso => [caso.fingerprint, caso.tentativas]));
    res.json({
      resumo: {
        tentativas: documentos.length,
        casos_unicos: casos.length,
        tentativas_repetidas: documentos.length - casos.length,
      },
      rejeicoes: documentos.slice(0, lim).map(dados => {
        const sla = resumirSla(dados, agora);
        const casoFingerprint = fingerprintEfetivo(dados);
        return {
          ...dados,
          caso_fingerprint: casoFingerprint,
          tentativas_caso: contagemPorCaso.get(casoFingerprint) || 1,
          categoria_erro: categoriaDaRejeicao(dados),
          prioridade: dados.prioridade || sla.prioridade,
          sla,
        };
      })
    });
  } catch (err) {
    console.error('layout-rejections GET erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/layout-rejections/:id', adminRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ erro: 'id obrigatorio' });
    const body = req.body || {};
    const ref = db.collection('layout_rejections').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ erro: 'rejeicao nao encontrada' });
    const atual = doc.data() || {};
    const evidenciaId = String(body.evidencia_id || atual.evidencia_id || '').trim();
    const evidencia = (LAYOUT_QUALITY_EVIDENCE || []).find(item => item.id === evidenciaId);
    let patch;
    try {
      patch = prepararAtualizacao(atual, body, {
        ator_uid: req.user.uid,
        ator_email: req.user.email,
        versao_publicada: lerVersao().version,
        evidencia: evidencia ? { ...evidencia, banco: normalizarBancoLayout(evidencia.banco) } : null,
        agora: new Date()
      });
    } catch (erroValidacao) {
      return res.status(400).json({ erro: erroValidacao.message });
    }
    await ref.set(patch, { merge: true });
    await db.collection('layout_events').add({
      tipo: 'rejeicao_atualizada',
      rejeicao_id: id,
      banco: atual.banco || '',
      nomeBanco: atual.nomeBanco || '',
      layout: atual.layout || '',
      parser: atual.parser || '',
      status: patch.status,
      prioridade: patch.prioridade,
      responsavel_email: patch.responsavel_email,
      versao_correcao: patch.versao_correcao || '',
      evidencia_id: patch.evidencia_id || '',
      criado_em: new Date(),
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email
    });
    res.json({ ok: true, id, ...patch });
  } catch (err) {
    console.error('layout-rejections PATCH erro:', err);
    res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/layout-rejection-case-assignments', adminRequired, async (req, res) => {
  try {
    const fingerprints = [...new Set((Array.isArray(req.body && req.body.fingerprints) ? req.body.fingerprints : [])
      .map(item => String(item || '').trim().toLowerCase()))];
    const responsavel = String(req.body && req.body.responsavel_email || '').trim().toLowerCase();
    if (!fingerprints.length || fingerprints.length > 100) {
      return res.status(400).json({ erro: 'selecione entre 1 e 100 casos por atribuição' });
    }
    if (fingerprints.some(item => !/^[a-f0-9]{64}$/.test(item))) {
      return res.status(400).json({ erro: 'fingerprint de caso invalido' });
    }
    const selecionados = new Set(fingerprints);
    const snap = await db.collection('layout_rejections').get();
    const abertos = snap.docs.map(doc => ({ ref: doc.ref, id: doc.id, dados: doc.data() || {} }))
      .map(item => ({ ...item, fingerprint: fingerprintEfetivo(item.dados) }))
      .filter(item => selecionados.has(item.fingerprint))
      .filter(item => !['resolvido', 'ignorado'].includes(String(item.dados.status || 'pendente_parametrizacao')));
    const porCaso = new Map();
    abertos.forEach(item => {
      if (!porCaso.has(item.fingerprint)) porCaso.set(item.fingerprint, []);
      porCaso.get(item.fingerprint).push(item);
    });
    const ausentes = fingerprints.filter(item => !porCaso.has(item));
    if (ausentes.length) return res.status(409).json({ erro: `${ausentes.length} caso(s) não possuem tentativas abertas` });
    const totalOperacoes = abertos.length + porCaso.size;
    if (totalOperacoes > 450) {
      return res.status(409).json({
        erro: `a seleção exige ${totalOperacoes} operações; reduza a seleção para manter a atribuição atômica`,
        tentativas_abertas: abertos.length,
        casos: porCaso.size,
      });
    }
    const contexto = {
      ator_uid: req.user.uid,
      ator_email: req.user.email,
      versao_publicada: lerVersao().version,
      agora: new Date(),
    };
    let atualizacoes;
    try {
      atualizacoes = abertos.map(item => ({
        ...item,
        patch: {
          ...prepararAtualizacao(item.dados, {
            status: 'em_parametrizacao',
            responsavel_email: responsavel,
            prioridade: item.dados.prioridade || undefined,
          }, contexto),
          caso_fingerprint: item.fingerprint,
          caso_fingerprint_versao: FINGERPRINT_VERSAO,
        },
      }));
    } catch (erroValidacao) {
      return res.status(400).json({ erro: erroValidacao.message });
    }
    const batch = db.batch();
    atualizacoes.forEach(item => batch.set(item.ref, item.patch, { merge: true }));
    porCaso.forEach((tentativas, fingerprint) => {
      const primeiro = tentativas[0].dados;
      batch.set(db.collection('layout_events').doc(), {
        tipo: 'caso_rejeicao_atribuido_em_lote',
        caso_fingerprint: fingerprint,
        tentativas: tentativas.length,
        banco: primeiro.banco || '',
        nomeBanco: primeiro.nomeBanco || '',
        parser: primeiro.parser || '',
        status: 'em_parametrizacao',
        responsavel_email: responsavel,
        criado_em: contexto.agora,
        criado_por_uid: req.user.uid,
        criado_por_email: req.user.email,
      });
    });
    await batch.commit();
    return res.json({
      ok: true,
      casos_atribuidos: porCaso.size,
      tentativas_atualizadas: atualizacoes.length,
      responsavel_email: responsavel,
    });
  } catch (err) {
    console.error('layout-rejection-case-assignments PATCH erro:', err);
    return res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/layout-rejection-cases/:fingerprint', adminRequired, async (req, res) => {
  try {
    const fingerprint = String(req.params.fingerprint || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) return res.status(400).json({ erro: 'fingerprint de caso invalido' });
    const body = req.body || {};
    // A ação administrativa precisa alcançar todas as tentativas históricas do caso.
    // O painel pode limitar a leitura para exibição, mas o tratamento não pode deixar
    // ocorrências antigas pendentes silenciosamente.
    const snap = await db.collection('layout_rejections').get();
    const tentativas = snap.docs.map(d => ({ ref: d.ref, id: d.id, dados: d.data() || {} }))
      .filter(item => fingerprintEfetivo(item.dados) === fingerprint);
    if (!tentativas.length) return res.status(404).json({ erro: 'caso de rejeicao nao encontrado' });
    if (tentativas.length > 400) return res.status(409).json({ erro: 'caso excede o limite atomico de 400 tentativas' });
    const evidenciaId = String(body.evidencia_id || '').trim();
    const evidencia = (LAYOUT_QUALITY_EVIDENCE || []).find(item => item.id === evidenciaId);
    const contexto = {
      ator_uid: req.user.uid,
      ator_email: req.user.email,
      versao_publicada: lerVersao().version,
      evidencia: evidencia ? { ...evidencia, banco: normalizarBancoLayout(evidencia.banco) } : null,
      agora: new Date(),
    };
    let atualizacoes;
    try {
      atualizacoes = tentativas.map(item => ({
        ...item,
        patch: {
          ...prepararAtualizacao(item.dados, body, contexto),
          caso_fingerprint: fingerprint,
          caso_fingerprint_versao: FINGERPRINT_VERSAO,
        },
      }));
    } catch (erroValidacao) {
      return res.status(400).json({ erro: erroValidacao.message });
    }
    const batch = db.batch();
    atualizacoes.forEach(item => batch.set(item.ref, item.patch, { merge: true }));
    const primeiro = tentativas[0].dados;
    batch.set(db.collection('layout_events').doc(), {
      tipo: 'caso_rejeicao_atualizado',
      caso_fingerprint: fingerprint,
      tentativas: tentativas.length,
      banco: primeiro.banco || '',
      nomeBanco: primeiro.nomeBanco || '',
      parser: primeiro.parser || '',
      status: atualizacoes[0].patch.status,
      prioridade: atualizacoes[0].patch.prioridade,
      responsavel_email: atualizacoes[0].patch.responsavel_email,
      versao_correcao: atualizacoes[0].patch.versao_correcao || '',
      evidencia_id: atualizacoes[0].patch.evidencia_id || '',
      criado_em: contexto.agora,
      criado_por_uid: req.user.uid,
      criado_por_email: req.user.email,
    });
    await batch.commit();
    res.json({
      ok: true,
      caso_fingerprint: fingerprint,
      tentativas_atualizadas: tentativas.length,
      status: atualizacoes[0].patch.status,
    });
  } catch (err) {
    console.error('layout-rejection-cases PATCH erro:', err);
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
    const categoriasErro = {};
    let sucessosOperacionais = 0;
    let slaVencidos = 0;
    let semResponsavel = 0;
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
      // Homologação, rascunho e atualização administrativa permanecem na
      // trilha, mas não são importações bem-sucedidas e não podem inflar a
      // taxa operacional do layout.
      if (e.tipo !== 'sucesso') return;
      sucessosOperacionais++;
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
    const rejeicoesDocumentos = rejeicoesSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    const casosRejeicao = agruparCasosRejeicao(rejeicoesDocumentos);
    rejeicoesDocumentos.forEach(r => {
      const st = r.status || 'pendente_parametrizacao';
      const sla = resumirSla(r);
      if (sla.vencido) slaVencidos++;
      if (!sla.fechado && !String(r.responsavel_email || '').trim()) semResponsavel++;
      const categoria = categoriaDaRejeicao(r);
      categoriasErro[categoria] = (categoriasErro[categoria] || 0) + 1;
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
    const casosAbertos = casosRejeicao.filter(caso => caso.aberto);
    const casosOperacionais = casosRejeicao.map(caso => {
      const sla = resumirSla({
        status: caso.estado,
        prioridade: caso.prioridade || undefined,
        categoria_erro: caso.categoria_erro,
        criado_em: caso.primeira_em,
      });
      return { ...caso, prioridade: caso.prioridade || sla.prioridade, sla };
    }).sort((a, b) => {
      const peso = { critica: 3, alta: 2, normal: 1, baixa: 0 };
      return Number(b.aberto) - Number(a.aberto)
        || Number(b.sla.vencido) - Number(a.sla.vencido)
        || (peso[b.prioridade] || 0) - (peso[a.prioridade] || 0)
        || b.tentativas - a.tentativas;
    });
    const casosSlaVencidos = casosOperacionais.filter(caso => caso.aberto && caso.sla.vencido).length;
    res.json({
      resumo: {
        sucessos: sucessosOperacionais,
        rejeicoes: rejeicoesSnap.size,
        pendentes: status.pendente_parametrizacao || 0,
        em_parametrizacao: status.em_parametrizacao || 0,
        resolvidos: status.resolvido || 0,
        ignorados: status.ignorado || 0,
        sla_vencidos: slaVencidos,
        sem_responsavel: semResponsavel,
        casos_unicos: casosRejeicao.length,
        casos_pendentes: casosAbertos.length,
        casos_resolvidos: casosRejeicao.filter(caso => caso.estado === 'resolvido').length,
        casos_ignorados: casosRejeicao.filter(caso => caso.estado === 'ignorado').length,
        tentativas_repetidas: rejeicoesDocumentos.length - casosRejeicao.length,
        casos_sla_vencidos: casosSlaVencidos,
        casos_sem_responsavel: casosAbertos.filter(caso => !caso.responsavel_email).length,
        casos_sem_parser: casosAbertos.filter(caso => !caso.parser).length,
        categorias_erro: categoriasErro
      },
      status,
      por_colaborador,
      por_banco,
      mensal,
      alertas: alertas.slice(0, 20),
      casos: casosOperacionais,
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

// ═══════════════════════════════════════════════════════════════════════════
// AJUDA CCI — assistente operacional com base fechada e aprendizado revisado
// As perguntas alimentam uma fila de curadoria. Nenhuma resposta do modelo
// vira regra do sistema automaticamente.
// ═══════════════════════════════════════════════════════════════════════════
function extrairJsonAjudaCci(texto) {
  const bruto = String(texto || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const inicio = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return null;
  try { return JSON.parse(bruto.slice(inicio, fim + 1)); } catch (e) { return null; }
}

function escaparHtmlAjudaCci(valor) {
  return String(valor || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function notificarSugestaoAjudaCci(registro, protocolo) {
  const remetente = process.env.GRAPH_REMETENTE || process.env.NOTIF_REMETENTE_EMAIL;
  const destinatario = process.env.CCI_SUGESTOES_EMAIL || remetente;
  if (!GraphEmail.configurado() || !remetente || !destinatario) {
    return { ok: false, status: 'fila_admin', detalhe: 'E-mail não configurado; sugestão disponível no banco administrativo.' };
  }
  const html = `<div style="font-family:Arial,sans-serif;color:#14213d;line-height:1.55">
    <h2>Nova sugestão da Ajuda CCI</h2>
    <p><strong>Protocolo:</strong> ${escaparHtmlAjudaCci(protocolo)}</p>
    <p><strong>Pergunta:</strong><br>${escaparHtmlAjudaCci(registro.pergunta)}</p>
    <p><strong>Usuário:</strong> ${escaparHtmlAjudaCci(registro.usuario_email)}<br>
    <strong>Empresa:</strong> ${escaparHtmlAjudaCci(registro.cnpj || 'não informada')}<br>
    <strong>Tela:</strong> ${escaparHtmlAjudaCci(registro.pagina || 'não informada')}<br>
    <strong>Versão:</strong> ${escaparHtmlAjudaCci(registro.versao || 'não informada')}</p>
    <p>A dúvida ficou pendente de curadoria. Revise antes de incluir qualquer orientação na base oficial.</p>
  </div>`;
  const envio = await GraphEmail.enviarEmail({
    remetente,
    para: destinatario,
    assunto: `[CCI] Sugestão de ajuda ${protocolo}`,
    html
  });
  return { ok: envio.ok === true, status: envio.ok ? 'email_enviado' : 'fila_admin', detalhe: envio.error || '' };
}

app.post('/api/ajuda-cci/perguntar', async (req, res) => {
  const body = req.body || {};
  const pergunta = String(body.pergunta || '').trim().replace(/\s+/g, ' ').slice(0, 1500);
  if (pergunta.length < 3) return res.status(400).json({ erro: 'Informe uma pergunta com pelo menos 3 caracteres.' });

  const cnpj = String(body.cnpj || '').replace(/\D/g, '').slice(0, 14);
  const pagina = String(body.pagina || '').trim().slice(0, 120);
  const versao = String(body.versao || '').trim().slice(0, 30);
  const detectouAdmin = parecePerguntaAdministrativa(pergunta);
  const orientacaoLocal = detectouAdmin ? null : buscarOrientacaoAjuda(pergunta);
  let resultado = orientacaoLocal || {
    resposta: detectouAdmin
      ? `Essa solicitação envolve uma função administrativa. As ações restritas incluem: ${ACOES_ADMIN_CCI.join('; ')}. Procure um administrador e informe a empresa, a tela e a ação desejada.`
      : 'Ainda não há uma orientação oficial suficiente para responder com segurança. A pergunta será registrada como sugestão para revisão.',
    resolvida: detectouAdmin,
    requer_admin: detectouAdmin,
    modulo: detectouAdmin ? 'Permissões administrativas' : 'Não identificado',
    motivo: detectouAdmin ? 'Ação sensível protegida por permissão administrativa.' : 'Base oficial insuficiente.'
  };

  if (!detectouAdmin && !orientacaoLocal) {
    const client = getGeminiClient();
    if (client) {
      const systemInstruction = `Você é a Ajuda CCI, assistente operacional do Consultor Contábil Inteligente.\n
Responda SOMENTE com base no conteúdo oficial abaixo. Não invente telas, botões, permissões, regras contábeis, fiscais ou legais. Não execute ações. Não peça nem aceite senhas, tokens, dados bancários ou dados pessoais. Se a base não contiver informação suficiente, marque resolvida como false e diga que a dúvida será enviada como sugestão. Se envolver ação administrativa, marque requer_admin como true e oriente a procurar um administrador. Decisões contábeis, fiscais ou legais devem ser confirmadas com o contador responsável.\n
BASE OFICIAL DO CCI:\n${textoBaseAjuda()}\n
AÇÕES EXCLUSIVAS DE ADMINISTRADOR:\n- ${ACOES_ADMIN_CCI.join('\n- ')}\n
Retorne somente JSON válido neste formato: {"resposta":"texto curto e acionável","resolvida":true,"requer_admin":false,"modulo":"nome do módulo","motivo":"fonte ou lacuna"}.`;
      try {
        const response = await client.models.generateContent({
          model: GEMINI_CHAT_MODEL,
          contents: `Pergunta do colaborador: ${pergunta}`,
          config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.1 }
        });
        const interpretado = extrairJsonAjudaCci(response.text || '');
        if (interpretado && typeof interpretado.resposta === 'string') {
          resultado = {
            resposta: interpretado.resposta.trim().slice(0, 4000),
            resolvida: interpretado.resolvida === true,
            requer_admin: interpretado.requer_admin === true,
            modulo: String(interpretado.modulo || 'Geral').slice(0, 100),
            motivo: String(interpretado.motivo || '').slice(0, 500)
          };
        }
      } catch (erroIa) {
        console.error('[ajuda-cci] consulta Gemini falhou:', erroIa && erroIa.message);
      }
    }
  }

  if (resultado.requer_admin) resultado.resolvida = true;
  const status = resultado.requer_admin ? 'requer_admin' : (resultado.resolvida ? 'respondida' : 'sugestao_pendente');
  const docRef = db.collection('ajuda_cci_perguntas').doc();
  const protocolo = `CCI-${docRef.id.slice(0, 8).toUpperCase()}`;
  const registro = {
    protocolo,
    pergunta,
    resposta: resultado.resposta,
    resolvida: resultado.resolvida,
    requer_admin: resultado.requer_admin,
    modulo: resultado.modulo,
    motivo: resultado.motivo,
    status,
    pagina,
    cnpj: cnpj.length === 14 ? cnpj : '',
    versao,
    usuario_uid: req.user.uid,
    usuario_email: req.user.email,
    criado_em: FieldValue.serverTimestamp(),
    curadoria_status: resultado.resolvida ? 'nao_necessaria' : 'pendente',
    promovida_base_oficial: false
  };

  try {
    await docRef.set(registro);
    if (!resultado.resolvida) {
      const notificacao = await notificarSugestaoAjudaCci(registro, protocolo);
      await docRef.set({
        notificacao_status: notificacao.status,
        notificacao_detalhe: String(notificacao.detalhe || '').slice(0, 500),
        notificacao_em: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (erroRegistro) {
    console.error('[ajuda-cci] registro falhou:', erroRegistro);
    return res.status(500).json({ erro: 'Não foi possível registrar a consulta na base de ajuda.' });
  }

  res.json({
    ok: true,
    protocolo,
    resposta: resultado.resposta,
    resolvida: resultado.resolvida,
    requer_admin: resultado.requer_admin,
    modulo: resultado.modulo,
    sugestao_registrada: !resultado.resolvida
  });
});

app.get('/api/manual-cci', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(MANUAL_CCI);
});

app.get('/api/manual-cci/download/:formato', (req, res) => {
  const formato = String(req.params.formato || '').toLowerCase();
  if (!['docx', 'pdf'].includes(formato)) return res.status(400).json({ erro: 'Formato inválido. Use docx ou pdf.' });
  const nome = `Manual_Operacional_CCI.${formato}`;
  const arquivo = path.join(__dirname, 'downloads', nome);
  res.set('Cache-Control', 'no-store');
  res.download(arquivo, nome, (erro) => {
    if (erro && !res.headersSent) res.status(404).json({ erro: 'O download do manual ainda não foi gerado para esta versão.' });
  });
});

app.get('/api/admin/ajuda-cci/sugestoes', adminRequired, async (req, res) => {
  try {
    const limite = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const snap = await db.collection('ajuda_cci_perguntas').orderBy('criado_em', 'desc').limit(limite).get();
    res.json(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'Falha ao listar sugestões da Ajuda CCI.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI SDK ENDPOINTS — AuditAI e Extratos (admin-only)
// Deve ficar antes dos fallbacks estaticos. Se ficar depois do fallback geral,
// o frontend recebe index.html e quebra ao tentar interpretar HTML como JSON.
// ═══════════════════════════════════════════════════════════════════════════
let _geminiClient = null;
function mensagemSeguraErroGemini(err) {
  const raw = String((err && err.message) || '');
  const normalized = raw.toLowerCase();
  if (
    (err && Number(err.status) === 429)
    || normalized.includes('resource_exhausted')
    || normalized.includes('prepayment')
    || normalized.includes('credits are depleted')
  ) {
    return 'Cota do provedor de IA esgotada. Regularize a cota e tente novamente.';
  }
  return 'Não foi possível concluir a análise de IA neste momento.';
}

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
  const { model: requestedModel, contents, config = {}, systemInstruction } = req.body || {};
  const model = resolverModeloGemini(requestedModel, GEMINI_DEFAULT_MODEL);
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
    res.status(status).json({ erro: mensagemSeguraErroGemini(err) });
  }
});

app.post('/api/gemini/chat', adminRequired, async (req, res) => {
  const client = getGeminiClient();
  if (!client) return res.status(503).json({ erro: 'GEMINI_API_KEY nao configurada' });
  const { model: requestedModel, history = [], message, systemInstruction, tools } = req.body || {};
  const model = resolverModeloGemini(requestedModel, GEMINI_CHAT_MODEL);
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
    const status = err && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ erro: mensagemSeguraErroGemini(err) });
  }
});

// ===== ECD/ECF: consolidacao matriz + filiais (colecao ecdecf_matrizes) =====
// GET lista todas as matrizes consolidadas (contador + tabela da aba ECD/ECF)
app.get('/api/ecdecf/matrizes', async (req, res) => {
  try {
    const snap = await db.collection('ecdecf_matrizes').orderBy('atualizado_em', 'desc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// POST upsert de matriz consolidada (id = cnpj_ano) - permite ajustes/novas validacoes de empresas ja validadas
app.post('/api/ecdecf/matrizes', async (req, res) => {
  try {
    const b = req.body || {};
    const cnpj = String(b.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return res.status(400).json({ erro: 'CNPJ invalido' });
    if (cnpj.substr(8, 4) !== '0001') return res.status(400).json({ erro: 'CNPJ informado nao e MATRIZ (/0001)' });
    const ano = String(b.ano || '').replace(/\D/g, '');
    if (!ano) return res.status(400).json({ erro: 'Ano-calendario obrigatorio' });
    const ref = db.collection('ecdecf_matrizes').doc(cnpj + '_' + ano);
    const prev = await ref.get();
    const geracoes = ((prev.exists && prev.data().geracoes) || 0) + (b.gerado ? 1 : 0);
    // Ranking por colaborador: incrementa o contador do usuario autenticado a cada geracao
    const gpuPrev = (prev.exists && prev.data().geracoes_por_usuario) || {};
    if (b.gerado) {
      const emailKey = String(req.user.email || 'desconhecido').toLowerCase().replace(/[^a-z0-9@_-]/g, '_');
      const atualUser = (gpuPrev[emailKey] && gpuPrev[emailKey].count) || 0;
      gpuPrev[emailKey] = { email: req.user.email || 'desconhecido', count: atualUser + 1 };
    }
    await ref.set({
      cnpj, ano,
      geracoes_por_usuario: gpuPrev,
      razao_social: b.razao_social || null,
      municipio: b.municipio || null,
      uf: b.uf || null,
      arquivos: b.arquivos || [],
      ajustes_saldos: b.ajustes_saldos || [],
      validacao: b.validacao || null,
      stats: b.stats || null,
      geracoes,
      criado_em: prev.exists ? (prev.data().criado_em || new Date()) : new Date(),
      atualizado_em: new Date(),
      atualizado_por: req.user.email
    }, { merge: true });
    const total = (await db.collection('ecdecf_matrizes').count().get()).data().count;
    res.json({ ok: true, id: cnpj + '_' + ano, geracoes, total_matrizes: total });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});


app.use('/api', (req, res) => {
  res.status(404).json({ erro: `Rota API nao encontrada: ${req.originalUrl}` });
});

// Os arquivos do manual ficam no pacote para download autenticado pela API,
// mas não podem ser expostos diretamente pelo express.static.
app.use('/downloads', (req, res) => {
  res.status(404).send('Arquivo não encontrado. Acesse o Manual Operacional após fazer login no CCI.');
});

app.use('/vendor/xlsx', express.static(path.join(__dirname, 'node_modules', 'xlsx', 'dist'), {
  etag: false,
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

app.use('/vendor/jspdf', express.static(path.join(__dirname, 'node_modules', 'jspdf', 'dist'), {
  etag: false,
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

app.use('/vendor/jspdf-autotable', express.static(path.join(__dirname, 'node_modules', 'jspdf-autotable', 'dist'), {
  etag: false,
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

// AuditAI — app React buildado
// HTML e scripts soltos precisam sempre chegar frescos; a conciliacao usa
// cache-buster de versao, mas Safari/Cloud Run podem manter copia antiga.
app.use('/auditai', express.static(path.join(__dirname, 'auditai'), {
  index: 'index.html',
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (/\.(html|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      if (/\.html$/i.test(filePath)) {
        res.setHeader('Clear-Site-Data', '"cache"');
      }
    }
  }
}));
app.get('/auditai*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Clear-Site-Data', '"cache"');
  res.sendFile(path.join(__dirname, 'auditai', 'index.html'));
});

function headersAppPrincipal(res, filePath) {
  if (!/(?:^|\/)(?:index\.html|parser-flanacar-registro-entradas\.js|parser-[^/]+\.js|layouts-fiscais-padrao\.js)$/i.test(filePath || '')) return;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  if (/(?:^|\/)index\.html$/i.test(filePath || '')) res.setHeader('Clear-Site-Data', '"cache"');
}

app.use(express.static(__dirname, { index: 'index.html', setHeaders: headersAppPrincipal }));
app.get('*', (req, res) => {
  headersAppPrincipal(res, path.join(__dirname, 'index.html'));
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && (err.status === 413 || err.type === 'entity.too.large')) {
    return res.status(413).json({
      erro: err.message || 'Payload acima do limite permitido para esta rota.',
      codigo: err.codigo || 'PAYLOAD_MUITO_GRANDE',
    });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.', codigo: 'JSON_INVALIDO' });
  }
  return next(err);
});


app.listen(PORT, () => {
  const versao = lerVersao().version || require('./package.json').version || 'dev';
  console.log('[plano-contas-iob v' + versao + '] porta ' + PORT);
  garantirLayoutsBancariosPadrao().catch(err => console.error('[layouts bancarios] bootstrap falhou:', err && err.message));
});
