'use strict';

const crypto = require('crypto');

function texto(valor, limite = 500) {
  return String(valor == null ? '' : valor).trim().slice(0, limite);
}

function cnpj(valor) {
  const digitos = texto(valor, 30).replace(/\D/g, '');
  return digitos.length === 14 ? digitos : '';
}

function dataISO(valor) {
  const saida = texto(valor, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saida)) return '';
  const data = new Date(`${saida}T00:00:00Z`);
  return Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== saida ? '' : saida;
}

function centavos(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(Math.abs(valor) * 100) : 0;
  let s = texto(valor, 80).replace(/\s/g, '').replace(/R\$/gi, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const numero = Number(s);
  return Number.isFinite(numero) ? Math.round(Math.abs(numero) * 100) : 0;
}

function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(Object.keys(valor).sort().map(chave => [chave, ordenar(valor[chave])]));
}

function jsonCanonico(valor) {
  return JSON.stringify(ordenar(valor));
}

function sha256(valor) {
  return crypto.createHash('sha256').update(typeof valor === 'string' ? valor : jsonCanonico(valor), 'utf8').digest('hex');
}

function normalizarDePara(linhas) {
  const mapa = new Map();
  const erros = [];
  (Array.isArray(linhas) ? linhas : []).forEach((linha, indice) => {
    const tipo = texto(linha && linha.tipo_registro, 30).toUpperCase();
    const codigoSage = texto(linha && linha.codigo_sage, 100);
    const codigoCci = texto(linha && linha.codigo_cci, 100);
    const status = texto(linha && linha.status, 30).toUpperCase();
    const chave = `${tipo}|${codigoSage}`;
    if (!['CONTA', 'HISTORICO', 'CENTRO_CUSTO'].includes(tipo) || !codigoSage) {
      erros.push({ codigo: 'DEPARA_INVALIDO', linha: indice + 1, mensagem: 'Tipo e código SAGE são obrigatórios no de-para.' });
      return;
    }
    if (mapa.has(chave)) {
      erros.push({ codigo: 'DEPARA_DUPLICADO', linha: indice + 1, mensagem: `De-para duplicado para ${chave}.` });
      return;
    }
    mapa.set(chave, { tipo, codigoSage, codigoCci, status, descricaoCci: texto(linha.descricao_cci, 300) });
  });
  return { mapa, erros };
}

function resolver(mapa, tipo, codigo, obrigatorio, rejeicoes, chaveOrigem) {
  const origem = texto(codigo, 100);
  if (!origem && !obrigatorio) return '';
  const item = mapa.get(`${tipo}|${origem}`);
  if (!item || item.status !== 'VALIDADO' || !item.codigoCci) {
    rejeicoes.push({
      codigo: `${tipo}_SEM_DEPARA`,
      chave_origem: chaveOrigem,
      campo: tipo.toLowerCase(),
      valor_origem: origem,
      mensagem: `${tipo} ${origem || '(vazio)'} não possui de-para VALIDADO para o CCI.`,
    });
    return '';
  }
  return item.codigoCci;
}

function normalizarFonte(fonte) {
  const dados = fonte || {};
  return {
    nome: texto(dados.nome, 260),
    sha256: texto(dados.sha256, 64).toLowerCase(),
    tamanho_bytes: Number.isInteger(dados.tamanho_bytes) && dados.tamanho_bytes >= 0 ? dados.tamanho_bytes : null,
    formato: texto(dados.formato, 80),
  };
}

