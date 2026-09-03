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

- **🚨 A RETENÇÃO SEPARADA DESTRAVOU — e o nome do PIS era `vlrPP`, não
  `vlrPis`** (03/09, Paulo mandou um R-4020 **aceito em PRODUÇÃO**: tpAmb 1,
  perApur 2026-07, evento `ID1628278600000002026080611342200001`, verProc
  3.46.0000).
  📖 O bloco, literal: `<vlrBaseIR>15371,80</vlrBaseIR><vlrIR>230,58</vlrIR>
  <vlrBaseCofins>21708,16</vlrBaseCofins><vlrCofins>651,24</vlrCofins>
  <vlrBasePP>21708,16</vlrBasePP><vlrPP>141,10</vlrPP>`.
  🚨 **ELE DESMENTE O NOME QUE A ANALOGIA TERIA ESCRITO**: este módulo listava
  **`vlrPis`** como campo "não mapeado" — o nome **nunca existiu**. É a régua da
  casa pela terceira vez no mesmo gerador (**arquivo ACEITO vale mais que
  leiaute deduzido**), e agora com a prova do risco: o palpite passaria em
  qualquer teste nosso e seria recusado — ou, pior, aceito declarando retenção
  ZERO. `vlrPis`/`vlrBasePis` FICAM na lista de bloqueados justamente por isso.
  📖 **E ELE PROVA MAIS TRÊS COISAS**: a **ORDEM** dentro de `<retencoes>` (IR →
  COFINS → PP — `xs:sequence`, e irmão fora de ordem derruba o evento, como o
  `evtAquis` do R-2099 já derrubou três vezes); que a **CSLL pode ser OMITIDA**
  (*"esse beneficiário ATESA não tem retenção de CSLL, apenas PIS/COFINS"*) —
  tributo que não houve simplesmente não leva o par, e emitir `0,00` seria
  AFIRMAR retenção de zero; e que o **`vlrBaseIR` pode ser MENOR que o
  `vlrBruto`** (15.371,80 × 21.708,16: base com dedução, o caso da cooperativa).
  ✂️ **A RÉGUA FICOU COM DOIS RAMOS, cada um com o arquivo aceito do lado**:
  **com CSLL** ⇒ CSRF **AGREGADA** (`vlrBaseAgreg`/`vlrAgreg`, perApur 2026-06);
  **sem CSLL** ⇒ **SEPARADA** (perApur 2026-07). O que continua bloqueado é a
  **CSLL separada** (nome sem prova), o **IR junto da agregada** (os dois
  arquivos usam uma forma OU a outra — que convivam, e em que ordem, ninguém
  mostrou) e a **base do IR com dedução** (o CFI entrega o valor do serviço, não
  a base do IR; carimbar o bruto declararia base A MAIOR).
  ⚠️ **O `vlrBaseIR` SÓ SAI QUANDO O IR FECHA NA ALÍQUOTA LEGAL** sobre o bruto
  — é isso que PROVA que a base é o bruto. Não fechando, o bloqueio diz que a
  base tem dedução, em vez de inventar o número.
  🚨 **E A TELA PASSOU A SABER ANTES DO CLIQUE** (print do Paulo, mesmo dia): a
  linha dizia **"1 beneficiário(s) PJ · 1 pronto(s) · 0 pendente(s)"**, o botão
  **Transmitir em PRODUÇÃO** nascia verde, e só DEPOIS do clique vinha *"Nenhum
  beneficiário pôde ser convertido em evento"*. **Duas leituras do mesmo fato na
  mesma tela — e a errada era a que decide se a pessoa clica.** A causa: `pronto`
  respondia *"a apuração fechou?"* (natureza + pendências) e **nada perguntava ao
  gerador**. Agora a apuração chama o DONO (`bloqueioDoR4020`), e a tradução
  beneficiário → pagamento saiu da ROTA para o gerador — era ela que a tela não
  tinha como enxergar.
  ⚠️ **TRÊS ESTADOS, porque as AÇÕES são diferentes**: `pronto` · `pendente` (a
  PESSOA resolve na tela) · **`não vira evento`** (depende de um XML aceito ou do
  XSD — entrega pelo e-CAC). Fundir os dois últimos num "pendente" mandaria
  procurar na tela o que não está na tela.
  ⚠️ **E A PENDÊNCIA DA PESSOA VEM PRIMEIRO**: quem ainda não tem natureza já tem
  ação ali, e o gerador reclamaria do MESMO campo (`natRend`) com outra frase —
  duas mensagens para a mesma falta faz procurar dois problemas onde há um.
  🐛 **E A TROCA DE FIXTURE FOI O RETRATO DO DEFEITO**: um teste tinha uma nota
  **sem `dataFatoGerador`** contando como PRONTA — ou seja, ele descrevia o mundo
  em que a tela libera o clique e a transmissão devolve *"pagamentos[0].dtFG deve
  ser AAAA-MM-DD"*, que é a recusa REAL de 02/09.
  📌 **REGRA QUE FICA: "pronto" tem de querer dizer "VIRA EVENTO".** Todo painel
  que tem botão de transmitir pergunta ao GERADOR antes de pintar de verde —
  status da apuração não é resultado da geração, e a diferença só aparece depois
  do clique, que é o pior lugar.

- **🚨 "SEM CSLL" NÃO É "NÃO CONSEGUI SEPARAR A CSLL"** (03/09, mesmo caso —
  ATESA). A régua da decomposição assumia que o campo do portal de SP é SEMPRE o
  TOTAL das três contribuições; quando ele vem **ZERO** com PIS e COFINS já
  separados e **fechando nas alíquotas legais** (0,65% e 3%), não há o que
  separar: o documento está dizendo que **a CSLL não foi retida**. O
  beneficiário virava pendência (*"as alíquotas não fecham"*) sobre uma nota
  correta — e o R-4020 aceito de 07/2026 confirma a forma, omitindo a CSLL.
  ⚠️ **SÓ VALE COM AS DUAS ALÍQUOTAS FECHANDO**: PIS **1,65%** + COFINS **7,60%**
  é o tributo da **OPERAÇÃO** do prestador (o caso ATLAS), e lê-lo como retenção
  declararia à Receita o que ninguém reteve. É a mesma assinatura de alíquota que
  o CFI usa, e ela é a trava que separa os dois casos.
  📌 É a régua de 02/09 (**campo que o documento traz ZERADO é uma AFIRMAÇÃO da
  fonte**) do lado do Contábil.

