const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  RETENCAO_AMOSTRA_DIAS,
  nomeArquivoSeguro,
  extrairAmostraLayout,
  caminhoAmostraLayout,
  expiraEm,
} = require('../layout-sample-storage');

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
const workflow = fs.readFileSync(path.join(raiz, '.github/workflows/deploy-app.yml'), 'utf8');

const pdf = Buffer.from('%PDF-1.4\nlayout bancario de teste\n%%EOF', 'utf8');
const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
const body = {
  arquivo: 'Extrato Itaú 07-2026.pdf',
  mime_type: 'application/pdf',
  tamanho: pdf.length,
  sha256,
  arquivo_base64: `data:application/pdf;base64,${pdf.toString('base64')}`,
};
const amostra = extrairAmostraLayout(body);
assert.strictEqual(amostra.sha256, sha256);
assert.deepStrictEqual(amostra.buffer, pdf);
assert.strictEqual(nomeArquivoSeguro(body.arquivo), 'Extrato-Itau-07-2026.pdf');
assert.strictEqual(caminhoAmostraLayout('rascunho123', sha256, body.arquivo), `layouts-bancarios/rascunhos/rascunho123/${sha256}-Extrato-Itau-07-2026.pdf`);
assert.strictEqual(RETENCAO_AMOSTRA_DIAS, 30);
assert.strictEqual(expiraEm(30, new Date('2026-09-02T00:00:00Z')).toISOString(), '2026-10-02T00:00:00.000Z');

assert.throws(() => extrairAmostraLayout({ ...body, tamanho: pdf.length + 1 }), /tamanho do arquivo-modelo difere/i);
assert.throws(() => extrairAmostraLayout({ ...body, sha256: '0'.repeat(64) }), /hash do arquivo-modelo difere/i);
const pdfInvalido = Buffer.from('nao e pdf');
assert.throws(() => extrairAmostraLayout({
  ...body,
  tamanho: pdfInvalido.length,
  sha256: crypto.createHash('sha256').update(pdfInvalido).digest('hex'),
  arquivo_base64: pdfInvalido.toString('base64')
}), /assinatura PDF valida/i);

assert(server.includes("app.get('/api/layouts-bancarios/rascunhos/:id/arquivo', adminRequired"), 'download da amostra deve ser exclusivo do Admin');
assert(server.includes("app.post('/api/layouts-bancarios/rascunhos/:id/ativar', adminRequired"), 'ativacao em teste deve ser exclusiva do Admin');
assert(server.includes('AMOSTRA_OBRIGATORIA_PARA_PARAMETRIZACAO'), 'rascunho desconhecido sem amostra deve ser bloqueado');
assert(server.includes("tipo: 'rascunho_ativado_em_teste'"), 'ativacao deve registrar auditoria');
assert(admin.includes('arquivo_base64: await arquivoComoDataUrl'), 'painel deve enviar a amostra analisada');
assert(admin.includes('Enviar para parametrização'), 'painel deve distinguir parametrizacao de ativacao em teste');
assert(admin.includes('Reenvie o mesmo arquivo no formulário acima.'), 'rascunhos antigos devem mostrar a recuperacao necessaria');
assert(admin.includes('A aprovação ampla continuará bloqueada'), 'ativacao em teste nao pode se apresentar como aprovacao');
assert(workflow.includes('CCI_LAYOUT_SAMPLE_BUCKET'), 'deploy deve configurar o bucket privado de amostras');

console.log('✓ fluxo de rascunho, amostra privada e ativação controlada validado');
