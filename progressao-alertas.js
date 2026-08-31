'use strict';

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

function escaparHtml(valor) {
  return texto(valor).replace(/[&<>"']/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

function destinatarios(avaliacao) {
  const acompanhamento = avaliacao && avaliacao.acompanhamento || {};
  const lista = [];
  const principal = avaliacao && avaliacao.responsavel_principal;
  if (principal && principal.email) lista.push(texto(principal.email).toLowerCase());
  (acompanhamento.destinatarios_alerta || []).forEach(function (email) { lista.push(texto(email).toLowerCase()); });
  return Array.from(new Set(lista.filter(function (email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); })));
}

function podeEnviar(avaliacao, agora) {
  if (!avaliacao || !avaliacao.alerta_devido || !avaliacao.acompanhamento || !avaliacao.acompanhamento.alerta_ativo) return false;
  const ultimo = avaliacao.acompanhamento.ultimo_alerta_em;
  if (!ultimo) return true;
  const ultimoMillis = typeof ultimo.toMillis === 'function' ? ultimo.toMillis() : new Date(ultimo).getTime();
  const agoraMillis = agora instanceof Date ? agora.getTime() : new Date(agora || Date.now()).getTime();
  const intervalo = Math.max(1, Number(avaliacao.acompanhamento.alerta_dias) || 5) * 86400000;
  return !Number.isFinite(ultimoMillis) || agoraMillis - ultimoMillis >= intervalo;
}

function mensagem(avaliacao) {
  const empresa = (avaliacao.codigo_empresa ? avaliacao.codigo_empresa + ' — ' : '') + (avaliacao.razao_social || avaliacao.cnpj);
  const assunto = '[CCI] Atenção: ' + empresa + ' · ' + avaliacao.competencia;
  const motivo = avaliacao.motivo_parada || avaliacao.proxima_acao || 'Sem atualização no prazo configurado.';
  const resumoAreas = (avaliacao.areas || []).filter(function (area) { return area.esperada; }).map(function (area) {
    return area.nome + ': ' + area.classificados + '/' + area.total + (area.concluida ? ' concluído' : (area.iniciada ? ' em andamento' : ' sem movimento'));
  });
  const textoSimples = [assunto, motivo, 'Próxima ação: ' + (avaliacao.proxima_acao || '-'), 'Progresso: ' + avaliacao.percentual + '%'].concat(resumoAreas).join('\n');
  const html = '<h2>' + escaparHtml(assunto) + '</h2>'
    + '<p><strong>Status:</strong> ' + escaparHtml(avaliacao.status) + ' · ' + escaparHtml(avaliacao.etapa_nome) + '</p>'
    + '<p><strong>Motivo:</strong> ' + escaparHtml(motivo) + '<br><strong>Próxima ação:</strong> ' + escaparHtml(avaliacao.proxima_acao || '-') + '</p>'
    + '<p><strong>Progresso:</strong> ' + Number(avaliacao.percentual || 0) + '%<br><strong>Dias sem atividade:</strong> ' + (avaliacao.dias_sem_atividade == null ? 'sem registro' : Number(avaliacao.dias_sem_atividade)) + '</p>'
    + '<ul>' + resumoAreas.map(function (item) { return '<li>' + escaparHtml(item) + '</li>'; }).join('') + '</ul>';
  return { assunto, html, texto: textoSimples };
}

async function enviarTeams(webhookUrl, conteudo) {
  if (!webhookUrl) return { ok: false, error: 'Webhook do Teams não configurado.' };
  try {
    const resposta = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: conteudo.texto })
    });
    return resposta.ok ? { ok: true } : { ok: false, error: 'Teams respondeu HTTP ' + resposta.status + '.' };
  } catch (erro) {
    return { ok: false, error: erro.message || 'Falha no Teams.' };
  }
}

async function enviar(avaliacao, dependencias) {
  const deps = dependencias || {};
  const canais = avaliacao.acompanhamento && avaliacao.acompanhamento.canais_alerta || {};
  const conteudo = mensagem(avaliacao);
  const resultados = [];
  if (canais.email) {
    const emails = destinatarios(avaliacao);
    if (!emails.length) resultados.push({ canal: 'email', ok: false, error: 'Nenhum e-mail destinatário configurado.' });
    for (const email of emails) {
      const resultado = await deps.enviarEmail({ remetente: deps.remetente, para: email, assunto: conteudo.assunto, html: conteudo.html });
      resultados.push({ canal: 'email', destinatario: email, ...resultado });
    }
  }
  if (canais.teams) resultados.push({ canal: 'teams', ...(await enviarTeams(deps.teamsWebhookUrl, conteudo)) });
  return { ok: resultados.length > 0 && resultados.every(function (item) { return item.ok; }), resultados, conteudo };
}

module.exports = { destinatarios, podeEnviar, mensagem, enviar, enviarTeams };
