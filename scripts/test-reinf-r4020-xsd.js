// ============================================================================
// 🚨 O XSD DESTRAVOU A SCHROEDER — e a tabela do módulo é PROVADA contra ele.
//
// 04/09, Paulo (PEC PRONTA ENTREGA · 08/2026, beneficiário SCHROEDER: bruto
// 6.136,91 · IRRF 92,05 · PIS 39,89 · COFINS 184,11 · CSLL 61,37):
// *"aqui já está tudo certo para transmitir, mas está com essa mensagem e nem
// está aparecendo o botão de transmitir"*.
//
// O bloqueio era honesto — IRRF + CSRF completa exige os dois no MESMO
// <retencoes>, e nenhum arquivo aceito mostrava isso, nem a ORDEM. Só que o
// buraco era de NOME e de ORDEM, e quem responde isso é o SCHEMA.
//
// 📖 O XSD `evt4020PagtoBeneficiarioPJ-v2_01_02` entrou em `docs/reinf/xsd/` e
// declara a sequence inteira, todos com minOccurs="0":
//   vlrBaseIR · vlrIR · vlrBaseAgreg · vlrAgreg · vlrBaseCSLL · vlrCSLL ·
//   vlrBaseCofins · vlrCofins · vlrBasePP · vlrPP
//
// ✅ E ELE EXPLICA OS DOIS ARQUIVOS ACEITOS, campo a campo: o de 06/2026 usa as
// posições 3-4 e o de 07/2026 usa 1, 2, 7, 8, 9 e 10, na ordem. Schema que bate
// com duas provas de PRODUÇÃO é corroboração, não dedução.
//
// ⚠️ A TABELA É LIDA DO ARQUIVO, nunca da memória (a régua da `XSD_DERE` do
// CFI): tabela digitada é a segunda cópia, e ela envelhece em silêncio quando
// o leiaute muda de versão.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  RETENCOES_XSD, RETENCOES_SEPARADAS, NS_R4020, NOME_CERTO_DO_CAMPO,
  gerarR4020, pagamentoR4020DoBeneficiario, bloqueioDoR4020, validarPagamentoR4020,
} = require('../reinf/gerar-r4020');

const XSD = path.join(__dirname, '..', 'docs', 'reinf', 'xsd',
  'evt4020PagtoBeneficiarioPJ-v2_01_02.xsd');
const xsd = fs.readFileSync(XSD, 'utf8');

// ─── 1. O ARQUIVO É O QUE DIZ SER ──────────────────────────────────────────
// Sem isto o teste passaria sobre qualquer XSD — inclusive o de outro evento
// ou de outra versão, que é justamente o erro que ele existe para pegar.
assert.ok(xsd.includes(`targetNamespace="${NS_R4020}"`),
  'o XSD guardado tem de ser o do MESMO namespace que o gerador emite');

// ─── 2. A TABELA SAI DO ARQUIVO ────────────────────────────────────────────
const i = xsd.indexOf('name="retencoes"');
assert.ok(i > 0, 'o XSD tem de declarar o elemento <retencoes>');
const trecho = xsd.slice(i, i + 16000);
const declarados = [];
const rx = /<xs:element name="(vlr[A-Za-z]+)"/g;
let m;
while ((m = rx.exec(trecho)) && declarados.length < 10) declarados.push(m[1]);

const doModulo = RETENCOES_XSD.flat();
assert.deepStrictEqual(doModulo, declarados,
  'a tabela do módulo tem de ser a sequence do XSD, na MESMA ordem');

// 🚨 O NOME DA CSLL É EM MAIÚSCULAS — este módulo listava `vlrCsll` como campo
// "não mapeado", e esse nome NÃO EXISTE. É o `vlrPis` de novo: o palpite erra
// a caixa das letras, e o evento sai recusado (ou aceito declarando outra coisa).
assert.ok(doModulo.includes('vlrCSLL') && doModulo.includes('vlrBaseCSLL'),
  'o nome da CSLL no leiaute é vlrCSLL/vlrBaseCSLL');
assert.ok(!doModulo.includes('vlrCsll') && !doModulo.includes('vlrPis'),
  'os nomes palpitados não entram na tabela');

// ⚠️ TODOS OPCIONAIS — é isso que permite omitir o tributo que não houve (o
// arquivo aceito de 07/2026 omite a CSLL) e combinar IR com agregada.
for (const campo of doModulo) {
  const re = new RegExp(`<xs:element name="${campo}"[^>]*minOccurs="0"`);
  assert.ok(re.test(trecho), `${campo} tem de ser minOccurs="0" no XSD`);
}

// A lista de "separados" é a do XSD sem o par agregado — derivada, não copiada.
assert.ok(!RETENCOES_SEPARADAS.some(([b]) => b === 'vlrBaseAgreg'));
assert.strictEqual(RETENCOES_SEPARADAS.length, RETENCOES_XSD.length - 1);

