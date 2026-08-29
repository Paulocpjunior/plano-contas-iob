# Pendências da auditoria CCI → SAGE

Registro vivo iniciado em 29/08/2026. A ordem abaixo é também a ordem de
prioridade. Cada item só muda para `RESOLVIDA` quando houver evidência de teste
e, quando afetar produção, confirmação da versão/revisão pública.

## Estados

- `ABERTA`: causa confirmada, correção ainda não iniciada.
- `EM_RESOLUÇÃO`: implementação ou validação em andamento.
- `AGUARDANDO EVIDÊNCIA`: código concluído, mas falta teste real, aceite ou janela operacional.
- `RESOLVIDA`: critério de aceite cumprido e evidência registrada.
- `BLOQUEADA`: depende de decisão, acesso ou fonte externa explicitamente indicada.

## Classificação por cores

- 🔴 **Crítica**: bloqueia ou ameaça diretamente a migração.
- 🟠 **Alta**: risco relevante que precisa ser tratado antes do corte.
- 🟡 **Média**: pendência controlável, sem bloqueio imediato.
- 🟢 **Resolvida**: aceite cumprido, com teste e evidência de produção quando aplicável.

A cor mostra a classificação executiva. O campo `Estado` de cada item registra
se ele está aberto, em resolução, aguardando evidência, resolvido ou bloqueado.

## 🔴 Críticas

### 🔴 P01 — Persistência e salvamento de sessões

- Estado: `AGUARDANDO EVIDÊNCIA`
- Evidência inicial: nos 1.000 POSTs de sessão consultados desde 28/08/2026,
  houve 54 respostas HTTP 500, 28 conflitos HTTP 409, p95 de 63,6 s e payload
  máximo de 22,1 MB. O erro de servidor foi `DEADLINE_EXCEEDED` no commit em
  lote do Firestore.
- Causa confirmada: snapshot integral, divisão em blocos de 200.000 caracteres,
  múltiplas escritas por salvamento e retry automático de nova sessão integral.
- Critério de aceite: digitação do lançamento seguinte nunca é desfeita ou
  bloqueada; p95 de persistência menor que 2 s em teste de carga representativo;
  zero HTTP 500/409 indevido e zero perda de lançamento.
- Próxima ação: medir a revisão atual com uso autenticado representativo e
  reduzir a latência do caminho de persistência até p95 menor que 2 s.
- Implementado em 29/08/2026: mutação otimista para que a edição seguinte entre
  imediatamente no estado; fila remota serializada sem cancelamento da
  digitação; controle de versão local para um POST antigo não limpar uma edição
  nova; transporte e armazenamento `gzip-base64` compatíveis com sessões
  legadas; chunks novos limitados a 700.000 caracteres.
- Evidência técnica: fixture de 6.874.252 bytes reduzida para 357.440 bytes
  (94,8%), um chunk, round-trip byte a byte; bateria completa aprovada.
- Evidência de publicação: versão `3.4.195`, revisão
  `plano-contas-iob-00643-46z`, 100% do tráfego e health/version validados;
  nenhuma ocorrência de severidade `ERROR` na revisão na primeira verificação.
- Reforço publicado em 29/08/2026: a versão `3.4.209`, revisão
  `plano-contas-iob-00763-yek`, deixou de reconstruir toda a grade na edição
  direta e passou a sincronizar somente a linha alterada. Um teste dinâmico
  manteve o primeiro POST pendente, aplicou a segunda edição imediatamente e
  comprovou que a confirmação seguinte continha as duas alterações, sem
  re-render nem perda. A porta completa passou com 115 testes, sem pulos ou
  falhas; produção está com 100% do tráfego, health/versão corretos e sem log
  `ERROR` na revisão na primeira verificação.
- Otimização publicada em 29/08/2026: versão `3.4.210`, revisão
  `plano-contas-iob-00765-wer`, 100% do tráfego. As leituras da sessão,
  períodos fechados e saldos transportados passaram a ocorrer em paralelo; a
  sessão e os metadados da empresa usam um único commit; o autosave comum não
  consulta chunks inexistentes. A resposta e os logs passaram a decompor
  acesso, trava, leituras e gravação para medir o p95 da própria revisão sem
  registrar CNPJ nem conteúdo contábil. Health/versão aprovados, 115 testes
  passaram e não houve log `ERROR` na primeira verificação.
