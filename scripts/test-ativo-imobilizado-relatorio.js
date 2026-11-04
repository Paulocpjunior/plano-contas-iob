'use strict';

// Pesquisa em "Bens cadastrados" e Relação Completa dos Bens (PDF) do Ativo Imobilizado (v3.4.486).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');
const Rel = require(path.join(raiz, 'ativo-imobilizado-relatorio.js'));

const base = { classe_fiscal: 'moveis', valor_residual: 0, vida_util_meses: 120, status: 'ativo', conta_ativo: '1.2.3.01.0006', conta_depreciacao_acumulada: '1.2.3.05.0006', conta_despesa_depreciacao: '5.1.1.02.0054' };
const bens = [
  { ...base, id: 'a', patrimonio: '35', descricao: '4 BYG EVOLUTION 2.6', classe_fiscal: 'customizado', data_aquisicao: '2025-09-25', data_disponivel_uso: '2025-09-25', custo: 7000 },
  { ...base, id: 'b', patrimonio: '82', descricao: 'ADESIVO - FIAT STRADA KIT UNIVERSAL', classe_fiscal: 'veiculos', vida_util_meses: 60, data_aquisicao: '2024-03-04', data_disponivel_uso: '2024-03-04', custo: 63300, conta_ativo: '1.2.3.01.0007' },
  { ...base, id: 'c', patrimonio: '1', descricao: 'ARMÁRIO MULTIUSO / CONJUNTO DE PÉS TRIANGULARES', data_aquisicao: '2022-06-16', data_disponivel_uso: '2022-06-16', custo: 13095.62 },
  { ...base, id: 'd', patrimonio: '145', descricao: 'AQUISIÇÃO DE PEÇAS PARA VEÍCULO', classe_fiscal: 'veiculos', vida_util_meses: 60, data_aquisicao: '2026-08-11', data_disponivel_uso: '2026-08-11', custo: 34553.30 },
  { ...base, id: 'e', patrimonio: '010', descricao: 'IMPRESSORA HP', classe_fiscal: 'informatica', vida_util_meses: 60, data_aquisicao: '2023-01-10', data_disponivel_uso: '2023-01-10', custo: 1449.90, status: 'baixado', data_baixa: '2026-03-31', motivo_baixa: 'Descarte por defeito' },
  { ...base, id: 'f', patrimonio: '', descricao: 'TERRENO RUA A', classe_fiscal: 'terrenos', vida_util_meses: '', data_aquisicao: '2020-01-01', data_disponivel_uso: '2020-01-01', custo: 100000, conta_ativo: '1.2.3.01.0001' }
];

// --- Pesquisa ---
assert.deepStrictEqual(Rel.filtrar(bens, { texto: '82' }).map(b => b.id), ['b'], 'nº do patrimônio acha o bem pelo número');
assert.deepStrictEqual(Rel.filtrar(bens, { texto: '10' }).map(b => b.id).sort(), ['e'], '"10" acha o patrimônio 010 (zeros à esquerda)');
assert.deepStrictEqual(Rel.filtrar(bens, { texto: 'armario pes' }).map(b => b.id), ['c'], 'descrição sem acento e com palavras fora de ordem');
assert.deepStrictEqual(Rel.filtrar(bens, { texto: 'fiat strada' }).map(b => b.id), ['b']);
assert.deepStrictEqual(Rel.filtrar(bens, { texto: '1.2.3.01.0007' }).map(b => b.id), ['b'], 'conta do ativo');
assert.deepStrictEqual(Rel.filtrar(bens, { classe: 'veiculos' }).map(b => b.id), ['b', 'd'], 'classe');
assert.deepStrictEqual(Rel.filtrar(bens, { texto: 'veiculos' }).map(b => b.id).sort(), ['b', 'd'], 'nome da classe também é pesquisável');
assert.deepStrictEqual(Rel.filtrar(bens, { status: 'baixado' }).map(b => b.id), ['e']);
assert(!Rel.filtrar(bens, { status: 'em_uso' }).some(b => b.id === 'e'), 'em uso exclui baixados');
assert.strictEqual(Rel.filtrar(bens, {}).length, bens.length, 'sem filtro = todos');
assert.strictEqual(Rel.filtrar(bens, { texto: 'nada disso' }).length, 0);