// ─── 3. OS DOIS ARQUIVOS ACEITOS CABEM NA SEQUENCE ─────────────────────────
// É esta conferência que autoriza usar o XSD: ele não contradiz a produção —
// ele EXPLICA as duas provas que já tínhamos.
const pos = (c) => doModulo.indexOf(c);
assert.ok(pos('vlrBaseIR') < pos('vlrIR')
  && pos('vlrIR') < pos('vlrBaseCofins')
  && pos('vlrBaseCofins') < pos('vlrCofins')
  && pos('vlrCofins') < pos('vlrBasePP')
  && pos('vlrPP') === doModulo.length - 1,
  'a ordem do aceito de 07/2026 (IR → COFINS → PP) tem de caber na sequence');
assert.ok(pos('vlrIR') < pos('vlrBaseAgreg'),
  'e o IR vem ANTES da agregada — era exatamente isso que faltava saber');

// ─── 4. A SCHROEDER DESTRAVA, com os números do print ──────────────────────
const SCHROEDER = {
  bruto: 6136.91, ir: 92.05, pis: 39.89, cofins: 184.11, csll: 61.37,
  natureza: '15004', dataFatoGerador: '2026-08-20',
};
assert.strictEqual(bloqueioDoR4020(SCHROEDER), null,
  'IRRF + CSRF completa deixou de bloquear — o XSD declara os dois e a ordem');

const pago = pagamentoR4020DoBeneficiario(SCHROEDER);
assert.strictEqual(pago.vlrIR, 92.05);
assert.strictEqual(pago.vlrAgreg, 285.37, 'a CSRF sobe agregada: 39,89 + 184,11 + 61,37');
assert.deepStrictEqual(validarPagamentoR4020(pago), []);

const ev = gerarR4020({
  contribuinte: { tpInsc: 1, nrInsc: '55070577000161' },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: '55070577000161' },
  perApur: '2026-08', tpAmb: 2, beneficiario: { cnpj: '13178324000195' },
  pagamentos: [pago],
});
const bloco = ev.xml.match(/<retencoes>[\s\S]*?<\/retencoes>/)[0];
// 🚨 A ORDEM É DADO: IR antes da agregada, como a sequence manda. Trocar dois
// irmãos derruba o evento — foi o que derrubou o R-2099 três vezes.
assert.ok(bloco.indexOf('<vlrBaseIR>') < bloco.indexOf('<vlrBaseAgreg>'),
  'o XML sai na ordem do XSD');
assert.ok(bloco.includes('<vlrIR>92,05</vlrIR>') && bloco.includes('<vlrAgreg>285,37</vlrAgreg>'));
// ⚠️ E não inventa a CSLL separada: com a CSRF agregada ela não sai.
assert.ok(!bloco.includes('vlrCSLL'), 'a CSRF agregada não emite a CSLL separada junto');

// ─── 5. O NOME ERRADO CONTINUA BARRADO — e agora diz o CERTO ───────────────
// A lista deixou de significar "campo impossível" e passou a significar "nome
// que não existe". A mensagem muda junto: mandar esperar um arquivo aceito
// sobre um campo cujo nome já se conhece é mandar ao lugar errado.
for (const [errado, certo] of Object.entries(NOME_CERTO_DO_CAMPO)) {
  const erros = validarPagamentoR4020({
    natRend: '15099', dtFG: '2026-07-23', vlrBruto: 10000, [errado]: 100,
  });
  assert.ok(erros.some((x) => x.includes(errado) && x.includes(certo)),
    `${errado} tem de ser barrado dizendo que o nome certo é ${certo}`);
}

// ─── 6. NADA REGRIDE nos dois casos já provados ────────────────────────────
const semCsll = pagamentoR4020DoBeneficiario({
  bruto: 10000, ir: 150, pis: 65, cofins: 300, csll: 0,
  natureza: '15099', dataFatoGerador: '2026-07-23',
});
assert.ok(semCsll.vlrAgreg === undefined, 'sem CSLL continua separada');
const evSem = gerarR4020({
  contribuinte: { tpInsc: 1, nrInsc: '62827860' },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: '62827860000150' },
  perApur: '2026-07', tpAmb: 2, beneficiario: { cnpj: '08930337000100' },
  pagamentos: [semCsll],
});
const bSem = evSem.xml.match(/<retencoes>[\s\S]*?<\/retencoes>/)[0];
assert.ok(bSem.indexOf('<vlrIR>') < bSem.indexOf('<vlrCofins>')
  && bSem.indexOf('<vlrCofins>') < bSem.indexOf('<vlrPP>'),
  'a ordem do arquivo aceito de 07/2026 continua idêntica');
assert.ok(!bSem.includes('vlrAgreg'));

const soCsrf = pagamentoR4020DoBeneficiario({
  bruto: 3210.96, ir: 0, pis: 20.87, cofins: 96.33, csll: 32.11,
  natureza: '15099', dataFatoGerador: '2026-06-13',
});
assert.strictEqual(soCsrf.vlrAgreg, 149.31, 'o aceito de 06/2026 continua fechando ao centavo');

console.log('✓ R-4020: o XSD destravou IRRF + CSRF agregada, e a tabela é lida do schema');
