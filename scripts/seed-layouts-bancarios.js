const { Firestore } = require('@google-cloud/firestore');
const { LAYOUTS_BANCARIOS_PADRAO, normalizarBancoLayout, layoutBancoId } = require('../layouts-bancarios-padrao');

const db = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0569062468' });

async function main() {
  const col = db.collection('layouts_bancarios');
  for (const layout of LAYOUTS_BANCARIOS_PADRAO) {
    const banco = normalizarBancoLayout(layout.banco);
    const id = layoutBancoId({ banco, parser: layout.parser });
    const ref = col.doc(id);
    const doc = await ref.get();
    const atual = doc.exists ? doc.data() : {};
    await ref.set({
      ...layout,
      ...atual,
      banco,
      parser: layout.parser,
      nome: layout.nome,
      nomeBanco: layout.nomeBanco,
      formato: layout.formato,
      confiabilidade: layout.confiabilidade,
      status: layout.status || 'Ativo',
      ativo: true,
      ultimoTeste: layout.ultimoTeste,
      observacao: layout.observacao,
      origem: atual.origem || 'padrao_sistema',
      criado_em: atual.criado_em || new Date(),
      atualizado_em: new Date()
    }, { merge: true });
    console.log(`ok ${id} - ${layout.nome}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
