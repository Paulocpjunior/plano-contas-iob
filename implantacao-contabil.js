'use strict';

const MODOS = new Set(['ponte_sage', 'cci_exclusivo']);

function normalizarModoContabil(valor) {
  if (valor === undefined) return { ok: true, ausente: true };
  const modo = String(valor || '').trim().toLowerCase();
  if (!MODOS.has(modo)) return { ok: false, erro: 'Modo contabil invalido.' };
  return { ok: true, valor: modo };
}

function normalizarInicioEscrituracao(valor) {
  if (valor === undefined) return { ok: true, ausente: true };
  const data = String(valor || '').trim();
  if (!data) return { ok: true, valor: '' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'Inicio da escrituracao deve usar AAAA-MM-DD.' };
  const [ano, mes, dia] = data.split('-').map(Number);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));
  if (teste.getUTCFullYear() !== ano || teste.getUTCMonth() + 1 !== mes || teste.getUTCDate() !== dia) {
    return { ok: false, erro: 'Data de inicio da escrituracao invalida.' };
  }
  return { ok: true, valor: data };
}

function periodoInicialEmpresa(empresa) {
  const inicio = String(empresa && empresa.inicio_escrituracao_cci || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio.slice(0, 7) : '';
}

function exigeSaldoAbertura(empresa, periodo) {
  if (!empresa || empresa.modo_contabil !== 'cci_exclusivo') return false;
  const inicial = periodoInicialEmpresa(empresa);
  if (!inicial) return true;
  return !periodo || String(periodo) >= inicial;
}

function validarSaldosAbertura(saldos, contas) {
  const mapa = new Map();
  (contas || []).forEach(function (conta) {
    const codigos = [conta.codigo, conta.cod, conta.reduzido, conta.ref_rfb, conta.id]
      .map(function (v) { return String(v || '').trim(); }).filter(Boolean);
    codigos.forEach(function (codigo) { mapa.set(codigo, conta); });
  });
  const erros = [];
  let debitos = 0;
  let creditos = 0;
  let quantidade = 0;
  Object.entries(saldos || {}).forEach(function ([codigo, bruto]) {
    const valor = Number(bruto);
    if (!Number.isFinite(valor)) {
      erros.push({ codigo: 'VALOR_INVALIDO', conta: codigo, mensagem: 'Saldo invalido para a conta ' + codigo + '.' });
      return;
    }
    const centavos = Math.round(valor * 100);
    if (!centavos) return;
    const conta = mapa.get(String(codigo).trim());
    if (mapa.size && !conta) erros.push({ codigo: 'CONTA_FORA_PLANO', conta: codigo, mensagem: 'Conta ' + codigo + ' nao pertence ao plano ativo.' });
    if (conta && conta.analitica === false) erros.push({ codigo: 'CONTA_SINTETICA', conta: codigo, mensagem: 'Saldo de abertura deve usar conta analitica: ' + codigo + '.' });
    quantidade++;
    if (centavos > 0) debitos += centavos;
    else creditos += Math.abs(centavos);
  });
  if (!quantidade) erros.push({ codigo: 'SALDOS_AUSENTES', mensagem: 'Cadastre ao menos um saldo de abertura nao zerado.' });
  if (debitos !== creditos) erros.push({ codigo: 'ABERTURA_DESBALANCEADA', mensagem: 'A abertura nao fecha: debitos e creditos possuem diferenca de ' + (Math.abs(debitos - creditos) / 100).toFixed(2) + '.' });
  return {
    ok: erros.length === 0,
    quantidade,
    debitos: debitos / 100,
    creditos: creditos / 100,
    diferenca: Math.abs(debitos - creditos) / 100,
    erros
  };
}

module.exports = {
  normalizarModoContabil,
  normalizarInicioEscrituracao,
  periodoInicialEmpresa,
  exigeSaldoAbertura,
  validarSaldosAbertura
};
