// ============================================================================
// ✅ R-4099 — o FECHAMENTO da série R-4000, corroborado por evento ACEITO
//
// É ele que manda a Receita apurar: sem fechamento, os R-4010/R-4020 do mês
// ficam recebidos e NÃO viram totalizador nem DARF.
//
// 📌 O GERADOR JÁ EXISTIA (`reinf-utils.gerarR4099`) e **nunca tinha teste** —
// achado ao procurar onde escrever um novo. Escrever um segundo gerador teria
// sido a segunda cópia que esta casa mais paga; o que faltava era a PROVA.
//
// Em 01/09 o Paulo mandou o evento REAL do CONDOMINIO EDIFICIO MONTE CARLO
// (ID1546611450000002026070710351178536, perApur 2026-06, tpAmb 1), e ele
// confirma o gerador campo a campo:
//
//   <evtFech id="ID…">
//     <ideEvento><perApur>2026-06</perApur><tpAmb>1</tpAmb>
//                <procEmi>2</procEmi><verProc>REINF.Web</verProc></ideEvento>
//     <ideContri><tpInsc>1</tpInsc><nrInsc>54661145</nrInsc></ideContri>
//     <ideRespInf><nmResp/><cpfResp/><telefone/><email/></ideRespInf>
//     <infoFech><fechRet>0</fechRet></infoFech>
//   </evtFech>
//
// ⚠️ CORROBORAÇÃO NÃO É CÓPIA: o gerador foi escrito antes, por outro caminho,
// e o arquivo aceito concorda com ele. Dois caminhos independentes no mesmo
// resultado é o que esta casa aceita como prova — diferente de "passei no meu
// próprio teste".
// ============================================================================
const assert = require('assert');
const { gerarR4099, NS_R4099 } = require('../reinf/reinf-utils');

const real = {
  contribuinte: { tpInsc: 1, nrInsc: '54661145000162' },
  perApur: '2026-06',
  tpAmb: 1,
  fechRet: 0,
  respInfo: {
    nome: 'PAULO CESAR PEREIRA',
    cpf: '00000000000',           // ⚠️ CPF real não entra em teste versionado
    telefone: '1131551554',
    email: 'alexandre@spassessoriacontabil.com.br',
  },
};

const { id, xml } = gerarR4099(real);

// ─── 1. Envelope ────────────────────────────────────────────────────────────
assert.ok(NS_R4099.includes('evt4099FechamentoDirf'), 'namespace do R-4099');
assert.ok(xml.includes(`<Reinf xmlns="${NS_R4099}">`));
assert.ok(/<evtFech id="ID\d{34}">/.test(xml), 'o elemento é evtFech, com id de 34 dígitos');
assert.strictEqual(id.length, 36, 'ID + 34 dígitos');

// ─── 2. A RAIZ de 8 dígitos, não o CNPJ inteiro ─────────────────────────────
// O evento aceito traz `<nrInsc>54661145</nrInsc>` para o estabelecimento
// 54661145000162 — mandar os 14 é a recusa clássica da série.
assert.ok(xml.includes('<nrInsc>54661145</nrInsc>'), 'contribuinte vai pela RAIZ');
assert.ok(!xml.includes('<nrInsc>54661145000162</nrInsc>'));

// ─── 3. A ORDEM — `infoFech` é sequence, e trocar irmãos derruba o evento ────
// (foi o que segurou o R-2099 em produção: `evtAquis` fora de lugar)
const ordem = ['<ideEvento>', '<perApur>', '<tpAmb>', '<procEmi>', '<verProc>',
  '</ideEvento>', '<ideContri>', '<ideRespInf>', '<nmResp>', '<cpfResp>',
  '<telefone>', '<email>', '</ideRespInf>', '<infoFech>', '<fechRet>'];
let pos = -1;
for (const tag of ordem) {
  const i = xml.indexOf(tag);
  assert.ok(i > pos, `${tag} fora de ordem`);
  pos = i;
}

// ─── 4. `procEmi` sai 1, e isso é DECISÃO ───────────────────────────────────
// ⚠️ O arquivo de referência traz `2` porque foi digitado no REINF.Web. Copiar
// o 2 seria declarar que ESTE evento saiu do portal da Receita, o que é falso.
assert.ok(xml.includes('<procEmi>1</procEmi>'), 'procEmi 1 = software do contribuinte');
assert.ok(!xml.includes('REINF.Web'), 'o verProc é o NOSSO, não o do portal');

// ─── 5. fechRet: 0 fecha, 1 REABRE ──────────────────────────────────────────
assert.ok(xml.includes('<fechRet>0</fechRet>'));
assert.ok(gerarR4099({ ...real, fechRet: 1 }).xml.includes('<fechRet>1</fechRet>'),
  'reabertura tem de ser possível — competência retificada precisa reabrir');

// ─── 6. Responsável ausente não vira bloco vazio ────────────────────────────
// ⚠️ `<ideRespInf>` com nome em branco declara um responsável que não existe.
// Sem os dados, o bloco simplesmente não sai (ele é opcional no leiaute).
const semResp = gerarR4099({ ...real, respInfo: undefined }).xml;
assert.ok(!semResp.includes('<ideRespInf>'), 'sem responsável o bloco não sai');
assert.ok(!gerarR4099({ ...real, respInfo: { nome: 'X' } }).xml.includes('<ideRespInf>'),
  'responsável sem CPF não vira bloco pela metade');

// ─── 7. Pré-condições ───────────────────────────────────────────────────────
assert.throws(() => gerarR4099({ ...real, perApur: '06/2026' }), /perApur/,
  'competência fora do formato é recusada — fechar o mês errado não volta atrás');
assert.throws(() => gerarR4099({ ...real, tpAmb: 3 }), /tpAmb/);

console.log('✓ R-4099: fechamento da série R-4000 corroborado por evento aceito em produção');
