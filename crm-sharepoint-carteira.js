'use strict';

const core = require('./crm-contabil');
const {cnpjNormalizado, identificarGestores, resolverDestinatarios} = require('./crm-sharepoint-notificacoes');

function falha(mensagem, code, status = 409) {
  throw Object.assign(new Error(mensagem), {status, code, motivo: mensagem});
}

/**
 * Lê exclusivamente a carteira e a topologia existentes, pela instância db do CCI.
 * reader pode ser uma transação já aberta; este módulo só faz leituras.
 * Sem reader, usa runTransaction para manter empresa, usuários e gestão no mesmo snapshot.
 * A resolução não comprova departamento no cadastro central nem permissão SharePoint.
 * Essas verificações continuam obrigatórias no gate de envio; o resultado é uma prévia.
 */
function criarResolvedorCarteira({db, dominio = 'spassessoriacontabil.com.br', agora = () => new Date()} = {}) {
  if (!db || typeof db.collection !== 'function' || typeof agora !== 'function') {
    falha('Configure o acesso ao banco existente do CCI para consultar a carteira.', 'SHAREPOINT_CARTEIRA_CONFIGURACAO', 503);
  }

  async function lerCarteira(cnpj, reader, hoje) {
    if (!reader || typeof reader.get !== 'function') falha('Use uma leitura transacional para conferir a carteira.', 'SHAREPOINT_CARTEIRA_SNAPSHOT', 503);
    let colecao = 'empresas';
    let documento = await reader.get(db.collection(colecao).doc(cnpj));
    if (!documento.exists) {
      colecao = 'crm_empresas';
      documento = await reader.get(db.collection(colecao).doc(cnpj));
    }
    if (!documento.exists) falha('Cadastre ou identifique a empresa no CRM antes de preparar notificações.', 'SHAREPOINT_EMPRESA_AUSENTE', 404);
    const empresa = documento.data();
    if (empresa?._merged_into) falha('A empresa foi incorporada a outro cadastro. Confira o vínculo no CRM.', 'SHAREPOINT_EMPRESA_INCORPORADA');
    if (!empresa || !Array.isArray(empresa.responsaveis)) falha('Defina os responsáveis da empresa na carteira do CRM.', 'SHAREPOINT_CARTEIRA_INVALIDA');
    if (empresa.cnpj != null && cnpjNormalizado(empresa.cnpj) !== cnpj) falha('Corrija o CNPJ divergente no cadastro da empresa.', 'SHAREPOINT_EMPRESA_DIVERGENTE');
    if (empresa.crm_substituicoes != null && !Array.isArray(empresa.crm_substituicoes)) falha('Corrija os apoios temporários no planejamento do CRM.', 'SHAREPOINT_SUBSTITUICOES_INVALIDAS');
    const responsaveis = core.equipeVigente(empresa, hoje);
    const topologia = await reader.get(db.collection('crm_topologia').doc('gestao'));
    const gestao = topologia.exists ? topologia.data() : null;
    const vinculos = identificarGestores(responsaveis, gestao);
    const ids = [...new Set([...responsaveis.map(r => r.uid), ...vinculos.map(v => v.gestor_uid)])];
    const usuarios = [];
    for (const uid of ids) {
      const doc = await reader.get(db.collection('users').doc(uid));
      if (!doc.exists) falha('Confira no cadastro do CCI o responsável ou gestor que não foi localizado.', 'SHAREPOINT_USUARIO_AUSENTE');
      const u = doc.data();
      if (!u || typeof u !== 'object') falha('Corrija o cadastro do responsável ou gestor no CCI.', 'SHAREPOINT_USUARIO_INVALIDO');
      usuarios.push({uid, ativo: u.active !== false, email: u.last_email || u.email || ''});
    }
    const destinatarios = resolverDestinatarios({responsaveis, usuarios, gestao, dominio});
    return {
      cnpj,
      ...destinatarios,
      versao_carteira: core.versaoCarteira(empresa),
      origem_carteira: colecao + '/' + cnpj,
      data_carteira: hoje,
      estado: 'pendente_validacao',
      envio_autorizado: false,
      validacoes_pendentes: ['departamento_contabil', 'permissoes_sharepoint']
    };
  }

  return async function resolver({cnpj: entrada, reader} = {}) {
    const cnpj = cnpjNormalizado(entrada);
    const instante = new Date(agora());
    if (!Number.isFinite(instante.getTime())) falha('Confira a data de referência para validar os apoios temporários.', 'SHAREPOINT_DATA_INVALIDA');
    const hoje = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(instante);
    if (reader) return lerCarteira(cnpj, reader, hoje);
    if (typeof db.runTransaction !== 'function') falha('Configure a leitura transacional do banco existente do CCI.', 'SHAREPOINT_CARTEIRA_SNAPSHOT', 503);
    return db.runTransaction(tx => lerCarteira(cnpj, tx, hoje));
  };
}

module.exports = {criarResolvedorCarteira};
