'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const catalogo = fs.readFileSync(path.join(root, 'layouts-fiscais-padrao.js'), 'utf8');

assert(index.includes('Importações — Movimento Fiscal'), 'novo modal fiscal deve estar visivel no app');
assert(index.includes('id="infoTipoBancaria"'), 'tela inicial deve oferecer movimento bancario');
assert(index.includes('id="infoTipoFiscal"'), 'tela inicial deve oferecer movimento fiscal');
assert(index.includes("selecionarTipoImportacao('fiscal')"), 'opcao fiscal inicial deve ser selecionavel');
assert(index.includes("tipoImportacao === 'bancaria' ? valorComboboxBanco('infoBanco') : ''"), 'banco deve ser obrigatorio apenas no fluxo bancario');
assert(index.includes("setTimeout(function() { abrirModalMovimentoFiscal(); }, 0);"), 'confirmacao fiscal inicial deve abrir o modal do livro');
assert(index.includes('abrirModalMovimentoFiscal()'), 'app deve expor acao para abrir o modal fiscal');
assert(index.includes('validarArquivoMovimentoFiscal()'), 'modal deve separar validacao da importacao');
assert(index.includes('processarMovimentoFiscalValidado()'), 'modal deve exigir etapa validada antes de importar');
assert(index.includes('Cadastro = layout = chave NF-e'), 'regra tripla de CNPJ deve estar explicita');
assert(index.includes('window.validarVinculoCnpjFiscal(resultado'), 'frontend deve executar a trava de CNPJ antes da gravacao');
assert(index.includes("origemImportacao: 'movimento_fiscal'"), 'lancamentos fiscais devem manter origem propria');
assert(index.includes("if (csvFiscalFlanacarDetectado) {"), 'extrator generico deve reconhecer movimento fiscal');
assert(index.includes('A importação deve ser feita pelo modal fiscal com trava de CNPJ'), 'extrator generico deve redirecionar o movimento fiscal');
assert(index.includes("state.entries = state.entries.concat(entries);"), 'fluxo validado deve usar o mesmo armazenamento de lancamentos');
assert(index.includes('abrirConferenciaImportacao(entries'), 'fluxo fiscal deve reutilizar conferencia antes de gravar');
assert(index.includes('confImpVinculoCnpj'), 'conferencia final deve exibir o vinculo de CNPJ');
assert(server.includes("app.get('/api/layouts-fiscais'"), 'servidor deve publicar catalogo fiscal proprio');
assert(server.includes("require('./layouts-fiscais-padrao')"), 'servidor deve usar o catalogo fiscal canonico');
assert(catalogo.includes("codigoEmpresa: '0109'"), 'catalogo deve conter FASTWELD 0109');
assert(catalogo.includes("cnpj: '02942184000134'"), 'layout FASTWELD deve ter CNPJ homologado');
assert(catalogo.includes("validacaoCnpj: 'chave_nfe_emitente'"), 'layout deve declarar a fonte da amarracao de CNPJ');

console.log('OK: modal Movimento Fiscal separado, catalogado e bloqueado por CNPJ antes da conferencia/gravação.');
