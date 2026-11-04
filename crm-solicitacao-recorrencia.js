'use strict';
// Envio recorrente da solicitação de documentos ao cliente (v3.4.486).
// Regra pura: o colaborador programa no próprio Solicitar documentos um envio
// mensal por e-mail. A cada mês o CCI monta a solicitação com o modelo salvo,
// a competência do mês anterior e o prazo em dias, e envia da caixa de quem
// programou. WhatsApp não entra: o wa.me exige o clique de quem envia.

// Brasil sem horário de verão desde 2019: Brasília é UTC-03:00 o ano inteiro.
const FUSO_MS = 3 * 3600 * 1000;
const ID = /^rec-[a-z0-9]{6,40}$/;

function erro(mensagem, status = 400) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function inteiro(v, min, max, rotulo) {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw erro('Informe ' + rotulo + ' entre ' + min + ' e ' + max + '.');
  return n;
}

function horaValida(v) {
  const s = String(v || '');
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) throw erro('Informe o horário do envio (hh:mm).');
  const h = Number(m[1]);
  if (h < 6 || h > 20) throw erro('Programe o envio entre 06:00 e 20:59, no horário de Brasília.');
  return s;
}

/** Próxima execução (ISO UTC) no dia/hora de Brasília, estritamente depois de `depois`. */
function proximaExecucao(dia, hora, depois) {
  const ref = new Date(Date.parse(depois) - FUSO_MS);
  const [h, m] = hora.split(':').map(Number);
  let ano = ref.getUTCFullYear(), mes = ref.getUTCMonth();
  for (let i = 0; i < 3; i++) {
    const local = Date.UTC(ano, mes + i, dia, h, m);
    const iso = new Date(local + FUSO_MS).toISOString();
    if (Date.parse(iso) > Date.parse(depois)) return iso;
  }
  throw erro('Não foi possível calcular a próxima data do envio.');
}

function dataLocal(iso) {
  return new Date(Date.parse(iso) - FUSO_MS).toISOString().slice(0, 10);
}

/** Competência pedida em cada envio: o mês anterior ao do envio (horário de Brasília). */
function competenciaDoEnvio(iso) {
  const d = new Date(Date.parse(iso) - FUSO_MS);
  const ant = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return ant.toISOString().slice(0, 7);
}

function prazoDoEnvio(iso, dias) {
  const d = new Date(dataLocal(iso) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Valida o pedido de recorrência. `b` é o mesmo corpo do Solicitar documentos
 * (modelo, documentos, observação, destino) mais dia, hora e prazo_dias.
 */
function configurarRecorrencia(b, ctx) {
  const corpo = b || {};
  const c = ctx || {};
  if (corpo.canal !== 'email') throw erro('O envio automático todo mês é só por e-mail. No WhatsApp, quem envia precisa tocar em Enviar.');
  if (typeof corpo.modelo !== 'string' || !/^S\d{2}$/.test(corpo.modelo)) throw erro('Escolha o modelo da solicitação.');
  const dia = inteiro(corpo.dia, 1, 28, 'o dia do mês');
  const hora = horaValida(corpo.hora);
  const prazoDias = inteiro(corpo.prazo_dias, 1, 30, 'o prazo do cliente, em dias,');
  const documentos = Array.isArray(corpo.documentos) ? corpo.documentos.map(d => String(d || '').trim()).filter(Boolean).slice(0, 40) : [];
  const destinoTipo = corpo.destino_tipo === 'outro' ? 'outro' : 'cadastro';
  const proxima = proximaExecucao(dia, hora, c.agora);
  return {
    cnpj: c.cnpj,
    modelo: corpo.modelo,
    modelo_nome: c.modelo_nome || '',
    canal: 'email',
    documentos,
    observacao: String(corpo.observacao || '').slice(0, 1000),
    destino_tipo: destinoTipo,
    destino: destinoTipo === 'outro' ? String(corpo.destino || '').trim().slice(0, 600) : '',
    destino_exibicao: c.destino_exibicao || '',
    dia,
    hora,
    prazo_dias: prazoDias,
    ativo: true,
    excluida: false,
    proxima,
    criada_em: c.agora,
    autor_uid: c.uid,
    autor_email: c.email,
    execucoes: 0,
    ultimo_estado: null,
    ultimo_detalhe: null
  };
}

/** Corpo do Solicitar documentos para a execução do mês. */
function corpoDaExecucao(rec, quando) {
  return {
    modelo: rec.modelo,
    canal: 'email',
    competencia: competenciaDoEnvio(quando),
    prazo: prazoDoEnvio(quando, rec.prazo_dias),
    documentos: rec.documentos || [],
    observacao: rec.observacao || '',
    destino_tipo: rec.destino_tipo,
    destino: rec.destino || ''
  };
}

function recorrenciaPublica(id, r) {
  return {
    id,
    modelo: r.modelo,
    modelo_nome: r.modelo_nome,
    destino_exibicao: r.destino_exibicao,
    dia: r.dia,
    hora: r.hora,
    prazo_dias: r.prazo_dias,
    ativo: r.ativo === true,
    proxima: r.ativo ? r.proxima : null,
    autor_email: r.autor_email,
    execucoes: r.execucoes || 0,
    ultimo_estado: r.ultimo_estado || null,
    ultimo_detalhe: r.ultimo_detalhe || null,
    ultima_execucao: r.ultima_execucao || null
  };
}

module.exports = { ID, configurarRecorrencia, proximaExecucao, competenciaDoEnvio, prazoDoEnvio, dataLocal, corpoDaExecucao, recorrenciaPublica };
