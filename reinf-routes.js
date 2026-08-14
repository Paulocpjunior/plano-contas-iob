// ============================================================================
// Rotas EFD-Reinf / Informes de Rendimentos integradas ao Consultor Contabil.
// Reaproveita os utilitarios validados do app de informes e herda authRequired
// porque e registrada abaixo de /api no server.js.
// ============================================================================
const express = require('express');
const {
  LEIAUTE_REINF,
  REVISAO_XSD_R4010,
  gerarR1000,
  gerarR4010,
  gerarR4099,
  gerarEventosR4010DaPlanilha,
} = require('./reinf/reinf-utils');
const { assinarEventoReinf } = require('./reinf/assinador');
const { loadCertificado, salvarCertificadoUpload } = require('./reinf/cert-loader');
const { enviarLote, consultarLote } = require('./reinf/transmissor');
const { transmissorAtivo, enviarLoteViaGateway, consultarLoteViaGateway } = require('./reinf/gateway-client');
const { apurarRetencoesPJ } = require('./reinf/retencao-pj-apuracao');
const { buscarNotasTomadasNoCfi, buscarAquisicoesRuraisNoCfi, buscarServicosTomadosNoCfi, buscarResponsavelNoCfi, buscarCertificadoNoCfi } = require('./reinf/cfi-notas-client');
const { resumirResponsavel, avisosDoResponsavel } = require('./reinf/responsavel-escritorio');
const { conferirCertificado } = require('./reinf/certificado-conferencia');
const { apurarAquisicaoRural } = require('./reinf/aquisicao-rural-apuracao');
const { apurarServicosTomados } = require('./reinf/servicos-tomados-apuracao');
const { gerarEventosR2055 } = require('./reinf/gerar-r2055');
const { gerarEventosR2010 } = require('./reinf/gerar-r2010');
const { gerarR2099, podeTransmitirR2099 } = require('./reinf/gerar-r2099');
const { derivarGruposDoLog, resumoDoFechamento } = require('./reinf/fechamento-2000-grupos');
const {
  calcularDividendos,
  locadoresDividendosParaR4010,
  emailSolicitacaoDividendos,
} = require('./reinf/reinf-dividendos-utils');
const {
  VERSAO_REGRAS: VERSAO_REGRAS_APLICACOES,
  FONTE_REGRAS: FONTE_REGRAS_APLICACOES,
  emailSolicitacaoAplicacoes,
} = require('./reinf/reinf-aplicacoes-utils');

function limparCnpj(v) {
  return String(v || '').replace(/\D/g, '');
}

function normalizarContribuinteLote(contribuinte) {
  const tpInsc = Number(contribuinte && contribuinte.tpInsc);
  const nr = limparCnpj(contribuinte && contribuinte.nrInsc);
  return {
    tpInsc,
    nrInsc: tpInsc === 1 && nr.length === 14 ? nr.slice(0, 8) : nr,
  };
}

function respostaErro(res, status, err) {
  const msg = err && err.message ? err.message : String(err || 'Erro desconhecido');
  return res.status(status).json({ ok: false, erro: msg });
}

function extrairTagXml(xml, tag) {
  const texto = String(xml || '');
  const re = new RegExp('<(?:\\w+:)?' + tag + '>([\\s\\S]*?)<\\/(?:\\w+:)?' + tag + '>', 'i');
  const match = texto.match(re);
  return match ? match[1].trim() : null;
}

function extrairTagsXml(xml, tag) {
  const texto = String(xml || '');
  const re = new RegExp('<(?:\\w+:)?' + tag + '>([\\s\\S]*?)<\\/(?:\\w+:)?' + tag + '>', 'gi');
  return Array.from(texto.matchAll(re)).map((m) => String(m[1] || '').trim());
}

/**
 * OCORRÊNCIAS POR EVENTO no retorno da Receita.
 *
 * "Lote processado com sucesso – Possui um ou mais eventos com ocorrências de
 * erro" NÃO é sucesso: o lote chegou, os eventos foram RECUSADOS. Quem diz o
 * quê são os pares codResp/dscResp de cada evento — e eles nunca subiam pra
 * tela, então a colaboradora via 8 valores, um ✓ verde e nenhuma explicação
 * (caso EDUARDO GUERRA, 12/08/2026).
 */
function extrairOcorrenciasReinf(xml) {
  const codigos = extrairTagsXml(xml, 'codResp');
  const descricoes = extrairTagsXml(xml, 'dscResp');
  const tipos = ['tpOcorr', 'tipo']
    .map((t) => extrairTagsXml(xml, t))
    .find((l) => l.length) || [];
  // RESPONDIDO PELO RETORNO REAL (12/08): a tag é `localErroAviso`, e ela traz
  // o campo E o XPath — "- Campo: perApur - XPATH: /Reinf/evtAqProd/ideEvento/
  // perApur". Era ela que faltava; o app procurava `localizacaoErroAviso` e
  // mostrava a ocorrência sem o "onde". Os outros nomes ficam na lista porque
  // custam nada e o leiaute do retorno já mudou antes.
  const locais = ['localErroAviso', 'localizacaoErroAviso', 'localizacao', 'localizacaoErro', 'elemento']
    .map((t) => extrairTagsXml(xml, t))
    .find((l) => l.length) || [];
  const total = Math.max(codigos.length, descricoes.length);
  const out = [];
  for (let i = 0; i < total; i++) {
    const codigo = codigos[i] || null;
    const descricao = descricoes[i] || null;
    if (!codigo && !descricao) continue;
    out.push({
      codigo,
      descricao,
      tipo: tipos[i] || null,
      localizacao: locais[i] || null,
    });
  }
  return out;
}

/**
 * RETORNO CRU, sem a assinatura.
 *
 * Ocorrência que o parser não soube nomear vira ocorrência SEM CAUSA na tela — e
 * foi o que aconteceu com o MS0030 (a Receita disse QUAL elemento estava fora do
 * lugar; o app leu só codResp/dscResp e a localização, que existe no retorno com
 * outro nome, se perdeu). Em vez de adivinhar mais nomes de tag, o retorno inteiro
 * sobe pra tela num bloco recolhido: quem lê o print vê o que a Receita mandou,
 * não o que o app conseguiu interpretar.
 *
 * O <Signature> sai porque é 4 KB de base64 que empurra a informação pra fora da
 * tela — e o que importa aqui é a resposta, não a prova criptográfica dela.
 */
function retornoCruReinf(xml) {
  const texto = String(xml || '').trim();
  if (!texto) return null;
  return texto
    .replace(/<(?:\w+:)?Signature\b[\s\S]*?<\/(?:\w+:)?Signature>/gi, '<!-- Signature omitida -->')
    .slice(0, 20000);
}

function reinfReciboDocId({ tpAmb, perApur, cnpjEstab, cpf, ideEvtAdic }) {
  return [
    String(tpAmb || ''),
    String(perApur || '').replace(/[^0-9]/g, ''),
    limparCnpj(cnpjEstab),
    limparCnpj(cpf),
    String(ideEvtAdic || 'padrao').replace(/[^A-Za-z0-9_-]/g, '_'),
  ].filter(Boolean).join('_');
}

function extrairBlocosXml(xml, tag) {
  const texto = String(xml || '');
  const re = new RegExp('<(?:\\w+:)?' + tag + '\\b[\\s\\S]*?<\\/(?:\\w+:)?' + tag + '>', 'gi');
  return Array.from(texto.matchAll(re)).map((m) => m[0]);
}

function parseRetornoEventos(xml) {
  return extrairBlocosXml(xml, 'retornoEvento').map((bloco) => ({
    idEv: extrairTagXml(bloco, 'idEv'),
    tpEv: extrairTagXml(bloco, 'tpEv'),
    nrRecArqBase: extrairTagXml(bloco, 'nrRecArqBase'),
    cdRetorno: extrairTagXml(bloco, 'cdRetorno'),
    descRetorno: extrairTagXml(bloco, 'descRetorno'),
    codResp: extrairTagsXml(bloco, 'codResp').filter(Boolean),
    dscResp: extrairTagsXml(bloco, 'dscResp').filter(Boolean),
  }));
}

async function buscarRecibosR4010(db, p, tpAmb) {
  if (!db || !p || !Array.isArray(p.locadores)) return new Map();
  const cnpjFonte = limparCnpj(p.contribuinte && p.contribuinte.nrInsc);
  if (cnpjFonte.length !== 14) return new Map();
  const out = new Map();
  const col = db.collection('empresas').doc(cnpjFonte).collection('reinf_eventos');
  for (const loc of p.locadores) {
    const cpf = limparCnpj(loc && (loc.cpf || loc.cpfBenef));
    const cnpjEstab = limparCnpj(loc && loc.cnpjEstab) || limparCnpj(p.estabelecimento && p.estabelecimento.nrInscEstab) || cnpjFonte;
    if (cpf.length !== 11 || cnpjEstab.length !== 14) continue;
    const key = reinfReciboDocId({ tpAmb, perApur: p.perApur, cnpjEstab, cpf, ideEvtAdic: loc.ideEvtAdic });
    try {
      const doc = await col.doc(key).get();
      if (doc.exists) {
        const dados = doc.data() || {};
        if (dados.nrRecibo) out.set(key, dados.nrRecibo);
      }
    } catch (err) {
      console.warn('[reinf/recibos] falha ao buscar recibo:', err.message);
    }
  }
  return out;
}

function aplicarRecibosLocadores(p, tpAmb, recibos) {
  const cnpjFonte = limparCnpj(p && p.contribuinte && p.contribuinte.nrInsc);
  return (Array.isArray(p.locadores) ? p.locadores : []).map((loc) => {
    const cpf = limparCnpj(loc && (loc.cpf || loc.cpfBenef));
    const cnpjEstab = limparCnpj(loc && loc.cnpjEstab) || limparCnpj(p.estabelecimento && p.estabelecimento.nrInscEstab) || cnpjFonte;
    const key = reinfReciboDocId({ tpAmb, perApur: p.perApur, cnpjEstab, cpf, ideEvtAdic: loc && loc.ideEvtAdic });
    const nrRecibo = recibos && recibos.get(key);
    return nrRecibo ? { ...loc, nrReciboR4010: nrRecibo } : loc;
  });
}

async function registrarLoteReinfPendente(db, req, protocolo, eventos, p, tpAmb) {
  if (!db || !protocolo) return;
  const cnpjFonte = limparCnpj(p && p.contribuinte && p.contribuinte.nrInsc);
  const cnpjEstabPadrao = limparCnpj(p && p.estabelecimento && p.estabelecimento.nrInscEstab) || cnpjFonte;
  const loteRef = db.collection('reinf_lotes').doc(String(protocolo));
  await loteRef.set({
    protocolo: String(protocolo),
    tpAmb,
    cnpjFonte,
    perApur: p && p.perApur || null,
    criado_em: new Date(),
    criado_por_uid: req.user && req.user.uid || null,
    criado_por_email: req.user && req.user.email || null,
  }, { merge: true });
  const batch = db.batch();
  eventos.forEach((ev) => {
    const cpf = limparCnpj(ev && ev.cpf);
    const cnpjEstab = limparCnpj(ev && ev.cnpjEstab) || cnpjEstabPadrao;
    batch.set(loteRef.collection('eventos').doc(ev.id), {
      id: ev.id,
      tpEv: ev.cpf ? '4010' : '4099',
      cpf,
      nome: ev.nome || null,
      cnpjFonte,
      cnpjEstab,
      perApur: p && p.perApur || null,
      tpAmb,
      reciboDocId: cpf ? reinfReciboDocId({ tpAmb, perApur: p.perApur, cnpjEstab, cpf, ideEvtAdic: ev.ideEvtAdic }) : null,
      atualizado_em: new Date(),
    }, { merge: true });
  });
  await batch.commit();
}

async function registrarRetornoLoteReinf(db, protocolo, tpAmb, xml) {
  if (!db || !protocolo || !xml) return { eventos: [], recibosGravados: 0, duplicidades: 0 };
  const loteRef = db.collection('reinf_lotes').doc(String(protocolo));
  const eventos = parseRetornoEventos(xml);
  let recibosGravados = 0;
  let duplicidades = 0;
  for (const ret of eventos) {
    if (!ret.idEv) continue;
    const pendente = await loteRef.collection('eventos').doc(ret.idEv).get();
    const meta = pendente.exists ? (pendente.data() || {}) : {};
    await loteRef.collection('eventos').doc(ret.idEv).set({
      retorno: ret,
      retorno_at: new Date(),
    }, { merge: true });
    if (ret.codResp.includes('MS1254')) duplicidades++;
    if (ret.tpEv === '4010' && ret.nrRecArqBase && meta.cnpjFonte && meta.reciboDocId) {
      await db.collection('empresas').doc(meta.cnpjFonte).collection('reinf_eventos').doc(meta.reciboDocId).set({
        nrRecibo: ret.nrRecArqBase,
        protocolo,
        tpAmb,
        perApur: meta.perApur,
        cnpjEstab: meta.cnpjEstab,
        cpf: meta.cpf,
        nome: meta.nome || null,
        idEv: ret.idEv,
        atualizado_em: new Date(),
      }, { merge: true });
      recibosGravados++;
    }
  }
  return { eventos, recibosGravados, duplicidades };
}

