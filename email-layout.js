'use strict';
// ============================================================================
// email-layout.js  (PURO, exceto anexoLogo — testável)
// ----------------------------------------------------------------------------
// A CASCA de todo e-mail que sai do Consultor Contábil Inteligente — a MESMA
// identidade dos e-mails do CFI (sefaz-backend/email-layout.js), portada em
// 24/09 a pedido do Paulo: *"implementar esta configuração dos e-mails no app
// irmão CCI, parametrizando o mesmo layout … devendo observar que se trata do
// departamento contábil"*.
//
// Diferença ÚNICA de identidade para o CFI: `MARCA.departamento` é
// 'Departamento Contábil' e a assinatura diz "Consultor Contábil Inteligente".
// Os dois repositórios NÃO compartilham código — mudança de layout precisa
// ser feita nas DUAS cascas.
//
// Regras herdadas da Legalização e do CFI: logo INLINE por cid: (imagem
// hospedada fora chega bloqueada no Outlook/Gmail), tabelas + estilo inline
// (Outlook não entende flex/grid), largura 600px, texto de terceiro sempre
// escapado antes de entrar no HTML.
// ============================================================================
const fs = require('fs');
const path = require('path');

/** Escapa texto de terceiro (nome de empresa, mensagem do colaborador) antes do HTML. */
function escaparHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Texto plano (mensagem do colaborador) → HTML seguro com quebras. */
function textoParaHtml(texto) {
  return escaparHtml(texto).replace(/\n/g, '<br>');
}

/** Só http(s) vira link — nada de javascript:/data: vindo de config. */
function urlSegura(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? escaparHtml(s) : null;
}

/** Identidade visual da SP Assessoria (cores tiradas do próprio logo). */
const MARCA = {
  nome: 'SP Assessoria Contábil',
  departamento: 'Departamento Contábil',
  app: 'Consultor Contábil Inteligente',
  azul: '#0E3BFA',
  marinho: '#091D8D',
  logoCid: 'sp-logo',
};

/** Paleta por contexto (mesma do CFI e da Legalização). */
const CORES_FAROL = {
  vencido: { de: '#DC2626', ate: '#991B1B', tinta: '#FEF2F2', borda: '#DC2626', cta: '#DC2626' },
  atencao: { de: '#D97706', ate: '#92400E', tinta: '#FFFBEB', borda: '#D97706', cta: '#B45309' },
  sucesso: { de: '#059669', ate: '#065F46', tinta: '#ECFDF5', borda: '#059669', cta: '#059669' },
  marca: { de: MARCA.azul, ate: MARCA.marinho, tinta: '#EEF1FF', borda: MARCA.azul, cta: MARCA.azul },
};

const agoraBr = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/**
 * Casca do e-mail: cabeçalho com logo, faixa colorida, conteúdo e rodapé.
 * @param {object} p
 * @param {string} p.titulo        linha da faixa colorida (HTML confiável — escapar antes)
 * @param {string} p.conteudoHtml  miolo já montado (confiável — escapar antes)
 * @param {Array<{href: string, texto: string, cor?: string}>} [p.ctas]
 * @param {{siteUrl?: string, instagramUrl?: string, whatsappUrl?: string}} [p.marca]
 * @param {string} [p.assinatura]  linha final antes do rodapé (HTML confiável)
 * @param {object} [p.cores]       paleta (CORES_FAROL.*)
 * @param {string} [p.selo]        pílula ao lado do título (competência/prazo)
 * @param {string} [p.departamento]
 * @param {string} [p.motivoRodape]
 */
