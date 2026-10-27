'use strict';
const assert = require('assert');
const iconv = require('iconv-lite');
const { lerConferenciaSAGE, ehConferenciaSAGE } = require('../importacao-sage-conferencia');
const { lerFI, prepararFI } = require('../importacao-fi');
const { registrar } = require('../importacao-fi-routes');

// Dados fictícios no leiaute do relatório real (Digita12.txt): número na col. 2,
// data na 13, débito na 19, crédito na 36, valor até a 67, histórico na 72, complemento na 78.
const cnpj = '11222333000181';
const sep = ' ' + '-'.repeat(131);
const cabecalho = folha => [
  ' CONFERENCIA DE LANCAMENTOS'.padEnd(112) + 'Folha ..:     ' + String(folha).padStart(6, '0'),
  ' 0999 - EMPRESA FICTICIA LTDA'.padEnd(112) + 'Data ...: 27/10/2026',
  ' CNPJ: 11.222.333/0001-81'.padEnd(99) + 'Periodo : 01/12/2025 a 31/12/2025', sep,
  ' DO LANCAMENTO: 0000000000 ATE O LANCAMENTO: 0000000000', sep,
  ' N.LANCTO   DATA  CTA DEB.         CTA CRED.                VALOR      HIST. COMPLEMENTO', sep];
const lanc = (n, data, d, c, valor, hist, texto) =>
  ' ' + String(n).padStart(10, '0') + ' ' + data + ' ' + d.padEnd(17) + c.padEnd(17) + valor.padStart(15) + '    ' + hist + (hist === '0000' ? '   ' : '  ') + texto;
const cont = texto => ' '.repeat(77) + texto;
const sub = (d, c, valor, hist, texto) => ' '.repeat(18) + d.padEnd(17) + c.padEnd(17) + valor.padStart(15) + '    ' + hist + '  ' + texto;
function relatorio({ linhas, quantidade, diferenca = 'NAO HA DIFERENCA' } = {}) {
  const corpo = linhas || [
    lanc(1, '01/12', '1.1.1.02.0002', '1.1.2.03.0010', '530,00', '1299', 'VR.REF A PIX TRANSF CLIENTE 01/12'),
    lanc(2, '01/12', '5.1.1.03.0004', '1.1.1.02.0002', '3,60', '0000', 'TARIFA REGISTRO COBRANCA'),
    lanc(3, '02/12', '1.1.2.01.0001', '3.1.1.01.0002', '4.438,00', '0602', 'VENDAS A PRAZO CFE NF-E: 922 SERIE: 1 CONDOMINIO '),
    cont('PARQUE FICTICIO'),
  ];
  const total = quantidade ?? corpo.filter(l => /^ \d{10} /.test(l)).length;
  return ['\x0f', ' '.repeat(51), ...cabecalho(1), ...corpo.slice(0, 2), sep + '\x0c', ...cabecalho(2), ...corpo.slice(2),
    sep, ' ' + diferenca, sep, ' QUANTIDADE DE LANCAMENTOS : ' + total, sep + '\x0c', ''].join('\r\n');
}
const buf = s => iconv.encode(s, 'win1252');

const arquivo = lerConferenciaSAGE(buf(relatorio()));
assert(ehConferenciaSAGE(buf(relatorio())));
assert.equal(arquivo.cnpj, cnpj);
assert.equal(arquivo.empresa, '0999 - EMPRESA FICTICIA LTDA');
assert.deepEqual([arquivo.periodoInicio, arquivo.periodoFim], ['2025-12-01', '2025-12-31']);
assert.equal(arquivo.lancamentos.length, 3);
assert.deepEqual(arquivo.lancamentos.map(l => l.valorCentavos), [53000, 360, 443800]);
assert.equal(arquivo.lancamentos[0].data, '2025-12-01');
assert.equal(arquivo.lancamentos[0].codigoHistorico, '1299');
assert.equal(arquivo.lancamentos[1].codigoHistorico, '', '0000 é "sem histórico padrão"');
assert.equal(arquivo.lancamentos[2].descricao, 'VENDAS A PRAZO CFE NF-E: 922 SERIE: 1 CONDOMINIO PARQUE FICTICIO', 'continuação junta ao complemento');
assert.equal(arquivo.lancamentos[2].numeroSage, '3');
assert.equal(arquivo.fingerprint, lerConferenciaSAGE(buf(relatorio().replace(/\r\n/g, '\n'))).fingerprint);
// FI continua com o leitor próprio; o relatório não passa como FI.
assert.throws(() => lerFI(buf(relatorio())), /328 posições/);

