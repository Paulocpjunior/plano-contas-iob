const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();
(async () => {
  const snap = await db.collection('users').get();
  console.log('Total:', snap.size);
  const admins = [];
  snap.docs.forEach(d => {
    const u = d.data();
    const tag = u.is_admin ? ' [ADMIN]' : '';
    console.log('  -', d.id, '|', (u.email || '(sem email)'), tag);
    if (u.is_admin) admins.push(u.email || d.id);
  });
  console.log('\nADMINS TOTAIS:', admins.length);
  admins.forEach(a => console.log('  *', a));
})();
