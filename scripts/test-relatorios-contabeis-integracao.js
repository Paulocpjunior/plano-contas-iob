'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const adapter = fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8');
const ui = fs.readFileSync(path.join(raiz, 'relatorios-contabeis-ui.js'), 'utf8');
const graphEmail = fs.readFileSync(path.join(raiz, 'graph-email-provider.js'), 'utf8');
const migracaoEstrutura = fs.readFileSync(path.join(raiz, 'scripts/migrate-fastweld-balancete-structure.js'), 'utf8');
const estruturaFastweld = require('./fixtures/fastweld-balancete-estrutura-2026-02.json');

assert(index.includes('/relatorios-contabeis.js'), 'motor não carregado no CCI');
assert(index.includes('/relatorios-contabeis-ui.js'), 'UI não carregada no CCI');
assert(index.includes("showPage('relatorios')"), 'menu de relatórios ausente');
assert(index.includes('id="pageRelatorios"'), 'página de relatórios ausente');
assert(index.includes('relatoriosContabeis: { saldosIniciais: {} }'), 'configuração contábil não inicializada');
assert(index.includes("p !== 'empresas' && !empresaAtivadaExplicitamente()"), 'gate de ativação da empresa foi removido');
assert(index.includes('id="btnCadastroEmpresaNav"'), 'cadastro de empresas foi removido');

['Balancete', 'Razão Analítico', 'Livro Diário', 'Exportar PDF', 'Exportar Excel', 'Enviar PDF por e-mail', 'Enviar PDF no WhatsApp', 'Encerrar período', 'Reabrir período'].forEach(function (texto) {
  assert(ui.includes(texto), 'recurso de relatório ausente: ' + texto);
});
assert(ui.includes('html[data-theme="dark"]'), 'tema escuro não tratado no módulo');
assert(ui.includes('.rc-field input::placeholder'), 'placeholder do tema escuro sem contraste explícito');
assert(ui.includes('html[data-theme="dark"] .rc-alert'), 'avisos do tema escuro sem contraste explícito');
assert(ui.includes('<option value="6">Modelo SAGE — 6 colunas</option>'), 'modelo SAGE de 6 colunas ausente');
assert(ui.includes('<option value="4">4 colunas</option>'), 'balancete de 4 colunas ausente');
assert(ui.includes('<option value="2">2 colunas</option>'), 'balancete de 2 colunas ausente');
assert(ui.includes("'/vendor/jspdf/jspdf.umd.min.js'"), 'jsPDF não é carregado do servidor local');
assert(ui.includes("'/vendor/jspdf-autotable/jspdf.plugin.autotable.min.js'"), 'AutoTable não é carregado do servidor local');
assert(ui.includes('function moedaPDF(valor)'), 'formatador monetário brasileiro do PDF ausente');
assert(ui.includes('function saldoComNatureza(valor)'), 'natureza devedora/credora não aparece no balancete');
assert(ui.includes('function saldoPDFComNatureza(valor)'), 'natureza devedora/credora não aparece no PDF');
assert(ui.includes('function periodoCompleto(periodo)'), 'período completo do relatório ausente');
assert(ui.includes("return ['Conta', 'Descrição', 'Sdo. anterior', 'Débito', 'Crédito', 'Sdo. atual'];"), 'cabeçalho analítico do SAGE não foi reproduzido');
assert(ui.includes('id="rcImprimir"'), 'ação de visualização para impressão ausente');
assert(ui.includes('id="rcImpressaoModal"'), 'modal de visualização para impressão ausente');
assert(ui.includes('id="rcOrientacaoImpressao"'), 'seletor vertical/horizontal ausente');
['rcResponsavelEmpresa', 'rcDocumentoResponsavel', 'rcContadorResponsavel', 'rcCRCContador'].forEach(function (id) {
  assert(ui.includes('id="' + id + '"'), 'campo obrigatório do relatório ausente: ' + id);
});
assert(ui.includes('function abrirModalImpressao()'), 'motor de prévia real não foi ligado');
assert(ui.includes('orientation: preferencias.orientacao'), 'orientação escolhida não chega ao PDF');
assert(index.includes('cadastro: window.__empresaCadastroInternoAtual || info'), 'cadastro ativo não alimenta responsáveis do relatório');
assert(index.includes('state.relatoriosContabeis.preferenciasImpressao = preferencias || {}'), 'preferências de impressão não são salvas');
assert(ui.includes('Balancete Analítico'), 'título analítico do balancete ausente');
assert(ui.includes('rc-synthetic-row'), 'hierarquia visual das contas sintéticas ausente');
assert(ui.includes('function identificacaoBalancete(linha)'), 'identificação hierárquica do balancete ausente');
assert(ui.includes("return (seguro < 0 ? '-R$ ' : 'R$ ') + moeda(Math.abs(seguro));"), 'PDF não fixa símbolo, sinal e duas casas decimais em pt-BR');
assert(ui.includes('body: linhasExportacaoPDF(dados)'), 'PDF não usa as linhas com moeda brasileira');
assert(ui.includes('aoa_to_sheet([cabecalhoExportacao()].concat(linhasExportacao(dados)))'), 'Excel deve preservar valores numéricos para cálculos');
assert(ui.includes('navigator.share'), 'compartilhamento nativo do PDF ausente');
assert(ui.includes("'https://wa.me/'"), 'fallback para conversa do WhatsApp ausente');
assert(ui.includes('id="rcEmail"'), 'ação de envio por e-mail ausente');
assert(ui.includes('id="rcEmailModal"'), 'modal de envio por e-mail ausente');
assert(ui.includes('Desenvolvido by SP Assessoria Contábil. Todos os direitos reservados.'), 'rodapé institucional contábil ausente');
assert(server.includes("app.use('/vendor/jspdf'"), 'rota local do jsPDF ausente');
assert(server.includes("app.use('/vendor/jspdf-autotable'"), 'rota local do AutoTable ausente');