function prepararStaging(entrada) {
  const dados = entrada || {};
  const empresaCnpj = cnpj(dados.empresa_cnpj);
  const competencia = texto(dados.competencia, 7);
  const codigoEmpresaSage = texto(dados.codigo_empresa_sage, 50);
  const fonte = normalizarFonte(dados.fonte);
  const errosGerais = [];
  if (!empresaCnpj) errosGerais.push({ codigo: 'CNPJ_INVALIDO', mensagem: 'CNPJ da empresa deve conter 14 dígitos.' });
  if (!/^\d{4}-\d{2}$/.test(competencia)) errosGerais.push({ codigo: 'COMPETENCIA_INVALIDA', mensagem: 'Competência deve usar AAAA-MM.' });
  if (!codigoEmpresaSage) errosGerais.push({ codigo: 'EMPRESA_SAGE_AUSENTE', mensagem: 'Código da empresa no SAGE é obrigatório.' });
  if (!fonte.nome || !/^[a-f0-9]{64}$/.test(fonte.sha256) || fonte.tamanho_bytes === null) {
    errosGerais.push({ codigo: 'FONTE_INVALIDA', mensagem: 'Nome, tamanho e SHA-256 real do arquivo-fonte são obrigatórios.' });
  }

  const dePara = normalizarDePara(dados.de_para);
  errosGerais.push(...dePara.erros);
  const contasCci = new Set((Array.isArray(dados.contas_cci_validas) ? dados.contas_cci_validas : []).map(item => texto(item, 100)).filter(Boolean));
  if (!contasCci.size) errosGerais.push({ codigo: 'PLANO_CCI_SEM_CONTAS', mensagem: 'O plano CCI ativo não possui contas disponíveis para validar o de-para.' });
  const lancamentos = Array.isArray(dados.lancamentos) ? dados.lancamentos : [];
  if (!lancamentos.length) errosGerais.push({ codigo: 'SEM_LANCAMENTOS', mensagem: 'Nenhum lançamento estruturado foi informado.' });
  if (lancamentos.length > 100000) errosGerais.push({ codigo: 'LIMITE_EXCEDIDO', mensagem: 'O lote excede 100.000 lançamentos.' });

  const aceitos = [];
  const rejeicoes = [];
  const chaves = new Set();
  lancamentos.slice(0, 100000).forEach((linha, indice) => {
    const chaveOrigem = texto(linha && linha.chave_origem, 180);
    const rejeicoesLinha = [];
    const data = dataISO(linha && linha.data);
    const valorCentavos = centavos(linha && linha.valor);
    const loteOrigem = texto(linha && linha.lote_origem, 100);
    if (!chaveOrigem) rejeicoesLinha.push({ codigo: 'CHAVE_ORIGEM_AUSENTE', chave_origem: '', mensagem: 'Chave original SAGE é obrigatória.' });
    else if (chaves.has(chaveOrigem)) rejeicoesLinha.push({ codigo: 'CHAVE_ORIGEM_DUPLICADA', chave_origem: chaveOrigem, mensagem: 'Chave original SAGE duplicada no lote.' });
    chaves.add(chaveOrigem);
    if (!data || (competencia && data.slice(0, 7) !== competencia)) rejeicoesLinha.push({ codigo: 'DATA_FORA_COMPETENCIA', chave_origem: chaveOrigem, mensagem: 'Data inválida ou fora da competência do lote.' });
    if (!valorCentavos) rejeicoesLinha.push({ codigo: 'VALOR_INVALIDO', chave_origem: chaveOrigem, mensagem: 'Valor deve ser maior que zero.' });
    if (!loteOrigem) rejeicoesLinha.push({ codigo: 'LOTE_ORIGEM_AUSENTE', chave_origem: chaveOrigem, mensagem: 'Lote original SAGE é obrigatório.' });
    const contaDebito = resolver(dePara.mapa, 'CONTA', linha && linha.conta_debito_sage, true, rejeicoesLinha, chaveOrigem);
    const contaCredito = resolver(dePara.mapa, 'CONTA', linha && linha.conta_credito_sage, true, rejeicoesLinha, chaveOrigem);
    const historicoCodigo = resolver(dePara.mapa, 'HISTORICO', linha && linha.historico_codigo_sage, true, rejeicoesLinha, chaveOrigem);
    const centroCusto = resolver(dePara.mapa, 'CENTRO_CUSTO', linha && linha.centro_custo_sage, false, rejeicoesLinha, chaveOrigem);
    if (contaDebito && contasCci.size && !contasCci.has(contaDebito)) rejeicoesLinha.push({ codigo: 'DEBITO_FORA_PLANO_CCI', chave_origem: chaveOrigem, mensagem: `Conta de débito CCI ${contaDebito} não existe no plano ativo.` });
    if (contaCredito && contasCci.size && !contasCci.has(contaCredito)) rejeicoesLinha.push({ codigo: 'CREDITO_FORA_PLANO_CCI', chave_origem: chaveOrigem, mensagem: `Conta de crédito CCI ${contaCredito} não existe no plano ativo.` });
    if (contaDebito && contaCredito && contaDebito === contaCredito) rejeicoesLinha.push({ codigo: 'MESMA_CONTA', chave_origem: chaveOrigem, mensagem: 'Débito e crédito resultaram na mesma conta CCI.' });
    if (rejeicoesLinha.length) {
      rejeicoes.push(...rejeicoesLinha.map(item => ({ linha: indice + 1, ...item })));
      return;
    }
    const base = {
      chave_origem: chaveOrigem,
      lote_origem: loteOrigem,
      data,
      valor_centavos: valorCentavos,
      conta_debito: contaDebito,
      conta_credito: contaCredito,
      historico_codigo: historicoCodigo,
      historico: texto(linha.historico, 500),
      centro_custo: centroCusto,
      documento: texto(linha.documento, 120),
    };
    aceitos.push({ ...base, hash_registro: sha256(base) });
  });

  const totalCentavos = aceitos.reduce((soma, item) => soma + item.valor_centavos, 0);
  const oficial = dados.total_oficial || {};
  const quantidadeOficial = Number.isInteger(oficial.quantidade) ? oficial.quantidade : null;
  const debitosOficiais = centavos(oficial.debitos);
  const creditosOficiais = centavos(oficial.creditos);
  if (quantidadeOficial === null || !debitosOficiais || !creditosOficiais) errosGerais.push({ codigo: 'TOTAL_OFICIAL_AUSENTE', mensagem: 'Quantidade, débitos e créditos oficiais são obrigatórios.' });
  else {
    if (quantidadeOficial !== lancamentos.length) errosGerais.push({ codigo: 'QUANTIDADE_DIVERGENTE', mensagem: 'Quantidade recebida diverge do total oficial.' });
    if (debitosOficiais !== creditosOficiais) errosGerais.push({ codigo: 'ORIGEM_DESBALANCEADA', mensagem: 'Débitos e créditos oficiais do SAGE divergem.' });
    if (!rejeicoes.length && totalCentavos !== debitosOficiais) errosGerais.push({ codigo: 'TOTAL_DIVERGENTE', mensagem: 'Total dos lançamentos aceitos diverge do total oficial.' });
  }

  const staging = {
    schema_version: 1,
    empresa_cnpj: empresaCnpj,
    codigo_empresa_sage: codigoEmpresaSage,
    competencia,
    fonte,
    de_para_hash: sha256((Array.isArray(dados.de_para) ? dados.de_para : []).map(item => ordenar(item))),
    plano_cci_hash: sha256([...contasCci].sort()),
    total_oficial: { quantidade: quantidadeOficial, debitos_centavos: debitosOficiais, creditos_centavos: creditosOficiais },
    resumo: { recebidos: lancamentos.length, aceitos: aceitos.length, rejeitados: rejeicoes.length, total_aceito_centavos: totalCentavos },
    aceitos,
    rejeicoes,
    erros_gerais: errosGerais,
  };
  staging.staging_hash = sha256(staging);
  staging.lote_id = `sage_${competencia.replace('-', '')}_${staging.staging_hash.slice(0, 24)}`;
  staging.apto = errosGerais.length === 0 && rejeicoes.length === 0 && aceitos.length > 0;
  return staging;
}

