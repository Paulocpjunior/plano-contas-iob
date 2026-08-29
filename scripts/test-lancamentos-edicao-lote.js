'use strict';

const assert = require('assert');
const lote = require('../lancamentos-edicao-lote');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function base() {
  return [
    { id: 'a', data: '2026-04-08', descricao: 'Tarifa mensalidade', valor: -224, documento: '1', contaDebito: '894', contaCredito: '13' },
    { id: 'b', data: '2026-04-27', descricao: 'Tarifa extrato', valor: -16, documento: '2', contaDebito: '904', contaCredito: '111' },
    { id: 'c', data: '2026-04-28', descricao: 'Recebimento', valor: 500, documento: '3', contaDebito: '14', contaCredito: '61' }
  ];
}

{
  const entries = base();
  const antes = entries.slice(0, 2).map((e) => ({ data: e.data, valor: e.valor, descricao: e.descricao, documento: e.documento }));
  const resultado = lote.aplicar(entries, new Set(['a', 'b']), {
    contaDebito: '900',
    contaCredito: '14',
    codigoHistorico: '0003',
    historico: 'DESPESA BANCARIA'
  }, { por: 'colaborador@empresa.com', em: '2026-08-18T14:00:00.000Z' });

  assert.strictEqual(resultado.quantidade, 2);
  entries.slice(0, 2).forEach((entry, i) => {
    assert.strictEqual(entry.contaDebito, '900');
    assert.strictEqual(entry.contaCredito, '14');
    assert.strictEqual(entry.codigoHistorico, '0003');
    assert.strictEqual(entry.historico, 'DESPESA BANCARIA');
    assert.deepStrictEqual(
      { data: entry.data, valor: entry.valor, descricao: entry.descricao, documento: entry.documento },
      antes[i],
      'campos de origem financeira devem ser preservados'
    );
    assert.strictEqual(entry.auditoriaAlteracoes.length, 1);
    assert.strictEqual(entry.auditoriaAlteracoes[0].por, 'colaborador@empresa.com');
  });
  assert.strictEqual(entries[2].contaDebito, '14', 'linha não selecionada deve permanecer intacta');
}

