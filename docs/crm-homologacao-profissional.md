# CRM — roteiro de homologação profissional

## Objetivo e piloto

O usuário confirmou a empresa **1200** em 14/10/2026. Identidade e equipe precisam ser verificadas no cadastro online antes de registrar resultados do piloto. Não atribuir um colaborador por suposição nem criar demandas, baixas ou vínculos fictícios em produção.

A entrega visual não é aceite de equivalência com o Jotform. Manter a origem disponível até concluir os critérios abaixo e obter autorização específica para o corte.

## Evidência atual da origem

Em 14/10, o conector retornou nomes de 57 campos do CONTROLE_CONTABIL_2026_V2 e 26 do Checklist. Não forneceu expressões, condições, ações ou binários. Contagens de submissões não são contagens de empresas e não reconciliam abas do Tables.

O payload privado consolidado da migração de 13/10 contém 14 fontes e 7.928 registros; nenhuma célula contém expressão no campo `formula`. Isso significa ausência de expressões na exportação disponível, não ausência de fórmulas no Jotform. Links repetidos aparecem em Jotform, SharePoint e outras origens; não correspondem automaticamente a anexos únicos. Não executar nem copiar URLs sem classificar destino e acesso.

## Critérios de aceite

| Frente | Implementado | Evidência necessária para encerrar |
|---|---|---|
| Orientação visual | Entrada ilustrada, atalhos, temas e celular | Colaborador identifica empresa, demanda e próximo passo sem instrução externa |
| Entrada leve | Contexto e preferências sem leitura da carteira | Confirmar online as requisições e tempo percebido |
| Trabalho individual | Executor/revisor e filtro pessoal/equipe | Conferir atribuições da empresa 1200 e usuário real; ausência de atribuição permanece explícita |
| Acesso | Autorização atual por carteira, revisão, auditoria e apoio com vigência | Sessões reais de admin, colaborador e consulta; negar acesso cruzado e após revogação |
| Cronograma | Início, prazo interno, vencimento, recorrência por confirmação | Administrador confirma regras, vigências e casos de mudança/saída; não presumir feriados |
| Totais e desempenho | Alcance parcial explícito, carga completa sob consulta | Índice operacional autorizado, consulta pessoal completa e medição com volume real |
| Empresas e parâmetros | Origem preservada e edição auditada | Reconciliar identificações pendentes e snapshot atualizado, campo a campo |
| Fórmulas e opções | Valores importados preservados | Obter expressões, dependências, opções e condições; comparar vazios, erros, limites e arredondamento |
| Anexos | Links preservados | Inventário de binários, autorização de leitura, hashes/contagens e armazenamento privado com autorização por carteira |
| Checklist | Prévia validada por esquema | Credencial configurada, mapeamento confirmado, replay, entrada/saída/retorno e alterações retroativas sem perda histórica |
| Automações | Geração recorrente com prévia e proteção contra duplicidade | Gatilhos/condições/ações reais, fila idempotente, retries e auditoria; nenhuma comunicação real em teste |
| Operação e corte | Deploy candidato com health e promoção | Testar restauração, reconciliar delta final, definir fonte de escrita e aceite explícito |

## Ordem de execução

1. Publicar e conferir a experiência visual, preservando dados e acessos atuais.
2. Inspecionar a empresa 1200: identidade, equipe, parâmetros, documentos, controles e vigência. Registrar ausência como pendência, não como falha corrigida.
3. Obter a configuração completa da origem que falta no conector/exportação; documentar expressões, opções e automações antes de implementar equivalência.
4. Implementar e testar integrações a partir desses contratos, usando cenários isolados; homologar com colaborador real.
5. Concluir desempenho, restauração e reconciliação final; somente então propor o corte do Jotform.


## 2026-10-14 — Piloto 1200 e documentos múltiplos (3.4.395)