function entradasMigradas(staging, quando, usuario) {
  if (!staging || staging.apto !== true) throw new Error('Staging não está apto para aplicação.');
  const carimbo = quando instanceof Date ? quando.toISOString() : texto(quando, 40);
  return staging.aceitos.map((item, indice) => {
    const entrada = {
      id: `migracao-sage-${staging.staging_hash.slice(0, 16)}-${String(indice + 1).padStart(6, '0')}`,
      numeroLancamento: null,
      data: item.data,
      descricao: item.historico || `Migração SAGE ${item.chave_origem}`,
      valor: item.valor_centavos / 100,
      contaDebito: item.conta_debito,
      contaCredito: item.conta_credito,
      codigoHistorico: item.historico_codigo,
      historico: item.historico,
      centroCusto: item.centro_custo,
      documento: item.documento,
      origem: 'MIGRACAO_SAGE',
      migracaoLoteId: staging.lote_id,
      migracaoStagingHash: staging.staging_hash,
      migracaoArquivoHash: staging.fonte.sha256,
      migracaoChaveOrigem: item.chave_origem,
      migracaoRegistroHash: item.hash_registro,
      migradoEm: carimbo,
      migradoPorUid: texto(usuario && usuario.uid, 180),
      migradoPorEmail: texto(usuario && usuario.email, 254),
    };
    return entrada;
  });
}

