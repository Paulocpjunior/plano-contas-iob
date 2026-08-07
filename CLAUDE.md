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
- **O SECRET `GCP_SA_KEY` PRECISA SER O JSON, NUNCA O P12** (07/08): as duas
  opções ficam LADO A LADO no mesmo diálogo do Google Cloud, e o P12 é binário.
  Com o P12 colado, o deploy rodava `npm ci`, auditoria e os 40 testes — quase
  um minuto — pra só então morrer no passo de autenticação com
  `unexpected token '\uFFFD' ... is not valid JSON`, que é mensagem de
  biblioteca e não diz a ninguém o que fazer. O passo "Conferir configuração"
  passou a validar o FORMATO (`jq .type == "service_account"`, sem imprimir
  nada do conteúdo) e a nomear o erro. **O CAMINHO QUE NÃO ERRA** não passa por
  copiar e colar — é o copiar/colar que estraga:
  `gcloud iam service-accounts keys create ~/gcp-deploy.json --iam-account=<SA>
  --project=projetos-app-sp` e `gh secret set GCP_SA_KEY --repo <owner>/<repo>
  < ~/gcp-deploy.json`. **CHAVE NUNCA VAI PELO CHAT** — o `sefaz-cron-secret`
  já vazou 2× assim; chave de service account é a mesma coisa, com poder de
  deploy junto.
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

**O XML DO R-4020 DESTRAVOU** (07/08 — Paulo mandou um evento REAL que o IOB
transmitiu: `ID1546611450000002023110311392200004`, perApur 2023-10, tpAmb 1 =
PRODUÇÃO). `reinf/gerar-r4020.js` reproduz aquele arquivo caractere a caractere.
**O que o arquivo provou e a analogia com o R-4010 teria errado**: o evento é
`evtRetPJ` no namespace `evt4020PagtoBeneficiarioPJ`; o beneficiário é
`cnpjBenef`; o valor é **`vlrBruto`** (o PF usa `vlrRendBruto` — copiar o nome
passa em qualquer teste nosso e é RECUSADO na transmissão); `observ` fica em
`idePgto`, entre `natRend` e `infoPgto`; `indJud` fecha o `infoPgto`; e a
natureza do rendimento **não é só a faixa 15xxx** — o arquivo traz **17099**.
Confirmou o que o app já acertava: vírgula decimal, `ideContri/nrInsc` com a
RAIZ de 8 dígitos, e o `id` = ID+tpInsc+raiz(14)+AAAAMMDDHHMMSS+seq(5).
**O QUE CONTINUA BLOQUEADO, e por quê**: aquele evento tem bruto ZERADO e
NENHUM bloco de retenção — então onde entram IR/CSLL/PIS/COFINS não está
provado. Com retenção informada o gerador **recusa**
(`MOTIVO_RETENCAO_BLOQUEADA`), porque um R-4020 sem a retenção não é
incompleto: ele DECLARA que não houve retenção. **DESTRAVA COM**: um R-4020
exportado do IOB de competência que TEVE retenção (mesmo caminho de exportação)
ou o XSD v2_01_02.

**FALTA, na ordem:**
2. R-2010/R-2020 (INSS de serviços) · R-2055 (FUNRURAL sub-rogado — o CFI já
   calcula na aba 🌾) · R-2050 · R-1070 · R-4040/R-4080 (raros).