Conferência na sessão administrativa autorizada, via Compartilhamento de Tela: ativação e dossiê funcionando; sete registros de origem disponíveis. Parâmetros exibem valor atual e original, inclusive status legado ATIVA e DEFIS ENVIADA = 1; situação contratual do CRM continua não confirmada e não foi inferida do legado. Nenhum controle operacional encontrado para o piloto. Histórico geral ainda é uma orientação para trilhas individuais. Não houve edição de parâmetros, atribuição de equipe ou baixa.

Erro reproduzido ao abrir um campo com recibo e declaração: URL uniu dois PDFs separados por newline, retornando 404. A interface passou a separar links antes de validar com URL e renderizar cada documento nas duas seções, com numeração e deduplicação no mesmo campo. Payload importado intacto. Teste de regressão cobre dois PDFs, CRLF, repetição, link explícito, escaping e esquemas/credenciais inválidos. Após a publicação, o download dos dois PDFs do piloto foi confirmado no Safari remoto. Isso não comprova a cópia dos demais binários nem a equivalência de obrigações; administrador não homologa restrição de colaborador.
- Validação da correção: `npm run check:ci` com 251 aprovados, 3 pulados por evidência externa ausente e nenhuma falha. Navegador com dados fictícios confirmou dois links distintos e numerados nas abas Documentos e Parâmetros, preservando o valor original.


## 2026-10-14 — Reconciliação repetível e encerramento da conferência disponível

Criado `scripts/conferir-crm-jotform.js`: leitura transacional consistente de `crm_registros` e `crm_importacoes`, sem gravações. Compara identificação, origem, posições, nomes, tipos, formatos, fórmulas, hyperlinks, proteção e valores originais contra o payload. Edições nativas são contabilizadas separadamente e exigem revisão e metadados; não são sobrescritas. Isso não substitui auditoria da trilha de cada edição. Relatório usa referências hash, sem valores cadastrais nem URLs. Arquivo de saída é privado, criado exclusivamente sem sobrescrita. Exit 0 = origem conferida, 2 = divergências, 1 = execução incompleta.

Execução real de 14/10: **14 fontes, 7.928 registros, 419.095 campos, zero divergências e zero campos editados no CCI**, em 5.360 ms. Evidência privada: `reconciliacao-20261014.json`, junto do payload de 13/10. Não é um novo snapshot do Jotform e não prova ausência de mudanças após a exportação.

Inventário estático do payload: 10.847 ocorrências de links, 3.916 URLs distintas (3.802 em www.jotform.com, 106 em SharePoint e 8 em outras origens). São URLs, não quantidade de anexos; podem apontar para pastas ou formulários. Nenhum destino foi acessado por esse inventário. Expressões exportadas: zero, sem inferir inexistência na origem.

Backup do Firestore de 14/10 confirmado pelo manifesto: concluído às 02:05 UTC, snapshot às 01:55 UTC, 1.026 objetos e 8.086.605.890 bytes. O próprio manifesto declara anexos não incluídos e restauração não testada. Não foi executada restauração em produção nem declarado ensaio de recuperação completo.

Bloqueios conferidos: variável `CCI_CHECKLIST_API_KEY` ausente no Cloud Run; conector ainda retorna apenas nomes dos 57 campos do formulário contábil; sessão remota estava com tela preta nesta retomada. Nenhuma credencial foi exibida ou criada e nenhum vínculo de usuário foi alterado.

Próximas condições objetivas para concluir a migração:
- Acesso autenticado à configuração das fórmulas, opções, condições e automações da origem e novo snapshot integral para conciliar o delta.
- Credencial autorizada do Checklist configurada no serviço; validar contrato e sequência de eventos antes de habilitar aplicação.
- Inventário de binários com destino privado, hashes e acesso por carteira; não copiar indiscriminadamente URLs de outras plataformas.
- Homologação com colaborador restrito e regras reais de recorrência aprovadas pelo administrador.
- Ensaio de restauração em destino isolado, conferência final e aceite explícito de corte.

O CCI permanece disponível para testes. A migração integral não está encerrada e o Jotform deve permanecer disponível.

## Complemento após acesso à origem

