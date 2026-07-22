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

async function consultarLoteAteProcessar(protocolo, tpAmb, { tentativas = 10, intervaloMs = 3000 } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    const retorno = await consultarLote(protocolo, tpAmb);
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
      const cert = await loadCertificado();
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
        const envioR1000 = await enviarLote([assinarEventoReinf(r1000.xml, cert)], loteContrib, tpAmb);
        const infoEnvioR1000 = parseRetornoReinf(envioR1000);
        protocoloR1000 = infoEnvioR1000.protocolo;
        retornoR1000 = protocoloR1000
          ? await consultarLoteAteProcessar(protocoloR1000, tpAmb)
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
      const assinados = eventosMovimento.map((e) => assinarEventoReinf(e.xml, cert));
      const retorno = await enviarLote(assinados, loteContrib, tpAmb);
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
        qtdEventos: assinados.length,
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
        qtdEventos: assinados.length,
        retificacoesR4010: recibosR4010.size,
        ids: eventosMovimento.map((e) => e.id),
        xmlRetorno: infoRetorno.xml,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  router.get('/lote/:protocolo', async (req, res) => {
    try {
      const tpAmb = Number(req.query.tpAmb || 2);
      const retorno = await consultarLote(req.params.protocolo, tpAmb);
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

  app.use('/api/reinf', router);
}

module.exports = registrarRotasReinf;
