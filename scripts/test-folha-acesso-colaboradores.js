'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const modulo = fs.readFileSync(path.join(raiz, 'vincular-folha-pagamento.js'), 'utf8');

function blocoEntre(inicio, fim) {
  const posInicio = server.indexOf(inicio);
  const posFim = server.indexOf(fim, posInicio + inicio.length);
  assert(posInicio >= 0 && posFim > posInicio, 'rota nao localizada: ' + inicio);
  return server.slice(posInicio, posFim);
}

const linhaAcoes = index.split('\n').find(linha => linha.includes('abrirModalImportarFolhaDePlano')) || '';
assert(linhaAcoes.includes('📋 Importar Folha'), 'botao Importar Folha deve existir');
assert(!linhaAcoes.match(/is_admin\)\s*\?\s*`<button[^`]*abrirModalImportarFolhaDePlano/), 'Importar Folha nao pode depender de perfil admin');
assert(linhaAcoes.match(/is_admin[^\n]+abrirModalVincularEmpresa/), 'Vincular empresa deve continuar restrito ao admin');

const registrar = blocoEntre("app.post('/api/folha/registrar-importacao'", "// GET /api/folha/empresas-do-plano");
const empresasPlano = blocoEntre("app.get('/api/folha/empresas-do-plano/:planoId'", "// GET /api/folha/mapeamento/:cnpj");
const lerMapeamento = blocoEntre("app.get('/api/folha/mapeamento/:cnpj'", "// PUT /api/folha/mapeamento/:cnpj");
const salvarMapeamento = blocoEntre("app.put('/api/folha/mapeamento/:cnpj'", "// GET /api/folha/checar-duplicidade");
const duplicidade = blocoEntre("app.get('/api/folha/checar-duplicidade'", "// Historicos Padrao IOB SAGE");

assert(registrar.includes('checarAcessoEmpresa(cnpjLimpo, req.user)'), 'registro da importacao deve validar acesso a empresa');
assert(empresasPlano.includes('usuarioPodeAcessarEmpresa'), 'lista de empresas deve respeitar a carteira do usuario');
assert(lerMapeamento.includes('checarAcessoEmpresa(cnpjLimpo, req.user)'), 'leitura do mapeamento deve validar acesso');
assert(salvarMapeamento.includes('checarAcessoEmpresa(cnpjLimpo, req.user)'), 'gravacao do mapeamento deve validar acesso');
assert(duplicidade.includes('checarAcessoEmpresa(cnpjLimpo, req.user)'), 'historico de importacoes deve validar acesso');
assert(modulo.includes('solicite acesso ao administrador'), 'mensagem deve orientar colaborador sem acesso');

// Plano compartilhado (ex.: 1183 DAXX MIDIA com FERREIRA BRAGA HOLDING): a folha
// vai para a empresa ativa sem pedir para digitar o numero.
const fonteEscolha = modulo.match(/function escolherEmpresaAtivaDoPlano\([\s\S]*?\n  \}\n/);
assert(fonteEscolha, 'escolherEmpresaAtivaDoPlano deve existir');
const escolher = new Function(fonteEscolha[0] + '; return escolherEmpresaAtivaDoPlano;')();
const vinculadas = [
  { cnpj: '11775820000171', razao_social: 'DAXX MIDIA LTDA' },
  { cnpj: '99888777000166', razao_social: 'FERREIRA BRAGA HOLDING DE PARTICIPACOES LTDA' },
];
assert.strictEqual(escolher(vinculadas, '11.775.820/0001-71').razao_social, 'DAXX MIDIA LTDA');
assert.strictEqual(escolher(vinculadas, '99888777000166').razao_social, 'FERREIRA BRAGA HOLDING DE PARTICIPACOES LTDA');
assert.strictEqual(escolher(vinculadas, '12345678000190'), null, 'empresa ativa fora do plano cai na escolha manual');
assert.strictEqual(escolher(vinculadas, ''), null, 'sem empresa ativa cai na escolha manual');
const fluxoPlano = modulo.slice(modulo.indexOf('window.abrirModalImportarFolhaDePlano'));
assert(fluxoPlano.indexOf('escolherEmpresaAtivaDoPlano(empresas, cnpjDaEmpresaAtiva())') >= 0, 'fluxo deve tentar a empresa ativa');
assert(fluxoPlano.indexOf('escolherEmpresaAtivaDoPlano') < fluxoPlano.indexOf('prompt('), 'empresa ativa vem antes da pergunta');

// Folha da filial integrada na matriz (3.4.472, modelo SAGE).
const parseResumo = blocoEntre("app.post('/api/folha/parse-resumo'", "// POST /api/folha/registrar-importacao");
assert(parseResumo.includes('conferirFilialDaMatriz(acesso.empresa, cnpjLimpo)'), 'servidor confere que a filial aponta para a matriz ativa');
assert(parseResumo.includes('codigoEmpresa: codigoEmpresaDe(acesso.empresa)'), 'FPIMP da filial e conferido pelo codigo SAGE da filial');
assert(parseResumo.includes('resultado.integrado_na_matriz = cnpjLimpo'), 'servidor marca a matriz de destino');
assert(parseResumo.includes('não dá para confirmar que a folha é da filial'), 'PDF sem CNPJ nao entra como filial');
assert(modulo.includes("fd.append('filial', cnpjOrigemFolha())"), 'modal envia a filial escolhida');
assert(modulo.includes('carregarEstabelecimentosFolha();'), 'modal carrega matriz e filiais');
assert(modulo.includes("'/api/folha/checar-duplicidade?cnpj=' + cnpjOrigemFolha()"), 'duplicidade da folha e por estabelecimento');
const importarSessao = index.slice(index.indexOf('window.CCIImportarFolhaSage = async function'), index.indexOf("formato: 'SAGE FPIMP'"));
assert(importarSessao.includes("String(folha.integrado_na_matriz || '').replace(/\\D/g, '') === cnpjAtivo"), 'sessao so aceita filial marcada para esta matriz');
assert(importarSessao.includes('estabelecimentoFiscalCnpj: cnpjArquivo'), 'lancamento da folha guarda a filial de origem');
const { estabelecimentosDoMovimentoFiscal } = require('../movimento-fiscal-escopo');
const avisoFolha = estabelecimentosDoMovimentoFiscal({ cnpj: '29240822000202', tipo_estabelecimento: 'FILIAL', matriz: { cnpj: '29240822000121', codigo_empresa: '1154' } },
  '29240822000202', { objeto: 'a folha de pagamento', onde: 'Importar Folha', campo: 'Estabelecimento da folha' }).aviso;
assert(/integrar a folha de pagamento na matriz/.test(avisoFolha) && /Importar Folha/.test(avisoFolha) && /Estabelecimento da folha/.test(avisoFolha), 'aviso da filial fala da folha');

console.log('OK: importacao de folha liberada aos colaboradores e isolada por empresa.');
