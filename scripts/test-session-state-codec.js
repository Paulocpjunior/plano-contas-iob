'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const codec = require('../session-state-codec');

const raiz = path.join(__dirname, '..');

const pequeno = JSON.stringify({ entries: [{ id: '1', descricao: 'PIX recebido', valor: 10.25 }] });
const pequenoCodificado = codec.codificarStateJson(pequeno);
assert.strictEqual(pequenoCodificado.encoding, codec.ENCODING_PLAIN, 'sessão pequena não deve pagar custo de gzip');
assert.strictEqual(codec.decodificarPayload(pequenoCodificado.payload, pequenoCodificado.encoding), pequeno);

const entries = [];
for (let i = 0; i < 30000; i++) {
  entries.push({
    id: `lancamento-${i}`,
    data: '2026-08-29',
    descricao: `Pagamento de fornecedor número ${i}`,
    valor: -(100 + (i % 500)) / 100,
    contaDebito: '0000000401',
    contaCredito: '0000000111',
    codigoHistorico: '0003',
    historico: 'PAGAMENTO DE FORNECEDOR',
  });
}
const grande = JSON.stringify({ entries, info: { empresa: 'EMPRESA TESTE', cnpj: '00000000000000' } });
assert(codec.tamanhoUtf8(grande) > 5 * 1024 * 1024, 'fixture deve representar sessão de grande volume');
const grandeCodificado = codec.codificarStateJson(grande);
assert.strictEqual(grandeCodificado.encoding, codec.ENCODING_GZIP_BASE64);
assert(grandeCodificado.bytesArmazenados < grandeCodificado.bytesOriginais * 0.25, 'snapshot contábil repetitivo deve reduzir pelo menos 75%');
assert.strictEqual(codec.decodificarPayload(grandeCodificado.payload, grandeCodificado.encoding), grande, 'gzip deve preservar cada caractere do snapshot');

const partes = codec.dividirPayload(grandeCodificado.payload);
assert(partes.length > 0);
assert(partes.every(parte => parte.length <= codec.LIMITE_CHUNK_SESSAO), 'nenhum documento pode exceder o limite seguro');
assert.strictEqual(partes.join(''), grandeCodificado.payload);

assert.strictEqual(codec.stateJsonDoBody({ state_json: pequeno }), pequeno, 'contrato antigo deve continuar aceito');
assert.strictEqual(codec.stateJsonDoBody({ state_encoding: 'gzip-base64', state_gzip_base64: grandeCodificado.payload }), grande, 'novo transporte compacto deve ser aceito');
assert.throws(() => codec.stateJsonDoBody({ state_encoding: 'gzip-base64', state_gzip_base64: 'invalido' }), /inválida|incompleta/i);

const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

assert(server.includes("require('./session-state-codec')"), 'servidor deve usar o codec testado');
assert(server.includes('const state_json = stateJsonDoBody(req.body || {})'), 'rota deve aceitar transporte compacto sem mudar validações contábeis');
assert(server.includes('state_stored_bytes: codificado.bytesArmazenados'), 'telemetria deve registrar tamanho armazenado');
assert(server.includes('const [atual, periodosContabeis, transportesSaldos] = await Promise.all(['), 'leituras independentes do autosave devem ocorrer em paralelo');
assert(server.includes('batch.set(sessaoRef, dadosSessao, { merge: true })'), 'sessão deve compartilhar o mesmo commit da atualização da empresa');
assert(server.includes('batch.set(opts.empresaRef, opts.atualizacaoEmpresa, { merge: true })'), 'metadados da empresa devem ser atômicos com a sessão');
assert(server.includes('limparChunksAntigos: !!(atual.dados && atual.dados.state_chunked)'), 'autosave comum não deve consultar chunks inexistentes a cada edição');
assert(server.includes("console.info('[sessao-perf]'"), 'autosave deve registrar telemetria de latência sem identificar a empresa');
assert(server.includes("res.setHeader('Server-Timing'"), 'resposta autenticada deve expor a decomposição segura da latência');
assert(server.includes('carregarSessaoArmazenadaPorRef(sessaoRef)'), 'download deve preservar a sessão compactada e evitar resposta acima do limite da plataforma');
assert(server.includes('dados.state_gzip_base64 = sessao.payload'), 'download deve enviar o payload gzip sem descompactá-lo no servidor');
assert(adapter.includes("new CompressionStream('gzip')"), 'navegador compatível deve compactar antes do POST');
assert(adapter.includes("new DecompressionStream('gzip')"), 'navegador deve descompactar o download grande localmente');
assert(adapter.includes('A resposta da sessão foi interrompida antes de terminar'), 'falha de transporte não pode aparecer como erro genérico de JSON');
assert(adapter.includes("state_encoding: 'gzip-base64'"));
assert(index.includes('A mutação é aplicada imediatamente no estado local'), 'modal não deve aguardar o POST anterior para aplicar a próxima edição');
assert(index.includes('Alterações preservadas — aguardando nova tentativa'), 'falha remota não deve desfazer o trabalho seguinte');
assert(index.includes('_sessaoVersaoLocal > _sessaoVersaoConfirmada'), 'salvamento antigo não pode limpar uma alteração feita durante o POST');
assert(index.includes('agendarSaveRemoto({ manterVersao: true })'), 'retry da mesma versão não deve inventar uma nova mutação');
assert(!index.includes('As alterações seguintes foram canceladas porque o lote anterior não pôde ser salvo.'), 'fila não deve mais cancelar digitação posterior');

console.log(JSON.stringify({
  ok: true,
  original_bytes: grandeCodificado.bytesOriginais,
  stored_bytes: grandeCodificado.bytesArmazenados,
  reduction_percent: Number((100 * (1 - grandeCodificado.bytesArmazenados / grandeCodificado.bytesOriginais)).toFixed(2)),
  chunks: partes.length,
}, null, 2));
