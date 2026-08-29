'use strict';

const conteudo = require('./manual-cci-conteudo.json');

function textoBloco(bloco) {
  if (!bloco) return '';
  if (bloco.text) return `${bloco.label ? bloco.label + ': ' : ''}${bloco.text}`;
  if (Array.isArray(bloco.items)) {
    return bloco.items.map((item) => typeof item === 'string' ? item : `${item.term}: ${item.definition}`).join(' ');
  }
  if (Array.isArray(bloco.rows)) {
    return [bloco.headers || [], ...bloco.rows].map((linha) => linha.join(' | ')).join(' ');
  }
  return '';
}

function textoManualCCI() {
  return conteudo.chapters.map((capitulo) => `${capitulo.title}: ${capitulo.blocks.map(textoBloco).join(' ')}`).join('\n');
}

function validarManualCCI() {
  if (!conteudo.manual_version || !conteudo.updated_at || !Array.isArray(conteudo.chapters) || conteudo.chapters.length < 10) {
    throw new Error('Conteúdo oficial do Manual CCI incompleto.');
  }
  const ids = new Set();
  conteudo.chapters.forEach((capitulo) => {
    if (!capitulo.id || ids.has(capitulo.id)) throw new Error(`Capítulo inválido ou duplicado: ${capitulo.id || 'sem id'}`);
    ids.add(capitulo.id);
  });
  return true;
}

validarManualCCI();

module.exports = { conteudo, textoManualCCI, validarManualCCI };
