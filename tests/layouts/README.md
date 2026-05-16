# Testes de Layouts Bancarios

Esta pasta guarda a estrutura dos testes de regressao dos layouts bancarios.

O primeiro nivel de protecao esta em `npm run test:layouts`, que valida:

- layouts oficiais sem IDs duplicados;
- parsers referenciados existentes no codigo;
- casos da Central de Qualidade vinculados a layouts oficiais;
- totais esperados cadastrados nos casos de qualidade.

Os arquivos reais de clientes nao devem ser versionados aqui sem sanitizacao.
Quando houver uma amostra segura, salve em `tests/layouts/fixtures/` e adicione o caso correspondente em `layout-quality-cases.js`.
