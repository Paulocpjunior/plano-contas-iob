# DARF pago — consulta e baixa contábil

Publicação autorizada em 12/10/2026. Homologação com pagamento real permanece separada da validação técnica.

## Operação

Em **Situação Fiscal / Impostos → DARF pago — conferir na Receita**, selecione a competência de apuração e informe o documento ou o intervalo de arrecadação. A data contábil é a data da arrecadação, que pode pertencer a outro mês. A consulta é paginada em até 100 documentos, com indicação explícita de continuação.

Selecione o documento e as contas analíticas do plano da empresa: banco, tributo por receita/extensão, multa e juros. Contas não são inferidas. O vínculo indicado na confirmação fica guardado para a próxima baixa da mesma empresa. Multa e juros ausentes permanecem em branco; nenhum valor é calculado por diferença. Desmembramentos são usados sem somar novamente o cabeçalho, com conferência da composição e do total.

A prévia mostra a fonte, as partidas propostas e possíveis correspondências na escrituração por documento ou data/valor. Correspondência bloqueia nova saída bancária; a conferência/correção do lançamento existente continua humana. Documento não localizado não significa não pago.

## Proteções

- Token da Contabilidade, acesso à empresa e permissão de importação na confirmação.
- Fonte recebida e armazenada pelo servidor, ligada à empresa e ao usuário, válida para prévia por 30 minutos. Valores do navegador não são aceitos.
- Modo simulado, documento inválido, composição incompleta, conta ausente/ambígua, diferença de total e competência encerrada bloqueiam a baixa.
- Confirmação recompõe a prévia com o plano e a sessão atuais. Mudança exige nova revisão.
- Gravação usa a trava, o histórico e a publicação atômica da sessão do CCI. A identidade empresa/tipo/número do documento impede repetição, inclusive entre consultas distintas.
- Os demais lançamentos, saldos e metadados são preservados.

## Contrato entre os aplicativos

CCI chama `POST /api/cci-integration/pagamentos/consultar` no CFI com o token do usuário. O CFI aceita somente `projetos-app-sp` nessa rota e confirma o acesso em `GET /api/empresas/:cnpj/pagamentos-receita/acesso` no CCI. Não lê o banco contábil diretamente e não amplia o acesso à rota do DP.

CFI reutiliza `dp-pagamentos.js` e o cliente Integra Contador: PAGTOWEB/PAGAMENTOS71, versão 1.0. O leiaute não é reimplementado no CCI. Auditoria CFI: `cci_pagamentos_log`, catalogada, sem valores financeiros ou respostas brutas.

No CCI, as coleções ficam sob `empresas/{cnpj}`: `pagamentos_receita_consultas` (fonte por consulta), `pagamentos_receita_baixas` (documento e vínculo da baixa), `parametros_contabeis/darf_pago` (contas explícitas) e a auditoria contábil já existente. Expiração lógica da consulta não elimina a evidência armazenada. As regras Firestore continuam fechadas ao navegador.

## Sequência de publicação

1. Publicar primeiro o CCI para disponibilizar a confirmação de carteira; a consulta continuará mostrando indisponibilidade enquanto o CFI não tiver a rota.
2. Configurar **CCI_URL** no CFI com a origem HTTPS real do serviço, obtida do Cloud Run. A configuração não aceita caminho, credenciais ou redirecionamentos. Preservar as demais variáveis.
3. Publicar o CFI. O CCI usa as variáveis CFI_URL/FISCAL_GATEWAY_URL já existentes.
4. Conferir versões, health e arquivos servidos dos dois aplicativos.
5. Com PAGTOWEB contratado, procuração válida e simulação desligada, validar uma empresa autorizada: consulta real, contas indicadas pelo responsável, prévia, confirmação e reconsulta da sessão. Testar também usuário sem acesso.

A homologação real e a escolha das contas do cliente permanecem pendentes; as validações locais usam dados artificiais e não acessam a Receita.

## Validação local de 12/10/2026

- CCI: `npm run test:pagamentos-receita` aprovado; `check:ci`: 244 scripts aprovados, 3 pulados por falta de evidência local, zero falhas. `check` local interrompe no PDF antigo do Itaú ausente. Os pulados são regressões de Itaú mensal, serviços tomados SAGE e Santander, sem alteração nesses parsers.
- CFI: sintaxe, lint, lint estrito e build aprovados; suíte completa: 647 suítes, 9.372 testes aprovados e 1 todo preexistente, após incorporar a atualização do DP da main.
- Chrome local com API simulada: consulta, seleção das contas, prévia, invalidação após mudança de conta e confirmação única aprovadas, sem erro JavaScript. Script reproduzível `scripts/validar-darf-ui.cjs`; usar Playwright disponível via NODE_PATH.
- Não foram consultados pagamentos reais nem gravados lançamentos de clientes.
