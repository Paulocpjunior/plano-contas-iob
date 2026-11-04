'use strict';

// Composição de saldo em aberto (v3.4.490): notas pagas no mês e em aberto direto dos
// lançamentos do CCI, no critério do antigo relatório do razão do SAGE.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../composicao-saldos.js');

let seq = 0;
const nota = (data, historico, valor, extra) => Object.assign({ id: 'L' + String(++seq).padStart(3, '0'), data, historico, credito: valor, debito: 0 }, extra || {});
const baixa = (data, historico, valor, extra) => Object.assign({ id: 'L' + String(++seq).padStart(3, '0'), data, historico, debito: valor, credito: 0 }, extra || {});

// ─── 1. Critério básico: pagamento + retenções fecham o bruto no mês ─────────
const lancs = [
  nota('2026-06-01', 'VR.REF A ETHOS GRC LTDA NF 101', 982428),
  baixa('2026-06-10', 'PAGTO ETHOS GRC - NF 101', 950000),
  baixa('2026-06-10', 'IRRF RET ETHOS GRC NF 101', 32428),
  nota('2026-06-02', 'VR.REF A ROCK TELECOM LTDA', 223959),
  nota('2026-06-05', 'VR.REF A OCS CONSULTORIA EMPRESARIAL NF 77', 1303000),
  baixa('2026-06-20', 'PAGTO OCS CONSULTORIA - NF 77', 300000), // parcial
  baixa('2026-06-25', 'PAGTO FORNECEDOR DESCONHECIDO', 5000), // sem vínculo
  baixa('2026-07-08', 'PAGTO ROCK TELECOM', 223959) // depois do mês
];
const r = C.compor({ lancamentos: lancs, mes: '2026-06', natureza: 'passivo' });
assert.deepStrictEqual(r.resumoMes, { notas: 3, valorBruto: 982428 + 223959 + 1303000, pagas: 1, abertas: 2, saldoAberto: 223959 + 1003000 });
const porNota = Object.fromEntries(r.notas.map((n) => [n.fornecedor.split(' ')[0], n]));
assert.strictEqual(porNota.ETHOS.statusMes, 'paga_no_mes');
assert.strictEqual(porNota.ETHOS.retencoesNoMes, 32428, 'retenção do mesmo mês entra no grupo do pagamento.');
assert.strictEqual(porNota.OCS.saldoFimMes, 1003000, 'pagamento parcial deixa o saldo em aberto.');
assert.strictEqual(porNota.ROCK.statusMes, 'em_aberto');
assert.strictEqual(porNota.ROCK.situacaoAtual, 'baixada_depois', 'pagamento de julho aparece na situação atual.');
assert.strictEqual(porNota.ROCK.dataBaixaFinal, '2026-07-08');
assert.strictEqual(r.baixasSemVinculoMes.length, 1);
assert.strictEqual(r.baixasSemVinculoMes[0].valor, 5000);
// Farol honesto: notas abertas − baixas sem vínculo = saldo contábil, e não se diz "detalhada".
assert.strictEqual(r.composicao.saldoNotas, 1226959);
assert.strictEqual(r.composicao.saldoContabil, 1226959 - 5000);
assert.strictEqual(r.composicao.saldoNotas - r.composicao.baixasSemVinculo + r.composicao.centavos, r.composicao.saldoContabil);
assert.strictEqual(r.composicao.detalhada, false);

// ─── 2. Nota de mês anterior: baixa em junho quita nota de maio; nunca o contrário ─
seq = 0;
const hist = [
  nota('2026-05-10', 'VR.REF A POSITIVA CORRETORA DE SEGUROS - NF 3529', 348115),
  nota('2026-05-12', 'VR.REF A LWSA S/A NF 9', 119184),
  baixa('2026-06-02', 'VR.REF A POSITIVA CORRETORA DE SEGUROS - NF 3529', 348115),
  nota('2026-06-24', 'VR.REF A POSITIVA CORRETORA DE SEGUROS - NF 3600', 363421),
  baixa('2026-05-20', 'PAGTO POSITIVA CORRETORA NF 3600', 363421) // antes da nota existir: não quita
];
const h = C.compor({ lancamentos: hist, mes: '2026-06', natureza: 'passivo' });
const ant = h.notas.filter((n) => n.origem === 'anterior');
assert.strictEqual(ant.length, 2, 'notas de maio que chegaram abertas a junho entram na relação.');
assert.strictEqual(ant.find((n) => n.nota === '3529').statusMes, 'paga_no_mes');
assert.strictEqual(ant.find((n) => n.nota === '9').statusMes, 'em_aberto');
assert.strictEqual(h.notas.find((n) => n.nota === '3600').statusMes, 'em_aberto', 'baixa de maio não quita nota de junho.');
assert.strictEqual(h.baixasSemVinculoAnteriores.length, 1);
assert.deepStrictEqual(h.resumoAnteriores, { abertasNoInicio: 2, saldoInicio: 348115 + 119184, baixadasNoMes: 1, abertas: 1, saldoAberto: 119184 });
// Em maio a nota 3529 está aberta e a de junho ainda não existe.
const maio = C.compor({ lancamentos: hist, mes: '2026-05', natureza: 'passivo' });
assert.strictEqual(maio.notas.length, 2);
assert.strictEqual(maio.notas.find((n) => n.nota === '3529').situacaoAtual, 'baixada_depois');