function montarLayoutEmail({
  titulo, conteudoHtml, ctas = [], marca = {}, assinatura,
  cores = CORES_FAROL.marca, selo, departamento = MARCA.departamento,
  motivoRodape = 'Você recebeu este e-mail porque sua empresa é atendida pelo nosso escritório.',
} = {}) {
  const site = urlSegura(marca.siteUrl);
  const insta = urlSegura(marca.instagramUrl);
  const zap = urlSegura(marca.whatsappUrl);
  const botoes = (ctas || [])
    .map((c) => ({ href: urlSegura(c.href), texto: escaparHtml(c.texto), cor: c.cor || cores.cta }))
    .filter((c) => c.href)
    .map((c) => `<a href="${c.href}" style="display:inline-block; background:${c.cor}; color:#ffffff; font-weight:bold; font-size:14px; padding:13px 24px; border-radius:8px; text-decoration:none; margin:4px;">${c.texto}</a>`)
    .join('');
  const linksRodape = [
    site && `<a href="${site}" style="color:${MARCA.marinho}; text-decoration:none; font-weight:bold;">🌐 Site</a>`,
    insta && `<a href="${insta}" style="color:${MARCA.marinho}; text-decoration:none; font-weight:bold;">📷 Instagram</a>`,
    zap && `<a href="${zap}" style="color:${MARCA.marinho}; text-decoration:none; font-weight:bold;">💬 WhatsApp</a>`,
  ].filter(Boolean).join('<span style="color:#c7cbd6"> &nbsp;·&nbsp; </span>');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background:#eef1f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f8; padding:24px 12px;">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 2px 10px rgba(9,29,141,0.10); font-family:-apple-system,'Segoe UI',Arial,sans-serif;">
   <tr><td style="padding:22px 28px 16px 28px; border-bottom:1px solid #eef1f8;" align="center">
     <img src="cid:${MARCA.logoCid}" alt="${escaparHtml(MARCA.nome)}" width="52" style="display:block; border:0; margin:0 auto 8px auto;">
     <div style="font-size:15px; font-weight:bold; color:${MARCA.marinho}; letter-spacing:0.3px;">${escaparHtml(MARCA.nome)}</div>
     <div style="font-size:11px; color:#7a83a0; text-transform:uppercase; letter-spacing:1px; margin-top:2px;">${escaparHtml(departamento)}</div>
   </td></tr>
   <tr><td style="background:${cores.ate}; background-image:linear-gradient(135deg, ${cores.de}, ${cores.ate}); padding:18px 28px;">
     <div style="color:#ffffff; font-size:18px; font-weight:bold;">${titulo}</div>
     ${selo ? `<div style="margin-top:8px;"><span style="display:inline-block; background:rgba(255,255,255,0.22); color:#ffffff; font-size:12px; font-weight:bold; letter-spacing:0.6px; text-transform:uppercase; padding:5px 12px; border-radius:99px;">${escaparHtml(selo)}</span></div>` : ''}
   </td></tr>
   <tr><td style="padding:24px 28px; color:#1b2340; font-size:14px; line-height:1.55;">
     ${conteudoHtml}
     ${botoes ? `<div style="margin:22px 0 6px 0; text-align:center;">${botoes}</div>` : ''}
     ${assinatura ? `<p style="font-size:13px; color:#6b7280; margin:18px 0 0 0;">${assinatura}</p>` : ''}
   </td></tr>
   <tr><td style="background:#f6f8fd; padding:18px 28px; text-align:center; border-top:1px solid #eef1f8;">
     ${linksRodape ? `<div style="font-size:13px; margin-bottom:8px;">${linksRodape}</div>` : ''}
     <div style="font-size:11px; color:#8a93ad; line-height:1.5;">
       ${escaparHtml(MARCA.nome)} · ${escaparHtml(departamento)}<br>
       ${escaparHtml(motivoRodape)}
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}

/** Assinatura padrão: quem enviou e por qual app. */
function assinaturaPadrao({ enviadoPor, geradoEm } = {}) {
  const quem = enviadoPor ? `por ${escaparHtml(enviadoPor)} ` : '';
  return `Enviado ${quem}pelo ${escaparHtml(MARCA.app)} em ${escaparHtml(geradoEm || agoraBr())}.`;
}

/** Tabela chave→valor do miolo (empresa, CNPJ, competência…). Valores escapados aqui. */
function tabelaDados(linhas) {
  const tr = (linhas || [])
    .filter((l) => l && l.valor != null && String(l.valor) !== '')
    .map((l) => `<tr><td style="padding:8px 12px; color:#667085; border-bottom:1px solid #eef1f8;">${escaparHtml(l.rotulo)}</td><td style="padding:8px 12px; font-weight:bold; border-bottom:1px solid #eef1f8;">${escaparHtml(l.valor)}</td></tr>`)
    .join('');
  return tr ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc; border-radius:8px; margin:14px 0 0 0;">${tr}</table>` : '';
}

