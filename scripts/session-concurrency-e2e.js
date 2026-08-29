'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function abortar(mensagem, codigo = 2) {
  const erro = new Error(mensagem);
  erro.exitCode = codigo;
  throw erro;
}

function inteiroEnv(nome, padrao, minimo, maximo) {
  const valor = Number(process.env[nome] || padrao);
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    abortar(`${nome} deve ser inteiro entre ${minimo} e ${maximo}.`);
  }
  return valor;
}

function carregarConfig() {
  const baseUrl = String(process.env.CCI_E2E_BASE_URL || '').trim().replace(/\/+$/, '');
  const idToken = String(process.env.CCI_E2E_ID_TOKEN || '').trim();
  const cnpj = String(process.env.CCI_E2E_CNPJ || '').replace(/\D/g, '');
  const confirmacao = String(process.env.CCI_E2E_CONFIRM_CNPJ || '').replace(/\D/g, '');
  const backupDir = String(process.env.CCI_E2E_BACKUP_DIR || '').trim();
  if (!baseUrl) abortar('CCI_E2E_BASE_URL é obrigatório.');
  if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
    abortar('CCI_E2E_BASE_URL deve usar HTTPS ou localhost explícito.');
  }
  if (!idToken) abortar('CCI_E2E_ID_TOKEN é obrigatório e nunca deve ser gravado em arquivo.');
  if (cnpj.length !== 14 || confirmacao !== cnpj) {
    abortar('CCI_E2E_CNPJ e CCI_E2E_CONFIRM_CNPJ devem conter o mesmo CNPJ de 14 dígitos.');
  }
  if (String(process.env.CCI_E2E_EXCLUSIVE || '').toLowerCase() !== 'yes') {
    abortar('Defina CCI_E2E_EXCLUSIVE=yes somente para empresa dedicada e sem uso operacional.');
  }
  const producao = /plano-contas-iob-q4woqnee3a-uw\.a\.run\.app/.test(baseUrl);
  if (producao && String(process.env.CCI_E2E_ALLOW_PRODUCTION || '').toLowerCase() !== 'yes') {
    abortar('Produção exige CCI_E2E_ALLOW_PRODUCTION=yes além das demais confirmações.');
  }
  if (!backupDir || !path.isAbsolute(backupDir)) {
    abortar('CCI_E2E_BACKUP_DIR deve ser um caminho absoluto para guardar a sessão original.');
  }
  return {
    baseUrl,
    idToken,
    cnpj,
    backupDir,
    iteracoes: inteiroEnv('CCI_E2E_ITERATIONS', 10, 3, 100),
    quantidadeLancamentos: inteiroEnv('CCI_E2E_ENTRIES', 30000, 1000, 50000),
  };
}

function sha256(texto) {
  return crypto.createHash('sha256').update(String(texto)).digest('hex');
}

function percentil(valores, fracao) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.max(0, Math.ceil(ordenados.length * fracao) - 1)] || 0;
}