- **🚨 "JÁ ESTÁ INFORMADO DESDE O MÊS PASSADO" — a tela mandava fazer o que já
  estava feito, e o CFI já tinha resolvido a pendência de verdade** (02/09,
  Paulo, VINCENZO GUERRA BANANAS · 08/2026: *"vou entregar esse REINF R-2055,
  tá falando que tem que informar o indicador de operação, mas já está
  informado desde o mês passado, quando fizemos o teste dela"*).
  📖 O print dele mostra as DUAS leituras discordando **na mesma tela**: a
  coluna INDAQUIS com **`1` · badge verde "informado"**, e o resumo dizendo
  *"1 pendente(s) — Informe o indicador da aquisição dos pendentes e busque de
  novo"*.
  🔴 **A PENDÊNCIA REAL ERA OUTRA**: ANTONIO DIAS DA SILVA aparece com **CNPJ**
  (08.507.490/0001-29) e `apurarAquisicaoRural` o barrava por *"falta o
  tpInscProd"*. **Só que o CFI JÁ TINHA RESOLVIDO ISSO** — e dizia, num
  parágrafo da MESMA tela: *"o CPF do titular foi confirmado no CADESP e gravado
  no cadastro do produtor"*. O payload vem com **`tipoInscricao: 'cpf'`**,
  `cpfProdutor` preenchido e **`origemDoCpf: 'cadastro-do-produtor'`** (a régua
  de 12/08, que nasceu justamente para este produtor).
  🚨 **E ESTA CASCA IGNORAVA OS TRÊS CAMPOS E RECONTAVA DÍGITOS**
  (`doc.length === 14 ⇒ pendente`) — a **segunda cópia julgando natureza**, que
  é exatamente o que aquele dia proibiu (*"a casca NÃO julga natureza: nota que
  entrou no FUNRURAL já teve a sub-rogação decidida lá"*). Quem responde
  *"quem este evento identifica"* é o **CFI**; a contagem de dígitos aqui é
  RESERVA, nunca juiz.
  ✂️ **A CHAVE DO INDICADOR ACEITA OS DOIS DOCUMENTOS, e isso não é detalhe**:
  ele foi informado na tela com o **CNPJ da nota**. Trocar a chave para o CPF
  faria o indicador **já gravado SUMIR** — trocar um defeito por outro, em
  silêncio, que é o pior desfecho possível.
  ⚠️ **A PENDÊNCIA CONTINUA REAL SEM O CPF CONFIRMADO** — sem ele o produtor
  segue bloqueado, com a frase do CADESP. Afrouxar declararia em nome de quem
  ninguém confirmou, e declaração não se desfaz.
  🚨 **E A FRASE DA AÇÃO ERA FIXA — o achado 18 (21/08) na forma mais cara.**
  A tela dizia *"informe o indicador"* sempre que houvesse pendente, qualquer
  que fosse a causa. **Ele fez o que estava escrito, nada mudou, e a conclusão
  natural é que o app está quebrado.** Agora a ação sai de `acaoDosPendentes`,
  derivada da pendência REAL, com as causas SEPARADAS — indicador na tela,
  CADESP no cadastro do CFI, divergência nas notas, base zerada na captura são
  ações **diferentes e em lugares diferentes**; uma frase só para todas é "vá
  procurar" com mais passos.
  📌 **REGRA QUE FICA: quando o app irmão DECLARA um fato em campo próprio, a
  casca honra a declaração — não recalcula o fato a partir da forma do dado.**
  Recontar dígitos sobre um `tipoInscricao` que já veio decidido é a armadilha
  das duas formas com a roupa de fronteira entre dois apps: os dois "funcionam",
  e só o cliente vê a contradição.

- **🚨 EU RODEI O GATE ERRADO — e o certo estava escrito no aviso do próprio
  deploy** (02/09, run 121 vermelho logo depois do #105).
  🔴 **Duas falhas, as duas minhas.** (1) `package.json` em **3.4.243** contra
  `version.json` em **3.4.244** — eu editei o `version.json` **à mão**, e o
  aviso do workflow diz, literal: *"rode `./scripts/bump-version.sh`, que
  propaga a versão para os quatro arquivos sozinho. **Não edite à mão**"*.
  (2) o cache-buster do `index.html` ficou para trás, que é consequência da
  mesma coisa.
  📌 **E O GATE QUE EU RODEI NÃO PEGAVA NENHUMA DAS DUAS.** Este repo tem
  **DOIS**: o `npm run check` (completo, exige PDFs de evidência que só existem
  no Mac do Paulo — ele falha aqui por FALTA DE ARQUIVO) e o **`npm run
  check:ci`**, que é o que o deploy roda e que **PULA** os testes sem evidência
  dizendo isso na cara (*"⊘ evidência não está nesta máquina"*). Eu rodei o
  `check`, vi falhar em `/Users/paulocesarpereirajunior/Downloads/...`,
  conferi que era pré-existente — e **parei ali**, sem rodar o que o CI roda.
  ⚠️ **CONFERIR QUE UMA FALHA É PRÉ-EXISTENTE NÃO É RODAR O GATE.** As duas
  falhas reais estavam a um `check:ci` de distância, e o `check` nem chega nelas
  porque morre antes.
  ✂️ **REGRA QUE FICA: neste repo o gate é o `npm run check:ci`.** O `check`
  completo é a rede de quem tem as evidências; quem não as tem roda o `check:ci`
  e diz que a cobertura foi PARCIAL — que é exatamente o que o próprio runner
  imprime no resumo.

- **🚨 TEXTO DE COMMIT VIRANDO CÓDIGO NO WORKFLOW — dentro do passo que existe
  para AVISAR** (02/09, o mesmo run 121).
  🔴 O log do passo *"Deploy falhou — abrir/atualizar issue"* traz
  `null: command not found`, `merge:: command not found` e
  `reinf/servicos-tomados-apuracao.js: **Permission denied**`. **Não é erro do
  deploy: são as CRASES da minha mensagem de commit sendo EXECUTADAS.**
  📌 **A causa é a mesma de 13/08 no CFI**: `${{ ... }}` é substituído pelo
  Actions **ANTES de o bash existir**, então a mensagem entrava CRUA no
  heredoc. Além de mutilar o corpo da issue (`| Mensagem |  e  e  |`), era
  **vetor de injeção**: quem escreve a mensagem escrevia comando no runner.
  ✂️ **A régua: dado de fora entra por `env:` e sai por `$VAR`** — expansão de
  variável **não reavalia crases** —, e o corpo vai por **`--body-file`**, nunca
  por argumento. E só a **PRIMEIRA LINHA** da mensagem: corpo de squash é muro
  de texto, e a issue precisa dizer QUAL commit, não repetir o PR.
  ⚠️ **A trava PROVA com a mensagem real que quebrou o run 121** e foi validada
  revertendo: o heredoc antigo reproduz os três erros exatos e devolve o corpo
  mutilado. ⚠️ Ela **não** prova que o GitHub abre a issue — só o próximo deploy
  quebrado prova isso; o que ela prova é que a mensagem não vira comando.
  📌 **E o passo AVISOU mesmo assim (issue #106), por sorte**: os comandos
  falharam DENTRO de `$( )`, onde o `bash -e` não aborta. A trava existia e
  funcionou; o que estava quebrado era o CONTEÚDO dela.

- **🚨 GRAVAR UM CAMPO APAGAVA OS OUTROS DOIS — "informo os campos e não
  assume"** (02/09, Paulo, no R-2010: *"Fui entregar a Reinf R-2010, porém
  mesmo eu informando os campos não está assumindo"*, com o prestador em
  **PENDENTE** e `0 pronto(s)` depois de ele digitar o `tpServico` e escolher
  o `indObra`).
  🔴 **A CAUSA É A COMBINAÇÃO, não uma linha errada.** A tela grava **um campo
  por vez** — cada `onchange` manda só o seu (`{ tpServico }`, `{ indObra }`,
  `{ indCPRB }`, `{ baseNota }`) — e a rota montava o documento com os **TRÊS**,
  pondo `null` no que não veio:
  `tpServico: tpServico || null` · `indObra: indObra === '' ? null : Number(...)`.
  🚨 **`merge: true` NÃO PROTEGE DISSO**: ele funde no nível do DOCUMENTO, e
  campo que você **mandou** como `null` é gravado como `null`. Ou seja: digitar
  o `tpServico` **apagava** o `indObra` já informado; escolher o `indObra`
  apagava o `tpServico`; e informar a **BASE** apagava os três de uma vez. Os
  três **nunca coexistiam**, então o prestador ficava pendente **para sempre**.
  📌 **É a família do ✕ do FUNRURAL (30/08, no CFI): gravação que apaga o que
  ninguém mandou apagar.** E o sintoma é o pior possível — **nada falha, nada
  avisa**: a tela diz "salvo" e recarrega **pela regra do backend** (que é o
  desenho CERTO, e foi ele que expôs o defeito em vez de escondê-lo). Para quem
  usa, isso é indistinguível de *"o campo não foi aceito"*, e a única saída que
  sobra é digitar de novo — foi o que ele fez, com `100000001` e depois
  `000000000`.
  ✂️ **A RÉGUA: `undefined` não é valor, é AUSÊNCIA — e ausência não escreve.**
  `patchCadastroPrestador` só devolve o campo que VEIO na requisição. ⚠️ String
  **vazia continua apagando**, de propósito: é a pessoa escolhendo a opção em
  branco ("limpei e salvei", a regra do CCM-SP #311) — e `0` é VALOR, não vazio
  (confundir os dois faria *"não é obra"*, que é o caso comum, nunca ser
  gravado).
  ⚠️ **E ELA MORA NO MÓDULO PURO, não na rota**: dentro do `reinf-routes.js`
  (express + firebase-admin) seria inexercitável por teste — **régua dentro de
  rota é régua sem prova**. A trava exige que a rota CHAME o dono e proíbe a
  volta da montagem antiga; provada reintroduzindo o defeito.
  🔎 **E A CLASSE FOI MEDIDA, não suposta**: varrendo o `index.html` atrás de
  `onchange` que grava UM campo, só o R-2010 faz isso hoje — as outras telas
  mandam o formulário inteiro, e ali escrever todos os campos é o certo. Trava
  larga acusaria essas e seria desligada.
  ✅ **FECHADO EM PRODUÇÃO NO MESMO DIA** (02/09, Paulo: *"registro R-2010 deu
  certo!!!"*). É a **PRIMEIRA transmissão de R-2010 pelo app** — o evento saiu
  com `tpServico`, `indObra` e `indCPRB` juntos, que era exatamente o que nunca
  coexistia.
  📌 **E É ISSO QUE FECHA O CASO, não o teste verde.** A ressalva que estava
  aqui dizia, com razão, *"nenhuma transmissão real foi feita — o que se prova
  é que os três campos coexistem, não que a Receita aceitou"*. **Quem responde
  é o RESULTADO**, e ele veio: é a primeira regra permanente desta casa, e a
  única prova que ela aceita.
  📌 **REGRA QUE FICA: ressalva de "não foi transmitido" tem PRAZO — ela se
  carimba quando a transmissão acontece.** Deixá-la de pé depois da prova faz a
  próxima sessão ler como pendente o que já fechou, e a fila envelhece com
  trabalho que não existe (o vício do *"0/388"*, que foi repetido como fato por
  semanas).
  🚩 **O que continua ABERTO, e vai dito**: o R-2010 fechou para ESTE prestador
  e esta competência. Prestador cuja retenção não bate 11% continua pedindo a
  **BASE informada** (a dedução de material/insumo da IN RFB 971 não vem na
  NFS-e), e `indCPRB` divergente entre notas do mesmo prestador continua sendo
  PERGUNTA — o app não escolhe por ordem de chegada.

- **📅 O `dtFG` DO R-4020 CHEGAVA MALFORMADO — e a correção era do outro lado**
  (02/09, print: *"Nenhum beneficiário pôde ser convertido em evento ·
  ELEVADORES ATLAS SCHINDLER LTDA. — R-4020 inválido: `pagamentos[0].dtFG deve
  ser AAAA-MM-DD`"*).
  ✅ **ESTE LADO ESTAVA CERTO, e vale registrar por quê**: o gerador RECUSOU em
  vez de carimbar uma data, e o beneficiário recusado **não derrubou o lote** —
  ele saiu NOMEADO em `bloqueados`. É o desenho que a casa quer.
  📌 **A causa mora no CFI**: o `dhEmi` chega em TRÊS formas lá
  (`2026-08-14T08:35:36-03:00` do XML ABRASF, `11/05/2026 14:31:31` do portal de
  SP, e Timestamp do Firestore) e o túnel mandava o TEXTO CRU. Corrigido no CFI
  (PR #1147), que passou a normalizar no DONO — e o mesmo defeito estava no
  **R-2010** (`dtEmissao`), no **R-2055** e na **NFTS**.
  ⚠️ **REGRA QUE FICA para este repo: campo que chega do CFI e não passa no
  validador do gerador é PERGUNTA sobre o túnel, não motivo para afrouxar o
  validador.** Aceitar `11/05/2026` aqui teria declarado o fato gerador em
  **novembro** — evento ACEITO na competência errada, que é o desfecho que não
  volta atrás.

- **🚨 950 KB DE JAVASCRIPT SERVIDOS SEM NENHUMA CHECAGEM DE SINTAXE — e o
  sintoma disso é "a atualização não subiu"** (01/09, achado enquanto eu
  procurava a causa de um relato do Paulo).
  🔴 O gate roda `node --check` em ~120 arquivos `.js` soltos, e o `index.html`
  — que é **SERVIDO direto, SPA em JS inline** — carrega **17 blocos de
  `<script>` que nenhum deles alcança**. Um erro de sintaxe ali **derruba o app
  INTEIRO no navegador**: nenhuma tela renderiza.
  🚨 **E ELE PASSA POR TUDO.** Passa no `check`, passa no deploy e **passa no
  health check** — que confere se o HTML foi **SERVIDO** na versão certa, nunca
  se ele **EXECUTA**. É a família do `ReferenceError` que derrubou a geração do
  SPED no CFI (20/08), onde o `lint` também não olhava o código que importava e
  só o clique pegava.
  📌 **E O CUSTO REAL É O DIAGNÓSTICO ERRADO**: para quem usa, app que não
  renderiza é indistinguível de deploy que não subiu — a pessoa recarrega,
  limpa cache e reporta *"não subiu a atualização"*, enquanto a esteira está
  toda verde. Quem procura vai procurar no lugar errado.
  ✂️ `scripts/check-html-inline-js.js` (varredura, nunca lista): todo `<script>`
  **sem `src`** de todo `.html` é escrito num arquivo temporário e passa por
  `node --check`. ⚠️ `<script src=…>` fica de fora — já é coberto pelo
  `node --check` do gate, e checar duas vezes seria a segunda cópia; e
  `application/json`/JSON-LD não é JavaScript (acusá-lo seria alarme sobre
  marcação correta). Ela **nasce verde nos 17 blocos** e foi **provada quebrando
  um de propósito** — acusa o arquivo e a linha em que o bloco começa.
  🚨 **A TRAVA ENTROU NO `check:ci`, NÃO SÓ NO `check` — e essa é a metade que
  vale.** Quem o deploy roda é o **`check:ci`**; registrar só no `npm run check`
  seria a "meia trava" de sempre: existe, passa na máquina de quem lembrou, e
  não protege a entrega.
  ⚠️ E ela tem **guarda contra o silêncio falso**: menos de 5 blocos encontrados
  quebra a build, porque o `index.html` sozinho tem mais que isso — se o regex
  quebrar, ela passaria VERDE sem ler nada, que é exatamente o defeito que ela
  existe para acabar.

- **🚨 A LIÇÃO DOS 10 DIAS DE MAIN VERMELHA NUNCA VIROU TRAVA — só comentário**
  (01/09, achado ao ligar a varredura acima). O mata-burro de 27/08 está logo
  abaixo, com o commit e a data; e **nenhuma varredura deste repositório procura
  marcador de conflito**. `grep` no `scripts/` e nos workflows: zero. É o vício
  de 13/08 do CFI na forma mais cara — **regra escrita não é regra travada** —
  aplicado justamente ao defeito que já custou dez dias de entrega parada.
  ✂️ `scripts/check-marcador-conflito.js`, no `check` **e** no `check:ci`.
  **Provada com o arquivo REAL do defeito**: o `index.html` do commit `2ceeee1`
  posto de volta no repo faz ela acusar as seis linhas exatas (7, 12, 21, 34,
  67, 103).
  📌 **E ELA NÃO É REDUNDANTE COM A DE SINTAXE — isso foi MEDIDO, não suposto.**
  Rodei a varredura de JavaScript inline contra aquele mesmo `index.html` e ela
  passou **VERDE**: os marcadores estavam entre as tags `<script src=…>` do
  `<head>`, **fora de bloco inline**. Concluir que uma cobria a outra teria
  deixado o defeito mais caro do repositório sem rede pela segunda vez.
  ⚠️ **A assinatura é a que o git de fato escreve** — marcador de 7 caracteres
  no COMEÇO da linha —, e o `=======` sozinho **não acusa**: ele só é marcador
  entre um `<<<<<<<` e um `>>>>>>>`. Sem isso, toda régua de comentário viraria
  falso positivo, e alarme sobre arquivo correto é o jeito conhecido de a equipe
  desligar a trava.

- **🚨 A MAIN FICOU VERMELHA 10 DIAS COM MARCADOR DE CONFLITO COMMITADO — e
  nada avisou** (27/08, achado ao rodar `npm run check` ANTES de tocar no repo).
  O `node --check` parava na primeira linha: `auditai/conciliacao-arquivos.js:5
  <<<<<<< HEAD  SyntaxError: Unexpected token '<<'`. Eram **quatro arquivos**
  com marcador gravado no commit `2ceeee1` — e um deles é o **`index.html`, que
  é SERVIDO**. O deploy falha desde **17/08 (run 64)**.
  ✂️ **AS CINCO RESOLUÇÕES ERAM MECÂNICAS** — em quatro um lado CONTÉM o outro,
  numa os dois são idênticos. Nenhuma exigia escolher comportamento.
  ⚠️ **A ÚNICA QUE PEDIU LEITURA foi o bloco 2 do `index.html`**: a `origin/main`
  tinha PERDIDO as tags de `chart.js`, `parser-inter-extrato` e
  `parser-stone-extrato`. Os dois parsers **existem no repo e têm teste ATIVO**
  na cadeia do `check` — sem a tag `<script>` eles não carregam no navegador e
  os dois layouts oficiais quebrariam **NA TELA com os testes VERDES**. É a
  classe *"layout registrado que a tela não carrega"*: por isso a UNIÃO, nunca
  "o lado mais novo".
  🔴 **E EU ESCOLHI O LADO ERRADO DO BLOCO 2 — o deploy 65 caiu por isso.** Li
  um bloco de **69 linhas por AMOSTRAGEM** (as primeiras e as últimas) e
  concluí *"HEAD é superset"* porque vi `chart.js`, `parser-inter` e
  `parser-stone` só do lado HEAD — eles estavam do outro lado TAMBÉM, mais
  adiante. Medindo os dois lados inteiros: só o HEAD tinha
  `/vincular-empresa.js` **sem** cache-buster, e só a `origin/main` tinha
  `saas-brand-theme.js`, `relatorios-contabeis.js` e `relatorios-contabeis-ui.js`.
  **A `origin/main` era o superset — o contrário do que eu escrevi.**
  📌 **REGRA QUE FICA: "um lado contém o outro" se MEDE comparando os conjuntos
  INTEIROS, nunca se deduz das pontas do bloco.** Dois comandos respondem; a
  amostragem custou um deploy.
  🚨 **E A LIÇÃO DE RITO É MAIOR QUE O DEFEITO: existe `npm run check:ci` neste
  repo, e eu rodei uma fatia de testes escolhida À MÃO.** Ele é a porta
  PORTÁTIL — feita justamente para rodar fora do Mac das evidências, e ele DIZ
  quantos pulou (*"59 passaram · 18 pulados · 0 falharam"*). É o que o deploy
  roda. Os dois testes que pegaram meu erro (*"index.html deve carregar o tema
  compartilhado"* e *"motor não carregado no CCI"*) estavam nele o tempo todo.
  **Gate do repo se RODA, não se reinventa** — e em repo que não é o de casa,
  a primeira pergunta é *"qual é o comando do gate aqui?"*.

  📌 **REGRA QUE FICA: `git add -A` depois de um merge engole conflito não
  resolvido em arquivo que você não abriu** — e aqui ele foi para a `main` e
  ficou. Depois de QUALQUER merge, varrer a árvore inteira por marcador, e ler
  o gate **sem pipe** (`| tail` mascara o exit code).
  🚩 **E FICA UMA PERGUNTA NOMEADA, não uma suposição**: o `deploy-app.yml`
  daqui **TEM** o passo `if: failure()` que abre issue (eu escrevi o contrário
  antes de ler o arquivo — corrigido). Não consegui conferir se ele disparou
  nestes dez dias: a API de issues estourou o rate limit na sessão. O que se
  SABE é a fraqueza ESTRUTURAL: ele vive **DENTRO do job `deploy`**, e foi
  exatamente isso que o CFI corrigiu em 17/08 — lá o aviso virou **job
  próprio** (`avisar-falha`, `needs: deploy`, **zero `uses:`**) porque o
  cenário coberto é justamente o download de action falhar, e aí *nenhum passo*
  do job roda, inclusive o que avisaria. Também passou a disparar em
  `cancelled()`. **Portar esse desenho para cá é a próxima leva** — e antes
  disso, conferir se há issue aberta de 17/08.

- **🔒 O FECHAMENTO DO MÊS VEM DO CFI — o apurado era DIGITADO aqui** (27/08,
  fase 5 do túnel; Paulo, 26/08: *"o departamento contábil, através do CCI, deve
  fazer a importação com a mesma exatidão dos valores apurados e o mês
  fechado"*). A aba de impostos tinha um `<input type="number"
  id="fiscalValorApurado">` e alguém copiava o número da tela do Consultor
  Fiscal para cá: **dois números para o mesmo fato, com uma digitação no meio**.
  ✂️ `reinf/fechamento-cfi.js` (PURO) + `GET /api/fiscal/fechamentos-cfi`
  (consulta, não grava) + `POST /:cnpj/fiscal/importar-fechamento-cfi`, com
  botão na aba de impostos — **rota sem botão não é funcionalidade**.
  📌 **O QUE ATRAVESSA É O CARIMBO, NUNCA A FICHA**: a ficha do Lucro é um
  registro VIVO (alguém edita e o número muda); o fechamento é imutável e
  VERSIONADO. Competência **aberta não entrega valor**, **reaberta BLOQUEIA**
  dizendo qual versão o Contábil pode ter importado, e empresa **sem fechamento
  NÃO some da lista** — sumir faria concluir *"este cliente não teve
  movimento"*, afirmação que ninguém fez.
  🚨 **AS TRÊS RECUSAS SÃO O CORAÇÃO DO DESENHO**: (1) **não inventa CÓDIGO DE
  RECEITA** — o carimbo traz o apurado por FAMÍLIA de tributo, o código é de
  tabela oficial e não está lá; sai VAZIO, porque escrevê-lo de memória é o
  `1405` com outra roupa; (2) **não lança o `totalImpostos`** — ele é a SOMA da
  ficha e o painel daqui soma `valor_apurado`, então lançá-lo ao lado do IPI
  contaria o mesmo dinheiro duas vezes (vem para CONFERÊNCIA, e a tela DIZ que
  não foi lançado e por quê); (3) **apurado ausente é `null` e não vira
  lançamento zerado** — zero num campo de imposto é uma AFIRMAÇÃO.
  ⚠️ **REIMPORTAR NÃO DUPLICA** (id `cfi_<competência>_<tributo>`), a
  divergência mostra os DOIS números e **o app não escolhe** — um centavo já
  acende, porque aqui não há arredondamento em jogo: o número atravessa
  verbatim, e quem o refez criou o segundo. E a **ressalva do CFI vai na
  `observacoes` de toda linha**: ela PROÍBE recalcular deste lado, que é a régua
  provada no R-2055.
  ⚠️ **O LASTRO ATRAVESSA e é contado À PARTE** — número fechado com ZERO
  documento por trás é o caso EXPERTE, e sem a ressalva ele chegaria limpo na
  tela de quem vai lançar na contabilidade.
  🔒 **E O CONTÁBIL VÊ O ESTADO DO MÊS SEM PRECISAR PERGUNTAR** (27/08, Paulo:
  *"o colaborador do dpto contábil, quando for importar as informações do CFI,
  deve receber um alerta na empresa para que ele saiba que aquele determinado
  mês está fechado ou não"*). O selo nasce **ao carregar a empresa**, ao lado do
  nome, com a competência já no **mês ANTERIOR** — que é o que se importa.
  📌 **ALERTA QUE SÓ APARECE DEPOIS DE ALGUÉM CLICAR NÃO É ALERTA, é resultado
  de busca** — e quem vai importar não sabe que precisa perguntar se o mês
  fechou. Os três estados vêm do túnel, cada um com a AÇÃO na frase: **🔒
  FECHADO — pode importar**, **⚠ REABERTO — NÃO importe ainda**, **⏳ ABERTO — o
  Fiscal ainda não fechou** (que **não** é "o cliente não teve movimento").
  ⚠️ **Falha do túnel LIMPA o selo** em vez de deixar o anterior na tela: selo
  velho afirmaria um estado que aquela consulta não confirmou, e isso é pior que
  não ter selo.
  🚩 **CONFERIR NO CLOUD RUN**: o default de `FISCAL_GATEWAY_URL` no `server.js`
  aponta para **us-central1** e o CFI roda em **us-west1**. Se `CFI_URL` não
  estiver definida, a chamada cai num 404 — a casca já traduz isso como *"é a
  URL apontando pro lugar errado"*, mas o certo é a env estar certa.
  ⚠️ **E `npm run check` INTEIRO NÃO RODA fora do Mac do Paulo**: os testes de
  parser exigem PDFs em `/Users/paulocesarpereirajunior/Downloads/`. Em sessão
  remota, rodar a fatia que não depende deles e **dizer isso** — nunca carimbar
  "gate verde" com a cadeia truncada.

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
2. ~~R-2010~~ (FEITO 13-14/08, ver abaixo) · R-2020 · ~~R-2055~~ (ponta a ponta
   desde 07/08) · R-2050 · R-1070 · R-4040/R-4080 (raros).

**R-2010 LIGADO PONTA A PONTA** (13/08 o gerador e a tela; 14/08 o que faltava
para ele funcionar de verdade). Rota do CFI `/api/admin/reinf/servicos-tomados`
→ `reinf/servicos-tomados-apuracao.js` → tela na aba **R-2000** →
`reinf/gerar-r2010.js` → gateway. **AQUI NÃO SE LÊ DOCUMENTO**: a NFS-e vem
ACHATADA do portal de SP e em OBJETO do XML, e quem conhece as duas formas é o
CFI — reler deste lado seria a nona mordida da mesma armadilha.
**A PENDÊNCIA QUE MANDA É A BASE**: no `evtServTom` aceito de referência o bruto
é 5.755,54 e a base retida é **4.604,43**, e a `obs` da própria nota diz por quê
— **INSUMOS** (IN RFB 971, arts. 121-124). A NFS-e não separa a dedução, então a
base só entra na declaração quando a alíquota PROVA que não houve nenhuma (11%
cheios); base derivada serve para conferir e o gerador a RECUSA. `tpServico`
(tabela 06, 9 dígitos) e `indObra` não estão na nota: são cadastrados por
PRESTADOR (`reinf_servicos_tomados_prestadores`) e valem para todos os meses.

🚨 **DOIS DEFEITOS DA MESMA FAMÍLIA, achados ao fechar o R-2010 (14/08): "O
PRIMEIRO DECIDE PELOS OUTROS".** Nenhum dos dois derruba nada — os dois produzem
evento **ACEITO pela Receita declarando outra coisa**, que é o pior desfecho
possível, porque não volta recusa nenhuma para avisar.
· **`indObra` do primeiro prestador ia em TODOS os eventos.** A rota montava um
  `estab` só (com `prontos[0].indObra`) e `gerarEventosR2010` repetia esse mesmo
  `estab` evento a evento. Prestador de limpeza mensal (indObra 0) e prestador
  de empreitada total (indObra 2) na mesma competência ⇒ o segundo saía
  declarado com a natureza do primeiro. `indObra` é do PRESTADOR (é do contrato
  dele) e agora viaja com ele; ausência continua BLOQUEANDO, nunca herdando.
· **`indCPRB` saía de `notas[0]`.** O indicador é UM por evento e o evento reúne
  TODAS as notas do prestador no mês: bastava a primeira estar em 11% para o mês
  inteiro ser declarado `indCPRB=0`. Agora só vale com CONSENSO — divergência é
  PERGUNTA nomeada na tela, não empate desfeito por ordem de chegada.
**REGRA QUE FICA**: quando um campo é ÚNICO por evento mas os dados vêm de uma
LISTA, ler `[0]` é escolher em silêncio. Ou todos concordam, ou o campo é do
ITEM, ou é pendência — nunca o primeiro respondendo pelos demais.

🚨 **E A ASSINATURA LOCAL NÃO CONHECIA NENHUM EVENTO NOVO** (mesma varredura).
`reinf/assinador.js` e `reinf/transmissor.js` achavam o elemento por **LISTA DE
NOMES** — `evtInfoContri|evtRetPF|evtFech`, os três que existiam quando eles
nasceram. `evtServTom` (R-2010), `evtAqProd` (R-2055) e `evtRetPJ` (R-4020)
vieram depois e nenhum estava ali: a assinatura local deles morria com *"id do
evento nao encontrado no XML"* — mensagem que **culpa o XML** por um defeito da
lista. Passou batido porque a produção transmite pelo gateway do CFI
(`REINF_TRANSMISSOR=gateway`), que já tinha feito essa mesma generalização; o
caminho local ficou de armadilha para o dia em que alguém desligar a chave.
Agora o elemento se acha pelo **id** (`<evt...` com `id="ID"+34 dígitos`, que só
evento tem) e a `Reference` aponta para ele — evento novo assina sozinho, e a
regra mora num lugar só (o transmissor importa do assinador; eram duas listas
envelhecendo juntas). É o mata-burro de 13/08 outra vez: **trava que vale "para
todo evento" se escreve VARRENDO o que o evento É, nunca listando os que eu
lembrei** — por isso o teste percorre a série em vez de enumerar arquivos.

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

✅ **R-2099 CALIBRADO CONTRA ARQUIVO ACEITO no mesmo dia (v3.4.112)** — evento do
VINCENZO GUERRA, PA 07/2026, `tpAmb=1`, recibo `11774083-10-2099-2607-11774083`,
`cdRetorno 0 SUCESSO`. A trava de produção **pagou o que prometia**: o arquivo
derrubou DUAS deduções que teriam ido para a Receita. (1) **O namespace é
`evtFechamento`**, não o nome do elemento — o elemento é `evtFechaEvPer` e os
dois NÃO batem, ao contrário do R-2055, onde `evtAqProd` aparece nos dois
lugares; repetir o nome do elemento era a dedução natural e estava errada.
(2) **`evtAquis` é o ÚLTIMO** dos sete grupos, depois do `evtCPRB` — eu tinha
posto antes. `infoFech` é `sequence` do XSD: trocar dois irmãos de lugar derruba
o evento. ⚠️ `procEmi` sai **1** (software do contribuinte); o arquivo traz 2
porque foi digitado no REINF.Web, e copiar seria declarar que o evento saiu do
portal. A recusa de produção CONTINUA de pé para leiaute novo — `LEIAUTE_PROVADO`
é um fato datado com recibo, não uma chave de conveniência.

**R-2099 (FECHAMENTO da série R-2000) — como ele nasceu** (14/08, v3.4.110). É ele que manda a Receita apurar: sem o fechamento os
R-2010/R-2055 do mês ficam recebidos e **não viram totalizador nem DARF** — o
VINCENZO 07/2026 fechou no e-CAC, à mão, porque nenhum dos dois apps o gerava.
O que veio do R-4099 homologado e vale: `ideEvento` (perApur → tpAmb → procEmi →
verProc), `ideContri` com a RAIZ de 8 dígitos, `ideRespInf` opcional e o id de
34. O que é **HIPÓTESE**: os nomes das tags dos grupos dentro de `infoFech` —
`LEIAUTE_INFOFECH` existe para a SONDA carregar a suposição por escrito, do
jeito que os 6 candidatos do "sem movimento" carregaram a deles. Nenhum nome ali
foi lido de arquivo aceito.
🚨 **POR ISSO PRODUÇÃO É RECUSADA e restrita é livre**: fechamento com indicador
errado é o pior caso desta família — pode ser **ACEITO** e mandar a Receita
consolidar o grupo errado, com o totalizador saindo a menor e a guia paga a
menor, sem recusa nenhuma avisando. Produção restrita responde de graça, e
`provaDoLeiaute` nomeia o aceite como PROVA. **DESTRAVA MAIS RÁPIDO COM** o XML
do R-2099 já aceito do VINCENZO no e-CAC — arquivo aceito > leiaute deduzido
pela quarta vez (R-4020, E510, R-2010, agora este).
**OS GRUPOS SAEM DO LOG DAS TRANSMISSÕES ACEITAS, nunca de um formulário**
(`fechamento-2000-grupos.js`): lista digitada ESQUECE evento, e evento esquecido
faz a Receita não consolidar aquele bloco. `httpStatus 201` sozinho não conta —
só protocolo, e lote com evento recusado não gera grupo (foi assim que o R-2055
pintou ✓ verde com MS0030). O que fica de fora vem NOMEADO, e o aviso diz o
custo de fechar cedo: depois do fechamento, evento novo da competência só entra
com **reabertura (R-2098)**. Log ilegível NÃO vira "sem movimento" — a diferença
entre "não houve evento" e "não achei o log" não está no zero.

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

### 🚀 O R-4020 TRANSMITE PELO APP — o "gerador sem rota" fechou (01/09)

Paulo, depois de eu nomear o buraco: *"pode ligar a transmissão e ligar o 98"*.

📌 **O GERADOR EXISTIA E NÃO TINHA ROTA NEM BOTÃO.** É a família da *rota sem
botão* (13/08) **um passo antes**: lá era rota que nenhuma tela chamava; aqui
era gerador que nenhuma rota chamava. Nos dois casos a fila lê como entregue e
não é — Paulo perguntou *"agora onde eu transmito?"* e a resposta era o e-CAC.

✂️ `POST /api/reinf/retencoes-pj/:cnpj/:competencia/transmitir`, no molde do
R-2055 que já está provado em produção: mesma fonte da tela, mesmo gateway,
mesma auditoria.

🚨 **A TRADUÇÃO QUE O EVENTO PEDE — e ela NÃO é recálculo.** A apuração separa
PIS/COFINS/CSLL porque o EFD-Contribuições e o Relatório de Retenções precisam
assim; o R-4020 declara o **TOTAL**. A rota SOMA de volta o que a apuração já
decidiu (`pis + cofins + csll`), a partir do MESMO número — refazer a conta
faria o evento e a tela declararem valores diferentes sobre a mesma nota (a
régua do R-2055).

⚠️ **UM EVENTO POR BENEFICIÁRIO, no mesmo lote** — o arquivo aceito traz UM
`ideBenef`, e empilhar foi o que derrubou o R-2055 três vezes com MS0030.

🚩 **BENEFICIÁRIO QUE O LEIAUTE RECUSA NÃO DERRUBA O LOTE** — ele fica FORA,
com o motivo (`bloqueados[]`), e os outros vão. Uma nota com IRRF não pode
impedir a entrega das demais, e lote que some por causa de uma linha é a trava
sem caminho que a equipe contorna. A tela lista quem ficou de fora e manda só
ESSES ao e-CAC.

⚠️ **PRODUÇÃO PERGUNTA ANTES, nos DOIS lados**: `confirm()` na tela e
`confirmoProducao=true` exigido no SERVIDOR — trava só na tela é trava que um
`curl` contorna. Entrega ao Reinf não se desfaz.

✗ **O ✓ VERDE NÃO SAI DO HTTP**: 201 quer dizer *"o lote chegou"*, e os EVENTOS
podem ter sido recusados dentro dele — foi exatamente o ✓ verde sobre um R-2055
recusado (12/08). `ok` exige lote recebido **E** nenhuma ocorrência **E** nada
pendente; a recusa sobe com as ocorrências e, quando o parser não sabe nomear,
com o retorno CRU.

⚠️ **FALHA DE REDE NUM POST NÃO É "não transmitiu"** — o lote pode ter chegado.
A tela manda **CONFERIR no e-CAC antes de repetir**: reenviar às cegas duplica
evento na Receita.

📌 **AS TRÊS PONTAS ENTRARAM JUNTAS E SÃO TRAVADAS JUNTAS** — rota, `window.API`
e botão. **Provadas desplugando uma a uma**: tirar o botão, ou tirar a função do
`window.API`, derruba o teste pelo nome. Sem isso, "gerador sem rota" volta com
outra roupa: adaptador sem export é a tela chamando o nada.

### ✅ A RETENÇÃO DO R-4020 DESTRAVOU — e ela é AGREGADA, não separada (01/09)

Paulo mandou um R-4020 **aceito em produção** (`ID1546611450000002026070609565000001`,
perApur 2026-06, tpAmb 1) — do MESMO contribuinte e do MESMO beneficiário do
caso que estava travado: **MONTE CARLO (54661145) × ATLAS SCHINDLER
(00028986007030)**.

```xml
<infoPgto>
  <dtFG>2026-06-13</dtFG><vlrBruto>3210,96</vlrBruto><indJud>N</indJud>
  <retencoes><vlrBaseAgreg>3210,96</vlrBaseAgreg><vlrAgreg>149,31</vlrAgreg></retencoes>
</infoPgto>
```

🚨 **ELE DESMENTE A ANALOGIA NAS TRÊS PONTAS de uma vez**: o bloco se chama
**`retencoes`** e fica DENTRO do `infoPgto`, **depois** do `indJud`; os campos
são **`vlrBaseAgreg`/`vlrAgreg`** — que este módulo listava como NÃO mapeados;
e o principal, a retenção vai **AGREGADA, num valor só**. O gerador ia emitir
IR/CSLL/PIS/COFINS **separados**. `3.210,96 × 4,65% = 149,31`, ao centavo: é a
**CSRF inteira numa linha**.

📌 **Arquivo ACEITO vale mais que leiaute deduzido, pela sexta vez** (R-2055,
R-2010, R-2099, código 9 do ISS, 0110, agora este). Quatro campos inventados
teriam passado em qualquer teste nosso e sido recusados na transmissão.

⚠️ **E A DECOMPOSIÇÃO DO CFI CONTINUA VALENDO** — ela não foi desfeita. O
EFD-Contribuições e o Relatório de Retenções pedem PIS/COFINS/CSLL separados;
o **R-4020 pede o total**. Somar de volta aqui é declarar no formato que a
Receita aceita, **a partir do MESMO número** (22,19 + 102,40 + 34,13 = 158,72).

🚩 **O QUE CONTINUA BLOQUEADO, e por quê**: o arquivo tem **IRRF ZERO**, então
onde o IR entra não está provado — e os campos SEPARADOS por tributo não
aparecem em arquivo aceito nenhum. IRRF > 0 bloqueia com **motivo PRÓPRIO**
(dizer "campo não mapeado" sobre uma nota que só tem IRRF mandaria procurar
erro em PIS/COFINS/CSLL, que estão certos). **IRRF zero NÃO bloqueia** — é o
caso comum, e barrar ali seria alarme sobre nota correta.

⚠️ **ZERO NÃO SE DECLARA**: `<vlrAgreg>0,00</vlrAgreg>` AFIRMA que não houve
retenção. Nota sem retenção **omite o bloco** — é assim que o primeiro arquivo
de referência foi aceito. E **base sem valor** também é recusada: declara a
base de uma retenção que não existe.

⚠️ **A base sai do CAMPO PRÓPRIO, nunca do `vlrBruto`**: no arquivo aceito os
dois coincidem porque não houve dedução, e carimbar o bruto declararia base a
maior na primeira nota com dedução.

✂️ **A conferência de 4,65% ACUSA, nunca corrige** — recalcular faria o evento
e a apuração declararem números diferentes sobre a mesma nota (a régua do
R-2055). Dois centavos de tolerância, porque alarme sobre arredondamento é o
que faz a equipe desligar a trava.

📌 **UMA FIXTURE FOI TROCADA, pelo motivo certo**: `test-reinf-r4020-xml.js`
travava `vlrIR` como exemplo e afirmava que NENHUMA retenção podia sair — ela
descrevia o mundo anterior ao arquivo aceito. Passou a travar `vlrCsll`, que é
o que de fato continua sem prova.

🚩 **E O `natRend` DIVERGE, dito e não corrigido**: o evento aceito de junho usa
**15044** e a tela de agosto está com **15043**, para o mesmo fornecedor. Pode
ser serviço diferente — quem decide é quem conhece a nota, não o app.

### ✅ E O R-4099 JÁ EXISTIA — sem nenhum teste (01/09)

O segundo arquivo (`evt4099FechamentoDirf`, `evtFech`, `infoFech/fechRet 0`) é
o **fechamento** da série R-4000 — sem ele os R-4010/R-4020 ficam recebidos e
não viram totalizador nem DARF.

📌 **Fui escrever o gerador e ele já estava lá**, em `reinf-utils.gerarR4099` —
escrever um segundo teria sido a segunda cópia que esta casa mais paga. O que
faltava era a **PROVA**: ele nunca tinha teste.

✅ E o arquivo aceito **concorda com ele campo a campo** — elemento, ordem do
`ideEvento`, raiz de 8 dígitos, `ideRespInf`, `infoFech`. **Corroboração**:
dois caminhos independentes no mesmo resultado, que é o que vale como prova
aqui — diferente de "passou no meu próprio teste".

⚠️ **`procEmi` sai 1 de propósito**: o arquivo traz **2** porque foi digitado no
REINF.Web. Copiar o 2 declararia que o nosso evento saiu do portal da Receita.

📌 **REGRA QUE FICA: antes de escrever gerador de evento novo, procure se ele
já existe** — e se existir sem teste, a entrega é o TESTE, não um segundo
gerador.

### 📣 CATORZE DIAS DE ENTREGA SEM UMA LINHA DE NOVIDADE — e a trava cobria a metade ERRADA (01/09)

As Novidades do CCI estavam paradas em **19/08, na v3.4.166**, com o app na
**3.4.231**: catorze dias e ~65 versões sem uma linha que a equipe pudesse ler
— inclusive o **ajuste de retenção do R-4020**, que muda o valor que sobe para
a EFD-Reinf.

📌 **E A LIÇÃO É SOBRE A TRAVA, não sobre o esquecimento.**
`scripts/test-ajuda-cci.js` compara `NOVIDADES_VERSAO` com o *"Atualizado em"*
da página: ele garante que, **SE** a página mudar, o selo vermelho acende. Ele
**não** garante que a página MUDE quando há entrega — então passou VERDE o
tempo todo.

🚨 **É a classe que esta casa mais paga, agora dentro da própria trava: ela
existe, roda, passa — e não cobre o caso pelo qual foi criada.** O CFI levou
exatamente este defeito no MESMO dia (dez dias de silêncio lá).

✂️ `scripts/test-novidades-cci-cobertura.js` fecha o outro lado: o **CLAUDE.md
é atualizado em TODO PR**, então a data mais recente dele é o proxy FIEL de
*"houve entrega"*. Se ela for mais nova que a das Novidades, ou a página está
atrasada, ou aquela entrega não muda nada para quem usa — e aí isso se
**DECLARA com o motivo** (`DATAS_SEM_EFEITO_PARA_QUEM_USA`), nunca em silêncio.
**Provada revertendo**: com a página em 19/08 ela acusa, com as duas datas.

⚠️ **E o texto é para quem USA, não para quem programa**: o que mudou, **onde
fica** e o que a pessoa precisa fazer — um dos casos do teste exige o
*"Onde:"* na seção do topo, porque novidade sem lugar é a mesma coisa que
aviso apontando para o nada.

⚠️ **E o que eu NÃO sabia descrever ficou NOMEADO, não inventado.** Boa parte
das entregas do período veio de outro agente (`AI Assistant`), com mensagens de
commit magras. As que eu não consegui apontar na tela entraram numa lista
*"também entrou"* — nomeadas com fidelidade e **sem "Onde" fabricado**, que
seria o aviso que manda procurar no lugar errado.

📌 **REGRA QUE FICA: trava de comunicado se prova pelos DOIS lados** — que o
selo acende quando a página muda, E que a página muda quando houve entrega. A
primeira sozinha é o silêncio com cara de cobertura.

### 🚨 O RESUMO DO R-4020 ESCONDIA DOIS TRIBUTOS — e quem lê conclui o pior (01/09)

Paulo, no dia seguinte ao ajuste de retenção entrar (CONDOMINIO EDIFICIO MONTE
CARLO 08/2026): *"puxou as retenções certas agora, mas está como se fosse subir
para a REINF apenas a CSLL"*.

🔴 A linha de resumo dizia `1 beneficiário(s) PJ · 1 pronto(s) · 0 pendente(s)
· IRRF R$ 0,00 · **CSLL R$ 34,13**` — com **PIS 22,19 e COFINS 102,40 na tabela
logo abaixo**. Duas leituras do MESMO fato na mesma tela, e a de cima é o
**VEREDITO**: é ela que a pessoa lê para decidir se pode transmitir.

📌 **E OS NÚMEROS JÁ EXISTIAM.** `apurarRetencoesPJ` devolve `totalPis` e
`totalCofins` desde sempre; a TELA é que os descartava. É a **"flag que ninguém
lê"** — o dado existe e o leitor joga fora —, a mesma classe do `naoConferidos`
que o CFI pôs num header que a tela não lia (29/08) e do `errosResumo[].nome`
que o painel de crons descartava (30/08). **Terceira vez em uma semana**, e as
três chegaram como PERGUNTA de quem usa, que é o jeito mais caro de descobrir.

✂️ A trava é por **VARREDURA, nunca por lista**: ela lê do NÚCLEO quais
`total*` existem e exige que a tela nomeie cada um
(`scripts/test-reinf-resumo-r4020.js`). Lista escrita à mão envelheceria no
primeiro tributo novo — e envelheceria em silêncio, que é exatamente como este
viveu. **Provada revertendo**: com a linha antiga ela acusa `totalPis` e
`totalCofins` pelo nome.

🐛 **E ELA NASCEU ACUSANDO A TELA CERTA** — o vício de sempre, pego na primeira
execução: o recorte usava `indexOf('reinfRetPjStatus(')`, que acha primeiro a
**DEFINIÇÃO** da função, não a chamada. A janela caía num trecho sem nenhum
total e a varredura reprovava a correção. A âncora passou a ser o TEXTO do
resumo (`beneficiário(s) PJ`), que só existe na linha que importa.

⚠️ **E o teste fecha contra os números do caso REAL**: os três somam
**158,72**, que é a CSRF que a nota declara — mostrar só a CSLL faria a tela
afirmar 34,13 sobre uma retenção quatro vezes maior.

### ✍️ AJUSTAR A RETENÇÃO — e parar de RECALCULAR o que o CFI já respondeu (31/08)

🚨 Paulo, no R-4020 da CONDOMINIO EDIFICIO MONTE CARLO: *"preciso ter a opção
de ajustar as retenções para entregar com o valor correto, com o novo layout
estão emitindo errado"*.

📖 O caso, com os números do print — NFS-e 377235, **ELEVADORES ATLAS
SCHINDLER**: serviço **3.413,24** · campo PIS **56,32** (1,65%) · campo COFINS
**259,41** (7,60%) · **Contribuições Sociais - Retidas 158,72** (4,65%), com a
descrição *"3 - PIS/COFINS/CSLL Retidos"*. E a própria nota avisa em Outras
Informações: *"(5) Informações preenchidas nos campos de PIS e COFINS são
referentes aos valores TOTAIS sobre a operação"*.

Ou seja: **56,32 e 259,41 são o tributo do PRESTADOR**, não retenção — e
declará-los manda **315,73** no lugar de **158,72**, quase o DOBRO.

🚨 **A DECISÃO ESTRUTURAL: `resolverRetencoes` PARA DE RECALCULAR quando o CFI
manda o bloco `retencao`.** Este módulo tinha a própria régua (a subtração da
CSLL, 07/08) e ela é boa — mas com o CFI passando a decompor a CSRF, refazer a
conta aqui faria o CCI mostrar **315,73** enquanto o CFI diz **158,72 sobre a
MESMA nota**. É a régua do R-2055, palavra por palavra: **a ressalva PROÍBE
recalcular do outro lado** — dois números para o mesmo fato é o pior defeito de
um arquivo fiscal.

⚠️ **A régua daqui NÃO foi apagada**: sem o bloco (resposta ANTIGA do CFI, ou
nota de outra fonte) ela continua sendo a única que conhece a subtração da
CSLL. O que mudou é a PRECEDÊNCIA.

⚠️ **E a ORIGEM viaja junto** (`csllOrigem` recebe `csrf-decomposta`,
`ajuste-declarado`…): número DERIVADO não se apresenta como fato lido do
documento. `exigeAjuste` do CFI vira **pendência** aqui — é ele que sabe que o
documento traz um número que a régua desmente.

✂️ **O AJUSTE É POR NOTA e é GRAVADO NO CFI**, nunca aqui: quem responde
*"quanto esta nota reteve"* é o dono do dado, e um ajuste guardado deste lado
faria o **SPED e a EFD-Reinf** declararem números diferentes. A rota daqui
(`POST /api/reinf/retencoes-pj/:cnpj/:competencia/ajuste`) só repassa.

⚠️ **O AUTOR sai do usuário LOGADO, nunca do corpo da requisição** — autor que
o cliente escolhe não é autoria, é digitação. Lá o registro é carimbado com
`autorFonte: 'tunel-contabil'` (*"o app irmão AFIRMA que foi esta pessoa"*),
porque o CFI não tem como verificar.

⚠️ **Sem CHAVE não se ajusta**: mudar o valor de uma declaração sem poder dizer
QUAL nota mudou é o ajuste que ninguém confere depois — e a decisão é da NOTA,
não do prestador (a lição do ✕ do FUNRURAL, 30/08: decisão gravada no nível
errado apaga o que ninguém mandou apagar).

📌 **A TELA ENTROU NO MESMO PR** — rota sem botão é código morto com cara de
entrega. O painel mostra **o que o documento traz** ao lado dos campos (é
contra ele que a pessoa confere), tem **motivo obrigatório**, o **↩ desfazer**
(botão que tira valor do total nasce com o que desfaz, 14/08) e **recarrega
depois de gravar** — senão a tela mostraria o número velho e a única saída de
quem não vê efeito é clicar de novo.

⚠️ **Falha de rede num POST não é "não gravou"**: a mensagem manda CONFERIR
antes de digitar de novo, nunca tentar às cegas.



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

### 🌾 R-2055 TRANSMITE PELO APP — e "IOB" no vocabulário do Paulo é ESTE app (11/08)

Um dia, três viradas, e a lição é de VOCABULÁRIO: #41 destravou o
gerar+transmitir do R-2055 (gateway, produção restrita como padrão). Aí o
Paulo disse *"vamos padronizar e deixar no IOB"* e a sessão leu "IOB" como o
**e-Fiscal IOB SAGE** — #42 (v3.4.98) transformou o Transmitir em "📄 Gerar
XML pra importar no IOB". O Paulo corrigiu no mesmo dia: *"padronizar no IOB
que eu quis dizer foi me referindo ao NOME DA URL"* — ou seja, **o
plano-contas-iob, este app**. E cortou o desenho do #42: *"não faz sentido
retroagir e deixar um rabo solto no e-Fiscal onde só vai gerar confusão no
colaborador"*. A v3.4.99 REVERTE o #42: botões 🧪/🚀 Transmitir de volta,
rota `/aquisicao-rural/transmitir` de volta, e o e-Fiscal NÃO recebe
importação de R-2055 — a estratégia de 05/08 (e-Fiscal vira CONSULTA, a
operação migra) vale também pro Reinf.

REGRAS QUE FICAM: (1) **"IOB" dito pelo Paulo = este app** (a URL
plano-contas-iob), NUNCA o e-Fiscal SAGE — na dúvida sobre qual sistema uma
ordem menciona, perguntar ANTES de virar produção; (2) evento com dois
transmissores possíveis tem UM dono: o R-2055 sai daqui pelo gateway, e
colocar o e-Fiscal no circuito seria criar dependência operacional nova do
sistema que está sendo aposentado; (3) o argumento de dupla transmissão do
#42 continua verdadeiro — resolve-se escolhendo o dono, não gerando XML pra
outro sistema.
