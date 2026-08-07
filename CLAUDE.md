# Consultor Contábil (plano-contas-iob) — SP Assessoria Contábil

Memória de trabalho para sessões do Claude neste repositório. Atualize ao
assumir compromissos com o Paulo (admin/dono) — é daqui que a próxima sessão
retoma. Criado em 07/08/2026, quando o projeto passou do CODEX para o Claude
(Paulo: *"o CODEX estava tocando este projeto, você consegue administrar? para
que não fique mais confuso?"*).

## O que é este app

Contábil: conciliação bancária, plano de contas, ECD/ECF, e o módulo
**EFD-Reinf**. É irmão do **CFI** (`consultor-fiscal-inteligente`), que é o
fiscal.

**IRMÃOS, MAS NÃO GÊMEOS: os dois NÃO compartilham banco nem login.** Este
arquivo dizia que sim quando nasceu (herdado do mapa do CODEX) — está errado:

```
aqui:  admin.initializeApp({ projectId: 'projetos-app-sp' })   ← fixo
CFI:   applicationDefault()                 →  consultorfiscalapp
```

São dois projetos GCP, com dois Firebase Auth e dois Firestore. Usuário e role
daqui NÃO valem lá (isso vale pro app da **Legalização**, que é outro caso).
Integração entre eles é por ROTA, com o token de um sendo aceito pelo outro —
ver "Ligação com o CFI".

- Node + Express monolítico, **CommonJS** (`require`, `module.exports`).
- **Sem build de frontend**: o Express serve `index.html` (~920 KB, SPA em JS
  inline) direto. Não existe React/Vite aqui.
- Cloud Run `plano-contas-iob`, região `us-west1`, projeto `projetos-app-sp`.
  URL: https://plano-contas-iob-q4woqnee3a-uw.a.run.app

## Regras permanentes de operação

- **Nunca commitar direto na main.** Trabalho vai em branch → PR →
  squash-merge. `deploy-app.yml` publica sozinho no merge.
- 🚨 **O REPO TINHA DUAS LINHAS, e a `main` NÃO era a que estava no ar**
  (descoberto 07/08, e unificado no mesmo dia). O produto real vivia em
  `codex/import-quality-v3241` — 27 commits à frente, versão **3.4.81**,
  publicada À MÃO (a branch nem tinha `.github/`) — enquanto a `main` tinha
  só a limpeza de CI e o trabalho do REINF, com o `index.html` **parado no
  824a39b**. Sintoma que denunciou: o Paulo mandou print de uma tela (abas
  "Retenções Previdenciárias R-2000/R-3000" e "Rendimentos Pagos R-4000",
  selos "A homologar") que **não existia em lugar nenhum do repositório**.
  A ARMADILHA QUE ISSO CRIOU, e que quase disparou: bastava o `GCP_SA_KEY`
  ser cadastrado pra que o primeiro deploy da `main` publicasse o app VELHO
  por cima do que a equipe usa — regressão de 27 commits, sem ninguém ter
  pedido nada. **REGRA QUE FICA**: antes de mexer neste repo, conferir se a
  `main` é mesmo o que está no ar (`version.json` × o rodapé do app). Repo
  que não é a fonte do que roda não é repo, é backup desatualizado.
- 🚨 **FALTA o secret `GCP_SA_KEY`** — as runs 2, 3 e 4 do `deploy-app.yml`
  falharam TODAS em "Falta o secret". **SÓ O PAULO RESOLVE**: Settings →
  Secrets and variables → Actions → New repository secret, nome `GCP_SA_KEY`,
  valor = JSON da service account de deploy (roles `run.admin`,
  `iam.serviceAccountUser`, `cloudbuild.builds.editor`,
  `artifactregistry.writer`) — a mesma que o CFI já usa serve. Merge verde
  aqui NÃO é app atualizado: antes de dizer que uma feature "está no ar",
  CONFERIR a run.
- **Trabalho novo sai da `main`, não de branch paralela.** Foi a branch
  paralela de longa vida que produziu as duas linhas: as duas ficaram certas
  cada uma do seu lado e erradas juntas. O `check-ci` só descobriu na
  unificação que três testes do outro lado nem eram reconhecidos como
  "pulado por falta de evidência" — ninguém tinha rodado o gate de um lado
  no código do outro.
- **O deploy só roteia tráfego depois do health da CANDIDATA.** Sobe com
  `--no-traffic --tag candidate`, confere `GET /api/health` (que toca o
  Firestore de propósito — pega revisão que sobe mas não fala com o banco) e só
  então roteia PELO NOME da revisão validada. Candidata que falha no health
  nunca recebe tráfego.
- **Porta de qualidade**: `npm run check:ci` no CI (roda todos os
  `scripts/test-*.js` e classifica ✓ passou / ⊘ pulado sem evidência / ✗
  falhou) e `npm run check` na máquina com as evidências. **FAROL HONESTO: o
  resumo sempre diz quantos PULARAM** — cobertura parcial não pode parecer
  verde. Teste de parser só vale na máquina com o arquivo real.
- **Não há framework de teste.** Teste é `scripts/test-*.js` com
  `require('assert')`. Módulo novo = teste novo registrado em TRÊS lugares do
  `package.json` no MESMO PR: `test:<nome>`, a lista do `node --check` e o
  encadeamento do `check`.
- **Auditoria de dependência bloqueia só PRODUÇÃO** (`npm audit --omit=dev`);
  advisory de dev vai pro resumo do job. Escape hatch `[skip-audit]` no
  ASSUNTO do commit. Robô diário `audit-deps.yml` abre PR já testado.
- Mensagens de erro para o usuário: em português, com a **AÇÃO** prática.
  Módulos de lógica: puros e testados; rotas = I/O.

## Regras de conteúdo fiscal (valem aqui como valem no CFI)

- **ALERTA, NUNCA CONTORNO** (Paulo, 06/08): cadastro errado ou faltando
  acende alerta e diz ONDE arrumar. Não se constrói auto-preenchimento nem
  dedução "esperta" — isso esconde o buraco.
- **AUSENTE ≠ ZERO.** Campo de valor não recebe default. Zero só entra quando
  zero É a resposta.
- **LEIAUTE NÃO SE CHUTA.** Estrutura de arquivo fiscal (XSD do REINF, leiaute
  do SPED) só entra com o schema conferido ou um arquivo real de espelho.
  Leiaute deduzido passa no teste unitário e é recusado na transmissão — ou,
  pior, aceito errado.
- **FAROL HONESTO**: zero nunca é sucesso; lista cortada diz "mostrando X de
  N"; ausência de sinal nunca vira prontidão.

## EFD-Reinf — estado (07/08/2026)

Roadmap vivo em `docs/reinf-mapa-efiscal.md` — **atualizar no mesmo PR** de
toda entrega que fechar ou abrir lacuna.

**PRONTO — vertical de pessoa física, ponta a ponta:** R-1000 + R-4010 +
R-4099, com assinatura A1 (XMLDSig, `reinf/assinador.js`), lote assíncrono
mTLS (`reinf/transmissor.js`), certificado do Secret Manager
(`reinf/cert-loader.js`), recibos, retificação e acúmulo de IRRF quando fica
abaixo do DARF mínimo. O encanamento é **agnóstico de evento** e serve pra
qualquer R-xxxx.

**PRONTO 07/08 — as duas peças de PJ que faltavam:**
- `reinf/natureza-rendimento.js` — Tabela 01 do Anexo I, **51 naturezas da
  série 15xxx** (PJ), com código de receita por tributo (IR → 1708 e outros;
  **AGREGADO → 5952**, a CSRF: CSLL+PIS+Cofins juntos, 4,65%) e correlação com
  a LC 116/2003. Origem carimbada (tabela IOB de 07/08/2026).
  **A TABELA SUGERE, NUNCA DECIDE** — a ressalva é do próprio documento de
  origem: não existe correlação OFICIAL entre a LC 116 e a natureza, o
  enquadramento é interpretativo. Item com mais de um candidato devolve TODOS e
  marca `ambigua`. Código fora da tabela é RECUSADO.
- `reinf/retencao-pj-apuracao.js` — o CONTEÚDO do R-4020, por beneficiário.

**A CSLL do portal de SP** (achado 07/08, com o print do IOB como verdade): o
export de NFS-e **não traz a CSLL individual** — o campo rotulado "CSLL" é o
**TOTAL** das três contribuições (CLINIPAR, base 590,10: 27,44 = 3,84 + 17,70 +
5,90). Como PIS e COFINS vêm corretos, a CSLL sai por SUBTRAÇÃO — recuperação,
não chute. **A trava é por TRÊS lados**: só deriva com PIS em 0,65%, COFINS em
3,00% E o resultado em 1,00% da base. Falhou um, não deriva: vira pendência
apontando o XML da nota. Valor derivado sai CARIMBADO.

**A natureza vem da FONTE quando a fonte a traz**: alguns prestadores escrevem
o código na discriminação da nota (ELEVADORES ORION: "15044 - REMUNERAÇÃO DE
SERVIÇOS DE CONSERVAÇÃO"). Ler é recuperação — mas só vale se o código existir
na Tabela 01, e dois códigos no texto é AMBÍGUO, não "pega o primeiro".

**FALTA, na ordem:**
1. **XML do R-4020** — BLOQUEADO de propósito: o leiaute não foi conferido
   contra o XSD (a doc oficial é bloqueada pela rede do ambiente). Destrava com
   o XSD v2.1.2 do portal do SPED **ou** com um XML de R-4020 que o IOB já
   tenha gerado — este vale mais, é arquivo que a Receita aceitou. Com ele, o
   gerador é casca fina sobre o payload já validado.
2. R-2010/R-2020 (INSS de serviços) · R-2055 (FUNRURAL sub-rogado — o CFI já
   calcula na aba 🌾) · R-2050 · R-1070 · R-4040/R-4080 (raros).

**Fluxo real da colaboradora** (a referência do que o módulo tem que cobrir):
importa as notas → informa retenção e natureza do rendimento → gera o módulo
REINF → transmite → **faz o encerramento no e-CAC**. O encerramento é humano e
continua sendo — como o PVA no SPED.

## Ligação com o CFI — as notas do R-4020 já chegam prontas (07/08)

**OS DOIS APPS NÃO COMPARTILHAM FIRESTORE.** O mapa deste repo dizia que sim, e
isso estava errado — são dois projetos GCP: aqui `projetos-app-sp` (fixo no
`server.js`), lá `consultorfiscalapp` (`applicationDefault()`). Quem escrevesse
código acreditando no compartilhamento descobriria na primeira leitura de
coleção. A integração é por **rota**.

| ponta | onde |
| --- | --- |
| expõe | CFI · `GET /api/admin/reinf/retencoes-pj?cnpj=&competencia=` |
| consome | `reinf/cfi-notas-client.js` → `apurarRetencoesPJ` |
| rota daqui | `GET /api/reinf/retencoes-pj/:cnpj/:competencia` |

**A normalização mora LÁ, de propósito**: a NFS-e do portal de SP é gravada
ACHATADA (`valorIss`, `pisRetido`) e a do XML em OBJETO (`valores.*`) — reler
isso daqui seria manter duas leituras da mesma coisa, que divergem sem ninguém
perceber (já mordeu seis vezes no CFI). O contrato casa campo a campo com o que
`apurarRetencoesPJ` espera, inclusive o `csllOuTotal`: nome feio de propósito,
é ele que impede o total da CSRF de ser declarado como CSLL.

**Erro do outro lado NUNCA vira lista vazia** — vazio seria lido como "não teve
retenção no mês", e a obrigação sumiria sem ninguém decidir. 403 diz que falta
e-mail verificado; 404 diz que o CNPJ não tem cadastro no CFI; rede fora estoura
com a causa. As ressalvas do CFI viajam junto em `ressalvasDaFonte`.

**Env obrigatória**: `CFI_URL` (ou `FISCAL_GATEWAY_URL`) com a URL do Cloud Run
do CFI. Sem ela a mensagem diz QUAL variável falta, não "fetch failed".

**Auth**: o Bearer do usuário logado aqui abre a porta lá (`crossProjectAuth`,
lista de projetos EXPLÍCITA por rota no CFI — pôr projeto na lista global
abriria de lambuja o `/api/dp-integration/*`, que entrega dado SERPRO). Exige
e-mail do domínio do escritório e **verificado**.

O **R-2055** (FUNRURAL sub-rogado) segue o mesmo desenho quando entrar: a fonte
é a aba 🌾 do CFI, que já calcula com vigência de alíquota. **Nunca redigitar.**

DIRF está EXTINTA (substituída pela série R-4000) — resíduo de fluxo DIRF no
escritório morre quando o R-4020 entrar.