function parseRetornoReinf(retorno) {
  const xml = String((retorno && retorno.xml) || '');
  return {
    cdResposta: (retorno && retorno.cdResposta) || extrairTagXml(xml, 'cdResposta'),
    descResposta: extrairTagXml(xml, 'descResposta'),
    protocolo: (retorno && retorno.protocolo) || extrairTagXml(xml, 'protocoloEnvio'),
    dhRecepcao: extrairTagXml(xml, 'dhRecepcao'),
    versaoAplicativoRecepcao: extrairTagXml(xml, 'versaoAplicativoRecepcao'),
    xml,
  };
}

function retornoReinfPendente(info) {
  const cd = String(info && info.cdResposta || '').trim();
  const desc = String(info && info.descResposta || '').toLowerCase();
  return cd === '1' || desc.includes('aguardando');
}

function retornoReinfComErro(info) {
  const xml = String(info && info.xml || '');
  const cd = String(info && info.cdResposta || '').trim();
  const desc = String(info && info.descResposta || '').toLowerCase();
  const codigos = extrairTagsXml(xml, 'codResp').filter(Boolean);
  const descricoes = extrairTagsXml(xml, 'dscResp').join(' ').toLowerCase();
  return cd === '7'
    || cd === '99'
    || codigos.length > 0
    || desc.includes('erro')
    || desc.includes('rejeit')
    || desc.includes('inval')
    || descricoes.includes('erro')
    || descricoes.includes('não existem');
}

function retornoR1000JaVigente(info) {
  const codigos = extrairTagsXml(info && info.xml, 'codResp').filter(Boolean);
  return codigos.length > 0 && codigos.every((codigo) => codigo === 'MS1005');
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── FASE 4 DO TÚNEL: transmissão via gateway do CFI ─────────────────────────
// REINF_TRANSMISSOR=gateway vira a chave; o default é 'local' e o caminho
// atual fica INTOCADO até o gateway provar em produção restrita. As duas
// funções abaixo têm o MESMO contrato dos pares locais — o resto do fluxo
// (parse, lote pendente, logs) não muda uma linha.
function tokenDaRequisicao(req) {
  const auth = String((req && req.headers && req.headers.authorization) || '');
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

async function assinarEEnviarLote(eventosXml, cert, loteContrib, tpAmb, req) {
  if (transmissorAtivo() === 'gateway') {
    // O evento vai SEM assinatura: quem assina (e abre o mTLS) é o CFI. A
    // confirmação de produção viaja quando tpAmb=1 — a trava de lá exige.
    return enviarLoteViaGateway({
      eventosXml, contribuinte: loteContrib, tpAmb,
      confirmoProducao: Number(tpAmb) === 1,
      token: tokenDaRequisicao(req),
    });
  }
  return enviarLote(eventosXml.map((xml) => assinarEventoReinf(xml, cert)), loteContrib, tpAmb);
}

async function consultarLoteOndeFoi(protocolo, tpAmb, req) {
  if (transmissorAtivo() === 'gateway') {
    return consultarLoteViaGateway({ protocolo, tpAmb, token: tokenDaRequisicao(req) });
  }
  return consultarLote(protocolo, tpAmb);
}

async function consultarLoteAteProcessar(protocolo, tpAmb, { tentativas = 10, intervaloMs = 3000, req = null } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    const retorno = await consultarLoteOndeFoi(protocolo, tpAmb, req);
    ultimo = {
      httpStatus: retorno.status,
      ...parseRetornoReinf(retorno),
    };
    if (!retornoReinfPendente(ultimo)) return ultimo;
    if (i < tentativas - 1) await esperar(intervaloMs);
  }
  return ultimo;
}

function adminReinfRequired(req, res, next) {
  if (!req.user || req.user.is_admin !== true) {
    return res.status(403).json({ ok: false, erro: 'Apenas administradores podem atualizar o certificado Reinf.' });
  }
  next();
}

function adminReinfCadastroRequired(req, res, next) {
  if (!req.user || req.user.is_admin !== true) {
    return res.status(403).json({ ok: false, erro: 'Apenas administradores podem alterar cadastro Reinf/dividendos ou disparar e-mails.' });
  }
  next();
}

function reinfToCents(valor) {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
  }
  let s = String(valor == null ? '' : valor).trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function reinfFromCents(centavos) {
  return Math.round(Number(centavos || 0)) / 100;
}

function reinfEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function reinfAplicacoesRegimeValido(regime) {
  return ['lucro_real', 'lucro_presumido', 'lucro_arbitrado', 'simples', 'isenta', 'imune', 'nao_informado'].includes(String(regime || ''));
}

function reinfAplicacoesTipoBeneficiarioValido(tipo) {
  return ['pj', 'pf'].includes(String(tipo || ''));
}

function reinfAplicacoesNumero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 1000000) / 1000000 : 0;
}

function reinfAplicacoesSanitizarItem(item) {
  const origem = item && item.regraIrrf || {};
  return {
    produto: String(item && item.produto || '').trim().slice(0, 300),
    tipo: String(item && item.tipo || '').trim().slice(0, 80),
    evento: String(item && item.evento || 'posicao').trim().slice(0, 40),
    dataAplicacao: String(item && item.dataAplicacao || '').trim().slice(0, 10),
    dataEvento: String(item && item.dataEvento || '').trim().slice(0, 10),
    valorAplicadoCentavos: reinfToCents(item && item.valorAplicado),
    valorBrutoCentavos: reinfToCents(item && item.valorBruto),
    valorLiquidoCentavos: reinfToCents(item && item.valorLiquido),
    rendimentoTotalCentavos: reinfToCents(item && item.rendimentoTotal),
    rendimentoPeriodoCentavos: reinfToCents(item && item.rendimentoPeriodo),
    irrfInformadoCentavos: reinfToCents(item && item.irrfInformado),
    irrfPeriodoCentavos: reinfToCents(item && item.irrfPeriodo),
    iofInformadoCentavos: reinfToCents(item && item.iofInformado),
    statusIrrf: String(origem.status || 'revisar').slice(0, 40),
    aliquotaIrrf: origem.aliquota == null ? null : reinfAplicacoesNumero(origem.aliquota),
    irrfEsperadoCentavos: origem.irrfEsperado == null ? null : reinfToCents(origem.irrfEsperado),
    tratamentoIrrf: String(origem.tratamento || '').slice(0, 80),
    explicacaoIrrf: String(origem.explicacao || '').slice(0, 600),
    origem: String(item && item.origem || '').slice(0, 300),
  };
}

function reinfAplicacoesResumo(itens) {
  const lista = Array.isArray(itens) ? itens : [];
  const somar = campo => lista.reduce((s, item) => s + Number(item[campo] || 0), 0);
  return {
    qtdInvestimentos: lista.length,
    valorAplicadoCentavos: somar('valorAplicadoCentavos'),
    valorBrutoCentavos: somar('valorBrutoCentavos'),
    valorLiquidoCentavos: somar('valorLiquidoCentavos'),
    rendimentoPeriodoCentavos: somar('rendimentoPeriodoCentavos'),
    irrfInformadoCentavos: somar('irrfInformadoCentavos'),
    irrfPeriodoCentavos: somar('irrfPeriodoCentavos'),
    iofInformadoCentavos: somar('iofInformadoCentavos'),
    pendencias: lista.filter(item => ['revisar', 'divergente'].includes(item.statusIrrf)).length,
    divergencias: lista.filter(item => item.statusIrrf === 'divergente').length,
  };
}

function reinfMicrosoft365Config() {
  const cfg = {
    tenantId: process.env.MS365_TENANT_ID || process.env.MICROSOFT_365_TENANT_ID || process.env.GRAPH_TENANT_ID || '',
    clientId: process.env.MS365_CLIENT_ID || process.env.MICROSOFT_365_CLIENT_ID || process.env.GRAPH_CLIENT_ID || '',
    clientSecret: process.env.MS365_CLIENT_SECRET || process.env.MICROSOFT_365_CLIENT_SECRET || process.env.GRAPH_CLIENT_SECRET || '',
    sender: process.env.MS365_SENDER_EMAIL || process.env.MICROSOFT_365_SENDER_EMAIL || process.env.GRAPH_REMETENTE || process.env.NOTIF_REMETENTE_EMAIL || '',
  };
  return { ...cfg, configured: !!(cfg.tenantId && cfg.clientId && cfg.clientSecret && cfg.sender) };
}

async function reinfObterTokenMicrosoft365() {
  const cfg = reinfMicrosoft365Config();
  if (!cfg.configured) {
    const err = new Error('Microsoft 365 não configurado. Use as mesmas variáveis do Consultor Fiscal: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET e GRAPH_REMETENTE/NOTIF_REMETENTE_EMAIL.');
    err.statusCode = 503;
    throw err;
  }
  const params = new URLSearchParams();
  params.set('client_id', cfg.clientId);
  params.set('client_secret', cfg.clientSecret);
  params.set('scope', 'https://graph.microsoft.com/.default');
  params.set('grant_type', 'client_credentials');
  const resp = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    const err = new Error(data.error_description || data.error || 'Falha ao autenticar no Microsoft 365 Graph.');
    err.statusCode = 502;
    throw err;
  }
  return { token: data.access_token, sender: cfg.sender };
}

async function reinfEnviarEmailMicrosoft365({ to, subject, html, text }) {
  if (!reinfEmailValido(to)) throw new Error(`E-mail inválido para envio Microsoft 365: ${to || '(vazio)'}`);
  const { token, sender } = await reinfObterTokenMicrosoft365();
  const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html || String(text || '').replace(/\n/g, '<br>') },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    const err = new Error(`Microsoft 365 recusou o envio para ${to}: HTTP ${resp.status}${detalhe ? ' - ' + detalhe.slice(0, 400) : ''}`);
    err.statusCode = 502;
    throw err;
  }
  return { ok: true, to, sender };
}

function reinfSaldoDocId({ cnpjFonte, cnpjEstab, natRend, cpf }) {
  return [
    limparCnpj(cnpjFonte),
    limparCnpj(cnpjEstab || cnpjFonte),
    limparCnpj(natRend),
    limparCnpj(cpf),
  ].filter(Boolean).join('_');
}

