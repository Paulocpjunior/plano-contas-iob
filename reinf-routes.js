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
  gerarTrioReinf,
} = require('./reinf/reinf-utils');
const { assinarEventoReinf } = require('./reinf/assinador');
const { loadCertificado, salvarCertificadoUpload } = require('./reinf/cert-loader');
const { enviarLote, consultarLote } = require('./reinf/transmissor');

function limparCnpj(v) {
  return String(v || '').replace(/\D/g, '');
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

function adminReinfRequired(req, res, next) {
  if (!req.user || req.user.is_admin !== true) {
    return res.status(403).json({ ok: false, erro: 'Apenas administradores podem atualizar o certificado Reinf.' });
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

    const docId = reinfSaldoDocId({ cnpjFonte, cnpjEstab, natRend, cpf });
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
          cnpjFonte,
          cnpjEstab,
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
      const eventos = gerarEventosR4010DaPlanilha(req.body || {});
      await registrarLog(db, req, 'gerar_r4010', {
        contribuinte: limparCnpj(req.body && req.body.contribuinte && req.body.contribuinte.nrInsc),
        perApur: req.body && req.body.perApur,
        qtdEventos: eventos.length,
      });
      res.json({
        ok: true,
        leiaute: LEIAUTE_REINF,
        qtdEventos: eventos.length,
        eventos: eventos.map((e) => ({ id: e.id, cpf: e.cpf, nome: e.nome, xml: e.xml })),
      });
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
      const trio = gerarTrioReinf(p);
      const cert = await loadCertificado();
      const assinados = trio.eventos.map((e) => assinarEventoReinf(e.xml, cert));
      const loteContrib = p.loteContribuinte || p.contribuinte;
      const retorno = await enviarLote(assinados, loteContrib, tpAmb);
      const infoRetorno = parseRetornoReinf(retorno);
      await registrarLog(db, req, 'transmitir_lote', {
        contribuinte: limparCnpj(loteContrib && loteContrib.nrInsc),
        tpAmb,
        protocolo: infoRetorno.protocolo || null,
        httpStatus: retorno.status,
        cdResposta: infoRetorno.cdResposta || null,
        qtdEventos: assinados.length,
      });
      res.json({
        ok: retorno.status === 201,
        httpStatus: retorno.status,
        protocolo: infoRetorno.protocolo,
        cdResposta: infoRetorno.cdResposta,
        descResposta: infoRetorno.descResposta,
        dhRecepcao: infoRetorno.dhRecepcao,
        versaoAplicativoRecepcao: infoRetorno.versaoAplicativoRecepcao,
        qtdEventos: assinados.length,
        ids: trio.eventos.map((e) => e.id),
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
      await registrarLog(db, req, 'consultar_lote', {
        protocolo: req.params.protocolo,
        tpAmb,
        httpStatus: retorno.status,
        cdResposta: infoRetorno.cdResposta || null,
      });
      res.json({
        ok: true,
        httpStatus: retorno.status,
        cdResposta: infoRetorno.cdResposta,
        descResposta: infoRetorno.descResposta,
        protocolo: infoRetorno.protocolo || req.params.protocolo,
        dhRecepcao: infoRetorno.dhRecepcao,
        versaoAplicativoRecepcao: infoRetorno.versaoAplicativoRecepcao,
        xml: infoRetorno.xml,
      });
    } catch (err) {
      respostaErro(res, 400, err);
    }
  });

  app.use('/api/reinf', router);
}

module.exports = registrarRotasReinf;