- Linha de base observada antes da revisão 00763: 77 POSTs nas últimas 24 h,
  sendo 74 HTTP 200, dois 401 e um 409 por revisão administrativa; p50 de
  5,36 s e p95 de 6,12 s. Não houve HTTP 500 nessa amostra.
- Evidência ainda necessária: uso real ou teste autenticado concorrente na
  revisão 00763 e redução comprovada do p95 para menos de 2 s. A P01 permanece
  `AGUARDANDO EVIDÊNCIA` e não será promovida a verde antes desse aceite.

### 🟢 P02 — Linha oficial de release e prevenção de regressão

- Estado: `RESOLVIDA`
- Evidência inicial: a revisão publicada está 95 commits à frente e 7 atrás de
  `origin/main`; somente `origin/codex/cci-homologar-nubank` contém o commit
  publicado. O deploy manual não executa `npm audit` e encaminha tráfego antes
  da validação final.
- Critério de aceite: produção descendente de uma linha oficial protegida;
  deploy recusado para commit fora dela; mesma porta de qualidade e auditoria
  de dependências em todos os caminhos; candidata validada antes do tráfego.
- Próxima ação: reconciliar a branch publicada com a `main`, criar o contrato de
  release e eliminar a diferença entre deploy manual e GitHub Actions.
- Progresso em 29/08/2026: criado `scripts/sync-version-markers.js`; a porta de
  qualidade bloqueou um candidato antes do deploy por cache-buster divergente e
  a versão 3.4.195 foi sincronizada e validada antes da publicação. A
  reconciliação da branch e a equivalência dos gates continuam abertas.
- Reconciliação preparada em 29/08/2026 na branch
  `codex/cci-release-3.4.195`: os 7 commits exclusivos da `main` foram
  integrados aos 99 commits da linha publicada, preservando a versão 3.4.195,
  o endpoint correto do CFI em `us-west1`, o fechamento CFI e os ajustes
  R-2010. A bateria completa `npm run check` foi aprovada após a resolução dos
  conflitos.
- Etapa oficial cumprida: a branch reconciliada foi publicada por PR na
  `main` e a revisão de produção passou a descender da linha oficial.
- Publicação oficial em 29/08/2026: PR #65 mesclado por squash na `main`; o
  workflow oficial aprovou auditoria, porta de qualidade, candidata sem tráfego,
  health pré-tráfego e health final. A versão 3.4.196 foi confirmada na revisão
  `plano-contas-iob-00737-dak`, com 100% do tráfego, e o commit publicado é
  descendente da `main`.
- Gate manual preparado em 29/08/2026: `npm run deploy:production` deixa de
  executar `gcloud` localmente, recusa qualquer HEAD diferente de
  `origin/main` e apenas dispara/acompanha o mesmo workflow oficial.
- Resolução confirmada em produção: o contrato final foi mesclado pelo PR #66;
  versão 3.4.197 na revisão `plano-contas-iob-00739-beg`, 100% do tráfego,
  auditoria e porta de qualidade aprovadas, candidata validada antes do tráfego
  e health/version finais aprovados.

### 🔴 P03 — Piloto formal da migração

- Estado: `AGUARDANDO P01`
- Evidência inicial: 0 de 146 empresas com piloto homologado e 0 saldos de
  abertura formalmente aprovados na fotografia de 29/08/2026.
- Critério de aceite: 2 a 3 empresas representativas com saldo de abertura,
  dois ou três meses fechados, conciliação SAGE × CCI, transporte e aceite
  contábil formal.
- Próxima ação: selecionar as empresas somente depois de P01 e P02.

## 🟠 Altas

### 🟢 P04 — Executor controlado de migração SAGE

- Estado: `RESOLVIDA`
- Gap: o módulo atual é somente pré-validação e não importa nem persiste dados.
- Critério de aceite: staging imutável, de-para versionado, lote idempotente,
  rejeições, hashes, rollback por lote, painel SAGE × CCI e termo de aceite.
- Implementado em 29/08/2026: staging persistido por hash canônico e arquivo
  fonte SHA-256; de-para e plano ativo versionados; totais oficiais, conta,
  histórico, centro de custo, competência e chaves originais validados sem
  inferência; rejeições duráveis; aplicação administrativa idempotente com
  trava/revisão da sessão e proteção de períodos encerrados.