/**
 * E-mail de RELATÓRIO CONTÁBIL ao cliente (balancete, DRE, razão…): mensagem
 * do colaborador no miolo, dados da empresa e a nota do anexo.
 * Farol honesto: sem PDF, o e-mail DIZ que o relatório não foi anexado.
 */
function montarEmailRelatorio({ tipo, empresaNome, cnpj, competencia, mensagem, temPdf, enviadoPor, geradoEm } = {}) {
  const conteudoHtml = [
    `<p style="margin:0 0 12px 0;">${textoParaHtml(mensagem)}</p>`,
    tabelaDados([
      { rotulo: 'Empresa', valor: empresaNome },
      { rotulo: 'CNPJ', valor: cnpj },
      { rotulo: 'Competência', valor: competencia },
    ]),
    temPdf
      ? '<p style="margin:14px 0 0 0; font-size:13px; color:#166534; background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; padding:10px 14px;">📎 O relatório está em anexo neste e-mail (PDF).</p>'
      : '<p style="margin:14px 0 0 0; font-size:13px; color:#92400E; background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; padding:10px 14px;">⚠️ O relatório NÃO pôde ser anexado — entre em contato com o escritório para recebê-lo.</p>',
  ].join('');
  return montarLayoutEmail({
    titulo: `${escaparHtml(tipo || 'Relatório contábil')} — ${escaparHtml(empresaNome || '')}`,
    selo: competencia ? `Competência ${competencia}` : undefined,
    conteudoHtml,
    assinatura: assinaturaPadrao({ enviadoPor, geradoEm }),
    motivoRodape: 'Você recebeu este relatório porque sua empresa é atendida pelo nosso escritório. Em caso de dúvida, responda este e-mail.',
  });
}

/**
 * E-mail de SOLICITAÇÃO ao cliente (EFD-Reinf: dividendos, aplicações…): o
 * corpo já vem montado pelo módulo do evento; aqui entra só a casca.
 */
function montarEmailSolicitacao({ titulo, empresaNome, competencia, conteudoHtml, enviadoPor, geradoEm } = {}) {
  return montarLayoutEmail({
    titulo: escaparHtml(titulo || 'Solicitação do escritório'),
    selo: [empresaNome, competencia && `Competência ${competencia}`].filter(Boolean).join(' · ') || undefined,
    conteudoHtml: conteudoHtml || '',
    assinatura: assinaturaPadrao({ enviadoPor, geradoEm }),
    motivoRodape: 'Você recebeu esta solicitação porque sua empresa é atendida pelo nosso escritório. Responda este e-mail com as informações pedidas.',
  });
}

/**
 * E-mail INTERNO (alerta de progressão, sugestão da Ajuda CCI): linhas
 * rótulo→valor, paleta por farol. Nunca vai ao cliente.
 */
function montarEmailInterno({ titulo, linhas = [], corpoHtml = '', farol = 'marca', geradoEm } = {}) {
  return montarLayoutEmail({
    titulo: escaparHtml(titulo || ''),
    conteudoHtml: `${corpoHtml || ''}${tabelaDados(linhas)}`,
    cores: CORES_FAROL[farol] || CORES_FAROL.marca,
    assinatura: assinaturaPadrao({ geradoEm }),
    motivoRodape: 'Mensagem interna do escritório, gerada pelo app.',
  });
}

// Logo da SP que vai INLINE no cabeçalho (21 KB, versão otimizada para
// e-mail — o sp-logo.png de 100 KB é o do app). Lido uma vez do disco; se
// sumir do build, o e-mail sai sem a imagem em vez de quebrar.
let logoEmailCache;
function anexoLogo() {
  if (logoEmailCache === undefined) {
    try {
      logoEmailCache = {
        name: 'sp-logo.png',
        contentType: 'image/png',
        contentBytes: fs.readFileSync(path.join(__dirname, 'sp-logo-email.png')).toString('base64'),
        contentId: MARCA.logoCid,
      };
    } catch (e) {
      console.warn('[email-layout] logo do e-mail não encontrado:', String(e && e.message || e));
      logoEmailCache = null;
    }
  }
  return logoEmailCache ? [logoEmailCache] : [];
}

module.exports = {
  MARCA, CORES_FAROL, escaparHtml, textoParaHtml, montarLayoutEmail,
  montarEmailRelatorio, montarEmailSolicitacao, montarEmailInterno, anexoLogo,
};
