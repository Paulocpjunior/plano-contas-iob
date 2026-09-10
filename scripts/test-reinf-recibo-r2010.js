// ============================================================================
// O RECIBO DO R-2010 — e a leitura do MS1028 (10/09/2026, J.N. VINATEX).
//
// Corrigido o `obs` que derrubava o lote com MS0030, a competência 08/2026 foi
// transmitida de novo e voltou MS1028: "não é permitido o envio de mais de um
// evento para o mesmo contribuinte, num mesmo período de apuração para um mesmo
// estabelecimento e prestador, exceto se for para retificação…".
//
// Ou seja: o evento JÁ EXISTE. A rota só sabia mandar ORIGINAL e o recibo que a
// Receita devolve em cada evento aceito era DESCARTADO — a competência entregue
// ficava trancada dentro do app, e a tela ainda dizia "nada foi aceito".
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const {
  idReciboR2010, recibosDoRetornoR2010, duplicidadeR2010, ehDuplicidadeR2010,
  retificacaoDoPrestador, COD_DUPLICIDADE_R2010,
} = require('../reinf/recibo-r2010');

// CNPJs FICTÍCIOS — dado de cliente não entra no repositório. O que se prova
// aqui é a FORMA, e ela não depende de qual empresa é.
const TOMADOR = '11111111000191';
const ESTAB = '11111111000272';   // filial: estabelecimento ≠ contribuinte
const PREST_A = '22222222000191';
const PREST_B = '33333333000191';

// ── 1. A CHAVE É A QUE A RECEITA NOMEIA NO MS1028 ───────────────────────────
const chave = { tpAmb: 1, perApur: '2026-08', cnpjContribuinte: TOMADOR, cnpjEstab: ESTAB, cnpjPrestador: PREST_A };
assert.strictEqual(idReciboR2010(chave), '1_202608_11111111000191_11111111000272_22222222000191');

// A competência circula em mais de uma forma neste projeto; a chave não pode
// depender disso — ler vazio aqui significa "não tenho recibo", que é mandar um
// original que a Receita já tem (o MS1028 de novo).
assert.strictEqual(idReciboR2010({ ...chave, perApur: '202608' }), idReciboR2010(chave));
assert.strictEqual(idReciboR2010({ ...chave, cnpjContribuinte: '11.111.111/0001-91' }), idReciboR2010(chave));

// O AMBIENTE separa: recibo de produção restrita não retifica evento de produção.
assert.notStrictEqual(idReciboR2010({ ...chave, tpAmb: 2 }), idReciboR2010(chave));
// E o ESTABELECIMENTO separa: matriz e filial são eventos diferentes.
assert.notStrictEqual(idReciboR2010({ ...chave, cnpjEstab: TOMADOR }), idReciboR2010(chave));

// ── 2. O RECIBO SE LÊ DO RETORNO, PAREADO PELO id — NUNCA PELA ORDEM ────────
// O lote reescreve o Id do WRAPPER para não colidir com o id assinado, então
// ordem não é identidade. Aqui o retorno vem TROCADO de propósito.
const enviados = [
  { id: 'ID0000000000000000000000000000000001', cnpjPrestador: PREST_A, cnpjTomador: ESTAB },
  { id: 'ID0000000000000000000000000000000002', cnpjPrestador: PREST_B, cnpjTomador: ESTAB },
];
const retorno = [
  { idEv: 'ID0000000000000000000000000000000002', nrRecArqBase: '0000002-01-2010-2608-0000002', codResp: [] },
  { idEv: 'ID0000000000000000000000000000000001', nrRecArqBase: '0000001-01-2010-2608-0000001', codResp: [] },
];
const lido = recibosDoRetornoR2010(retorno, enviados);
assert.strictEqual(lido.aceitos.length, 2);
const porPrestador = Object.fromEntries(lido.aceitos.map((a) => [a.cnpjPrestador, a.nrRecibo]));
assert.strictEqual(porPrestador[PREST_A], '0000001-01-2010-2608-0000001', 'o recibo casa pelo id, não pela posição');
assert.strictEqual(porPrestador[PREST_B], '0000002-01-2010-2608-0000002');
assert.strictEqual(lido.aceitos[0].cnpjEstab, ESTAB, 'o estabelecimento do evento entra na chave');

// EVENTO COM OCORRÊNCIA NÃO VIRA RECIBO: recibo é prova POSITIVA de registro.
// Gravar o de um evento recusado faria a transmissão seguinte retificar contra
// um evento que a Receita não tem.
const comErro = recibosDoRetornoR2010([
  { idEv: enviados[0].id, nrRecArqBase: '0000001-01-2010-2608-0000001', codResp: ['MS0030'] },
  { idEv: enviados[1].id, nrRecArqBase: '', codResp: ['MS0030'] },
], enviados);
assert.strictEqual(comErro.aceitos.length, 0, 'evento com codResp não rende recibo');
assert.strictEqual(comErro.semRecibo.length, 2);

// Evento que não saiu deste lote não entra — retorno de outro envio não
// contamina os recibos desta competência.
assert.strictEqual(recibosDoRetornoR2010(
  [{ idEv: 'ID9999999999999999999999999999999999', nrRecArqBase: 'x-01-2010-2608-x', codResp: [] }], enviados,
).aceitos.length, 0);

// ── 3. MS1028 TEM LEITURA PRÓPRIA ──────────────────────────────────────────
const TEXTO_REAL = 'Não é permitido o envio de mais de um evento para o mesmo contribuinte, num mesmo '
  + 'período de apuração para um mesmo estabelecimento e prestador, exceto se for para retificação de '
  + 'um evento enviado anteriormente ou se o evento anterior tiver sido excluído.';

