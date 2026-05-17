const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extrairBloco(inicio, fim) {
  const start = html.indexOf(inicio);
  assert.ok(start >= 0, `inicio nao encontrado: ${inicio}`);
  const end = html.indexOf(fim, start);
  assert.ok(end > start, `fim nao encontrado: ${fim}`);
  return html.slice(start, end);
}

const bloco = extrairBloco('function codigoHistoricoValido', 'async function hashDescricao');
const sandbox = {
  console,
  window: {
    SP_HistoricosPadrao: {
      buscarPorCodigo(cod) {
        const map = {
          '0701': { codigo: '0701', descricao: 'ADM DE BENS' },
          '0708': { codigo: '0708', descricao: 'COMISSAO SEGUROS' },
          '1022': { codigo: '1022', descricao: 'PAGTO ISS REF.' },
          '1207': { codigo: '1207', descricao: 'SERVICOS PRESTADOS' },
          '1249': { codigo: '1249', descricao: 'HONORARIOS ADVOCATICIOS' },
          '1305': { codigo: '1305', descricao: 'LICENCA DE USO DE SOFTWARE' }
        };
        return map[cod] || null;
      }
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(`${bloco}
this.__api = {
  codigoHistoricoPorDescricao,
  aplicarPadroesLayoutCludeItau,
  historicoCurtoCludeItau,
  historicoTextoValido
};`, sandbox);

const api = sandbox.__api;

function lanc(descricao, valor, extra) {
  return {
    data: '2026-04-15',
    descricao,
    descricao_memoria: descricao,
    memoriaDescricoes: [descricao],
    valor,
    codigoHistorico: '0000',
    historico: 'Hist',
    layoutNome: 'CLUDE - Itau Movimentacao Financeira',
    layoutParser: 'parsearArquivoXLSXCludeItau',
    conta: 'Itau CLUDE',
    nome_conta: 'Itau CLUDE',
    ...(extra || {})
  };
}

assert.strictEqual(api.codigoHistoricoPorDescricao('AVIDA CORRETORA DE SEGUROS - Comissao'), '0708');
assert.strictEqual(api.codigoHistoricoPorDescricao('CLAUDIO MONTEIRO SOARES ADM DE BENS'), '0701');
assert.strictEqual(api.codigoHistoricoPorDescricao('OAB-RJ - Recebimento da NF 90037'), '1249');
assert.strictEqual(api.codigoHistoricoPorDescricao('DISTRITO TECNOLOGIA - Licenca de uso'), '1305');
assert.strictEqual(api.codigoHistoricoPorDescricao('OMIEXPERIENCE - Servicos prestados'), '1207');
assert.strictEqual(api.codigoHistoricoPorDescricao('ISS FATURAMENTO - ISS s/faturamento'), '1022');

const exemplos = [
  ['CLIC - Recebimento da NF 90034-A', 10825.46, 'CLIC'],
  ['FLASH - Recebimento da NF 89755', 377483.10, 'FLASH'],
  ['WIZ BENEFICIOS - Recebimento da NF 90033', 35084.56, 'WIZ'],
  ['FACEBK*KX7WAGRE92', -12.58, 'FACEB'],
  ['GoogleWorkspace_webfar', -137.84, 'GOOGL'],
  ['AWSBrazil', -2159.58, 'AWSBR']
];

const entries = exemplos.map(([descricao, valor]) => lanc(descricao, valor));
const aplicados = api.aplicarPadroesLayoutCludeItau(entries);
assert.strictEqual(aplicados, entries.length, 'todos os exemplos CLUDE devem receber historico curto');
exemplos.forEach(([, , esperado], idx) => {
  assert.strictEqual(entries[idx].historico, esperado, `historico do exemplo ${idx + 1}`);
  assert.ok(api.historicoTextoValido(entries[idx].historico), `historico valido do exemplo ${idx + 1}`);
});

const seguros = lanc('AVIDA CORRETORA DE SEGUROS - Comissao', -4984.28);
api.aplicarPadroesLayoutCludeItau([seguros]);
assert.strictEqual(seguros.codigoHistorico, '0708');
assert.strictEqual(seguros.historico, 'COMISSAO SEGUROS');

console.log('OK: historicos CLUDE Itau/Cartao sao preenchidos por descricao e regras seguras.');
