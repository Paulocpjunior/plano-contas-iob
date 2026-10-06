"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Core = require("../indices-financeiros");
const cnpj = "00000000000191";
const base = {
  cnpj,
  inicio: "2026-01-01",
  fim: "2026-06-30",
  fonte: "Demonstrativos conferidos",
  bases: {
    ac: 77552124.48,
    rlp: 128482.81,
    ativo: 82582882.98,
    disponivel: 4032955.07,
    estoques: 32646319.76,
    pc: 25300361.36,
    pnc: 54566385.12,
    pl: 418970.53,
    emprestimos: 3867879.49,
    receita: 39983752.7,
    bruto: 13324822.92,
    lucro: 2297165.97,
  },
};
const clone = () => structuredClone(base);
const fin = Core.calcular(base, cnpj, "indice_financeiro");
const debt = Core.calcular(base, cnpj, "indice_endividamento");
assert.deepEqual(
  fin.linhas.map((i) => Number(i.valor.toFixed(2))),
  [3.07, 1.77, 0.16, 0.97, 52251763.12, 33.33, 5.75, 0.48],
);
assert.deepEqual(
  debt.linhas.map((i) => Number(i.valor.toFixed(2))),
  [96.71, 31.68, 19062.62, 4.68, 1.03, 79866746.48],
);
assert(fin.avisos.some((a) => a.includes("2.297.165,97")));
assert.equal(
  base.bases.pl,
  418970.53,
  "Não incorporar lucro ao PL sem autorização",
);
const missing = clone();
missing.bases.estoques = null;
missing.bases.lucro = null;
assert.equal(
  Core.calcular(missing, cnpj, "indice_financeiro").linhas[1].valor,
  null,
);
assert.equal(
  Core.calcular(missing, cnpj, "indice_financeiro").linhas[6].valor,
  null,
);
const zero = clone();
zero.bases.estoques = 0;
zero.bases.lucro = 0;
assert.equal(Core.calcular(zero, cnpj, "indice_financeiro").linhas[6].valor, 0);
assert.equal(
  Core.calcular(zero, cnpj, "indice_financeiro").linhas[1].valor,
  fin.linhas[0].valor,
);
zero.bases.pc = 0;
assert.equal(
  Core.calcular(zero, cnpj, "indice_financeiro").linhas[0].motivo,
  "Denominador nulo ou negativo",
);
const loss = clone();
loss.bases.lucro = -100;
loss.bases.pl = -1;
assert(Core.calcular(loss, cnpj, "indice_financeiro").linhas[6].valor < 0);
assert.equal(
  Core.calcular(loss, cnpj, "indice_endividamento").linhas[2].valor,
  null,
);
assert.throws(
  () => Core.calcular(base, "00000000000272", "indice_financeiro"),
  /empresa ativa/,
);
for (const inicio of ["2026-02-30", "2026-07-01", "", "xx"])
  assert.throws(() => Core.validar({ ...base, inicio }, cnpj), /período/);
assert.throws(() => Core.validar({ ...base, fonte: "" }, cnpj), /fonte/);
assert.throws(() => Core.validar({ ...base, bases: { ac: NaN } }, cnpj));
assert.throws(() => Core.validar({ ...base, bases: { ac: 1, pc: "0" } }, cnpj));
assert.throws(() => Core.calcular(base, cnpj, "desconhecido"), /Modelo/);
const window = { CCIIndicesFinanceiros: Core };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../indices-financeiros-ui.js"), "utf8"),
  { window },
);
const ctx = {
  empresa: { cnpj },
  config: { indicesFinanceiros: { "2026-01-01_2026-06-30": base } },
};
const ui = window.CCIIndicesUI;
const d = ui.dados(ctx, "indice_financeiro");
assert.equal(d.periodoLegivel, "01/01/2026 a 30/06/2026");
assert(ui.linhas(d).some((row) => row.includes("3,07 vezes")));
assert(ui.linhas(d).some((row) => row.includes("Demonstrativos conferidos")));
const other = { empresa: { cnpj: "00000000000272" }, config: ctx.config };
assert.equal(
  ui.dados(other, "indice_financeiro").indices,
  null,
  "Outra empresa não pode herdar bases",
);
assert.throws(
  () => ui.linhas(ui.dados(other, "indice_financeiro")),
  /Cadastre/,
);
assert.equal(
  ui.dados(ctx, "indice_endividamento").indices.linhas[0].nome,
  "Endividamento geral",
);
console.log(
  "OK: cálculos, perdas, zeros, bases ausentes, período, exportação e isolamento entre empresas.",
);
