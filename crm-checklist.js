'use strict';
const { hash, data, erro } = require('./crm-contabil');
const FORM_ID = '210135417457653';
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
// IDs conferidos no formulário; rótulos também são verificados para detectar mudanças.
const CAMPOS = {
  nome: ['24', 'EMPRESA NOME'], numero: ['33', 'NOSSO NUMERO'], status: ['47', 'STATUS CLIENTES'],
  cadastro: ['11', 'DATA CADASTRO ESCRITORIO'], inicio: ['30', 'RESPONSAVEL A PARTIR DE'], fim: ['40', 'RESPONSAVEL ATE'],
  observacao: ['5', 'OBSERVACAO:']
};
const EVENTOS = { 'CLIENTE NOVO': 'entrada', 'CLIENTE SAIDA': 'saida', 'ENCERRAMENTO CNPJ': 'baixa', 'CLIENTE ALTERACAO': 'alteracao', 'CLIENTE SUSPENSO': 'suspensao' };
function codigo(v) { const s = String(v ?? '').trim(); return /^\d+$/.test(s) && Number(s) > 0 ? s.replace(/^0+/, '') : null; }
function lerData(v, campo, problemas) {
  if (v == null || v === '') return null;
  let s = typeof v === 'object' && v.year && v.month && v.day
    ? `${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}` : v;
  if (typeof s === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(s)) s = s.split('/').reverse().join('-');
  try { return data(s, campo); } catch { problemas.push('Data inválida: ' + campo); return null; }
}
function previaChecklist(questions, rows, empresas) {
  for (const [id, rotulo] of Object.values(CAMPOS)) {
    if (normalizar(questions?.[id]?.text).replace(/\s*\*$/, '') !== rotulo) throw erro('O Checklist mudou. Revise o mapeamento de campos antes de importar.', 409);
  }
  const porCodigo = new Map();
  for (const e of empresas) {
    const k = codigo(e.codigo_empresa ?? e.codigo_cliente ?? e.codCliente ?? e.numero_empresa);
    if (k) porCodigo.set(k, [...(porCodigo.get(k) || []), e]);
  }
  const ids = new Set();
  const eventos = rows.map(r => {
    if (!/^\d+$/.test(String(r.id)) || String(r.form_id) !== FORM_ID || ids.has(String(r.id)) || !r.answers || typeof r.answers !== 'object') throw erro('Leitura incompleta ou repetida do Checklist. Consulte novamente.', 502);
    ids.add(String(r.id));
    const a = campo => r.answers[CAMPOS[campo][0]]?.answer;
    const problemas = [];
    const numero = codigo(a('numero'));
    const candidatas = numero ? porCodigo.get(numero) || [] : [];
    if (!numero) problemas.push('Nosso Número ausente ou inválido.');
    if (candidatas.length !== 1) problemas.push(candidatas.length ? 'Código interno corresponde a mais de uma empresa.' : 'Empresa sem vínculo confirmado no CCI.');
    const status = typeof a('status') === 'string' ? normalizar(a('status')) : '';
    const tipo = EVENTOS[status] || 'pendente';
    if (tipo === 'pendente') problemas.push('Status não reconhecido. Conferir o evento.');
    const inicio = lerData(a('inicio'), 'início da responsabilidade', problemas);
    const fim = lerData(a('fim'), 'fim da responsabilidade', problemas);
    const cadastro = lerData(a('cadastro'), 'cadastro', problemas);
    if (tipo === 'entrada' && !inicio) problemas.push('Início da responsabilidade não informado.');
    if (['saida', 'baixa'].includes(tipo) && !fim) problemas.push('Fim da responsabilidade não informado.');
    if (inicio && fim && fim < inicio) problemas.push('Fim da responsabilidade anterior ao início.');
    if (['alteracao', 'suspensao'].includes(tipo)) problemas.push('Conferir vigência e efeitos antes de aplicar.');
    if (r.status !== 'ACTIVE') problemas.push('Registro não ativo na origem; não aplicar nem apagar histórico.');
    return { submission_id: String(r.id), assinatura: hash(r), numero_original: String(a('numero') ?? ''),
      empresa_nome: typeof a('nome') === 'string' ? a('nome') : '', cnpj: candidatas.length === 1 ? candidatas[0].cnpj : null,
      tipo, status_origem: status, cadastro_em: cadastro, responsabilidade_inicio: inicio, responsabilidade_fim: fim,
      observacao: typeof a('observacao') === 'string' ? a('observacao') : '', problemas, aplicacao_automatica: false };
  });
  const contagem = new Map();
  eventos.forEach(e => { if (e.cnpj) contagem.set(e.cnpj, (contagem.get(e.cnpj) || 0) + 1); });
  eventos.forEach(e => { if (contagem.get(e.cnpj) > 1) e.problemas.push('Múltiplos eventos para a empresa: conferir sequência e vigências.'); });
  return { eventos, total: eventos.length, com_pendencias: eventos.filter(e => e.problemas.length).length, somente_previa: true };
}

