'use strict';

const admin = require('firebase-admin');
const estrutura = require('./fixtures/fastweld-balancete-estrutura-2026-02.json');

const CNPJ = '02942184000134';
const SOURCE_FILE = 'Balancete_012026_a_022026.pdf';
const SOURCE_SHA256 = '3d36e64bcdd551f807cdf37e92df573c0de08d7fc9c6450e1c9e3964e3aa0eab';
const aplicar = process.argv.includes('--apply');

function docId(codigo) {
  return 'sintetica_' + String(codigo).replace(/[^0-9A-Za-z_-]/g, '_');
}

async function main() {
  admin.initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0569062468' });
  const db = admin.firestore();
  const empresaDoc = await db.collection('empresas').doc(CNPJ).get();
  if (!empresaDoc.exists) throw new Error('Empresa FASTWELD não localizada.');
  const empresa = empresaDoc.data() || {};
  if (!empresa.plano_id) throw new Error('FASTWELD não possui plano_id.');

  const planoRef = db.collection('planos').doc(empresa.plano_id);
  const planoDoc = await planoRef.get();
  if (!planoDoc.exists) throw new Error('Plano vinculado não localizado: ' + empresa.plano_id);
  const contasRef = planoRef.collection('contas');
  const atuais = await contasRef.get();
  const porCodigo = new Map();
  atuais.docs.forEach(function (doc) {
    const dados = doc.data() || {};
    const codigo = String(dados.cod || dados.codigo || '').trim();
    if (codigo) porCodigo.set(codigo, { id: doc.id, dados });
  });

  const conflitos = [];
  const pendentes = [];
  const existentes = [];
  estrutura.forEach(function (item) {
    const codigo = item[0];
    const descricao = item[1];
    const atual = porCodigo.get(codigo);
    if (!atual) return pendentes.push({ codigo, descricao });
    if (atual.dados.analitica !== false || String(atual.dados.desc || atual.dados.descricao || '').trim() !== descricao) {
      conflitos.push({ codigo, esperado: descricao, atual: atual.dados });
    } else existentes.push(codigo);
  });
  if (conflitos.length) throw new Error('Migração interrompida por conflitos: ' + conflitos.map(c => c.codigo).join(', '));

  console.log(JSON.stringify({ modo: aplicar ? 'apply' : 'dry-run', cnpj: CNPJ, plano_id: empresa.plano_id, contas_atuais: atuais.size, sinteticas_referencia: estrutura.length, ja_existentes: existentes.length, a_inserir: pendentes.length }, null, 2));
  if (!aplicar || !pendentes.length) return;

  for (let i = 0; i < pendentes.length; i += 400) {
    const batch = db.batch();
    pendentes.slice(i, i + 400).forEach(function (item) {
      batch.create(contasRef.doc(docId(item.codigo)), {
        cod: item.codigo,
        desc: item.descricao,
        reduzido: '',
        ref_rfb: null,
        analitica: false,
        source_reference: SOURCE_FILE,
        source_sha256: SOURCE_SHA256,
        migration_id: 'fastweld-balancete-structure-v1',
        created_by: 'codex-migration',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }
  const depois = await contasRef.get();
  const sinteticas = depois.docs.filter(function (doc) { return doc.data().analitica === false; });
  if (sinteticas.length < estrutura.length) throw new Error('Verificação pós-migração falhou: apenas ' + sinteticas.length + ' sintéticas.');
  console.log(JSON.stringify({ ok: true, inseridas: pendentes.length, contas_depois: depois.size, sinteticas_depois: sinteticas.length }));
}

main().catch(function (erro) {
  console.error(erro.stack || erro.message || erro);
  process.exitCode = 1;
}).finally(async function () {
  if (admin.apps.length) await admin.app().delete();
});
