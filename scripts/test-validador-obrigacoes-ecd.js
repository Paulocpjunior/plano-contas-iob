#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(indexHtml.includes('validarEstruturaECDI150I155'), 'validador ECD deve ter checagem estrutural I150/I155');
assert(indexHtml.includes('Registro obrigatorio I155 nao encontrado apos I150'), 'mensagem bloqueante de I155 ausente deve existir');
assert(indexHtml.includes('Bloco I sera rejeitado pelo validador SPED'), 'resumo bloqueante do bloco I deve existir');

function encontrarI150SemI155(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  const faltantes = [];
  let periodoAtual = null;

  function fechar(proximoRegistro) {
    if (periodoAtual && !periodoAtual.temI155) {
      faltantes.push({ ...periodoAtual, proximoRegistro });
    }
  }

  linhas.forEach((linha, idx) => {
    if (/^\|I150\|/i.test(linha)) {
      fechar('outro I150');
      const campos = linha.split('|');
      periodoAtual = {
        linha: idx + 1,
        inicio: campos[2] || '',
        fim: campos[3] || '',
        temI155: false,
      };
      return;
    }
    if (/^\|I155\|/i.test(linha) && periodoAtual) {
      periodoAtual.temI155 = true;
      return;
    }
    if (/^\|I990\|/i.test(linha)) {
      fechar('I990');
      periodoAtual = null;
    }
  });

  return faltantes;
}

const fixture = '/Users/paulocesarpereirajunior/Downloads/ECD1352.TXT';
if (fs.existsSync(fixture)) {
  const texto = fs.readFileSync(fixture, 'latin1');
  const faltantes = encontrarI150SemI155(texto);
  assert(faltantes.length === 3, `ECD1352.TXT deveria apontar 3 I150 sem I155, encontrou ${faltantes.length}`);
  assert(faltantes.some((item) => item.linha === 674 && item.inicio === '01082025'), 'deve capturar o erro da Receita na linha 674');
  console.log('OK: ECD1352.TXT reproduz erro bloqueante I150 sem I155');
} else {
  console.log('SKIP: fixture ECD1352.TXT nao encontrado em Downloads');
}

console.log('OK: validador de obrigacoes ECD cobre I150/I155');
