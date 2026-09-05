'use strict';
const crypto = require('crypto');
function colecaoContas(ref, dados) {
  return dados && dados.contas_versao
    ? ref
        .collection('versoes_contas')
        .doc(dados.contas_versao)
        .collection('contas')
    : ref.collection('contas');
}
function normalizarContas(contas) {
  if (!Array.isArray(contas) || !contas.length)
    throw Object.assign(
      new Error(
        'Informe as contas. Não é permitido esvaziar o plano por substituição.'
      ),
      { status: 400 }
    );
  const codigos = new Set();
  return contas.map((c) => {
    const cod = String((c && (c.codigo || c.cod)) || '').trim(),
      desc = String((c && (c.descricao || c.desc)) || '').trim();
    if (!cod || !desc || codigos.has(cod))
      throw Object.assign(
        new Error(
          'Contas exigem código e descrição; códigos não podem se repetir.'
        ),
        { status: 400 }
      );
    codigos.add(cod);
    return {
      cod,
      desc,
      reduzido: String(c.reduzido || ''),
      ref_rfb: c.reduzido || c.ref_rfb || null,
      analitica: c.analitica !== false
    };
  });
}
async function publicarContas(db, ref, contas, user, snapshotAnterior) {
  const novas = normalizarContas(contas);
  const anterior = snapshotAnterior || (await ref.get());
  if (!anterior.exists)
    throw Object.assign(new Error('Plano não encontrado'), { status: 404 });
  const versao = crypto.randomUUID();
  const destino = ref.collection('versoes_contas').doc(versao);
  for (let i = 0; i < novas.length; i += 400) {
    const batch = db.batch();
    novas
      .slice(i, i + 400)
      .forEach((c, j) =>
        batch.set(destino.collection('contas').doc(String(i + j)), {
          ...c,
          created_by: user.uid,
          created_at: new Date()
        })
      );
    await batch.commit();
  }
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    if (!atual.exists || !atual.updateTime.isEqual(anterior.updateTime))
      throw Object.assign(
        new Error(
          'O plano mudou durante a preparação. Confira e tente novamente.'
        ),
        { status: 409 }
      );
    tx.set(destino, {
      quantidade: novas.length,
      publicado_em: new Date(),
      por_uid: user.uid,
      versao_anterior: anterior.data().contas_versao || null
    });
    tx.update(ref, {
      contas_versao: versao,
      contas_atualizadas_em: new Date()
    });
  });
  return {
    ok: true,
    inseridas: novas.length,
    deletadas: 0,
    versao,
    plano_id: ref.id
  };
}
module.exports = { colecaoContas, normalizarContas, publicarContas };