- Retorno seguro: backup integral anterior preservado em chunks e rollback
  seletivo por lote. Lançamentos posteriores são mantidos; se um lançamento
  migrado tiver sido editado, a reversão automática é bloqueada. O painel
  compara quantidade/total SAGE × CCI e exige `MIGRAR`, responsável, função/CRC,
  evidência do aceite e identidade do administrador.

### 🟠 P05 — Recuperação de desastre independente

- Estado: `EM RESOLUÇÃO`
- Gap: PITR, backups e exportações GCS existem, mas réplica independente e
  restore test documentado em banco separado não estão comprovados.
- Critério de aceite: restauração validada, RTO/RPO medidos, réplica externa
  íntegra e procedimento documentado.
- Evidência de 29/08/2026: PITR de sete dias ativo; 11 backups nativos diários
  em estado `READY`, com retenção de 98 dias; export semanal habilitado e
  último export de 23/08 concluído sem erro no bucket regional protegido contra
  acesso público.
- Proteções aplicadas em 29/08/2026: exclusão do banco de produção passou para
  `DELETE_PROTECTION_ENABLED`; o bucket de export recebeu retenção explícita
  e reversível de 98 dias, mantendo também soft delete de sete dias. Nenhum
  objeto foi apagado ou sobrescrito.
- Evidência ainda necessária: restaurar o último export em banco isolado,
  conferir integridade e medir RTO/RPO; configurar réplica fora do Google Cloud
  após confirmação do NAS e do destino corporativo OneDrive/SharePoint.

### 🟢 P06 — Vulnerabilidades de dependências de produção

- Estado: `RESOLVIDA`
- Gap: 1 vulnerabilidade crítica, 1 alta e 9 moderadas no lock auditado.
- Critério de aceite: zero advisory crítico/alto ou exceção formal com prazo;
  regressão de PDFs e importadores aprovada.
- Candidata em 29/08/2026: `jspdf` atualizado de 2.5.2 para 4.2.1 e
  `jspdf-autotable` de 3.8.4 para 5.0.8. `npm audit --omit=dev
  --audit-level=high` passou com zero crítica e zero alta; permaneceram 8
  moderadas transitivas do ecossistema Google/Firebase, fora do critério
  bloqueante desta pendência.
- Evidência: bateria completa `npm run check` aprovada após a atualização,
  incluindo relatórios contábeis, AuditAI, Conferência de Caixa, geração de PDF
  e todos os importadores homologados.
- Evidência de produção: versão 3.4.196 publicada pela `main` na revisão
  `plano-contas-iob-00737-dak`, 100% do tráfego, health/version aprovados.

### 🟢 P07 — Menor privilégio no Google Cloud

- Estado: `RESOLVIDA`
- Gap: conta padrão do Cloud Run com `Editor`, `Run Admin`,
  `Secret Manager Admin` e outros papéis amplos.
- Critério de aceite: conta dedicada ao runtime e permissões mínimas verificadas.
- Preparado em 29/08/2026: criada a conta dedicada
  `cci-runtime@gen-lang-client-0569062468.iam.gserviceaccount.com`; no projeto,
  ela possui somente `roles/datastore.user`. O acesso a segredo foi concedido
  no próprio recurso: leitura de `GEMINI_API_KEY`, `fiscal-gateway-token`,
  `graph-client-secret`, `reinf-cert-a1` e `reinf-cert-password`, e inclusão de
  versão somente nos dois segredos A1.
- Hardening do código: o runtime deixou de criar containers no Secret Manager;
  a infraestrutura deve provisioná-los previamente. O workflow fixa a conta
  dedicada em toda nova revisão e interrompe antes do tráfego se o Cloud Run
  aplicar uma identidade diferente.
- Evidência de produção: PR #76 aprovado pela porta oficial com 114 testes e
  zero vulnerabilidade alta/crítica; versão `3.4.206`, revisão
  `plano-contas-iob-00757-tuy`, 100% do tráfego. A revisão está `Ready` usando
  a conta dedicada, o health público confirmou Firestore conectado e não houve
  log de severidade `ERROR` na verificação.
- Matriz final conferida: somente `roles/datastore.user` no projeto; leitura
  nos cinco segredos listados; `roles/secretmanager.secretVersionAdder`
  exclusivamente nos dois segredos A1. Nenhum papel `Editor`, `Run Admin` ou
  `Secret Manager Admin` foi concedido ao runtime dedicado.

### 🟠 P08 — Homologação e fila de qualidade de layouts

