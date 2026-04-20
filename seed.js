const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

const ADMIN_UID = 'XVeBmrzFfzYkgptfGi3wKntN77b2';

const USUARIOS = [
  { uid: '0S1wfRkQoZYD3NrSIH45YFhdPHg1', email: 'josilaine.paula@spassessoriacontabil.com.br' },
  { uid: '4luN1E6PlueiBdwYLOdjPqN4wFD3', email: 'edison.ferreira@spassessoriacontabil.com.br' },
  { uid: 'Be2SrsBnkeYqhJ6kzZoRWW6zr283', email: 'heinrik.mesquita@spassessoriacontabil.com.br' },
  { uid: 'C4ftmo6xh2MDKUdevNzuA5skqsv1', email: 'jessica.urias@spassessoriacontabil.com.br' },
  { uid: 'JLOdkoZ9x4UmorA4ghmNwyBCCMf1', email: 'jose.venancio@spassessoriacontabil.com.br' },
  { uid: 'PzAS3HX3rJVfBefxWXcxUuuHBmg1', email: 'alexandre.rosa@spassessoriacontabil.com.br' },
  { uid: 'QUOFaMUFpOMSc3rfkl3QYlqvZkk2', email: 'eliane.meneses@spassessoriacontabil.com.br' },
  { uid: 'X3iMcaGz7VhbxXLYxKxrTCyJCUt2', email: 'contabil@spassessoriacontabil.com.br' },
  { uid: 'XVeBmrzFfzYkgptfGi3wKntN77b2', email: 'junior@spassessoriacontabil.com.br', is_admin: true },
  { uid: 'dl7Aq0HxmQVGL6ONNIawjsZnS0b2', email: 'bruno.xavier@spassessoriacontabil.com.br' },
  { uid: 'hh0VXtkh3qatiERpRb0jp5lvZtr1', email: 'cristiane.macedo@spassessoriacontabil.com.br' },
  { uid: 'qFWwvs6R8cTCVBoR0Czp4JHsK9N2', email: 'patricia.vieira@spassessoriacontabil.com.br' },
  { uid: 'qOlUkHz789WPiCwLDCS2eRovgTu1', email: 'scarlet.silva@spassessoriacontabil.com.br' },
  { uid: 'qnOcvv2kZZbDp8cMsZ1TJr5tbdv1', email: 'vinicius.goncalves@spassessoriacontabil.com.br' },
  { uid: 'trBOheBtTxYIEPbV0smmRbxK3L32', email: 'soraia.aquino@spassessoriacontabil.com.br' },
  { uid: 'x1FHCcKaW1cM8h98RK5rtGdY2rx2', email: 'lucas.muniz@spassessoriacontabil.com.br' },
  { uid: 'xC0WXgWnPwVdz3ugxi99UxYi5Xy2', email: 'laiz.silva@spassessoriacontabil.com.br' },
  { uid: 'xrlJfe7qntcISNHxEjFjhxKym2y1', email: 'laicia.ribeiro@spassessoriacontabil.com.br' },
  { uid: 'y5ji6j6LaId3J1jBzwGymJ5Dzm42', email: 'carla.vieira@spassessoriacontabil.com.br' }
];

async function seedUsuarios() {
  console.log('=== 1/3 Populando users/ ===');
  for (const u of USUARIOS) {
    await db.collection('users').doc(u.uid).set({
      email: u.email, is_admin: u.is_admin === true,
      created_at: new Date(), updated_at: new Date()
    }, { merge: true });
    console.log('  - ' + u.email + (u.is_admin ? ' [ADMIN]' : ''));
  }
  console.log('');
}

async function migrarPlanosParaGlobal() {
  console.log('=== 2/3 Marcando planos existentes como globais ===');
  const snap = await db.collection('planos').get();
  for (const doc of snap.docs) {
    await doc.ref.set({
      global: true, owner_uid: null, updated_at: new Date()
    }, { merge: true });
    console.log('  - ' + doc.id + ' ' + (doc.data().nome || '') + ' -> global');
  }
  console.log('');
}

async function atribuirEmpresasAoAdmin() {
  console.log('=== 3/3 Atribuindo empresas existentes ao admin ===');
  const snap = await db.collection('empresas').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.owner_uid) {
      await doc.ref.set({
        owner_uid: ADMIN_UID, updated_at: new Date()
      }, { merge: true });
      console.log('  - ' + doc.id + ' (' + (data.razao_social || '') + ') -> admin');
    } else {
      console.log('  - ' + doc.id + ' ja tem owner, pulando');
    }
  }
  console.log('');
}

async function run() {
  console.log('====================================');
  console.log('SEED Multi-Tenant');
  console.log('====================================\n');
  await seedUsuarios();
  await migrarPlanosParaGlobal();
  await atribuirEmpresasAoAdmin();
  console.log('OK - Seed completo');
  console.log('Admin: junior@spassessoriacontabil.com.br (' + ADMIN_UID + ')');
  console.log('Usuarios: ' + USUARIOS.length);
}

run().catch(err => { console.error('Erro seed:', err); process.exit(1); });