assert.throws(() => lote.aplicar(base(), ['a'], { historico: 'TESTE' }), /pelo menos dois/i);
assert.throws(() => lote.aplicar(base(), ['a', 'b'], {}), /ao menos um campo/i);
assert.throws(() => lote.aplicar(base(), ['a', 'b'], { codigoHistorico: '0000' }), /código de histórico/i);
assert.throws(() => lote.aplicar(base(), ['a', 'c'], { contaDebito: '900' }), /mesma natureza/i);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const modulo = fs.readFileSync(path.join(__dirname, '..', 'lancamentos-edicao-lote.js'), 'utf8');
assert(html.includes('id="filterNumeroLancamento"'), 'Lançamentos deve ter localizador por número.');
assert(html.includes('function abrirModalEditarLancamento(idx)'), 'Lançamento existente deve abrir modal de edição.');
assert(html.includes('aplicarEdicaoIndividual(entry, alteracao'), 'Edição direta deve usar a trilha auditável centralizada.');
assert(html.includes('persistirMutacaoLancamentos'), 'Edição deve possuir rollback quando a persistência falhar.');
assert(html.includes('enfileirarMutacaoModalLancamento'), 'Modal deve liberar a tela e enfileirar a persistência sem perder o rollback.');
assert(/async function updateEntry[\s\S]*?enfileirarMutacaoModalLancamento\(async function/.test(html), 'Edição direta na grade deve usar a fila e liberar o próximo lançamento sem aguardar o POST anterior.');
assert(html.includes('Promise.resolve(mutacao())'), 'Mutação seguinte deve entrar no estado local imediatamente, antes da confirmação remota.');
assert(html.includes('const lote = filaMutacoesModalLancamento.splice(0, filaMutacoesModalLancamento.length)'), 'Confirmações acumuladas durante uma gravação devem ser consolidadas no próximo lote.');
assert(html.includes('Alterações preservadas — aguardando nova tentativa'), 'Falha remota deve preservar a digitação e manter o retry.');
assert(!html.includes('As alterações seguintes foram canceladas porque o lote anterior não pôde ser salvo.'), 'Fila não pode cancelar a digitação posterior.');
assert(html.includes("showToast('Lançamento nº ' + numeroExistente + ' enviado para salvamento. Você já pode continuar.'"), 'Edição deve liberar explicitamente o colaborador para o próximo lançamento.');
assert(html.includes('carregarStatusPeriodosLancamentos(!!(opcoes && opcoes.forcar))'), 'Modal deve reutilizar o cache de competências sem remover a consulta forçada administrativa.');
assert(html.includes("salvarSessaoRemotoAgora({ mostrarErro: true, cancelarAgendado: true })"), 'Persistência imediata deve cancelar o autosave redundante já agendado.');
assert(html.includes('if (_sessaoDirty) salvarSessaoRemotoAgora()'), 'Timer remoto não deve reenviar uma sessão que já foi confirmada.');
assert(html.includes('const indiceLancamentoPorId = new Map'), 'Renderização deve localizar lançamentos em tempo linear.');
assert(html.includes('function capturarEdicaoAtivaLancamentos()'), 'Renderização deve capturar o campo que o colaborador ainda está digitando.');
assert(html.includes('restaurarEdicaoAtivaLancamentos(edicaoAtiva);'), 'Renderização deve restaurar valor, foco e cursor da edição em andamento.');
['valor', 'contaDebito', 'contaCredito', 'codigoHistorico', 'historico'].forEach((campo) => {
  assert(html.includes(`data-entry-field="${campo}"`), `Campo ${campo} deve ser identificável para preservar a digitação.`);
});

{
  const inicio = html.indexOf('function capturarEdicaoAtivaLancamentos()');
  const fim = html.indexOf('function renderLancamentos()', inicio);
  assert(inicio >= 0 && fim > inicio, 'Funções de preservação da edição devem permanecer isoladas e testáveis.');
  const restaurado = { value: '', focado: false, selecao: null };
  restaurado.focus = () => { restaurado.focado = true; };
  restaurado.setSelectionRange = (a, b) => { restaurado.selecao = [a, b]; };
  const ativo = {
    value: '401',
    selectionStart: 2,
    selectionEnd: 3,
    classList: { contains: (classe) => classe === 'editable-input' },
    closest: () => ({ getAttribute: () => 'lancamento-128' }),
    getAttribute: (nome) => nome === 'data-entry-field' ? 'contaDebito' : null
  };
  const contexto = {
    document: {
      activeElement: ativo,
      querySelector: (seletor) => {
        assert(seletor.includes('lancamento-128'));
        assert(seletor.includes('contaDebito'));
        return restaurado;
      }
    },
    CSS: { escape: (valor) => valor }
  };
  vm.createContext(contexto);
  vm.runInContext(html.slice(inicio, fim), contexto);
  const edicao = contexto.capturarEdicaoAtivaLancamentos();
  contexto.restaurarEdicaoAtivaLancamentos(edicao);
  assert.strictEqual(restaurado.value, '401', 'valor ainda digitado deve sobreviver ao rerender');
  assert.strictEqual(restaurado.focado, true, 'foco deve voltar ao segundo lançamento');
  assert.deepStrictEqual(restaurado.selecao, [2, 3], 'posição do cursor deve ser preservada');
}
assert(modulo.includes('está encerrado. Solicite a reabertura administrativa'), 'Edição individual deve bloquear competência encerrada.');
assert(html.includes('lancamentoFechadoNoCache(e)'), 'Tabela deve identificar visualmente lançamentos de competência encerrada.');
assert.strictEqual(
  (html.match(/state\.entries = state\.entries\.concat\(entries\);\s+garantirIntegridadeLancamentos\(state\.entries\);/g) || []).length,
  3,
  'cada fluxo de importação deve consolidar a numeração na lista completa antes de salvar'
);
const pacote = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert(pacote.scripts.precheck.includes('npm run test:lancamentos-lote'), 'deploy local deve executar obrigatoriamente os testes de edição segura');

{
  const entries = base();
  const resultado = lote.aplicar(entries, ['a', 'c'], { historico: 'DOCUMENTO CONFERIDO' });
  assert.strictEqual(resultado.quantidade, 2, 'histórico pode ser aplicado entre naturezas distintas');
  assert.strictEqual(entries[0].historico, 'DOCUMENTO CONFERIDO');
  assert.strictEqual(entries[2].historico, 'DOCUMENTO CONFERIDO');
}

{
  const entry = { id: 'x', numeroLancamento: 99, data: '2026-01-05', descricao: 'Original', valor: -10, contaDebito: '1', contaCredito: '2', origem: 'extrato-itau' };
  assert.throws(
    () => lote.aplicarEdicaoIndividual(entry, { descricao: 'Bloqueada' }, { periodos: [{ periodo: '2026-01', status: 'fechado' }] }),
    /está encerrado/i,
    'edição individual deve ser bloqueada antes da mutação'
  );
  assert.strictEqual(entry.descricao, 'Original');
}

{
  const entry = { id: 'x', numeroLancamento: 99, data: '2026-01-05', descricao: 'Original', valor: -10, contaDebito: '1', contaCredito: '2', origem: 'extrato-itau' };
  const evento = lote.aplicarEdicaoIndividual(entry, { descricao: 'Corrigida', historico: 'PAGAMENTO' }, {
    periodos: [{ periodo: '2026-01', status: 'aberto' }],
    por: 'colaborador@empresa.com',
    em: '2026-08-21T12:00:00.000Z'
  });
  assert.strictEqual(entry.descricao, 'Corrigida');
  assert.strictEqual(evento.antes.descricao, 'Original');
  assert.strictEqual(evento.origem, 'extrato-itau');
  assert.strictEqual(entry.editadoPor, 'colaborador@empresa.com');
}

(async function testarPersistenciaERollback() {
  const estado = { entries: [{ id: 'a', data: '2026-02-01', descricao: 'Antes', valor: 10 }], auditoriaLancamentos: [], lastFile: 'origem.pdf' };
  await assert.rejects(
    lote.executarComRollback(estado, async () => {
      lote.aplicarEdicaoIndividual(estado.entries[0], { descricao: 'Não pode ficar' }, { periodos: [] });
      estado.entries.splice(0, 1);
      estado.lastFile = 'alterado.pdf';
    }, async () => { throw new Error('falha de persistência'); }),
    /falha de persistência/
  );
  assert.strictEqual(estado.entries.length, 1, 'rollback deve restaurar exclusão visual');
  assert.strictEqual(estado.entries[0].descricao, 'Antes', 'rollback deve restaurar edição visual');
  assert.strictEqual(estado.lastFile, 'origem.pdf');

  await lote.executarComRollback(estado, async () => {
    lote.aplicarEdicaoIndividual(estado.entries[0], { descricao: 'Depois' }, { periodos: [] });
  }, async () => true);
  const recarregado = JSON.parse(JSON.stringify(estado));
  assert.strictEqual(recarregado.entries[0].descricao, 'Depois', 'edição salva deve sobreviver à recarga');
  assert.strictEqual(recarregado.entries[0].historicoEdicoes.length, 1, 'auditoria deve sobreviver à recarga');

  const antesExcluir = estado.entries[0];
  lote.registrarExclusao(estado, antesExcluir, { periodos: [], por: 'colaborador@empresa.com' });
  estado.entries.splice(0, 1);
  assert.strictEqual(estado.auditoriaLancamentos.length, 1);
  assert.strictEqual(estado.auditoriaLancamentos[0].lancamento.descricao, 'Depois');
})().then(function () {
  console.log('OK: edição, bloqueio, auditoria, persistência e rollback validados.');
}).catch(function (erro) {
  console.error(erro);
  process.exitCode = 1;
});

console.log('OK: alteração explícita em lote preserva dados financeiros e aplica travas contábeis.');
