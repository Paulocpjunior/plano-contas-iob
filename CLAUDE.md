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
- 🚨 **SÃO DOIS PROJETOS GCP, e confundi-los custou 13 deploys vermelhos**
  (07/08):
    · **Cloud Run** → `gen-lang-client-0569062468` — é aqui que o app RODA.
      Serviço `plano-contas-iob`, região `us-west1`,
      URL https://plano-contas-iob-q4woqnee3a-uw.a.run.app
    · **Firestore** → `projetos-app-sp` — fixado no `server.js`.
  A FONTE DA VERDADE é `scripts/deploy-production.sh`, que publica de verdade
  (tem até `EXPECTED_URL` e recusa publicar se o serviço resolver noutra URL).
  O `deploy-app.yml` do CODEX chutou `projetos-app-sp` no default e o gcloud
  respondia *"Cloud Run Admin API has not been used in project ... or it is
  disabled"* — mensagem que manda HABILITAR A API no lugar errado, em vez de
  dizer que o projeto é outro. Se um dia ela reaparecer, **desconfie do
  projeto antes de habilitar API nenhuma**.

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
- 🚨 **A CONTA DE SERVIÇO TEM QUE MORAR NO PROJETO DO CLOUD RUN** (07/08 — 18
  runs vermelhos até fechar essa conta). O gcloud tem TRÊS projetos em jogo e
  eles se separam sem avisar:
    · **recurso** → resolvido por `--project` em cada comando
    · **credencial** → o projeto DONO da conta de serviço
    · **quota** → quem "paga" a chamada de API e onde a API precisa estar
      habilitada — e ele vem do projeto da CREDENCIAL, não do padrão do gcloud
  Com a conta em `projetos-app-sp` e o deploy em `gen-lang-client-0569062468`,
  isso produziu TRÊS sintomas de uma causa só: permissão negada (papéis
  concedidos no projeto errado), "Cloud Run Admin API não habilitada" (projeto
  errado no workflow) e "IAM API não habilitada no projeto 641538949234" (a
  quota caindo no projeto da chave). A cura é a conta viver no MESMO projeto do
  Cloud Run — credencial, recurso e quota no mesmo lugar.
  ⚠️ **HIPÓTESE MINHA QUE O LOG DESMENTIU**: fixar `CLOUDSDK_CORE_PROJECT` NÃO
  muda o projeto da quota. O run #16 provou — as cinco variáveis mudaram para o
  projeto certo e o `consumer` continuou o mesmo. O passo que faz isso ficou no
  workflow, mas pelo motivo certo (coerência do projeto padrão), não como cura.
  **A PROVA que decide nesses casos é NÚMERO contra NÚMERO**:
  `gcloud projects describe <projeto> --format='value(projectNumber)'` contra o
  número que a mensagem cita. Seguir o link da mensagem de erro levou ao lugar
  errado DUAS vezes; comparar número acertou nas duas.
