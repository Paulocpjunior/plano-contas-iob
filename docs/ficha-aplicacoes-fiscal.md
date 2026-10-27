# Ficha de aplicações financeiras para o Fiscal (3.4.457 / 3.4.458)

Onde: EFD-Reinf / Informes → Aplicações financeiras → **Ficha para o fiscal**.
O contábil preenche as aplicações do mês, o CCI gera o PDF e guarda o comprovante
(versões `AAAAMM-vN` em `empresas/{cnpj}/fichas_aplicacoes_fiscal`). Em seguida,
salva o PDF na pasta do SharePoint do Contábil e publica o cartão no canal Teams
do Fiscal, com o botão **Abrir PDF da ficha** e @menção das pessoas cadastradas.

## Configuração (admin, uma vez) — botão Configurar canal dentro da ficha

1. **Canal do Teams:** no canal → ⋯ → Workflows → "Postar em um canal quando uma
   solicitação de webhook for recebida". Cole o endereço HTTPS do gatilho, que vai
   para o Secret Manager (`cci-notificacoes-teams`).
2. **Pasta do SharePoint:** cole o endereço da pasta como aparece no navegador. O CCI
   resolve a pasta pelo Graph (`/shares/u!…/driveItem`) e guarda drive e item.
3. **Alertas:** uma pessoa por linha, `Nome <email@spassessoriacontabil.com.br>`. O
   e-mail é o login Microsoft 365, que o Teams usa na @menção.

## Permissão do app no SharePoint (pré-requisito do item 2)

O CCI grava com o app do Graph de e-mail (`GRAPH_CLIENT_ID` 59fd4ec9-…, ver
`docs/email-graph-cci.md`), que só tinha `Mail.Send`. Libere a escrita **apenas no
site do Contábil**:

1. Entra ID → Registros de aplicativo → app 59fd4ec9-… → Permissões de API →
   Microsoft Graph → Permissão de aplicativo **Sites.Selected** → conceder
   consentimento do administrador.
2. Dar escrita no site (administrador do SharePoint), por exemplo com PnP PowerShell:

```powershell
Connect-PnPOnline -Url https://<tenant>.sharepoint.com/sites/<SiteDoContabil> -Interactive
Grant-PnPAzureADAppSitePermission -AppId 59fd4ec9-37bd-472c-9fa7-373461dffd50 -DisplayName "CCI Fichas" -Site https://<tenant>.sharepoint.com/sites/<SiteDoContabil> -Permissions Write
```

Sem a permissão, a configuração da pasta e a gravação devolvem a mensagem
"O app do CCI não tem permissão de escrita… Sites.Selected". A ficha continua indo
ao Teams, sem o botão e com o PDF no corpo (`arquivo.conteudo_base64`). Depois de
liberar, o botão **Tentar de novo** no histórico grava o PDF da ficha.

## Regras de reenvio

- SharePoint: repetir é seguro, porque o mesmo nome substitui o mesmo arquivo.
- Teams: só se repete `recusado` ou `sem_canal`. `incerto` pode já estar no canal.
- Teams não aceita anexo de arquivo em mensagem de webhook. O "anexo" é o link do
  SharePoint no cartão, e quem abre precisa de acesso à pasta.
