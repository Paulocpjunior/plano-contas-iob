# Issue #336 — replicação verificável de CCI e CFI

## Estado da entrega

**Arquitetura revisada em 21/10/2026:** cliente WireGuard sem privilégios dentro
do job Cloud Run, conectado ao servidor WireGuard já existente no UDM Pro. Usa SMB3
nativo do UNAS, sem contratar Cloud VPN, VM, gateway ou licença adicional.
O uso dos serviços Google Cloud existentes continua sujeito à cobrança de execução,
armazenamento e tráfego. A conexão real ainda não foi homologada.

Implementação candidata para revisão. **Não implantada e não homologada no UNAS.**
Nenhum export, transferência de dados reais, restauração, alteração de agenda ou
mudança de permissão foi executado nesta entrega. Testes usam dados sintéticos.

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
