# Issue #336 — replicação verificável de CCI e CFI

## Estado da entrega

**Arquitetura revisada em 21/10/2026:** cliente WireGuard sem privilégios dentro
do job Cloud Run, conectado ao servidor WireGuard já existente no UDM Pro. Usa SMB3
nativo do UNAS, sem contratar Cloud VPN, VM, gateway ou licença adicional.
O uso dos serviços Google Cloud existentes continua sujeito à cobrança de execução,
armazenamento e tráfego. A conexão WireGuard e o preflight SMB autenticado das duas pastas foram
homologados em 22/10/2026; transferência e restauração ainda estão pendentes.

Implementação candidata para revisão. **Replicador de produção não implantado;
CFI com gravação e integridade comprovadas; CCI em transferência e restauração
ainda não homologada.** Não foram executados novos exports,
restaurações ou alterações de agenda. A homologação iniciou transferências de
exportações existentes; o estado individual está registrado abaixo. Foram aplicadas
as regras UniFi autorizadas e executados diagnósticos reais de rede e acesso SMB
no Cloud Run, conforme registros abaixo. Os testes de integridade usam dados sintéticos.

## Diagnóstico observado em 21/10/2026

Consultas de leitura ao Cloud Run, Cloud Scheduler, GCS, Cloud Build e às interfaces
autenticadas do UNAS e UDM Pro no Safari:

| Item | Evidência |
|---|---|
| CCI | `gen-lang-client-0569062468`, bucket `cci-firestore-backups-292090471177`, 22 marcadores concluídos, zero `UNAS_VERIFIED.json` |
| CFI | `consultorfiscalapp`, bucket `cfi-firestore-backups-631239634290`, 22 marcadores concluídos, zero `UNAS_VERIFIED.json` |
| Exportação CCI mais recente | `20261021T020039Z-f5774da9`, 1.026 objetos, 11.188.248.619 bytes |
| Exportação CFI mais recente | `20261021T022039Z-2cb8f0b9`, 1.026 objetos, 1.696.120.331 bytes |
| Replicador atual | `cci-unas-replica`, projeto CFI, região `southamerica-east1`, imagem v1, 2 GiB, 1 CPU |
| Execuções do replicador | sucesso técnico em 05/10; 16 falhas consecutivas de 06–21/10, timeout SSH/porta 49222 e rsync código 5 |
| Destino incorreto | `BACKUP_BUCKET` é CFI, `UNAS_MODULE` é `Backup_CCI`; não há processamento do bucket CCI |
| Gateway | UDM Pro `10.0.0.5`, dois links online em failover; nenhum deles usa o IP público fixado no job |
| Rede privada | nenhum túnel listado no projeto CFI; job sem configuração VPC; tela site-to-site do UDM oferece criação, sem túnel existente |
| NAS | UNAS Pro 4 `10.0.0.215`, Drive 4.4.20, SMB e rsync habilitados, NFS desabilitado |
| `Backup_CCI` | pasta existente, 1 arquivo e 2 pastas, aproximadamente 1,49 GB, inclui `20261005T022016Z-4c3d0d5b` (exportação CFI) |
| `Backup_CFI` | pasta existente, zero arquivos e zero pastas |
| Permissões das duas pastas | interface mostra apenas `All Admins (2)`, Owner; nenhuma conta de automação SMB comprovada |

O código implantado do exportador (SHA-256
`8c9a0a76485bc79a2ff181e2fa0918ae89b65c6dc70a35d839583e7db8384a23`)
inicializa `nasConfirmed=false`. O replicador v1 apenas imprime
`REPLICA_UNAS_COMPLETED`; não produz prova autenticada nem atualiza o painel.
O template de e-mail também tinha texto fixo de UNAS não confirmado.

O build `d8429488-a5ce-44d3-a2a3-5bdf988725ea` vincula o `replica.sh`
inspecionado à imagem efetivamente usada. O download completo para `/tmp` é
inadequado para CCI de 11,19 GB em contêiner de 2 GiB.

**Correção do diagnóstico preliminar:** a interface instalada do Drive 4.4.20
documenta rsync sobre SSH. A documentação genérica consultada anteriormente não
é prova de incompatibilidade desta versão. A falha comprovada é timeout para um
IP que não corresponde aos links atuais, além de origem/destino e comprovação
incorretos. Não foi testada autenticação com a credencial rsync existente, que não
deve ser presumida válida para SMB.

## Arquitetura candidata

