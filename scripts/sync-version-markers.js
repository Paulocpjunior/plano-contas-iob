'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const versao = String(require(path.join(raiz, 'version.json')).version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(versao)) throw new Error(`Versão inválida em version.json: ${versao}`);

const arquivos = [
  'index.html',
  'admin.html',
  'auditai/index.html',
  'auditai/conciliacao.html',
  'auditai/conciliacao-arquivos.js',
  'package.json',
];

for (const relativo of arquivos) {
  const arquivo = path.join(raiz, relativo);
  const antes = fs.readFileSync(arquivo, 'utf8');
  let depois = antes.replace(/v=\d+\.\d+\.\d+/g, `v=${versao}`);
  if (relativo === 'index.html') {
    depois = depois
      .replace(/window\.__PLANO_CONTAS_IOB_BUILD__ = '\d+\.\d+\.\d+'/g, `window.__PLANO_CONTAS_IOB_BUILD__ = '${versao}'`)
      .replace(/window\.__PLANO_CONTAS_IOB_BUILD__ \|\| '\d+\.\d+\.\d+'/g, `window.__PLANO_CONTAS_IOB_BUILD__ || '${versao}'`);
  }
  if (relativo === 'auditai/conciliacao-arquivos.js') {
    depois = depois
      .replace(/AUDITAI_MOTOR_VERSION = '\d+\.\d+\.\d+'/g, `AUDITAI_MOTOR_VERSION = '${versao}'`)
      .replace(/Motor conciliacao v\d+\.\d+\.\d+/g, `Motor conciliacao v${versao}`);
  }
  if (relativo === 'package.json') {
    depois = depois.replace(/("version"\s*:\s*")\d+\.\d+\.\d+("\s*,)/, `$1${versao}$2`);
  }
  if (depois !== antes) fs.writeFileSync(arquivo, depois);
}

console.log(`Marcadores sincronizados com ${versao}.`);
