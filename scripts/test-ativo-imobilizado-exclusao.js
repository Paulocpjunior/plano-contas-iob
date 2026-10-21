'use strict';

// Exclusão administrativa de bem cadastrado por engano (v3.4.444).
// Caso real: Serpol, bem nº 008 (impressora HP Smart Tank 724) cadastrado duas vezes.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');
const Exclusao = require(path.join(raiz, 'ativo-imobilizado-exclusao.js'));

const impressora = { descricao: 'Impressora Multifuncional HP Smart Tank 724', data_aquisicao: '2026-07-23', custo: 1449.9, conta_ativo: '1.2.3.01.0005', status: 'ativo' };
const original = { ...impressora, id: 'bem-007', patrimonio: '007' };
const duplicado = { ...impressora, id: 'bem-008', patrimonio: '008', descricao: 'impressora multifuncional  HP Smart Tank 724 ' };
const outro = { ...impressora, id: 'bem-009', patrimonio: '009', custo: 1500 };
const bens = [original, duplicado, outro];
const aberto = [{ periodo: '2026-06', status: 'fechado' }];
const encerradoAgosto = [{ periodo: '2026-08', status: 'fechado' }];

// Duplicidade: mesma descrição (sem diferença de caixa/espaço), data e custo.
assert.deepStrictEqual(Exclusao.possiveisDuplicados(duplicado, bens).map(d => d.patrimonio), ['007']);
assert.deepStrictEqual(Exclusao.possiveisDuplicados(outro, bens), [], 'custo diferente não é duplicidade');
assert.deepStrictEqual(Exclusao.possiveisDuplicados(original, [original, { ...duplicado, status: 'excluido' }]), [], 'bem excluído não conta como duplicado');

// Bem excluído some dos vigentes (tela, depreciação, eventos).
assert.deepStrictEqual(Exclusao.ativosVigentes([original, { ...duplicado, status: 'excluido' }]).map(b => b.id), ['bem-007']);

// Chave dos lançamentos do ativo: "AAAA-MM:<bemId>:<tipo>".
assert.ok(Exclusao.chaveDoBem('2026-08:bem-008:depreciacao', 'bem-008'));
assert.ok(!Exclusao.chaveDoBem('2026-08:bem-0080:depreciacao', 'bem-008'));

// Sem lançamentos: exclusão liberada e aponta o original.
let r = Exclusao.avaliarExclusao({ bem: duplicado, bens, lancamentosGerados: [], entradasSessao: [], periodos: aberto });
assert.ok(r.ok);
assert.strictEqual(r.duplicados[0].patrimonio, '007');
assert.deepStrictEqual(r.lancamentos_escrituracao, []);

// Lançamentos em competência aberta: liberada e lista o que sai (só os do bem excluído).
const gerados = [
  { id: 'h1', chave: '2026-07:bem-008:aquisicao', periodo: '2026-07' },
  { id: 'h2', chave: '2026-08:bem-008:depreciacao', periodo: '2026-08' },
  { id: 'h3', chave: '2026-08:bem-007:depreciacao', periodo: '2026-08' }
];
const sessao = [
  { id: 'e1', chave: '2026-07:bem-008:aquisicao', periodo: '2026-07' },
  { id: 'e2', chave: '2026-08:bem-008:depreciacao', periodo: '2026-08' },
  { id: 'e3', chave: '2026-08:bem-007:depreciacao', periodo: '2026-08' }
];
r = Exclusao.avaliarExclusao({ bem: duplicado, bens, lancamentosGerados: gerados, entradasSessao: sessao, periodos: aberto });
assert.ok(r.ok);
assert.deepStrictEqual(r.lancamentos_controle, ['h1', 'h2']);
assert.deepStrictEqual(r.lancamentos_escrituracao.map(l => l.id), ['e1', 'e2']);
assert.deepStrictEqual(r.periodos, ['2026-07', '2026-08']);

// Trava da 3.4.440: lançamento do bem em mês encerrado ou anterior ao encerramento bloqueia e explica.
r = Exclusao.avaliarExclusao({ bem: duplicado, bens, lancamentosGerados: gerados, entradasSessao: sessao, periodos: encerradoAgosto });
assert.ok(!r.ok);
assert.strictEqual(r.codigo, 'PERIODO_CONTABIL_FECHADO');
assert.deepStrictEqual(r.periodos_bloqueados, ['2026-07', '2026-08']);
assert.ok(/bem nº 008/.test(r.erro) && /não pode ser excluído/.test(r.erro));
assert.ok(/Baixa do bem a partir de setembro\/2026/.test(r.erro), r.erro);

// Lançamento do bem com data alterada para mês travado também bloqueia (período pela data, não só pela chave).
r = Exclusao.avaliarExclusao({ bem: duplicado, bens, lancamentosGerados: [], entradasSessao: [{ id: 'e9', chave: '2026-09:bem-008:depreciacao', periodo: '2026-08' }], periodos: encerradoAgosto });
assert.ok(!r.ok && r.periodos_bloqueados.includes('2026-08'));

// Baixado ou já excluído não se exclui; inexistente diz para atualizar a lista.
assert.strictEqual(Exclusao.avaliarExclusao({ bem: { ...duplicado, status: 'baixado' }, bens }).codigo, 'ATIVO_BAIXADO');
assert.strictEqual(Exclusao.avaliarExclusao({ bem: { ...duplicado, status: 'excluido' }, bens }).codigo, 'ATIVO_JA_EXCLUIDO');
assert.strictEqual(Exclusao.avaliarExclusao({ bem: null, bens }).codigo, 'ATIVO_NAO_ENCONTRADO');

// Motivo obrigatório.
assert.ok(!Exclusao.validarMotivo('  ').ok);
assert.ok(Exclusao.validarMotivo('Cadastro em duplicidade do bem nº 007').ok);

// Rotas: somente administrador, auditoria e filtro dos excluídos nos cálculos.
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
assert.ok(server.includes("app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/exclusao/previa', adminRequired,"));
assert.ok(server.includes("app.post('/api/empresas/:cnpj/ativos-imobilizados/:id/excluir', adminRequired,"));
assert.ok(server.includes("tipo: 'ATIVO_EXCLUIDO'"));
assert.ok(server.includes('await impedirAlteracaoPeriodosFechados(cnpj, sessao.stateJson, novoStateJson);'));
assert.strictEqual((server.match(/AtivoExclusao\.ativosVigentes\(/g) || []).length, 4, 'listagem, prévia e aprovação da depreciação e homologação ignoram bem excluído');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
['previaExclusaoAtivo', 'excluirAtivoImobilizado'].forEach(nome => assert.ok(adapter.includes(nome + ',') || adapter.includes(nome + ' }'), nome));
const ui = fs.readFileSync(path.join(raiz, 'ativo-imobilizado-ui.js'), 'utf8');
assert.ok(ui.includes('podeExcluir = resposta.pode_excluir === true'));
assert.ok(ui.includes('Possível duplicidade'));

console.log('OK: exclusão administrativa de bem do ativo imobilizado (duplicidade, trava do encerramento, auditoria)');
