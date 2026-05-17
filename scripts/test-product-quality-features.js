const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assertContains = (file, pattern, label) => {
  const source = read(file);
  const ok = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (!ok) {
    throw new Error(`${label} ausente em ${file}`);
  }
};

assertContains('server.js', "app.post('/api/layout-rejections'", 'registro da fila de rejeicoes');
assertContains('server.js', "app.get('/api/layout-rejections'", 'consulta da fila de rejeicoes');
assertContains('server.js', "app.patch('/api/layout-rejections/:id'", 'atualizacao de status da fila de rejeicoes');
assertContains('server.js', "app.patch('/api/layouts-bancarios/:id/homologacao'", 'homologacao de layout bancario');
assertContains('server.js', "app.get('/api/layout-quality/ops'", 'metricas operacionais de qualidade');
assertContains('server.js', 'mensal', 'resumo mensal de qualidade operacional na API');
assertContains('server.js', 'mesEvento', 'agrupamento mensal de eventos de layout');
assertContains('server.js', 'avaliarAprovacaoLayoutBanco', 'regra servidor para aprovacao de layout com evidencia');
assertContains('server.js', 'layouts_aprovaveis', 'contador de layouts aptos a aprovacao');
assertContains('server.js', 'qualidade_apto_aprovacao', 'metadados de qualidade em layouts bancarios');
assertContains('server.js', "db.collection('layout_events').add", 'registro de sucesso operacional por layout');
assertContains('server.js', "app.put('/api/empresas/:cnpj/aprendizado/:hash'", 'edicao da memoria por empresa');
assertContains('server.js', 'confiabilidade_bancos', 'relatorio de confiabilidade por banco');

assertContains('admin.html', 'testarLayoutAdmin', 'teste manual de layout no admin');
assertContains('admin.html', 'qualityTestFile', 'upload de teste de layout no admin');
assertContains('admin.html', 'Fila de arquivos rejeitados', 'fila de rejeicoes no admin');
assertContains('admin.html', 'Confiabilidade por banco', 'relatorio de confiabilidade no admin');
assertContains('admin.html', 'Taxa operacional por colaborador', 'taxa operacional por colaborador');
assertContains('admin.html', 'atualizarStatusRejeicao', 'mudanca de status da fila no admin');
assertContains('admin.html', 'atualizarHomologacaoLayout', 'controle de homologacao de layout');
assertContains('admin.html', 'Homologados', 'card de homologacao de layouts');
assertContains('admin.html', 'promoverLayoutQualidade', 'promocao de layout pela central de qualidade');
assertContains('admin.html', 'Layouts prontos para aprovação', 'fila de aprovacao de layouts com evidencia');
assertContains('admin.html', '(sem provas)', 'bloqueio visual de aprovacao sem provas');
assertContains('admin.html', 'Aprovação exige caso + evidência', 'orientacao de prova na tabela de layouts');
assertContains('admin.html', 'abrirTesteQualidadeLayout', 'atalho de teste de qualidade a partir da lista de layouts');
assertContains('admin.html', 'Layout selecionado para teste', 'preselecao de layout na central de qualidade');
assertContains('admin.html', 'Resumo mensal de qualidade operacional', 'painel mensal de qualidade operacional');
assertContains('admin.html', 'Banco com mais rejeições', 'destaque mensal de banco critico');

assertContains('index.html', 'abrirConferenciaImportacao', 'modo conferencia antes de gravar');
assertContains('index.html', 'modalMemoriaEmpresa', 'modal de memoria da empresa');
assertContains('index.html', 'salvarMemoriaEmpresa', 'edicao de memoria no app');
assertContains('index.html', 'registrarArquivoRejeitado', 'registro de arquivo rejeitado pelo extrator');
assertContains('index.html', 'sugerirLancamentoManualAssistido', 'lancamento manual assistido');
assertContains('index.html', 'agendarSugestaoLancamentoManual', 'gatilho de sugestao manual');
assertContains('index.html', 'uploadLayoutPdfStatus', 'aviso de homologacao no seletor de layout PDF');
assertContains('index.html', "homologacaoStatus === 'bloqueado'", 'bloqueio operacional de layout PDF');
assertContains('index.html', 'Este layout PDF ainda esta em teste no Admin', 'confirmacao para layout em teste');
assertContains('index.html', 'Layout aprovado pela Central de Qualidade', 'selo operacional de layout aprovado no extrator');
assertContains('index.html', 'Layout homologado pelo Admin', 'selo operacional de layout homologado no extrator');

console.log('OK - recursos de qualidade, memoria e importacao assistida presentes.');
