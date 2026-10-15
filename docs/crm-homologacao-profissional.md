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

## 2026-10-14 — Rotina e relevância da busca (3.4.401)

Entrega incremental: número exato primeiro (inclusive zeros à esquerda), paginação por posição na ordenação e rejeição de cursor fora do recorte; autorização permanece anterior à busca. Meu dia ganhou próximos sete dias (amanhã até hoje + 7, inclusive), indicação de controles carregados sem executor/prazo e continuação da consulta por empresas. Links iguais são agrupados somente dentro da mesma categoria, com todas as referências preservadas. Prévia de mensagem em coluna e densidade ajustada no desktop; alvos de toque preservados no celular.

Validação: `check:ci` com 254 aprovados, 3 pulados por evidência local ausente e zero falhas na execução final da versão 3.4.401. Teste de rota com 56 resultados verificou prioridade exata, paginação sem perdas/repetições e restrição de acesso. Navegador com dados fictícios: desktop, celular 390 × 844, claro/escuro, próximos sete dias e prévia DITR; duas referências DEFIS para o mesmo endereço resultaram em um cartão com ambas as fontes. O gate `npm run check` parou no PDF externo ausente do teste Itaú. Nenhum parser foi alterado.

### Preparação do piloto 1200

A leitura autenticada anterior é a base, não uma nova homologação: Josilaine principal, Roger apoio, situação contratual não confirmada e nenhum controle operacional. Preparar no dossiê → Contrato e recorrências, sem preencher por suposição:

| Campo necessário | Decisão pendente |
|---|---|
| Situação e vigência da responsabilidade | Confirmar início e eventual fim com o administrador/Checklist |
| Obrigações aplicáveis | Confirmar cada obrigação; ausência de anexo não implica dispensa |
| Competência, frequência e prazo | Informar cronograma aprovado, sem presumir prazo fiscal |
| Executor, revisor e estimativa | Confirmar atribuição por demanda; vínculo da carteira não a substitui |
| Evidência de conclusão | Definir recibo/documento e conferir o exercício |

Somente depois dessas confirmações gerar e conferir a prévia das recorrências. Esta entrega não grava controles do piloto, não envia mensagens e não habilita automações. Critérios de corte anteriores permanecem pendentes.

## 2026-10-15 — Segunda rodada de validação

Produção reconferida na versão 3.4.402, main `282e15b` (correção SAGE posterior ao CRM 3.4.401), revisão `plano-contas-iob-01167-hiw` com 100% do tráfego. Saúde ok e Firestore conectado; JavaScript e CSS do CRM servidos correspondem aos arquivos da main. Rotas de contexto, carteira e parâmetros do piloto retornam 401 sem autenticação; backend e script de conferência retornam 404 como assets públicos. Isso não substitui teste de isolamento com colaborador real.

Nova leitura transacional do Firestore comparou o payload privado de 13/10: 7.928 registros, 419.095 campos, zero divergências e zero campos editados no CCI detectados pelo comparador. Relatório privado `cci-crm-migracao-20261013/reconciliacao-20261015.json`. A preservação do snapshot está comprovada nesta data; mudanças posteriores no Jotform não estão cobertas.

`npm run check:ci`: 257 aprovados, 2 pulados por evidência externa ausente, zero falhas. `npm run check`: parou novamente no PDF de regressão Itaú ausente. Nenhuma alteração de código ou dados de negócio nesta rodada.

A variável `CCI_CHECKLIST_API_KEY` continua ausente no serviço (verificado apenas nome/presença). Critérios de corte continuam pendentes: credencial e leitura completa do Checklist; delta atual da origem; fórmulas e automações restantes; cópia privada dos binários com hashes; teste com colaborador restrito; regras reais de recorrência; restauração isolada. Não desativar o Jotform.

No Safari remoto, a aba ainda estava na interface anterior ao agrupamento; após recarga, exibiu o aviso e rodapé 3.4.402 e voltou ao login. A causa do retorno ao login está explícita no código (`Auth.Persistence.NONE`) e protegida por `test-memoria-cobranca-login.js`; não foi alterada nesta rodada. O acesso visual autenticado depende de nova entrada. A prova pública de versão não equivale à homologação do piloto.

### Piloto 1200 autenticado — complemento de 15/10

Após entrada do usuário no Safari remoto, leitura administrativa da 3.4.402 conferida, sem alteração de registros ou envio de mensagens:

- Busca `1200`: empresa exata em primeiro lugar entre 73 resultados, 50 carregados; os demais podem corresponder a trechos do CNPJ.
- Dossiê S&P: Josilaine responsável, Roger apoio, situação contratual não confirmada e zero controles; sem percentual indevido de conclusão.
- DEFIS: dois endereços distintos e quatro referências. A expansão do recibo preserva V2 integral, linha 424, e DEFIS 2025, linha 25.
- Outros documentos: dois endereços distintos (Reinf e IBGE), quatro referências. DITR separada, sem link identificado e sem inferência de dispensa.
- Prévia DEFIS em coluna, empresa/CNPJ e link individual corretos; aviso de rascunho sem envio ao Teams/cópia ao OneDrive. Nenhum envio executado.
- Entrada do CCI exibe busca vazia e ativação explícita, sem grade inicial de empresas.

Evidências privadas em `cci-crm-qa-20261015/`: `cci-402-documentos-1200-remoto.png` e `cci-402-previa-defis-1200-remoto.png`, fora do Git.

Achado de qualidade cadastral: a listagem administrativa geral mostrou três nomes genéricos (Empresa Servicos Ltda, Empresa Comercio Ltda, Empresa Industria Ltda), com identificadores sequenciais terminados em 1, 2 e 3. A origem e finalidade ainda precisam ser apuradas; nenhum cadastro foi excluído ou alterado. Não tratar a contagem de 986 entradas da carteira como total de clientes ativos homologados.

Esta conferência encerra a pendência de leitura administrativa do agrupamento e da busca na versão atual. Não homologa usuário restrito, gravações, entrega de automações ou cópia de binários. Permanecem os critérios de corte acima; Jotform deve continuar disponível.

## 2026-10-15 — Implementação assistida 3.4.404

Checklist agora tem revisão individual e aplicação de contrato com motivo, confirmação, verificação da assinatura da origem, concorrência e trilha idempotente. Implementação testada com dados fictícios; leitura/aplicação reais continuam dependentes da credencial. Não há sincronização automática, criação automática de empresas sem vínculo ou alteração de obrigações.

Delta: planejador de comparação tripla e inventário de links implementados, sem escrita no banco. O snapshot novo, a identidade estável das submissões, a aplicação do delta e a cópia privada dos arquivos continuam pendentes. O inventário de 13/10 aponta 4.316 combinações empresa/link e 10.839 referências; não representa 4.316 arquivos comprovados.

Qualidade: check:ci 258 aprovados, 2 pulados, zero falhas; gate local bloqueado pelo PDF Itaú externo. Revisão/aplicação fictícia conferida no navegador e apresentação no celular. Demais critérios de corte preservados.

## Ajuste de escopo aprovado — 15/10/2026

A coluna de IA **Saldo a Distribuir 2028** está excluída da migração e da exigência de equivalência, por determinação de Paulo (“só da migração”). Manter a coluna no Jotform original e preservar os snapshots históricos. Não usar seus resultados em cálculos ou automações do CCI. A exclusão não se aplica aos campos numéricos de saldo e distribuição com nomes semelhantes. Contrato detalhado: `docs/crm-contrato-origem-20261014.md`, seção “Exclusão aprovada do escopo”.
