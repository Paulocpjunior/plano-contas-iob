const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  calcularIrrfAluguel2026,
  mapearBeneficiarios,
  parseCompetencia,
  valorMonetario,
} = require('../reinf/reinf-aluguel-utils');
const { gerarEventosR4010DaPlanilha } = require('../reinf/reinf-utils');

const arquivoPadrao = '/Users/paulocesarpereirajunior/Downloads/CAIXA 1- Junho de 2026 3208.xlsx';
const arquivo = process.env.REINF_CAIXA_3208_XLSX || arquivoPadrao;
const arquivoCaixa4 = '/Users/paulocesarpereirajunior/Downloads/CAIXA 4- Junho de 2026 3208 (1).xlsx';

assert.strictEqual(valorMonetario('2,000.00'), 2000, 'valor EN-US de planilha CAIXA deve ser lido corretamente');
assert.strictEqual(valorMonetario('2.000,00'), 2000, 'valor pt-BR deve continuar suportado');
assert.strictEqual(parseCompetencia('Jun-26'), '2026-06');
assert.strictEqual(calcularIrrfAluguel2026(5250).valor, 89.53, 'tabela IRRF 2026 com reducao e desconto simplificado');
assert.strictEqual(calcularIrrfAluguel2026(5000).valor, 0, 'rendimento ate R$ 5.000,00 deve zerar na regra 2026 mais vantajosa');

if (!fs.existsSync(arquivo)) {
  console.warn(`SKIP: arquivo real nao encontrado: ${arquivo}`);
  process.exit(0);
}

const wb = XLSX.readFile(arquivo, { raw: false });
const rows = [];
for (const sheet of wb.SheetNames) {
  const arr = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });
  arr.forEach((row, idx) => rows.push({ row, sheet, rowNumber: idx + 1 }));
}

const { beneficiarios, meta } = mapearBeneficiarios(rows);
assert.strictEqual(beneficiarios.length, 76, 'deve importar apenas proprietarios PF para R-4010');
assert.strictEqual(meta.ignoradosPJ, 18, 'proprietarios PJ residentes no Brasil ficam fora do R-4010');
assert.deepStrictEqual(meta.competencias, ['2026-06']);
assert.strictEqual(meta.codigosReceita.length, 1);
assert.strictEqual(meta.codigosReceita[0], '3208');
assert.strictEqual(meta.cnpjsFonte.length, 5, 'planilha CAIXA possui cinco CNPJs de origem');
assert.strictEqual(meta.totalBruto, 300647.03);
assert.strictEqual(meta.totalIrrf, 22397.95);

const linhasRetidasCaixa4 = [
  { row: ['Localidade', 'CNPJ', 'Código', 'Nome (Proprietário)', 'CNPJ (Proprietário)', 'Apuração', 'Bruto', 'IRRF', 'Líquido'], sheet: 'Caixa 4', rowNumber: 1 },
  { row: ['Belém', 2881939000138, 3208, 'Jose Maria Ferreira Gomes', 9448225253, 'jun/26', '6.379,80', '289,17', '5.452,66'], sheet: 'Caixa 4', rowNumber: 12 },
  { row: ['Guará - Reg. VIII', 9350712000105, '3208,00', 'Djalma Ferreira Dos Santos Junior', 60632119187, 'jun/26', '', '2.691,79', '11.008,21'], sheet: 'Caixa 4', rowNumber: 13 },
];
const retidosCaixa4 = mapearBeneficiarios(linhasRetidasCaixa4);
assert.strictEqual(retidosCaixa4.beneficiarios.length, 2, 'linhas Caixa 4 com IRRF nao podem ser descartadas');
const jose = retidosCaixa4.beneficiarios.find(b => b.cpfBenef === '09448225253');
const djalma = retidosCaixa4.beneficiarios.find(b => b.cpfBenef === '60632119187');
assert.ok(jose, 'Jose Maria deve recuperar zero a esquerda do CPF numerico');
assert.strictEqual(jose.cnpjFonte, '02881939000138');
assert.strictEqual(jose.valorIrrf, 289.17);
assert.ok(djalma, 'Djalma deve ser importado mesmo quando o bruto calculado chega sem cache');
assert.strictEqual(djalma.cnpjFonte, '09350712000105');
assert.strictEqual(djalma.valorBruto, 13700);
assert.strictEqual(djalma.valorIrrf, 2691.79);
assert.strictEqual(retidosCaixa4.meta.irrfImportado, 2);
assert.strictEqual(retidosCaixa4.meta.irrfNaoImportado, 0);
assert.strictEqual(retidosCaixa4.meta.documentosRecuperados, 1);
assert.strictEqual(retidosCaixa4.meta.brutosRecuperados, 1);

const retidoInvalido = mapearBeneficiarios([
  linhasRetidasCaixa4[0],
  { row: ['Belém', '02.881.939/0001-38', 3208, 'CPF incompleto', '123', 'jun/26', '1.000,00', '15,00', '985,00'], sheet: 'Caixa 4', rowNumber: 99 },
]);
assert.strictEqual(retidoInvalido.meta.irrfNaoImportado, 1, 'linha com IRRF descartada deve virar pendencia explicita');
assert.ok(retidoInvalido.meta.pendenciasIrrf[0].includes('Linha 99'));
assert.ok(retidoInvalido.meta.pendenciasIrrf[0].includes('CPF com 3 digito(s)'));

