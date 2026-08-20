'use strict';

function textoCampo(linha, inicio, fim) {
  return String(linha || '').slice(inicio - 1, fim).trim();
}

function normalizarCodigoEmpresa(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos ? String(Number(digitos)) : '';
}

function dataIso(dataBr) {
  const m = String(dataBr || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const data = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (data.getFullYear() !== Number(m[3]) || data.getMonth() !== Number(m[2]) - 1 || data.getDate() !== Number(m[1])) return '';
  return m[3] + '-' + m[2] + '-' + m[1];
}

function dadosNomeArquivo(nomeArquivo) {
  const nome = String(nomeArquivo || '').split(/[\\/]/).pop();
  const m = nome.match(/^FPIMP(\d{3,4})\.(0[1-9]|1[0-2])$/i);
  if (!m) throw new Error('Nome inválido. Use o arquivo original da SAGE no padrão FPIMP + código da empresa + .mês (ex.: FPIMP0040.01).');
  return { nome, codigoEmpresa: m[1], mes: m[2] };
}

function parseLinha(linha, numero) {
  if (linha.length < 328 || linha.length > 342) {
    throw new Error('Linha ' + numero + ' possui ' + linha.length + ' posições; o layout SAGE Folha exige de 328 a 342.');
  }
  const debito = textoCampo(linha, 6, 23);
  const credito = textoCampo(linha, 24, 41);
  const codigoHistorico = textoCampo(linha, 42, 45);
  const valorBruto = textoCampo(linha, 47, 58);
  const dataBr = textoCampo(linha, 59, 68);
  const complemento = textoCampo(linha, 75, 217).replace(/\s+/g, ' ');
  const digitador = textoCampo(linha, 218, 237);
  const tipoMovimento = textoCampo(linha, 238, 257);
  const tipoDigitacao = textoCampo(linha, 328, 328).toUpperCase() || 'N';
  const participanteSped = linha.length >= 332 ? textoCampo(linha, 329, 332) : '';
  const numeroArquivamento = linha.length >= 342 ? textoCampo(linha, 333, 342) : '';

  if (!/^\d{12}$/.test(valorBruto)) throw new Error('Linha ' + numero + ' possui valor inválido nas posições 47-58.');
  const data = dataIso(dataBr);
  if (!data) throw new Error('Linha ' + numero + ' possui data inválida nas posições 59-68.');
  if (!debito || !credito) {
    throw new Error('Linha ' + numero + ' não possui as duas contas. O CCI aceita nesta etapa lançamentos simples da SAGE (um débito e um crédito por registro).');
  }
  if (tipoMovimento && tipoMovimento !== '6') {
    throw new Error('Linha ' + numero + ' possui tipo de movimento ' + tipoMovimento + '; o layout FPIMP da Folha deve usar o tipo 6.');
  }
  if (tipoDigitacao !== 'N') {
    throw new Error('Linha ' + numero + ' usa digitação "' + tipoDigitacao + '". O arquivo deve ser gerado pela SAGE como lançamento simples (N), evitando duplicidade de múltiplas partidas ou auxiliares.');
  }

  const valor = Number(valorBruto) / 100;
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('Linha ' + numero + ' possui valor zerado ou inválido.');
  return {
    linha: numero,
    data,
    data_br: dataBr,
    descricao: complemento || ('FOLHA DE PAGAMENTO - HISTÓRICO ' + codigoHistorico),
    valor,
    contaDebito: debito,
    contaCredito: credito,
    codigoHistorico,
    historico: complemento,
    digitador_sage: digitador,
    tipo_movimento_sage: tipoMovimento,
    tipo_digitacao_sage: tipoDigitacao,
    participante_sped: participanteSped,
    numero_arquivamento: numeroArquivamento,
    categoria: 'Folha de pagamento',
    incomum: false,
    origem: 'sage-folha-fpimp'
  };
}

function parseSageFolhaFpimp(buffer, opcoes) {
  const opts = opcoes || {};
  const arquivo = dadosNomeArquivo(opts.nomeArquivo);
  const codigoCadastro = normalizarCodigoEmpresa(opts.codigoEmpresa);
  const codigoArquivo = normalizarCodigoEmpresa(arquivo.codigoEmpresa);
  if (!codigoCadastro) {
    throw new Error('Cadastre o número da empresa SAGE antes de importar o arquivo FPIMP.');
  }
  if (codigoCadastro && codigoArquivo !== codigoCadastro) {
    throw new Error('O arquivo pertence à empresa SAGE ' + arquivo.codigoEmpresa + ', mas a empresa ativa está cadastrada com o código ' + String(opts.codigoEmpresa) + '.');
  }

  const texto = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer || '');
  if (!texto.trim()) throw new Error('Arquivo FPIMP vazio.');
  const linhas = texto.split(/\r\n|\n|\r/).filter(function (linha) { return linha.length > 0; });
  if (!linhas.length) throw new Error('Arquivo FPIMP sem registros.');
  const lancamentos = linhas.map(function (linha, indice) { return parseLinha(linha, indice + 1); });
  const meses = Array.from(new Set(lancamentos.map(function (l) { return l.data.slice(5, 7); })));
  if (meses.length !== 1) throw new Error('O arquivo FPIMP contém lançamentos de mais de um mês. Importe uma competência por vez.');
  if (meses[0] !== arquivo.mes) {
    throw new Error('O mês do nome do arquivo (.' + arquivo.mes + ') diverge das datas dos lançamentos (' + meses[0] + ').');
  }
  const anos = Array.from(new Set(lancamentos.map(function (l) { return l.data.slice(0, 4); })));
  if (anos.length !== 1) throw new Error('O arquivo FPIMP contém mais de um ano.');
  const total = lancamentos.reduce(function (soma, l) { return soma + Math.round(l.valor * 100); }, 0) / 100;
  const crypto = require('crypto');
  return {
    formato: 'sage_fpimp',
    layout: 'SAGE Folha de Pagamento — FPIMP',
    nome_arquivo: arquivo.nome,
    codigo_empresa_arquivo: arquivo.codigoEmpresa,
    competencia: arquivo.mes + '/' + anos[0],
    data_lancamento: lancamentos[lancamentos.length - 1].data_br,
    lancamentos,
    totais: { lancamentos: lancamentos.length, debitos: total, creditos: total },
    raw_text_hash: crypto.createHash('sha256').update(Buffer.isBuffer(buffer) ? buffer : Buffer.from(texto, 'latin1')).digest('hex').slice(0, 16)
  };
}

module.exports = { parseSageFolhaFpimp, dadosNomeArquivo, normalizarCodigoEmpresa };
