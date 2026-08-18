'use strict';

const { normalizarModoContabil, normalizarInicioEscrituracao } = require('./implantacao-contabil');

function normalizarCodigoEmpresa(bruto) {
  if (bruto === undefined) return { ok: true, ausente: true };
  if (bruto === null || String(bruto).trim() === '') return { ok: true, valor: '' };
  const texto = String(bruto).trim();
  if (!/^\d{1,4}$/.test(texto)) {
    return { ok: false, erro: 'Numero da empresa invalido: use de 1 a 4 digitos (0001 a 9999).' };
  }
  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 1 || numero > 9999) {
    return { ok: false, erro: 'Numero da empresa deve estar entre 0001 e 9999.' };
  }
  return { ok: true, valor: String(numero).padStart(4, '0') };
}

function normalizarWhatsappBr(bruto) {
  if (bruto === undefined) return { ok: true, ausente: true };
  let digitos = String(bruto || '').replace(/\D/g, '');
  if (!digitos) return { ok: true, valor: '' };
  digitos = digitos.replace(/^0+/, '');
  if (!digitos.startsWith('55')) digitos = '55' + digitos;
  if (!/^55\d{10,11}$/.test(digitos)) {
    return { ok: false, erro: 'WhatsApp invalido: informe DDD + numero, com 10 ou 11 digitos.' };
  }
  const ddd = Number(digitos.slice(2, 4));
  if (ddd < 11 || ddd > 99) {
    return { ok: false, erro: 'WhatsApp invalido: confira o DDD informado.' };
  }
  return { ok: true, valor: digitos };
}

function normalizarTextoCadastro(bruto, limite) {
  if (bruto === undefined) return { ok: true, ausente: true };
  const valor = String(bruto || '').trim().replace(/\s+/g, ' ');
  if (limite && valor.length > limite) {
    return { ok: false, erro: 'Campo cadastral excede o limite de ' + limite + ' caracteres.' };
  }
  return { ok: true, valor };
}

function normalizarDataCadastro(bruto, rotulo) {
  if (bruto === undefined) return { ok: true, ausente: true };
  const valor = String(bruto || '').trim();
  if (!valor) return { ok: true, valor: '' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor + 'T00:00:00Z'))) {
    return { ok: false, erro: (rotulo || 'Data') + ' invalida.' };
  }
  return { ok: true, valor };
}

function normalizarTipoEstabelecimento(bruto) {
  if (bruto === undefined) return { ok: true, ausente: true };
  const valor = String(bruto || '').trim().toUpperCase();
  if (!valor) return { ok: true, valor: '' };
  if (!['MATRIZ', 'FILIAL'].includes(valor)) {
    return { ok: false, erro: 'Tipo de estabelecimento invalido: use MATRIZ ou FILIAL.' };
  }
  return { ok: true, valor };
}

function normalizarCnpjVinculo(bruto) {
  if (bruto === undefined) return { ok: true, ausente: true };
  const valor = String(bruto || '').replace(/\D/g, '');
  if (!valor) return { ok: true, valor: '' };
  if (!/^\d{14}$/.test(valor)) return { ok: false, erro: 'CNPJ da matriz deve ter 14 digitos.' };
  return { ok: true, valor };
}

function codigoEmpresaDe(empresa) {
  const valor = empresa && (
    empresa.codigo_empresa ?? empresa.codigo_cliente ?? empresa.codCliente ??
    empresa.numero_empresa ?? (empresa.dadosFiscais && empresa.dadosFiscais.codCliente)
  );
  const normalizado = normalizarCodigoEmpresa(valor);
  return normalizado.ok && !normalizado.ausente ? normalizado.valor : '';
}

function empresaBateBusca(termoBruto, empresa) {
  const termo = String(termoBruto || '').trim().toLowerCase();
  if (!termo) return true;
  const digitos = termo.replace(/\D/g, '');
  const nome = String((empresa && (empresa.razao_social || empresa.nome || empresa.empresa)) || '').toLowerCase();
  if (nome.includes(termo)) return true;
  const cnpj = String((empresa && empresa.cnpj) || '').replace(/\D/g, '');
  if (digitos && cnpj.includes(digitos)) return true;
  const codigo = codigoEmpresaDe(empresa);
  if (codigo && digitos && digitos.length <= 4) {
    return codigo === digitos.padStart(4, '0') || codigo.startsWith(digitos) || String(Number(codigo)) === digitos;
  }
  return false;
}

