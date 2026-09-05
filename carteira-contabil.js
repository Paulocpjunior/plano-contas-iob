'use strict';

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

function papelValido(valor) {
  return valor === 'principal' ? 'principal' : 'apoio';
}

function normalizarResponsaveis(valor) {
  if (!Array.isArray(valor)) return [];
  const unicos = new Map();
  valor.forEach(function(item) {
    const uid = texto(item && (item.uid || item.colaborador_uid));
    if (!uid) return;
    unicos.set(uid, {
      uid,
      nome: texto(item.nome || item.colaborador_nome || item.email),
      email: texto(item.email).toLowerCase(),
      papel: papelValido(item.papel),
      atribuido_por_uid: texto(item.atribuido_por_uid),
      atribuido_por_email: texto(item.atribuido_por_email),
      atribuido_em: item.atribuido_em || null
    });
  });
  return Array.from(unicos.values());
}

function atribuirResponsavel(listaAtual, colaborador, papel, auditoria) {
  const uid = texto(colaborador && colaborador.uid);
  if (!uid) throw new Error('Colaborador invalido');
  const novoPapel = papelValido(papel);
  let lista = normalizarResponsaveis(listaAtual).filter(function(item) { return item.uid !== uid; });
  if (novoPapel === 'principal') {
    lista = lista.map(function(item) { return { ...item, papel: 'apoio' }; });
  }
  lista.push({
    uid,
    nome: texto(colaborador.nome || colaborador.name || colaborador.email),
    email: texto(colaborador.email).toLowerCase(),
    papel: novoPapel,
    atribuido_por_uid: texto(auditoria && auditoria.uid),
    atribuido_por_email: texto(auditoria && auditoria.email).toLowerCase(),
    atribuido_em: auditoria && auditoria.quando ? auditoria.quando : new Date()
  });
  return lista;
}

function removerResponsavel(listaAtual, uid) {
  const alvo = texto(uid);
  return normalizarResponsaveis(listaAtual).filter(function(item) { return item.uid !== alvo; });
}

function camposCarteira(responsaveis) {
  const lista = normalizarResponsaveis(responsaveis);
  return {
    responsaveis: lista,
    carteira_uids: lista.map(function(item) { return item.uid; }),
    carteira_emails: Array.from(new Set(lista.map(function(item) { return item.email; }).filter(Boolean)))
  };
}

function usuarioEstaNaCarteira(empresa, usuario) {
  if (!empresa || !usuario || !usuario.uid) return false;
  const uid = texto(usuario.uid);
  if (Array.isArray(empresa.carteira_uids) && empresa.carteira_uids.map(String).includes(uid)) return true;
  return normalizarResponsaveis(empresa.responsaveis).some(function(item) { return item.uid === uid; });
}

function definirEquipe(principal, apoio, auditoria) {
  if (!principal || !principal.uid) throw Object.assign(new Error('Selecione o responsável principal.'), { status: 400 });
  if (apoio && apoio.uid === principal.uid) throw Object.assign(new Error('Responsável e apoio devem ser pessoas diferentes.'), { status: 400 });
  let equipe = atribuirResponsavel([], principal, 'principal', auditoria);
  if (apoio) equipe = atribuirResponsavel(equipe, apoio, 'apoio', auditoria);
  return equipe;
}

module.exports = {
  definirEquipe,
  atribuirResponsavel,
  camposCarteira,
  normalizarResponsaveis,
  papelValido,
  removerResponsavel,
  usuarioEstaNaCarteira
};
