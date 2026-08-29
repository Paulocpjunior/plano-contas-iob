'use strict';

const zlib = require('zlib');

const ENCODING_PLAIN = 'plain';
const ENCODING_GZIP_BASE64 = 'gzip-base64';
const LIMITE_STATE_DESCOMPACTADO = 95 * 1024 * 1024;
const LIMITE_CHUNK_SESSAO = 700000;
const MINIMO_COMPACTACAO = 64 * 1024;

function erroCodec(mensagem, codigo) {
  const erro = new Error(mensagem);
  erro.codigo = codigo || 'SESSAO_COMPACTACAO_INVALIDA';
  erro.status = 400;
  return erro;
}

function tamanhoUtf8(texto) {
  return Buffer.byteLength(String(texto || ''), 'utf8');
}

function validarTamanhoDescompactado(texto) {
  const bytes = tamanhoUtf8(texto);
  if (bytes > LIMITE_STATE_DESCOMPACTADO) {
    throw erroCodec('A sessão excede o limite seguro de 95 MB.', 'SESSAO_MUITO_GRANDE');
  }
  return bytes;
}

function codificarStateJson(stateJson, opcoes) {
  const texto = String(stateJson || '');
  const bytesOriginais = validarTamanhoDescompactado(texto);
  const minimo = Number(opcoes && opcoes.minimoCompactacao) || MINIMO_COMPACTACAO;
  if (bytesOriginais < minimo) {
    return {
      encoding: ENCODING_PLAIN,
      payload: texto,
      bytesOriginais,
      bytesArmazenados: bytesOriginais,
    };
  }

  const compactado = zlib.gzipSync(Buffer.from(texto, 'utf8'), { level: 6 });
  const payload = compactado.toString('base64');
  const bytesArmazenados = tamanhoUtf8(payload);
  if (bytesArmazenados >= bytesOriginais) {
    return {
      encoding: ENCODING_PLAIN,
      payload: texto,
      bytesOriginais,
      bytesArmazenados: bytesOriginais,
    };
  }
  return {
    encoding: ENCODING_GZIP_BASE64,
    payload,
    bytesOriginais,
    bytesArmazenados,
  };
}

function decodificarPayload(payload, encoding) {
  const tipo = String(encoding || ENCODING_PLAIN).toLowerCase();
  if (tipo === ENCODING_PLAIN) {
    const texto = String(payload || '');
    validarTamanhoDescompactado(texto);
    return texto;
  }
  if (tipo !== ENCODING_GZIP_BASE64) {
    throw erroCodec('Codificação de sessão não reconhecida.', 'SESSAO_CODIFICACAO_INVALIDA');
  }
  try {
    const buffer = Buffer.from(String(payload || ''), 'base64');
    const texto = zlib.gunzipSync(buffer, { maxOutputLength: LIMITE_STATE_DESCOMPACTADO }).toString('utf8');
    validarTamanhoDescompactado(texto);
    return texto;
  } catch (erro) {
    if (erro && erro.codigo) throw erro;
    throw erroCodec('A sessão compactada está inválida ou incompleta.', 'SESSAO_COMPACTACAO_INVALIDA');
  }
}

function stateJsonDoBody(body) {
  const dados = body || {};
  if (typeof dados.state_json === 'string' && dados.state_json) {
    validarTamanhoDescompactado(dados.state_json);
    return dados.state_json;
  }
  if (dados.state_encoding === ENCODING_GZIP_BASE64 && typeof dados.state_gzip_base64 === 'string' && dados.state_gzip_base64) {
    return decodificarPayload(dados.state_gzip_base64, ENCODING_GZIP_BASE64);
  }
  throw erroCodec('state_json ou state_gzip_base64 é obrigatório.', 'SESSAO_PAYLOAD_AUSENTE');
}

function dividirPayload(payload, limite) {
  const texto = String(payload || '');
  const tamanho = Number(limite) || LIMITE_CHUNK_SESSAO;
  const partes = [];
  for (let i = 0; i < texto.length; i += tamanho) partes.push(texto.slice(i, i + tamanho));
  return partes;
}

module.exports = {
  ENCODING_PLAIN,
  ENCODING_GZIP_BASE64,
  LIMITE_STATE_DESCOMPACTADO,
  LIMITE_CHUNK_SESSAO,
  MINIMO_COMPACTACAO,
  tamanhoUtf8,
  codificarStateJson,
  decodificarPayload,
  stateJsonDoBody,
  dividirPayload,
};