// Bloqueios: quantidade, diferença, conta faltando, data fora, linha estranha, outro relatório.
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ quantidade: 4 }))), /informa 4 lançamentos, mas foram lidos 3/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ diferenca: 'HA DIFERENCA DE 10,00' }))), /NAO HA DIFERENCA/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ linhas: [lanc(1, '01/12', '1.1.1.02.0002', '', '530,00', '1299', 'X')] }))), /uma conta só e sem as contrapartidas/);

// Múltiplas partidas (Digita08): a linha do número traz um lado; as linhas sem número, as contrapartidas do outro.
const composto = lerConferenciaSAGE(buf(relatorio({ linhas: [
  lanc(1, '01/12', '1.1.1.02.0002', '1.1.2.03.0010', '10,00', '1299', 'SIMPLES'),
  lanc(2, '02/12', '', '1.1.1.02.0002', '4.210,88', '1303', 'PAGTO PARCELAMENTO'),
  sub('1.1.2.03.0010', '', '4.169,18', '0900', 'PARCELA 02 PGFN'), cont('VIA PIX'),
  sub('5.1.1.03.0004', '', '41,70', '0900', 'SELIC'),
  lanc(3, '03/12', '1.1.1.02.0002', '', '600,00', '1399', 'RECEBIMENTO'),
  sub('', '1.1.2.01.0001', '400,00', '1399', 'NF 712'),
  sub('', '1.1.2.01.0001', '200,00', '1399', ''),
] })));
assert.equal(composto.quantidadeImpressa, 3);
assert.equal(composto.compostos, 2);
assert.deepEqual(composto.lancamentos.map(l => [l.numeroSage, l.partidaSage || 0, l.contaDebito, l.contaCredito, l.valorCentavos, l.codigoHistorico, l.descricao]), [
  ['1', 0, '1.1.1.02.0002', '1.1.2.03.0010', 1000, '1299', 'SIMPLES'],
  ['2', 1, '1.1.2.03.0010', '1.1.1.02.0002', 416918, '0900', 'PARCELA 02 PGFN VIA PIX'],
  ['2', 2, '5.1.1.03.0004', '1.1.1.02.0002', 4170, '0900', 'SELIC'],
  ['3', 1, '1.1.1.02.0002', '1.1.2.01.0001', 40000, '1399', 'NF 712'],
  ['3', 2, '1.1.1.02.0002', '1.1.2.01.0001', 20000, '1399', 'RECEBIMENTO'],
]);
const compostoRuim = linhasSub => () => lerConferenciaSAGE(buf(relatorio({ quantidade: 1, linhas: [lanc(2, '02/12', '', '1.1.1.02.0002', '100,00', '1303', 'X'), ...linhasSub] })));
assert.throws(compostoRuim([sub('1.1.2.03.0010', '', '60,00', '0900', 'A'), sub('5.1.1.03.0004', '', '30,00', '0900', 'B')]), /somam 90,00 e o lançamento 100,00/);
assert.throws(compostoRuim([sub('1.1.2.03.0010', '', '50,00', '0900', 'A'), sub('', '5.1.1.03.0004', '50,00', '0900', 'B')]), /dois lados/);
assert.throws(compostoRuim([sub('1.1.2.03.0010', '5.1.1.03.0004', '100,00', '0900', 'A')]), /dois lados/);
assert.throws(compostoRuim([sub('1.1.1.02.0002', '', '100,00', '0900', 'A')]), /mesma conta/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ linhas: [lanc(1, '01/12', '1.1.1.02.0002', '1.1.2.03.0010', '1,00', '1299', 'X'), sub('5.1.1.03.0004', '', '1,00', '0900', 'Y')] }))), /contrapartida sem um lançamento de múltiplas partidas/);
// Quantidade com milhar ("1.338" no Digita08).
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ quantidade: '1.000' }))), /informa 1000 lançamentos, mas foram lidos 3/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ linhas: [lanc(1, '01/11', '1.1.1.02.0002', '1.1.2.03.0010', '530,00', '1299', 'X')] }))), /fora do período/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ linhas: [lanc(1, '01/12', '1.1.1.02.0002', '1.1.2.03.0010', '0,00', '1299', 'X')] }))), /zerado/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio().replace(' NAO HA DIFERENCA', ' NAO HA DIFERENCA\r\n TOTAL GERAL 999'))), /fora do leiaute conhecido/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio().replace(/ QUANTIDADE DE LANCAMENTOS : \d+\r\n/, ''))), /incompleto/);
assert.throws(() => lerConferenciaSAGE(buf(relatorio({ linhas: [lanc(1, '01/12', '1.1.1.02.0002', '1.1.2.03.0010', '1,00', '1299', 'X'), lanc(1, '02/12', '1.1.1.02.0002', '1.1.2.03.0010', '1,00', '1299', 'Y')] }))), /repetido/);
assert(!ehConferenciaSAGE(buf('RAZAO ANALITICO')));