A sessão remota foi disponibilizada pelo usuário e retomada. A configuração original do formulário V2 e do Checklist foi lida sem alterações: cinco condições e uma fórmula no V2, dez condições no Checklist, três configurações de e-mail no V2. Os IDs do Checklist foram conferidos. Ver `docs/crm-contrato-origem-20261014.md` para regras, limites e evidência de publicação 3.4.396. A ausência dessas informações no conector não é mais um bloqueio para inventariar esses dois formulários; a implementação e a paridade integral continuam pendentes.


## 2026-10-14 — Conferência autenticada da versão 3.4.400

Conferência no Safari do MacBook remoto, na sessão administrativa autorizada: empresa 1200, S&P ASSESSORIA CONTABIL S/S, dossiê e aba Documentos acessíveis. Equipe exibida: Josilaine responsável e Roger apoio. Nenhum vínculo, parâmetro, controle ou mensagem foi gravado durante o teste.

- DITR: nenhum link identificado para o piloto; a tela alerta que isso não significa dispensa.
- DEFIS: quatro referências, duas do V2 integral (linha 424) e duas da fonte DEFIS 2025 (linha 25). Repetições entre registros são preservadas; não são quatro arquivos distintos comprovados.
- Outros documentos: quatro referências, relativas a Reinf e IBGE e suas representações na base oficial.
- Prévia DEFIS: abriu com empresa, CNPJ, referência e um link individual. Aviso explícito de ausência de envio ao Teams e cópia ao OneDrive. Nenhum envio executado.
- Situação contratual permanece não confirmada; zero controles operacionais. Nenhuma conclusão, regularidade ou ausência de obrigação pode ser deduzida desses estados.
- Busca por 1200 também encontra trechos de CNPJ (73 resultados nesta sessão). A empresa foi isolada por nome e confirmada pelo número; registrar como melhoria de relevância da busca, sem excluir resultados legítimos.

Evidência privada: `cci-400-documentos-1200-remoto.png` no diretório de QA de 14/10, fora do Git. Esta conferência cobre a leitura com administrador; não homologa restrição de um colaborador real, migração de binários ou entrega das automações.

### Status técnico reconferido

Main `4b0d328` e produção na versão 3.4.400. Revisão Cloud Run `plano-contas-iob-01162-kuq`, 100% do tráfego; saúde ok e Firestore conectado. Quatro scripts focados passaram, zero falhas e nenhum skip reportado: base, Checklist, planejamento e rotas CRM. Não é nova execução do gate integral. A limitação anterior do gate local por PDF externo continua sem resolução comprovada.

A inspeção de nomes de variáveis, sem exibir valores, confirmou `CCI_CHECKLIST_API_KEY` ausente no serviço. A integração não está habilitada apenas porque seu contrato e testes passaram.

### Critérios restantes para o corte

| Frente | Estado | Próxima evidência exigida |
|---|---|---|
| Carteira, dossiê e documentos do piloto | Leitura administrativa conferida | Homologação de operações com registros autorizados e colaborador restrito |
| Contrato e recorrências do piloto | Sem configuração confirmada | Regras reais de aplicabilidade, vigência e prazo aprovadas pelo administrador |
| Checklist | Contrato e testes prontos; credencial ausente | Configuração autorizada da credencial, leitura paginada completa e prévia de entradas/saídas/responsabilidade |
| Fórmulas e ações Jotform | Inventário parcial | Demais fórmulas do Tables, casos restantes do cálculo e configuração integral das ações |
| DITR e DEFIS | Categorias e prévias próprias publicadas | Anexos próprios, destinos completos e ensaio de entrega/falha parcial em destino de teste |
| Binários | Links preservados; cópia não comprovada | Inventário, cópia privada, hashes e acesso por carteira |
| Dados da origem | Snapshot de 13/10 reconciliado em 14/10 | Novo snapshot e conciliação do delta sem sobrescrever edições CCI |
| Recuperação | Backup existente; restauração completa não ensaiada | Restauração isolada de banco, subcoleções e arquivos |

**Decisão de corte: pendente. Manter o Jotform disponível.** Não há percentual global confiável de conclusão enquanto a equivalência das ações e anexos não estiver inventariada e homologada.