assert.ok(ehDuplicidadeR2010({ codigo: COD_DUPLICIDADE_R2010, descricao: '' }), 'reconhece pelo código');
assert.ok(ehDuplicidadeR2010({ codigo: 'XX9999', descricao: TEXTO_REAL }), 'e pelo texto, se o código mudar');
assert.ok(!ehDuplicidadeR2010({ codigo: 'MS0030', descricao: 'The actual length is greater than the MaxLength value' }));

assert.strictEqual(duplicidadeR2010([{ codigo: 'MS0030', descricao: 'schema' }]), null,
  'sem duplicidade, sem leitura — alarme sobre recusa comum é o que faz ignorar o alarme');

const dup = duplicidadeR2010([{ codigo: COD_DUPLICIDADE_R2010, descricao: TEXTO_REAL }], { tinhaRecibo: false });
assert.strictEqual(dup.quantidade, 1);
// 🚨 A FRASE MAIS CARA DO CASO: "nada foi aceito" se lê como competência SEM
// entrega e manda transmitir de novo — que devolve exatamente o mesmo MS1028.
const frase = [dup.titulo, dup.explicacao, dup.acao].join(' ');
assert.ok(!/nada foi aceito/i.test(frase), 'MS1028 NUNCA é dito como "nada foi aceito"');
assert.ok(/JÁ EXISTE/i.test(dup.titulo), 'o título diz o que a Receita afirmou');
assert.ok(/e-CAC/i.test(frase), 'a ação manda conferir na FONTE');
assert.ok(/retifica/i.test(dup.acao), 'e nomeia a saída');

// As duas situações pedem ações OPOSTAS: com recibo guardado, sair um ORIGINAL
// é defeito de caminho (do app); sem recibo, a saída é digitar o número.
const dupComRecibo = duplicidadeR2010([{ codigo: COD_DUPLICIDADE_R2010, descricao: TEXTO_REAL }], { tinhaRecibo: true });
assert.notStrictEqual(dupComRecibo.acao, dup.acao);
assert.ok(/time/i.test(dupComRecibo.acao), 'com recibo, a ação é reportar — não redigitar');

// ── 4. ORIGINAL × RETIFICAÇÃO — POR PRESTADOR, NUNCA POR LOTE ──────────────
const recibos = new Map([[idReciboR2010(chave), { nrRecibo: '0000001-01-2010-2608-0000001' }]]);
assert.deepStrictEqual(retificacaoDoPrestador(recibos, chave),
  { indRetif: 2, nrRecibo: '0000001-01-2010-2608-0000001' });
// Prestador sem recibo sai ORIGINAL — herdar o recibo do vizinho é ACEITO pela
// Receita e escreve em cima do evento errado.
assert.deepStrictEqual(retificacaoDoPrestador(recibos, { ...chave, cnpjPrestador: PREST_B }), { indRetif: 1 });
// Estabelecimento diferente é evento diferente.
assert.deepStrictEqual(retificacaoDoPrestador(recibos, { ...chave, cnpjEstab: TOMADOR }), { indRetif: 1 });
// Ambiente diferente idem.
assert.deepStrictEqual(retificacaoDoPrestador(recibos, { ...chave, tpAmb: 2 }), { indRetif: 1 });
// Mapa vazio (primeira transmissão da competência) segue funcionando.
assert.deepStrictEqual(retificacaoDoPrestador(new Map(), chave), { indRetif: 1 });

// ── 5. A LIGAÇÃO SE MEDE, NÃO SE LEMBRA ────────────────────────────────────
// Régua que só existe no módulo é régua que ninguém chama (a "rota sem botão"
// do lado do backend). A varredura cobra as DUAS metades: ler os recibos antes
// de montar os eventos, e GRAVAR os que o retorno devolveu.
const rotas = fs.readFileSync(`${__dirname}/../reinf-routes.js`, 'utf8');
assert.ok(rotas.includes("router.post('/servicos-tomados/recibo'"), 'a porta de informar o recibo existe');
assert.ok(/lerRecibosR2010\(db, \{/.test(rotas), 'a transmissão LÊ os recibos da competência');
assert.ok(/\.\.\.retificacaoDoPrestador\(recibos, \{/.test(rotas),
  'e aplica a retificação POR PRESTADOR — no lote, o recibo de um valeria para todos');
assert.ok(/gravarRecibosR2010\(db, \{/.test(rotas), 'e GRAVA o recibo que o retorno devolveu');
assert.ok(/recibosDoRetornoR2010\(\s*parseRetornoEventos\(/.test(rotas),
  'o retorno é lido pelo parser que já existe — segunda cópia divergiria no primeiro campo novo');
assert.ok(/duplicidadeR2010\(ocorrencias/.test(rotas), 'e o MS1028 é traduzido antes de chegar na tela');

// A tela precisa DIZER: leitura que o backend produz e ninguém lê é a flag que
// ninguém consome, pela enésima vez nesta casa.
const tela = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
assert.ok(/resp\.duplicidade/.test(tela), 'a tela lê a leitura do MS1028');
assert.ok(/formularioReciboR2010/.test(tela), 'e oferece a saída onde a trava aparece');
assert.ok(/reinfServicoTomadoRecibo/.test(tela), 'com a porta ligada');
// O "onde" da ocorrência (localErroAviso) é extraído de propósito desde 12/08 —
// e a tela do R-2010 lia um campo que não existe, então ele nunca aparecia.
assert.ok(/o\.localizacao/.test(tela), 'a tela lê a localização que o backend extrai');

const adapter = fs.readFileSync(`${__dirname}/../api-adapter.js`, 'utf8');
assert.ok(/reinfServicoTomadoRecibo/.test(adapter), 'a chamada existe no adapter');

console.log('✓ recibo do R-2010 e leitura do MS1028: OK');