// Prévia: contas pela classificação exata, gravadas pelo reduzido; CNPJ do cabeçalho manda.
const contas = [
  ['1.1.1.02.0002', '12', 'Banco'], ['1.1.2.03.0010', '30', 'Adiantamentos'], ['5.1.1.03.0004', '510', 'Tarifas'],
  ['1.1.2.01.0001', '20', 'Clientes'], ['3.1.1.01.0002', '301', 'Vendas a prazo'],
].map(([codigo, reduzido, descricao]) => ({ codigo, reduzido, descricao, analitica: true }));
const state = { info: { cnpj, periodoInicio: '2025-01-01', periodoFim: '2025-12-31' }, entries: [] };
const previa = prepararFI({ arquivo, contas, state, cnpj });
assert(previa.ok, previa.erros.join(' '));
assert.deepEqual(previa.lancamentos.map(l => [l.contaDebito, l.contaCredito]), [['12', '30'], ['510', '12'], ['20', '301']]);
assert.equal(previa.totalCentavos, 497160);
assert.deepEqual(previa.movimentoExistente, {});
assert.throws(() => prepararFI({ arquivo, contas, state: { ...state, info: { ...state.info, cnpj: '99888777000166' } }, cnpj: '99888777000166' }), /CNPJ 11222333000181.*Ative a empresa do relatório/);
const semConta = prepararFI({ arquivo, contas: contas.slice(1), state, cnpj });
assert(!semConta.ok && /Conta 1\.1\.1\.02\.0002: ausente/.test(semConta.erros.join(' ')));
// Grupo sem pontos não casa com a classificação por dígitos (lição da 3.4.461).
assert(!prepararFI({ arquivo, contas: [...contas.slice(1), { codigo: '111020002', reduzido: '12', analitica: true }], state, cnpj }).ok);
const semReduzido = prepararFI({ arquivo, contas: [{ ...contas[0], reduzido: '' }, ...contas.slice(1)], state, cnpj });
assert(!semReduzido.ok && /sem código reduzido/.test(semReduzido.erros.join(' ')));
const sintetica = prepararFI({ arquivo, contas: [...contas, { codigo: '1.1.1.02.0002.01', reduzido: '99', analitica: true }], state, cnpj });
assert(!sintetica.ok);
const comMovimento = prepararFI({ arquivo, contas, cnpj, state: { ...state, entries: [
  { data: '2025-12-05', layoutNome: 'SAGE Folha de Pagamento — FPIMP' }, { data: '2025-12-09', bancoNome: 'Itaú' }, { data: '2025-11-30', bancoNome: 'Itaú' }] } });