async function request(config, rota, opcoes = {}) {
  const inicio = Date.now();
  const resposta = await fetch(config.baseUrl + rota, {
    method: opcoes.method || 'GET',
    headers: {
      Authorization: `Bearer ${config.idToken}`,
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const data = await resposta.json().catch(() => ({}));
  return {
    status: resposta.status,
    data,
    elapsedMs: Date.now() - inicio,
    serverTiming: resposta.headers.get('server-timing') || '',
  };
}

async function carregarSessao(config) {
  return request(config, `/api/empresas/${config.cnpj}/sessao`);
}

function corpoSessao(stateJson, revisao, versao) {
  const state = JSON.parse(stateJson);
  return {
    state_json: stateJson,
    resumo: {
      total_lancamentos: Array.isArray(state.entries) ? state.entries.length : 0,
      periodo: 'E2E CONTROLADO',
      banco: 'CCI_E2E',
      state_bytes: Buffer.byteLength(stateJson),
    },
    session_revision: revisao || null,
    client_version: versao,
  };
}

async function salvarSessao(config, stateJson, revisao, versao) {
  return request(config, `/api/empresas/${config.cnpj}/sessao`, {
    method: 'POST',
    body: corpoSessao(stateJson, revisao, versao),
  });
}

function estadoDeTeste(original, quantidade, rodada) {
  const state = JSON.parse(original);
  state.entries = Array.from({ length: quantidade }, (_, indice) => ({
    id: `cci-e2e-${indice}`,
    data: '2026-08-29',
    descricao: `E2E CONTROLADO ${indice}`,
    valor: -((indice % 10000) + 1) / 100,
    contaDebito: '0000000401',
    contaCredito: '0000000111',
    codigoHistorico: '0003',
    historico: 'TESTE CONTROLADO DE CONCORRENCIA',
    e2eRodada: rodada,
  }));
  state.cciE2E = { rodada, geradoEm: new Date().toISOString() };
  return JSON.stringify(state);
}

function exigirEmpresaDeTeste(stateJson) {
  const state = JSON.parse(stateJson);
  const info = state.info || {};
  const identidade = [info.empresa, info.razaoSocial, info.nome, info.ambiente, state.ambiente]
    .filter(Boolean).join(' ');
  if (!/teste|homologa/i.test(identidade)) {
    abortar('A sessão não está identificada como TESTE/HOMOLOGAÇÃO. Nenhuma escrita foi realizada.');
  }
  if (!Array.isArray(state.entries)) abortar('A sessão de teste não contém entries. Nenhuma escrita foi realizada.');
}

async function executar() {
  const config = carregarConfig();
  const versaoResp = await request(config, '/api/version');
  if (versaoResp.status !== 200 || !/^\d+\.\d+\.\d+$/.test(String(versaoResp.data.version || ''))) {
    abortar('Não foi possível confirmar a versão do servidor.', 1);
  }
  const versao = versaoResp.data.version;
  const originalResp = await carregarSessao(config);
  if (originalResp.status !== 200 || !originalResp.data.encontrada || typeof originalResp.data.state_json !== 'string') {
    abortar('A empresa dedicada precisa ter uma sessão existente para permitir restauração exata.', 1);
  }
  exigirEmpresaDeTeste(originalResp.data.state_json);

  fs.mkdirSync(config.backupDir, { recursive: true });
  const runId = new Date().toISOString().replace(/[^0-9TZ]/g, '');
  const backupPath = path.join(config.backupDir, `cci-e2e-session-${runId}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    sessionRevision: originalResp.data.session_revision || null,
    stateJson: originalResp.data.state_json,
    sha256: sha256(originalResp.data.state_json),
  }), { mode: 0o600, flag: 'wx' });

  const originalJson = originalResp.data.state_json;
  let restaurada = false;
  const latencias = [];
  const evidencias = { backupPath, versao, testes: [] };

  try {
    let revisao = originalResp.data.session_revision || null;
    let esperado = estadoDeTeste(originalJson, config.quantidadeLancamentos, 'baseline');
    let resposta = await salvarSessao(config, esperado, revisao, versao);
    if (resposta.status !== 200 || !resposta.data.session_revision) abortar(`Baseline E2E falhou com HTTP ${resposta.status}.`, 1);
    revisao = resposta.data.session_revision;
    latencias.push(resposta.elapsedMs);

    const reload = await carregarSessao(config);
    if (reload.status !== 200 || sha256(reload.data.state_json) !== sha256(esperado)) abortar('Reload não reproduziu o estado salvo.', 1);
    evidencias.testes.push('payload_grande_reload');

    const revisaoComum = revisao;
    const primeira = estadoDeTeste(originalJson, config.quantidadeLancamentos, 'colaborador-a');
    resposta = await salvarSessao(config, primeira, revisaoComum, versao);
    if (resposta.status !== 200) abortar(`Primeiro colaborador falhou com HTTP ${resposta.status}.`, 1);
    revisao = resposta.data.session_revision;
    const segundaObsoleta = estadoDeTeste(originalJson, config.quantidadeLancamentos, 'colaborador-b');
    const conflito = await salvarSessao(config, segundaObsoleta, revisaoComum, versao);
    if (conflito.status !== 409 || conflito.data.codigo !== 'SESSAO_CONCORRENTE') {
      abortar(`Snapshot obsoleto não foi protegido: HTTP ${conflito.status}/${conflito.data.codigo || 'sem_codigo'}.`, 1);
    }
    const aposConflito = await carregarSessao(config);
    if (sha256(aposConflito.data.state_json) !== sha256(primeira)) abortar('Conflito alterou o estado do primeiro colaborador.', 1);
    evidencias.testes.push('dois_colaboradores_sem_sobrescrita');

    esperado = estadoDeTeste(originalJson, config.quantidadeLancamentos, 'resposta-perdida');
    resposta = await salvarSessao(config, esperado, revisao, versao);
    if (resposta.status !== 200) abortar(`Gravação antes da resposta perdida falhou com HTTP ${resposta.status}.`, 1);
    // A revisão da resposta é deliberadamente descartada. O cliente consulta o
    // servidor após a desconexão e repete a mesma fotografia sem duplicar dados.
    const recuperada = await carregarSessao(config);
    revisao = recuperada.data.session_revision;
    const retry = await salvarSessao(config, esperado, revisao, versao);
    if (retry.status !== 200) abortar(`Retry após resposta perdida falhou com HTTP ${retry.status}.`, 1);
    revisao = retry.data.session_revision;
    const aposRetry = await carregarSessao(config);
    if (sha256(aposRetry.data.state_json) !== sha256(esperado)) abortar('Retry não preservou a fotografia exata.', 1);
    evidencias.testes.push('desconexao_retry_sem_perda');

    for (let i = 0; i < config.iteracoes; i++) {
      esperado = estadoDeTeste(originalJson, config.quantidadeLancamentos, `carga-${i}`);
      resposta = await salvarSessao(config, esperado, revisao, versao);
      if (resposta.status !== 200) abortar(`Carga ${i + 1} falhou com HTTP ${resposta.status}.`, 1);
      revisao = resposta.data.session_revision;
      latencias.push(resposta.elapsedMs);
    }
    evidencias.testes.push('carga_sequencial');
  } finally {
    try {
      const atual = await carregarSessao(config);
      const restore = await salvarSessao(config, originalJson, atual.data.session_revision, versao);
      if (restore.status !== 200) throw new Error(`HTTP ${restore.status}`);
      const conferida = await carregarSessao(config);
      restaurada = sha256(conferida.data.state_json) === sha256(originalJson);
      if (!restaurada) throw new Error('hash divergente');
    } catch (erroRestore) {
      console.error(`CRÍTICO: restauração automática falhou (${erroRestore.message}). Backup preservado em ${backupPath}`);
    }
  }

  if (!restaurada) abortar('Sessão original não foi restaurada; intervenção é obrigatória.', 1);
  const resultado = {
    ok: true,
    versao,
    restaurada,
    testes: evidencias.testes,
    amostras: latencias.length,
    p50_ms: percentil(latencias, 0.50),
    p95_ms: percentil(latencias, 0.95),
    max_ms: Math.max(...latencias),
    backupPath,
  };
  console.log(JSON.stringify(resultado, null, 2));
  if (resultado.p95_ms >= 2000) abortar(`p95 ${resultado.p95_ms} ms excede a meta de 2.000 ms.`, 1);
}

executar().catch(erro => {
  console.error(erro.message);
  process.exitCode = erro.exitCode || 1;
});
