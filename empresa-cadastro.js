'use strict';

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
  const campos = {};
  if (!codigo.ausente) campos.codigo_empresa = codigo.valor;
  if (!whatsapp.ausente) campos.whatsapp = whatsapp.valor;
  if (dados.razao_social !== undefined) campos.razao_social = String(dados.razao_social || '').trim();
  return { ok: true, campos };
}

module.exports = {
  normalizarCodigoEmpresa,
  normalizarWhatsappBr,
  codigoEmpresaDe,
  empresaBateBusca,
  camposCadastroEmpresa
};