**R-2055 LIGADO PONTA A PONTA** (07/08) — é o primeiro evento previdenciário
com conteúdo real. Rota do CFI `/api/admin/reinf/aquisicao-rural` →
`reinf/cfi-notas-client.js` (o cliente virou GENÉRICO: `buscarNoCfi(recurso)`,
com os dois wrappers finos; o tratamento de erro é a parte que vale e duplicá-lo
é como duas leituras divergem) → `reinf/aquisicao-rural-apuracao.js` (13
asserts) → tela na aba **R-2000**, que é onde o evento pertence.
**AQUI NÃO SE CALCULA FUNRURAL**: o valor vem pronto do CFI, com vigência de
alíquota (LC 224/2025), tabela de segurado especial, centavo desprezado (IN RFB
971) e conferência contra o infAdic da própria nota. Um teste passa valores
propositalmente fora da alíquota pra provar que a casca NÃO os "corrige", e
outro proíbe qualquer alíquota aparecer no bloco da tela. Refazer a conta criaria
dois números pro mesmo fato — e o problema não é divergir, é ninguém ver qual
está certo.
**O `indAquis` É PENDÊNCIA DE PRIMEIRA CLASSE**: vem de tabela oficial que não
está em NENHUM dos dois apps, então o produtor sem ele fica PENDENTE (não
"quase pronto") e a pendência já diz o que decide o indicador — se o produtor é
SEGURADO ESPECIAL, que o CFI sabe. Informado na tela sai carimbado como
`origemIndAquis: 'informado'`, NUNCA "conferido". Divergência entre o FUNRURAL
apurado e o declarado na nota BLOQUEIA (o valor errado iria pra declaração E
pro recolhimento). O resumo separa `total` de **`totalPronto`** — mostrar só o
cheio faria alguém conferir contra o número errado.

**A TABELA DA SÉRIE R-2000/R-3000** (`reinf/serie-2000.js`) é a contraparte da
`natureza-rendimento.js`: os 9 eventos com o que cada um declara, quem entrega,
e — o campo que faz a tabela valer — **o que falta pra gerar cada um**. Nasceu
porque a série estava escrita em TRÊS lugares que não se conheciam (cards do
index.html, `EVENTOS_PREVIDENCIARIOS` do importador, asserts do teste de menu):
três cópias divergem sem ninguém ver, que é exatamente como o repo acabou com
duas linhas de produção. A cópia do importador CONTINUA (o módulo é UMD e roda
no navegador, sem `require`) mas agora é guardada por teste cruzado.
**O CÓDIGO DE TIPO DE SERVIÇO DO R-2010/R-2020 NÃO ESTÁ AQUI** e não se
inventa — um teste proíbe qualquer código de 9 dígitos entrar na tabela, porque
o pior caso não é ser recusado, é ser ACEITO no código errado. **R-2055 é o
próximo da série**: é o único com GANCHO — o CFI já apura o FUNRURAL
sub-rogado na aba 🌾, com vigência de alíquota (LC 224/2025) e conferência
contra o infAdic da nota. Farol honesto do resumo: `geramHoje: 0` —
identificar o evento no menu não é declarar.

**A TELA DO R-4020 EXISTE** (07/08). Era ELA que faltava, não o dado: a aba
R-4000 só tinha entrada pro R-4010 (PF, e nascida pra aluguel — a mensagem de
erro dela diz "Para aluguel, a EFD-Reinf importa pagamentos PJ→PF") e a aba
R-2000 só importa XML pra CONFERÊNCIA. Sem porta pro R-4020, a colaboradora
caía no E-Fiscal por falta de tela, não por falta de dado. Agora: CNPJ do
tomador + competência → busca no CFI → beneficiários apurados, com IRRF/PIS/
COFINS/CSLL e a natureza do rendimento.
**A NATUREZA INFORMADA VOLTA AO SERVIDOR** (`?naturezas=CNPJ:codigo,...`, mesmo
desenho do `?iva=` do DIFAL no CFI) porque a Tabela 01 não existe no navegador
— código digitado que ninguém confere é código inventado. Informada vence a da
nota, que vence a sugestão; sugestão nunca decide.
**A TELA DIZ POR QUE NÃO TEM BOTÃO DE GERAR XML** — sem isso a pessoa procura
um botão que não existe e conclui que a tela está quebrada. CSLL derivada sai
com selo na linha. Zero beneficiário aponta CAPTURA faltando, nunca "não teve
retenção". ARMADILHA EVITADA: a query da natureza é montada no adaptador; colar
na competência faria o `encodeURIComponent` virar `%3F` e a query sumir em
silêncio.

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