- Estado: `EM RESOLUÇÃO`
- Gap: 6 de 36 layouts bancários com aprovação explícita. A amostra inicial
  mostrava 227 pendências; a leitura completa posterior confirmou 618
  rejeições e todas as 618 ainda com status pendente.
- Critério de aceite: status confiável por layout, responsável, SLA, versão de
  correção e regressão obrigatória por evidência real.
- Etapa técnica preparada em 29/08/2026: toda rejeição nova recebe prioridade e
  SLA automáticos; registros legados ganham cálculo de prazo na leitura sem
  apagar o histórico. Iniciar tratamento exige responsável válido. Resolver
  exige responsável, a versão atualmente publicada e uma evidência real de
  regressão aprovada compatível com banco/parser; a alteração também entra em
  `layout_events`.
- Aprovação de layout passa a guardar administrador, data, versão e IDs dos
  casos/evidências que sustentaram a decisão. O painel destaca SLA vencido,
  itens sem responsável, prioridade e vínculo da resolução.
- Evidência de produção: versão `3.4.207`, revisão
  `plano-contas-iob-00759-vaq`, 100% do tráfego, health com Firestore conectado,
  painel novo servido publicamente e nenhum log de severidade `ERROR`; 115
  testes passaram, sem pulos ou falhas.
- Passivo medido sem alteração em 29/08/2026: 618 pendentes, 618 sem
  responsável, 611 fora do SLA inferido e zero com versão + evidência de
  resolução. A etapa técnica não promove automaticamente os 29 layouts aptos
  nem inventa donos; a resolução da P08 depende da distribuição e tratamento
  administrativo desse passivo.

### 🟠 P09 — Cobertura fiscal oficial por fonte

- Estado: `EM RESOLUÇÃO`
- Gap: contrato contábil exige evidência oficial, mas a cobertura completa de
  e-CAC direto, FGTS Digital, SEFAZ/GNRE e municípios não está comprovada.
- Critério de aceite: matriz por tributo/fonte, conectores homologados e gaps
  apresentados como cobertura pendente, nunca como ausência de pagamento.
- Auditoria de 29/08/2026: o CFI correto é o serviço do projeto
  `consultorfiscalapp`, revisão `consultor-fiscal-inteligente-02121-qag`, 100%
  do tráfego e health/ready com Firestore aprovado. DAS, DARF e DCTFWeb estão
  ativos; comprovantes Receita/e-CAC têm credencial, mas não consulta
  automática; FGTS Digital, SEFAZ/GNRE e municipal permanecem sem adaptador.
- Etapa técnica preparada: o contrato CFI→CCI passa a exigir as seis fontes
  nominais em todo payload. Item contabilizável por fonte não consultada é
  rejeitado antes de qualquer gravação. A resposta e o log guardam resumo da
  cobertura e matriz DAS, DARFs federais, FGTS, tributos estaduais e ISS.
- Prova real somente leitura: a ponte protegida respondeu o contrato
  `fiscal_pagamentos_v1` para empresa/competência de teste e a candidata o
  validou sem gravar dados: 2 fontes consultadas, 4 não cobertas e todos os
  grupos tributários corretamente marcados como `cobertura_pendente`. O retorno
  sem itens não foi interpretado como ausência de pagamento.
- Interface preparada: fonte consultada aparece em verde, não coberta em
  amarelo, falha em vermelho e status desconhecido em cinza; o alerta afirma
  expressamente que fonte não consultada não comprova ausência de pagamento.
- Evidência de produção em 29/08/2026: versão `3.4.208`, revisão
  `plano-contas-iob-00761-cev`, 100% do tráfego, health com Firestore
  conectado, endpoint de versão correto e interface pública com a legenda das
  quatro cores. O fluxo sem autenticação permaneceu protegido com HTTP 401 e
  não houve log de severidade `ERROR` na nova revisão. A porta de qualidade
  passou com 115 testes, sem pulos ou falhas.
- Evidência ainda necessária: homologar os adaptadores oficiais que continuam
  ausentes. Eles não serão simulados nem marcados como cobertos sem acesso e
  prova oficial; por isso a P09 permanece `EM RESOLUÇÃO`.

## 🟡 Médias

### 🟢 P10 — Observabilidade e alertas

- Estado: `RESOLVIDA`
- Gap: nenhum uptime check encontrado e políticas de alerta não confirmadas.
- Critério de aceite: SLOs e alertas para saúde, latência, 5xx, 409, sessão,
  importação e parser.
