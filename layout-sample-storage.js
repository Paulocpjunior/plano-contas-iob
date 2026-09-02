const crypto = require('crypto');
const path = require('path');

const LIMITE_AMOSTRA_LAYOUT = 25 * 1024 * 1024;
const RETENCAO_AMOSTRA_DIAS = 30;

function erroAmostra(mensagem, status, codigo) {
  const erro = new Error(mensagem);
  erro.status = status || 400;
  erro.codigo = codigo || 'AMOSTRA_LAYOUT_INVALIDA';
  return erro;
}

function nomeArquivoSeguro(nome) {
  const base = path.basename(String(nome || '').trim()) || 'arquivo-modelo';
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'arquivo-modelo';
}

function base64Limpo(valor) {
  return String(valor || '')
    .replace(/^data:[^;,]+;base64,/i, '')
    .replace(/\s+/g, '');
}

function extrairAmostraLayout(body) {
  const base64 = base64Limpo(body && body.arquivo_base64);
  if (!base64) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw erroAmostra('Conteudo base64 do arquivo-modelo invalido.', 400, 'AMOSTRA_BASE64_INVALIDA');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > LIMITE_AMOSTRA_LAYOUT) {
    throw erroAmostra('O arquivo-modelo deve ter entre 1 byte e 25 MB.', 413, 'AMOSTRA_TAMANHO_INVALIDO');
  }
  const tamanhoDeclarado = Number(body && body.tamanho || 0);
  if (tamanhoDeclarado && tamanhoDeclarado !== buffer.length) {
    throw erroAmostra('O tamanho do arquivo-modelo difere do arquivo analisado. Analise novamente antes de enviar.', 409, 'AMOSTRA_TAMANHO_DIVERGENTE');
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const hashDeclarado = String(body && body.sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hashDeclarado) || hashDeclarado !== sha256) {
    throw erroAmostra('O hash do arquivo-modelo difere da analise. Nenhum arquivo foi armazenado.', 409, 'AMOSTRA_HASH_DIVERGENTE');
  }
  const arquivo = path.basename(String(body && body.arquivo || '').trim());
  const mimeType = String(body && body.mime_type || '').trim().slice(0, 120) || 'application/octet-stream';
  if ((/\.pdf$/i.test(arquivo) || mimeType === 'application/pdf') && buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw erroAmostra('O arquivo informado como PDF nao possui uma assinatura PDF valida.', 400, 'AMOSTRA_PDF_INVALIDA');
  }
  return { buffer, sha256, arquivo, mimeType };
}

function caminhoAmostraLayout(id, sha256, arquivo) {
  const idSeguro = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  const hashSeguro = String(sha256 || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (!idSeguro || hashSeguro.length !== 64) {
    throw erroAmostra('Identidade da amostra de layout invalida.', 400, 'AMOSTRA_IDENTIDADE_INVALIDA');
  }
  return `layouts-bancarios/rascunhos/${idSeguro}/${hashSeguro}-${nomeArquivoSeguro(arquivo)}`;
}

function expiraEm(retencaoDias = RETENCAO_AMOSTRA_DIAS, agora = new Date()) {
  return new Date(agora.getTime() + (retencaoDias * 24 * 60 * 60 * 1000));
}

module.exports = {
  LIMITE_AMOSTRA_LAYOUT,
  RETENCAO_AMOSTRA_DIAS,
  nomeArquivoSeguro,
  extrairAmostraLayout,
  caminhoAmostraLayout,
  expiraEm,
};