assert.deepEqual(comMovimento.movimentoExistente, { 'SAGE Folha de Pagamento — FPIMP': 1, 'Itaú': 1 });
assert(comMovimento.ok, 'aviso, não bloqueio: a confirmação explícita fica na rota');
assert(!prepararFI({ arquivo, contas, cnpj, state: { ...state, entries: [{ _fingerprint_imp: arquivo.fingerprint }] } }).ok);

// Rota: mesmo endpoint do FI detecta o relatório, exige confirmar movimento existente e grava a origem SAGE.
(async () => {
  let stateJson = JSON.stringify({ ...state, entries: [{ id: 'x', data: '2025-12-20', valor: 1, contaDebito: '12', contaCredito: '30', bancoNome: 'Itaú' }] });
  const rotas = {}, auditoria = [];
  const app = { post: (url, fn) => { rotas[url] = fn; } };
  registrar(app, {
    db: { collection: () => ({ doc: () => ({ collection: nome => ({ doc: () => ({ nome }), get: async () => ({ docs: [], forEach() {} }) }) }) }) },
    checarAcessoEmpresa: async () => ({ ok: true, empresa: { razao_social: 'Empresa Fictícia', plano_id: 'p' } }),
    carregarContasContabeisEmpresa: async () => contas,
    carregarSessaoAtualPorRef: async () => ({ encontrada: true, stateJson, dados: {} }),
    adquirirTravaSessao: async () => 'trava', liberarTravaSessao: async () => {},
    gravarSessaoBloqueada: async (ref, novo, resumo, user, opts) => { stateJson = novo; opts.gravarRelacionados({ create: (r, d) => auditoria.push(d) }); return { revisao: 2 }; },
    impedirAlteracaoPeriodosFechados: async () => {},
  });
  const chamar = async (acao, body) => {
    let status = 200, json;
    await rotas['/api/empresas/:cnpj/importacao-fi/' + acao]({ params: { cnpj }, user: { uid: 'u', nome: 'Teste' }, body: { arquivo: buf(relatorio()).toString('base64'), ...body } },
      { status(s) { status = s; return this; }, json(d) { json = d; return this; } });
    return { status, json };
  };
  const p = await chamar('previa');
  assert.equal(p.status, 200, JSON.stringify(p.json));
  assert.equal(p.json.formato, 'conferencia-sage');
  assert.deepEqual(p.json.movimentoExistente, { 'Itaú': 1 });
  const base = { hashPrevia: p.json.hashPrevia, confirmarEmpresa: cnpj };
  const recusada = await chamar('confirmar', base);
  assert.equal(recusada.status, 409);
  assert(/já têm lançamentos no CCI/.test(recusada.json.erro));
  const ok = await chamar('confirmar', { ...base, confirmarMovimentoExistente: true });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const gravado = JSON.parse(stateJson).entries.slice(1);
  assert.equal(gravado.length, 3);
  assert.equal(gravado[0].origem, 'sage-conferencia-lancamentos');
  assert.equal(gravado[0].bancoId, 'CONTABIL_SAGE');
  assert.equal(gravado[2].numeroLancamentoSage, '3');
  assert.equal(gravado[0].contaDebito, '12');
  assert.equal(auditoria[0].tipo, 'IMPORTACAO_SAGE_CONFERENCIA');
  const repetida = await chamar('previa');
  assert(!repetida.json.ok && /já foi importado/.test(repetida.json.erros.join(' ')));
  console.log('OK — relatório SAGE Conferência de Lançamentos: leiaute, cabeçalho, continuação, totais, contas por classificação, CNPJ, movimento existente, rota e reimportação.');
})().catch(e => { console.error(e); process.exit(1); });