// --- Ordem ---
assert.deepStrictEqual(Rel.ordenar(bens, 'patrimonio').map(b => b.patrimonio), ['1', '010', '35', '82', '145', ''], 'nº numérico, sem nº por último');
assert.strictEqual(Rel.ordenar(bens, 'descricao')[0].id, 'a');
assert.strictEqual(Rel.ordenar(bens, 'data')[0].id, 'f');
assert.strictEqual(Rel.ordenar(Rel.filtrar(bens, { texto: '1' }), 'descricao', '1')[0].id, 'c', 'patrimônio exato sobe para o topo');

// --- Últimas depreciações aprovadas ---
const ult = Rel.ultimasDepreciacoes([
  { tipo_evento: 'depreciacao', bem_id: 'b', periodo: '2026-08' },
  { tipo_evento: 'depreciacao', bem_id: 'b', periodo: '2026-09' },
  { tipo_evento: 'depreciacao', bem_id: 'c', periodo: '2026-07' },
  { tipo_evento: 'aquisicao', bem_id: 'd', periodo: '2026-10' },
  { tipo_evento: 'depreciacao', bem_id: 'x', periodo: 'lixo' }
]);
assert.deepStrictEqual(ult, { ultima_competencia: '2026-09', por_bem: { b: '2026-09', c: '2026-07' } }, 'aquisição não conta como depreciação');
assert.strictEqual(Rel.competenciaPadrao(ult), '2026-09', 'posição padrão = última depreciação aprovada');
assert.strictEqual(Rel.competenciaPadrao(null, '2026-11-04'), '2026-10', 'sem aprovação: mês anterior');

// --- Posição de cada bem (como o SAGE: dep. acumulada e % depreciado) ---
const pc = Rel.posicao(bens[2], '2026-09', ult.por_bem);
// 13.095,62 / 120 meses; 06/2022 a 09/2026 = 52 meses -> SAGE: 5.674,76 a 43,33%
assert.strictEqual(pc.meses_depreciados, 52);
assert.strictEqual(pc.depreciacao_acumulada, 5674.76, 'soma das quotas lançadas (109,13 x 52) = valor do SAGE');
assert.strictEqual(pc.percentual_depreciado, 43.33);
assert.strictEqual(pc.valor_contabil, 7420.86);
assert.strictEqual(pc.taxa_anual, 10);
assert.strictEqual(pc.inicio_depreciacao, '2022-06');
assert(pc.avisos.some(a => a.includes('só até 07/2026')), 'aprovada até 07 com quota pendente em 08 e 09 = aviso');
assert.strictEqual(Rel.posicao(bens[1], '2026-09', ult.por_bem).avisos.length, 0, 'aprovada até a posição: sem aviso');
assert(Rel.posicao(bens[3], '2026-09', ult.por_bem).avisos[0].includes('Nenhuma depreciação'), 'nunca aprovada: avisa');
const terreno = Rel.posicao(bens[5], '2026-09', {});
assert.strictEqual(terreno.taxa_anual, 0, 'terreno: não depreciável');
assert.strictEqual(terreno.depreciacao_acumulada, 0);
assert.strictEqual(terreno.avisos.length, 0, 'terreno sem depreciação não acusa falta');
const semVida = Rel.posicao({ ...bens[0], vida_util_meses: '' }, '2026-09', {});
assert.strictEqual(semVida.taxa_anual, null, 'sem vida útil: taxa ausente, não zero');
assert(semVida.avisos.some(a => a.startsWith('Cadastro incompleto')), 'cadastro incompleto diz onde corrigir');
// Bem totalmente depreciado com última aprovação antiga não acusa falta.
const velho = { ...base, id: 'v', descricao: 'MESA', data_aquisicao: '2015-01-01', data_disponivel_uso: '2015-01-01', custo: 1200, vida_util_meses: 12 };
assert.strictEqual(Rel.posicao(velho, '2026-09', { v: '2015-12' }).avisos.length, 0);
assert.strictEqual(Rel.posicao(velho, '2026-09', { v: '2015-12' }).percentual_depreciado, 100);

