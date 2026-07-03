#!/usr/bin/env node
/**
 * Recupera uma sessão de trabalho sobrescrita no Firestore usando "stale reads"
 * (leitura point-in-time). O Firestore guarda versões antigas dos documentos por
 * 1 hora (padrão) ou 7 dias (se PITR estiver habilitado no banco).
 *
 * Contexto: a sessão fica em empresas/{cnpj}/sessoes/current (+ subcoleção
 * chunks quando o state_json passa de 450 KB). Cada save SOBRESCREVE o doc e
 * APAGA os chunks antigos — se um save vazio aconteceu (ex.: bug da trava de
 * sessão), a única cópia dos lançamentos fica nas versões antigas do Firestore.
 *
 * Uso:
 *   node scripts/recuperar-sessao-firestore.js \
 *     --cnpj 62827860000150 \
 *     --quando "2026-07-03T09:15:00-03:00" \
 *     [--projeto meu-projeto-gcp] \
 *     [--saida sessao-recuperada.json] \
 *     [--restaurar]
 *
 * --quando     Momento NO PASSADO em que a sessão ainda estava íntegra
 *              (ex.: alguns minutos ANTES do save vazio mostrado no popup).
 *              Aceita ISO 8601 com timezone. Deve estar dentro da janela de
 *              versões do banco (1h padrão / 7 dias com PITR).
 * --de-arquivo Em vez de ler o Firestore, carrega a sessão de um dump JSON
 *              gerado anteriormente por este script (--saida). Use com
 *              --restaurar para gravar o dump de volta no servidor sem
 *              depender da janela de versões. Dispensa --quando.
 * --restaurar  Depois de recuperar, grava o estado de volta em sessoes/current
 *              (a versão atual é preservada em sessoes/backup_pre_restauracao).
 *
 * Autenticação: usa Application Default Credentials.
 *   gcloud auth application-default login
 *   (ou GOOGLE_APPLICATION_CREDENTIALS apontando para a chave da service account)
 *
 * Para checar se PITR está habilitado (janela de 7 dias) e até quando dá para voltar:
 *   gcloud firestore databases describe --database="(default)" --project=SEU_PROJETO
 *   (campos: pointInTimeRecoveryEnablement e earliestVersionTime)
 */

const path = require('path');
const fs = require('fs');

function arg(nome, padrao) {
  const i = process.argv.indexOf('--' + nome);
  if (i === -1) return padrao;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}

const CNPJ = String(arg('cnpj', '')).replace(/\D/g, '');
const QUANDO = arg('quando', null);
const DE_ARQUIVO = arg('de-arquivo', null);
const PROJETO = arg('projeto', process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined);
const SAIDA = arg('saida', 'sessao-recuperada-' + CNPJ + '.json');
const RESTAURAR = arg('restaurar', false) === true;

if (CNPJ.length !== 14 || (!QUANDO && !DE_ARQUIVO)) {
  console.error('Uso: node scripts/recuperar-sessao-firestore.js --cnpj <14 digitos> (--quando "<ISO 8601>" | --de-arquivo <dump.json>) [--projeto <id>] [--saida <arquivo>] [--restaurar]');
  process.exit(1);
}

let dataAlvo = null;
if (QUANDO && !DE_ARQUIVO) {
  dataAlvo = new Date(QUANDO);
  if (isNaN(dataAlvo.getTime())) {
    console.error('Valor de --quando invalido: ' + QUANDO);
    process.exit(1);
  }
  if (dataAlvo.getTime() >= Date.now()) {
    console.error('--quando precisa estar no passado.');
    process.exit(1);
  }
}

const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

admin.initializeApp(PROJETO ? { projectId: PROJETO } : undefined);
const db = admin.firestore();

const LIMITE_CHUNK = 450000;

async function lerSessaoEm(readTime) {
  const sessaoRef = db.collection('empresas').doc(CNPJ).collection('sessoes').doc('current');
  return db.runTransaction(async (t) => {
    const doc = await t.get(sessaoRef);
    if (!doc.exists) return null;
    const dados = doc.data();
    if (dados.state_chunked) {
      const chunks = await t.get(sessaoRef.collection('chunks').orderBy('idx'));
      dados.state_json = chunks.docs.map(d => d.data().parte || '').join('');
    }
    return dados;
  }, { readOnly: true, readTime: Timestamp.fromDate(readTime) });
}

function resumirSessao(dados) {
  if (!dados) return { existe: false };
  let entries = null;
  try { entries = JSON.parse(dados.state_json || '{}').entries || []; } catch (e) { entries = null; }
  return {
    existe: true,
    total_lancamentos: entries ? entries.length : '(state_json ilegivel)',
    resumo_gravado: dados.resumo || null,
    updated_at: dados.updated_at && dados.updated_at.toDate ? dados.updated_at.toDate().toISOString() : dados.updated_at,
    updated_by_email: dados.updated_by_email || null,
    state_bytes: dados.state_bytes || (dados.state_json ? dados.state_json.length : 0)
  };
}