- **NÃO EXISTIA conta de deploy no `projetos-app-sp`** (07/08): o
  `gcloud iam service-accounts list` devolveu SÓ a `firebase-adminsdk`. O app
  estava no ar porque o CODEX publicava com o LOGIN DO PAULO, não com service
  account — por isso não havia chave nenhuma de onde tirar o secret. A conta
  `github-deploy@projetos-app-sp` foi criada pra isso.
  **PAPÉIS: são CINCO, não quatro.** O deploy é `gcloud run deploy --source .`,
  que passa por Cloud Build, Cloud Storage (bucket de origem) e Artifact
  Registry: `run.admin`, `iam.serviceAccountUser`, `cloudbuild.builds.editor`,
  `artifactregistry.admin` (writer NÃO cria o repositório) e **`storage.admin`**
  — este último é o que a mensagem antiga do workflow omitia e é justamente o
  que o `--source` exige.
  ⚠️ **NUNCA escrever `--iam-account=<EMAIL>` numa instrução**: o `<` é
  redirecionamento no shell e o zsh tenta abrir um arquivo. Passar o valor por
  variável (`SA_EMAIL=...`) é o formato que não quebra.
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
- ✅ **O DEPLOY AUTOMÁTICO FUNCIONA desde 07/08** (run #19 verde, "Deploy
  publicado"). Levou 19 runs, e o que destravou não foi nenhum dos remendos:
  foi a conta de serviço passar a morar NO PROJETO DO CLOUD RUN
  (`github-deploy@gen-lang-client-0569062468`). Antes dela existir, o app subia
  pelo LOGIN PESSOAL do Paulo — por isso nada disso estava configurado e cada
  passo da automação descobria uma permissão que um dono de projeto nunca
  precisa pedir. Setup atual: secret `GCP_SA_KEY` (JSON, nunca P12), cinco
  papéis no projeto do Cloud Run, e as APIs `iam`/`cloudbuild`/
  `artifactregistry`/`run` habilitadas lá.
  ⚠️ **MERGE VERDE CONTINUA NÃO SENDO PROVA**: o run publica, mas quem prova é
  o RESULTADO — `curl $APP/api/version` bate com o `version.json`, e o HTML
  servido contém a tela que o PR diz ter criado. É a lição da NFS-e SP, que
  ficou semanas verde com zero notas capturadas.
  🧹 **LIXO A REMOVER** (criado no caminho, tudo com poder de deploy): a conta
  antiga `github-deploy@projetos-app-sp`, os papéis cruzados que ela ganhou no
  `gen-lang-client`, e a chave P12. Dívida técnica anotada: estreitar os papéis
  (foram dados largos pra não descobrir um por rodada) e trocar a chave de
  longa duração por Workload Identity Federation.
- **VARIÁVEIS DE AMBIENTE DO SERVIÇO** (conferidas 07/08, projeto do Cloud Run
  `gen-lang-client-0569062468`, região `us-west1`):
    · `CFI_URL` e `FISCAL_GATEWAY_URL` → ambas apontam pro CFI, hoje
      `https://consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app`
  🚩 **A ARMADILHA**: o `FISCAL_GATEWAY_URL` estava em
  `...-631239634290.us-central1.run.app` — **região que não existe** pra esse
  serviço (o CFI é us-west1). Endereço morto, e o app usava ele como reserva
  quando `CFI_URL` não existia: a resposta vinha 404 SEM CORPO e a tela dizia
  "CNPJ não cadastrado". Ou seja, erro de CONFIGURAÇÃO se disfarçando de erro
  de CADASTRO. O `interpretarRespostaCfi` passou a separar os dois (404 mudo
  acusa a URL e mostra qual foi tentada), mas a lição é anterior: **nunca
  digitar URL de Cloud Run** — derivar com
  `gcloud run services describe <svc> --region <r> --project <p>
  --format='value(status.url)'`. O Cloud Run publica DUAS URLs válidas pro
  mesmo serviço (numérica e com hash), e escolher a mão é onde a região erra.
  ⚠️ Mudança de env NÃO garante revisão nova visível: os dois `update` de 07/08
  reportaram a MESMA revisão. Conferir sempre com o `describe`, nunca com a
  mensagem "Done" do deploy.
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

### "E quem eu procuro?" — o responsável do escritório na tela (07/08)

As ressalvas do R-4020 e do R-2055 quase sempre terminam em *"alguém do
escritório precisa olhar este cliente"*: nota com PIS/COFINS que são o tributo
da operação, prestador PF que é outro evento, competência com ZERO nota (que
pode ser mês sem retenção **ou** buraco de captura). Quem é esse alguém saía por
WhatsApp, de memória.

O CFI abriu a **fase 2 do túnel do cadastro** e este app consome:

| rota do CFI | `GET /api/admin/cadastro/responsaveis/:cnpj` |
|---|---|
| cliente | `buscarResponsavelNoCfi` (mesma auth das notas) |
| régua | `reinf/responsavel-escritorio.js` (puro) |
| rota daqui | `GET /api/reinf/responsavel/:cnpj` |
| tela | bloco abaixo da tabela nas DUAS telas, no sucesso **e no erro** |

**Aqui não se escolhe responsável.** O túnel devolve `principal: null` quando há
mais de um marcado como principal — e a tentação seria "pega o primeiro". Isso
faria a colaboradora falar com quem não cuida do cliente e nunca desconfiar; o
conflito vira TEXTO, com os dois nomes e onde arrumar.

**Sem responsável ≠ sem cadastro.** É `pendenteDeAtribuicao`, e a frase manda
atribuir na Carteira do CFI. Confundir os dois manda procurar problema num
cadastro que está certo — o erro de 07/08 pela manhã.

**Nunca derruba a apuração**: é informação de apoio, chamada DEPOIS do
resultado. Túnel fora do ar ⇒ o bloco some, a tabela continua.

### 🔑 O A1 DO ESCRITÓRIO VIVE EM DOIS COFRES (08/08)

Este app assina TODOS os eventos e faz o mTLS com o A1 da SP como
**procuradora** (`cert-loader`), guardado no Secret Manager DESTE projeto
(`reinf-cert-a1`). O CFI guarda A1 no dele. **Nada nunca comparou os dois.**

Quando o certificado é renovado, alguém sobe o arquivo novo em UM dos cofres.
O outro segue com o antigo e nada acusa — o app transmite normalmente até o dia
em que o antigo vence, e aí **TODA transmissão para de uma vez, para todos os
clientes**.

A prova é o **FINGERPRINT** (SHA-256 do DER). O `metadados()` do cert-loader
passou a calculá-lo com o **mesmo código do CFI** (`sefaz-backend/cert-storage.js`)
— e um teste replica o cálculo do outro lado para provar que batem. Se os
algoritmos divergissem, a comparação viraria ruído: hashes diferentes do MESMO
arquivo acusariam certificados distintos.

`reinf/certificado-conferencia.js` (puro) + `GET /api/reinf/certificado/conferencia`,
mostrado no card **Certificado A1**. Situações: `mesmo-certificado` (verde — e a
frase LEMBRA que renovar exige os dois cofres, porque "igual" não é "uma cópia
só"), `mesmo-certificado-vencendo`, **`certificados-diferentes`** (vermelho; se o
do CFI vence depois, a leitura é "renovaram lá e não aqui, e esta cópia para
antes"), `vencido-aqui`, `cfi-nao-tem` e `nao-conferido` (túnel fora do ar NÃO
vira "está tudo certo").

**O CNPJ vem do PRÓPRIO certificado** (`CN=NOME:CNPJ`), nunca de constante —
perguntar ao CFI por CNPJ chutado conferiria o certificado errado.

⚠️ **NÃO se confere o certificado do CLIENTE, e isso foi decisão** (08/08): a
tentação era pendurar a aptidão do cliente (fase 3 do túnel) na tela de
transmissão. Seria alarme falso — aqui o certificado do cliente não é usado em
momento nenhum, a assinatura sai do A1 do escritório por procuração. "Cliente
sem certificado" ao lado de uma transmissão que não depende dele é o aviso que
ensina a equipe a ignorar aviso.

### 🚪 GATE DE DEPARTAMENTO — o SaaS chega neste módulo (08/08)

Desenho do Paulo: usuário unificado no CFI com DEPARTAMENTO obrigatório;
vinculado, abre o módulo. Este app PERGUNTA no login (`GET
/api/departamento/gate` → túnel `GET /api/admin/cadastro/usuarios/:email
?modulo=contabil`) e **não define vínculo nenhum** — quem grava é admin, no
Gerenciar Usuários do CFI.

**NASCEU EM MODO AVISO, e a razão é uma data**: no dia em que subiu ninguém
tinha departamento preenchido (as caixas nasceram no mesmo dia no CFI).
Bloquear já trancaria a equipe inteira na segunda de manhã. Quem está sem
vínculo vê a faixa âmbar com a ação e segue trabalhando; a virada é
**`DEPARTAMENTO_GATE_MODO=bloqueio`** (env do Cloud Run), sem deploy de
código. Só virar depois que o Paulo terminar de vincular a equipe.

**Túnel fora do ar LIBERA, nos dois modos** — contraste deliberado com a
emissão de guia (lá indeterminado PARA, porque reenviar duplica cobrança;
aqui trancar o escritório porque um serviço piscou é o dano maior). E CFI
piscando NÃO vira faixa amarela pra equipe inteira: indeterminado é log, não
banner. Núcleo puro `departamento-gate.js` (decidirGate) + faixa/tela-cheia
em `index.html` (mostrarGateDepartamento).

### 💾 PREFERÊNCIAS DE RETENÇÃO — o "salvar" que faltava (08/08)

A colaboradora apontou: as naturezas digitadas por prestador (R-4020) e o
indAquis por produtor (R-2055) viviam SÓ na memória da tela — recarregou,
perdeu, redigitava a cada apuração. Agora persistem no doc
`reinf_preferencias/retencoes` (`GET/POST /api/reinf/preferencias-retencao`),
por CNPJ/CPF (são dados ESTÁVEIS do prestador/produtor, não da competência).
Botões 💾 nas duas telas; a carga é automática ANTES da busca e a precedência
é **digitado > salvo > nota** — salvar nunca sobrescreve o que a pessoa
acabou de corrigir na sessão. A validação do código continua na Tabela 01 do
servidor, na hora de apurar.

### 🚇 FASE 4: transmissão via GATEWAY do CFI — 🧪 PROVADA e LIGADA (09/08)

**PROVADO em 09/08 pelo Paulo**: 🧪 devolveu *"PROVADO: lote aceito em
produção restrita via gateway"*, protocolo **2.202608.33245995** — o CFI
assinou com o A1 do cofre e a Receita aceitou. A chave
`REINF_TRANSMISSOR=gateway` foi LIGADA no deploy-app.yml no mesmo dia:
transmissões deste app agora saem pelo CFI e o A1 local nem é carregado.
Voltar pra local = tirar a env do workflow (um commit).
O QUE AINDA SEGURA O `reinf-cert-a1`: uma transmissão REAL (R-1000 +
movimento de competência) via gateway com recibo conferido — o 🧪 prova o
trilho, não o volume. Só depois de rodar de verdade: apagar o secret e o
upload de certificado daqui.
CUSTO DO CAMINHO ATÉ O PROVADO (09/08, lições): o 🧪 v1 validava o payload
COMPLETO do R-4020 e barrava em "Inclua ao menos um beneficiário" (a prova
usa só o R-1000); o 401 "Email não verificado" era a trava CERTA do túnel do
CFI sem CAMINHO na tela (banner de verificação + botão veio em v3.4.89-91); e
o 401 persistia DEPOIS de verificar porque `getIdToken()` cacheia o token por
1h — o getToken agora se autocura lendo o claim (v3.4.92).

#### O desenho original (08/08), que continua valendo:

O CFI agora assina E transmite lotes EFD-Reinf
(`POST /api/admin/reinf/gateway/transmitir` — o assinador de lá é PORTE do
daqui, generalizado pra série toda). Este app ganhou o segundo caminho:
`reinf/gateway-client.js` + a virada `assinarEEnviarLote`/
`consultarLoteOndeFoi` em reinf-routes.

**A CHAVE É `REINF_TRANSMISSOR=gateway` (env), E O DEFAULT É `local`** — o
caminho atual fica INTOCADO até o gateway provar em produção restrita.
Em modo gateway: o evento sai SEM assinatura (quem assina e abre o mTLS é o
CFI), o A1 local **nem é carregado** no /transmitir, e o contrato de retorno
é IDÊNTICO ao do transmissor local — o parse/lote pendente/logs não mudam.

**A PROVA VIROU UM BOTÃO (08/08)**: 🧪 *Provar gateway* na aba REINF →
`POST /api/reinf/gateway-teste` transmite SÓ o R-1000 em produção restrita
(tpAmb=2 FORÇADO) pelo gateway, independente do `REINF_TRANSMISSOR` — a
chave principal e produção não são tocadas. Veredito na tela: PROVADO
(aceito ou MS1005 "já vigente", que também fecha o círculo) ou a ocorrência
com o XML. Clicar exige os dados de contribuinte preenchidos na própria aba.

RITO DE PROVA antes de apagar o `reinf-cert-a1`: (1) env pra `gateway`;
(2) transmitir R-1000 + movimento em produção restrita (tpAmb=2) e conferir
protocolo/recibos iguais ao caminho local; (3) rodar semanas em produção;
(4) só então apagar secret + o upload de certificado daqui. Falha de REDE na
transmissão via gateway avisa que o lote PODE ter sido enviado — reenviar
duplica; conferir lotes pendentes primeiro.

DIRF está EXTINTA (substituída pela série R-4000) — resíduo de fluxo DIRF no
escritório morre quando o R-4020 entrar.
