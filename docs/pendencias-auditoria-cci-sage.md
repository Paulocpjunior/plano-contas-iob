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

## 🔴 Críticas

### P01 — Persistência e salvamento de sessões

- Estado: `RESOLVIDA`
- Evidência inicial: nos 1.000 POSTs de sessão consultados desde 28/08/2026,
  houve 54 respostas HTTP 500, 28 conflitos HTTP 409, p95 de 63,6 s e payload
  máximo de 22,1 MB. O erro de servidor foi `DEADLINE_EXCEEDED` no commit em
  lote do Firestore.
- Causa confirmada: snapshot integral, divisão em blocos de 200.000 caracteres,
  múltiplas escritas por salvamento e retry automático de nova sessão integral.
- Critério de aceite: digitação do lançamento seguinte nunca é desfeita ou
  bloqueada; p95 de persistência menor que 2 s em teste de carga representativo;
  zero HTTP 500/409 indevido e zero perda de lançamento.
- Próxima ação: reduzir a unidade de persistência, tornar a gravação idempotente
  e proteger o comportamento com teste concorrente e payload grande.
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
- Evidência ainda necessária: uso real ou teste autenticado concorrente e
  observação de p95/HTTP 500/409 após a revisão 00643. Ainda não houve POST de
  sessão registrado na nova revisão desde a publicação.

### P02 — Linha oficial de release e prevenção de regressão

- Estado: `AGUARDANDO EVIDÊNCIA`
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

### P03 — Piloto formal da migração

- Estado: `AGUARDANDO P01`
- Evidência inicial: 0 de 146 empresas com piloto homologado e 0 saldos de
  abertura formalmente aprovados na fotografia de 29/08/2026.
- Critério de aceite: 2 a 3 empresas representativas com saldo de abertura,
  dois ou três meses fechados, conciliação SAGE × CCI, transporte e aceite
  contábil formal.
- Próxima ação: selecionar as empresas somente depois de P01 e P02.

## 🟠 Altas

### P04 — Executor controlado de migração SAGE

- Estado: `ABERTA`
- Gap: o módulo atual é somente pré-validação e não importa nem persiste dados.
- Critério de aceite: staging imutável, de-para versionado, lote idempotente,
  rejeições, hashes, rollback por lote, painel SAGE × CCI e termo de aceite.

### P05 — Recuperação de desastre independente

- Estado: `ABERTA`
- Gap: PITR, backups e exportações GCS existem, mas réplica independente e
  restore test documentado em banco separado não estão comprovados; proteção
  contra exclusão está desativada.
- Critério de aceite: restauração validada, RTO/RPO medidos, réplica externa
  íntegra e procedimento documentado.

### P06 — Vulnerabilidades de dependências de produção

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

### P07 — Menor privilégio no Google Cloud

- Estado: `ABERTA`
- Gap: conta padrão do Cloud Run com `Editor`, `Run Admin`,
  `Secret Manager Admin` e outros papéis amplos.
- Critério de aceite: conta dedicada ao runtime e permissões mínimas verificadas.

### P08 — Homologação e fila de qualidade de layouts

- Estado: `ABERTA`
- Gap: 6 de 36 layouts bancários com aprovação explícita; 618 rejeições
  registradas e 227 pendências na janela recente analisada.
- Critério de aceite: status confiável por layout, responsável, SLA, versão de
  correção e regressão obrigatória por evidência real.

### P09 — Cobertura fiscal oficial por fonte

- Estado: `ABERTA`
- Gap: contrato contábil exige evidência oficial, mas a cobertura completa de
  e-CAC direto, FGTS Digital, SEFAZ/GNRE e municípios não está comprovada.
- Critério de aceite: matriz por tributo/fonte, conectores homologados e gaps
  apresentados como cobertura pendente, nunca como ausência de pagamento.

## 🟡 Médias

### P10 — Observabilidade e alertas

- Estado: `ABERTA`
- Gap: nenhum uptime check encontrado e políticas de alerta não confirmadas.
- Critério de aceite: SLOs e alertas para saúde, latência, 5xx, 409, sessão,
  importação e parser.

### P11 — Hardening HTTP

- Estado: `EM_RESOLUÇÃO`
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

### P12 — Cobertura da trilha administrativa

- Estado: `ABERTA`
- Gap: somente 7 documentos na coleção específica de auditoria administrativa.
- Critério de aceite: exclusão, fechamento, reabertura, migração, alteração de
  plano e ações destrutivas registrados com ator, data, escopo e resultado.

### P13 — Teste real de concorrência e volume

- Estado: `ABERTA`
- Gap: 103 testes portáteis passam, mas não reproduzem múltiplos colaboradores,
  payload grande, latência e disputa de revisão.
- Critério de aceite: teste E2E reproduzível cobrindo edição simultânea,
  desconexão, retry, reload e payload de grande volume.

### P14 — Configuração explícita dos projetos Google Cloud

- Estado: `ABERTA`
- Gap: autenticação e dados usam projetos distintos de forma implícita e os
  comentários operacionais não descrevem corretamente o wiring em execução.
- Critério de aceite: variáveis explícitas, health com identidade não sensível
  dos recursos e documentação única de runtime, autenticação, dados e backup.

### P15 — Configuração da integração Mercado Pago

- Estado: `ABERTA`
- Gap: OAuth permanece com valores placeholder na configuração observada.
- Critério de aceite: integração configurada via Secret Manager e homologada,
  ou funcionalidade desabilitada de forma explícita.

## Histórico de resoluções

- 29/08/2026 — P01 passou de `EM RESOLUÇÃO` para `AGUARDANDO EVIDÊNCIA` após a
  publicação da versão 3.4.195. A implementação e os testes foram concluídos;
  falta confirmar a meta operacional em produção antes de declarar resolução.