- Implementado em 29/08/2026: telemetria HTTP estruturada sem CNPJ, e-mail,
  UID ou URL; `X-Request-Id` para correlação; cinco métricas no Cloud Logging;
  uptime público a cada minuto em América do Sul, EUA e Europa; cinco políticas
  ativas cobrindo indisponibilidade, 5xx, sessão p95 acima de 2 s, falhas/409 de
  sessão e falhas de importação/parser.
- Evidência: provisionamento idempotente executado duas vezes sem duplicar
  recursos; uptime `CCI produção - API health`, cinco métricas `cci_*` e cinco
  políticas `CCI - *` confirmados via APIs do Google Cloud. A regressão local
  comprova que a telemetria não inclui o CNPJ usado na requisição.
- Limite operacional explícito: as políticas abrem incidentes no Cloud
  Monitoring, mas o projeto não possui canal externo cadastrado. A definição
  de destinatário/plantão é ação organizacional, não uma razão para deixar os
  SLOs sem monitoramento.
- Evidência de produção: versão `3.4.200`, revisão
  `plano-contas-iob-00745-cit`, 100% do tráfego, 109 testes aprovados, uptime
  aprovado nas três regiões e nenhum log de severidade `ERROR`. Um POST não
  autenticado confirmou a telemetria pública de sessão e o `X-Request-Id` sem
  gravar dados nem expor o CNPJ enviado.

### 🟢 P11 — Hardening HTTP

- Estado: `RESOLVIDA`
- Gap: serviço público sem headers de segurança padronizados, rate limiting ou
  limites específicos por rota; limite JSON global de 100 MB.
- Critério de aceite: headers, limites e throttling compatíveis com cada fluxo,
  sem quebrar importações homologadas.
- Candidata em 29/08/2026: headers seguros sem CSP disruptiva, `Cache-Control:
  no-store` para APIs, HSTS em HTTPS, limite padrão de 8 MB e exceções explícitas
  para sessão (32 MB), relatório fechado (96 MB), PDF AuditAI (36 MB), e-mail
  contábil (6 MB) e Mercado Pago (24 MB). Limites gerais, por usuário, autosave
  e Gemini retornam HTTP 429 com `Retry-After` e headers `RateLimit-*`.
- Compatibilidade protegida: autosave admite 240 POSTs/min por usuário/empresa,
  a sessão grande compactada continua com round-trip exato e os limites maiores
  preservam os fluxos que transportam PDF ou estado contábil completo.
- Evidência de produção: versão 3.4.198 na revisão
  `plano-contas-iob-00741-jop`, 100% do tráfego, health/version aprovados e zero
  log de severidade `ERROR` na verificação. Headers de segurança e
  `RateLimit-*` confirmados publicamente; payload comum de 9 MB recebeu HTTP
  413 estruturado, enquanto 9 MB na rota de sessão foi aceito pelo parser e
  chegou à autenticação, comprovando o limite específico sem gravação de dados.
- Fechamento: identificação `X-Powered-By` removida e protegida por regressão.
- Evidência final: versão `3.4.199`, revisão
  `plano-contas-iob-00743-xux`, 100% do tráfego, 108 testes aprovados e nenhum
  log de severidade `ERROR`; `X-Powered-By` ausente na resposta pública.

### 🟢 P12 — Cobertura da trilha administrativa

- Estado: `RESOLVIDA`
- Gap: somente 7 documentos na coleção específica de auditoria administrativa.
- Critério de aceite: exclusão, fechamento, reabertura, migração, alteração de
  plano e ações destrutivas registrados com ator, data, escopo e resultado.
- Implementado em 29/08/2026: contrato único e sanitizado de auditoria com
  versão de schema, ator, data, escopo, ação e resultado; exclusão de
  lançamentos, troca/vínculo de plano, fechamento e reabertura passaram a
  alimentar `admin_audit_logs`. Fechamento e reabertura gravam a trilha no
  mesmo batch Firestore da alteração, impedindo operação crítica sem o evento.
- Fechamento em 29/08/2026: o executor da P04 registra staging criado/rejeitado,
  aplicação e reversão do lote na mesma trilha, com administrador, empresa,
  competência, lote, hashes, quantidade e resultado. A cobertura prevista no
  critério de aceite agora existe para todas as ações críticas enumeradas.

### 🟡 P13 — Teste real de concorrência e volume