// ─── 3. Compensação da Conciliação do CCI manda, sem heurística ──────────────
seq = 0;
const comp = [
  nota('2026-06-01', 'FORNECEDOR XPTO SERVICOS', 100000, { grupo: 'g1' }),
  baixa('2026-06-15', 'TED DIVERSOS 123', 100000, { grupo: 'g1' }),
  nota('2026-06-03', 'FORNECEDOR XPTO SERVICOS', 100000)
];
const g = C.compor({ lancamentos: comp, mes: '2026-06', natureza: 'passivo' });
assert.strictEqual(g.notas[0].statusMes, 'paga_no_mes');
assert.strictEqual(g.notas[0].conciliadaNoCCI, true);
assert.strictEqual(g.notas[1].statusMes, 'em_aberto');
assert.strictEqual(g.composicao.detalhada, true);

// Adapter das linhas da Conciliação: D/C fica de fora; conferência manual não é compensação.
const rows = C.deConciliacao([
  { id: 'a', data: '2026-06-01', valor: 1000, dc: 'C', descricao: 'x', conciliado: true, modo: 'compensacao', grupo: 'g' },
  { id: 'b', data: '2026-06-02', valor: 1000, dc: 'D', descricao: 'y', conciliado: true, modo: 'manual', grupo: 'm' },
  { id: 'c', data: '2026-06-02', valor: 500, dc: 'D/C', descricao: 'z' }
]);
assert.deepStrictEqual(rows.map((x) => [x.id, x.credito, x.debito, x.grupo]), [['a', 1000, 0, 'g'], ['b', 0, 1000, '']]);

// ─── 4. Ativo: débitos são os títulos, créditos as baixas ───────────────────
seq = 0;
const ativo = C.compor({
  mes: '2026-06', natureza: 'ativo', lancamentos: [
    { id: 'A1', data: '2026-06-03', historico: 'NF 55 CLIENTE ALFA LTDA', debito: 50000, credito: 0 },
    { id: 'A2', data: '2026-06-20', historico: 'RECEBIMENTO CLIENTE ALFA NF 55', debito: 0, credito: 50000 }
  ]
});
assert.strictEqual(ativo.resumoMes.pagas, 1);
assert.strictEqual(C.naturezaPadrao('1.1.2.01.0001'), 'ativo');
assert.strictEqual(C.naturezaPadrao('2.1.1.07.0005'), 'passivo');
assert.strictEqual(C.naturezaPadrao('3.1'), '');
assert.throws(() => C.compor({ lancamentos: [], mes: '2026-06' }), /Ativo ou do Passivo/);
assert.throws(() => C.compor({ lancamentos: [], mes: '06/2026', natureza: 'ativo' }), /mês/);

// ─── 5. Saldo inicial informado: entra como linha sem detalhe; lançamentos antes dele saem ─
seq = 0;
const ab = C.compor({
  mes: '2026-06', natureza: 'passivo',
  abertura: { periodo: '2026-06', devedor: -500000 },
  lancamentos: [
    nota('2026-05-30', 'VR.REF A ANTIGA LTDA NF 1', 99999),
    nota('2026-06-01', 'VR.REF A NOVA LTDA NF 2', 10000),
    baixa('2026-06-05', 'PAGTO ANTIGO SEM NOTA', 20000)
  ]
});
assert.strictEqual(ab.lancamentosAntesDaAbertura, 1);
assert.strictEqual(ab.composicao.aberturaSemDetalhe, 500000);
assert.strictEqual(ab.composicao.saldoContabil, 500000 + 10000 - 20000);
assert.strictEqual(ab.composicao.saldoNotas + ab.composicao.aberturaSemDetalhe - ab.composicao.baixasSemVinculo, ab.composicao.saldoContabil);
const achada = C.aberturaDaConta({ '2026-01': { '395': '1.000,00' }, '2026-03': { '400': 5 }, '2026-07': { '395': 9 } }, '2026-06', (k) => k === '395', (v) => (v === '1.000,00' ? 100000 : v * 100));
assert.deepStrictEqual(achada, { periodo: '2026-01', devedor: 100000 }, 'saldo inicial mais recente até o mês, da própria conta.');
assert.strictEqual(C.fimDoMes('2028-02'), '2028-02-29');

// ─── 6. Paridade com o relatório antigo (razão SAGE da Clude, 06/2026) ──────
// Arquivo real só na máquina do Paulo; no CI o bloco é PULADO e o resumo avisa.
const real = process.env.CLUDE_RAZAO_062026 || '/Users/paulocesarpereirajunior/Downloads/razao_saldos_062026_a_06_consolidado.xls';
let pulados = 0;
if (fs.existsSync(real)) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(real);
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true }).slice(1).filter((x) => x[1]);
  const iso = (n) => { const p = XLSX.SSF.parse_date_code(n); return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); };
  const res = C.compor({
    mes: '2026-06', natureza: 'passivo',
    lancamentos: linhas.map((x, i) => ({ id: 'R' + String(i).padStart(4, '0'), data: iso(x[1]), numero: x[2], historico: String(x[4]), debito: Math.round(x[6] * 100), credito: Math.round(x[7] * 100) }))
  });
  // Números do PDF emitido em 30/10/2026 pelo extrator antigo.
  assert.deepStrictEqual(res.resumoMes, { notas: 141, valorBruto: 57223833, pagas: 117, abertas: 24, saldoAberto: 6453030 });
  assert.strictEqual(res.baixasSemVinculoMes.length, 46);
  assert.strictEqual(res.baixasSemVinculoMes.reduce((s, b) => s + b.valor, 0), 6717598);
} else pulados++;

console.log('test-composicao-saldos: OK' + (pulados ? ` (${pulados} bloco PULADO: razão real da Clude 06/2026 ausente)` : ''));
