'use strict';
// Movimentação da empresa no CRM (v3.4.497). Regra do Paulo (05/11/2026):
// toda movimentação do colaborador fica evidenciada no status da empresa da
// qual ele é responsável. Cada ação grava uma linha do tempo
// (empresas/{cnpj}/crm_movimentos) e o resumo da última movimentação
// (crm_movimentacao/{cnpj}), que a carteira mostra em coluna própria.

const TIPOS = {
  demanda_criada: '🗂️ Demanda criada',
  demanda_status: '🔄 Demanda atualizada',
  demanda_concluida: '✅ Demanda concluída',
  documento: '📎 Documento registrado',
  solicitacao_enviada: '📨 Solicitação enviada',
  solicitacao_whatsapp: '💬 Solicitação no WhatsApp',
  solicitacao_falhou: '⚠️ Solicitação não confirmada',
  solicitacao_recebida: '📥 Cliente enviou os documentos',
  recorrencia: '🔁 Envio automático'
};

const STATUS_NOME = { pendente: 'Pendente', em_andamento: 'Em andamento', aguardando_documentos: 'Aguardando documentos', em_revisao: 'Em revisão', concluida: 'Concluída', nao_aplicavel: 'Não se aplica' };

function limpar(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Linha do tempo: quem fez o quê, quando. Sem undefined (Firestore recusa). */
function movimento({ tipo, titulo, detalhe = '', user = {}, quando, origem = 'colaborador', referencia = '' }) {
  if (!TIPOS[tipo]) throw new Error('Tipo de movimentação desconhecido: ' + tipo);
  return {
    tipo,
    rotulo: TIPOS[tipo],
    titulo: limpar(titulo, 200),
    detalhe: limpar(detalhe, 300),
    quando,
    por_uid: user.uid || '',
    por_nome: limpar(user.nome || user.email || user.uid || '', 120),
    por_email: limpar(user.email || '', 160).toLowerCase(),
    origem,
    referencia: limpar(referencia, 120)
  };
}

/** Movimento de demanda conforme a mudança de situação. */
function movimentoDemanda(antes, depois, user, quando) {
  const titulo = depois.titulo || antes?.titulo || 'Demanda';
  if (!antes) return movimento({ tipo: 'demanda_criada', titulo, detalhe: depois.periodo ? 'Período ' + depois.periodo : '', user, quando });
  if (antes.status !== depois.status) {
    return movimento({
      tipo: depois.status === 'concluida' ? 'demanda_concluida' : 'demanda_status',
      titulo,
      detalhe: (STATUS_NOME[antes.status] || antes.status) + ' → ' + (STATUS_NOME[depois.status] || depois.status),
      user, quando
    });
  }
  return movimento({ tipo: 'demanda_status', titulo, detalhe: 'Dados da demanda atualizados', user, quando });
}

function movimentoPublico(d, hoje) {
  if (!d || !d.quando) return { tipo: 'sem', rotulo: 'Sem movimentação registrada', dias: null };
  const dia = new Date(Date.parse(d.quando) - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const dias = hoje ? Math.max(0, Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(dia + 'T12:00:00Z')) / 86400000)) : null;
  return { tipo: d.tipo, rotulo: d.rotulo || TIPOS[d.tipo] || d.tipo, titulo: d.titulo || '', detalhe: d.detalhe || '', quando: d.quando, por_nome: d.por_nome || '', por_email: d.por_email || '', dias };
}

const RESUMO = 'crm_movimentacao';
const LINHA = 'crm_movimentos';

/** Grava resumo + linha do tempo. Com `escrita` (transação/lote) só agenda; sem ela, grava já. */
function gravar(db, escrita, cnpj, m) {
  const resumo = db.collection(RESUMO).doc(cnpj);
  const linha = db.collection('empresas').doc(cnpj).collection(LINHA).doc();
  if (escrita) { escrita.set(resumo, m); escrita.set(linha, m); return null; }
  return Promise.all([resumo.set(m), linha.set(m)]);
}

module.exports = { TIPOS, STATUS_NOME, RESUMO, LINHA, movimento, movimentoDemanda, movimentoPublico, gravar };
