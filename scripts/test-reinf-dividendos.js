const assert = require('assert');
const {
  calcularDividendos,
  locadoresDividendosParaR4010,
  emailSolicitacaoDividendos,
} = require('../reinf/reinf-dividendos-utils');
const { gerarEventosR4010DaPlanilha, NAT_REND } = require('../reinf/reinf-utils');

const socios = [
  { cpf: '111.111.111-11', nome: 'Socio Um', email: 'um@example.com', percentual: 50 },
  { cpf: '222.222.222-22', nome: 'Socio Dois', email: 'dois@example.com', percentual: 50 },
];

const base = {
  cnpj: '12.345.678/0001-90',
  competencia: '2026-06',
  socios,
};

const semAta = calcularDividendos({
  ...base,
  valorDistribuido: 120000,
  ataSaldoAnterior: 0,
  ataAprovadaAte2025: false,
});
assert.strictEqual(semAta.natRend, '12001');
assert.strictEqual(semAta.totalBaseTributavel, 120000);
assert.strictEqual(semAta.totalIrrf, 12000);
assert.strictEqual(semAta.socios[0].valorTributavel, 60000);
assert.strictEqual(semAta.socios[0].irrf, 6000);

const ataCobre = calcularDividendos({
  ...base,
  valorDistribuido: 120000,
  ataValorTotal: 120000,
  ataSaldoAnterior: 120000,
  ataAprovadaAte2025: true,
  ataValidaAte2028: true,
});
assert.strictEqual(ataCobre.ataUsado, 120000);
assert.strictEqual(ataCobre.ataSaldoApos, 0);
assert.strictEqual(ataCobre.totalBaseTributavel, 0);
assert.strictEqual(ataCobre.totalIrrf, 0);

const ataParcial = calcularDividendos({
  ...base,
  valorDistribuido: 300000,
  ataValorTotal: 100000,
  ataSaldoAnterior: 100000,
  ataAprovadaAte2025: true,
  ataValidaAte2028: true,
});
assert.strictEqual(ataParcial.ataUsado, 100000);
assert.strictEqual(ataParcial.ataSaldoApos, 0);
assert.strictEqual(ataParcial.totalBaseTributavel, 200000);
assert.strictEqual(ataParcial.totalIrrf, 20000);
assert.strictEqual(ataParcial.socios[0].valorAtaIsento, 50000);
assert.strictEqual(ataParcial.socios[0].valorTributavel, 100000);

const locadores = locadoresDividendosParaR4010(ataCobre, {
  cnpjFonte: base.cnpj,
  cnpjEstab: base.cnpj,
  dtPagamento: '2026-06-30',
});
assert.strictEqual(locadores[0].baseIrrf, 0);
assert.strictEqual(locadores[0].irrf, 0);
const eventos = gerarEventosR4010DaPlanilha({
  contribuinte: { tpInsc: 1, nrInsc: '12345678000190' },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: '12345678000190' },
  perApur: '2026-06',
  tpAmb: 2,
  dtPagamento: '2026-06-30',
  natRend: NAT_REND.LUCROS_DIVIDENDOS,
  locadores,
});
assert(eventos[0].xml.includes('<natRend>12001</natRend>'));
assert(!eventos[0].xml.includes('<vlrRendTrib>60000,00</vlrRendTrib>'));
assert(!eventos[0].xml.includes('<vlrIR>0,00</vlrIR>'));

const email = emailSolicitacaoDividendos({
  empresa: { razao_social: 'Empresa Teste' },
  competenciaReferencia: '2026-06',
});
assert(email.assunto.includes('EFD-Reinf'));
assert(email.texto.includes('R$ 50.000,00'));
assert(email.texto.includes('ATA'));

console.log('OK - cálculo REINF dividendos, ATA, R-4010 12001 e e-mail padrão validados.');