async function carregarChecklist({ apiKey, fetchImpl = fetch, agora = () => new Date().toISOString() }) {
  if (!apiKey) throw erro('Configure a credencial do Checklist no servidor para consultar a origem.', 503);
  // Um prazo total cobre toda a consulta; não reinicia a cada página.
  const signal = AbortSignal.timeout(90000);
  async function request(path) {
    try {
      const r = await fetchImpl('https://api.jotform.com' + path, { headers: { APIKEY: apiKey }, redirect: 'error', signal });
      const b = await r.json();
      if (!r.ok || b.responseCode !== 200 || b.content == null) throw Error();
      return b.content;
    } catch { throw erro('Não foi possível confirmar a leitura do Checklist. Tente novamente; nenhuma alteração foi aplicada.', 502); }
  }
  function quantidade(f) {
    const q = f.submission_count ?? f.count;
    if (!/^\d+$/.test(String(q ?? '')) || Number(q) > 10000) throw erro('Contagem do Checklist ausente ou acima do limite de conferência.', 502);
    return Number(q);
  }
  const before = await request('/form/' + FORM_ID), expected = quantidade(before);
  const questions = await request('/form/' + FORM_ID + '/questions');
  async function scan() {
    const rows = [], ids = new Set();
    for (let offset = 0; offset <= 10000; offset += 200) {
      const batch = await request(`/form/${FORM_ID}/submissions?limit=200&offset=${offset}&orderby=id`);
      if (!Array.isArray(batch)) throw erro('Paginação inválida no Checklist. Consulte novamente.', 502);
      for (const row of batch) {
        if (!/^\d+$/.test(String(row.id)) || String(row.form_id) !== FORM_ID || ids.has(String(row.id))) throw erro('Registros inconsistentes no Checklist. Consulte novamente.', 502);
        ids.add(String(row.id)); rows.push(row);
      }
      if (batch.length < 200) return rows;
    }
    throw erro('Limite de leitura atingido. Não utilize uma lista parcial.', 502);
  }
  const first = await scan(), second = await scan();
  const after = await request('/form/' + FORM_ID), questionsAfter = await request('/form/' + FORM_ID + '/questions');
  const assinatura = rows => hash(rows.map(r => [r.id, r.status, r.created_at, r.updated_at, r.answers]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
  if (first.length !== expected || second.length !== expected || quantidade(after) !== expected || assinatura(first) !== assinatura(second) || hash(questions) !== hash(questionsAfter)) throw erro('O Checklist mudou durante a leitura. Consulte novamente; nenhuma alteração foi aplicada.', 409);
  return { questions, rows: first, form_id: FORM_ID, lido_em: agora(), assinatura: assinatura(first), completo: true };
}
// Aplicação individual explícita. Não cria empresa, carteira ou obrigação.
function contratoDoEvento(evento, antes, body, hoje) {
  const { contrato } = require('./crm-planejamento');
  if (body.confirmado !== true) throw erro('Confirme a aplicação do evento conferido.');
  if (!evento || evento.problemas.length || !evento.cnpj) throw erro('Resolva as pendências do Checklist antes de aplicar.', 409);
  if (!['entrada','saida','baixa'].includes(evento.tipo)) throw erro('Revise este tipo de evento manualmente.', 409);
  const existente = antes || {};
  let inicio = evento.responsabilidade_inicio, fim = evento.responsabilidade_fim;
  if (evento.tipo === 'entrada') {
    if (existente.inicio || fim) throw erro('Entrada com contrato anterior ou fim informado exige revisão manual da vigência.', 409);
  } else {
    if (!existente.inicio || existente.situacao !== 'ativa' || existente.fim) throw erro('Confirme o contrato ativo antes de aplicar saída ou baixa.', 409);
    if (inicio && inicio !== existente.inicio) throw erro('O início informado diverge do contrato. Confira a responsabilidade.', 409);
    inicio = existente.inicio;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje || '') || (evento.tipo === 'entrada' ? inicio : fim) > hoje) throw erro('Evento futuro exige agendamento; não aplique antes da vigência.', 409);
  // Efeitos anteriores ao contrato corrente nunca são aplicados por aproximação.
  if (fim && fim < inicio) throw erro('Evento anterior ao início do contrato; revise o histórico.', 409);
  return contrato({ revisao:body.revisao_contrato, situacao: {entrada:'ativa',saida:'saida',baixa:'baixada'}[evento.tipo],
    inicio, fim, motivo:body.motivo }, existente);
}
module.exports = { FORM_ID, CAMPOS, previaChecklist, carregarChecklist, contratoDoEvento };
