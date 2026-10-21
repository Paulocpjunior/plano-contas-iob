# CCI — monitor documental SharePoint

## Situação da entrega — 21/10/2026

Implementação em revisão no [PR #326](https://github.com/Paulocpjunior/plano-contas-iob/pull/326), branch `feature/cci-sharepoint-notificacoes-base`, preparada sobre a base `34ae3e2cd47849645ba7b393887c9fe697dc7e44`. A publicação em branches e PRs de rascunho foi autorizada por Paulo. Monitoramento e envio continuam desligados; não houve merge, deploy, habilitação de biblioteca ou envio real.

**Resultado consolidado: 201 testes aprovados, zero falhas e zero pulados em Node v20.20.2: 184 no CCI e 17 no proxy.** A sintaxe dos módulos, testes e dois servidores passou. Os testes usam Graph, Firestore e transportes simulados; não comprovam funcionamento nos serviços reais, desempenho com 3.000 clientes nem IAM de produção. O pacote contém logs e resultado estruturado.

## 1. Origem do proxy comprovada

Repositório: [Paulocpjunior/consultor-fiscal-inteligente](https://github.com/Paulocpjunior/consultor-fiscal-inteligente), pasta [proxy-backend](https://github.com/Paulocpjunior/consultor-fiscal-inteligente/tree/037920140584cb27228f254aca56647739c69aa6/proxy-backend). Os arquivos `server.js`, `sharepoint-sync.js`, `Dockerfile` e `package.json` correspondem às funções, autenticação e rotas identificadas no Cloud Run.

Workflow: [.github/workflows/deploy-proxy.yml](https://github.com/Paulocpjunior/consultor-fiscal-inteligente/blob/037920140584cb27228f254aca56647739c69aa6/.github/workflows/deploy-proxy.yml). O [job 114878969316 do run 38269205907](https://github.com/Paulocpjunior/consultor-fiscal-inteligente/actions/runs/38269205907/job/114878969316) registra a publicação de `consultor-fiscal-proxy-00026-btf`, com 100% do tráfego naquele momento, em 12/10/2026 às 15:19 UTC. Commit publicado: `43b597eb0cf23b2e63f56effafabf9026259f400`.

Os oito arquivos da pasta têm os mesmos blobs no commit publicado e na main consultada `037920140584cb27228f254aca56647739c69aa6`. A identificação está comprovada pelo registro de implantação e pela comparação dos arquivos. Isso não substitui a consulta do tráfego atual no Cloud Run. A conta de implantação informada pelo usuário não foi comprovada separadamente pelo log consultado.

O segundo repositório, `https-github.com-Paulocpjunior-consultor-fiscal-inteligente`, contém uma versão antiga e não corresponde a esse proxy SharePoint. O proxy original confirmado não implementa a nova rota Delta documental.

## 2. Arquitetura escolhida

| Componente | Responsabilidade |
| --- | --- |
| Proxy existente do CFI | Usar a autenticação Graph existente e ler uma página Delta de um drive explicitamente autorizado. |
| CCI | Coordenar ciclos, persistir inventário/checkpoints, correlacionar empresas, consultar carteira/gestores e manter eventos/fila. |
| Transportes existentes do CCI | Enviar Teams/e-mail após validação da biblioteca, destinatários e destino do canal. |

Não há rotina por cliente, novo aplicativo Entra, novo segredo, serviço Cloud Run adicional ou alteração de permissões. Cada drive tem seu checkpoint. O vínculo guarda somente pasta por ID e CNPJ já cadastrado; a distribuição continua na carteira do CRM.

A identidade Graph SharePoint permanece no proxy: aplicativo `a876887f-a126-424f-8d8a-fc011519855e`, tenant `8b8254a4-9a63-4c2d-81a2-577942081943` e referência existente `graph-client-secret`. O e-mail do CCI usa outra configuração existente: **não substituir sua variável `GRAPH_CLIENT_SECRET` pela credencial SharePoint**.

Todos os módulos recebem o mesmo `db` criado pelo servidor CCI. `runtime-config.js` resolve projeto e base; não foi criado cliente Firestore apontando para o projeto do proxy. O código consultado usa `CCI_DATA_PROJECT_ID`, cujo default é `gen-lang-client-0569062468`; Firebase Authentication fica separado em `projetos-app-sp`.

## 3. Contrato documental do proxy

Nova proposta: `POST /api/sharepoint/documentos/delta`, protegida pelo `requireProxyAuth` existente. As rotas XML e `sharepoint-sync.js` foram preservados.

Entrada: `{ "driveId": "<drive autorizado>", "checkpoint": null }` ou o cursor retornado anteriormente. Saída: `{ "value": [...], "@odata.nextLink": "..." }` ou `{ "value": [...], "@odata.deltaLink": "..." }`.

A função permanece desligada sem `CCI_SHAREPOINT_DELTA_ENABLED=true`. A lista explícita `CCI_SHAREPOINT_ALLOWED_DRIVE_IDS` é obrigatória e conferida antes de obter token. O consumidor CCI usa `CCI_SHAREPOINT_PROXY_URL` e `SHAREPOINT_PROXY_TOKEN`; nunca recebe token Graph.

Os links são restritos ao Graph HTTPS e mesmo drive. Redirecionamentos são bloqueados. A resposta contém apenas metadados selecionados, sem conteúdo, credenciais, permissões ou erro bruto do provedor. Cada chamada lê uma página com prazo e limite; uma página excessiva é rejeitada integralmente, sem truncamento seguido de avanço de cursor.

Ainda é necessário conferir o vínculo do segredo compartilhado existente com o runtime CCI e o IAM entre projetos. Nenhum valor de segredo foi lido, solicitado ou incluído no código.

## 4. Inventário, checkpoints e concorrência

A persistência está em `crm-sharepoint-monitor.js`. O módulo puro `crm-sharepoint-checkpoint.js` permanece auxiliar e não equivale, isoladamente, a checkpoint durável.

Cada ciclo tem três etapas:

1. **Coletar:** guardar páginas em área temporária persistente. A última ocorrência de cada item prevalece. Recibo e cursor só avançam após persistir todos os fragmentos da página.
2. **Preparar:** comparar o índice anterior com o estado final coletado e criar evento/fila na mesma transação. A árvore coletada inteira fica disponível para resolver ancestrais antes de atualizar o índice.
3. **Aplicar:** atualizar o índice em lotes e confirmar o checkpoint final apenas quando todos os itens forem aplicados.

O inventário inicial e a reconstrução são silenciosos, usam geração separada e não criam notificações. A geração anterior é preservada até o fechamento da nova. Não se usa `token=latest` para pular a base inicial.

Um lease por drive tem prazo, dono, contador de posse e revisão da configuração. Cada transação confere esses dados e rejeita workers antigos. Retomadas repetem somente trabalho ainda não confirmado. Nenhum POST externo ocorre dentro de transação Firestore.

| Coleção | Conteúdo |
| --- | --- |
| `crm_sharepoint_bibliotecas` | Configuração, revisão, lease, ciclo, checkpoint e agendamento por drive. |
| Subcoleções `ciclos`, `paginas`, `itens` | Área temporária e recibos de coleta/aplicação. |
| `inventarios/{geracao}/itens` | Metadados atuais e tombstones para recuperar exclusões esparsas. |
| Subcoleção `vinculos` | Pasta por ID, CNPJ, confirmação administrativa e situação. |
| `crm_sharepoint_eventos` | Transição, empresa, carteira consultada e pendências. |
| `crm_sharepoint_fila` | Entrada por evento, canal e UID; validação e estado de envio. |
| `crm_sharepoint_entregas` | Reserva única por evento, canal e destino efetivo. |

As regras Firestore não foram alteradas; permanece o bloqueio padrão de acesso direto às novas coleções. Os GETs administrativos omitem checkpoints, tokens, leases e snapshots completos.

## 5. Correlação e carteira

A empresa é identificada pelos ancestrais até a raiz conhecida do mesmo drive e por um único CNPJ vinculado. Nome de pasta, nome de arquivo e semelhança textual não determinam empresa. Ancestral ausente/excluído, ciclo na árvore, vínculo ambíguo, host divergente ou movimento entre empresas geram revisão sem envio.

O resolvedor consulta `empresas/<cnpj>`; somente se ausente, consulta `crm_empresas/<cnpj>`. Usa `equipeVigente` do CRM, incluindo substituições temporárias e a data do escritório. Depois lê `users` e `crm_topologia/gestao`, sem escrever nesses cadastros.

Exige um principal, apoios válidos, usuários ativos, e-mail corporativo e gestor único para cada responsável. Um líder que também é responsável pode acumular o papel de gestor sem duplicação por UID. Empresa incorporada, gestor ausente e identidades conflitantes bloqueiam a preparação.

A carteira não comprova departamento nem permissão SharePoint. Ambas continuam pendentes e devem ser validadas antes do envio. O monitor não concede acesso nem cria link de compartilhamento.

## 6. Erros e reprocessamento

- **429/503 transitório:** cursor preservado e `Retry-After` integral, inclusive prazos superiores a uma hora e retomada administrativa.
- **410:** reconstrução silenciosa obrigatória; o checkpoint anterior fica registrado e a geração antiga é preservada.
- **Falha temporária Firestore:** retomada da etapa; não vira falsa pendência de cadastro.
- **Pendência de carteira:** evento conserva o CNPJ confirmado, sem destinatários aprovados; após corrigir o cadastro, reprocessar somente os destinatários.
- **Associação documental ambígua:** revisão própria; reprocessar carteira não aprova movimento entre empresas nem inventa CNPJ.
- **Falha após reserva de envio:** conservar a reserva; resultado incerto não volta automaticamente ao POST.

O reprocessador exige administrador e motivo, cancela entradas ainda não enviadas de pessoas removidas e cria as novas pendências. Reservas globais e estados aceitos, em envio ou incertos prevalecem. A atualização é transacional com auditoria, não apaga histórico nem autoriza envio.

## 7. Runtime e canais

`crm-sharepoint-runtime.js` inicia sem I/O com o `db` do servidor. As rotas ficam depois da autenticação e proteção de ações; também conferem um administrador ativo em `users`.

| Método e caminho em `/api/crm/sharepoint` | Uso |
| --- | --- |
| GET `/bibliotecas` | Resumo, sem cursor bruto. |
| GET `/eventos` | Últimos 50 eventos resumidos. |
| POST `/bibliotecas` | Configurar drive/host/canais com revisão concorrente. |
| POST `/vinculos` | Confirmar pasta inventariada e CNPJ existente. |
| POST `/executar` | Executar um passo. |
| POST `/retomar` | Retomar mantendo ciclo e prazos. |
| POST `/reconciliar` | Solicitar reconstrução silenciosa. |
| POST `/reprocessar` | Recalcular carteira de evento confirmado, com motivo. |

O dispatcher OIDC de notificações existente chama o runtime; não foi criada agenda. Sem `CCI_SHAREPOINT_MONITOR_ENABLED=true`, a chamada não faz I/O documental. Há limites por rodada que precisam ser medidos com a biblioteca real. Não foi criada nova interface visual administrativa.

O entregador usa o transporte existente `notificacoes-entrega.js`. Exige a flag `CCI_SHAREPOINT_SEND_ENABLED=true`, biblioteca habilitada/homologada com envios autorizados, ciclo incremental concluído, carteira atual e validador efetivo de destino.

**O validador real de departamento, acesso SharePoint e destino ainda não está conectado.** Sem ele, o resultado é `validacao_pendente`; mudar uma flag não libera envio. O Teams existente usa Workflows por chat/canal escolhido; não há resolução de conversa privada pelo UID. Validar destino e audiência faz parte da homologação. E-mail preserva identidade/transporte atuais; WhatsApp fica para etapa posterior.

A reserva global precede o POST. Duas pessoas associadas ao mesmo destino Teams geram uma única postagem do mesmo evento. `aceito` indica aceitação pelo provedor, não entrega/leitura comprovada. Resultado `incerto` exige conferência no provedor antes de decidir repetir.

## 8. Verificação e homologação pendente

Comandos do CCI:

```bash
npm run check:crm-sharepoint
npm run test:crm-sharepoint
```

No proxy: `node test-sharepoint-documentos.js`, dentro de `proxy-backend`. As suítes foram verificadas em Node 20 e, durante o desenvolvimento, em Node 24. O resultado consolidado final em Node20 está nos logs do pacote.

Os novos workflows de PR executam somente testes simulados, com acesso de leitura ao repositório e sem segredo. `package.json` contém testes individuais, sintaxe e encadeamento de `check`. O `npm run check`/`check:ci` completo do CCI e os gates gerais do CFI não foram executados neste checkout parcial.

A homologação deverá registrar:

1. Revisão e gates completos dos dois repositórios. O merge na main aciona os workflows de deploy existentes; manter os PRs em rascunho até o plano aprovado.
2. Autenticação com recursos existentes e uma biblioteca real selecionada, sem alterar permissões. A execução de candidato fora do tráfego de produção depende do plano de homologação aprovado.
3. Inventário completo, várias páginas, checkpoint durável, zero notificações iniciais e retomada após reinício.
4. Inclusão, edição, renomeação, movimentação e exclusão reais, com CNPJ, principal, apoios e gestor corretos; mudança de carteira e usuário sem acesso.
5. Transações/concorrência no Firestore, falha de worker, quotas, custos e latência Graph. O helper de teste não substitui o serviço ou emulador.
6. Validador efetivo de departamento, ACL SharePoint e audiência Teams; então testes autorizados de Teams/e-mail e reconciliação de resultados incertos.
7. Critérios de ativação, observação e reversão. Definir retenção antes de ampliar: esta base conserva ciclos/gerações e não faz expurgo automático.

## 9. Limites e fontes

Delta representa o último estado observado, não todas as ações do usuário. Pode repetir itens, omitir metadados em exclusões e não reapresentar descendentes após renomear uma pasta. Downloads/leitura de documentos não fazem parte desses eventos. O histórico CCI registra transições entre checkpoints, não auditoria completa do SharePoint.

- [Microsoft Graph — driveItem delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0).
- [Firestore — transações](https://firebase.google.com/docs/firestore/manage-data/transactions).
- [PR #326](https://github.com/Paulocpjunior/plano-contas-iob/pull/326).
- [Código original do proxy](https://github.com/Paulocpjunior/consultor-fiscal-inteligente/tree/037920140584cb27228f254aca56647739c69aa6/proxy-backend).