function aplicarNoEstado(state, staging, quando, usuario) {
  if (!state || !Array.isArray(state.entries)) throw new Error('Estado contábil inválido.');
  const existentes = state.entries.filter(item => item && item.migracaoLoteId === staging.lote_id);
  if (existentes.length) {
    const iguais = existentes.length === staging.aceitos.length
      && existentes.every(item => item.migracaoStagingHash === staging.staging_hash);
    if (!iguais) throw new Error('Lote já existe no estado com conteúdo divergente.');
    return { state, idempotente: true, inseridos: 0, total: existentes.length };
  }
  const chavesExistentes = new Set(state.entries.map(item => item && item.migracaoChaveOrigem).filter(Boolean));
  const conflito = staging.aceitos.find(item => chavesExistentes.has(item.chave_origem));
  if (conflito) throw new Error(`Chave SAGE ${conflito.chave_origem} já foi importada por outro lote.`);
  const novas = entradasMigradas(staging, quando, usuario);
  let sequencia = state.entries.reduce((maior, item) => Math.max(maior, Number(item && item.numeroLancamento) || 0), 0);
  novas.forEach(item => {
    sequencia += 1;
    item.numeroLancamento = sequencia;
    item.migracaoEntryHash = sha256(item);
  });
  state.entries.push(...novas);
  return { state, idempotente: false, inseridos: novas.length, total: novas.length };
}

function removerLoteDoEstado(state, loteId) {
  if (!state || !Array.isArray(state.entries)) throw new Error('Estado contábil inválido.');
  const removidos = state.entries.filter(item => item && item.migracaoLoteId === loteId);
  const alterado = removidos.find(item => {
    if (!item.migracaoEntryHash) return true;
    const copia = { ...item };
    const hashRegistrado = copia.migracaoEntryHash;
    delete copia.migracaoEntryHash;
    return sha256(copia) !== hashRegistrado;
  });
  if (alterado) throw new Error(`Lançamento migrado ${alterado.id || ''} foi alterado após a aplicação; rollback automático bloqueado.`);
  state.entries = state.entries.filter(item => !item || item.migracaoLoteId !== loteId);
  return { state, removidos, quantidade: removidos.length };
}

module.exports = {
  aplicarNoEstado,
  centavos,
  entradasMigradas,
  jsonCanonico,
  prepararStaging,
  removerLoteDoEstado,
  sha256,
};
