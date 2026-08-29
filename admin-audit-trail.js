'use strict';

const STATUS_RESULTADO = new Set(['sucesso', 'falha', 'bloqueado']);

function texto(valor, limite) {
  if (valor === undefined || valor === null) return null;
  const saida = String(valor).trim();
  return saida ? saida.slice(0, limite) : null;
}

function cnpjSeguro(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length === 14 ? digitos : null;
}

function detalhesSeguros(detalhes) {
  if (!detalhes || typeof detalhes !== 'object' || Array.isArray(detalhes)) return {};
  return Object.fromEntries(Object.entries(detalhes).slice(0, 30).flatMap(([chave, valor]) => {
    const nome = texto(chave, 80);
    if (!nome || valor === undefined || valor === null) return [];
    if (typeof valor === 'boolean') return [[nome, valor]];
    if (typeof valor === 'number' && Number.isFinite(valor)) return [[nome, valor]];
    if (typeof valor === 'string') return [[nome, valor.slice(0, 500)]];
    return [];
  }));
}

function montarEventoAuditoriaAdmin(entrada) {
  const dados = entrada || {};
  const evento = texto(dados.evento, 120);
  const status = texto(dados.resultado && dados.resultado.status, 30);
  if (!evento) throw new Error('evento de auditoria obrigatorio');
  if (!STATUS_RESULTADO.has(status)) throw new Error('resultado de auditoria invalido');

  const usuario = dados.user || {};
  const escopo = dados.escopo || {};
  return {
    schema_version: 1,
    evento,
    categoria: texto(dados.categoria, 80) || 'administracao',
    acao: texto(dados.acao, 120) || evento,
    resultado: {
      status,
      codigo: texto(dados.resultado && dados.resultado.codigo, 120),
      http_status: Number.isInteger(dados.resultado && dados.resultado.httpStatus)
        ? dados.resultado.httpStatus
        : null,
    },
    ator: {
      uid: texto(usuario.uid, 180),
      email: texto(usuario.email, 254),
      is_admin: usuario.is_admin === true,
    },
    escopo: {
      cnpj: cnpjSeguro(dados.cnpj || escopo.cnpj),
      recurso: texto(escopo.recurso, 100),
      recurso_id: texto(escopo.recursoId, 180),
      periodo: texto(escopo.periodo, 20),
      lote_id: texto(escopo.loteId, 180),
    },
    detalhes: detalhesSeguros(dados.detalhes),
    timestamp: dados.quando instanceof Date ? dados.quando : new Date(),
  };
}

async function registrarAuditoriaAdmin(db, entrada) {
  if (!db || typeof db.collection !== 'function') throw new Error('Firestore de auditoria indisponivel');
  const evento = montarEventoAuditoriaAdmin(entrada);
  const ref = await db.collection('admin_audit_logs').add(evento);
  return { id: ref && ref.id || null, evento };
}

module.exports = {
  STATUS_RESULTADO,
  detalhesSeguros,
  montarEventoAuditoriaAdmin,
  registrarAuditoriaAdmin,
};
