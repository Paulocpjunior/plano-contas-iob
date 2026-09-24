// ============================================================================
// A CASCA do e-mail do CCI — a mesma do CFI, com a identidade do Departamento
// Contábil (24/09). O que estas travas cobram é o FATO, não a redação:
//   · o e-mail diz de qual departamento é, e é o contábil;
//   · texto de terceiro (nome de empresa, mensagem) NÃO vira HTML;
//   · sem PDF, o e-mail DIZ que o relatório não foi anexado (farol honesto);
//   · o logo vai INLINE (cid:) e o anexo existe no repositório.
// ============================================================================
const assert = require('assert');
const L = require('../email-layout');

assert.strictEqual(L.MARCA.departamento, 'Departamento Contábil', 'este app é do departamento contábil');
assert.notStrictEqual(L.MARCA.departamento, 'Departamento Fiscal');

// ─── relatório: identidade + dados + anexo ──────────────────────────────────
const comPdf = L.montarEmailRelatorio({
  tipo: 'Balancete', empresaNome: 'ACME <Ltda>', cnpj: '12.345.678/0001-90', competencia: '2026-08',
  mensagem: 'Segue o balancete.\nQualquer dúvida <responda>.', temPdf: true, enviadoPor: 'ana@spassessoriacontabil.com.br', geradoEm: '24/09/2026 10:00',
});
assert.ok(comPdf.includes('Departamento Contábil'), 'o cabeçalho e o rodapé nomeiam o departamento');
assert.ok(!comPdf.includes('Departamento Fiscal'));
assert.ok(comPdf.includes('ACME &lt;Ltda&gt;'), 'nome da empresa vai escapado');
assert.ok(!comPdf.includes('<Ltda>'), 'texto de terceiro não vira tag');
assert.ok(comPdf.includes('&lt;responda&gt;'), 'a mensagem do colaborador vai escapada');
assert.ok(comPdf.includes('Qualquer dúvida'), 'a mensagem chega inteira');
assert.ok(/cid:sp-logo/.test(comPdf), 'o logo vai inline por cid:');
assert.ok(comPdf.includes('12.345.678/0001-90') && comPdf.includes('2026-08'), 'CNPJ e competência aparecem');
assert.ok(/em anexo/i.test(comPdf), 'com PDF, o e-mail diz que o relatório está em anexo');
assert.ok(!/NÃO pôde ser anexado/.test(comPdf));
assert.ok(comPdf.includes('ana@spassessoriacontabil.com.br'), 'a assinatura diz quem enviou');
assert.ok(comPdf.includes('Consultor Contábil Inteligente'), 'a assinatura é deste app');

const semPdf = L.montarEmailRelatorio({ tipo: 'DRE', empresaNome: 'ACME', competencia: '2026-08', mensagem: 'x', temPdf: false });
assert.ok(/NÃO pôde ser anexado/.test(semPdf), 'sem PDF, o e-mail DIZ que não anexou — nunca sai como se tivesse');
assert.ok(!/em anexo neste e-mail/i.test(semPdf));

// ─── solicitação (Reinf): corpo do evento dentro da casca ───────────────────
const sol = L.montarEmailSolicitacao({ titulo: 'EFD-Reinf - lucros e dividendos de 2026-08', empresaNome: 'ACME', competencia: '2026-08', conteudoHtml: '<p>Prezados,</p>', enviadoPor: 'ana@spassessoriacontabil.com.br' });
assert.ok(sol.includes('<p>Prezados,</p>'), 'o corpo montado pelo módulo do evento entra como está');
assert.ok(sol.includes('Departamento Contábil') && /cid:sp-logo/.test(sol));
assert.ok(sol.startsWith('<!DOCTYPE html>'), 'é um documento completo, não fragmento');

// ─── interno: farol e linhas ────────────────────────────────────────────────
const interno = L.montarEmailInterno({ titulo: 'Alerta', linhas: [{ rotulo: 'Protocolo', valor: 'P<1>' }, { rotulo: 'Vazio', valor: '' }], farol: 'atencao' });
assert.ok(interno.includes('P&lt;1&gt;'), 'valor de linha vai escapado');
assert.ok(!interno.includes('Vazio'), 'linha sem valor não aparece — ausente não vira zero nem traço');
assert.ok(interno.includes(L.CORES_FAROL.atencao.de), 'a paleta do farol é a pedida');

// ─── logo: existe no repo e vai como anexo inline ───────────────────────────
const logo = L.anexoLogo();
assert.strictEqual(logo.length, 1, 'o sp-logo-email.png tem de existir no repositório');
assert.strictEqual(logo[0].contentId, L.MARCA.logoCid, 'o cid do anexo é o que o HTML referencia');
assert.ok(logo[0].contentBytes.length > 1000 && logo[0].contentBytes.length < 60000, 'logo otimizado para e-mail (não o de 100 KB do app)');

// ─── links de rodapé: só http(s) ────────────────────────────────────────────
const comLinks = L.montarLayoutEmail({ titulo: 't', conteudoHtml: '', marca: { siteUrl: 'https://sp.com.br', instagramUrl: 'javascript:alert(1)' } });
assert.ok(comLinks.includes('https://sp.com.br'));
assert.ok(!comLinks.includes('javascript:'), 'link que não é http(s) não entra');

console.log('✓ email-layout: casca do Departamento Contábil, escape, farol honesto do anexo, logo inline');