// --- Relação completa ---
const rel = Rel.relacao(Rel.ordenar(bens, 'patrimonio'), { competencia: '2026-07', ultimas: ult });
assert.strictEqual(rel.data_posicao, '2026-07-31');
assert(!rel.linhas.some(l => l.id === 'd'), 'bem adquirido depois da posição fica fora');
assert(rel.avisos.some(a => a.includes('adquirido(s) depois de 07/2026')));
assert.strictEqual(rel.totais.baixados, 1, 'baixado em 03/2026 conta como baixado na posição de 07/2026');
assert.strictEqual(rel.totais.em_uso, rel.linhas.length - 1);
const somaCusto = rel.linhas.filter(l => l.id !== 'e').reduce((s, l) => s + l.custo, 0);
assert.strictEqual(rel.totais.custo, Math.round(somaCusto * 100) / 100, 'totais só dos bens em uso');
const baixa = rel.linhas.find(l => l.id === 'e');
assert.strictEqual(baixa.data_baixa, '2026-03-31');
assert.strictEqual(baixa.motivo_baixa, 'Descarte por defeito');
const relAntes = Rel.relacao(bens, { competencia: '2026-02', ultimas: ult });
assert.strictEqual(relAntes.totais.baixados, 0, 'antes da baixa o bem ainda está em uso');
const projetada = Rel.relacao(bens, { competencia: '2026-10', ultimas: ult });
assert(projetada.avisos.some(a => a.includes('última depreciação aprovada no CCI é de 09/2026')), 'posição além da última aprovação é projetada e avisa');
assert(Rel.relacao(bens, { competencia: '2026-09', ultimas: { ultima_competencia: '', por_bem: {} } }).avisos.some(a => a.startsWith('Nenhuma depreciação foi aprovada')));
assert.throws(() => Rel.relacao(bens, { competencia: '2026-13' }), /competência/);
assert.strictEqual(Rel.nomeArquivo({ razao_social: 'Comércio de Frutas Nova Era Ltda' }, '2026-09'), 'relacao-bens-COMERCIO-DE-FRUTAS-NOVA-ERA-LTDA-202609.pdf');

// --- Ligações: tela, rota, adapter, publicação ---
const ui = fs.readFileSync(path.join(raiz, 'ativo-imobilizado-ui.js'), 'utf8');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
['id="aiBusca"', 'id="aiFiltroClasse"', 'id="aiFiltroStatus"', 'id="aiOrdem"', 'id="aiLimparFiltros"', 'id="aiContagem"', 'id="aiPosicaoRelatorio"', 'id="aiModeloRelatorio"', 'id="aiGerarPDF"', 'RELAÇÃO COMPLETA DOS BENS', 'Mostrando '].forEach(t => assert(ui.includes(t), 'tela: ' + t));
assert(ui.includes("'/vendor/jspdf/jspdf.umd.min.js'") && ui.includes("'/vendor/jspdf-autotable/jspdf.plugin.autotable.min.js'"), 'PDF com a biblioteca local');
assert(server.includes("app.get('/api/empresas/:cnpj/ativos-imobilizados/depreciacao/ultimas'"), 'rota das últimas depreciações');
assert(server.includes('total: todosVigentes.length'), 'lista informa o total para o aviso de lista cortada');
assert(adapter.includes('ultimasDepreciacoesAtivo'));
assert(/ativo-imobilizado\.js[^\n]*\n[^\n]*ativo-imobilizado-relatorio\.js[^\n]*\n[^\n]*ativo-imobilizado-ui\.js/.test(index), 'relatório carrega entre o núcleo e a tela');
assert(require(path.join(raiz, 'public-assets.json')).includes('/ativo-imobilizado-relatorio.js'), 'módulo publicado');

console.log('OK: pesquisa de bens e relação completa do ativo validadas');