function camposCadastroEmpresa(payload) {
  const dados = payload || {};
  const codigoBruto = dados.codigo_empresa ?? dados.codigo_cliente ?? dados.codCliente ?? dados.numero_empresa;
  const whatsappBruto = dados.whatsapp ?? dados.whatsapp_cliente ?? dados.whatsappCliente;
  const codigo = normalizarCodigoEmpresa(codigoBruto);
  if (!codigo.ok) return codigo;
  const whatsapp = normalizarWhatsappBr(whatsappBruto);
  if (!whatsapp.ok) return whatsapp;
  const modo = normalizarModoContabil(dados.modo_contabil);
  if (!modo.ok) return modo;
  const inicio = normalizarInicioEscrituracao(dados.inicio_escrituracao_cci);
  if (!inicio.ok) return inicio;
  const tipoEstabelecimento = normalizarTipoEstabelecimento(dados.tipo_estabelecimento);
  if (!tipoEstabelecimento.ok) return tipoEstabelecimento;
  const matrizCnpj = normalizarCnpjVinculo(dados.matriz_cnpj);
  if (!matrizCnpj.ok) return matrizCnpj;
  const campos = {};
  if (!codigo.ausente) campos.codigo_empresa = codigo.valor;
  if (!whatsapp.ausente) campos.whatsapp = whatsapp.valor;
  if (dados.razao_social !== undefined) campos.razao_social = String(dados.razao_social || '').trim();
  if (!modo.ausente) campos.modo_contabil = modo.valor;
  if (!inicio.ausente) campos.inicio_escrituracao_cci = inicio.valor;
  if (!tipoEstabelecimento.ausente) campos.tipo_estabelecimento = tipoEstabelecimento.valor;
  if (!matrizCnpj.ausente) campos.matriz_cnpj = matrizCnpj.valor;

  const textos = {
    nome_fantasia: 160,
    tipo_logradouro: 40,
    logradouro: 180,
    numero: 20,
    complemento: 80,
    bairro: 100,
    distrito: 100,
    municipio: 100,
    uf: 2,
    cep: 10,
    site: 200,
    telefone: 30,
    fax: 30,
    celular: 30,
    inscricao_estadual: 30,
    inscricao_municipal: 30,
    inscricao_suframa: 30,
    natureza_juridica: 120,
    cnae_principal: 20,
    cnae_secundario: 20,
    registro_orgao: 40,
    registro_numero: 50,
    email: 160,
    contato: 120
  };
  for (const [campo, limite] of Object.entries(textos)) {
    const normalizado = normalizarTextoCadastro(dados[campo], limite);
    if (!normalizado.ok) return normalizado;
    if (!normalizado.ausente) campos[campo] = normalizado.valor;
  }
  if (campos.uf && !/^[A-Z]{2}$/.test(campos.uf.toUpperCase())) return { ok: false, erro: 'UF invalida.' };
  if (campos.uf) campos.uf = campos.uf.toUpperCase();
  if (campos.cep) {
    campos.cep = campos.cep.replace(/\D/g, '');
    if (campos.cep && campos.cep.length !== 8) return { ok: false, erro: 'CEP deve ter 8 digitos.' };
  }
  if (campos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email)) return { ok: false, erro: 'E-mail cadastral invalido.' };
  const datas = {
    data_abertura: 'Data de abertura',
    inicio_atividades: 'Inicio das atividades',
    data_registro: 'Data de registro'
  };
  for (const [campo, rotulo] of Object.entries(datas)) {
    const normalizada = normalizarDataCadastro(dados[campo], rotulo);
    if (!normalizada.ok) return normalizada;
    if (!normalizada.ausente) campos[campo] = normalizada.valor;
  }
  if (campos.tipo_estabelecimento === 'MATRIZ') campos.matriz_cnpj = '';
  if (campos.tipo_estabelecimento === 'FILIAL' && !campos.matriz_cnpj) {
    return { ok: false, erro: 'Selecione o CNPJ da matriz para cadastrar uma filial.' };
  }
  return { ok: true, campos };
}

module.exports = {
  normalizarCodigoEmpresa,
  normalizarWhatsappBr,
  normalizarTipoEstabelecimento,
  normalizarCnpjVinculo,
  codigoEmpresaDe,
  empresaBateBusca,
  camposCadastroEmpresa
};