```text
Scheduler atual 00h30 -> Cloud Run Job atual (nova imagem após homologação)
  -> GCS CCI + GCS CFI: descobrir TODOS os EXPORT_COMPLETED.json
  -> Firestore separado backup-control: fila, leases, backoff, checkpoints/outbox
  -> WireGuard em userspace -> WireGuard nativo do UDM -> SMB3 cifrado no UNAS
       \\10.0.0.215\Backup_CCI\<run>\...
       \\10.0.0.215\Backup_CFI\<run>\...
  -> releitura SHA-256 + inventário -> UNAS_VERIFIED.json no NAS e GCS
  -> painel/e-mail: verificação HMAC, origem, destino e manifesto
```

SMB é um serviço confirmado na interface e permite leitura/escrita por blocos,
releitura e renomeação sem substituir o destino. O handshake SMB3 cifrado, as
permissões da conta de serviço e a atomicidade do rename **ainda dependem de
homologação real**. Não há fallback para protocolo sem criptografia ou IP público.
O worker exige Cloud Run (`CLOUD_RUN_JOB`), configuração aprovada e ativação explícita.
Nenhuma estação ou SERVER_2019 participa da execução.

### Transporte UniFi

O binário Go usa a implementação oficial `wireguard-go` com netstack, sem
`/dev/net/tun`, root, alterações das rotas do contêiner ou contêiner privilegiado.
Expõe apenas `127.0.0.1:1445`, encaminhado exclusivamente para `10.0.0.215:445`.
O adaptador SMB exige assinatura e criptografia. Rotas e DNS contidos no perfil
UniFi não ampliam o destino: a rota interna é fixada em `10.0.0.215/32`.
O perfil secreto é montado como arquivo e não é impresso em logs.

O servidor existente `VPN-SP-EXTERNA.` atende UDP 51820; o painel apresenta WAN1
`187.101.246.158` como endereço de exportação. Ambos os links possuem IP fixo,
conforme informado pelo administrador. O perfil inicial usa um endpoint literal:
**failover automático entre os dois links ainda não está implementado**. Uma queda
mantém a fila retomável; o retorno do endpoint permite nova tentativa. Validar um
segundo endpoint antes de implementar failover, sem alterar outros clientes.

Antes da conexão, criar cliente dedicado e política no UDM permitindo somente
esse cliente → NAS TCP 445, bloqueando os demais destinos. A restrição do programa
não substitui a regra no gateway. Não reutilizar o perfil pessoal `MAC-Paulo`.
O processo sinaliza somente prontidão local; sucesso depende do preflight SMB real.

A opção Local Backup do Drive aceita servidor rsync como origem. Os buckets GCS
não oferecem esse protocolo; esta implementação conecta o job já existente ao
serviço SMB do NAS, sem instalar agentes no UNAS ou em computadores locais.

