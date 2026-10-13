'use strict';

const { createHash } = require('crypto');
const { normalizarResponsaveis } = require('./carteira-contabil');
const { podeAcao } = require('./permissoes-cci');
const erro = (mensagem, status = 400) => Object.assign(new Error(mensagem), { status });
const hash = valor => createHash('sha256').update(JSON.stringify(valor)).digest('hex');
const STATUS = ['pendente', 'em_andamento', 'aguardando_documentos', 'em_revisao', 'concluida', 'nao_aplicavel'];
const TERMINAIS = ['concluida', 'nao_aplicavel'];
const CATALOGO = [
  ['DOCUMENTOS', 'Solicitação de documentos', 'mensal'], ['FOLHA', 'Importação da folha', 'mensal'],
  ['FISCAL', 'Importação fiscal', 'mensal'], ['FINANCEIRO', 'Contabilização financeira', 'mensal'],
  ['CONCILIACAO', 'Conciliação', 'mensal'], ['BALANCO', 'Entrega do balanço', 'mensal'],
  ['REINF_ALUGUEL', 'Reinf — aluguéis', 'mensal'], ['REINF_DIVIDENDOS', 'Reinf — dividendos', 'mensal'],
  ...['ECD', 'ECF', 'DEFIS', 'DIMOB', 'DITR', 'IBGE', 'DIMED', 'E_FINANCEIRA', 'DECRED', 'ITR'].map(c => [c, c.replace('_', '-'), 'anual'])
].map(([codigo, titulo, periodicidade]) => ({ codigo, titulo, periodicidade }));

function texto(v, max, campo, obrigatorio = false) {
  if (v == null && !obrigatorio) return '';
  if (typeof v !== 'string' || v.length > max || (obrigatorio && !v.trim())) throw erro('Confira o campo ' + campo + '.');
  return v.trim();
}
function data(v, campo, obrigatorio = false) {
  const s = texto(v, 10, campo, obrigatorio);
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00Z') : null;
  if (!d || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw erro('Informe uma data válida para ' + campo + '.');
  return s;
}
function evidencia(v) {
  const url = texto(v, 1500, 'link da evidência');
  if (!url) return '';
  try { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password) throw Error(); }
  catch { throw erro('A evidência deve usar um link HTTPS sem credenciais.'); }
  return url;
}
// A lista indexada é só candidata de consulta. O vínculo por UID é a autoridade.
function temCarteira(empresa, usuario) {
  return !!usuario?.uid && (usuario.is_admin === true || normalizarResponsaveis(empresa?.responsaveis).some(p => p.uid === usuario.uid));
}
function versaoCarteira(empresa) { return hash(normalizarResponsaveis(empresa?.responsaveis).sort((a,b) => a.uid.localeCompare(b.uid))); }
function exigirEdicao(usuario) {
  if (!usuario?.uid || (!usuario.is_admin && !podeAcao(usuario, 'editar'))) throw erro('Peça ao administrador permissão de edição no CCI.', 403);
}
function criarControle(entrada, usuario, agora) {
  if (usuario?.is_admin !== true) throw erro('Somente administradores criam obrigações e processos.', 403);
  const categoria = entrada.categoria;
  if (!['obrigacao', 'processo'].includes(categoria)) throw erro('Escolha obrigação ou processo.');
  const codigo = texto(entrada.codigo, 60, 'código', true);
  if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(codigo)) throw erro('Use um código com letras maiúsculas, números e sublinhado.');
  const modelo = CATALOGO.find(c => c.codigo === codigo);
  if (categoria === 'obrigacao' && !modelo) throw erro('Escolha uma obrigação do catálogo.');
  const periodo = texto(entrada.periodo, 7, 'período', true);
  const mensal = categoria === 'processo' || modelo.periodicidade === 'mensal';
  if (!(mensal ? /^20\d{2}-(0[1-9]|1[0-2])$/ : /^20\d{2}$/).test(periodo)) throw erro(mensal ? 'Informe a competência no formato AAAA-MM.' : 'Informe o ano de referência da obrigação.');
  const registro = {
    categoria, codigo, periodo, titulo: categoria === 'processo' ? texto(entrada.titulo, 160, 'título', true) : modelo.titulo,
    prazo: data(entrada.prazo, 'prazo', true), observacao: texto(entrada.observacao, 2000, 'observação'),
    status: 'pendente', evidencia_url: '', protocolo: '', justificativa: '', revisao: 1,
    criado_em: agora, criado_por_uid: usuario.uid, atualizado_em: agora, atualizado_por_uid: usuario.uid,
    origem: 'cci', concluido_em: null, concluido_por_uid: null
  };
  return { id: categoria + '_' + codigo + '_' + periodo, registro };
}
function atualizarControle(atual, entrada, usuario, agora) {
  exigirEdicao(usuario);
  if (!Number.isSafeInteger(entrada.revisao) || entrada.revisao !== atual.revisao) throw erro('Este controle mudou. Atualize a tela antes de salvar.', 409);
  const status = entrada.status;
  if (!STATUS.includes(status)) throw erro('Escolha uma situação válida.');
  const justificativa = texto(entrada.justificativa, 1500, 'justificativa');
  if (TERMINAIS.includes(atual.status)) {
    if (!usuario.is_admin || status !== 'pendente' || !justificativa) throw erro('Somente o administrador pode reabrir uma conclusão, com justificativa.', 403);
  }
  if (status === 'nao_aplicavel' && (!usuario.is_admin || !justificativa)) throw erro('Não aplicável exige justificativa e aprovação administrativa.', 403);
  const url = evidencia(entrada.evidencia_url);
  const protocolo = texto(entrada.protocolo, 250, 'protocolo');
  if (status === 'concluida') {
    if (!usuario.is_admin && !podeAcao(usuario, 'fechar')) throw erro('Peça ao administrador permissão de conclusão.', 403);
    if (!url && !protocolo) throw erro('Informe o comprovante ou protocolo para concluir.');
  }
  const prazo = entrada.prazo === undefined ? atual.prazo : data(entrada.prazo, 'prazo', true);
  if (prazo !== atual.prazo && !usuario.is_admin) throw erro('Somente administradores alteram o prazo.', 403);
  return { ...atual, status, prazo, observacao: texto(entrada.observacao, 2000, 'observação'),
    evidencia_url: url, protocolo, justificativa, revisao: atual.revisao + 1,
    atualizado_em: agora, atualizado_por_uid: usuario.uid,
    concluido_em: status === 'concluida' ? agora : null, concluido_por_uid: status === 'concluida' ? usuario.uid : null };
}
function resumir(controles, hoje) {
  const exigiveis = controles.filter(c => c.status !== 'nao_aplicavel' && c.prazo && c.prazo <= hoje);
  const concluidos = exigiveis.filter(c => c.status === 'concluida').length;
  return { total: controles.length, exigiveis: exigiveis.length, concluidos_exigiveis: concluidos,
    atrasados: controles.filter(c => !TERMINAIS.includes(c.status) && c.prazo && c.prazo < hoje).length,
    percentual: exigiveis.length ? Math.round(concluidos / exigiveis.length * 100) : null };
}
module.exports = { CATALOGO, STATUS, TERMINAIS, erro, hash, texto, data, temCarteira, versaoCarteira, criarControle, atualizarControle, resumir };