assert(server.includes("app.get('/api/empresas/:cnpj/contabilidade/periodos'"), 'rota de períodos ausente');
assert(server.includes("app.post('/api/empresas/:cnpj/contabilidade/fechar'"), 'rota de fechamento ausente');
assert(server.includes("app.post('/api/empresas/:cnpj/contabilidade/reabrir', adminRequired"), 'reabertura não está restrita ao admin');
assert(server.includes("app.post('/api/empresas/:cnpj/contabilidade/relatorios/enviar-email'"), 'rota de envio do relatório por e-mail ausente');
assert(server.includes('GraphEmail.enviarEmail'), 'servidor não usa o provedor de e-mail institucional');
assert(server.includes("collection('relatorios_contabeis_envios')"), 'auditoria dos envios contábeis ausente');
assert(server.includes("collection('fechamentos_contabeis')"), 'fotografia imutável do fechamento ausente');
assert(server.includes('fotografia.hash = hashSessao'), 'fotografia não usa hash SHA-256 no servidor');
assert(server.includes('PERIODO_CONTABIL_FECHADO'), 'bloqueio de edição do período fechado ausente');
assert(server.includes('assinaturaEstadoPeriodo(atual, periodo) !== assinaturaEstadoPeriodo(novo, periodo)'), 'saldos e lançamentos fechados não são protegidos juntos');
assert(server.includes('SEM_MOVIMENTO_CONTABIL'), 'fechamento sem movimento não está bloqueado');
assert(server.includes('analitica: conta.analitica !== false'), 'API não entrega a natureza sintética/analítica da conta');
assert(adapter.includes('analitica: c.analitica !== false'), 'adaptador não preserva a natureza sintética/analítica da conta');
assert(index.includes('Contas sinteticas formam a arvore usada no Balancete, Balanco e DRE.'), 'importação não preserva contas sintéticas do plano completo');
assert(index.includes('analitica: c.analitica !== false'), 'cadastro do plano ainda força todas as contas como analíticas');
assert(index.includes('body: JSON.stringify({ contas: contas })'), 'sobrescrita do plano não usa o conjunto recebido');
assert.strictEqual(estruturaFastweld.length, 77, 'estrutura sintética extraída do balancete de referência está incompleta');
assert.strictEqual(new Set(estruturaFastweld.map(item => item[0])).size, 77, 'estrutura sintética possui códigos duplicados');
assert(migracaoEstrutura.includes("const aplicar = process.argv.includes('--apply')"), 'migração da FASTWELD deve iniciar em modo dry-run');
assert(migracaoEstrutura.includes('batch.create('), 'migração não está protegida contra sobrescrita de conta existente');

['listarPeriodosContabeis', 'enviarRelatorioContabilEmail', 'fecharPeriodoContabil', 'reabrirPeriodoContabil'].forEach(function (nome) {
  assert(adapter.includes(nome), 'API do navegador ausente: ' + nome);
});

assert(graphEmail.includes('/sendMail'), 'integração Microsoft Graph sendMail ausente');
assert(graphEmail.includes('saveToSentItems: true'), 'mensagem enviada não é preservada nos itens enviados');

console.log('OK: integração dos relatórios contábeis validada');
