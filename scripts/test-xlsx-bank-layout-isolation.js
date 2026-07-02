const fs = require('fs');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const html = fs.readFileSync('index.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

assert(
  html.includes('entries = await parsearArquivoXLSX(selectedFile, { bancoCode });'),
  'XLSX import must pass the selected bank to the parser'
);

assert(
  html.includes("const bancoABCXLSX = layoutXLSXBloqueado('Banco ABC - Extrato XLSX', '246') ? null : parsearLayoutBancoABCXLSX();"),
  'Banco ABC XLSX layout must be gated by bank code 246'
);

assert(
  html.includes('validarLayoutCompativelComBanco(entries, bancoCode);'),
  'Imported entries must be validated against the selected bank before confirmation'
);

assert(
  html.includes("layoutBanco: '246'") && html.includes("layoutNome: 'Banco ABC - Extrato XLSX'"),
  'Banco ABC XLSX entries must carry their layout owner'
);

assert(
  html.includes('function contextoMemoriaCompativel(aprendido, lanc)'),
  'Classification memory must validate bank/layout compatibility'
);

assert(
  html.includes('const contextoMemoria = contextoMemoriaLancamento(lanc);') &&
  html.includes('await hashDescricao(cnpj, descNorm, contextoMemoria);'),
  'Saved classification memory must be scoped by bank/layout context'
);

assert(
  html.includes('const contextoMemoria = contextoMemoriaLancamento(e);') &&
  html.includes('buscarAprendizadoSimilar(cache, candidatosNorm, e)'),
  'Automatic classification must use bank/layout context when reading memory'
);

assert(
  server.includes('bancoCodigo: String(bancoCodigo ||') &&
  server.includes('layoutParser: String(layoutParser ||') &&
  server.includes('layoutNome: String(layoutNome ||'),
  'Backend must persist bank/layout metadata in learning records'
);

console.log('OK: XLSX bank layout isolation and scoped memory guards are present');
