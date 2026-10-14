# AuditAI — conferência individual de natureza D/C (3.4.399)

## Problema e comportamento

O detector `q$` do bundle retornava sempre falso. O PDF estruturado preservava os saldos, mas o front descartava o tipo analítico/sintético e o vínculo hierárquico das contas reduzidas. Isso omitia alertas e incluía sintéticas nos movimentos analíticos.

A extração passa a preservar tipo, grupo, página e D/C impresso. O módulo puro `auditai/account-audit.js` confere todas as contas analíticas e registra natureza observada/esperada, situação e motivo. O painel mostra as ocorrências e a lista integral, independentemente do parecer generativo. CSV, PDF de auditoria, parecer e PDF executivo incluem a conferência. A IA recebe a lista integral, além da amostra financeira já existente.

Contas redutoras identificadas, prejuízos e deduções de receita têm exceções explícitas. Natureza não informada, grupo desconhecido, contas de natureza variável e códigos repetidos ficam pendentes. A classificação de sintéticas usa metadados do documento. A contingência sem metadados informa cobertura incompleta, mesmo quando não houver alertas. Saldos e lançamentos não são alterados. Análises antigas mantêm seu histórico e pedem reenvio do documento para a nova conferência.

## Evidência e testes

- Balancete JO-BRAS de 01/2026 a 08/2026, três páginas; SHA-256 `0e62b5fa05874cc7b377b73a9227730e8686925f54b12459159f107ba9f0ae56`.
- 99 contas extraídas: 49 analíticas e 50 sintéticas; 49 conferidas, seis divergências e zero pendências.
- Ocorrências analíticas: códigos reduzidos 61, 71, 300, 316, 373 e 772. As sintéticas correspondentes não duplicam os alertas nem as somas.
- Débitos e créditos analíticos: R$ 5.791.520,65 cada. Prejuízo oficial: R$ 454.014,46; PL devedor: R$ 131.309,58, preservados.
- `scripts/test-auditai-account-audit.js`: regras, exceções, campos ausentes, duplicidade, hierarquia, 201 contas sem corte, CSV e PDF paginado e integração do bundle.
- `scripts/test-auditai-jobras-real.js`: regressão com o PDF externo, inclusive integridade dos bytes de origem. Não inclui documento financeiro no repositório; CI informa ausência dessa evidência.
- Teste local de navegador com o componente real e extração real: seis alertas visíveis, 49 linhas acessíveis, CSV com 49 registros e PDF de quatro páginas com todas as contas, sem erro de página. Parecer externo de IA indisponível no ambiente de teste; não usado como prova da detecção.
- `npm run check:ci`: 254 passaram, três pulados por evidência externa ausente, zero falhas. `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades.

## Operação

Depois de atualizar o CCI, abrir AuditAI → Nova Análise e reenviar o PDF. O Dashboard deve mostrar “49 de 49”, “6 divergências” e “0 pendências”. Não reutilizar o resultado antigo como teste da correção. A conferência sinaliza revisão do contador, não confirma a causa contábil nem faz reclassificação automática.

## Manutenção

A fonte React original não está presente; `scripts/patch-auditai-account-audit.js` registra as alterações ancoradas no bundle distribuído. As regras e o painel ficam em arquivos legíveis separados. Scripts de navegador também precisam constar em `public-assets.json`, cuja entrega é verificada pelo teste de integridade multiusuário.
