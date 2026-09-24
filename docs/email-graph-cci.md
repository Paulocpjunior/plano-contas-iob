# E-mail do CCI pelo Microsoft Graph — configuração (24/09/2026)

O CCI envia e-mail pelo **mesmo app do Azure** que o CFI usa para e-mail:
**"Consultor Fiscal Inteligente - Notificacoes"** (`59fd4ec9-…`), com `Mail.Send`
de aplicação no tenant. O segredo desse app mora no Secret Manager do projeto
`consultorfiscalapp`, em **`graph-notificacoes-secret`** (o `graph-client-secret`
é do proxy do SharePoint, outro app — não serve).

## Variáveis que o serviço `plano-contas-iob` lê

| Variável | Valor | Origem |
|---|---|---|
| `GRAPH_CLIENT_ID` | `59fd4ec9-37bd-472c-9fa7-373461dffd50` | igual ao CFI |
| `GRAPH_TENANT_ID` | o mesmo do `consultor-fiscal-inteligente` | `gcloud run services describe consultor-fiscal-inteligente --region us-west1 --project consultorfiscalapp --format=yaml \| grep -A1 GRAPH_TENANT_ID` |
| `GRAPH_CLIENT_SECRET` | segredo (Secret Manager) | `graph-notificacoes-secret` |
| `GRAPH_REMETENTE` | caixa institucional (fallback) | ex.: `junior@spassessoriacontabil.com.br` |
| `GRAPH_DOMINIOS_REMETENTE` | opcional, domínios extras aceitos como remetente | vazio = só `spassessoriacontabil.com.br` |

O remetente real de cada envio é o **colaborador logado** (`graph-remetente.js`);
`GRAPH_REMETENTE` só entra quando a sessão não tem caixa do escritório ou a
caixa do colaborador não existe no 365 (e a resposta diz isso).

## ⚠️ O Cloud Run do CCI é OUTRO projeto

O serviço roda em `gen-lang-client-0569062468`; o segredo está em
`consultorfiscalapp`. Duas saídas — escolha UMA:

### A) Referenciar o segredo do outro projeto (uma fonte só, igual ao CFI)

```bash
gcloud config set project gen-lang-client-0569062468
SA=$(gcloud run services describe plano-contas-iob --region us-west1 --format='value(spec.template.spec.serviceAccountName)')
[ -z "$SA" ] && SA="$(gcloud projects describe gen-lang-client-0569062468 --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
echo "conta de serviço do CCI: $SA"

gcloud secrets add-iam-policy-binding graph-notificacoes-secret \
  --project consultorfiscalapp \
  --member "serviceAccount:$SA" \
  --role roles/secretmanager.secretAccessor

gcloud run services update plano-contas-iob --region us-west1 \
  --update-env-vars GRAPH_CLIENT_ID=59fd4ec9-37bd-472c-9fa7-373461dffd50,GRAPH_TENANT_ID=<TENANT>,GRAPH_REMETENTE=junior@spassessoriacontabil.com.br \
  --update-secrets GRAPH_CLIENT_SECRET=projects/consultorfiscalapp/secrets/graph-notificacoes-secret:latest
```

### B) Copiar o segredo para o projeto do CCI

```bash
gcloud secrets create graph-notificacoes-secret --project gen-lang-client-0569062468 --replication-policy automatic 2>/dev/null || true
gcloud secrets versions access latest --secret graph-notificacoes-secret --project consultorfiscalapp \
  | gcloud secrets versions add graph-notificacoes-secret --project gen-lang-client-0569062468 --data-file=-

gcloud config set project gen-lang-client-0569062468
gcloud run services update plano-contas-iob --region us-west1 \
  --update-env-vars GRAPH_CLIENT_ID=59fd4ec9-37bd-472c-9fa7-373461dffd50,GRAPH_TENANT_ID=<TENANT>,GRAPH_REMETENTE=junior@spassessoriacontabil.com.br \
  --update-secrets GRAPH_CLIENT_SECRET=graph-notificacoes-secret:latest
```

Na opção B, quando o segredo girar no CFI, é preciso repetir a cópia aqui.

**Nunca `--set-env-vars` / `--set-secrets`** — apaga as outras variáveis.
`--update-*` já cria uma revisão nova; o `deploy-app.yml` usa `--update-env-vars`
e não toca nas variáveis do Graph.

## Conferir

1. Admin → Resumo → **✉️ E-mail do escritório → Testar credencial do e-mail**
   (sonda o token; diz a FORMA do segredo se estiver errado: 36 caracteres = Secret ID).
2. **Enviar e-mail de prova para mim**: chega na sua caixa, saindo da sua caixa,
   com logo, faixa azul e rodapé "Departamento Contábil".
3. Se a credencial for recusada, todo mundo vê a faixa vermelha ao abrir o app
   (`GET /api/email/vigia`, sondagem a cada 24 h; veredito em `health_alertas/graph-email`).