const camposDeslocados = mapearBeneficiarios([
  linhasRetidasCaixa4[0],
  { row: ['Belém', '02.881.939/0001-38', 3208, '', '', 'jun/26', '6.379,80', '289,17', '5.452,66', 'Jose Maria Ferreira Gomes', '094.482.252-53'], sheet: 'PA 02.881.939 0001-38', rowNumber: 13 },
]);
assert.strictEqual(camposDeslocados.beneficiarios.length, 1, 'linha com celulas principais deslocadas deve ser recuperada');
assert.strictEqual(camposDeslocados.beneficiarios[0].cpfBenef, '09448225253');
assert.strictEqual(camposDeslocados.beneficiarios[0].nomeBenef, 'Jose Maria Ferreira Gomes');
assert.ok(camposDeslocados.beneficiarios[0].observacao.includes('leitura completa da linha'));

if (fs.existsSync(arquivoCaixa4)) {
  const wbCaixa4 = XLSX.readFile(arquivoCaixa4, { raw: false });
  const rowsCaixa4 = [];
  wbCaixa4.SheetNames
    .filter(sheet => ['PA', 'DF'].includes(sheet.trim().slice(0, 2)))
    .forEach(sheet => {
      const arr = XLSX.utils.sheet_to_json(wbCaixa4.Sheets[sheet], {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false,
      });
      arr.forEach((row, idx) => rowsCaixa4.push({ row, sheet, rowNumber: idx + 1 }));
    });
  const caixa4 = mapearBeneficiarios(rowsCaixa4);
  const joseReal = caixa4.beneficiarios.find(b => b.cpfBenef === '09448225253');
  const djalmaReal = caixa4.beneficiarios.find(b => b.cpfBenef === '60632119187');
  assert.ok(joseReal, 'CAIXA 4 real deve importar Jose Maria da linha 12');
  assert.strictEqual(joseReal.valorIrrf, 289.17);
  assert.ok(djalmaReal, 'CAIXA 4 real deve importar Djalma da linha 31');
  assert.strictEqual(djalmaReal.valorIrrf, 2691.79);
  assert.strictEqual(caixa4.meta.irrfNaoImportado, 0, 'totais das linhas 13 e 32 nao podem gerar falso erro de IRRF');
  assert.strictEqual(caixa4.meta.linhasTotalIgnoradas, 3, 'totais PA e DF devem ser reconhecidos e ignorados');
}

const filtroCnpj = '03954491000106';
const filtrado = mapearBeneficiarios(rows, { cnpjFiltro: filtroCnpj });
assert.strictEqual(filtrado.beneficiarios.length, 29, 'filtro por CNPJ deve separar a empresa selecionada em planilha multi-CNPJ');
assert.strictEqual(filtrado.meta.totalBruto, 162485.44);
assert.strictEqual(filtrado.meta.totalIrrf, 18859.53);
assert.ok(filtrado.beneficiarios.every(b => b.cnpjFonte === filtroCnpj && b.cnpjEstab === filtroCnpj), 'beneficiarios filtrados devem pertencer ao CNPJ selecionado');
assert.ok(filtrado.meta.ignoradosOutroCnpj > 0, 'linhas de outros CNPJs devem ser ignoradas pelo filtro');

const narsival = beneficiarios.find(b => b.nomeBenef === 'Narsival Cerqueira Souza');
assert.ok(narsival, 'Narsival deve ser importado');
assert.strictEqual(narsival.valorBruto, 5250);
assert.strictEqual(narsival.valorIrrf, 89.53);
assert.strictEqual(narsival.origemIrrf, 'informado');
assert.strictEqual(narsival.codigoReceita, '3208');
assert.strictEqual(narsival.competencia, '2026-06');
assert.strictEqual(narsival.geraDarf, true);

const semDarf = beneficiarios.find(b => b.nomeBenef === 'Orlando Zanlni');
assert.ok(semDarf, 'linha sem IRRF deve ser importada');
assert.strictEqual(semDarf.valorBruto, 2000);
assert.strictEqual(semDarf.valorIrrf, 0);
assert.strictEqual(semDarf.geraDarf, false);
assert.strictEqual(semDarf.origemIrrf, 'calculado');

const cnpj = filtroCnpj;
const locadoresMesmoCnpj = filtrado.beneficiarios
  .slice(0, 2)
  .map(b => ({
    cpf: b.cpfBenef,
    nome: b.nomeBenef,
    bruto: b.valorBruto,
    irrf: b.valorIrrf,
    baseIrrf: b.baseIrrf,
    cnpjFonte: b.cnpjFonte,
    cnpjEstab: b.cnpjEstab,
  }));

const eventos = gerarEventosR4010DaPlanilha({
  contribuinte: { tpInsc: 1, nrInsc: cnpj },
  estabelecimento: { tpInscEstab: 1, nrInscEstab: cnpj },
  perApur: '2026-06',
  tpAmb: 2,
  dtPagamento: '2026-06-30',
  natRend: '13002',
  locadores: locadoresMesmoCnpj,
});
assert.strictEqual(eventos.length, 2);
assert.ok(eventos.every(evt => evt.cnpjFonte === cnpj && evt.cnpjEstab === cnpj), 'eventos R-4010 devem sair apenas para o CNPJ filtrado');
assert.ok(eventos[0].xml.includes('<natRend>13002</natRend>'));
assert.ok(eventos[0].xml.includes('<vlrRendTrib>2000,00</vlrRendTrib>'));

console.log('OK: Reinf aluguel CAIXA 3208 importou PF, filtrou CNPJ e validou IRRF/DARF.');
