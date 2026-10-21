'use strict';

const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const erro = (message, code) => Object.assign(new Error(message), { status: 409, code });

// O índice contém apenas metadados. Conteúdo e permissões continuam no SharePoint.
function snapshot(item, anterior = null) {
  const id = item && (item.item_id || item.id);
  if (typeof id !== 'string' || !id || id.length > 256) throw erro('Item documental sem identificador válido.', 'ITEM_INVALIDO');
  const campos = ['name', 'eTag', 'cTag', 'size', 'lastModifiedDateTime', 'webUrl', 'file', 'folder', 'root', 'shared'];
  const r = { id, item_id: id };
  for (const campo of campos) {
    const value = Object.hasOwn(item, campo) ? item[campo] : anterior?.[campo];
    if (value !== undefined && value !== null) r[campo] = structuredClone(value);
  }
  const parent = item.parentReference || anterior?.parentReference;
  if (parent) r.parentReference = {
    ...(typeof parent.id === 'string' ? { id: parent.id } : {}),
    ...(typeof parent.driveId === 'string' ? { driveId: parent.driveId } : {})
  };
  r.excluido = !!item.deleted || (!!anterior?.excluido && !item.file && !item.folder);
  if (r.excluido) r.deleted = {};
  if (item.file) delete r.folder;
  if (item.folder) delete r.file;
  return r;
}

function transicao(anterior, posterior) {
  if (posterior.excluido) return anterior?.file && !anterior.excluido ? 'arquivo_excluido' : null;
  if (!posterior.file) return posterior.folder || posterior.root ? null : 'item_pendente_identificacao';
  if (!anterior || anterior.excluido) return 'arquivo_criado';
  if ((anterior.parentReference?.id || '') !== (posterior.parentReference?.id || '')) return 'arquivo_movido';
  if (anterior.name !== posterior.name) return 'arquivo_alterado';
  if (anterior.eTag && posterior.eTag && anterior.eTag !== posterior.eTag) return 'arquivo_alterado';
  if (anterior.cTag && posterior.cTag && anterior.cTag !== posterior.cTag) return 'arquivo_alterado';
  return anterior.size !== posterior.size || anterior.lastModifiedDateTime !== posterior.lastModifiedDateTime ? 'arquivo_alterado' : null;
}

function assinatura(item) {
  if (!item) return null;
  return hash([item.id, !!item.excluido, item.name || null, item.parentReference?.id || null,
    item.eTag || null, item.cTag || null, item.size ?? null, item.lastModifiedDateTime || null]);
}

function urlDoItem(item, host, permitirAusente = false) {
  if (!item.webUrl && permitirAusente) return null;
  let u;
  try { u = new URL(item.webUrl); } catch { throw erro('Documento sem endereço SharePoint válido. Confira o vínculo da biblioteca.', 'URL_DOCUMENTO_INVALIDA'); }
  if (u.protocol !== 'https:' || u.hostname !== host || u.port || u.username || u.password || u.hash) {
    throw erro('O endereço do documento não corresponde ao SharePoint autorizado.', 'HOST_DOCUMENTO_DIVERGENTE');
  }
  return u.href;
}

// Resolve IDs de ancestrais, nunca infere empresa por nome de pasta ou URL.
async function resolverVinculo({ item, driveId, obterItem, obterVinculo }) {
  const encontrados = new Set();
  const vistos = new Set();
  let atual = item;
  for (let n = 0; atual && n < 100; n++) {
    if (atual.excluido || atual.deleted) throw erro('A árvore documental contém um item excluído. Confira o inventário antes de notificar.', 'ANCESTRAL_EXCLUIDO');
    if (vistos.has(atual.id)) throw erro('Há um ciclo na árvore documental. Revise o inventário.', 'ANCESTRAL_CICLICO');
    vistos.add(atual.id);
    if (atual.parentReference?.driveId && atual.parentReference.driveId !== driveId) {
      throw erro('O documento aponta para outra biblioteca. Revise a movimentação.', 'DRIVE_DIVERGENTE');
    }
    const vinculo = await obterVinculo(atual.id);
    if (vinculo?.ativo === true) {
      if (!/^\d{14}$/.test(vinculo.cnpj || '')) throw erro('Corrija o CNPJ no vínculo documental.', 'VINCULO_INVALIDO');
      encontrados.add(vinculo.cnpj);
    }
    const parentId = atual.parentReference?.id;
    if (atual.root || !parentId) {
      if (!atual.root) throw erro('O inventário ainda não identifica a pasta do documento.', 'ANCESTRAL_AUSENTE');
      break;
    }
    atual = await obterItem(parentId);
    if (!atual) throw erro('Pasta ancestral ausente do inventário. Confira a biblioteca monitorada.', 'ANCESTRAL_AUSENTE');
    if (n === 99) throw erro('A árvore excede o limite de profundidade. Revise o inventário.', 'ANCESTRAL_LIMITE');
  }
  if (encontrados.size !== 1) throw erro('A pasta precisa de um vínculo único com uma empresa do CRM.', encontrados.size ? 'EMPRESA_AMBIGUA' : 'EMPRESA_NAO_VINCULADA');
  return [...encontrados][0];
}

module.exports = { hash, erro, snapshot, transicao, assinatura, urlDoItem, resolverVinculo };