async function aplicarAcumuloIrrfAluguel(db, body, { persistir = false, meta = {} } = {}) {
  const payload = body || {};
  const natRend = limparCnpj(payload.natRend || '13002');
  const locadores = Array.isArray(payload.locadores) ? payload.locadores : [];
  if (natRend !== '13002' || !locadores.length) {
    return { ok: true, aplicavel: false, locadores, acumulos: [] };
  }

  const cnpjFonte = limparCnpj(payload.contribuinte && payload.contribuinte.nrInsc);
  const cnpjEstab = limparCnpj((payload.estabelecimento && payload.estabelecimento.nrInscEstab) || cnpjFonte);
  const perApur = String(payload.perApur || '').trim();
  if (cnpjFonte.length !== 14 || cnpjEstab.length !== 14 || !/^\d{4}-\d{2}$/.test(perApur)) {
    throw new Error('Dados insuficientes para aplicar acúmulo de IRRF: confira CNPJ fonte, estabelecimento e competência.');
  }

  const limiteCentavos = 1000;
  const saida = [];
  const acumulos = [];

  for (const locador of locadores) {
    const cpf = limparCnpj(locador && (locador.cpf || locador.cpfBenef));
    if (cpf.length !== 11) {
      saida.push(locador);
      continue;
    }

    const cnpjFonteLocador = limparCnpj(locador.cnpjFonte || (locador.contribuinte && locador.contribuinte.nrInsc) || cnpjFonte);
    const cnpjEstabLocador = limparCnpj(locador.cnpjEstab || (locador.estabelecimento && locador.estabelecimento.nrInscEstab) || cnpjEstab);
    const docId = reinfSaldoDocId({ cnpjFonte: cnpjFonteLocador, cnpjEstab: cnpjEstabLocador, natRend, cpf });
    const ref = db ? db.collection('reinf_saldos_irrf').doc(docId) : null;
    const snap = ref ? await ref.get() : null;
    const atual = snap && snap.exists ? (snap.data() || {}) : {};
    const competencias = atual.competencias && typeof atual.competencias === 'object' ? atual.competencias : {};
    const irrfMesCentavos = Math.max(0, reinfToCents(locador.irrf));
    const saldoAnteriorCentavos = Math.max(0, Number(atual.pendenteCentavos || 0));
    const jaPersistido = persistir
      && competencias[perApur]
      && Number(competencias[perApur].irrfMesCentavos || 0) === irrfMesCentavos;

    let irrfEnviadoCentavos;
    let saldoPendenteCentavos;
    let situacao;

    if (jaPersistido) {
      irrfEnviadoCentavos = Math.max(0, Number(competencias[perApur].irrfEnviadoCentavos || 0));
      saldoPendenteCentavos = saldoAnteriorCentavos;
      situacao = 'ja_persistido';
    } else {
      const totalCentavos = saldoAnteriorCentavos + irrfMesCentavos;
      if (totalCentavos > 0 && totalCentavos < limiteCentavos) {
        irrfEnviadoCentavos = 0;
        saldoPendenteCentavos = totalCentavos;
        situacao = 'acumulado';
      } else if (totalCentavos >= limiteCentavos) {
        irrfEnviadoCentavos = totalCentavos;
        saldoPendenteCentavos = 0;
        situacao = saldoAnteriorCentavos > 0 ? 'liberado_com_saldo' : 'normal';
      } else {
        irrfEnviadoCentavos = 0;
        saldoPendenteCentavos = 0;
        situacao = 'sem_irrf';
      }

      if (persistir && ref) {
        const novaCompetencia = {
          irrfMesCentavos,
          saldoAnteriorCentavos,
          irrfEnviadoCentavos,
          saldoPendenteCentavos,
          situacao,
          protocolo: meta.protocolo || null,
          atualizadoEm: new Date().toISOString(),
          usuario: meta.usuario || null,
        };
        await ref.set({
          cnpjFonte: cnpjFonteLocador,
          cnpjEstab: cnpjEstabLocador,
          natRend,
          cpf,
          nome: String(locador.nome || locador.nomeBenef || '').trim(),
          pendenteCentavos: saldoPendenteCentavos,
          competencias: { ...competencias, [perApur]: novaCompetencia },
          atualizadoEm: novaCompetencia.atualizadoEm,
          atualizadoPor: meta.usuario || null,
        }, { merge: false });
      }
    }

    saida.push({
      ...locador,
      irrf: reinfFromCents(irrfEnviadoCentavos),
      irrfOriginal: reinfFromCents(irrfMesCentavos),
      saldoIrrfAnterior: reinfFromCents(saldoAnteriorCentavos),
      saldoIrrfPendente: reinfFromCents(saldoPendenteCentavos),
      irrfAcumuladoAplicado: reinfFromCents(Math.max(0, irrfEnviadoCentavos - irrfMesCentavos)),
    });

    acumulos.push({
      cpf,
      nome: String(locador.nome || locador.nomeBenef || '').trim(),
      cnpjFonte: cnpjFonteLocador,
      cnpjEstab: cnpjEstabLocador,
      irrfMes: reinfFromCents(irrfMesCentavos),
      saldoAnterior: reinfFromCents(saldoAnteriorCentavos),
      irrfEnviado: reinfFromCents(irrfEnviadoCentavos),
      saldoPendente: reinfFromCents(saldoPendenteCentavos),
      situacao,
      jaPersistido,
    });
  }

  return { ok: true, aplicavel: true, locadores: saida, acumulos, persistido: !!persistir };
}

