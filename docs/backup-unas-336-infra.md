# Preparação de infraestrutura — 21/10/2026

Continuação autorizada pelo usuário após o PR #338. Este registro complementa o
diagnóstico inicial; **não comprova túnel conectado, transferência ou restauração**.

## Recursos criados e consultados no Google Cloud

Projeto `consultorfiscalapp`, região `southamerica-east1`:

| Recurso | Configuração |
|---|---|
| VPC `unas-backup-private` | custom, regional, MTU 1460; exclusiva, não conectada aos serviços existentes |
| Sub-rede `unas-backup-run` | `10.203.240.0/26`, Private Google Access habilitado |
| `unas-backup-allow-smb` | egress prioridade 1000, somente TCP 445 para `10.0.0.215/32` |
| `unas-backup-deny-other-egress` | egress prioridade 2000, demais destinos/protocolos bloqueados |
| IP `unas-backup-vpn-ip` | `34.95.214.115`, Premium, reservado |
| Classic VPN `unas-backup-vpn` | gateway na VPC exclusiva, ainda sem túnel |
| Forwarding `unas-backup-vpn-esp`, `-ike`, `-natt` | ESP, UDP 500, UDP 4500 para o gateway |
| Secret `unas-backup-vpn-psk` | recipiente criado, **sem versão/valor**; réplica regional São Paulo |

Não há peering com a VPC default nem rota à rede local criada. A negação implícita
de ingress permanece. O futuro Cloud Run deve usar Direct VPC egress com
`private-ranges-only`: o firewall da VPC limita o tráfego privado; chamadas públicas
às APIs Google e notificações seguem a saída gerenciada do Cloud Run. Não usar
`all-traffic` com essas regras sem reavaliar o acesso às APIs.

## UniFi: formulário preparado, não salvo

A consulta autenticada mostrou LAN `10.0.0.0/23`, WAN1 PPPoE e WAN3 “Fiber VIVO”
com configuração **Static**, IP `177.43.195.55`, gateway `177.43.195.54`.
O administrador confirmou nesta conversa que **os dois links têm IP fixo**.
Não foram alteradas configurações das WANs ou a prioridade de failover.

Formulário Site-to-Site VPN:

- Nome `GCP-UNAS-CCI-CFI`; IPsec route-based pela WAN3.
- IP remoto `34.95.214.115`; subnet remota `10.203.240.0/26`.
- IKEv2, IKE AES-256/SHA256/DH14, lifetime 28800.
- ESP AES-256/SHA256/DH14, lifetime 3600, PFS habilitado.
- IDs de autenticação automáticos; Tunnel IP desabilitado; MTU/MSS automáticos.
- Chave não lida nem inserida pelo agente; criação não submetida.

## Próximo passo necessário

O administrador insere/guarda uma chave aleatória forte no UniFi e adiciona o mesmo
valor como versão do secret `unas-backup-vpn-psk` no Secret Manager. Não enviar
credencial pelo chat, issue ou PR. O administrador faz a submissão do formulário
que contém a nova credencial, conforme a política da ferramenta de controle de UI.

Somente depois: criar túnel GCP usando a versão do secret sem imprimir o valor,
IKEv2, peer `177.43.195.55`, selectors route-based `0.0.0.0/0`; criar apenas rota
`10.0.0.215/32` para o túnel; verificar estado ESTABLISHED e conectividade por job
de preflight na nuvem. Não executar teste SMB a partir de computador local.

A conta SMB, o banco de controle, a implantação do worker/backend, a homologação
com exports existentes e a restauração isolada continuam pendentes. Nenhum
Scheduler ou job existente foi atualizado/executado nesta preparação.

## Custos estimados e disponibilidade

Referência pública consultada em 21/10/2026: túnel São Paulo US$0,075/h, ou US$54
em 720h; saída para América do Sul US$0,19/GiB na primeira faixa. Com os últimos
tamanhos de CCI+CFI repetidos durante 30 dias, cerca de 360 GiB/mês e US$68 de
saída, além de overhead, retomadas, backlog, Cloud Run, GCS, Firestore, segredos,
restaurações e impostos. Não é teto de gastos nem orçamento fechado.

O IP reservado sem túnel pode gerar cobrança enquanto aguardamos a chave
(a página oficial de VPN exemplifica US$0,015/h para IP ocioso em São Paulo).
A cobrança do túnel ainda não começou porque o recurso de túnel não existe.

Um túnel pelo link estático não garante redundância de operadora. Queda da WAN3
interrompe transferências e a fila as conserva para retomada. Uma eventual segunda
conexão pode usar a WAN1 fixa, após validação de roteamento e custo adicional.

Fontes: [Cloud VPN](https://cloud.google.com/network-connectivity/pricing),
[egress](https://cloud.google.com/vpc/network-pricing),
[Classic VPN estática](https://docs.cloud.google.com/network-connectivity/docs/vpn/how-to/creating-static-vpns).
