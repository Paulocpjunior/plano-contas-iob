'use strict';

// Visual no estilo dos sistemas da Apple (12/10/2026), o mesmo do Consultor DP.
// Confere que o tema continua inteiro nas telas: fonte do sistema, cinzas e um só azul da Apple, barra superior
// translúcida, logo oficial com favicon e ícone do iPhone, e que o AuditAI (Tailwind 3) usa as mesmas cores.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

const FONTE = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter Variable', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const NEUTROS = ['#fbfbfd', '#f5f5f7', '#e8e8ed', '#d2d2d7', '#a1a1a6', '#6e6e73', '#515154', '#3a3a3c', '#2c2c2e', '#1c1c1e', '#000000'];
const AZUL = ['#f0f7ff', '#e0efff', '#b8dcff', '#84c1ff', '#47a1ff', '#0a84ff', '#0071e3', '#0066cc', '#00509f', '#003e7a', '#00264d'];
const ESCALA = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// ─── 1. O tema compartilhado do CCI e do Admin ──────────────────────────────
const tema = ler('tema-apple.css');
assert.ok(tema.includes(`--sp-fonte: ${FONTE};`), 'tema-apple.css deve começar pela fonte do sistema (San Francisco) e ter a Inter de reserva.');
assert.ok(tema.includes('--accent: #0071e3;'), 'o destaque claro deve ser o azul da Apple #0071e3.');
assert.ok(tema.includes('rgba(22, 22, 23, .85)'), 'a barra superior deve ser escura e translúcida.');
assert.ok(tema.includes('backdrop-filter: saturate(150%) blur(20px);') && tema.includes('-webkit-backdrop-filter: saturate(150%) blur(20px);'),
  'a barra superior precisa do desfoque também no Safari (-webkit-).');
assert.ok(/\.logo-circle,\s*\.header-logo,\s*\.brand-logo\s*\{[^}]*border-radius: 22%/.test(tema),
  'o logo fica num quadrado branco de cantos arredondados, como ícone de app.');