- Estado: `ABERTA`
- Gap: 103 testes portáteis passam, mas não reproduzem múltiplos colaboradores,
  payload grande, latência e disputa de revisão.
- Critério de aceite: teste E2E reproduzível cobrindo edição simultânea,
  desconexão, retry, reload e payload de grande volume.

### 🟢 P14 — Configuração explícita dos projetos Google Cloud

- Estado: `RESOLVIDA`
- Gap: autenticação e dados usam projetos distintos de forma implícita e os
  comentários operacionais não descrevem corretamente o wiring em execução.
- Critério de aceite: variáveis explícitas, health com identidade não sensível
  dos recursos e documentação única de runtime, autenticação, dados e backup.
- Implementado em 29/08/2026: runtime, Firestore de dados, Firebase Auth e
  backup possuem variáveis independentes; o servidor fixa explicitamente o
  projeto do Firestore e do Auth; o health apresenta somente os quatro project
  IDs; a candidata e a produção são recusadas se a topologia divergir.
- Topologia preservada: runtime/dados/backup em
  `gen-lang-client-0569062468`, autenticação em `projetos-app-sp` e bucket
  `cci-firestore-backups-292090471177`. Nenhum dado foi movido.

### 🟢 P15 — Configuração da integração Mercado Pago

- Estado: `RESOLVIDA`
- Gap: OAuth permanece com valores placeholder na configuração observada.
- Critério de aceite: integração configurada via Secret Manager e homologada,
  ou funcionalidade desabilitada de forma explícita.
- Implementado em 29/08/2026: OAuth e relatório automático ficam
  explicitamente desabilitados por `MERCADO_PAGO_OAUTH_ENABLED=false`; o deploy
  remove os valores placeholder de client ID/secret; backend e interface
  informam o estado e impedem conexão/solicitação automática. A importação
  manual CSV/XLSX permanece ativa e protegida pelos testes existentes.
- Reativação segura: exige secrets reais no Secret Manager, flag explícita e
  homologação do callback/relatório; valor vazio ou placeholder continua
  bloqueado mesmo que a flag seja ligada por engano.
- Sem falso incidente: estado intencionalmente desabilitado responde HTTP 409;
  flag habilitada com credencial ausente/inválida responde HTTP 503 e aciona a
  observabilidade como falha real de configuração.
- Evidência de produção: versão `3.4.203`, revisão
  `plano-contas-iob-00751-bos`, 100% do tráfego, health/version aprovados e
  nenhum log de severidade `ERROR` na nova revisão. A chamada pública ao
  callback desabilitado retornou HTTP 409 com mensagem explícita.

## Histórico de resoluções

- 29/08/2026 — P01 passou de `EM RESOLUÇÃO` para `AGUARDANDO EVIDÊNCIA` após a
  publicação da versão 3.4.195. A implementação e os testes foram concluídos;
  falta confirmar a meta operacional em produção antes de declarar resolução.
- 29/08/2026 — P02 foi confirmada como `RESOLVIDA` na versão 3.4.197 após a
  reconciliação da `main` e o fechamento do caminho manual de deploy.
- 29/08/2026 — P11 foi confirmada como `RESOLVIDA` na versão 3.4.199 após a
  verificação dos headers públicos e dos logs da revisão 00743.
- 29/08/2026 — P10 passou de `ABERTA` para `RESOLVIDA` com telemetria, uptime,
  métricas, SLOs e políticas de alerta ativos no projeto de produção.
- 29/08/2026 — P14 passou de `ABERTA` para `RESOLVIDA` após tornar explícita e
  testável a topologia real de runtime, dados, autenticação e backup.
- 29/08/2026 — P15 passou de `ABERTA` para `RESOLVIDA`: OAuth Mercado Pago
  desabilitado de forma explícita, placeholders removidos e importação manual
  preservada.
- 29/08/2026 — P12 passou de `ABERTA` para `EM RESOLUÇÃO`: os fluxos críticos
  existentes foram integrados à trilha uniforme; falta o executor da P04 para
  existir uma ação real de migração que possa ser auditada.
- 29/08/2026 — P04 passou de `ABERTA` para `RESOLVIDA` com staging imutável,
  aplicação idempotente, painel SAGE × CCI, aceite formal e rollback por lote.
- 29/08/2026 — P12 passou de `EM RESOLUÇÃO` para `RESOLVIDA` após os eventos de
  staging, aplicação e reversão da P04 entrarem na trilha administrativa.