async function restaurar(dados) {
  const sessaoRef = db.collection('empresas').doc(CNPJ).collection('sessoes').doc('current');
  const backupRef = db.collection('empresas').doc(CNPJ).collection('sessoes').doc('backup_pre_restauracao');

  // preserva a versao atual (mesmo vazia) antes de sobrescrever
  const atual = await sessaoRef.get();
  if (atual.exists) {
    await backupRef.set({ ...atual.data(), backup_em: new Date(), backup_de: 'current' });
  }

  const state_json = dados.state_json || '';
  let resumo = dados.resumo || null;
  try {
    const st = JSON.parse(state_json);
    const info = st.info || {};
    resumo = {
      total_lancamentos: (st.entries || []).length,
      periodo: (info.periodoInicio || '') + ' a ' + (info.periodoFim || ''),
      banco: info.banco || null,
      restaurado_em: new Date().toISOString()
    };
  } catch (e) {}

  const chunksRef = sessaoRef.collection('chunks');
  const chunksAntigos = await chunksRef.get();
  if (!chunksAntigos.empty) {
    const batchDel = db.batch();
    chunksAntigos.docs.forEach(d => batchDel.delete(d.ref));
    await batchDel.commit();
  }

  const payload = {
    resumo,
    updated_at: new Date(),
    updated_by_uid: 'script-recuperacao',
    updated_by_email: 'script-recuperacao@local'
  };
  if (state_json.length > LIMITE_CHUNK) {
    const partes = [];
    for (let i = 0; i < state_json.length; i += LIMITE_CHUNK) partes.push(state_json.slice(i, i + LIMITE_CHUNK));
    const batch = db.batch();
    partes.forEach((parte, idx) => batch.set(chunksRef.doc(String(idx).padStart(4, '0')), { idx, parte }));
    await batch.commit();
    payload.state_json = null;
    payload.state_chunked = true;
    payload.state_chunks = partes.length;
    payload.state_bytes = state_json.length;
  } else {
    payload.state_json = state_json;
    payload.state_chunked = false;
    payload.state_chunks = 0;
    payload.state_bytes = state_json.length;
  }
  await sessaoRef.set(payload, { merge: false });
  console.log('✅ Sessão restaurada em empresas/' + CNPJ + '/sessoes/current (' + (resumo && resumo.total_lancamentos) + ' lançamentos).');
  console.log('   A versão anterior ficou em sessoes/backup_pre_restauracao.');
  console.log('   Agora basta abrir o Consultor, selecionar a empresa e aceitar o popup "Carregar versão do servidor?".');
}

function lerSessaoDeArquivo(caminho) {
  const bruto = JSON.parse(fs.readFileSync(path.resolve(caminho), 'utf-8'));
  // aceita tanto o dump gerado por este script ({cnpj, sessao: {...}}) quanto o objeto da sessao puro
  const dados = bruto && bruto.sessao ? bruto.sessao : bruto;
  if (bruto && bruto.cnpj && String(bruto.cnpj).replace(/\D/g, '') !== CNPJ) {
    console.error('❌ O dump e de outro CNPJ (' + bruto.cnpj + '); abortando para nao gravar na empresa errada.');
    process.exit(1);
  }
  if (!dados || !dados.state_json) {
    console.error('❌ Arquivo nao contem state_json — nao parece um dump valido deste script.');
    process.exit(1);
  }
  return dados;
}

(async () => {
  let dados;
  if (DE_ARQUIVO) {
    console.log('Carregando sessão do arquivo ' + DE_ARQUIVO + ' ...');
    dados = lerSessaoDeArquivo(DE_ARQUIVO);
  } else {
  console.log('Lendo empresas/' + CNPJ + '/sessoes/current como estava em ' + dataAlvo.toISOString() + ' ...');
  try {
    dados = await lerSessaoEm(dataAlvo);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error('❌ Falha na leitura point-in-time: ' + msg);
    if (/read_time|earliest|too old|out of range|INVALID_ARGUMENT|FAILED_PRECONDITION/i.test(msg)) {
      console.error('\nO horário pedido está FORA da janela de versões do banco.');
      console.error('Sem PITR o Firestore só guarda 1 hora de versões; com PITR, 7 dias.');
      console.error('Confira a janela com:');
      console.error('  gcloud firestore databases describe --database="(default)" --project=' + (PROJETO || 'SEU_PROJETO'));
      console.error('e tente um --quando dentro de earliestVersionTime.');
    }
    process.exit(2);
  }
  }

  const resumo = resumirSessao(dados);
  console.log('\nResultado da leitura:');
  console.log(JSON.stringify(resumo, null, 2));

  if (!dados || !dados.state_json) {
    console.log('\n⚠️ Não havia sessão gravada nesse momento. Tente um --quando diferente (ex.: fim do expediente de ontem, se PITR estiver ativo).');
    process.exit(3);
  }

  if (!DE_ARQUIVO) {
    const destino = path.resolve(SAIDA);
    fs.writeFileSync(destino, JSON.stringify({ recuperado_em: new Date().toISOString(), read_time: dataAlvo.toISOString(), cnpj: CNPJ, sessao: dados }, null, 2));
    console.log('\n💾 Cópia completa salva em: ' + destino);
  }

  if (typeof resumo.total_lancamentos === 'number' && resumo.total_lancamentos === 0) {
    console.log('\n⚠️ A sessão nesse horário também estava com 0 lançamentos — tente um --quando anterior (o arquivo salvo acima reflete esse horário).');
    process.exit(0);
  }

  if (RESTAURAR) {
    console.log('\nRestaurando para sessoes/current ...');
    await restaurar(dados);
  } else {
    console.log('\nPara gravar essa versão de volta no servidor, rode novamente com --restaurar');
  }
  process.exit(0);
})();