Referências: [WireGuard no UniFi](https://help.ui.com/hc/en-us/articles/115005445768-UniFi-Gateway-WireGuard-VPN-Server),
[netstack oficial](https://github.com/WireGuard/wireguard-go/blob/master/tun/netstack/examples/http_server.go),
[contrato do Cloud Run](https://docs.cloud.google.com/run/docs/container-contract).

### Fila e transferência

- Coleção `backup_unas_queue` em banco dedicado **diferente de `(default)`**.
  Chave `<app>-<run>`, subcoleção `files` para checkpoints. Não usar o bucket de
  backup para estado mutável: a política de retenção pode impedir sobrescritas.
- Descoberta idempotente de todos os marcadores de `daily/`, incluindo mais de
  30 exportações. O limite de 30 é somente da visualização administrativa.
  Exportações semanais legadas sem marcador/manifesto não são presumidas válidas.
- Transação de claim, lease de 300 s, renovação, fencing de proprietário,
  retomada de lease expirada e backoff até 24h. A agenda atual revisita o backlog.
- Blocos de até 4 MiB, uma transferência de arquivo por vez, sem cópia completa
  local. Leituras por range fixam geração; CRC32C completo é recalculado.
- Caminhos restritos, colisões por caixa e pontos especiais rejeitados; links,
  reparse points e redirecionamentos DFS não são aceitos.
- `<arquivo>.unas-part` só é retomado com checkpoint de propriedade. O prefixo
  já gravado é relido e comparado; checkpoint nunca substitui a verificação.
- Arquivos finais preexistentes são conferidos, nunca truncados/substituídos.
  Divergência bloqueia o run e preserva os bytes para investigação.
- Escritas curtas e leituras SMB menores que o bloco são tratadas. Os waits SMB
  são limitados a 60 s, abaixo do lease. Tempo esgotado mantém o trabalho retomável.
- Arquivos extras dentro do run bloqueiam a prova. Nenhum comando de exclusão
  integra o worker. Nenhuma pasta compartilhada nova é criada.

### Integridade e prova

`manifest.json` e `EXPORT_COMPLETED.json` são copiados sem alteração, além de
todos os objetos do inventário. Quantidade/tamanho da exportação e totais da cópia
(incluindo esses dois arquivos) são registrados separadamente.

Após CRC32C/geração na origem, SHA-256 durante cópia, releitura independente dos
bytes no NAS, nova conferência dos nomes finais e inventário, é criado um envelope
HMAC-SHA256. O payload contém app, projeto, bucket, run, hash/geração do manifesto,
hash do marcador, destino, data, hashes por arquivo e totais.

`UNAS_VERIFIED.pending.json` no GCS retém os bytes assinados para recuperar crash
durante a escrita do comprovante no NAS. **Não significa sucesso**, e não é lido
pelo painel como prova. `UNAS_VERIFIED.json` só é publicado no GCS após a gravação
e releitura do mesmo envelope no NAS. Ambos são create-only. Os manifestos originais
e seus booleanos históricos não são alterados.

As chaves HMAC (mínimo 32 bytes aleatórios, base64 em keyring JSON) ficam em Secret
Manager e são montadas como arquivo. Retenção de key IDs anteriores permite verificar
provas antigas após rotação. Nenhuma chave acompanha o PR. Somente backend/worker
autorizados leem o keyring; o navegador recebe apenas o envelope assinado.

O painel ignora `nasConfirmed=true` legado e a conclusão isolada da fila. Exige
prova válida com vínculo completo e destino esperado. “Verificado em” representa
a data da conferência; não é uma auditoria contínua dos discos do NAS.

### Painel, notificações e limites

Estados: Pendente, Transferindo, Falhou, Verificado. Exibe progresso, bytes do
arquivo atual, última tentativa, motivo seguro de falha e download da prova.
Falha de consulta aparece como indisponibilidade, nunca como sucesso.

O exportador continua notificando “Exportação Firestore concluída”. O replicador
usa identidade dedicada, distinta dos exportadores, para `replica_verified` e
`replica_failed`; o backend confere a prova antes de aceitar o sucesso. A fila
mantém outbox. Aceitação pelo Microsoft 365 não é entrega na caixa de entrada;
envio anterior de resultado incerto fica pendente para revisão, evitando duplicação.

Anexos Cloud Storage e índices não fazem parte desta exportação Firestore. O botão
atual de restauração nativa permanece separado do ensaio da réplica UNAS.

## Arquivos e serviços

- `backup_unas/core.py`: inventário, transferência retomável, integridade e prova.
- `backup_unas/adapters.py`: GCS, Firestore de controle e SMB3.
- `backup_unas/wireguard/` e `vpn.py`: cliente WireGuard em userspace e ciclo de vida.
- `backup_unas/worker.py`: descoberta, execução, backoff/outbox e preflight.
- `backup_unas/restore_test.py`: reidratação do NAS e comparação de duas restaurações isoladas.
- Dockerfile, requisitos fixados, config de exemplo e Cloud Build próprio do worker.
- `unas-receipt.js`, `admin-backups.js`, `admin-backups-ui.js`: prova e estado administrativo.
- `backup-notifications.js`, rota administrativa protegida em `server.js`.
- Testes Python/Node e workflow CI dedicado, sem credenciais ou execução de nuvem.

Aplicações CCI/CFI e jobs de produção: **não implantados**. Destinos/agendas
inspecionados permaneceram iguais. Configuração de acesso UniFi aplicada em
22/10/2026, conforme registro abaixo.

## Testes executados

- 34 testes Python: ambos os destinos, backlog, duplicatas, recuperação, lease,
  backoff, origem alterada, corrupção, extras, conflitos preservados, caminhos,
  SMB cifrado/timeout, manifesto, prova forjada/replay e restauração isolada.
- Teste sintético de 96 MiB: pico de alocações Python abaixo de 16 MiB. Mede o
  núcleo com disco de teste; não substitui medição de RSS do SDK SMB no Cloud Run.
- Node: testes existentes do Backup/Restore e notificações; novas suítes de prova,
  API de consulta, identidade da réplica, e-mail idempotente e renderização dos estados.
- `npm run check:ci`: 285 passaram, 2 pulados por falta de evidência local, zero
  falhas na rodada inicial. Novas suítes adicionadas depois executadas separadamente.
- Go: parsing restritivo e transferência sintética com dois peers WireGuard reais
  em userspace, com detector de races. Compilação cruzada Linux/amd64.
- `git diff --check`: aprovado.

Os testes de adaptadores usam doubles dos SDKs; os testes de transação não substituem
ensaio concorrente contra Firestore. Não houve teste contra servidor SMB real.

## Pendências concretas antes da ativação

1. Criar cliente WireGuard dedicado no servidor UniFi existente, exportar perfil
   para Secret Manager e restringir o IP atribuído no UDM ao NAS TCP 445. Confirmar
   handshake e preflight no Cloud Run; não criar Cloud VPN, VPC ou VM para isso.
2. Provisionar conta de serviço de arquivos no UNAS com leitura, criação, escrita e
   rename apenas em `Backup_CCI`/`Backup_CFI`. A tela atual confirma administradores,
   não a permissão dessa conta. Não reutilizar automaticamente a senha rsync.
3. Criar banco Firestore de controle e IAM limitado; identidade exclusiva do
   replicador com leitura dos dois buckets, criação dos comprovantes e acesso à fila.
   Não conceder export/import ou escrita nos bancos de produção ao replicador.
4. Provisionar keyring HMAC e credenciais SMB no Secret Manager; registrar versão
   explícita para implantação e montar os arquivos no worker/backend necessário.
5. Homologar SMB3 cifrado, leitura/escrita/rename, queda/retomada, comportamento do
   NAS sob concorrência e ausência de sobrescrita real.

## Implantação e homologação (procedimento, não executado)

### Configuração

Valores necessários no worker:

| Variável | Uso |
|---|---|
| `UNAS_CONFIG_FILE` | JSON revisado a partir de `config.example.json`; `approved=true` somente após revisão de rede/destinos |
| `UNAS_WIREGUARD_PROFILE_FILE` | Perfil WireGuard dedicado exportado do UniFi, montado via Secret Manager |
| `UNAS_CREDENTIALS_FILE` | Secret JSON com `username`/`password` da conta SMB |
| `UNAS_RECEIPT_KEYS_FILE` | Secret JSON `{keyId: chave-base64}` |
| `UNAS_SIGNING_KEY_ID` | Versão ativa do keyring |
| `UNAS_QUEUE_PROJECT` | Projeto do banco de controle |
| `UNAS_QUEUE_DATABASE` | Banco dedicado, por exemplo `backup-control` |
| `UNAS_ENABLE_TRANSFERS` | `false` até homologação; `true` para transferência autorizada |
| `UNAS_ENABLE_NOTIFICATIONS` | `true` somente após backend aceitar a identidade/prova |
| `UNAS_WORK_SECONDS` | Orçamento interno, menor que timeout Cloud Run; dimensionar para backlog/11,19 GB |

Backend CCI: `UNAS_RECEIPT_KEYS_FILE`, `UNAS_SERVER`, `UNAS_QUEUE_PROJECT`,
`UNAS_QUEUE_DATABASE`, `UNAS_REPLICA_PRINCIPAL` (e-mail da identidade dedicada).
Dar ao backend consulta da fila e comprovantes, sem permissão SMB.

### Sequência

1. Revisar/mesclar PR, registrar SHA autorizado e exportar **somente configurações**
   dos jobs/schedulers para evidência de rollback. Não disparar jobs de exportação.
2. Construir imagem com `backup_unas/cloudbuild.yaml`, tag do SHA e implantação por
   digest. O build somente cria imagem; não executa backup ou transferência.
3. Preparar job de homologação sem Scheduler, com a mesma imagem, 2 GiB, credenciais
   montadas, perfil WireGuard e saída de Internet padrão. Começar com `--preflight`: confere direitos de
   listar/criar dentro de shares existentes sem criar arquivo/pasta de teste.
4. Executar `--discover-only`; conferir os 44 itens observados (o número pode crescer
   pelos agendamentos existentes). Nenhuma exportação nova é criada.
5. Para homologar um run existente: ativar transferência nesse job e passar
   `--app CFI --run 20261021T022039Z-2cb8f0b9`; depois CCI
   `--app CCI --run 20261021T020039Z-f5774da9`. Preservar dados de 05/10 na pasta errada.
   Conferir envelope, SHA-256, nomes, totais e relatório no backend.
6. No ensaio de restauração, usar identidade separada, bucket de teste privado
   preexistente (`UNAS_RESTORE_BUCKET`) e `UNAS_ENABLE_RESTORE_TEST=true`.
   Entrypoint: `python -m backup_unas.restore_test --app CFI --run <run> --execute-restore`.
   Repetir para CCI. O código relê NAS e verifica hashes antes de importar.
7. O ensaio cria dois bancos inéditos `restore-unas-ref-*` e `restore-unas-nas-*`:
   referência a partir da exportação original, e teste a partir dos bytes recuperados
   do NAS. Compara caminhos e valores tipados de todos os documentos/subcoleções,
   inclusive filhos de pais ausentes. 409 na criação aborta; não importa em banco já
   existente. Relatório privado `RESTORE_VERIFIED.json`; dados não vão para logs.
   Recursos de teste são preservados para revisão; limpeza futura exige autorização.
8. Após aprovação das provas, atualizar **somente a configuração do job**
   `cci-unas-replica` para a imagem/identidade/configuração aprovadas e remover os
   parâmetros legados de origem CFI/destino CCI. Scheduler permanece às 00h30.
   Uma janela de trabalho maior pode ser necessária (por exemplo 23h, timeout 24h)
   para releituras dos 11,19 GB. Validar duração/custos antes de escolher o valor.
9. Conferir que as agendas continuam exatamente: CCI 23h, CFI 23h20, réplica 00h30,
   CCI semanal domingo 02h30, todas `America/Sao_Paulo`. Acompanhar backlog até zero
   e comprovar cada run individualmente, não apenas a última execução.

### Rollback não destrutivo

- Desativar transferências pelo flag do worker, preservando horários, fila e arquivos.
- Reverter a imagem/configuração do backend se necessário. O backend antigo volta a
  exibir “Não confirmado”; isso não invalida nem apaga os comprovantes existentes.
- Não reativar automaticamente o replicador v1 com origem/destino incorretos.
- Preservar `.unas-part`, checkpoints, provas pendentes, originais e bancos de teste.
- Nunca marcar fila como verificada manualmente para contornar falha de validação.

## Situação individual

| Sistema | Implementação | Implantação | Gravação comprovada no destino correto | Restore da réplica |
|---|---|---|---|---|
| CCI | candidata, testes sintéticos aprovados | pendente | não; 22 runs sem comprovante | pendente |
| CFI | candidata, testes sintéticos aprovados | pendente | não; 22 runs sem comprovante, share vazio | pendente |

Não fechar #336 como resolvida até haver comprovantes válidos para todo o backlog
e homologação dos dois sistemas. Publicar código/PR não atende sozinho ao aceite.


## Etapa de rede aplicada em 22/10/2026

O administrador criou e aplicou o cliente `CCI-CFI-Backup` no servidor existente
`VPN-SP-EXTERNA.` e exportou seu perfil. Endereços atribuídos: `192.168.3.3/32`
e `fd9b:435:5d7d:bf20::3/128`. Endpoint do perfil: WAN1 UDP 51820.
O perfil contém credenciais e não integra o repositório.

Após autorização explícita do administrador, foram aplicadas e conferidas na
interface do UDM as seguintes regras exclusivas deste cliente:

| Regra | Origem | Destino | Ação / prioridade |
|---|---|---|---|
| CCI-CFI Backup - SMB UNAS | VPN, 192.168.3.3 | Internal, 10.0.0.215 TCP 445 | Allow / 10000 |
| CCI-CFI Backup - Block Internal | VPN, dois IPs do cliente | Internal, qualquer | Block / 10001 |
| CCI-CFI Backup - Block External | VPN, dois IPs do cliente | External, qualquer | Block / 10001 |
| CCI-CFI Backup - Block Gateway | VPN, dois IPs do cliente | Gateway, qualquer | Block / 10000 |
| CCI-CFI Backup - Block VPN | VPN, dois IPs do cliente | VPN, qualquer | Block / 10000 |
| CCI-CFI Backup - Block Hotspot | VPN, dois IPs do cliente | Hotspot, qualquer | Block / 10000 |
| CCI-CFI Backup - Block DMZ | VPN, dois IPs do cliente | DMZ, qualquer | Block / 10000 |
| CCI-CFI Backup - SMB UNAS (Return) | Internal, UNAS | VPN, 192.168.3.3 | Retorno automático / 30000 |

Os seis bloqueios abrangem IPv4 e IPv6, todos os protocolos, permanentemente.
A prioridade é por par de zonas: a exceção SMB precede o bloqueio interno.
As regras anteriores, demais clientes e o encaminhamento SSH legado não foram
alterados. O worker ignora DNS/rotas amplas do perfil e acessa o NAS por IPv4 fixo.

**Evidência de configuração, não de tráfego:** as oito regras apareceram salvas
na tabela. Ainda não houve handshake a partir do Cloud Run, teste de bloqueios,
preflight SMB, cópia real ou restauração isolada. Permanecem pendentes conta SMB
nas duas pastas, secrets/IAM/configuração do worker e homologação. Os números de
exportações da tabela anterior são o levantamento de 21/10, não uma recontagem.


## Teste real de conectividade em 22/10/2026

Execução isolada `cci-unas-network-probe-78trb`, projeto CFI, região
`southamerica-east1`, concluída com saída 0 e uma tarefa bem-sucedida.
A conexão saiu do Cloud Run, usou o perfil dedicado via Secret Manager e alcançou
`10.0.0.215:445` através do WireGuard do UDM. Resposta: `SMB 3.1.1` (`0x311`),
`supports_encryption=true`. Não houve autenticação de usuário SMB, sessão de
arquivos, leitura/escrita de backup, exportação Firestore ou restore.

O job `cci-unas-network-probe` não possui Scheduler: 1 tarefa, 1 CPU, 2 GiB,
timeout 120 s, zero retries e `UNAS_ENABLE_TRANSFERS=false`. Perfil na versão 1
do secret `cci-unas-wireguard-profile`, acessível pela identidade existente
`cfi-backup-automation`. Nenhum valor secreto foi incluído em código/logs.

Build inicial: `9c1a8bd3-253b-486c-a153-d34ec75724a3`, imagem digest
`sha256:f4f989c2318df8ec03ba5f6f719eabae1fff0cb526760e7a4c7aa625d239f35e`.
O comando do job de diagnóstico foi atualizado com o conteúdo corrigido de
`backup_unas/network_probe.py` via `python -c`. A imagem do worker de produção
não foi atualizada. Um segundo build de diagnóstico foi concluído, mas sua imagem
não foi promovida. Execuções anteriores falharam na interpretação da resposta SMB;
a correção usa `Connection.supports_encryption`, que considera os contextos SMB
3.1.1, em vez do flag legado. Teste de regressão adicionado; 35 testes Python passaram.

**Limite da evidência:** suporte a criptografia negociado não comprova sessão SMB
criptografada autenticada. As regras de bloqueio foram conferidas na configuração,
mas não houve ensaio negativo de tráfego para todos os destinos proibidos.
O próximo passo é validar a conta SMB e suas permissões, depois transferir uma
exportação existente e verificar os arquivos. Não existe ainda `UNAS_VERIFIED.json`
produzido por esta implementação nem homologação de restauração concluída.


## Teste SMB autenticado em 22/10/2026

O administrador optou expressamente por usar sua própria conta, sem criar uma
conta dedicada. A versão 1 de `cci-unas-smb-credentials` foi cadastrada pelo
administrador no Secret Manager; o valor não foi registrado no repositório.

Execução `cci-unas-network-probe-m68bm`: falha `LogonFailure` durante o login
SMB, antes de consultar permissões ou abrir arquivos. Zero arquivos escritos.
A identidade informada por e-mail não foi aceita com a credencial cadastrada.
Isso não determina isoladamente se o motivo é usuário, senha, conta bloqueada
ou configuração de acesso a arquivos; conferir as credenciais SMB no UniFi.
Não repetir tentativas sem corrigir/confirmar a configuração para evitar bloqueio.
O teste de rede anterior permanece válido. Nenhum backup/restore foi executado.

O probe autenticado (`backup_unas/smb_probe.py`) usa o mesmo adaptador SMB3 do
worker e `preflight(ensure_run=False)`, limitado a consultar shares existentes e
solicitar direitos de listar/criar sem criar arquivos ou diretórios.


Na inspeção posterior em People → conta Owner, a interface confirmou acesso Owner
às pastas `Backup_CCI`/`Backup_CFI`, porém `File Services & Time Machine Credentials`
estava desmarcado. Portanto, a credencial de arquivos da própria conta ainda precisa
ser habilitada/configurada pelo administrador. Nenhuma conta adicional foi criada
nem senha alterada. Habilitar SMB na conta e atualizar a versão do secret antes de
repetir o teste; o login por e-mail da conta UniFi não comprova credencial SMB ativa.

### Reteste SMB em 22/10/2026 às 10:11 UTC

A conta administrativa existente teve File Services & Time Machine Credentials
ativado pelo administrador. A interface confirma usuário local `Paulocpj`,
credenciais vinculadas ao acesso local do administrador e acesso Owner às duas
pastas. A versão 2 de `cci-unas-smb-credentials` foi montada no job de diagnóstico.
Validação sem revelar valores confirmou JSON válido, usuário correto, senha
não vazia, sem placeholder e sem espaços externos.

A execução `cci-unas-network-probe-fzmd8` retornou `LogonFailure` no login SMB
do CCI; CFI não foi tentado após essa falha. Zero arquivos escritos.
A ativação da opção na interface não comprova autenticação SMB. É necessário
conferir a senha de acesso local usada na versão 2; não presumir que seja a senha
da conta UniFi na nuvem. Transferência e restauração seguem bloqueadas por
autenticação, sem comprovante `UNAS_VERIFIED.json` emitido nesta homologação.

### Acesso autenticado confirmado em 22/10/2026

A versão 3 da credencial corrigiu a autenticação. A execução
`cci-unas-network-probe-sclrg` avançou para `share_permissions`, mas o SDK
levantou `UnsupportedOperation`: o preflight tentava envolver um handle de
diretório em um buffer de arquivo. A correção usa `buffering=0` para esse handle,
sem mudar direitos, criptografia ou destinos. Um teste com a classe de diretório
do SDK real cobre a regressão; os 36 testes Python passaram.

Reteste `cci-unas-network-probe-zx49c`: saída 0 e `share_access_confirmed` para
**Backup_CCI e Backup_CFI**, com autenticação, criptografia e assinatura exigidas.
O preflight abre as pastas existentes solicitando direitos de listar, adicionar
arquivo e adicionar subdiretório; nenhum arquivo ou diretório é criado.
A imagem anterior recebeu apenas a correção do diagnóstico via comando Python;
a futura imagem de produção deverá incluir o adaptador corrigido.

Credencial utilizada: conta administrativa local existente, conforme escolha
expressa do administrador. Não é necessária nova conta para esta homologação.
Esta evidência supera a pendência anterior de login, mas não comprova transferência,
rename, retomada, integridade ou restauração. Nenhum comprovante de backup
`UNAS_VERIFIED.json` foi emitido por esses testes. A fila persistente, configuração
HMAC e implantação completa continuam pendentes antes da transferência real.

### Início da homologação com exportações existentes — 22/10/2026

Com autorização expressa para transferir os backups em nuvem, foi criado o job
sem agendamento `cci-unas-homologacao`, com 1 CPU/2 GiB, uma tarefa, zero retries
automáticos, timeout 24h e orçamento interno 23h. A configuração padrão mantém
transferências e notificações desativadas; somente a execução selecionada recebe
`UNAS_ENABLE_TRANSFERS=true` e os argumentos de app/run.

Build `63050432-11a0-4c37-9ccd-4287f567a515` concluído; imagem SHA `e09e1c4`,
digest `sha256:b889aec3ab0b46950893cfda09405481f153532f3e3de9d05b44965fefceb5d5`.
Banco de controle `consultorfiscalapp/backup-control` criado em southamerica-east1,
com proteção contra exclusão. Identidade `cci-unas-replica` recebe leitura dos
dois buckets, criação somente de comprovantes, acesso condicionado ao banco de
controle e às quatro configurações/credenciais versionadas no Secret Manager.
Não recebe export/import nem escrita nos bancos de produção. A criação do banco
e a execução/tráfego usam serviços Google Cloud cobrados conforme consumo; não
foi contratado serviço adicional de VPN ou gateway.

Secrets montados: perfil WireGuard v1, credencial SMB v3, configuração v1 e
keyring HMAC v1 (key ID `unas-20261022`). Valores secretos não são registrados.
Descoberta `cci-unas-homologacao-x7g6z` terminou com saída 0 e enfileirou
46 exportações existentes, sem transferir arquivos. Os manifestos de CFI
`20261021T022039Z-2cb8f0b9` e CCI `20261021T020039Z-f5774da9` foram validados.
O replicador diário anterior e os horários existentes não foram alterados.

### Falhas encontradas no teste de gravação e progresso do diagnóstico

- `cci-unas-homologacao-9ptxn`: o SDK retorna `SMBOSError` com errno ENOENT/EEXIST,
  não as subclasses Python FileNotFoundError/FileExistsError. Adaptador corrigido
  com testes usando os status reais do SDK; erros de permissão continuam fatais.
- As tentativas seguintes com CFI 20/21/22 chegaram à criação de diretórios e
  parcial vazio, mas aguardaram resposta na primeira operação SMB write. Sessões
  interrompidas deixaram bloqueios `STATUS_SHARING_VIOLATION` nos parciais. Nenhum
  parcial foi apagado ou sobrescrito e nenhum desses runs recebeu comprovante.
- Encerramento corrigido para desconectar SMB antes de fechar WireGuard; transporte
  passou a enviar datagramas separadamente. Isso isoladamente não resolveu o write.
- `cci-unas-homologacao-ldpfl`, CFI `20261019T022016Z-9e4c2fb5`: diagnóstico limitado
  a um arquivo real da exportação, com leituras/escritas SMB de 512 bytes, copiou
  12.267 bytes e verificou SHA-256 na releitura. A execução encerrou deliberadamente
  com `DIAGNOSTIC_FIRST_FILE_VERIFIED`, mantendo o backup incompleto na fila. Isso
  comprova gravação de um arquivo, não integridade do backup completo.
- A dependência do tamanho dos pacotes motivou teste de MTU IPv4 interno 1100;
  não é ainda prova conclusiva da causa de rede. A alteração não afeta agendas,
  endereços, regras, autenticação ou criptografia.

Validação local nesta etapa: 38 testes Python e testes Go com detector de races
passaram. Os resultados reais completos ainda serão registrados após a cópia e
releitura de todos os arquivos de cada exportação.

### MTU ajustado: transferência normal avançando

Build `9c43f0a7-b1e9-45aa-a322-2e689f1c43d6`, SHA `db30083`, digest
`sha256:80adb0a20ba5a1ec2ed169ecd7a9dc3c49025dc1efe6d117941f5c5eca40cb73`.
Com MTU IPv4 1100, a execução `cci-unas-homologacao-9l277` retomou CFI
`20261019T022016Z-9e4c2fb5` com os blocos normais, sem o limite diagnóstico de
512 bytes. A primeira observação mostrou 21 arquivos/16.844.307 bytes já
conferidos por releitura. Isso confirma que a redução de MTU removeu o bloqueio
de escrita nessa execução; não identifica isoladamente qual equipamento do
caminho impõe o limite. Ainda aguarda conferência completa e recibo autenticado.

A execução CFI `cci-unas-homologacao-9l277` concluiu a fase de transferência dos
1.028 arquivos (1.661.587.797 bytes, incluindo manifesto e marcador) e entrou em
`verify`. Cada arquivo passou por CRC32C/generation na origem e releitura SHA-256.
O comprovante completo ainda depende da segunda leitura e inventário finais.

### CFI — gravação e integridade comprovadas em 22/10/2026

A execução `cci-unas-homologacao-9l277` terminou com saída 0, succeededCount 1,
às 11:12:46 UTC. O run `20261019T022016Z-9e4c2fb5` está em
`\\10.0.0.215\Backup_CFI\20261019T022016Z-9e4c2fb5`.

- 1.028 arquivos; 1.661.587.797 bytes totais. Dados exportados Firestore:
  1.026 objetos e 1.661.286.223 bytes; manifesto/marcador completam o total.
- CRC32C/generation na origem, SHA-256 por arquivo, releituras no NAS e inventário
  completo passaram. Recibo autenticado gravado e relido no NAS, depois publicado
  no bucket original. Estado da fila: `verified`, data 11:12:41 UTC.
- Verificação separada confirmou HMAC, manifesto/geração, marcador, destino, run,
  quantidade, nomes únicos e total. SHA-256 do envelope:
  `390b3aed9696cdc3aa9b0ee9ceadc490d0d320b1a732615826a225cc8e19a1b1`.
- Evidência resumida: `docs/evidence/unas-336/cfi-20261019-verification.json`.
- Nas 22 amostras coletadas durante a execução, a maior média de utilização de
  memória foi 7,1146% de 2 GiB (~146 MiB); não equivale a pico instantâneo.
- `restoreTested=false`: esta prova NÃO atesta restauração do banco.

CCI `20261021T020039Z-f5774da9` foi iniciado na execução
`cci-unas-homologacao-b7r8k`, usando a mesma imagem por digest e o destino
`Backup_CCI`. Seu resultado ainda depende da verificação completa.
O job de homologação permanece sem Scheduler e com transferências desativadas
na configuração padrão; cada teste recebe ativação apenas na execução.