async function registrarLog(db, req, acao, detalhes) {
  if (!db) return;
  try {
    await db.collection('reinf_logs').add({
      acao,
      usuario: req.user && req.user.email ? req.user.email : null,
      uid: req.user && req.user.uid ? req.user.uid : null,
      detalhes: detalhes || {},
      criado_em: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[reinf/log] falha ao gravar log:', err.message);
  }
}

/**
 * `?naturezas=CNPJ:codigo,CNPJ:codigo` → Map(cnpj → codigo).
 *
 * Só o FORMATO é conferido aqui; se o código existe na Tabela 01 quem decide é
 * `buscarNatureza` na apuração — código fora da tabela é RECUSADO lá, e o
 * beneficiário continua pendente em vez de entrar no evento com número torto.
 */
/**
 * `?indAquis=CPF:codigo,CPF:codigo` → objeto { cpf: codigo }.
 *
 * Só o FORMATO é conferido. Se o código existe na tabela oficial da EFD-Reinf,
 * NINGUÉM aqui pode afirmar — a tabela não está em nenhum dos dois apps. Por
 * isso o valor sai carimbado como "informado", nunca como "conferido".
 */
// Chave é o DOCUMENTO do produtor — CPF **ou** CNPJ. Produtor rural PF com
// CNPJ existe (Com. CAT 45/2008) e aceitar só 11 dígitos fazia o indicador
// informado na tela sumir justo de quem mais precisa de conferência.
function mapaIndAquisInformados(valor) {
  const out = {};
  String(valor || '').split(',').forEach((par) => {
    const [doc, codigo] = String(par || '').split(':');
    const d = limparCnpj(doc);
    const cod = String(codigo || '').trim();
    if ((d.length === 11 || d.length === 14) && /^[0-9]{1,2}$/.test(cod)) out[d] = cod;
  });
  return out;
}

function mapaNaturezasInformadas(valor) {
  const out = new Map();
  String(valor || '').split(',').forEach((par) => {
    const [cnpj, codigo] = String(par || '').split(':');
    const c = limparCnpj(cnpj);
    const cod = String(codigo || '').trim();
    if (c.length === 14 && /^[0-9]{5}$/.test(cod)) out.set(c, cod);
  });
  return out;
}

function registrarRotasReinf(app, { db } = {}) {
  const router = express.Router();

  router.get('/versao', (req, res) => {
    res.json({
      ok: true,
      leiaute: LEIAUTE_REINF,
      xsdR4010: REVISAO_XSD_R4010,
      loteXsd: 'v1_00_00',
      modulo: 'EFD-Reinf R-4000 / Informes',
    });
  });

  router.get('/aplicacoes/empresa/:cnpj', async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para cadastro de aplicações financeiras.');
      const cnpj = limparCnpj(req.params.cnpj);
      if (cnpj.length !== 14) throw new Error('CNPJ inválido.');
      const snap = await db.collection('empresas').doc(cnpj).get();
      if (!snap.exists) return res.status(404).json({ ok: false, erro: 'Empresa não encontrada.' });
      const dados = snap.data() || {};
      const apl = dados.reinfAplicacoes || {};
      res.json({
        ok: true,
        cnpj,
        empresa: dados.razao_social || dados.empresa || dados.nome || null,
        emailSolicitacao: apl.emailSolicitacao || dados.email_reinf || dados.email || '',
        responsavel: apl.responsavel || '',
        regimeTributario: reinfAplicacoesRegimeValido(apl.regimeTributario) ? apl.regimeTributario : 'nao_informado',
        tipoBeneficiario: reinfAplicacoesTipoBeneficiarioValido(apl.tipoBeneficiario) ? apl.tipoBeneficiario : 'pj',
        solicitarMensalmente: apl.solicitarMensalmente !== false,
        versaoRegras: VERSAO_REGRAS_APLICACOES,
        fonteRegras: FONTE_REGRAS_APLICACOES,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.put('/aplicacoes/empresa/:cnpj', adminReinfCadastroRequired, async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para cadastro de aplicações financeiras.');
      const cnpj = limparCnpj(req.params.cnpj);
      if (cnpj.length !== 14) throw new Error('CNPJ inválido.');
      const body = req.body || {};
      const email = String(body.emailSolicitacao || '').trim();
      const regimeTributario = String(body.regimeTributario || 'nao_informado').trim();
      const tipoBeneficiario = String(body.tipoBeneficiario || 'pj').trim();
      if (email && !reinfEmailValido(email)) throw new Error('E-mail de solicitação de extratos inválido.');
      if (!reinfAplicacoesRegimeValido(regimeTributario)) throw new Error('Regime tributário inválido para aplicações financeiras.');
      if (!reinfAplicacoesTipoBeneficiarioValido(tipoBeneficiario)) throw new Error('Tipo de beneficiário inválido.');
      await db.collection('empresas').doc(cnpj).set({
        reinfAplicacoes: {
          emailSolicitacao: email,
          responsavel: String(body.responsavel || '').trim().slice(0, 160),
          regimeTributario,
          tipoBeneficiario,
          solicitarMensalmente: body.solicitarMensalmente !== false,
          atualizado_em: new Date(),
          atualizado_por_uid: req.user && req.user.uid || null,
          atualizado_por_email: req.user && req.user.email || null,
        },
      }, { merge: true });
      await registrarLog(db, req, 'aplicacoes_salvar_cadastro', { cnpj, email: !!email, regimeTributario, tipoBeneficiario });
      res.json({ ok: true, cnpj });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/aplicacoes/registrar', adminReinfCadastroRequired, async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para registrar análise de aplicações financeiras.');
      const body = req.body || {};
      const cnpj = limparCnpj(body.cnpj || body.cnpjEmpresa);
      const competencia = String(body.competencia || '').trim();
      const hashArquivo = String(body.hashArquivo || '').toLowerCase().replace(/[^a-f0-9]/g, '');
      const nomeArquivo = String(body.nomeArquivo || '').trim().slice(0, 300);
      const regimeTributario = String(body.regimeTributario || 'nao_informado').trim();
      const tipoBeneficiario = String(body.tipoBeneficiario || 'pj').trim();
      if (cnpj.length !== 14) throw new Error('Selecione uma empresa com CNPJ válido antes de registrar a análise.');
      if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error('Competência inválida. Use AAAA-MM.');
      if (hashArquivo.length < 32) throw new Error('Não foi possível validar a identidade do arquivo analisado.');
      if (!nomeArquivo) throw new Error('Nome do arquivo não informado.');
      if (!reinfAplicacoesRegimeValido(regimeTributario)) throw new Error('Regime tributário inválido.');
      if (!reinfAplicacoesTipoBeneficiarioValido(tipoBeneficiario)) throw new Error('Tipo de beneficiário inválido.');
      if (!Array.isArray(body.investimentos) || !body.investimentos.length) throw new Error('A análise não possui investimentos para registrar.');
      if (body.investimentos.length > 500) throw new Error('Análise acima do limite de 500 investimentos por arquivo.');

      const investimentos = body.investimentos.map(reinfAplicacoesSanitizarItem);
      if (investimentos.some(item => !item.produto)) throw new Error('Existe investimento sem identificação do produto.');
      const resumo = reinfAplicacoesResumo(investimentos);
      const docId = `${competencia.replace('-', '')}_${hashArquivo.slice(0, 32)}`;
      const ref = db.collection('empresas').doc(cnpj).collection('reinf_aplicacoes_analises').doc(docId);
      const anterior = await ref.get();
      await ref.set({
        cnpj,
        competencia,
        nomeArquivo,
        hashArquivo,
        tamanhoArquivo: Math.max(0, Number(body.tamanhoArquivo) || 0),
        layout: String(body.layout || '').slice(0, 160),
        instituicao: String(body.instituicao || '').slice(0, 200),
        regimeTributario,
        tipoBeneficiario,
        versaoRegras: VERSAO_REGRAS_APLICACOES,
        fonteRegras: FONTE_REGRAS_APLICACOES,
        resumo,
        investimentos,
        atualizado_em: new Date(),
        atualizado_por_uid: req.user && req.user.uid || null,
        atualizado_por_email: req.user && req.user.email || null,
        criado_em: anterior.exists && anterior.data().criado_em ? anterior.data().criado_em : new Date(),
      }, { merge: true });
      await registrarLog(db, req, anterior.exists ? 'aplicacoes_atualizar_analise' : 'aplicacoes_registrar_analise', {
        cnpj,
        competencia,
        docId,
        nomeArquivo,
        qtdInvestimentos: resumo.qtdInvestimentos,
        pendencias: resumo.pendencias,
      });
      res.json({ ok: true, docId, atualizado: anterior.exists, resumo });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/aplicacoes/solicitar', adminReinfCadastroRequired, async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para solicitar extratos de aplicações.');
      const body = req.body || {};
      const competencia = String(body.competencia || '').trim();
      const cnpjs = Array.isArray(body.cnpjs) ? [...new Set(body.cnpjs.map(limparCnpj).filter(c => c.length === 14))] : [];
      if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error('Competência inválida para solicitação.');
      if (!cnpjs.length) throw new Error('Informe ao menos uma empresa para enviar a solicitação. O envio em massa não é presumido automaticamente.');
      if (cnpjs.length > 100) throw new Error('Limite de 100 empresas por solicitação.');
      const enviados = [];
      const ignorados = [];
      for (const cnpj of cnpjs) {
        const snap = await db.collection('empresas').doc(cnpj).get();
        if (!snap.exists) {
          ignorados.push({ cnpj, motivo: 'empresa não encontrada' });
          continue;
        }
        const empresa = snap.data() || {};
        const cadastro = empresa.reinfAplicacoes || {};
        const email = String(cadastro.emailSolicitacao || empresa.email_reinf || empresa.email || '').trim();
        if (cadastro.solicitarMensalmente === false) {
          ignorados.push({ cnpj, motivo: 'solicitação mensal desativada' });
          continue;
        }
        if (!reinfEmailValido(email)) {
          ignorados.push({ cnpj, motivo: 'sem e-mail válido para aplicações' });
          continue;
        }
        const modelo = emailSolicitacaoAplicacoes({
          empresa: empresa.razao_social || empresa.empresa || empresa.nome || cnpj,
          responsavel: cadastro.responsavel,
          competencia,
          prazo: body.prazo,
        });
        const envio = await reinfEnviarEmailMicrosoft365({ to: email, subject: modelo.assunto, html: modelo.html, text: modelo.texto });
        enviados.push({ cnpj, email, sender: envio.sender });
        await db.collection('empresas').doc(cnpj).collection('reinf_emails').add({
          tipo: 'solicitacao_extratos_aplicacoes',
          competencia,
          email,
          assunto: modelo.assunto,
          enviado_em: new Date(),
          enviado_por_uid: req.user && req.user.uid || null,
          enviado_por_email: req.user && req.user.email || null,
        });
      }
      await registrarLog(db, req, 'aplicacoes_solicitar_email', { competencia, cnpjs: cnpjs.length, enviados: enviados.length, ignorados: ignorados.length });
      res.json({ ok: true, enviados, ignorados });
    } catch (err) {
      respostaErro(res, err.statusCode || 400, err);
    }
  });

  router.get('/dividendos/microsoft365/status', adminReinfCadastroRequired, (req, res) => {
    const cfg = reinfMicrosoft365Config();
    res.json({ ok: true, configured: cfg.configured, sender: cfg.sender || null });
  });

  router.get('/dividendos/empresa/:cnpj', async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para cadastro de dividendos.');
      const cnpj = limparCnpj(req.params.cnpj);
      if (cnpj.length !== 14) throw new Error('CNPJ inválido.');
      const snap = await db.collection('empresas').doc(cnpj).get();
      if (!snap.exists) return res.status(404).json({ ok: false, erro: 'Empresa não encontrada.' });
      const dados = snap.data() || {};
      const div = dados.reinfDividendos || {};
      res.json({
        ok: true,
        cnpj,
        empresa: dados.razao_social || dados.empresa || dados.nome || null,
        emailSolicitacaoReinf: div.emailSolicitacaoReinf || dados.email_reinf || dados.email || '',
        responsavelDividendos: div.responsavelDividendos || '',
        ataValorTotal: reinfFromCents(Number(div.ataValorTotalCentavos || 0)),
        ataSaldo: reinfFromCents(Number(div.ataSaldoCentavos || 0)),
        ataAprovadaAte2025: div.ataAprovadaAte2025 === true,
        ataValidaAte2028: div.ataValidaAte2028 !== false,
        socios: Array.isArray(div.socios) ? div.socios : [],
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.put('/dividendos/empresa/:cnpj', adminReinfCadastroRequired, async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para cadastro de dividendos.');
      const cnpj = limparCnpj(req.params.cnpj);
      if (cnpj.length !== 14) throw new Error('CNPJ inválido.');
      const body = req.body || {};
      const email = String(body.emailSolicitacaoReinf || '').trim();
      if (email && !reinfEmailValido(email)) throw new Error('E-mail de solicitação inválido.');
      const socios = Array.isArray(body.socios) ? body.socios.map((s) => ({
        cpf: limparCnpj(s.cpf || s.cpfBenef),
        nome: String(s.nome || s.nomeBenef || '').trim(),
        email: String(s.email || '').trim(),
        percentual: Number(String(s.percentual || 0).replace(',', '.')) || 0,
      })).filter((s) => s.cpf || s.nome || s.percentual) : [];
      const update = {
        email_reinf: email || null,
        reinfDividendos: {
          emailSolicitacaoReinf: email || '',
          responsavelDividendos: String(body.responsavelDividendos || '').trim(),
          ataValorTotalCentavos: reinfToCents(body.ataValorTotal),
          ataSaldoCentavos: reinfToCents(body.ataSaldo),
          ataAprovadaAte2025: body.ataAprovadaAte2025 === true || body.ataAprovadaAte2025 === 'sim',
          ataValidaAte2028: body.ataValidaAte2028 !== false && body.ataValidaAte2028 !== 'nao',
          socios,
          atualizado_em: new Date(),
          atualizado_por_uid: req.user && req.user.uid || null,
          atualizado_por_email: req.user && req.user.email || null,
        },
      };
      await db.collection('empresas').doc(cnpj).set(update, { merge: true });
      await registrarLog(db, req, 'dividendos_salvar_cadastro', { cnpj, socios: socios.length, email: !!email });
      res.json({ ok: true, cnpj, socios: socios.length });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/dividendos/calcular', async (req, res) => {
    try {
      const body = req.body || {};
      const cnpj = limparCnpj(body.cnpj || body.cnpjFonte || body.cnpjEmpresa);
      let cadastro = {};
      if (db && cnpj.length === 14) {
        const snap = await db.collection('empresas').doc(cnpj).get();
        cadastro = snap.exists ? ((snap.data() || {}).reinfDividendos || {}) : {};
      }
      const resultado = calcularDividendos({
        ...body,
        cnpj,
        socios: Array.isArray(body.socios) && body.socios.length ? body.socios : cadastro.socios,
        ataValorTotal: body.ataValorTotal != null ? body.ataValorTotal : reinfFromCents(cadastro.ataValorTotalCentavos),
        ataSaldoAnterior: body.ataSaldoAnterior != null ? body.ataSaldoAnterior : (body.ataSaldo != null ? body.ataSaldo : reinfFromCents(cadastro.ataSaldoCentavos)),
        ataAprovadaAte2025: body.ataAprovadaAte2025 != null ? body.ataAprovadaAte2025 : cadastro.ataAprovadaAte2025,
        ataValidaAte2028: body.ataValidaAte2028 != null ? body.ataValidaAte2028 : cadastro.ataValidaAte2028,
      });
      const locadores = locadoresDividendosParaR4010(resultado, {
        cnpjFonte: body.cnpjFonte || cnpj,
        cnpjEstab: body.cnpjEstab || body.cnpjFonte || cnpj,
        dtPagamento: body.dtPagamento,
      });
      res.json({ ok: true, resultado, locadores });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/dividendos/registrar', adminReinfCadastroRequired, async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para registrar dividendos.');
      const body = req.body || {};
      const resultado = calcularDividendos(body);
      const cnpj = limparCnpj(resultado.cnpj);
      const docId = String(resultado.competencia || '').replace(/\D/g, '');
      await db.collection('empresas').doc(cnpj).collection('reinf_dividendos').doc(docId).set({
        ...resultado,
        registrado_em: new Date(),
        registrado_por_uid: req.user && req.user.uid || null,
        registrado_por_email: req.user && req.user.email || null,
      }, { merge: true });
      await db.collection('empresas').doc(cnpj).set({
        reinfDividendos: {
          ataSaldoCentavos: reinfToCents(resultado.ataSaldoApos),
          atualizado_em: new Date(),
          atualizado_por_email: req.user && req.user.email || null,
        },
      }, { merge: true });
      await registrarLog(db, req, 'dividendos_registrar_competencia', {
        cnpj,
        competencia: resultado.competencia,
        totalIrrf: resultado.totalIrrf,
        ataSaldoApos: resultado.ataSaldoApos,
      });
      res.json({ ok: true, resultado });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/dividendos/solicitar', adminReinfCadastroRequired, async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para disparo de solicitações.');
      const body = req.body || {};
      const competenciaReferencia = String(body.competenciaReferencia || '').trim();
      const cnpjs = Array.isArray(body.cnpjs) ? body.cnpjs.map(limparCnpj).filter((c) => c.length === 14) : [];
      const empresas = [];
      if (cnpjs.length) {
        for (const cnpj of cnpjs) {
          const snap = await db.collection('empresas').doc(cnpj).get();
          if (snap.exists) empresas.push({ cnpj, ...snap.data() });
        }
      } else {
        const snap = await db.collection('empresas').get();
        snap.forEach((doc) => empresas.push({ cnpj: doc.id, ...doc.data() }));
      }

      const enviados = [];
      const ignorados = [];
      for (const empresa of empresas) {
        const div = empresa.reinfDividendos || {};
        const email = String(div.emailSolicitacaoReinf || empresa.email_reinf || empresa.email || '').trim();
        if (!reinfEmailValido(email)) {
          ignorados.push({ cnpj: empresa.cnpj, motivo: 'sem e-mail Reinf válido' });
          continue;
        }
        const modelo = emailSolicitacaoDividendos({ empresa, competenciaReferencia });
        const envio = await reinfEnviarEmailMicrosoft365({
          to: email,
          subject: modelo.assunto,
          html: modelo.html,
          text: modelo.texto,
        });
        enviados.push({ cnpj: empresa.cnpj, email, sender: envio.sender });
        await db.collection('empresas').doc(limparCnpj(empresa.cnpj)).collection('reinf_emails').add({
          tipo: 'solicitacao_dividendos',
          competenciaReferencia,
          email,
          assunto: modelo.assunto,
          enviado_em: new Date(),
          enviado_por_uid: req.user && req.user.uid || null,
          enviado_por_email: req.user && req.user.email || null,
        });
      }
      await registrarLog(db, req, 'dividendos_solicitar_email', {
        competenciaReferencia,
        enviados: enviados.length,
        ignorados: ignorados.length,
      });
      res.json({ ok: true, enviados, ignorados });
    } catch (err) {
      respostaErro(res, err.statusCode || 400, err);
    }
  });

  router.get('/certificado', async (req, res) => {
    try {
      const c = await loadCertificado();
      res.json({ ok: true, titular: c.titular, validade: c.notAfter, version: c.version });
    } catch (err) {
      respostaErro(res, 502, err);
    }
  });

  router.post('/certificado', adminReinfRequired, async (req, res) => {
    try {
      const body = req.body || {};
      const filename = String(body.filename || '').trim();
      const senha = String(body.password || '');
      const base64 = String(body.pfxBase64 || '').replace(/^data:.*?;base64,/, '');
      if (!filename.match(/\.(pfx|p12)$/i)) {
        return res.status(400).json({ ok: false, erro: 'Envie um certificado A1 no formato .pfx ou .p12.' });
      }
      if (!base64) {
        return res.status(400).json({ ok: false, erro: 'Arquivo do certificado nao recebido.' });
      }
      const pfxBuffer = Buffer.from(base64, 'base64');
      if (!pfxBuffer.length || pfxBuffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({ ok: false, erro: 'Certificado invalido ou acima de 8 MB.' });
      }
      const salvo = await salvarCertificadoUpload({ pfxBuffer, password: senha });
      await registrarLog(db, req, 'certificado_upload', {
        filename,
        titular: salvo.titular || null,
        validade: salvo.notAfter || null,
        project: salvo.project,
        secretName: salvo.secretName,
      });
      res.json({
        ok: true,
        titular: salvo.titular,
        validade: salvo.notAfter,
        version: salvo.version,
        project: salvo.project,
        secretName: salvo.secretName,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/r1000', (req, res) => {
    try {
      res.json({ ok: true, leiaute: LEIAUTE_REINF, ...gerarR1000(req.body || {}) });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/r4010', async (req, res) => {
    try {
      const body = req.body || {};
      const tpAmb = Number(body.tpAmb || 2);
      const recibosR4010 = await buscarRecibosR4010(db, body, tpAmb);
      const eventos = gerarEventosR4010DaPlanilha({
        ...body,
        locadores: aplicarRecibosLocadores(body, tpAmb, recibosR4010),
      });
      await registrarLog(db, req, 'gerar_r4010', {
        contribuinte: limparCnpj(body && body.contribuinte && body.contribuinte.nrInsc),
        perApur: body && body.perApur,
        qtdEventos: eventos.length,
        retificacoesR4010: eventos.filter((e) => e.nrRecibo).length,
      });
      res.json({
        ok: true,
        leiaute: LEIAUTE_REINF,
        qtdEventos: eventos.length,
        retificacoesR4010: eventos.filter((e) => e.nrRecibo).length,
        eventos: eventos.map((e) => ({ id: e.id, cpf: e.cpf, nome: e.nome, xml: e.xml })),
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/recibos-r4010', async (req, res) => {
    try {
      if (!db) throw new Error('Banco de dados indisponível para gravar recibo R-4010.');
      const body = req.body || {};
      const tpAmb = Number(body.tpAmb || 2);
      const perApur = String(body.perApur || '').trim();
      const cnpjFonte = limparCnpj(body.contribuinte && body.contribuinte.nrInsc);
      const cnpjEstab = limparCnpj((body.estabelecimento && body.estabelecimento.nrInscEstab) || body.cnpjEstab || cnpjFonte);
      const cpf = limparCnpj(body.cpf || body.cpfBenef);
      const nome = String(body.nome || body.nomeBenef || '').trim();
      const nrRecibo = String(body.nrRecibo || body.nrReciboR4010 || '').trim();
      const ideEvtAdic = String(body.ideEvtAdic || '').trim();
      if (![1, 2].includes(tpAmb)) throw new Error('Ambiente Reinf inválido para recibo R-4010.');
      if (!/^\d{4}-\d{2}$/.test(perApur)) throw new Error('Competência do recibo deve estar no formato AAAA-MM.');
      if (cnpjFonte.length !== 14) throw new Error('CNPJ fonte pagadora inválido para recibo R-4010.');
      if (cnpjEstab.length !== 14) throw new Error('CNPJ estabelecimento inválido para recibo R-4010.');
      if (cpf.length !== 11) throw new Error('CPF do beneficiário inválido para recibo R-4010.');
      if (!/^[A-Za-z0-9_.-]{10,80}$/.test(nrRecibo)) throw new Error('Número de recibo R-4010 inválido.');

      const docId = reinfReciboDocId({ tpAmb, perApur, cnpjEstab, cpf, ideEvtAdic });
      await db.collection('empresas').doc(cnpjFonte).collection('reinf_eventos').doc(docId).set({
        nrRecibo,
        tpAmb,
        perApur,
        cnpjFonte,
        cnpjEstab,
        cpf,
        nome: nome || null,
        ideEvtAdic: ideEvtAdic || null,
        origem: 'manual',
        atualizado_em: new Date(),
        atualizado_por_uid: req.user && req.user.uid || null,
        atualizado_por_email: req.user && req.user.email || null,
      }, { merge: true });
      await registrarLog(db, req, 'registrar_recibo_r4010_manual', {
        contribuinte: cnpjFonte,
        cnpjEstab,
        cpf,
        perApur,
        tpAmb,
        docId,
      });
      res.json({ ok: true, docId, nrRecibo });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/acumulo-irrf', async (req, res) => {
    try {
      const body = req.body || {};
      const persistir = body.persistir === true;
      const resultado = await aplicarAcumuloIrrfAluguel(db, body, {
        persistir,
        meta: {
          protocolo: body.protocolo || null,
          usuario: req.user && req.user.email ? req.user.email : null,
        },
      });
      await registrarLog(db, req, persistir ? 'persistir_acumulo_irrf' : 'simular_acumulo_irrf', {
        contribuinte: limparCnpj(body.contribuinte && body.contribuinte.nrInsc),
        perApur: body.perApur,
        natRend: body.natRend || '13002',
        qtdLocadores: Array.isArray(body.locadores) ? body.locadores.length : 0,
        qtdAcumulos: resultado.acumulos ? resultado.acumulos.length : 0,
      });
      res.json(resultado);
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/r4010/unitario', (req, res) => {
    try {
      res.json({ ok: true, leiaute: LEIAUTE_REINF, ...gerarR4010(req.body || {}) });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/r4099', (req, res) => {
    try {
      res.json({ ok: true, leiaute: LEIAUTE_REINF, ...gerarR4099(req.body || {}) });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.post('/transmitir', async (req, res) => {
    try {
      const p = req.body || {};
      const tpAmb = Number(p.tpAmb || 2);
      // Em modo gateway o A1 local NEM É CARREGADO: é o que permite apagar o
      // reinf-cert-a1 deste projeto quando o gateway estiver provado — se a
      // transmissão ainda dependesse do load, apagar o secret a quebraria.
      const cert = transmissorAtivo() === 'gateway' ? null : await loadCertificado();
      const loteContrib = normalizarContribuinteLote(p.loteContribuinte || p.contribuinte);

      let retornoR1000 = null;
      let protocoloR1000 = null;
      if (p.incluirR1000 !== false) {
        const r1000 = gerarR1000({
          contribuinte: p.contribuinte,
          tpAmb,
          iniValid: p.iniValid || p.perApur,
          fimValid: p.fimValid,
          classTrib: p.classTrib,
          indEscrituracao: p.indEscrituracao,
          indDesoneracao: p.indDesoneracao,
          indAcordoIsenMulta: p.indAcordoIsenMulta,
          indSitPJ: p.indSitPJ,
          contato: p.contato || p.respInfo,
          seq: 1,
        });
        const envioR1000 = await assinarEEnviarLote([r1000.xml], cert, loteContrib, tpAmb, req);
        const infoEnvioR1000 = parseRetornoReinf(envioR1000);
        protocoloR1000 = infoEnvioR1000.protocolo;
        retornoR1000 = protocoloR1000
          ? await consultarLoteAteProcessar(protocoloR1000, tpAmb, { req })
          : { httpStatus: envioR1000.status, ...infoEnvioR1000 };

        await registrarLog(db, req, 'transmitir_r1000_previo', {
          contribuinte: limparCnpj(loteContrib && loteContrib.nrInsc),
          tpAmb,
          protocolo: protocoloR1000 || null,
          httpStatus: envioR1000.status,
          cdResposta: retornoR1000.cdResposta || null,
        });

        const r1000JaVigente = retornoR1000JaVigente(retornoR1000);
        if (!retornoR1000 || retornoReinfPendente(retornoR1000) || (retornoReinfComErro(retornoR1000) && !r1000JaVigente)) {
          return res.json({
            ok: false,
            etapa: 'r1000',
            motivo: retornoReinfPendente(retornoR1000)
              ? 'R-1000 ainda aguardando processamento. Consulte o protocolo e transmita o movimento após o aceite.'
              : 'R-1000 não foi aceito pela Receita. O movimento R-4010/R-4099 não foi transmitido para evitar rejeição em lote.',
            httpStatus: retornoR1000.httpStatus || envioR1000.status,
            protocolo: protocoloR1000,
            protocoloR1000,
            cdResposta: retornoR1000.cdResposta,
            descResposta: retornoR1000.descResposta,
            dhRecepcao: retornoR1000.dhRecepcao,
            versaoAplicativoRecepcao: retornoR1000.versaoAplicativoRecepcao,
            xmlRetorno: retornoR1000.xml,
          });
        }
      }

      const recibosR4010 = await buscarRecibosR4010(db, p, tpAmb);
      const locadoresComRecibo = aplicarRecibosLocadores(p, tpAmb, recibosR4010);
      let seq = p.incluirR1000 !== false ? 2 : 1;
      const r4010 = gerarEventosR4010DaPlanilha({
        contribuinte: p.contribuinte,
        estabelecimento: p.estabelecimento,
        perApur: p.perApur,
        tpAmb,
        dtPagamento: p.dtPagamento,
        natRend: p.natRend,
        locadores: locadoresComRecibo,
        seqInicial: seq,
      });
      seq += r4010.length;
      const r4099 = gerarR4099({
        contribuinte: p.contribuinte,
        perApur: p.perApur,
        tpAmb,
        fechRet: p.fechRet,
        respInfo: p.respInfo,
        seq,
      });
      const eventosMovimento = [...r4010, r4099];
      const retorno = await assinarEEnviarLote(eventosMovimento.map((e) => e.xml), cert, loteContrib, tpAmb, req);
      const infoRetorno = parseRetornoReinf(retorno);
      if (infoRetorno.protocolo) {
        await registrarLoteReinfPendente(db, req, infoRetorno.protocolo, eventosMovimento, {
          ...p,
          locadores: locadoresComRecibo,
        }, tpAmb);
      }
      await registrarLog(db, req, 'transmitir_lote', {
        contribuinte: limparCnpj(loteContrib && loteContrib.nrInsc),
        tpAmb,
        protocolo: infoRetorno.protocolo || null,
        httpStatus: retorno.status,
        cdResposta: infoRetorno.cdResposta || null,
        qtdEventos: eventosMovimento.length,
        retificacoesR4010: recibosR4010.size,
        protocoloR1000: protocoloR1000 || null,
      });
      res.json({
        ok: retorno.status === 201,
        etapa: 'movimento',
        httpStatus: retorno.status,
        protocolo: infoRetorno.protocolo,
        protocoloR1000,
        retornoR1000,
        cdResposta: infoRetorno.cdResposta,
        descResposta: infoRetorno.descResposta,
        dhRecepcao: infoRetorno.dhRecepcao,
        versaoAplicativoRecepcao: infoRetorno.versaoAplicativoRecepcao,
        qtdEventos: eventosMovimento.length,
        retificacoesR4010: recibosR4010.size,
        ids: eventosMovimento.map((e) => e.id),
        xmlRetorno: infoRetorno.xml,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/reinf/gateway-teste — A PROVA DA FASE 4, a um clique.
  //
  // Transmite APENAS o R-1000 em PRODUÇÃO RESTRITA (tpAmb=2 forçado) pelo
  // gateway do CFI, independente do REINF_TRANSMISSOR — a chave principal
  // continua em 'local' e o caminho de produção não é tocado. Se voltar
  // protocolo e o processamento aceitar (ou responder MS1005 "já vigente",
  // que também prova o círculo), o gateway está provado e o reinf-cert-a1
  // pode ser aposentado.
  // ──────────────────────────────────────────────────────────────────────────
  router.post('/gateway-teste', async (req, res) => {
    try {
      const p = req.body || {};
      const loteContrib = normalizarContribuinteLote(p.loteContribuinte || p.contribuinte);
      const token = tokenDaRequisicao(req);

      const r1000 = gerarR1000({
        contribuinte: p.contribuinte,
        tpAmb: 2,
        iniValid: p.iniValid || p.perApur,
        fimValid: p.fimValid,
        classTrib: p.classTrib,
        indEscrituracao: p.indEscrituracao,
        indDesoneracao: p.indDesoneracao,
        indAcordoIsenMulta: p.indAcordoIsenMulta,
        indSitPJ: p.indSitPJ,
        contato: p.contato || p.respInfo,
        seq: 1,
      });

      const envio = await enviarLoteViaGateway({
        eventosXml: [r1000.xml], contribuinte: loteContrib, tpAmb: 2, token,
      });
      const infoEnvio = parseRetornoReinf(envio);

      let consulta = null;
      if (infoEnvio.protocolo) {
        for (let i = 0; i < 10; i++) {
          const retorno = await consultarLoteViaGateway({ protocolo: infoEnvio.protocolo, tpAmb: 2, token });
          consulta = { httpStatus: retorno.status, ...parseRetornoReinf(retorno) };
          if (!retornoReinfPendente(consulta)) break;
          if (i < 9) await esperar(3000);
        }
      }

      await registrarLog(db, req, 'gateway_teste', {
        contribuinte: limparCnpj(loteContrib && loteContrib.nrInsc),
        tpAmb: 2,
        protocolo: infoEnvio.protocolo || null,
        httpStatus: envio.status,
        cdResposta: (consulta && consulta.cdResposta) || null,
      });

      res.json({
        ok: true,
        viaGateway: true,
        tpAmb: 2,
        httpStatus: envio.status,
        protocolo: infoEnvio.protocolo || null,
        envio: infoEnvio,
        consulta,
        veredito: !infoEnvio.protocolo
          ? 'SEM PROTOCOLO: o gateway falou com a Receita mas o lote não foi recebido — veja o XML de envio.'
          : (consulta && retornoR1000JaVigente(consulta))
            ? 'PROVADO: R-1000 já vigente na Receita (MS1005) — o gateway assinou, transmitiu e a Receita reconheceu o contribuinte.'
            : (consulta && !retornoReinfComErro(consulta))
              ? 'PROVADO: lote aceito em produção restrita via gateway.'
              : (consulta && retornoReinfPendente(consulta))
                ? 'PROTOCOLO RECEBIDO, processamento ainda pendente — consulte o protocolo em instantes.'
                : 'Protocolo recebido mas o processamento apontou ocorrências — veja o XML da consulta.',
        xmlEnvio: envio.xml,
        xmlConsulta: consulta && consulta.xml,
      });
    } catch (err) {
      respostaErro(res, err.statusCode || 400, err);
    }
  });

  router.get('/lote/:protocolo', async (req, res) => {
    try {
      const tpAmb = Number(req.query.tpAmb || 2);
      const retorno = await consultarLoteOndeFoi(req.params.protocolo, tpAmb, req);
      const infoRetorno = parseRetornoReinf(retorno);
      const persistencia = await registrarRetornoLoteReinf(db, req.params.protocolo, tpAmb, infoRetorno.xml);
      await registrarLog(db, req, 'consultar_lote', {
        protocolo: req.params.protocolo,
        tpAmb,
        httpStatus: retorno.status,
        cdResposta: infoRetorno.cdResposta || null,
        eventosRetorno: persistencia.eventos.length,
        recibosGravados: persistencia.recibosGravados,
        duplicidades: persistencia.duplicidades,
      });
      res.json({
        ok: true,
        httpStatus: retorno.status,
        cdResposta: infoRetorno.cdResposta,
        descResposta: infoRetorno.descResposta,
        protocolo: infoRetorno.protocolo || req.params.protocolo,
        dhRecepcao: infoRetorno.dhRecepcao,
        versaoAplicativoRecepcao: infoRetorno.versaoAplicativoRecepcao,
        eventosRetorno: persistencia.eventos.length,
        recibosGravados: persistencia.recibosGravados,
        duplicidades: persistencia.duplicidades,
        xml: infoRetorno.xml,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/reinf/retencoes-pj/:cnpj/:competencia
  //
  // As notas tomadas com retenção, vindas do CFI, já apuradas por beneficiário
  // — é o passo que a colaboradora faz à mão hoje ("informamos o campo de
  // retenção e a NATUREZA DE RENDIMENTO, feito isso geração módulo REINF").
  //
  // O token do usuário logado AQUI é o que abre a porta lá: os dois apps não
  // compartilham banco, e o CFI aceita este projeto por crossProjectAuth.
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/retencoes-pj/:cnpj/:competencia', async (req, res) => {
    try {
      const cnpj = limparCnpj(req.params.cnpj);
      const competencia = String(req.params.competencia || '').trim();
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

      const doCfi = await buscarNotasTomadasNoCfi({ cnpj, competencia, token });

      // A natureza que a pessoa informou na tela volta por aqui pra ser
      // VALIDADA contra a Tabela 01 no servidor — a tabela não existe no
      // navegador, e código digitado que ninguém confere é código inventado.
      // Formato: `?naturezas=CNPJ:codigo,CNPJ:codigo` (mesmo desenho do `?iva=`
      // do DIFAL no CFI).
      const informadas = mapaNaturezasInformadas(req.query.naturezas);
      const notas = doCfi.notas.map((n) => {
        const cod = informadas.get(limparCnpj(n.prestadorCnpj));
        return cod ? { ...n, naturezaInformada: cod } : n;
      });
      const apuracao = apurarRetencoesPJ({ competencia, notas });

      res.json({
        ok: true,
        origem: 'cfi',
        empresa: doCfi.empresa,
        competencia,
        ...apuracao,
        // As ressalvas do CFI viajam junto: elas dizem que `csllOuTotal` pode
        // ser o total e que o código de serviço é MUNICIPAL, não LC 116. Quem
        // some com a ressalva no meio do caminho faz o número parecer mais
        // certo do que é.
        ressalvasDaFonte: doCfi.ressalvas,
        resumoDaFonte: doCfi.resumo,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/reinf/aquisicao-rural/:cnpj/:competencia
  //
  // R-2055 — aquisição de produção rural de produtor PF, com o FUNRURAL que o
  // ADQUIRENTE recolhe por sub-rogação.
  //
  // O CÁLCULO NÃO É REFEITO AQUI: vem pronto do CFI, onde já tem vigência de
  // alíquota (LC 224/2025), tabela de segurado especial e conferência contra o
  // infAdic da própria nota. Este lado só decide quem PODE entrar no evento.
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/aquisicao-rural/:cnpj/:competencia', async (req, res) => {
    try {
      const cnpj = limparCnpj(req.params.cnpj);
      const competencia = String(req.params.competencia || '').trim();
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

      const doCfi = await buscarAquisicoesRuraisNoCfi({ cnpj, competencia, token });
      const apuracao = apurarAquisicaoRural({
        competencia,
        produtores: doCfi.produtores,
        indicadores: mapaIndAquisInformados(req.query.indAquis),
        marcadoComoComprador: doCfi.marcadoComoComprador === true,
      });

      res.json({
        ok: true,
        origem: 'cfi',
        empresa: doCfi.empresa,
        competencia,
        ...apuracao,
        // As ressalvas do CFI viajam junto — são elas que dizem que o cálculo
        // não deve ser refeito e que o indAquis vai nulo de propósito.
        ressalvasDaFonte: doCfi.ressalvas,
        resumoDaFonte: doCfi.resumo,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/reinf/aquisicao-rural/transmitir
  //
  // Monta o R-2055 (evtAqProd) a partir da apuração do CFI e TRANSMITE pelo
  // mesmo trilho dos demais eventos (gateway quando REINF_TRANSMISSOR=gateway,
  // senão assina local). NÃO recalcula: os valores vêm prontos do CFI. Só entra
  // no evento o produtor PRONTO (indAquis informado, base > 0, sem divergência);
  // o pendente fica FORA, nomeado — declarar um evento a menos é melhor que
  // declarar valor que a própria apuração desmente.
  //
  // tpAmb=2 (produção restrita) é o PADRÃO; produção (tpAmb=1) exige
  // confirmoProducao=true — a mesma trava do gateway. Entrega ao Reinf não se
  // desfaz, então o botão da tela pergunta antes.
  // ──────────────────────────────────────────────────────────────────────────
  router.post('/aquisicao-rural/transmitir', async (req, res) => {
    try {
      const p = req.body || {};
      const cnpj = limparCnpj(p.cnpj);
      const competencia = String(p.competencia || '').trim();
      const tpAmb = Number(p.tpAmb || 2);
      const token = tokenDaRequisicao(req);

      if (cnpj.length !== 14) throw new Error('Informe o CNPJ do adquirente com 14 dígitos — é ele quem declara o R-2055.');
      if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência deve ser AAAA-MM.');
      if (Number(tpAmb) === 1 && p.confirmoProducao !== true) {
        throw new Error('Transmissão em PRODUÇÃO exige confirmação explícita (confirmoProducao=true). Sem ela, use produção restrita (tpAmb=2).');
      }

      // Mesma fonte da tela — o cálculo é do CFI, aqui não se refaz.
      const doCfi = await buscarAquisicoesRuraisNoCfi({ cnpj, competencia, token });
      const apuracao = apurarAquisicaoRural({
        competencia,
        produtores: doCfi.produtores,
        indicadores: mapaIndAquisInformados(p.indAquis),
        marcadoComoComprador: doCfi.marcadoComoComprador === true,
      });

      const todosProntos = apuracao.produtores.filter((l) => l.pronto);
      const pendentes = apuracao.produtores.filter((l) => !l.pronto);

      // ── SONDA DE LEIAUTE (só produção restrita) ──────────────────────────
      // O MS0030 de 12/08 (EDUARDO GUERRA) disse que `ideProdutor` é filho
      // inválido de `ideEstabAdquir` — e o único evento ACEITO que temos de
      // referência tinha UM produtor, enquanto esse lote tinha oito. Ou o
      // grupo que repete é outro, ou o problema é outro; ADIVINHAR o leiaute é
      // justamente o que não se faz aqui. Transmitir 1 produtor em produção
      // restrita responde por PROVA: passou ⇒ é a multiplicidade; repetiu o
      // MS0030 ⇒ a causa é outra e o retorno cru mostra qual.
      //
      // Em PRODUÇÃO isso não existe: declarar um pedaço dos produtores seria
      // entrega incompleta, e entrega não se desfaz.
      const maxProdutores = Number(p.maxProdutores) > 0 ? Math.floor(Number(p.maxProdutores)) : null;
      if (maxProdutores && Number(tpAmb) === 1) {
        throw new Error('maxProdutores é sonda de leiaute e só vale em produção restrita (tpAmb=2) — em produção, declarar parte dos produtores seria entrega incompleta.');
      }
      const prontos = maxProdutores ? todosProntos.slice(0, maxProdutores) : todosProntos;
      if (!prontos.length) {
        return res.json({
          ok: false,
          etapa: 'apuracao',
          motivo: 'Nenhum produtor PRONTO para declarar nesta competência. Resolva as pendências (indicador da aquisição, base de cálculo ou divergência) antes de transmitir.',
          naoDeclarados: pendentes.map((l) => ({ doc: l.docProdutor, tipoInscricao: l.tipoInscricao, nome: l.nome, pendencias: l.pendencias })),
        });
      }

      // UM EVENTO POR PRODUTOR no MESMO lote — provado por eliminação em
      // 12/08 (o XSD recusa tanto ideProdutor repetido quanto ideEstabAdquir
      // repetido). O lote já aceitava vários eventos; o gerador é que
      // empilhava.
      const eventos = gerarEventosR2055({
        contribuinte: { tpInsc: 1, nrInsc: cnpj },
        estabAdquirente: { tpInscAdq: 1, nrInscAdq: cnpj },
        perApur: competencia,
        tpAmb,
        seq: 1,
        produtores: prontos.map((l) => ({
          cpf: l.cpfProdutor,
          aquisicoes: [{
            indAquis: l.indAquis,
            vlrBruto: l.base,
            vlrCPDescPR: l.inss,     // CP/INSS  → CRAquis 165601
            vlrRatDescPR: l.gilrat,  // RAT      → CRAquis 164603
            vlrSenarDesc: l.senar,   // SENAR    → CRAquis 121306
          }],
        })),
      });

      const cert = transmissorAtivo() === 'gateway' ? null : await loadCertificado();
      const loteContrib = normalizarContribuinteLote({ tpInsc: 1, nrInsc: cnpj });
      const envio = await assinarEEnviarLote(eventos.map((e) => e.xml), cert, loteContrib, tpAmb, req);
      const info = parseRetornoReinf(envio);
      const recibo = info.protocolo
        ? await consultarLoteAteProcessar(info.protocolo, tpAmb, { req })
        : { httpStatus: envio.status, ...info };

      const ocorrenciasLog = extrairOcorrenciasReinf((recibo && recibo.xml) || info.xml);
      await registrarLog(db, req, 'transmitir_r2055', {
        contribuinte: cnpj,
        tpAmb,
        competencia,
        protocolo: info.protocolo || null,
        httpStatus: envio.status,
        cdResposta: (recibo && recibo.cdResposta) || info.cdResposta || null,
        produtoresDeclarados: prontos.length,
        eventosEnviados: eventos.length,
        produtoresPendentes: pendentes.length,
        sondaLeiaute: maxProdutores || null,
        // A recusa entra na auditoria. Sem isso, "transmitiu" e "foi recusado"
        // ficam iguais no log — e a próxima sessão reconstrói do print.
        ocorrencias: ocorrenciasLog.map((o) => ({ codigo: o.codigo, descricao: o.descricao })),
      });

      // ✗ O `ok` NÃO pode ser só o HTTP do envelope. 201 significa "o lote
      // chegou" — os EVENTOS podem ter sido recusados dentro dele, e foi
      // exatamente o que aconteceu em 12/08 (EDUARDO GUERRA): HTTP 201,
      // "Lote processado com sucesso – Possui um ou mais eventos com
      // ocorrências de erro", e a tela pintou ✓ verde. `retornoReinfComErro`
      // já existia e era usado no R-1000; aqui não estava.
      const retornoFinal = recibo && recibo.cdResposta ? recibo : info;
      const ocorrencias = ocorrenciasLog;
      const comErro = retornoReinfComErro(retornoFinal) || ocorrencias.length > 0;
      const pendente = retornoReinfPendente(retornoFinal);

      res.json({
        ok: envio.status === 201 && !comErro && !pendente,
        eventosRecusados: comErro,
        aguardandoProcessamento: pendente,
        // As ocorrências SOBEM: sem elas a pessoa vê valores e nenhuma causa.
        ocorrencias,
        etapa: 'r2055',
        id: eventos[0] && eventos[0].id,
        eventosEnviados: eventos.length,
        tpAmb,
        httpStatus: envio.status,
        protocolo: info.protocolo,
        cdResposta: (recibo && recibo.cdResposta) || info.cdResposta,
        descResposta: (recibo && recibo.descResposta) || info.descResposta,
        dhRecepcao: recibo && recibo.dhRecepcao,
        // Retorno CRU (sem a assinatura): quando o parser não sabe nomear a
        // ocorrência, é ele que carrega a resposta da Receita até o print.
        xmlRetorno: retornoCruReinf((recibo && recibo.xml) || info.xml),
        sondaLeiaute: maxProdutores ? { produtoresEnviados: prontos.length, deUmTotalDe: todosProntos.length } : null,
        declarados: prontos.map((l) => ({ doc: l.docProdutor, nome: l.nome, base: l.base, total: l.total, indAquis: l.indAquis })),
        naoDeclarados: pendentes.map((l) => ({ doc: l.docProdutor, tipoInscricao: l.tipoInscricao, nome: l.nome, pendencias: l.pendencias })),
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  /**
   * Cadastro por PRESTADOR do R-2010 (tpServico, indObra, indCPRB).
   *
   * São dados do prestador, não da nota: informados uma vez, valem para todos
   * os meses. Banco fora do ar devolve {} — e {} significa "não informado",
   * que BLOQUEIA. Nunca "informado com o valor padrão": indObra chutado em 0
   * declararia obra que não é obra.
   */
  async function lerCadastroPrestadoresR2010(banco, cnpjTomador) {
    try {
      const snap = await banco.collection('reinf_servicos_tomados_prestadores')
        .where('cnpjTomador', '==', limparCnpj(cnpjTomador))
        .get();
      const out = {};
      snap.forEach((d) => {
        const v = d.data() || {};
        if (v.cnpjPrestador) out[v.cnpjPrestador] = {
          tpServico: v.tpServico || null,
          indObra: v.indObra === 0 || v.indObra ? String(v.indObra) : null,
          indCPRB: v.indCPRB === 0 || v.indCPRB ? String(v.indCPRB) : null,
        };
      });
      return out;
    } catch (err) {
      console.warn('[reinf/r2010] cadastro de prestadores indisponível:', err.message);
      return {};
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/reinf/servicos-tomados/:cnpj/:competencia
  //
  // R-2010 — retenção previdenciária de 11% sobre serviços tomados (art. 31 da
  // Lei 8.212/91). Quem declara é o TOMADOR.
  //
  // A LEITURA DO DOCUMENTO NÃO É REFEITA AQUI: vem pronta do CFI, que conhece a
  // forma da NFS-e (achatada do portal × objeto do XML). Este lado só decide
  // quem PODE entrar no evento e o que falta.
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/servicos-tomados/:cnpj/:competencia', async (req, res) => {
    try {
      const cnpj = limparCnpj(req.params.cnpj);
      const competencia = String(req.params.competencia || '').trim();
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

      const doCfi = await buscarServicosTomadosNoCfi({ cnpj, competencia, token });
      const apuracao = apurarServicosTomados({
        competencia,
        prestadores: doCfi.prestadores,
        cadastro: await lerCadastroPrestadoresR2010(db, cnpj),
      });

      res.json({
        ok: true,
        origem: 'cfi',
        empresa: doCfi.empresa,
        competencia,
        ...apuracao,
        // As ressalvas do CFI viajam junto — são elas que explicam por que a
        // base pode não ser o bruto e por que tpServico/indObra vêm nulos.
        ressalvasDaFonte: doCfi.ressalvas,
        resumoDaFonte: doCfi.resumo,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // POST /api/reinf/servicos-tomados/prestador — o cadastro por prestador.
  //
  // tpServico e indObra são do PRESTADOR, não da nota: informados uma vez,
  // valem para todos os meses. Persistir era o que faltava para a tela não
  // obrigar a redigitar toda competência (mesma lição das preferências de
  // retenção do R-4020, 08/08).
  router.post('/servicos-tomados/prestador', async (req, res) => {
    try {
      const p = req.body || {};
      const cnpjTomador = limparCnpj(p.cnpjTomador);
      const cnpjPrestador = limparCnpj(p.cnpjPrestador);
      if (cnpjTomador.length !== 14) throw new Error('Informe o CNPJ do tomador com 14 dígitos.');
      if (cnpjPrestador.length !== 14) throw new Error('Informe o CNPJ do prestador com 14 dígitos.');

      const tpServico = String(p.tpServico == null ? '' : p.tpServico).trim();
      const indObra = String(p.indObra == null ? '' : p.indObra).trim();
      const indCPRB = String(p.indCPRB == null ? '' : p.indCPRB).trim();
      // FORMA, não conteúdo: se o código existe na tabela 06 ninguém aqui pode
      // afirmar — por isso ele fica registrado como "informado", nunca como
      // "conferido".
      if (tpServico && !/^[0-9]{9}$/.test(tpServico)) {
        throw new Error('tpServico deve ter 9 dígitos (tabela 06 da EFD-Reinf).');
      }
      if (indObra && !/^[012]$/.test(indObra)) {
        throw new Error('indObra deve ser 0 (não é obra), 1 (obra com CNO) ou 2 (empreitada total).');
      }
      if (indCPRB && !/^[01]$/.test(indCPRB)) {
        throw new Error('indCPRB deve ser 0 (retenção de 11%) ou 1 (prestador desonerado).');
      }

      await db.collection('reinf_servicos_tomados_prestadores')
        .doc(cnpjTomador + '_' + cnpjPrestador)
        .set({
          cnpjTomador,
          cnpjPrestador,
          tpServico: tpServico || null,
          indObra: indObra === '' ? null : Number(indObra),
          indCPRB: indCPRB === '' ? null : Number(indCPRB),
          informadoPor: (req.user && (req.user.email || req.user.uid)) || 'desconhecido',
          informadoEm: Date.now(),
        }, { merge: true });

      res.json({ ok: true, cnpjPrestador });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/reinf/servicos-tomados/transmitir
  //
  // Só os prestadores PRONTOS entram. Prestador pendente fica de fora e volta
  // NOMEADO — evento incompleto é recusado; pior, aceito declarando diferente
  // do que foi retido.
  //
  // UM PRESTADOR POR EVENTO: o arquivo aceito de referência tem UM
  // `idePrestServ` e a multiplicidade não está provada. Empilhar filho foi o
  // que derrubou o R-2055 três vezes (MS0030).
  // ──────────────────────────────────────────────────────────────────────────
  router.post('/servicos-tomados/transmitir', async (req, res) => {
    try {
      const p = req.body || {};
      const cnpj = limparCnpj(p.cnpj);
      const competencia = String(p.competencia || '').trim();
      const tpAmb = Number(p.tpAmb || 2);
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

      if (cnpj.length !== 14) throw new Error('Informe o CNPJ do tomador com 14 dígitos — é ele quem declara o R-2010.');
      if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência deve ser AAAA-MM.');
      if (Number(tpAmb) === 1 && p.confirmoProducao !== true) {
        throw new Error('Transmissão em PRODUÇÃO exige confirmação explícita (confirmoProducao=true). Sem ela, use produção restrita (tpAmb=2).');
      }

      const doCfi = await buscarServicosTomadosNoCfi({ cnpj, competencia, token });
      const apuracao = apurarServicosTomados({
        competencia,
        prestadores: doCfi.prestadores,
        cadastro: await lerCadastroPrestadoresR2010(db, cnpj),
      });

      const prontos = apuracao.prestadores.filter((l) => l.pronto);
      const pendentes = apuracao.prestadores.filter((l) => !l.pronto);
      if (!prontos.length) {
        return res.json({
          ok: false,
          etapa: 'apuracao',
          motivo: 'Nenhum prestador PRONTO para declarar nesta competência. Resolva as pendências '
            + '(tipo de serviço, indicador de obra, desoneração ou base de retenção) antes de transmitir.',
          naoDeclarados: pendentes.map((l) => ({ cnpj: l.cnpjPrestador, nome: l.nome, pendencias: l.pendencias })),
        });
      }

      // `indObra` NÃO entra no estabelecimento do lote: ele é cadastrado por
      // PRESTADOR e viaja com ele. Repetir aqui o do primeiro pronto declarava
      // a natureza do primeiro contrato dentro do evento de todos os outros —
      // e evento com indObra errado é ACEITO, então nada volta avisando.
      const eventos = gerarEventosR2010({
        contribuinte: { tpInsc: 1, nrInsc: cnpj },
        estab: { tpInscEstab: 1, nrInscEstab: cnpj },
        perApur: competencia,
        tpAmb,
        seq: 1,
        prestadores: prontos.map((l) => ({
          cnpjPrestador: l.cnpjPrestador,
          indObra: l.indObra,
          nrInscEstab: l.nrInscEstab || cnpj,
          indCPRB: l.indCPRB,
          notas: l.notas.map((n) => ({
            serie: n.serie || '0',
            numDocto: n.numero,
            dtEmissaoNF: String(n.dtEmissao || '').slice(0, 10),
            vlrBruto: n.vlrBruto,
            obs: n.discriminacao || '',
            servicos: [{
              tpServico: l.tpServico,
              vlrBaseRet: n.baseRetencao,
              vlrRetencao: n.inssRetido,
            }],
          })),
        })),
      });

      const cert = transmissorAtivo() === 'gateway' ? null : await loadCertificado();
      const loteContrib = normalizarContribuinteLote({ tpInsc: 1, nrInsc: cnpj });
      const envio = await assinarEEnviarLote(eventos.map((e) => e.xml), cert, loteContrib, tpAmb, req);
      const info = parseRetornoReinf(envio);
      const recibo = info.protocolo
        ? await consultarLoteAteProcessar(info.protocolo, tpAmb, { req })
        : { httpStatus: envio.status, ...info };

      const ocorrencias = extrairOcorrenciasReinf((recibo && recibo.xml) || info.xml);
      await registrarLog(db, req, 'transmitir_r2010', {
        contribuinte: cnpj,
        tpAmb,
        competencia,
        protocolo: info.protocolo || null,
        httpStatus: envio.status,
        cdResposta: (recibo && recibo.cdResposta) || info.cdResposta || null,
        prestadoresDeclarados: prontos.length,
        eventosEnviados: eventos.length,
        prestadoresPendentes: pendentes.length,
        ocorrencias: ocorrencias.map((o) => ({ codigo: o.codigo, descricao: o.descricao })),
      });

      // 201 é "o lote chegou" — os EVENTOS podem ter sido recusados dentro
      // dele. Foi assim que o R-2055 pintou ✓ verde com MS0030 em 12/08.
      const retornoFinal = recibo && recibo.cdResposta ? recibo : info;
      const comErro = retornoReinfComErro(retornoFinal) || ocorrencias.length > 0;
      const pendente = retornoReinfPendente(retornoFinal);

      res.json({
        ok: envio.status === 201 && !comErro && !pendente,
        eventosRecusados: comErro,
        aguardandoProcessamento: pendente,
        ocorrencias,
        etapa: 'r2010',
        id: eventos[0] && eventos[0].id,
        eventosEnviados: eventos.length,
        tpAmb,
        httpStatus: envio.status,
        protocolo: info.protocolo,
        cdResposta: (recibo && recibo.cdResposta) || info.cdResposta,
        descResposta: (recibo && recibo.descResposta) || info.descResposta,
        dhRecepcao: recibo && recibo.dhRecepcao,
        xmlRetorno: retornoCruReinf((recibo && recibo.xml) || info.xml),
        declarados: prontos.map((l) => ({
          cnpj: l.cnpjPrestador, nome: l.nome, tpServico: l.tpServico,
          bruto: l.vlrTotalBruto, base: l.vlrTotalBaseRet, retencao: l.vlrTotalRetPrinc,
        })),
        naoDeclarados: pendentes.map((l) => ({ cnpj: l.cnpjPrestador, nome: l.nome, pendencias: l.pendencias })),
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/reinf/responsavel/:cnpj
  //
  // "E QUEM EU PROCURO?" — a pergunta que vem depois de "este CNPJ existe?".
  //
  // As ressalvas do R-4020 e do R-2055 quase sempre terminam em "alguém do
  // escritório precisa olhar este cliente". Quem é esse alguém saía por
  // WhatsApp, de memória. O túnel do cadastro do CFI responde, e este lado só
  // vira frase — sem escolher nada por conta própria.
  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // PREFERÊNCIAS DE RETENÇÃO — o "salvar" que faltava (colaboradora, 08/08).
  //
  // A natureza de rendimento digitada por prestador (R-4020) e o indAquis por
  // produtor (R-2055) viviam só na memória da tela: recarregou, perdeu — e a
  // pessoa redigitava tudo a cada apuração. São dados ESTÁVEIS (a natureza é
  // do tipo de serviço do prestador), então persistem por CNPJ/CPF, não por
  // competência.
  //
  // A validação de código continua onde sempre esteve (Tabela 01 no servidor,
  // na hora de apurar) — aqui só se guarda o que a pessoa escolheu.
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/preferencias-retencao', async (_req, res) => {
    try {
      const snap = await db.collection('reinf_preferencias').doc('retencoes').get();
      const d = snap.exists ? snap.data() : {};
      res.json({ ok: true, naturezas: d.naturezas || {}, indAquis: d.indAquis || {}, formulario: d.formulario || {} });
    } catch (err) {
      respostaErro(res, 500, err);
    }
  });

  router.post('/preferencias-retencao', async (req, res) => {
    try {
      const naturezas = req.body && req.body.naturezas;
      const indAquis = req.body && req.body.indAquis;
      const formulario = req.body && req.body.formulario;
      const limpo = (obj, chaveDig, valDig) => {
        const out = {};
        for (const [k, v] of Object.entries(obj || {})) {
          const ck = String(k).replace(/\D/g, '');
          const cv = String(v || '').replace(/\D/g, '');
          if (ck.length >= chaveDig && cv.length >= 1 && cv.length <= valDig) out[ck] = cv;
        }
        return out;
      };
      const patch = { atualizadoEm: new Date().toISOString(), atualizadoPor: (req.user && req.user.email) || null };
      if (naturezas) patch.naturezas = limpo(naturezas, 11, 5);
      if (indAquis) patch.indAquis = limpo(indAquis, 11, 2);
      if (formulario) {
        // Whitelist explícita (lição #382 do CFI): campo desconhecido é
        // RECUSADO com o nome — descartar em silêncio faria o botão dizer
        // "salvo" com o dado perdido. Campo vazio APAGA (limpar e salvar
        // remove o preenchimento automático).
        const FORM_CAMPOS = {
          cnpjFonte: /^\d{14}$/, cnpjEstab: /^\d{14}$/, natRend: /^\d{5}$/,
          contatoNome: /^.{0,80}$/, contatoCpf: /^\d{11}$/, contatoTelefone: /^\d{10,13}$/,
          classTrib: /^\d{2}$/, indSitPJ: /^[0-4]$/,
        };
        const salvo = {};
        for (const [k, v] of Object.entries(formulario)) {
          if (!FORM_CAMPOS[k]) return respostaErro(res, 400, new Error(`Campo desconhecido no formulário: ${k}`));
          const valor = String(v == null ? '' : v).trim();
          if (valor === '') continue;
          if (!FORM_CAMPOS[k].test(valor)) return respostaErro(res, 400, new Error(`Valor inválido em ${k}: "${valor}"`));
          salvo[k] = valor;
        }
        patch._formularioNovo = salvo;
      }
      const formularioNovo = patch._formularioNovo;
      delete patch._formularioNovo;
      const ref = db.collection('reinf_preferencias').doc('retencoes');
      await ref.set(patch, { merge: true });
      // O formulário SUBSTITUI o mapa inteiro (update troca o campo por
      // completo): merge profundo manteria valor velho em campo que a pessoa
      // limpou — e "limpei e salvei" tem que apagar (regra do CCM-SP #311).
      if (formularioNovo) await ref.update({ formulario: formularioNovo });
      await registrarLog(db, req, 'preferencias_retencao', {
        naturezas: patch.naturezas ? Object.keys(patch.naturezas).length : undefined,
        indAquis: patch.indAquis ? Object.keys(patch.indAquis).length : undefined,
        formulario: formularioNovo ? Object.keys(formularioNovo).length : undefined,
      });
      res.json({ ok: true });
    } catch (err) {
      respostaErro(res, 500, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // R-2099 — FECHAMENTO da série R-2000.
  //
  // É ele que manda a Receita apurar: sem o fechamento, os R-2010/R-2055 do mês
  // ficam recebidos e NÃO viram totalizador nem DARF. O VINCENZO 07/2026 fechou
  // no e-CAC, à mão, porque nenhum dos dois apps o gerava.
  //
  // Os grupos declarados saem do LOG das transmissões ACEITAS — nunca de um
  // formulário. Lista digitada esquece evento, e evento esquecido faz a Receita
  // consolidar a MENOR, sem recusa nenhuma avisando.
  // ──────────────────────────────────────────────────────────────────────────

  /** Transmissões da série R-2000 daquele contribuinte (para derivar os grupos). */
  async function lerLogsSerie2000(banco, cnpj) {
    try {
      const snap = await banco.collection('reinf_logs')
        .where('detalhes.contribuinte', '==', cnpj)
        .limit(500)
        .get();
      return snap.docs.map((d) => d.data() || {});
    } catch (err) {
      // Banco fora NÃO pode virar "sem movimento": a diferença entre "não houve
      // evento" e "não consegui ler" não está no zero, e fechar no escuro deixa
      // o mês a menor.
      console.warn('[reinf/r2099] log de transmissões indisponível:', err.message);
      return null;
    }
  }

  // GET /api/reinf/fechamento-2000/:cnpj/:competencia — o que SERÁ declarado.
  router.get('/fechamento-2000/:cnpj/:competencia', async (req, res) => {
    try {
      const cnpj = limparCnpj(req.params.cnpj);
      const competencia = String(req.params.competencia || '').trim();
      if (cnpj.length !== 14) throw new Error('Informe o CNPJ do contribuinte com 14 dígitos.');
      if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência deve ser AAAA-MM.');

      const logs = await lerLogsSerie2000(db, cnpj);
      if (logs === null) {
        return res.json({
          ok: false,
          etapa: 'log',
          motivo: 'Não foi possível ler o histórico de transmissões. Sem ele, os grupos do fechamento '
            + 'seriam adivinhados — e grupo esquecido faz a Receita consolidar a menor. Tente de novo.',
        });
      }
      const derivado = derivarGruposDoLog(logs, competencia);
      const resumo = resumoDoFechamento(derivado, competencia);
      const bloqueio = podeTransmitirR2099({ tpAmb: 1 });

      res.json({
        ok: true,
        cnpj,
        competencia,
        ...resumo,
        // A tela precisa saber, ANTES do clique, que produção está fechada.
        producaoLiberada: bloqueio.ok,
        motivoProducao: bloqueio.motivo || null,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // POST /api/reinf/fechamento-2000/transmitir
  //
  // Produção RESTRITA é livre: é lá que se PERGUNTA se o leiaute do infoFech
  // está certo. PRODUÇÃO é recusada enquanto ninguém tiver visto este leiaute
  // ser aceito — fechamento com indicador errado é ACEITO e manda consolidar o
  // grupo errado, sem recusa avisando.
  router.post('/fechamento-2000/transmitir', async (req, res) => {
    try {
      const p = req.body || {};
      const cnpj = limparCnpj(p.cnpj);
      const competencia = String(p.competencia || '').trim();
      const tpAmb = Number(p.tpAmb || 2);
      if (cnpj.length !== 14) throw new Error('Informe o CNPJ do contribuinte com 14 dígitos.');
      if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência deve ser AAAA-MM.');

      const bloqueio = podeTransmitirR2099({ tpAmb, leiauteProvado: p.leiauteProvado === true });
      if (!bloqueio.ok) return res.json({ ok: false, etapa: 'leiaute', motivo: bloqueio.motivo });
      if (Number(tpAmb) === 1 && p.confirmoProducao !== true) {
        throw new Error('Transmissão em PRODUÇÃO exige confirmação explícita (confirmoProducao=true).');
      }

      const logs = await lerLogsSerie2000(db, cnpj);
      if (logs === null) throw new Error('Histórico de transmissões indisponível — sem ele os grupos seriam adivinhados.');
      const derivado = derivarGruposDoLog(logs, competencia);
      const resumo = resumoDoFechamento(derivado, competencia);

      // Fechar com evento pendurado é o erro caro: depois do fechamento, evento
      // novo da competência só entra com reabertura (R-2098).
      if (!derivado.temEvento && p.confirmoSemMovimento !== true) {
        return res.json({
          ok: false,
          etapa: 'sem-movimento',
          motivo: `Nenhum evento da série R-2000 consta como ACEITO em ${competencia}. Fechar assim `
            + 'DECLARA a competência sem movimento. Se é isso mesmo, confirme (confirmoSemMovimento=true).',
          avisos: resumo.avisos,
        });
      }

      const evento = gerarR2099({
        contribuinte: { tpInsc: 1, nrInsc: cnpj },
        perApur: competencia,
        tpAmb,
        grupos: derivado.temEvento ? derivado.grupos : { semMovimento: true },
        seq: 1,
      });

      const cert = transmissorAtivo() === 'gateway' ? null : await loadCertificado();
      const loteContrib = normalizarContribuinteLote({ tpInsc: 1, nrInsc: cnpj });
      const envio = await assinarEEnviarLote([evento.xml], cert, loteContrib, tpAmb, req);
      const info = parseRetornoReinf(envio);
      const recibo = info.protocolo
        ? await consultarLoteAteProcessar(info.protocolo, tpAmb, { req })
        : { httpStatus: envio.status, ...info };

      const ocorrencias = extrairOcorrenciasReinf((recibo && recibo.xml) || info.xml);
      await registrarLog(db, req, 'transmitir_r2099', {
        contribuinte: cnpj,
        tpAmb,
        competencia,
        protocolo: info.protocolo || null,
        httpStatus: envio.status,
        cdResposta: (recibo && recibo.cdResposta) || info.cdResposta || null,
        gruposDeclarados: evento.gruposDeclarados,
        ocorrencias: ocorrencias.map((o) => ({ codigo: o.codigo, descricao: o.descricao })),
      });

      const retornoFinal = recibo && recibo.cdResposta ? recibo : info;
      const comErro = retornoReinfComErro(retornoFinal) || ocorrencias.length > 0;
      const pendente = retornoReinfPendente(retornoFinal);

      res.json({
        ok: envio.status === 201 && !comErro && !pendente,
        eventosRecusados: comErro,
        aguardandoProcessamento: pendente,
        ocorrencias,
        etapa: 'r2099',
        id: evento.id,
        gruposDeclarados: evento.gruposDeclarados,
        evidencias: resumo.evidencias,
        avisos: resumo.avisos,
        tpAmb,
        httpStatus: envio.status,
        protocolo: info.protocolo,
        cdResposta: (recibo && recibo.cdResposta) || info.cdResposta,
        descResposta: (recibo && recibo.descResposta) || info.descResposta,
        xmlRetorno: retornoCruReinf((recibo && recibo.xml) || info.xml),
        // ACEITO em RESTRITA é o que PROVA o leiaute do infoFech. A tela diz
        // isso — é a diferença entre perguntar e afirmar.
        provaDoLeiaute: Number(tpAmb) === 2 && envio.status === 201 && !comErro && !pendente,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.get('/responsavel/:cnpj', async (req, res) => {
    try {
      const cnpj = limparCnpj(req.params.cnpj);
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

      const linha = await buscarResponsavelNoCfi({ cnpj, token });
      res.json({
        ok: true,
        origem: 'cfi',
        cnpj: linha.cnpj || cnpj,
        empresa: linha.nome || null,
        ...resumirResponsavel(linha),
        avisos: avisosDoResponsavel(linha),
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/reinf/certificado/conferencia
  //
  // O ESCRITÓRIO TEM O A1 EM DOIS COFRES — aqui e no CFI — e nada nunca
  // comparou os dois. Renovação feita num só passa despercebida até o dia em
  // que o antigo vence, e aí TODA transmissão para de uma vez.
  //
  // A prova é o fingerprint (SHA-256 do DER, mesmo cálculo nos dois lados).
  //
  // Note que NÃO se confere o certificado do CLIENTE: aqui se assina por
  // procuração, com o A1 do escritório. Pendurar a aptidão do cliente numa
  // transmissão que não depende dela seria alarme que a equipe aprende a
  // ignorar.
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/certificado/conferencia', async (req, res) => {
    try {
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const daqui = await loadCertificado();

      let doCfi = null;
      let erroCfi = null;
      if (daqui?.cnpj) {
        // O túnel fora do ar NÃO derruba a conferência: ela devolve
        // 'nao-conferido', que é a verdade, em vez de afirmar que está tudo
        // certo (ou que está errado).
        try {
          doCfi = await buscarCertificadoNoCfi({ cnpj: daqui.cnpj, token });
        } catch (e) { erroCfi = e; }
      } else {
        erroCfi = new Error('O certificado carregado não traz CNPJ no titular — sem ele não dá pra perguntar ao CFI.');
      }

      res.json({ ok: true, ...conferirCertificado({ daqui, doCfi, erroCfi }) });
    } catch (err) {
      respostaErro(res, 502, err);
    }
  });

  app.use('/api/reinf', router);
}

module.exports = registrarRotasReinf;
