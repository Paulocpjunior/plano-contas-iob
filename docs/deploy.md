# Deploy do Consultor Contábil

Antes (até 03/08/2026) o deploy era manual: alguém rodava `gcloud run deploy`
na própria máquina. O efeito prático foi o app passar **13 dias sem
atualização** enquanto o CFI publicava todo dia — não por falta de código, mas
por falta de gatilho.

Agora: **merge na `main` publica sozinho**, com rede de segurança.

## O que acontece a cada merge

1. `npm ci`
2. **Auditoria** — bloqueia se houver advisory *high/critical* no que vai
   dentro da imagem (`npm audit --omit=dev`). Advisory de dependência de
   **desenvolvimento** não bloqueia: vai para o resumo do job e é resolvido
   pelo robô diário.
3. **Porta de qualidade** — `npm run check:ci`
4. **Deploy sem tráfego** — a revisão nova sobe com `--tag candidate` e
   **0% do tráfego**
5. **Health check da candidata** — `GET /api/health` (é público e lê o
   Firestore, então pega revisão que sobe mas não fala com o banco)
6. **Rotear 100%** para a revisão que passou, pelo nome dela
7. **Health final** em produção

Se a candidata não passar no health, **o tráfego nunca é roteado** e a revisão
antiga continua servindo. Ninguém vê erro.

## Configuração (uma vez)

**Secret obrigatório** — Settings → Secrets and variables → Actions:

| Nome | Valor |
|---|---|
| `GCP_SA_KEY` | JSON da service account com permissão de deploy |

Papéis necessários na service account: `run.admin`,
`iam.serviceAccountUser`, `cloudbuild.builds.editor`, `artifactregistry.writer`.

**Variables (opcionais)** — só se algum dia mudar de serviço/região/projeto.
Os defaults foram tirados do próprio repositório:

| Variable | Default | De onde veio |
|---|---|---|
| `CLOUD_RUN_SERVICE` | `plano-contas-iob` | `seed-historicos.sh` |
| `CLOUD_RUN_REGION` | `us-west1` | sufixo `-uw` da URL do serviço |
| `GCP_PROJECT_ID` | `gen-lang-client-0569062468` | projeto onde o Cloud Run está publicado |
| `CCI_DATA_PROJECT_ID` | `gen-lang-client-0569062468` | Firestore `(default)` que contém os dados do CCI |
| `CCI_AUTH_PROJECT_ID` | `projetos-app-sp` | Firebase Authentication dos colaboradores |
| `CCI_BACKUP_PROJECT_ID` | `gen-lang-client-0569062468` | projeto que contém as exportações Firestore |
| `CCI_BACKUP_BUCKET` | `cci-firestore-backups-292090471177` | bucket oficial de backup na mesma região dos dados |

Esses destinos são intencionalmente distintos. Alterar uma variável não é uma
migração: exige plano próprio, cópia validada e janela aprovada. O health check
publica apenas os quatro project IDs não sensíveis e o pipeline recusa uma
revisão cuja topologia divergir da configuração oficial.

Sem o `GCP_SA_KEY`, o workflow **falha no primeiro passo** com essas
instruções — de propósito, para não estourar no meio do deploy.

## As duas portas de qualidade

| Comando | Onde | O que faz |
|---|---|---|
| `npm run check` | máquina com as evidências | porta COMPLETA: todos os testes, inclusive os que abrem os PDFs/planilhas reais |
| `npm run check:ci` | qualquer máquina (é o do CI) | sintaxe, rotas duplicadas e todos os testes que **não** dependem de arquivo externo |

Boa parte dos testes de parser abre arquivos em
`/Users/.../Downloads/...` — evidências reais que só existem na máquina de quem
as gravou. No CI eles falhariam por falta do arquivo, não por defeito. O
`check:ci` roda o que é portátil e **declara quantos pulou**:

```
22 passaram · 11 pulados (sem evidência local) · 0 falharam
⚠ Cobertura PARCIAL: os pulados só rodam na máquina com os arquivos de evidência.
```

Cobertura parcial nunca é apresentada como "tudo verde". **Mudou parser? rode
`npm run check` na máquina com as evidências antes de confiar.**

## Robô diário de dependências

`.github/workflows/audit-deps.yml` roda todo dia útil às 9h UTC (6h BRT):
`npm audit fix` (sem `--force` — major é decisão humana), valida com
`npm run check:ci` e só então abre um PR **já testado**. Sem correção
possível, abre uma issue avisando **antes** de virar bloqueio de deploy.

## Duas decisões de dependência que vale conhecer

- **xlsx (SheetJS)**: o pacote `xlsx` no npm parou em 0.18.5 e carrega duas
  falhas *high* sem correção publicada lá. O projeto passou a usar o mirror
  mantido: `"xlsx": "npm:@e965/xlsx@^0.20.3"` — mesmo import, versão corrigida.
  É a mesma solução já adotada no CFI.
- **`overrides` sempre em faixa** (`^x.y.z`), nunca versão exata: pino exato
  cria teto e impede o `npm audit fix` de resolver sozinho quando o próprio
  pinado ganha advisory.