for (const pagina of ['index.html', 'admin.html']) {
  const html = ler(pagina);
  const fimHead = html.indexOf('</head>');
  const link = html.indexOf('href="/tema-apple.css?v=');
  assert.ok(link > 0 && link < fimHead, `${pagina} deve carregar o tema-apple.css no <head>.`);
  assert.ok(link > html.lastIndexOf('</style>', fimHead),
    `${pagina}: o tema-apple.css vem DEPOIS do <style> da página, senão as regras antigas vencem.`);
  assert.ok(html.includes('<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)"'), `${pagina}: theme-color claro.`);
  assert.ok(html.includes('<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"'), `${pagina}: theme-color escuro.`);
  assert.ok(html.includes('family=Inter:'), `${pagina}: a Inter de reserva vem do Google Fonts.`);
  assert.ok(!html.includes('Plus Jakarta'), `${pagina}: a fonte antiga não pode voltar.`);
  // Um só destaque: o azul/índigo do Tailwind (#2563eb, #4f46e5…) foi trocado pelo da Apple.
  const sobras = html.match(/#(?:2563eb|1d4ed8|3b82f6|1e40af|4f46e5|6366f1|4338ca)(?![0-9a-f])/gi) || [];
  assert.deepStrictEqual(sobras, [], `${pagina}: use o azul da Apple (#0071e3, #0066cc, #0a84ff) em vez de ${sobras.slice(0, 3).join(', ')}.`);
}

// ─── 2. Os arquivos estáticos existem e estão publicados ────────────────────
const publicos = new Set(require(path.join(raiz, 'public-assets.json')));
for (const arquivo of ['logo-sp.png', 'favicon.png', 'apple-touch-icon.png', 'tema-apple.css']) {
  assert.ok(fs.existsSync(path.join(raiz, arquivo)), `${arquivo} tem de existir na raiz.`);
  assert.ok(publicos.has('/' + arquivo), `${arquivo} tem de estar no public-assets.json, senão o servidor responde 404.`);
}

// ─── 3. AuditAI: o Tailwind 3 com as mesmas cores, fonte e cantos ───────────
const config = require(path.join(raiz, 'tailwind.auditai.config.js'));
const ext = config.theme.extend;
for (const nome of ['slate', 'gray']) {
  assert.deepStrictEqual(ESCALA.map((t) => ext.colors[nome][t]), NEUTROS, `Tailwind do AuditAI: ${nome} = neutros da Apple.`);
}
for (const nome of ['blue', 'indigo']) {
  assert.deepStrictEqual(ESCALA.map((t) => ext.colors[nome][t]), AZUL, `Tailwind do AuditAI: ${nome} = azul da Apple.`);
}
assert.strictEqual(ext.fontFamily.sans[0], '-apple-system', 'Tailwind do AuditAI: fonte do sistema primeiro.');
assert.deepStrictEqual(
  [ext.borderRadius.sm, ext.borderRadius.DEFAULT, ext.borderRadius.md, ext.borderRadius.lg, ext.borderRadius.xl, ext.borderRadius['2xl']],
  ['0.375rem', '0.375rem', '0.5rem', '0.625rem', '0.875rem', '1.25rem'],
  'Tailwind do AuditAI: cantos um pouco maiores.');

// O CSS publicado tem de ter sido gerado DEPOIS da troca (npm run build:auditai-css).
const cssAuditai = ler('auditai/auditai-tailwind.css');
assert.ok(cssAuditai.includes('rgb(0 113 227'), 'auditai-tailwind.css desatualizado: rode npm run build:auditai-css.');
assert.ok(!cssAuditai.includes('rgb(37 99 235'), 'auditai-tailwind.css ainda tem o azul antigo: rode npm run build:auditai-css.');

// A conciliação usa o Tailwind do CDN com uma CÓPIA dos valores: tem de bater com o config.
const conciliacao = ler('auditai/conciliacao.html');
const inicioBloco = conciliacao.lastIndexOf('<script>', conciliacao.indexOf('tailwind.config ='));
const bloco = conciliacao.slice(inicioBloco, conciliacao.indexOf('</script>', inicioBloco));
const valoresDoBloco = (nome) => {
  const m = bloco.match(new RegExp(`var ${nome} = \\{([^}]*)\\}`));
  assert.ok(m, `auditai/conciliacao.html: falta a paleta ${nome}.`);
  return [...m[1].matchAll(/#[0-9a-f]{6}/gi)].map((x) => x[0].toLowerCase());
};
assert.deepStrictEqual(valoresDoBloco('neutros'), NEUTROS, 'auditai/conciliacao.html: neutros diferentes do tailwind.auditai.config.js.');
assert.deepStrictEqual(valoresDoBloco('azul'), AZUL, 'auditai/conciliacao.html: azul diferente do tailwind.auditai.config.js.');
assert.ok(/slate: neutros,\s*gray: neutros,\s*blue: azul,\s*indigo: azul/.test(bloco), 'auditai/conciliacao.html: slate/gray/blue/indigo devem usar as paletas da Apple.');

// ─── 4. Telas montadas por .js fora do HTML (12/10/2026, 3.4.385) ─────────────
// Os .js que geram HTML/estilo de tela também usam os neutros e o azul da Apple. Ficam de fora, de propósito:
// email-layout.js (casca do e-mail, igual à do CFI), reinf/dividendos-relatorio-layout.js (documento do cliente),
// as cores RGB dos PDFs do jsPDF (documento contábil) e os bundles compilados do AuditAI (auditai/assets).
const TELAS_JS = [
  'relatorios-contabeis-ui.js', 'igrejas-conferencia-caixa.js', 'historicos-padrao.js', 'ativo-imobilizado-ui.js',
  'vincular-empresa.js', 'manual-cci.js', 'ajuda-cci.js', 'parametrizacao-regime-ui.js', 'vincular-folha-pagamento.js',
  'reinf/alugueis-planilha-modal.js', 'auditai/conciliacao-arquivos.js', 'pagamentos-receita-ui.js', 'importacao-fi-ui.js',
  'conciliacao-manual-ui.js', 'migracao-sage-ui.js', 'server-monitor-ui.js', 'planos-gerenciamento-ui.js', 'plano-consulta.js',
];
const TAILWIND_ANTIGO = [
  // slate e gray
  'f8fafc', 'f1f5f9', 'e2e8f0', 'cbd5e1', '94a3b8', '64748b', '475569', '334155', '1e293b', '0f172a', '020617',
  'f9fafb', 'f3f4f6', 'e5e7eb', 'd1d5db', '9ca3af', '6b7280', '4b5563', '374151', '1f2937', '111827', '030712',
  // blue e indigo
  'eff6ff', 'dbeafe', 'bfdbfe', '93c5fd', '60a5fa', '3b82f6', '2563eb', '1d4ed8', '1e40af', '1e3a8a', '172554',
  'eef2ff', 'e0e7ff', 'c7d2fe', 'a5b4fc', '818cf8', '6366f1', '4f46e5', '4338ca', '3730a3', '312e81', '1e1b4b',
];
const rgbDe = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join('\\s*,\\s*');
const reHex = new RegExp(`#(?:${TAILWIND_ANTIGO.join('|')})(?![0-9a-z_])`, 'gi');
const reRgb = new RegExp(`rgba?\\(\\s*(?:${TAILWIND_ANTIGO.map(rgbDe).join('|')})\\b`, 'gi');
for (const arquivo of TELAS_JS) {
  const js = ler(arquivo);
  const sobras = [...(js.match(reHex) || []), ...(js.match(reRgb) || [])];
  assert.deepStrictEqual(sobras, [], `${arquivo}: cor do Tailwind antigo (${sobras.slice(0, 3).join(', ')}); use os neutros/azul da Apple.`);
}
// O tema escuro do index.html/admin.html acha os estilos inline desses .js pelo valor da cor ([style*="..."]):
// cada neutro novo usado inline precisa ter o seletor, senão o texto escuro some no fundo escuro.
for (const [pagina, cores] of [
  ['index.html', ['background:#fbfbfd', 'background:#f5f5f7', 'background:#e8e8ed', 'color:#1c1c1e', 'color:#2c2c2e', 'color:#3a3a3c', 'color:#515154', 'color:#6e6e73', 'color:#a1a1a6']],
  ['admin.html', ['color:#1c1c1e', 'color:#2c2c2e', 'color:#3a3a3c', 'color:#515154', 'color:#6e6e73', 'color:#a1a1a6']],
]) {
  const html = ler(pagina);
  for (const cor of cores) {
    assert.ok(html.includes(`html[data-theme="dark"] [style*="${cor}"]`), `${pagina}: falta o seletor do tema escuro para ${cor}.`);
    assert.ok(html.includes(`html[data-theme="dark"] [style*="${cor.replace(':', ': ')}"]`), `${pagina}: falta o seletor do tema escuro para "${cor.replace(':', ': ')}".`);
  }
}

console.log('OK: visual no estilo Apple (fonte, cores, cantos, barra, logo) aplicado no CCI, Admin, AuditAI e telas em .js.');
