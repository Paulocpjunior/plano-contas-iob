'use strict';

const { randomUUID } = require('node:crypto');
const { hash } = require('./crm-sharepoint-documentos');
const { BIBLIOTECAS } = require('./crm-sharepoint-monitor');
const { cnpjNormalizado } = require('./crm-sharepoint-notificacoes');
const erro = (message, code, status = 409) => Object.assign(new Error(message), { status, code });

function criarConfigurador({ db, agora = Date.now }) {
  const bibliotecaRef = driveId => db.collection(BIBLIOTECAS).doc(hash(driveId));
  async function admin(tx, uid) {
    if (typeof uid !== 'string' || !uid || uid.includes('/')) throw erro('Entre com um administrador do CCI.', 'ADMIN_NECESSARIO', 403);
    const s = await tx.get(db.collection('users').doc(uid));
    if (!s.exists || s.data().is_admin !== true || s.data().active === false) throw erro('Somente administrador ativo pode configurar o monitor.', 'ADMIN_NECESSARIO', 403);
  }
  function id(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_!.-]{1,256}$/.test(value)) throw erro('Identificador documental inválido.', 'IDENTIFICADOR_INVALIDO', 400);
    return value;
  }
  function conferirRevisao(data, revisao) {
    if (!Number.isSafeInteger(revisao) || revisao !== (data?.revisao || 0)) throw erro('A configuração mudou. Atualize a tela antes de salvar.', 'REVISAO_DIVERGENTE');
    if (data?.ciclo || data?.lease?.expira_em_ms > agora()) throw erro('Conclua o ciclo atual antes de alterar os vínculos.', 'CICLO_EM_ANDAMENTO');
  }
  async function salvarBiblioteca({ adminUid, driveId, sharepointHost, revisao = 0, habilitada = false, canais = ['teams', 'email'], siteNome, bibliotecaNome }) {
    id(driveId);
    if (typeof sharepointHost !== 'string' || !/^[a-z0-9-]+\.sharepoint\.com$/.test(sharepointHost)) throw erro('Informe somente o host SharePoint do escritório.', 'HOST_INVALIDO', 400);
    if (typeof habilitada !== 'boolean' || !Array.isArray(canais) || !canais.length || canais.some(c => !['teams', 'email'].includes(c))) throw erro('Confira os canais e a habilitação da biblioteca.', 'CONFIGURACAO_INVALIDA', 400);
    const rotulos = {};
    for (const [campo, valor] of [['site_nome', siteNome], ['biblioteca_nome', bibliotecaNome]]) {
      if (valor !== undefined) {
        if (typeof valor !== 'string' || !valor.trim() || valor.length > 120 || /[\x00-\x1f]/.test(valor)) throw erro('Confira o nome do site e da biblioteca.', 'CONFIGURACAO_INVALIDA', 400);
        rotulos[campo] = valor.trim();
      }
    }
    const ref = bibliotecaRef(driveId);
    return db.runTransaction(async tx => {
      await admin(tx, adminUid);
      const s = await tx.get(ref), anterior = s.data();
      conferirRevisao(anterior, revisao);
      if (anterior && (anterior.drive_id !== driveId || anterior.sharepoint_host !== sharepointHost)) throw erro('O drive e o host da biblioteca existente não podem ser substituídos.', 'BIBLIOTECA_DIVERGENTE');
      const dados = { ...rotulos, drive_id: driveId, sharepoint_host: sharepointHost, canais: [...new Set(canais)], habilitada,
        revisao: revisao + 1, homologada: false, envios_habilitados: false, proximo_passo_em_ms: 0,
        atualizado_por: adminUid, atualizado_em: new Date(agora()).toISOString(),
        ...(anterior ? {} : { fase: 'novo', checkpoint: null, ciclo: null, lease: null, geracao: null, proximo_passo_em_ms: 0 }) };
      tx.set(ref, dados, { merge: true });
      tx.create(ref.collection('historico').doc(randomUUID()), { tipo: 'configuracao', autor: adminUid, quando: dados.atualizado_em, revisao: dados.revisao, habilitada, canais: dados.canais });
      return { biblioteca_id: ref.id, revisao: dados.revisao, habilitada, homologada: false, envios_habilitados: false };
    });
  }
  async function vincularPasta({ adminUid, driveId, pastaId, cnpj: entrada, revisao, ativo = true }) {
    id(driveId); id(pastaId);
    const cnpj = cnpjNormalizado(entrada), ref = bibliotecaRef(driveId);
    if (typeof ativo !== 'boolean') throw erro('Confira a situação do vínculo.', 'VINCULO_INVALIDO', 400);
    return db.runTransaction(async tx => {
      await admin(tx, adminUid);
      const s = await tx.get(ref), lib = s.data();
      if (!lib || lib.drive_id !== driveId || !lib.geracao) throw erro('Conclua o inventário inicial antes de vincular as pastas.', 'INVENTARIO_NECESSARIO');
      conferirRevisao(lib, revisao);
      let empresa = await tx.get(db.collection('empresas').doc(cnpj));
      if (!empresa.exists) empresa = await tx.get(db.collection('crm_empresas').doc(cnpj));
      if (!empresa.exists || empresa.data()?._merged_into) throw erro('Use uma empresa ativa já existente no CRM.', 'EMPRESA_NAO_CONFIRMADA');
      const pasta = await tx.get(ref.collection('inventarios').doc(lib.geracao).collection('itens').doc(hash(pastaId)));
      if (!pasta.exists || !pasta.data().item?.folder || pasta.data().item.excluido || pasta.data().item.root) throw erro('Selecione uma pasta de cliente confirmada no inventário.', 'PASTA_NAO_CONFIRMADA');
      const vr = ref.collection('vinculos').doc(hash(pastaId)), antes = await tx.get(vr);
      const quando = new Date(agora()).toISOString();
      // Só relação técnica pasta/CNPJ. A distribuição permanece na carteira original.
      tx.set(vr, { pasta_id: pastaId, cnpj, ativo, confirmado_por: adminUid, confirmado_em: quando });
      tx.set(ref, { revisao: revisao + 1, homologada: false, envios_habilitados: false, atualizado_em: quando }, { merge: true });
      tx.create(ref.collection('historico').doc(randomUUID()), { tipo: 'vinculo_documental', pasta_id: pastaId, cnpj,
        cnpj_anterior: antes.data()?.cnpj || null, ativo, autor: adminUid, quando });
      return { pasta_id: pastaId, cnpj, ativo, revisao: revisao + 1, envios_habilitados: false };
    });
  }
  return { salvarBiblioteca, vincularPasta };
}

module.exports = { criarConfigurador };
