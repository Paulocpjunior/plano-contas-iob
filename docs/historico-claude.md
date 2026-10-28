# Consultor Contábil (plano-contas-iob) — SP Assessoria Contábil

Memória de trabalho para sessões do Claude neste repositório. Atualize ao
assumir compromissos com o Paulo (admin/dono) — é daqui que a próxima sessão
retoma. Criado em 07/08/2026, quando o projeto passou do CODEX para o Claude
(Paulo: *"o CODEX estava tocando este projeto, você consegue administrar? para
que não fique mais confuso?"*).

- **🚨 O R-2010 MANDAVA A DISCRIMINAÇÃO INTEIRA DA NOTA NUM CAMPO COM TAMANHO
  MÁXIMO — e o lote inteiro voltou RECUSADO** (10/09, Paulo, J.N. VINATEX ·
  08/2026, logo depois de o IRRF subir: *"O IR deu certo, assumiu e já subi,
  daí fui transmitir o R-2010 deu esse erro"*).
  📖 **A RECEITA DISSE O CAMPO E O MOTIVO, por extenso**: `MS0030 — a estrutura
  do arquivo XML está em desconformidade com o esquema XSD. The
  '…/evtTomadorServicos/v2_01_02:obs' element is invalid … **The actual length
  is greater than the MaxLength value**`, com o texto inteiro citado na
  mensagem (a discriminação do serviço da A7, ~340 caracteres: item, horas,
  insumos, ISS, cada retenção, valor a receber, vencimento, pedido).
  🔴 **A CAUSA É DE DESENHO, e ela estava lá desde o começo**: a rota fazia
  `obs: n.discriminacao || ''` — ou seja, jogava num campo de LEIAUTE com
  MaxLength um texto que **quem digita é o PRESTADOR**, sem teto nenhum. Não é
  caso raro que estourou: é a garantia de estourar no dia em que ele escrever
  mais. No evento ACEITO de 06/2026 a mesma discriminação tinha **35
  caracteres** e passou; em 08/2026 o MESMO prestador detalhou o serviço e
  foram 340.
  🚨 **E O CUSTO É O MÁXIMO: o lote é RECEBIDO e nada é ACEITO** — a
  competência fica sem entrega, e o motivo chega como erro de schema, que se lê
  como defeito de estrutura do evento (não como "o texto de uma nota é longo").
  ✂️ **O DONO DO LIMITE É O GERADOR, nunca a rota**: `obsQueCabe` decide, e a
  rota parou de conhecer tamanho de campo — duas réguas para o mesmo campo
  divergem no primeiro ajuste, e foi exatamente esse buraco que produziu o
  defeito (quem montava o payload não conhecia o leiaute, e quem conhece o
  leiaute não via o texto).
  ⚠️ **NÃO RECORTA, OMITE — e omite NOMEADO**: metade de uma declaração de
  terceiro (*"…RETENCAO SEG.SOCI"*) é dado com cara de declaração. O `obs` é
  **informativo** e nenhum valor do evento depende dele, então a nota vai
  inteira, a retenção vai inteira, e o que ficou de fora aparece na tela com o
  número da nota — omissão calada faz quem confere procurar buraco de captura
  numa nota que está completa.
  ⚠️ **O MaxLength NÃO ESTÁ MEDIDO, e o número que está no código é do APP**:
  o portal SPED é bloqueado por esta rede e só o XSD do **R-4020** está em
  `docs/reinf/xsd` — nele o campo IRMÃO `observ` é `maxLength 200`, o que
  CORROBORA a ordem de grandeza e **não é o número do 2010** (o 1010 tem sete
  campos num arquivo e nove no outro; leiaute de vizinho já custou caro aqui).
  📏 **E O PISO SUBIU DE 35 PARA 97 NO DIA SEGUINTE, por ARQUIVO ACEITO** (10/09,
  Paulo mandou o `evtServTom` de **07/2026** da MESMA empresa e do MESMO
  prestador, `tpAmb 1` — PRODUÇÃO — pelo REINF.Web `verProc 3.46.0000`): o `obs`
  dele tem **97 caracteres** e a Receita ACEITOU. O teto do app nasceu **80**,
  ou seja **abaixo do que já passava** — ele omitiria observação que o leiaute
  recebe. Subiu para **97**, que é o piso PROVADO, e não um palpite maior.
  ⚠️ **97 É PISO, NUNCA TETO — e o próprio arquivo diz por quê**: aquele `obs` é
  a MESMA discriminação, **COMPRIMIDA** pelo outro sistema (rótulos suprimidos,
  valores colados). Ou seja, o REINF.Web resolve o mesmo problema **recortando**;
  aqui a régua continua sendo **omitir e NOMEAR**, porque meia declaração de
  terceiro é dado com cara de declaração. O que ele prova é o que PASSOU, não
  onde o campo estoura — acima de 97 volta a ser dedução, e dedução aqui devolve
  o MS0030 com o lote.
  📌 **A UNIDADE É A MESMA DOS DOIS LADOS**: o validador da Receita é .NET e
  `MaxLength` conta unidades UTF-16 — o mesmo que `String.length`. A fixture do
  teste tem **97 caracteres em 98 bytes** de propósito: quem trocar a medição
  para BYTES faz o teste cair. Provado por reversão nas duas direções (teto de
  volta a 80 · medição por byte).
  📌 **FILA DO PAULO**: mandar o **XSD do `evtTomadorServicos v2_01_02`** (do
  mesmo jeito que o do R-4020 entrou no repo). O XML aceito eleva o PISO e **não
  fecha essa pendência** — só o XSD fixa o número do leiaute.
  📌 **REGRA QUE FICA: campo de leiaute com MaxLength não recebe texto que um
  TERCEIRO digita.** Ou o app conhece o teto e decide o que cabe, ou está
  apostando que ninguém vai escrever demais — e essa aposta não falha no
  desenvolvimento, falha na competência do cliente, com o lote inteiro voltando.

- **🚨 O RECIBO DA RECEITA CHEGAVA E ERA JOGADO FORA — a competência ENTREGUE
  ficava trancada dentro do app** (10/09, Paulo, J.N. VINATEX · 08/2026, minutos
  depois de o `obs` ser corrigido e a competência retransmitida:
  *"retornou com o erro MS1028"*).
  📖 **A RECEITA DISSE O QUE ERA, por extenso**: *"Não é permitido o envio de
  mais de um evento para o mesmo contribuinte, num mesmo período de apuração
  para um mesmo estabelecimento e prestador, **exceto se for para retificação de
  um evento enviado anteriormente ou se o evento anterior tiver sido
  excluído**"*.
  🚨 **MS1028 NÃO DIZ QUE O EVENTO ESTÁ ERRADO — DIZ QUE ELE JÁ EXISTE**, e essa
  é a leitura mais cara do dia: a tela respondia *"o lote foi recebido, mas há
  EVENTOS RECUSADOS — **nada foi aceito**"*, frase que se lê como *"a competência
  está sem entrega"*. Quem lê aquilo transmite de novo — e a Receita devolve
  exatamente o MESMO MS1028, para sempre. **A competência pode já estar
  ENTREGUE**, e a única frase honesta é mandar conferir o recibo no e-CAC.
  🔴 **A CAUSA É DE LEITURA, e ela é a "régua que só escreve" ao contrário**: a
  rota de transmissão sempre mandou `indRetif=1` (original) e **nunca guardou o
  `nrRecArqBase`** que o retorno entrega em TODO evento aceito. O recibo é o
  ÚNICO caminho de volta (retificar exige o recibo do evento anterior) — ele
  chegava, e o app descartava. Do segundo envio em diante, a competência ficava
  trancada por dentro: original recusado, retificação impossível.
  ✅ **E O CAMPO NÃO É DEDUÇÃO**: `nrRecArqBase` é o MESMO que o caminho do
  R-4010 deste repo já grava e já usa para retificar (`registrarRetornoLoteReinf`
  → `nrRecibo` → `indRetif: 2`), e lá a retificação funciona. Reusar o campo
  PROVADO é a régua de sempre — retorno REAL vence leiaute deduzido.
  ⚠️ **A CHAVE É A QUE A RECEITA NOMEIA NO PRÓPRIO MS1028**: contribuinte +
  competência + **ESTABELECIMENTO** + prestador, mais o **AMBIENTE**. Chavear por
  menos faria o recibo de uma filial retificar o evento de outra, ou o de
  produção restrita retificar o de produção — e evento retificado contra o
  recibo ERRADO é **ACEITO**, que é o pior desfecho, porque não volta recusa
  nenhuma avisando.
  ⚠️ **`indRetif`/`nrRecibo` SÃO DO PRESTADOR, nunca do lote** — pelo MESMO
  motivo do `indObra` (14/08, "o primeiro decide pelos outros"): o lote mistura
  prestador já entregue com prestador que nunca saiu, e marcar retificação no
  lote faria o novo retificar um evento inexistente e o antigo sair com o recibo
  do vizinho.
  🚦 **E `indRetif=2` SEM `nrRecibo` SAÍA CALADO**: a linha do recibo
  simplesmente não era escrita (`if (indRetif === 2 && nrRecibo)`) e o evento ia
  declarando retificação de coisa nenhuma. Virou RECUSA com o motivo.
  🚪 **A SAÍDA NASCE ONDE A TRAVA APARECE**: a competência entregue ANTES desta
  correção (ou pelo REINF.Web) tem o recibo só na Receita, então o MS1028 sem
  recibo guardado abre o campo **"Informar o recibo do evento anterior"** ali
  mesmo, com o prestador escolhido numa lista. **O app não deduz o número** —
  alguém lê no e-CAC e digita, e fica gravado QUEM digitou, carimbado
  `origem: 'informado'` × `'retorno'`. É o desenho do `cpfTitular` do produtor
  rural e o do código 9 do ISS fixo.
  ⚠️ **E DÁ PARA APAGAR**: recibo digitado errado é PIOR que recibo nenhum — ele
  retifica em cima do evento de outro. Salvar em branco remove.
  ⚠️ **O FORMATO AVISA E NÃO BLOQUEIA**: o recibo carrega o tipo do evento
  (`…-2010-…`), e o app diz quando o número não parece de um R-2010 — mas não
  recusa: o formato é da Receita e já mudou antes neste projeto, e recusar por
  formato deduzido recusaria recibo VÁLIDO, que é o erro caro aqui.
  ⚠️ **FALHA AO LER OS RECIBOS RECUSA A TRANSMISSÃO**, e é decisão: sem eles o
  app não distingue *"não tem recibo"* (original, certo) de *"não consegui ler"*
  (original por acidente). Original e retificação são declarações de naturezas
  DIFERENTES. Falha ao GRAVAR não desfaz o que já foi transmitido, mas vai DITO.
  🐛 **E O "ONDE" DA OCORRÊNCIA NUNCA APARECIA NA TELA DO R-2010**: o backend
  extrai `localErroAviso` de propósito desde 12/08 (*"era ela que faltava"*) e a
  tela lia `o.local`, campo que não existe. O dado chegava e ninguém lia — na
  tela feita para mostrá-lo.
  🚩 **O QUE ISTO NÃO RESPONDE, e vai dito**: **qual** evento a Receita tem
  registrado de 08/2026. O app não guardou recibo nenhum até hoje, e o registro
  anterior aqui dizia *"o lote foi RECEBIDO e NADA foi aceito"* — o MS1028
  contradiz isso, então a premissa se **RE-MEDE no e-CAC**, não se herda. Só o
  recibo lá diz se a competência já está entregue e com quais valores.
  📌 **REGRA QUE FICA: retorno de órgão que carrega o caminho de volta se GUARDA
  no mesmo PR em que se transmite.** O recibo não é comprovante para arquivar —
  é a CHAVE da retificação. Descartá-lo transforma "entregue" em "trancado", e o
  sintoma chega como recusa que se lê ao contrário do que ela diz.

- **🚨 A BASE DO IR ERA CONFERIDA PELO BENEFICIÁRIO SOMADO — e reprovava nota
  CERTA** (09/09, Paulo, no painel do R-4020 da J.N. VINATEX · 08/2026, horas
  depois de o IRRF ajustado subir: *"puxou a retenção de IR certinho, porém
  está dando essa mensagem, ele está falando da base como está as duas notas
  somada"*). Ele nomeou a causa na própria frase.
  📖 **A ARITMÉTICA FECHA A QUESTÃO, com os números do print**: BOA VISTA
  SERVIÇOS, duas notas — **1004413** (base 346,15 · **IR 0,00**, o valor não
  alcança a retenção) e **1008360** (base 1.615,84 · **IR 24,24**). No
  AGREGADO, 24,24 ÷ 1.961,99 = **1,235%**, que não fecha com 1,5% nem 1% ⇒ o
  beneficiário caía em *"não vira evento"* e era empurrado ao e-CAC. **Nota a
  nota, 24,24 ÷ 1.615,84 = 1,50% EXATO**: a retenção estava perfeita, e o que
  não fechava era a CONTA que a régua fazia.
  🔴 **A CAUSA É DE EIXO, não de fórmula**: `pagamentoR4020DoBeneficiario`
  conferia `bruto`/`ir` do beneficiário já SOMADO. Basta UMA nota abaixo do
  piso de dispensa do IRRF no mesmo mês — que é o caso comum — para a alíquota
  do conjunto deixar de fechar. É a classe *"quando o núcleo separa dois
  números de propósito, a tela NÃO os soma"* (03/09) com o somador dentro da
  PRÓPRIA régua.
  📌 **E A MESMA MEDIÇÃO ENTREGA A BASE CERTA, que o app declarava errada**: a
  base do IR é a soma das bases das notas **QUE RETIVERAM** — 1.615,84, nunca o
  bruto de 1.961,99. É exatamente a forma do arquivo ACEITO de 07/2026
  (`vlrBaseIR` 15.371,80 sobre `vlrBruto` 21.708,16): **`vlrBaseIR` pode ser
  MENOR que o bruto**, e carimbar o bruto ali é base A MAIOR num evento que a
  Receita ACEITA.
  ✂️ `baseIrDoBeneficiario` (no gerador, o dono da régua) confere NOTA A NOTA e
  soma só o que reteve; a apuração **transporta** `notasComIr` e não
  reimplementa nada — régua em dois lugares diverge no primeiro caso novo.
  ⚠️ **NOTA COM IR ZERO NÃO É CONFERIDA e não entra na base**: zero é resposta
  legítima (a dispensa por valor mínimo), e cobrar alíquota dela seria alarme
  sobre nota correta.
  ⚠️ **E A CONFERÊNCIA CONTINUA DE PÉ — ela só mudou de EIXO**: nota individual
  que não fecha (cooperativa, base com dedução) segue SEM base provada, com o
  bloqueio de sempre; **uma nota torta não passa de carona na outra** (com duas
  retendo, as DUAS têm de fechar, senão a base sairia a MENOS); e **alíquotas
  diferentes no mesmo beneficiário** (1,5% num serviço, 1% no outro) passam a
  funcionar — na soma elas não fechariam em alíquota nenhuma.
  ⚠️ **A BASE NUNCA EXCEDE O BRUTO**: ela é um RECORTE dele, e soma maior (nota
  fora do beneficiário, base duplicada) NÃO declara — base a maior é o erro que
  a Receita aceita e ninguém confere depois.
  📌 **REGRA QUE FICA: régua de ALÍQUOTA se aplica no nível do FATO — a nota —,
  nunca no total que a tela agrupa.** O agrupamento por beneficiário existe
  porque o EVENTO é por beneficiário; a retenção, não. E o sintoma desta classe
  nunca é erro: é uma nota perfeita saindo do evento, com o app mandando
  entregar à mão o que ele já sabia declarar.

- **🚨 O IRRF AJUSTADO NUNCA CHEGAVA AO R-4020 — o dono respondia CINCO
  tributos e este leitor pegava TRÊS** (09/09, Paulo, J.N. VINATEX · 08/2026:
  *"estou entregando essa REINF, porém percebi que o IR não subiu e mesmo
  estando informado na nota, são duas notas 1 com retenção e outra que o valor
  não alcança a retenção de IR"*, com o print desta tela e o do Relatório de
  Retenções do CFI lado a lado).
  📖 **OS DOIS PRINTS FECHAM A CONTA AO CENTAVO**: beneficiário BOA VISTA
  SERVIÇOS, 2 notas — a 1004413 (base 346,15 · PIS 2,25 · COFINS 10,38 · CSLL
  3,46 · **IR 0,00**, o valor não alcança a retenção) e a 1008360 (base
  1.615,84 · PIS 10,50 · COFINS 48,48 · CSLL 16,16 · **IR 24,24**, que é 1,5%).
  O relatório do CFI totaliza **IR 113,93**; este painel dizia **IRRF R$
  89,69** — a diferença é EXATAMENTE os 24,24. E PIS (12,75), COFINS (58,86) e
  CSLL (19,62) batiam ao centavo nas duas telas, que é o que fazia o defeito
  parecer de captura.
  🔴 **A CAUSA É DE LEITURA, e ela é fina**: `resolverRetencoes` já consome o
  bloco `retencao` do CFI desde 31/08 — o comentário dela diz, palavra por
  palavra, *"o CFI já respondeu, e recalcular aqui é criar a divergência"* — e
  devolve **três** tributos. O **IR era lido FORA dela**, do campo CRU
  (`const ir = r2(num(n.ir))`). Os 24,24 foram **informados à mão** (ajuste
  declarado, com autor e motivo), então só existem no bloco efetivo: o campo
  cru é o do DOCUMENTO, e o documento não trouxe IR nenhum.
  🚨 **E O CUSTO É O PIOR DOS DOIS**: o evento é **ACEITO** declarando IRRF a
  MENOS — a Receita não recusa, e a diferença só aparece no cruzamento. É a
  "meia ligação" de sempre: o dono responde cinco, o leitor pega três, e o que
  sobra some em SILÊNCIO.
  ✂️ O IR passou a sair do MESMO dono (`resolverRetencoes` devolve `ir`), e o
  laço lê `ret.ir` — ler `n.ir` ali era a segunda leitura do mesmo fato.
  ⚠️ **AUSENTE ≠ ZERO**: bloco antigo do CFI sem `ir` NÃO zera o IR do
  documento — devolveria *"não houve retenção"* sobre nota que reteve. E nota
  sem o bloco (resposta ANTIGA do CFI) segue pelo documento: nada regride.
  🚦 **A TRAVA É POR VARREDURA**: `num(n.ir)` só pode aparecer **uma vez** no
  módulo, em `doDocumento` — que é o que a nota DIZ, mostrado para a pessoa
  conferir antes de digitar o ajuste. Corrigir a linha fecha a INSTÂNCIA; a
  varredura fecha a CLASSE. Provada revertendo: ela acusa `0` contra `24,24`,
  exatamente o número do print.
  📌 **E O RESUMO DO CFI TINHA O MESMO DEFEITO, do outro lado do túnel**: o
  `totalIr` somava `n.ir` (o documento) enquanto o `totalRetencaoDeclarada`,
  duas linhas abaixo, já somava o bloco efetivo — **o resumo desmentia as
  linhas que ele resume**. Corrigido lá no mesmo dia, com o total do DOCUMENTO
  saindo à parte (`totalIrDoDocumento`), que é contra o que se confere.
  🚩 **O QUE ISTO NÃO ALCANÇA, e vai dito**: o **R-2010** (serviços tomados)
  continua sem ler os ajustes — a rota `/servicos-tomados` do CFI não carrega
  a coleção `reinf_retencoes_ajustadas` (só o R-4020 e o R-2020 carregam).
  Então **INSS informado à mão não chega ao R-2010**. É a mesma classe, no
  evento vizinho, e ela fica NOMEADA em vez de corrigida de carona: mexer em
  valor de evento sem caso real é o que este projeto persegue.
  📌 **REGRA QUE FICA: quando um dono responde N campos, o leitor lê os N — e
  a lista se MEDE, não se lembra.** O bloco `retencao` carrega ir, pis, cofins,
  csll e inss; este módulo lia três e ninguém percebeu por nove dias, porque os
  três que ele lia batiam.

- **🛠️ O R-2020 SAIU DO "A HOMOLOGAR" — calibrado no `evtServPrest` ACEITO,
  não no R-2010 espelhado de memória** (08/09, Paulo: *"preciso gerar a REINF
  de INSS de serviços prestados e não está habilitado, pode liberar"*, com o
  print do card e o XML de 07/2026 transmitido pelo REINF.Web e aceito em
  produção).
  📖 **O QUE O ARQUIVO PROVOU**: `evtPrestadorServicos/v2_01_02` ·
  `infoServPrest > ideEstabPrest(tpInscEstabPrest, nrInscEstabPrest) >
  ideTomador(tpInscTomador, nrInscTomador, indObra, vlrTotalBruto,
  vlrTotalBaseRet, vlrTotalRetPrinc, vlrTotalRetAdic, vlrTotalNRetPrinc,
  vlrTotalNRetAdic, nfs*)` · `nfs(serie, numDocto, dtEmissaoNF, vlrBruto,
  infoTpServ(tpServico, vlrBaseRet, vlrRetencao))` · bruto = base = 9.105,95,
  retenção 1.001,65 (11%) · série `E`.
  🚨 **O QUE ELE DESMENTIU DO ESPELHO INGÊNUO — e é por isso que o teste
  reproduz o aceito, não o irmão**: **não existe `indCPRB`** (a desoneração do
  prestador é do R-1000, `indDesoneracao`); o `infoTpServ` traz **só três
  campos**, sem os sete zeros que o R-2010 emite; `obs` não aparece. O gerador
  RECUSA `indCPRB` com o motivo e não emite tag não provada.
  ✂️ `gerar-r2020.js` (um TOMADOR por evento — a régua MS0030 do R-2055; o
  `indObra` viaja com o tomador), `servicos-prestados-apuracao.js` (cadastro
  por TOMADOR em `reinf_servicos_prestados_tomadores`: tpServico, indObra,
  base por nota; patch que só grava o campo que VEIO — a lição de 02/09),
  rotas `/servicos-prestados/*` (o log grava `transmitir_r2020`, que o
  fechamento R-2099 já mapeava desde 13/08), tela na série R-2000, card
  **"Tela no ar"**. O CFI entrega por tomador e honra o INSS informado à mão
  (ajuste declarado), que a tela carimba com o autor.
  ⚠️ **SÉRIE VAZIA**: a NFS-e ABRASF não tem série e o CFI a grava vazia. O
  grupo `nfs` é o MESMO tipo do R-2010, cujo aceito levou `serie 0` — é o
  único valor provado para "não há série", e a rota o usa; o gerador recusa a
  vazia. Os CNPJs do teste são FICTÍCIOS: dado de cliente não entra no repo.
  🚩 **O QUE NÃO ESTÁ PROVADO, e vai dito na tela e na tabela da série**: uma
  transmissão pelo NOSSO gerador aceita. O aceito é do REINF.Web. O caminho é
  🧪 produção restrita primeiro; `resumoDaSerie().homologados` continua 0 de
  propósito até o recibo do nosso lote.
  📌 **REGRA QUE FICA: evento-espelho se calibra no arquivo aceito do PRÓPRIO
  evento.** Espelhar o R-2010 teria emitido `indCPRB` e sete zeros — XML que o
  XSD recusa, ou pior, aceita declarando campo que o evento não possui.

- **🤖 O MOTOR SUBIU PARA `gemini-3.8-flash` — e o deploy passou a CONFERIR se
  o modelo existe, em vez de ecoar o env** (06/09, Paulo: *"precisamos alterar
  nosso motor em todos os apps, do gemini, 3.7 para 3.8 em todos"*).
  🔴 O nome estava CRAVADO em quatro lugares (`server.js`, `index.html` ×3,
  `deploy-app.yml` ×7, `scripts/test-gemini-model-version.js`) e o health do
  deploy conferia `gemini_model` — que era o próprio env ecoado — contra a
  string esperada: **STATUS lido como RESULTADO**, a primeira regra do CFI.
  Nome pinado à mão que a conta não tem derruba a IA **calada** (a lição do CFI
  de 15/08, que por isso pina PERGUNTANDO à conta).
  ✂️ `/api/health` ganhou `gemini_model_conferido` (`confirmado` ·
  `nao-encontrado` · `indeterminado`) + `gemini_model_detalhe`: o servidor faz
  um GET no metadado do modelo pinado (sem gerar nada) no boot, e repete se
  ficou indeterminado há mais de 1 min. O deploy **recusa tráfego** em
  `nao-encontrado` e **libera dizendo** em `indeterminado` — rede que piscou
  não é veredito (a régua do gate de departamento).
  ⚠️ **O que NÃO está provado, e vai dito**: eu não alcanço a API daqui. Quem
  prova que `gemini-3.8-flash` existe é o **primeiro deploy** — e se a Google
  responder 404 o run fica vermelho com a frase, nunca a IA quebrada em
  produção. O `test-gemini-model-version.js` agora proíbe `gemini-3.7-flash`
  nos três arquivos e exige a sonda + o gate no workflow.
  🐛 **E A PRIMEIRA RODADA DA SONDA NÃO PROVOU NADA — deploy 138, mesmo dia**:
  o health veio `indeterminado · "não consegui perguntar à Google: This
  operation was aborted"`. Dois defeitos meus somados: 10s de sonda num
  contêiner FRIO estoura, e o health final é lido 14s depois do boot — antes
  da repergunta, que só disparava após 1 min. O deploy passou pelo caminho
  "indeterminado LIBERA" (certo), mas a prova que a sonda existia para dar
  nunca chegou ao log. ✂️ Sonda com 25s, repergunta a partir de 15s, e o
  deploy **ESPERA** (até 5×20s) enquanto for indeterminado antes de julgar.
  ⚠️ E este ambiente não alcança o Cloud Run (CONNECT 403), então não dá para
  chamar o health daqui: **o log do deploy é o único instrumento**.
  📌 **REGRA QUE FICA: nome de modelo é da família do ID de tabela oficial —
  vem da FONTE (a resposta da Google), nunca da memória.** O deploy é o lugar
  que pergunta, porque é o único que tem a chave — e uma sonda que o deploy
  não espera é status com outra roupa.

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

- **🖼️ LOGO GIGANTE NO E-MAIL DE PROVA — width="52" não basta** (24/09, print
  do Paulo: o leitor de e-mail ignorou o atributo e mostrou o PNG de 226×320 no
  tamanho natural). Régua tripla em `email-layout.js`: atributo `width`+`height`,
  CSS inline `width:52px;height:74px`, e a PRÓPRIA imagem pequena
  (`sp-logo-email-2x.png`, 104×147, 2× para retina — arquivo NOVO; o
  `sp-logo-email.png` antigo ficou sem uso). `test-email-layout.js` lê o IHDR do
  PNG e confere a proporção. O CFI recebeu a mesma correção no mesmo dia.

- **✉️ E-MAIL PELO COLABORADOR LOGADO, COM A CASCA DO CFI — E O MATA-BURRO DA
  CREDENCIAL** (24/09, Paulo: *"implementar esta configuração dos e-mails no app
  irmão CCI, parametrizando o mesmo layout e ativando sempre que o remetente do
  e-mail é sempre o colaborador logado, devendo observar que se trata do
  departamento contábil"* — depois de a credencial do Graph do CFI ter ficado
  morta por dias com o Secret ID gravado no lugar do Value: *"isso não pode
  voltar a acontecer"*). Aqui TODO envio saía da caixa institucional
  (`GRAPH_REMETENTE`) com HTML solto por rota, e o Reinf tinha um segundo
  cliente Graph próprio dentro de `reinf-routes.js`. Entregue: `email-layout.js`
  (casca portada de `sefaz-backend/email-layout.js` do CFI; ÚNICA diferença
  `MARCA.departamento = 'Departamento Contábil'` e assinatura do CCI; logo
  inline `sp-logo-email.png`), `graph-remetente.js` (remetente = `req.user.email`
  se for caixa do domínio do escritório, senão institucional COM motivo; caixa
  inexistente → refaz pela institucional e a resposta DIZ; qualquer outro erro
  NÃO repete), `graph-email-provider.js` (cc/bcc, anexo inline, `getGraphToken`
  e `invalidarTokenGraph`), `graph-credencial.js` + `graph-credencial-routes.js`
  (forma do segredo sem expor o valor; veredito com ONDE gravar; `GET
  /api/email/vigia` sonda a cada 24 h disparada por quem abre o app e grava em
  `health_alertas/graph-email`; `POST /api/email/credencial/testar` e `POST
  /api/email/prova` só admin). Pontos rewired: relatório contábil, sugestão da
  Ajuda (institucional, sem sessão), alertas de progressão (admin = quem clicou;
  agendador = institucional), aplicações e dividendos do Reinf. Tela: faixa
  vermelha em `index.html` após o login; card "✉️ E-mail do escritório" no
  Admin. Trava `test-email-remetente-colaborador.js` fecha a classe por
  VARREDURA: chamada direta ao provedor só com motivo escrito em `SEM_SESSAO`.
  ⚠️ Operação: o Cloud Run do CCI é OUTRO projeto (`gen-lang-client-0569062468`);
  o segredo do app Notificacoes mora em `consultorfiscalapp`. Ou se dá
  `secretmanager.secretAccessor` à conta de serviço do CCI e referencia
  `projects/consultorfiscalapp/secrets/graph-notificacoes-secret:latest`, ou se
  cria o segredo no projeto do CCI. Nunca `--set-env-vars`.

- **🚨 A NATUREZA POR NOTA FOI INFORMADA, SALVA — E O EVENTO SUBIU EM PRODUÇÃO
  COM A DO PRESTADOR** (12/09, Paulo, WALDESA COMERCIO · SERASA · 08/2026:
  *"salvei as naturezas de rendimentos de cada serviço, busquei no consultor
  fiscal e depois transmiti, porém quando olhei no ecac, subiu a natureza 15006
  mas não é essa natureza, pois são serviços diferentes. E no consultor do
  contábil não está salvando essas naturezas"* — print do e-CAC com o R-4020
  ACEITO em produção, natureza 15006, recibo `…-03-4020-2608-…`; e a tela com
  *"por nota (2) … 1303309 → 15008 · 1336030 → 15032"* sobre uma linha só).
  🔴 **A CAUSA É A CHAVE DO MAPA, e ela era MINHA, de 11/09**:
  `chaveDeNaturezaInformada` só aceitava CNPJ e `CNPJ-número`. A chave da NFS-e
  do portal de SP que o CFI grava é `inscrição-número-códigoVerificação` (e a
  digitada é `nfsesp-…`) — e `chaveDaNota` devolve a chave do documento COMO
  VEIO. Ou seja: a tela mandava `chave:15008`, o servidor descartava a chave em
  silêncio (na busca, no 💾 Salvar e na transmissão), a nota herdava o 15006 do
  prestador e o evento saiu ACEITO com a natureza errada. **Provado por
  reversão** (as três formas reais viram '' na régua antiga).
  ✂️ A régua da chave passou a ser a do DONO da identidade: o que `chaveDaNota`
  produz é chave, como veio; só se normaliza forma conhecida (CNPJ mascarado,
  `CNPJ-número`); lixo é vazio/espaço/`:`/`,`. ⚠️ **Fixture trocada com
  motivo**: o teste exigia que `lixo` fosse descartado — era essa recusa que
  descartava a chave real.
  🔴 **E HAVIA UM SEGUNDO DEFEITO ESPERANDO A CORREÇÃO DO PRIMEIRO**: a
  transmissão fazia um evento por LINHA da apuração (`cnpj|natureza`) — com a
  chave certa, a SERASA viraria DOIS eventos com o mesmo `cnpjBenef` na mesma
  competência, e o segundo é duplicidade. O leiaute resolve DENTRO do evento:
  um `idePgto` por natureza no mesmo `ideBenef` (`gerarR4020` já montava assim
  a partir de `pagamentos`). `agruparPorBeneficiario` + `pagamentosR4020DoBeneficiario`
  no gerador; a rota gera UM evento por CNPJ, e a tela diz quantos eventos saem.
  ✂️ **E O EVENTO ERRADO JÁ ESTÁ NA RECEITA — corrigir é RETIFICAR, e a rota
  só sabia ORIGINAL.** Nasceu `reinf/recibo-r4020.js` (PURO), o desenho do
  `recibo-r2010.js` campo a campo, chaveado por **BENEFICIÁRIO** (contribuinte
  + competência + estabelecimento + beneficiário + AMBIENTE): a transmissão
  grava o `nrRecArqBase` de todo evento aceito em `reinf_recibos_r4020`, lê os
  recibos antes de montar (quem tem recibo sai `indRetif=2`), e a rota
  `POST /retencoes-pj/:cnpj/:competencia/recibo` recebe o recibo LIDO NO e-CAC
  para o evento entregue antes de o app guardar (vazio APAGA; sem `-4020-`
  AVISA, não bloqueia). A tela ganhou a caixa *"Informar o recibo do R-4020 já
  entregue"*, o selo *↻ retificação* na linha, e o resultado do envio diz por
  beneficiário as naturezas, original × retificação e os recibos guardados.
  MS1028 ganhou a leitura própria (`duplicidadeR4020`): *o evento já existe*,
  nunca *"nada foi aceito"*.
  🚩 **PENDÊNCIA DO PAULO (WALDESA 08/2026)**: colar o recibo
  `62212777-03-4020-2608-62212777` na caixa (beneficiário SERASA, PRODUÇÃO),
  Buscar (a linha mostra ↻ retificação e as duas naturezas), transmitir em
  produção e conferir no e-CAC que o evento retificado traz 15008 e 15032.
  📌 **REGRA QUE FICA: identidade que UM módulo produz não se REVALIDA por
  forma em outro** — quem canoniza a chave é o dono dela; o mapa recebe o que
  ele devolve. E régua que muda "uma linha ⇒ um evento" para "uma linha ⇒ um
  pagamento" se prova no XML (dois `idePgto`), nunca na contagem de linhas.

- **✍️ "A NATUREZA DE RENDIMENTO ESTÁ ERRADA POIS SÃO DUAS NF COM SERVIÇOS
  DIFERENTES" — a natureza era POR PRESTADOR, e a segunda nota herdava a da
  primeira** (11/09, Paulo, WALDESA · 08/2026, duas NFS-e da SERASA tomadas com
  retenção informada à mão; print do R-4020 com `15006 informada` numa linha só
  para as duas notas).
  🔴 **A APURAÇÃO JÁ ERA POR NOTA — quem era por prestador era a PORTA**: o
  `?naturezas=CNPJ:codigo` da tela e a preferência salva aplicavam o MESMO
  código a toda nota do prestador (`informadas.get(cnpj)` nos DOIS consumidores,
  tela e transmissão). Com serviços diferentes o evento sairia **ACEITO
  declarando a natureza errada** — a Receita não devolve isso.
  ✂️ A régua do mapa MUDOU DE CASA para o dono (`reinf/retencao-pj-apuracao.js`):
  `chaveDaNota` (a MESMA identidade do ajuste de retenção do CFI — chave do
  documento, senão `CNPJ-número`), `mapaNaturezasInformadas` aceitando prestador
  E nota, e `naturezaInformadaDaNota`, em que **a da NOTA vence a do
  prestador**. A tela lista as notas do beneficiário (`notasDoBeneficiario`,
  com a chave) e oferece um campo por nota quando há 2+; a apuração já separava
  por `cnpj|natureza`, então cada natureza vira uma linha (um `idePgto` por
  natureza no evento).
  ⚠️ **A PREFERÊNCIA SALVA MANTÉM O HÍFEN DA CHAVE**: o `limpo` das preferências
  tirava tudo que não é dígito — a chave `CNPJ-número` viraria outra e o salvo
  nunca casaria de volta, calado. É a família do `idDoFechamento` (CFI, 26/08).
  📌 **UMA ASSERÇÃO FOI TROCADA PELA INTENÇÃO**: ela prendia o TEXTO `function
  mapaNaturezasInformadas` DENTRO da rota, e a régua mudou de casa. O que ela
  protege (a rota lê as naturezas e resolve pela régua única) continua travado,
  mais a contagem: os DOIS consumidores resolvem por nota.
  📌 **REGRA QUE FICA: campo que se declara por NOTA não pode ter porta por
  PRESTADOR.** O R-4020 já agrupa por natureza; o que faltava era a tela e a
  preferência conhecerem a nota — e o sintoma nunca é erro: é um evento aceito
  com o rendimento certo na natureza errada.

- **🚨 ISS RETIDO EM SERVIÇOS TOMADOS NÃO ERA LANÇADO — e o resumo mandava
  marcar a opção de PRESTADOS** (08/09, Paulo, CLUDE · 08/2026: *"estou
  subindo os serviços tomados e não está indo o ISS, já deixei selecionado a
  opção… o 'importar ISS destacado' é só para prestados e não tem para
  tomados, e tenho 2 notas com retenção de ISS"* — resumo do modal:
  `ISS no CFI: R$ 12,56 · ISS a importar: não selecionado — marque a opção
  acima · ISS retido: R$ 0,00`).
  🔴 **DUAS CAUSAS, UMA EM CADA APP**: (1) o CFI mandava `issRetido: 0` para
  nota do portal de SP, que grava o retido como BOOLEANO e o ISS em `valorIss`
  (corrigido lá: `issRetidoEfetivoDoc`, retido = ISS da nota **carimbado**
  `declarado-iss-integral`, mais `resumo.issRetidoPeloIssDaNota`); (2) aqui a
  linha de ISS retido só nascia com `if (prestado && issRetido > 0)`. Em
  TOMADOS a retenção é OBRIGAÇÃO do tomador (ISS a recolher) — a linha entra
  com o mesmo desenho das retenções federais de tomados (valor POSITIVO,
  `IMPOSTO_RETIDO_SERVICO_TOMADO`, conta *ISS Retido a Recolher*), e
  `total_credito` de tomados passa a somá-la.
  🚨 **E A FRASE APONTAVA UM LUGAR QUE NÃO RESOLVE** (achado 18 do CFI): o
  *"marque a opção acima"* é o **Importar ISS DESTACADO — serviços prestados**,
  que em tomados não se aplica (o ISS do prestador está no PREÇO). Ele marcou,
  consultou de novo, nada mudou. `iss_destacado_aplicavel` sai do núcleo e a
  tela DIZ *"não se aplica a serviços tomados"*; `importar_iss_destacado`
  continua false em tomados mesmo com a opção marcada.
  📌 **O CARIMBO DO CFI VIAJA** (`cfiIssRetidoOrigem` no lançamento e
  `total_iss_retido_derivadas` no resumo): número derivado do ISS da nota não
  se apresenta como lido — quem parametriza a conta precisa saber.
  📌 **REGRA QUE FICA: retenção é de quem RETÉM.** Prestado = a menos a
  receber; tomado = a recolher. Régua que só conhece um lado deixa o outro
  chegar com "R$ 0,00" — e zero atravessando o túnel parece conferido.

- **✅ O XSD DESTRAVOU O QUE DOIS ARQUIVOS ACEITOS NÃO TINHAM DESTRAVADO — e
  ele NÃO contradisse a produção: EXPLICOU** (04/09, Paulo na PEC PRONTA
  ENTREGA · 08/2026, beneficiário SCHROEDER: *"aqui já está tudo certo para
  transmitir, mas está com essa mensagem e nem está aparecendo o botão"*).
  📖 A linha: `bruto 6.136,91 · IRRF 92,05 · PIS 39,89 · COFINS 184,11 · CSLL
  61,37 · **não vira evento**`, com `0 pronto(s)` e o botão de transmitir
  sumido — ou seja, o módulo estava certo em não oferecer clique, mas o mês não
  saía.
  📌 **DE MANHÃ EU PEDI O XSD A ELE; À TARDE EU FUI BUSCAR.** A régua de 02/09
  (*"antes de pedir um arquivo ao dono, perguntar se o APP não tem a
  resposta"*) tem uma metade que eu não estava usando: **antes de pedir, ver se
  a resposta é PÚBLICA**. Medi primeiro que o repo não tinha XSD nenhum; o
  `sped.rfb.gov.br` responde **403** por esta rede (o precedente do CONFAZ e do
  SERPRO), mas `raw.githubusercontent.com` abre — e o `ACBr`, projeto que meia
  indústria usa, publica os schemas do Reinf. **Um `curl` respondeu o que uma
  semana de espera por arquivo aceito não responderia.**
  📖 **A SEQUENCE, LITERAL** (todos `minOccurs="0"`): `vlrBaseIR · vlrIR ·
  vlrBaseAgreg · vlrAgreg · vlrBaseCSLL · vlrCSLL · vlrBaseCofins · vlrCofins ·
  vlrBasePP · vlrPP`.
  🚨 **ELA FECHA OS DOIS BURACOS DE UMA VEZ**: (1) **IR e AGREGADA convivem**,
  com o IR ANTES — era esse o bloqueio da SCHROEDER; (2) **o nome da CSLL é
  `vlrCSLL`/`vlrBaseCSLL`, em MAIÚSCULAS** — o módulo listava `vlrCsll` como
  "não mapeado", e esse nome **nunca existiu**. É o `vlrPis` de novo: *o
  palpite não erra o campo, erra a CAIXA das letras.*
  ✅ **E É ISSO QUE AUTORIZA USÁ-LO — ele EXPLICA os dois arquivos aceitos**: o
  de 06/2026 usa as posições 3-4 (agregada) e o de 07/2026 as posições 1, 2, 7,
  8, 9 e 10, na ordem. Schema de mirror que bate campo a campo com DUAS provas
  de produção é **corroboração**, não dedução — a mesma disciplina que fixou a
  versão do CT-e em 19/08.
  ✂️ **E O GERADOR MUDOU DE FORMA, não só de trava**: eram DOIS blocos (os
  separados, depois a agregada), o que com os dois presentes emitiria `IR →
  Cofins → PP → Agreg` — e o XSD manda a agregada ANTES do Cofins. Virou **UM
  laço sobre a tabela do XSD**, então a ordem sai certa **por construção**, em
  qualquer combinação. `xs:sequence` com irmão fora de ordem derruba o evento —
  foi o que derrubou o R-2099 três vezes.
  ⚠️ **A TABELA É PROVADA CONTRA O ARQUIVO**, nunca digitada (a régua da
  `XSD_DERE`): o teste lê `docs/reinf/xsd/`, confere o `targetNamespace`, extrai
  a sequence e exige que a tabela do módulo seja ela, na mesma ordem.
  ⚠️ **A POLÍTICA NÃO MUDOU JUNTO, de propósito**: com CSLL a CSRF continua
  saindo **AGREGADA** — é o que o arquivo aceito de 06/2026 prova. O XSD diz o
  que é ESTRUTURALMENTE válido; ele não diz o que é semanticamente certo, e
  trocar uma forma provada por produção com base só no schema seria afrouxar
  pelo lado errado. O `vlrCSLL` fica disponível para quem o informar.
  📌 **CINCO ASSERÇÕES FORAM TROCADAS PELA INTENÇÃO, e é o retrato do dia**:
  elas diziam *"IR + agregada continua sem prova"*, *"a CSLL separada não tem
  nome"* e — a mais direta — `assert(schroeder.pronto === false)`. **Elas
  descreviam o mundo anterior à fonte.** O que cada uma protegia continua
  travado: nome palpitado não passa (agora com o nome CERTO na mensagem), a
  ordem é conferida no XML gerado, e a TELA continua sabendo antes do clique.
  📌 **REGRA QUE FICA: quando a trava depende de uma PROVA que não temos, a
  pergunta antes de esperar é "essa prova é pública?".** Leiaute, schema e
  tabela oficial quase sempre são — e um mirror que bate com o que já foi
  aceito em produção vale mais que meses de espera. O que continua proibido é o
  contrário: usar o schema para inventar o que ele **não** declara.
  🚩 **O QUE CONTINUA FORA, e vai dito**: a nota cuja **base do IR tem
  dedução** (a cooperativa do aceito de 07/2026 — 230,58 sobre 21.708,16). O
  XSD não resolve isso: é DADO que o CFI não tem, porque ele entrega o valor do
  serviço, não a base do IR. Continua saindo pelo e-CAC, nomeada na tela.

- **🚨 O AVISO NOMEAVA UMA SAÍDA SÓ, E ERA A CARA — o XSD estava fora da
  frase** (03/09, print do Paulo na PEC PRONTA ENTREGA 55.070.577/0001-61 ·
  08/2026, beneficiário SCHROEDER 13.178.324/0001-95, com o motivo e o selo
  circulados em vermelho).
  📖 A linha: `bruto 6.136,91 · IRRF 92,05 · PIS 39,89 · COFINS 184,11 · CSLL
  61,37 · natureza 15004 · **não vira evento**`. As quatro alíquotas fecham
  (1,5% · 0,65% · 3% · 1%), ou seja é IRRF **mais** a CSRF completa — a
  combinação que este módulo bloqueia porque a agregada e a separada nunca
  apareceram no MESMO `<retencoes>`.
  📌 **O BLOQUEIO ESTÁ CERTO E FICA**: chutar aqui não arrisca só a recusa —
  arrisca o evento sair **ACEITO declarando retenção diferente da que houve**,
  e recusa se conserta, declaração errada só aparece na malha. O `vlrPis` que
  nunca existiu (o nome real é `vlrPP`) é a prova do custo do palpite.
  🔴 **O QUE ESTAVA ERRADO ERA A FRASE**: ela mandava só *"entregue esta
  competência pelo e-CAC e mande o XML dela depois"* — entrega à mão,
  competência a competência, esperando **um arquivo aceito de cada
  combinação**. E o buraco aqui **não é de CONTA, é de NOME e de ORDEM**: quem
  responde isso numa leitura é o **XSD**, que é `xs:sequence` e portanto
  DECLARA o campo e a posição dele.
  ✂️ **E ELE FECHA OS DOIS BURACOS DE UMA VEZ** — o nome da CSLL separada (o
  único dos quatro tributos sem prova: IR, COFINS e PP saíram no aceito de
  07/2026) e a coexistência agregada+IR. É o caminho que já funcionou na casa:
  os XSD da **DeRE** chegaram por ZIP em 02/09 e **confirmaram** o módulo em vez
  de derrubá-lo.
  ⚠️ **NÃO É "peça o XSD EM VEZ de entregar"**: a competência vence, então a
  entrega pelo e-CAC continua sendo o que destrava HOJE. As duas saídas ficam na
  frase, com o CUSTO de cada uma dito.
  📌 **E A FRASE PASSOU A DIZER O QUANTO FALTA** (`vlrBaseIR` · `vlrCofins` ·
  `vlrPP` já provados): sem esse número, *"não vira evento"* se lê como buraco
  grande, quando é **um campo**. Causa junto do número vale para o BLOQUEIO
  também.
  📌 **REGRA QUE FICA: aviso que nomeia UMA saída, existindo duas com custos
  diferentes, manda pelo caminho caro** — é o achado 18 (21/08) com outra roupa.
  Onde a trava depende de uma PROVA que não temos, a frase lista todas as
  fontes que serviriam, não só a que eu lembrei. Travado por teste (a frase tem
  de citar e-CAC **e** XSD **e** dizer por que a sequence resolve) mais a
  ligação com a tela, provado tirando a saída nova: o teste cai.

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

## Templates e agendamentos (04/10)

Atalho do administrador para comunicação contábil centralizada no CFI, sem alterar dados contábeis. Publicação autorizada por Paulo: "pode publicar e seguir". Versão 3.4.366.

## Dividendos: origem mista por sócio (06/10/2026)
- Origem mista exige valores pagos e parcela sem ATA explícita por sócio. Somente o restante consome a ATA, com validação de cobertura e condições; não há franquia automática de 50 mil.
- Extrato, memória e R-4010 mantêm o bruto integral. Reabertura de mês aceito preserva a parcela efetiva com/sem ATA, sem escrever ou retificar recibos existentes.
- Regressão APATEL: 308.557,31 = 50.000 sem ATA + 258.557,31 com ATA; saldo de 2.996.836,22 passa a 2.738.278,91. Outro sócio com 15.300 sem ATA preservado.
- Base oficial consultada: perguntas 4–8 da Receita Federal sobre Lei 15.270/2025 (manual_padrao_rfb_per_tributacao_sutri_v2.pdf); limite de retenção e exceção de lucros até 2025 são distintos.
- Validação local: 234 scripts aprovados, 3 pulados por evidências externas ausentes e nenhuma falha no check:ci. check completo interrompido por PDF Itaú de regressão ausente; todos os testes de dividendos e sintaxe passaram. Auditoria de produção: zero vulnerabilidades. Nenhuma gravação financeira ou transmissão real realizada nesta entrega.

## 06/10/2026 — R-1000 existente na transmissão de dividendos
Relato do grupo Ferrante: protocolo 1.202610.1085695694 contém apenas R-1000, sem lote de movimento subsequente nos logs. O R-1000 ficou pendente durante a consulta síncrona e depois rejeitou MS1005; a tela obrigava nova inclusão em toda tentativa. Agora exige escolha explícita entre cadastro existente vigente e inclusão inicial; o caminho existente usa incluirR1000=false já suportado pelo servidor. Nenhuma declaração retransmitida, nenhum recibo ou saldo alterado. Teste executa a montagem real do payload para competência histórica, ambas as opções e ausência de escolha.

## 06/10/2026 — Níveis de acesso próprios do CCI
Consulta, edição e operação com seis ações configuráveis no painel de usuários, gravação transacional e auditoria imutável pelo cliente. Middleware consulta perfil atual a cada requisição; sessão também verifica exclusão e nova importação. Permissões próprias não alteram is_admin, departamentos ou responsáveis. Compatibilidade mantém acessos legados até configuração explícita. Nenhuma transmissão ou e-mail de teste.

## 2026-10-06 — Recuperação geral de carteiras e contas próprias do CCI

A auditoria identificou vínculos existentes no CCI sem representação nas carteiras do CFI. Recuperação administrativa auditada por identidade e CNPJ exatos, preservando principais, níveis efetivos e administração independente. Contas CCI sem cadastro central admitem autorização local explícita `users.acessoContabilAutorizado === true`, somente quando o CFI confirma `usuario: null`; negativa de cadastro existente e horário continuam prevalecendo. Flag lida exclusivamente do perfil autenticado; clientes não podem gravá-la. Permissões de empresa e ações não são alteradas pelo gate. Para revogar a autorização local, remover o campo via administração do banco; a recuperação não cria contas CFI ou empresas ausentes.

## 2026-10-06 — Totais de débito e crédito no Razão

Linha final TOTAL DO RAZÃO na tela, PDF/ impressão e Excel. Soma em centavos dos movimentos efetivamente contidos no razão, após filtro de período/conta, excluindo saldo anterior e sem somar saldos corridos. Testes cobrem centavos, conta, período e saídas numéricas/formatadas. PDF paginado de QA conferido visualmente.

## 2026-10-07 — Gestores de acessos e cadastro de colaboradores

Administração → Usuários inclui nomeação de gestor (admin + operação CCI), cadastro seguro em consulta e link de definição de senha, sem envio automático. Gestão revalida admin, identidade e revisão em transação auditada; cadastro Auth pendente inicia desativado e retoma sem duplicar conta. Gestor nomeado no CCI tem gate próprio, preservando horário e independência do CFI.

## 2026-10-07 — Extrato Itaú: linhas físicas e prévia completa

Corrigido descarte de movimentos legítimos iguais no PDF textual e ordem das descrições reconstruídas. A leitura posicional passa a conferir saldos impressos e diários; a prévia mostra contagem e permite percorrer todos os movimentos. Arquivo real agosto/2026 validado: 56 movimentos, créditos 890.179,61, débitos 832.258,00, saldo anterior 44.547,90 e final 102.469,51. Teste sintético cobre duplicados, quebra de descrição, omissão e deslocamento de data; dados financeiros não foram importados automaticamente.

## 08/10/2026 — Convites de vencimento nos documentos enviados

Provedor Graph inclui agenda .ics com data informada ou rotulada no texto do PDF, preservando anexos originais. Relatórios têm campo opcional de vencimento e retornam quantidade/avisos de leitura. Padrão derivado do DP; sem alteração de saldos ou transmissão de mensagens de teste reais.

## 2026-10-08 — v3.4.378 — Consulta cadastral por CNPJ

- Dados da Empresa → Informações cadastrais: botão Consultar ao lado do CNPJ; consulta BrasilAPI por endpoint autenticado e autorizado pela carteira. Consulta não grava dados.
- Prévia compara campos atuais e retornados. Campos vazios podem ser preenchidos; substituições exigem seleção. Aplicar apenas modifica o formulário, e Salvar cadastro preserva o controle de edição existente.
- Não importa regime, inscrições, carteiras, plano ou estrutura matriz/filial. Campo ausente não apaga informação manual. Vários CNAEs secundários ficam descritos para conferência, sem truncar silenciosamente no campo individual.
- Timeout de 12 segundos; falhas/limites da fonte são apresentados sem alterar cadastro. Respostas antigas após fechar/trocar empresa são descartadas; edição manual depois da consulta bloqueia aplicação obsoleta.
- Validação: teste específico de mapeamento, autorização, timeout, limites e controlador real da tela; navegador local com respostas simuladas e sem gravação de cliente. Consulta pública do CNPJ do exemplo conferida sem persistência.
- check:ci: 239 passaram, 3 pulados por ausência de evidências externas, 0 falharam. check local interrompido no fixture histórico Itaú abril ausente (sem mudança em parsers). Sintaxe HTML/JS e diff validados.

## 2026-10-08 — v3.4.379 — Correção da consulta cadastral na BrasilAPI

- Relato: CNPJ 24.377.794/0001-75 retornando consulta indisponível. Logs do CCI mostravam HTTP 502; consulta direta pelo Node reproduziu rejeição da identificação genérica, enquanto identificação explícita do integrador retornou HTTP 200 para o mesmo CNPJ. Há relato correspondente no repositório da BrasilAPI (issue 826).
- Consulta agora envia User-Agent verdadeiro ConsultorContabilInteligente/1.0 e Accept application/json. Não simula navegador, não altera permissões, não persiste cadastro automaticamente e continua respeitando limites de consulta da fonte.
- Falhas registram fonte/status ou categoria de erro sem tokens, dados pessoais ou corpo da resposta. Teste de regressão exige identificação do integrador e cobre retorno 403.
- Testes: consulta real pelo handler corrigido retornou razão social, Praça Engenheiro Hugo Brandi, nº 01 e demais campos. check:ci 239 aprovados / 3 sem evidência / 0 falhas. check local interrompido no fixture Itaú abril ausente, como na versão anterior.
- Prova adicional no Google Cloud (Cloud Build us-west1 8194aeb3-229e-40b3-90aa-c5b67bc6e7d4): Node 22, mesmo CNPJ, UA genérico recebeu 403; UA verdadeiro do CCI recebeu 200 e os dados esperados. Nenhuma gravação cadastral. Não foi possível testar o endpoint autenticado por sessão local (sem sessão disponível e sem permissão IAM de assinatura); a prova cobre a chamada externa real a partir da nuvem.

## 2026-10-08 — v3.4.380 — BTG Empresas ERF e Central de Qualidade

- Novo modelo BTG Empresas dentro do parser PJ: recompõe glifos pela posição, separa colunas, lê ordem decrescente e preserva cada linha física, inclusive os três boletos de R$ 1.689,81.
- PDF ERF de setembro/2026 contém 19 movimentos: créditos R$ 25.500,00 e débitos R$ 23.079,70, iguais ao resumo. Saldo inicial R$ 1.641,54 implica final R$ 4.061,84, mas PDF imprime R$ 4.062,04. Divergências por movimento: 01/09 +0,02; 11/09 +0,09; 14/09 +0,02; 29/09 +0,06; 30/09 +0,01. Não presumir rendimento nem criar ajuste; solicitar extrato completo/OFX para esclarecer.
- Parser reconhece o modelo, mas bloqueia importação deste arquivo por saldo divergente antes de enriquecer/gravar sessão. Central de Qualidade e análise de novo layout mostram conferência pendente, sem orientar rascunho duplicado. GEN testa somente formatos compatíveis; PDF não aciona Extrato Conciliado XLSX.
- Testes: fixture portátil anonimizada, PDF original, truncamento, saldos, boletos repetidos e fluxo real de importação sem gravação em falha. BTG PJ anterior (43), Wealth (167) e Investimento (4) preservados. Navegador com PDF.js 3.11.174 confirmou 19 movimentos e bloqueio de 0,20 no arquivo real.
- check:ci: 241 aprovados, 3 pulados por ausência de arquivos externos, 0 falhas. check local interrompido no fixture histórico Itaú abril ausente; nenhum parser Itaú alterado.

## 2026-10-09 — LAV 1244: consulta paginada para evitar travamento (3.4.381)
- Auditoria somente leitura da sessão online: 27.906 lançamentos / ~49 MB; agosto possui 446, todos com descrição/histórico, 439 com débito e crédito preenchidos. Cabeçalho persistido ainda refere junho. Nenhuma escrita ou reimportação da empresa.
- A tabela gerava todos os registros e campos editáveis de uma vez, inclusive nas atualizações após salvar. Agora limita DOM a 100 linhas por página; mantém filtros/totais/seleções/exportações integrais e índices originais para edição. Filtros/empresa reiniciam página e redução da lista ajusta limite.
- Teste executa handler real com 27.906 registros, verifica páginas, agosto, última página, lista vazia, seleção, índices e imutabilidade. Navegador local com cópia integral real confirmou 446 em agosto e navegação 101–200, sem gravação.
- Dados financeiros não foram alterados. Validação local isolada não substitui confirmação na sessão de Matheus após atualizar.


## 12/10/2026 — DARF pago pela Receita: consulta, conferência e baixa

Consulta PAGTOWEB via rota exclusiva do CFI, com confirmação de carteira pelo backend CCI. Prévia usa fonte guardada no servidor (30 minutos, por usuário e empresa), valida plano e competência da arrecadação, mostra correspondências e bloqueia duplicidade. Baixa explícita usa trava e histórico da sessão, revalida a prévia e grava identidade do documento atomicamente. Contas exigem indicação explícita do plano. Ausência fica em branco; simulação, soma divergente e desmembramento incompleto bloqueiam. Coleções por empresa: pagamentos_receita_consultas, pagamentos_receita_baixas e parametros_contabeis/darf_pago. Sem publicação; PAGTOWEB e procuração ainda exigem validação operacional.

## 12/10/2026 — Visual no estilo Apple (3.4.383)

Pedido do Paulo, o mesmo visual já publicado no Consultor DP. `tema-apple.css` (carregado depois do `<style>` do `index.html` e do `admin.html`) redefine tokens: fonte do sistema (San Francisco) com Inter do Google Fonts de reserva (substitui a Plus Jakarta Sans), neutros e azul da Apple (#0071e3), cantos maiores, barra superior escura translúcida (`rgba(22,22,23,.85)` + `backdrop-filter`), login com cartão arredondado e botão azul em pílula. Azul/índigo do Tailwind trocado pelo da Apple em todo o HTML; neutros só dentro dos `<style>`, preservando os seletores `[style*="..."]` do tema escuro (que casam estilos inline gerados por outros .js). AuditAI: paletas slate/gray/blue/indigo, fonte e cantos no `tailwind.auditai.config.js` (CSS regenerado com `npm run build:auditai-css`, Tailwind 3 mantido) e cópia no config do CDN da conciliação. Logo oficial `logo-sp.png` + `favicon.png` + `apple-touch-icon.png` e `theme-color` nas páginas; `sp-logo.png` continua para o e-mail. Trava: `scripts/test-tema-apple.js`. Pendente: `.js` de UI fora do HTML e o roxo do AuditAI seguem com as cores antigas.

## 12/10/2026 — Auditoria de dependências zerada (3.4.384)

O robô "Auditoria diária de dependências" falhava no main: `npm audit --audit-level=high` com 9 alertas (2 moderados, 7 altos), todos em dependência de DESENVOLVIMENTO — nada na imagem de produção (`npm audit --omit=dev` já estava limpo). Diagnóstico (12/10):
- `source-map-js` 1.2.1 (alto, via `tailwindcss` → `postcss`): `npm audit fix` subiu para 1.2.2.
- `braces` ≤3.0.3 (alto, via `tailwindcss` 3 → `chokidar`/`micromatch`/`fast-glob`): SEM versão corrigida publicada; a única saída do npm é o Tailwind 4 (major, reescrita que muda o CSS gerado). `postcss-selector-parser` <7.1.6 (moderado, via `tailwindcss`/`postcss-nested`) só tem correção na 7, fora da faixa que o Tailwind 3 aceita.
- `node-forge` ≤1.4.0 (alto, GHSA-86w9-cpqp-85rv, verificação de assinatura RSA PKCS#1 v1.5): dependência direta de dev, SEM correção publicada (1.4.0 é a última). Usado só por 3 testes para gerar certificado A1 sintético; produção lê o A1 com OpenSSL desde a 3.4.359.

Correção (sem `--force`, sem override de pacote sem correção):
- `node-forge` removido. Novo `scripts/helpers/certificado-teste.js` monta X.509 v3 autoassinado em DER com o `crypto` do Node (datas, CN e série controlados) e o PFX sai do `openssl pkcs12 -export` (AES-256 e PBE-SHA1-3DES com cadeia; o teste já usava o OpenSSL). `test-pkcs12-openssl.js`, `test-reinf-certificado-conferencia.js` (fingerprint = SHA-256 do DER decodificado do PEM, cálculo independente do `X509Certificate`) e `test-reinf-assinatura-lote.js` passam igual. A trava do `test-pkcs12-openssl.js` agora exige que o forge NÃO volte ao lock.
- `tailwindcss` saiu do `devDependencies`: só servia ao `npm run build:auditai-css`, rodado à mão para regenerar o `auditai/auditai-tailwind.css` versionado. O script agora usa `npx --yes tailwindcss@3.4.19` (versão fixada, Tailwind 3 mantido). Regenerado e conferido: CSS idêntico, só o banner muda de v3.4.17 para v3.4.19. O código vulnerável só roda na máquina de quem regenera o CSS, sobre arquivos do próprio repositório.

Resultado: `npm audit` → 0 vulnerabilidades (inclusive `--audit-level=high`). `check:ci`: 222 passaram, 26 pulados (evidência só no Mac), 0 falhas — igual ao main. `npm run check` completo para no primeiro PDF de evidência ausente (`/Users/.../Downloads/...`), como antes. Nenhuma tela muda. Versão 3.4.384 com nota curta de segurança no `version.json` e nas Novidades (o `test-novidades-cci-cobertura.js` exige artigo para toda versão publicada).

## 12/10/2026 — Paleta da Apple nas telas montadas por .js (3.4.385)

Pendência do PR #258: os `.js` que geram HTML/estilo de tela seguiam com azul e cinzas do Tailwind. Trocados, com o mesmo mapeamento por tom do #258 (slate/gray 50…950 → neutros #fbfbfd…#000000; blue/indigo 50…950 → azul #f0f7ff…#00264d; `rgb()/rgba()` equivalentes, ex. `rgba(15,23,42,x)`/`rgba(2,6,23,x)` → `rgba(0,0,0,x)`) e os tons próprios do mesmo papel (hero `#07152f→#2454d7` vira `#1d1d1f→#0071e3`, `#0b1220→#000000`, `#13254a→#00264d`, `#dbe4f0→#e8e8ed`, `#172033→#1c1c1e` etc.), em 17 arquivos (~350 trocas): relatorios-contabeis-ui, igrejas-conferencia-caixa, historicos-padrao, ativo-imobilizado-ui, vincular-empresa, manual-cci, ajuda-cci, parametrizacao-regime-ui, vincular-folha-pagamento, reinf/alugueis-planilha-modal, auditai/conciliacao-arquivos (modal de versão), pagamentos-receita-ui, conciliacao-manual-ui, migracao-sage-ui, server-monitor-ui (linha única do gráfico, cor de interface), planos-gerenciamento-ui, plano-consulta. Verde/vermelho/âmbar de situação e o roxo ficaram.
Decisões: NÃO mudaram (1) os PDFs do jsPDF dos relatórios contábeis (cores RGB em array — documento contábil entregue ao cliente), (2) a janela de impressão da conferência de caixa (já em cinza puro), (3) `reinf/dividendos-relatorio-layout.js` (extrato de dividendos, documento do cliente) e `email-layout.js` (casca do e-mail igual à do CFI), (4) os bundles compilados do AuditAI em `auditai/assets` (cores de série de gráfico "Circulante/Fixo").
Tema escuro: os seletores `[style*="..."]` do `index.html`/`admin.html` ganharam os valores novos (`background:#fbfbfd` → preto; `#f5f5f7`/`#e8e8ed` → #2c2c2e; `color:#1c1c1e/#2c2c2e/#3a3a3c` → #fbfbfd; `color:#515154/#6e6e73/#a1a1a6` → #d2d2d7), mantendo os antigos porque o `index.html` ainda tem estilos inline com os neutros antigos. Trava: `test-tema-apple.js` seção 4 (lista dos 17 arquivos sem cor antiga em hex ou rgb + seletores novos), provada falhando contra o código anterior. Capturas antes/depois (claro e escuro) de Ajuda, Manual, Conferência de caixa e Relatórios renderizadas sem login, com /api simulada.


## 2026-10-13 — CRM: carteira e obrigações (etapa local)

Branch codex/crm-carteira-obrigacoes a partir da main 3.4.385. Matriz de equivalência em docs/crm-carteira-obrigacoes.md. Novo módulo com carteira estrita por UID, distribuição administrativa auditada, controles por período com evidência e revisão concorrente, histórico transacional e prévia somente leitura do Checklist. Sem carga de origem, alteração de dados reais, commit, push ou deploy. Regras de acesso dos módulos antigos permanecem pendentes de migração controlada. Ver docs/crm-validacao-20261013.md para resultados e limites.

### Publicação solicitada em 13/10/2026

Paulo solicitou disponibilizar a primeira etapa no app online. Candidata 3.4.387 preparada para o fluxo branch/PR/squash e deploy oficial. Escopo permanece o descrito na matriz: controles manuais e prévia, sem migração do Jotform nem mudança do acesso legado de outros módulos. O status final de publicação deve ser conferido no workflow e em /api/version.
## 2026-10-13 — Importação direta FI IOB/SAGE — 3.4.386

- Importador financeiro de 328 posições baseado no gerador CCI e no espelho fornecido; disponível a todas as empresas conforme orientação atualizada.
- Prévia por partida, confirmação de destino sem CNPJ no arquivo, validação do plano e período, preservação de repetidos, bloqueio de reimportação e gravação sob trava/revalidação com auditoria.
- Anexo validado integralmente; testes sintéticos e Chrome local sem gravação real. `check:ci`: 246 passaram, 3 pulados por evidência externa, 0 falhas. `check` completo para no arquivo de regressão Itaú ausente. Publicação autorizada pelo Paulo em 13/10; entrega via PR e deploy oficial.

## 2026-10-13 — CRM online e acesso inicial — 3.4.388

3.4.387 publicada pelo PR #262 e workflow 38440613704, saúde e versão conferidas. Login Firebase teve falha de rede transitória e funcionou na repetição (HTTP 200). Validação autenticada encontrou bloqueio do menu CRM pelo gate de ativação. 3.4.388 permite abrir a carteira antes de ativar empresa, mantendo o bloqueio contábil e cobrindo ambos os casos em regressão.

## 2026-10-13 — CRM base Jotform (v3.4.389)
- Exportações autenticadas conferidas por aba; base oficial 1.585 linhas e V2 967. Importação aditiva em crm_registros/crm_empresas, sem regravar empresas, usuários ou lançamentos.
- Carteira unificada com busca, parâmetros por fonte/linha, origem imutável, edição com motivo/revisão/histórico, pendências de CNPJ e distribuição administrativa por UID.
- Os valores de origem não certificam entrega de obrigações. Anexos permanecem por links; fórmulas, envios e sincronização do Checklist ainda precisam da etapa de equivalência. Análise em docs/crm-base-jotform.md.
- Validação local: 250 testes passaram, três sem evidência local, zero falhas no check:ci; check completo interrompe no PDF Itaú externo ausente. Testes específicos e sintaxe conferidos.

## 13/10/2026 — Ativação por busca (3.4.390)

Entrada sem consulta da carteira com busca vazia. Busca com dois caracteres, oito resultados compactos por página e descarte de respostas obsoletas. Servidor também recusa a varredura inicial e retorna apenas identificação para ativação; carteira e ativação explícita preservadas. Regressões de consulta vazia e corrida de busca verificadas.

### 14/10/2026 — CRM: filtros combinados e dossiê (somente local)

Retomada após leitura de CLAUDE.md e histórico. Checkout limpo sem as alterações visuais não commitadas do handoff; branch `codex/crm-filtros-dossie` criada a partir de origin/main f2dd52c, versão 3.4.390. Implementados filtros de carteira após autorização e antes da paginação, visualizações pessoais com revisão transacional, navegação do dossiê e distinção cliente/obrigação/prazo. Ajustes de foco, carregamento, cores, progresso, celular e tema escuro. Nenhum dado real alterado; sem commit, push ou deploy, conforme instrução explícita.

Testes CI: 250 aprovados, 3 pulados por evidência local ausente, zero falhas. Navegador com dados fictícios validou restauração de filtros, atraso independente da conclusão, documentos e layout móvel. Detalhes, limitações e avaliação de Tabulator/Storage/Tasks/Scheduler em docs/crm-carteira-obrigacoes.md; matriz de equivalência antes do corte em docs/crm-base-jotform.md. Fórmulas, automações, cópia de anexos e aplicação do Checklist continuam pendentes; Jotform não deve ser desligado com base nesta entrega.

### Publicação autorizada do CRM (14/10) — v3.4.391

Paulo autorizou subir e fazer deploy da etapa de filtros/dossiê. Preparada a versão 3.4.391 com novidades e invalidação de cache. Fluxo branch → PR → squash-merge → deploy-app.yml, com candidata sem tráfego e promoção após health. A autorização não inclui desligar Jotform; equivalência permanece pendente conforme matriz documentada. O resultado de CI e deploy deve ser conferido nas execuções vinculadas ao PR.

### CRM como área de trabalho (14/10) — v3.4.392

Após crítica da interface publicada e autorização para seguir, reorganizada a carteira em área ampla com navegação para demandas, gestão e dossiê. Corrigido contraste usando os tokens reais; filtros recolhíveis, colunas ocultáveis e retorno preservando filtros/posição. Consulta operacional limitada e autorizada em lotes, com testes de isolamento, paginação e truncamento. QA com CSS completo do CCI, API fictícia, claro/escuro e viewport 390 px. CI local: 250 aprovados, 3 pulados, zero falhas. Conferidos por leitura os três registros genéricos: sem parâmetros importados vinculados, origem ainda não comprovada; nenhuma alteração de dados. Publicação pelo fluxo já autorizado de PR e candidata validada.

## 2026-10-14 — CRM planejamento, v3.4.393

Branch codex/crm-planejamento-completo, baseada na main ae27bfc (3.4.392). Calendário, executor/revisor, dependências, prioridade e estimativas; carga semanal completa com capacidades/ausências; distribuição transacional em lote e apoio temporário com revogação. Contrato e regras confirmadas permitem prévia e geração idempotente de competências. Nova lógica e rotas em crm-planejamento*.js, testes registrados no gate. Sem alteração automática de dados reais. Limites e pendências de equivalência documentados em docs/crm-carteira-obrigacoes.md; Scheduler e aplicação do Checklist não estão ativos. Publicação segue autorização do usuário, PR e workflow oficial.

Validação local: check:ci com 251 aprovados, 3 pulados por evidências externas ausentes e zero falhas; auditoria de produção sem vulnerabilidades. Sintaxe e testes CRM repetidos após revisão de revogação. Navegador fictício confirmou calendário semanal/mensal, dossiê, carga, tema escuro e largura de 390 px sem transbordamento.

## 2026-10-14 — CRM início visual e homologação, v3.4.394

Branch codex/crm-experiencia-profissional baseada na main cb01373. Meu início ilustrado, ícones e cores semânticas, escopo pessoal/equipe, entrada leve GET /crm/contexto sem carregar empresas e ilustração na ativação. Assets decorativos explícitos na allowlist. Testes de autorização e ausência de leitura de carteira na abertura; QA claro/escuro e celular. 251 testes passaram, 3 pulados por evidência externa, nenhuma falha; verificações de versão repetidas após bump. Usuário indicou empresa 1200 como piloto, sem autorizar inventar atribuições. Inventário privado encontrou zero expressões de fórmula no payload de 14 fontes/7.928 registros; conector retornou apenas metadados. Plano de aceite em docs/crm-homologacao-profissional.md; migração integral permanece pendente de configuração da origem e homologação real.


## 2026-10-14 — Piloto 1200 e documentos múltiplos (3.4.395)

Conferência na sessão administrativa autorizada, via Compartilhamento de Tela: ativação e dossiê funcionando; sete registros de origem disponíveis. Parâmetros exibem valor atual e original, inclusive status legado ATIVA e DEFIS ENVIADA = 1; situação contratual do CRM continua não confirmada e não foi inferida do legado. Nenhum controle operacional encontrado para o piloto. Histórico geral ainda é uma orientação para trilhas individuais. Não houve edição de parâmetros, atribuição de equipe ou baixa.

Erro reproduzido ao abrir um campo com recibo e declaração: URL uniu dois PDFs separados por newline, retornando 404. A interface passou a separar links antes de validar com URL e renderizar cada documento nas duas seções, com numeração e deduplicação no mesmo campo. Payload importado intacto. Teste de regressão cobre dois PDFs, CRLF, repetição, link explícito, escaping e esquemas/credenciais inválidos. A existência dos binários e a equivalência de obrigações continuam pendentes; administrador não homologa restrição de colaborador.

## 2026-10-14 — CRM: reconciliação da origem preservada (3.4.396)

Ferramenta somente leitura com comparação integral e relatório privado sem valores. Execução em produção: 7.928 registros / 419.095 campos, zero divergências; edições CCI não são sobrescritas. Inventário de links e limites do backup registrados em docs/crm-homologacao-profissional.md. Checklist sem credencial no serviço; fórmulas/automações não fornecidas pelo conector. Sem corte do Jotform e sem alterações de dados operacionais.

## 2026-10-14 — CRM: contrato de origem recuperado

Após disponibilização da sessão remota, lidos sem edição os formulários V2 e Checklist: condições, fórmula, opções e mapeamento de campos. Três configurações de e-mail observadas, nenhum envio. Evidência e limites em docs/crm-contrato-origem-20261014.md. Publicação 3.4.396 confirmada: workflow 38561585206, revisão 01154-kay, tráfego 100%, versão/saúde/hash conferidos.

## 2026-10-14 — CRM 3.4.397: opções nativas do formulário V2

Continuação autorizada: seletores de situação e tributação com opções conferidas, validação de servidor e preservação dos valores legados; condições de apresentação como orientação, sem dispensar obrigações nem apagar campos. Contrato restrito às duas fontes V2 e metadados não persistidos. Testes de domínio/rotas e navegador fictício. A exportação integral contém os dois campos da fórmula de saldo, ausentes na visão resumida; cálculo e comunicações permanecem pendentes de equivalência. Nenhum dado real modificado nesta validação.

## 2026-10-14 — CRM: visualizações e conferência das comunicações (3.4.398)

- Visualizações pessoais passam a persistir colunas além dos filtros, com compatibilidade para registros/telas antigas, validação booleana, revisão e isolamento por usuário.
- Navegador fictício confirmou salvar, reabrir e restaurar a tabela; nenhum dado real foi usado como teste de gravação.
- Conferidos os três e-mails V2: notificação 1 em criação/edição; resposta ao contato só em criação; notificação 2 manual. PDF desativado nos três. Capturas privadas; sem envio ou edição no Jotform. Contrato detalhado em `docs/crm-contrato-origem-20261014.md`.
- Integrações bloqueadas na origem: requer conta proprietária. Migração integral continua aberta, inclusive Checklist autenticado, anexos binários, fórmulas e homologação restrita.
- Validação local: `check:ci` com 251 aprovados, 3 pulados e 1 falha (`test-auditai-balancete-local.js`, `bad XRef entry`). A mesma falha foi reproduzida isoladamente com os arquivos de `origin/main`; não é regressão das colunas. `npm run check` também parou no leitor PDF. Testes CRM passaram; auditoria de dependências de produção: zero vulnerabilidades. Nenhum teste ou parser foi desabilitado/alterado.

## 2026-10-14 — CRM 3.4.398 publicado e integrações DEFIS conferidas

PR #276 publicado e validado em produção: revisão 01158-dox, 100% do tráfego, versão/saúde/Firestore/hash conferidos; CI remoto 229 aprovados, 26 pulados e zero falhas. A conta proprietária disponibilizada permitiu avançar na leitura das integrações. Na ação DEFIS da tabela V2 foram conferidos Teams (campos da mensagem) e OneDrive (subpastas, PDF padrão e upload RECIBO + DEFIS 2025/2026). Editores cancelados, sem salvar configuração nem executar envio. Detalhes e limites em `docs/crm-contrato-origem-20261014.md`; URLs e capturas ficam privadas. Isso substitui o bloqueio de leitura anterior, mas não comprova equivalência operacional ou autoriza desligar o Jotform.

## 14/10/2026 — CRM: separar documentos DITR e DEFIS (candidata 3.4.400)

- Consulta remota da ação ENVIO DITR - 2025 revelou Teams com campos de balanço e OneDrive apontando RECIBO + DEFIS 2025/2026. Cancelado sem salvar/aplicar/enviar.
- Paulo determinou anexo e mensagem próprios para DITR. Fonte `ditr` + RECIBO/DECLARAÇÃO confirmados no manifesto; o mesmo rótulo na fonte oficial integral permanece sem classificação presumida.
- Dossiê separa referências DITR/DEFIS/outros, cartões com ícones e prévia individual de mensagem, sem efeito externo, baixa ou dedução de exercício. Testes de domínio/rota e navegador fictício (390 px, claro/escuro) passaram.
- Produção 3.4.399 conferida antes da preparação da 3.4.400; atualização do AuditAI preservada. Auditoria de produção sem vulnerabilidades. Gate portátil: 253 aprovados, 3 pulados e falha editorial em Novidades corrigida e retestada; gate completo local interrompido pela ausência do PDF externo de regressão do Itaú. Publicação depende do gate remoto e do workflow.
- Permanecem pendentes: envio efetivo, destinos completos, PDF padrão, binários, delta da origem, Checklist autenticado/incremental, perfil restrito real e restauração isolada. Jotform permanece ativo.

## 14/10/2026 — CRM 3.4.400 publicado: documentos DITR/DEFIS

PR #279 mesclado (df883648130a688da0fc6122b7dca49c9c083df9), workflow 38575902919 concluído com sucesso. Revisão plano-contas-iob-01162-kuq com 100% do tráfego. API de versão e saúde confirmaram 3.4.400 e Firestore conectado; hashes do JS/CSS do CRM iguais aos locais. Gate portátil local final: 254 aprovados, 3 pulados, zero falhas. CI remoto: 230 aprovados, 27 pulados por evidências ausentes, zero falhas. Auditoria de produção sem vulnerabilidades. O gate completo local depende do PDF externo de regressão do Itaú ausente.

Safari remoto exibiu o aviso e rodapé 3.4.400, porém a recarga voltou ao login. Conferência autenticada desta entrega pendente de nova entrada do usuário. Teste visual fictício validou documentos/prévia DITR e celular/temas; não equivale a teste de envio real. Nenhuma mensagem enviada, binário copiado ou obrigação baixada. A migração integral e o desligamento do Jotform continuam pendentes.


## 2026-10-14 — Status e homologação remota CRM 3.4.400

Safari remoto autenticado: piloto 1200 com responsável e apoio preservados, dossiê acessível, quatro referências DEFIS e quatro outras referências; DITR sem link, sem inferir dispensa. Prévia DEFIS abriu sem envio; contrato não confirmado e zero controles permanecem pendentes. Produção 400 saudável, revisão 01162-kuq com 100% de tráfego. Quatro testes focados passaram; gate integral não repetido. Credencial Checklist ainda ausente (somente presença conferida). Matriz de critérios restantes atualizada em docs/crm-homologacao-profissional.md; migração e desligamento do Jotform não concluídos. Sem mudanças de dados ou código do produto nesta etapa.

## 2026-10-14 — CRM: busca exata, rotina e documentos (3.4.401)

Busca por número exato priorizada com paginação estável; Meu dia inclui próximos sete dias e lacunas de planejamento; documentos agrupados por URL/categoria preservam fontes, com prévia compacta e celular. Testes de busca/paginação/permissões e QA fictícia claro/escuro. `check:ci`: 254 aprovados, 3 pulados, 0 falhas; gate local bloqueado pelo PDF Itaú externo ausente. Preparação do piloto 1200 e limites da homologação em `docs/crm-homologacao-profissional.md`. Sem alteração de dados operacionais ou envio.

## 2026-10-15 — CRM: segunda rodada de validação

Main/produção 3.4.402, revisão 01167-hiw com 100% do tráfego, saúde/Firestore ok e assets CRM correspondentes. Reconciliação somente leitura: 7.928 registros, 419.095 campos, zero divergências contra snapshot 13/10; não cobre delta posterior Jotform. CI local: 257 aprovados, 2 pulados, 0 falhas; gate integral para no PDF Itaú ausente. Checklist sem credencial. Safari remoto atualizado mostrou 3.4.402 e voltou ao login (persistência NONE exigida pelo código/teste). Detalhes e pendências em docs/crm-homologacao-profissional.md. Sem alteração de dados de negócio ou código da aplicação.

## 2026-10-15 — FI/SAGE: TAB no histórico (3.4.403)

O arquivo FI232232.04 reproduziu a rejeição na linha 29: TAB (0x09) na posição 107 do histórico, com 328 posições válidas. O leitor agora converte TAB em um único espaço apenas nas posições 75–217, preservando o restante do registro. A impressão de deduplicação usa a forma normalizada, impedindo reimportação entre original e cópia limpa. Outros controles e TAB fora do histórico continuam bloqueados, com código e posição na mensagem.

Regressão portátil percorre as 328 posições e verifica controles proibidos, equivalência de impressão e buffer imutável. Arquivo original: 70 lançamentos, R$ 9.217,39, resultado idêntico à cópia limpa; nenhum lançamento persistido. Publicação autorizada pelo usuário; verificar resultado do deploy.

## 2026-10-15 — Piloto CRM 1200 autenticado na 3.4.402

Safari remoto com usuário administrador: busca exata em primeiro lugar, equipe, ausência de controles, agrupamento DEFIS (2 links/4 referências), outros documentos (2/4), DITR separada e prévia sem envio conferidos. Evidências privadas em cci-crm-qa-20261015; detalhes em docs/crm-homologacao-profissional.md. Três cadastros genéricos com identificadores sequenciais vistos na lista geral: origem pendente, sem exclusão. Nenhuma alteração de código/dados nem novo deploy. Critérios de corte e teste com colaborador restrito continuam pendentes.

## 2026-10-15 — CRM 3.4.404: Checklist assistido e preparação do delta

Implementada aplicação individual administrativa do Checklist: reconsulta integral com assinatura, revisão do contrato, confirmação/motivo, transação com auditoria e idempotência global por submissão. Preserva carteira, controles e lançamentos; bloqueia origem alterada, eventos ambíguos/futuros, retorno com contrato anterior e saída sem contrato ativo. Credencial de produção ainda ausente; nenhuma aplicação real executada. Não foram criados segredos ou ampliadas permissões.

Novo planejador offline de delta exige vínculo explícito quando muda o manifesto, preserva edições CCI e sinaliza conflitos sem escrita. Inventário privado da exportação 13/10: 4.316 combinações empresa/link, 10.839 referências, 53 combinações com identidade inválida; nenhum binário copiado. Ver docs/crm-base-jotform.md.

Validação: check:ci 258 aprovados, 2 pulados por evidência externa, zero falhas. Gate local para no PDF Itaú externo ausente. Navegador fictício: revisão, motivo, confirmação e retorno de aplicação; celular 390×844. Evidências privadas cci-crm-qa-20261015/cci-403-checklist-ficticio.png e cci-403-checklist-celular-ficticio.png. Não equivale a homologação real. Jotform permanece disponível.


## 15/10/2026 — CRM: filtros operacionais, histórico e documentos

Implementados filtros operacionais combinados com paginação explícita, leitura do histórico de gestão no dossiê e busca/categorias documentais. Testes de autorização, revogação, limites e paginação; validação visual fictícia em desktop/celular. Sem gravação de dados reais ou envio externo. Detalhes e pendências em docs/crm-homologacao-profissional.md.


## 2026-10-15 — Contraste da prévia FI (3.4.406)

Corrigida mistura de fundo branco do modal com texto claro herdado do modo escuro. Estilos concentrados em tema-apple.css, escopo importacaoFIDialog, com cabeçalho azul, linhas alternadas, valores destacados e foco visível. Prévia visual conferida nos dois temas na sessão autorizada, sem importar lançamentos. Publicação autorizada pelo usuário.

## 2026-10-15 — Dividendos: alteração societária por competência (3.4.407)

Novo fluxo administrativo separado do cadastro da ATA: registra data contratual, competência inicial, motivo e quadro societário versionado. Snapshot legado mantém as competências anteriores; os CPFs retirantes são preservados para consulta e retificação. Novo CPF exige saldo ATA zero explícito, sem transferência automática; retirante com saldo pendente bloqueia a mudança. Preparações, aceites e movimentos a partir da vigência impedem sobrescrita. Auditoria e alteração gravadas na mesma transação, com revisão otimista.

Consultas mensais e cálculos escolhem o quadro vigente; cadastro comum não contorna a proteção de histórico. Validação fictícia cobre contrato em junho e vigência em julho, recibos anteriores, bloqueios por competência, autorização, falha atômica, repetição e retificação do retirante. Tela validada localmente sem dados de produção. CI: 259 passaram, 2 sem evidência externa, zero falhas; gate completo local interrompido pelo PDF Itaú externo ausente. Nenhum cadastro real alterado; commit e publicação autorizados pelo usuário.

## 2026-10-15 — Admin: aba Topologia do departamento (PR #293)

Aba Topologia no /admin, só para is_admin, abre o organograma (serviço topologia-contabil, southamerica-east1) sem novo login. Rota /api/admin/topologia/passe gera passe HMAC de 2 min, uso único, com e-mail e nome; módulo puro topologia-sso.js com teste. Env no plano-contas-iob: TOPOLOGIA_URL e TOPOLOGIA_SSO_SECRET (segredo em ~/.topologia_sso_secret, nunca no chat); sem elas a rota responde 503. Admin do CCI entra como Gestor, salvo cadastro próprio na Topologia. Lição: nomes de revisão do Cloud Run não seguem a ordem de criação; confira por creationTimestamp antes de mover tráfego.

## 2026-10-15 — CiA: primeira etapa de assistência contábil (local)

- Implementada na branch `codex/cia-assistente-contabil`, a partir de `origin/main` eff1616, versão-base 3.4.407 também observada no endpoint de produção. Sem commit, push ou deploy.
- Novo painel CiA no menu, contexto da empresa ativa e período; consulta somente à sessão salva online. Troca de contexto cancela e descarta respostas anteriores.
- Rota autenticada com controle de carteira antes e depois da análise; quota individual, leitura sem gravação e falha segura para sessão ausente/inválida.
- Conferência determinística: contas faltantes, valores ausentes/inválidos, datas inválidas e possíveis repetições (não comprovam duplicidade). Evidências limitadas a 30; contagens completas.
- Interpretação opcional pelo provedor de IA existente, com base oficial e dados mínimos. Falhas mantêm a conferência e indicam indisponibilidade da interpretação. Não consulta CRM, conciliações ou saldos de abertura e não certifica fechamento.
- Testes de domínio/rotas em `scripts/test-cia-contabil.js`; teste de navegador com dados fictícios validou desktop, celular, texto não interpretado como HTML, troca de empresa, respostas tardias e Escape. Homologação autenticada com dados reais e provedor real pendente.
- Validação final: `npm run check:ci` = 261 passaram, 2 pulados por evidências externas ausentes (Itaú e Santander), 0 falharam. `npm run check` interrompido no PDF externo ausente de regressão Itaú. `npm audit --audit-level=high` = zero vulnerabilidades. `git diff --check` limpo. Capturas fictícias em `output/cia-desktop.png` e `output/cia-mobile.png`.
- Publicação autorizada por Paulo em 15/10/2026: commit, PR e deploy pelo fluxo oficial. Preparada versão 3.4.408 com marcadores, Novidades e roteiro `docs/cia-apresentacao-colaboradores.md`; homologação autenticada continua pendente até validação efetiva.

- Revisão de publicação CiA: o middleware geral classificava o novo POST como operação completa. Adicionada exceção exata de consulta para `/api/cia/perguntar`, preservando autenticação e carteira na rota. Teste inclui perfil somente consulta e mantém outras rotas bloqueadas. Primeiro workflow cancelado antes da publicação para incorporar a correção.


## 2026-10-15 — CiA no canto inferior direito (3.4.409)

- Pedido de Paulo: abrir como os demais aplicativos, no canto inferior direito e já aberta. Painel não modal após login, com minimização e botão persistente para reabrir; sem bloquear a tela nem tomar o foco na abertura automática.
- Sessão encerrada cancela a consulta, limpa informações e oculta painel/botão. Respostas antigas continuam sendo descartadas na troca de empresa/período. Nenhuma mudança nas regras contábeis.
- Validação em navegador com dados fictícios: abertura automática, interação na tela de fundo, minimizar/reabrir, sair/entrar, foco preservado e tamanho de celular sem rolagem lateral. Consulta autenticada real permanece pendente.


## 2026-10-15 — v3.4.410: carregamento do CRM

Calendário em produção levou 99,844 s por leitura de controles e contexto por empresa. Substituída por collectionGroup limitada (excesso gera erro, nunca total parcial), com validação de caminho e carteira atual após leitura. Filtros operacionais e trabalho usam paralelismo limitado a 10. UI limita consultas a 25 s e gravações a 60 s, libera controles e mantém saída; resposta tardia não renderiza. Testes cobrem revogação, isolamento, 965 empresas sem N+1, limite, saída, timeout e recuperação.

## 2026-10-16 — CRM e revisão Topologia (3.4.411)

Integração administrativa sob demanda no CRM; passe sem cache, URL HTTPS sem credenciais e validação de assinatura/validade. Revisão do serviço externo documentada em docs/crm-topologia-revisao-20261016.md: sessão sem revogação imediata, replay entre instâncias, escopo de líderes, concorrência e contagem manual. Correções do receptor externo e integração de dados não foram publicadas por esta mudança. Checklist sem credencial configurada, anexos e reconciliação final continuam impeditivos ao desligamento do Jotform. Nenhum dado real alterado.

## 2026-10-16 — Topologia com carteira nativa (3.4.412)

Substituída incorporação externa na área CRM por visão baseada nos mesmos cadastros e controles. Administrador delega líderes/equipes com revisão/histórico; líderes só distribuem dentro do escopo completo da equipe. Redistribuição usa transação canônica, vigência imediata e motivo obrigatório. Executores/revisores existentes preservados e contabilizados mesmo após transferência. Sem atribuições reais automáticas. Testes de escopo, escalada, conflito, revogação e UI móvel fictícia passaram; consultar docs/crm-topologia-revisao-20261016.md para limites e pendências.

## 2026-10-16 — acesso único à Topologia (3.4.413)

Admin passa a abrir a mesma interface nativa do CRM, em vez do iframe externo. Elimina a ambiguidade de duas fontes de contagem/distribuição. O serviço externo não foi apagado nem teve seus dados alterados; suas posições não foram automaticamente transformadas em permissões. Lideranças exigem delegação explícita na Topologia do CRM.

## 2026-10-16 — CRM 3.4.414: saneamento preservando origem

Implementada conferência administrativa do vínculo de registros importados, com CNPJ válido, nome exato do cadastro, confirmação, motivo, revisão transacional e histórico. Campos originais e origem imutáveis; nenhuma distribuição automática. Ajustados cartões/formulários da Topologia e adicionados filtros de qualidade. Testes de isolamento, conflito, preservação e relatório; prévia fictícia desktop/celular. Sem nova carga do Jotform ou alterações de empresas reais nesta etapa. Detalhes e limites em docs/crm-base-jotform.md.

## Topologia: escopo do departamento — 3.4.415

Corrigida a inclusão de todos os usuários corporativos. CRM consulta a API do cadastro central do CFI e exige departamento `contabil`, sem inferir por papel de administrador, acesso ao app ou primeiro nome no Jotform. Lista e distribuição validam a mesma regra; falha da integração não amplia o escopo. Contas locais inativas e identidades duplicadas por e-mail não são elegíveis para novas atribuições. Vínculos existentes são preservados. Testes incluem departamento externo, administrador externo, duplicidade e indisponibilidade da origem. Sem nova importação de dados do Jotform nesta correção.

## 2026-10-16 — SAGE serviços prestados: notas zeradas e código decimal (3.4.416)

Relatório DAXX 1183 jan–jul/2026 reproduziu leitura de 222 notas e R$ 7.282.720,64 contra total oficial R$ 8.205.880,26. Código de serviço decimal não entrava no caminho tabular quando havia outras linhas com código inteiro. Ajuste reconhece ambos, confere 338 notas, separa 87 notas explicitamente zeradas e entrega 251 lançamentos no total oficial. Exceções identificadas por nota, data e cliente na tela; base/ISS não zerados e campos monetários incompletos bloqueiam. Nenhum lançamento ou cadastro real alterado. Testes cobrem o PDF original por variável SAGE_PRESTADOS_PDF e casos portáteis. Publicação autorizada pelo usuário.

Validação final: check:ci com 262 aprovados, 2 pulados por evidências externas ausentes e zero falhas. Teste dedicado executado também com o PDF original da DAXX; regressões reais SAGE tomados/prestados e retenções passaram. check local completo interrompido por fixture externa Itaú ausente, sem relação com esta alteração. Evidências locais em output/daxx-sage-prestados-20261016 (conferência e relação das 87 notas zeradas).

## 2026-10-16 — Cancelamento administrativo de preparação mensal de dividendos (3.4.417)

Novo cancelamento exige administrador, motivo, revisão do mês e revisão da ATA. Bloqueia recibos, movimentos, envios existentes (inclusive pendentes), controles sem competência válida, preparações posteriores e vigência societária posterior. Arquiva a preparação com ator/motivo/data na mesma transação, remove somente o rascunho ativo e incrementa revisão sem alterar valores. Versões anteriores permanecem; novos salvamentos usam identificador único para nunca sobrescrever versões após cancelamento/recriação. Nenhuma operação de cancelamento realizada em produção.

Diagnóstico somente leitura: S&P possui dois aceites de janeiro/2026, com consumo ATA de R$ 49 mil em um deles; versões antigas da preparação usavam ATA e a revisão 5 usa lucros posteriores, mas o aceite antigo permanece. NOB não possui rascunhos, aceites, posições nem movimentos neste controle; cadastro tem R$ 5.966.714,79 de total e R$ 5.566.714,79 de saldo. Recomposição depende de origem comprovada, solicitada ao usuário. Não houve alteração em nenhum desses cadastros. Publicação autorizada pelo usuário.

Validação: 263 testes aprovados, 2 pulados por fixtures externas ausentes, zero falhas no check:ci. Cancelamento seguido de recriação testado sem perda de versões nem mudança de saldo. Testes de autorização, isolamento, duplicidade, concorrência e falha atômica passaram. Sintaxe inline e tema conferidos. Nenhum cancelamento real efetuado.

Conferência complementar NOB: o usuário confirmou que os valores por sócio são iniciais. Lotes antigos mostram retornos de sucesso em produção em abril, maio e setembro; maio tem metadado ATA de R$ 350 mil. Abril e setembro não preservam o valor no documento do lote. Não é possível atribuir a diferença restante de R$ 50 mil sem os XMLs/eventos completos; nenhuma recomposição foi realizada. O diagnóstico anterior era limitado às coleções do controle mensal novo.

## 17/10/2026 — CRM: Checklist mantido e documentos privados (3.4.425)

Usuário definiu permanência exclusiva do Checklist no Jotform. Importação adicional oficial de 1.586 linhas verificada sem modificar registros anteriores; detalhes e limites em docs/crm-base-jotform.md. Prévia real Checklist 1.431/1.346 pendentes, sem aplicação. Migração de binários iniciada em bucket privado; nova rota valida carteira, vínculo e integridade antes da entrega. Testes cobrem troca de empresa, revogação durante download e tamanho divergente. Publicação e homologação devem ser confirmadas por evidências, não por este registro de implementação.

Validação local completa interrompida por ausência do PDF externo de regressão Itaú (E - EXTRATO ITAÚ ABRIL 2026 (1).pdf). Nenhum parser alterado. Auditoria npm sem vulnerabilidades. Testes específicos CRM, permissões, integridade multiusuário e novidades aprovados; gate CI integral registrado após estabilizar a versão.

Gate final desta etapa: 263 aprovados, 2 pulados por evidências externas ausentes, zero falhas.

## 17/10/2026 — Engenharia reversa funcional CRM

A pedido de Paulo, separadas automações para construção nativa posterior. Matriz em `docs/crm-engenharia-reversa-20261017.md`, com oito itens de automação, dependências de origem e lacunas reais do CCI, incluindo upload/versionamento ainda ausente. Implementada prévia/aplicação explícita da regra `{37}` SALDO JANEIRO 2026 → SALDO RESIDUAL, sem arredondamento/subtração, com transação, revisão, motivo e histórico; entrada alterada/vazia não sobrescreve residual manual. Apresentação EMPRESAS condicionada ao saldo documentada na interface. Dados reais preservados.

## 17/10/2026 — CRM operacional, Jotform mantido para consulta

Escopo alterado por Paulo: não copiar novos anexos, manter Jotform para consulta. Modais de referência HTTPS com atualização/histórico por empresa; sem upload/cópia de binários. Topologia mostra regimes da carteira e vigência canônica; Checklist recebe busca, filtros e orientações. Ensaio isolado: 14.543 documentos restaurados no emulador e comparados integralmente; permissões de administrador/colaborador/revogação conferidas sobre cadastros reais restaurados, sem alteração em produção. Limites e evidências em `docs/crm-operacao-20261017.md`.

## 17/10/2026 — CRM: central de destinatários e modelos (3.4.428)
Solicitação: iniciar automações pendentes e permitir que admins configurem quem recebe por e-mail ou Teams. Entregue catálogo A01–A08, modelos e destinatários por regra, revisão/motivo/histórico e prévias auditadas idempotentes. Envios, gatilhos automáticos, PDFs e agenda não implementados nesta etapa; API rejeita ativação. Sem cópia de anexos ou mudanças de carteira. Detalhes e próximos passos em docs/crm-automacoes-nativas.md.

## 17/10/2026 — Central compartilhada CRM / Aplicações Financeiras
Componente único em notificacoes-ui.js, regras F01–F03 por empresa, competência e histórico segregados. CRM mantém catálogo e configurações anteriores; rotas usam registrador comum e autorização administrativa atual. Solicitação manual de extratos preservada; central ainda não dispara mensagens. Testes de isolamento e compatibilidade, navegador com duas empresas fictícias. Detalhes em docs/notificacoes-compartilhadas.md.

## 2026-10-17 — Notificações: envio manual e registros PDF (3.4.430)
- Administradores mantêm destinatários/modelos. Prévia auditada liga ao envio por destinatário, com revalidação e reserva transacional; repetição apenas de recusas explícitas, sem reenvio de resultados incertos.
- PDF dos registros DEFIS e DITR, sem cópia de anexos Jotform nem baixa contábil.
- Testes de provedor, carteira, revisão, repetição entre prévias, recusa, incerteza e PDF; navegador com servidor de teste e provedor simulado. Nenhuma mensagem real enviada.
- Teams, gatilhos automáticos e agendas continuam pendentes; não considerar painel integralmente concluído. Detalhes em docs/notificacoes-compartilhadas.md.

## 2026-10-17 — Central de notificações completa (3.4.431)
- Times/CRM e Aplicações Financeiras: conexão Teams via Workflows protegido no Secret Manager; agenda única/diária/semanal/mensal, eventos novos de cadastro, escopo por empresa ou global no CRM, pausa e repetição somente de recusa confirmada.
- Scheduler OIDC exclusivo, trava global, fila com idempotência, revisão e autorização revalidadas antes do transporte. Checklist agendado apenas consulta. Prévia automática não pode ser reenviada manualmente.
- Infra provisionada; regras reais não ativadas. Testes de interface e backend usam dados/provedores fictícios, sem mensagens reais. Guia: docs/notificacoes-administracao.md.
- Validação: check:ci 268 aprovados, 2 pulados, 0 falhas; npm audit --audit-level=high sem vulnerabilidades. check local interrompido apenas por fixture externa ausente do Itaú (`E - EXTRATO ITAÚ ABRIL 2026 (1).pdf`).

## 18/10/2026 — Gemini: o Flash sai da lista da conta (opção A do Paulo) · v3.4.432

- Paulo: "segue com o plano A". O Gemini 4 só tem `gemini-4-argon` (raciocínio pesado); o CCI usa Flash. Antes: `gemini-3.8-flash` fixo no env do deploy e conferido por NOME no health.
- `gemini-modelo.js` (porta da régua do CFI, só a linha Flash): o mais novo Flash da conta com versão ≥ 3.8, sem lite/tts/embedding, estável antes de preview; pino por env (`GEMINI_MODEL`/`GEMINI_FLASH_MODEL`) vence; sem lista → `gemini-3.8-flash`.
- `server.js`: a escolha roda na sonda do boot (`conferirModeloGeminiNaConta`) e a cada 6 h; a sonda continua perguntando pelo PRÓPRIO modelo escolhido; `/api/health` ganha `gemini_model_origem`, `gemini_model_motivo`, `gemini_piso_flash`. Chat (Ajuda e CiA) segue o mesmo Flash (`modeloChatGemini()`), salvo pino próprio.
- Deploy: tira `GEMINI_MODEL/FLASH/CHAT` do serviço (`--remove-env-vars`) e o gate passa de "nome igual a gemini-3.8-flash" para "Flash da família 3.8 ou superior" (`flashNoPiso`), na candidata e na produção. Testes: `test-gemini-modelo.js` (novo) e `test-gemini-model-version.js` (contrato reescrito).

## 18/10/2026 — WhatsApp do CCI pelo SP Connect (G5)

- `whatsapp-cfi-client.js`: com `SP_CONNECT_URL` no serviço, status, templates e envio vão ao Connect (mesmas rotas `/api/admin/whatsapp/*`; o Connect aceita o token do `projetos-app-sp`). Sem a variável, segue o CFI. Trava em `scripts/test-empresa-cadastro-whatsapp.js`.

## 19/10/2026 — BB Conta atual: valor alto lido do Saldo (Casa Betinho, jul/2026) · v3.4.433

- Sintoma: PDF BB "Cliente - Conta atual" (ag. 1192-4, c/c 50710-5) importava 3 de 5 lançamentos; TEDs de 285.000,00 D e 273.700,00 D entravam como 164,49 C e 78,22 C (o Saldo) e os créditos de 285.155,37 e 273.613,73 sumiam.
- Causa: valor que não cabe na célula sai com o número em y+4,8 e o C/D em y-4,8 em relação à data. `extrairTextoPDFBB` agrupava só por y arredondado, então o valor virava linha antes da data, o C/D linha depois, e `parseLinhaLancamentoBB` só achava "Saldo C" na linha da data.
- Correção: `montarLinhasPaginaBB(itens, { juntarCelulasQuebradas })` devolve à linha da data (tolerância 6pt) fragmentos que são só valor ou só C/D. Só o caminho Conta atual liga a opção; o "mais/menos" segue igual.
- Conta atual agora expõe `saldo_anterior`, `saldo_final`, `saldos_conciliados` (sem bloquear) e a tela avisa quando a soma não bate.
- Teste sintético em `scripts/test-bb-conta-atual.js` com as coordenadas reais, sem nomes (o PDF do cliente não foi versionado: repo público).

## 19/10/2026 — Relatórios: DFC método indireto (pedido de cliente, todas as empresas) · v3.4.434

- Pedido do Paulo/cliente: "Demonstração do Fluxo de Caixa (DFC) pelo método indireto" no menu Relatórios, para todas as empresas. Referência de linhas: DFC indireto do Office Contábil.
- `dfc-indireto.js` (puro, `CCIDFCIndireto`): recebe as linhas de `CCIRelatoriosContabeis.balancete` e classifica pelo código estrutural: 1.1.1 caixa e equivalentes; 1.1.x e 1.2.1 ativo operacional (grupo de 4º nível); 1.2.x com DEPRECIA/AMORTIZA/EXAUST soma ao lucro; demais 1.2.x investimento (3º nível); 2.1/2.2 passivo operacional, salvo EMPREST/FINANCIAMENT/MUTUO/DEBENTURE sem TRIBUT/PARCELAMENTO (financiamento); 2.3+ PL em financiamento; 3+ resultado. Efeito de cada conta = créditos − débitos do período.
- Período: competência = acumulado de jan até o mês (como o Office); intervalo personalizado é respeitado. Implantação no meio do ano (abertura sem lançamento antes no exercício) começa na competência da abertura.
- Lucro = contas de resultado sem os lançamentos `encerramentoContabil`; encerramento manual aparece como variação do PL (nota no relatório). Alertas: sem movimento, conta fora do plano, 1.1.1 sem cara de disponível, soma ≠ variação do caixa.
- Revisão Codex (PR #325): lançamentos resultado ↔ PL (encerramento com ou sem marca do CCI) e pares sem caixa (investimento × passivo/empréstimo/PL; empréstimo × PL) são anulados lançamento a lançamento e descritos nas notas (CPC 03). `contaCanonica` passa a ser exportada pelo core.
- UI: aba `dfc_indireto` em `relatorios-contabeis-ui.js` (tela, PDF, Excel). Teste `scripts/test-dfc-indireto.js`. Fora do escopo: comparativo de 2 anos ("Imprimir 2 anos" do Office).

## SharePoint — preparação da integração documental (21/10) · v3.4.435

- Base do monitor por biblioteca com leitura Delta pelo proxy existente, inventário inicial silencioso, checkpoints e eventos/fila transacionais. A associação por pasta/CNPJ usa a carteira e a topologia existentes; não duplica empresas ou distribuição.
- Reprocessamento administrativo preserva reservas de entrega, aceitações e resultados incertos. Departamento, permissões SharePoint e destino continuam sujeitos à validação antes de qualquer envio.
- Monitoramento e novos envios documentais permanecem desativados nesta release. Homologação de uma biblioteca real e validação dos canais continuam pendentes; não houve envio real nos testes.
- Validação específica já registrada: 184 testes CCI e 17 do proxy aprovados em Node 20, sem falhas ou pulados. Workflow de PR inclui `npm ci` e `npm run check:ci`, preservando o relatório de evidências externas ausentes. Guia: `docs/crm-sharepoint-notificacoes.md`.
- Versão, cache-busters, novidades e indicador atualizados; as 137 notas anteriores de `version.json` foram preservadas junto da nova nota de preparação.

## Cadastro: salvar quebrado pelo evento de notificação (21/10) · v3.4.436

- Sintoma: "Value for argument documentPath is not a valid resource path" ao salvar Dados da Empresa (PATCH `/api/empresas/:cnpj/cadastro`) e ao criar empresa. Regressão da 3.4.431 (#321).
- Causa: `eventoRef` em `notificacoes-motor.js` chamava `doc(id||undefined)`; o SDK real só gera ID com `doc()` sem argumento. O banco falso dos testes aceitava `undefined`.
- Correção: `id ? col.doc(id) : col.doc()`. Regressão com o SDK real (`new Firestore`, sem rede) em `scripts/test-notificacoes-automacao.js`.

## 21/10/2026 — v3.4.439: CFOP do CFI sem troca no CCI e trava de reimportação por nota

- Paulo: NF 285590 (NOVA ERA 09/2026) com 2407 no Livro de Entradas do CFI e 1929 no CCI. O CCI só repassa `gruposCfop`; a troca era no CFI (`movimento-nfe-contabil.js` invertia o 1º dígito sem `cfopDoLancamento`). Correção no CFI, na mesma régua do Livro.
- CCI: `cfiLancamentoId` leva o CFOP, então a trava antiga deixava a mesma nota entrar de novo com CFOP novo. `repetidosMovimentoFiscalCfi` (em `movimento-fiscal-cfi.js`) compara também `cfiDocumentoId` e mostra CFOP antigo → novo. Competências importadas antes da correção: remover a importação e reimportar.

## 21/10/2026 — v3.4.440: trava de digitação pelo último encerramento

- Paulo (NOB Imóveis, fechamento trimestral): março/2026 encerrado e fevereiro/2026 ainda aceitava digitação. Regra: encerrada uma competência, ela e todas as anteriores ficam travadas para incluir/alterar/excluir (inclusive importações), sem encerrar nem apurar os meses anteriores. Correção vai para o período posterior.
- Módulo puro `trava-digitacao-contabil.js` (UMD, servidor e navegador). Marco = maior `periodos_contabeis` com status `fechado`; `reaberto` não conta. Usado em `impedirAlteracaoPeriodosFechados` (autosave, migração SAGE, exclusão administrativa), FI, DARF pago, ativo, evento patrimonial e `lancamentos-edicao-lote.js` (tela).
- Decisão: reabrir o encerramento mais recente devolve o marco ao encerramento anterior. Só o mais recente pode ser reaberto, e não se encerra mês anterior ao marco (`PERIODO_POSTERIOR_FECHADO`).
- Fora do escopo: conciliação manual S/N (não altera lançamento) segue travando só a competência encerrada.

## 21/10/2026 — v3.4.441: SAGE retidos prestados, mensagem aponta a NF que ficou de fora

- Paulo (EDSON PADUAN, jan/2026): "Retenções de serviços prestados" travava com soma R$ 5.757,45 × total R$ 6.532,45 e IRRF 76,54 × 88,16. A NF 0000400 tinha compensação impressa "/ /", base 0,00 e só IRRF 11,62; `parsearLinhaDemonstrativoRetidos` exige a data e a linha sumia em silêncio.
- Decisão do Paulo: a trava está certa, sem exceção. Toda NF deve ter valor e data; nota sem data da compensação NÃO entra.
- Entregue: linha que começa com modelo + data e não casa o leiaute vai para `linhas_nao_lidas` ({documento, data, motivo, texto}), entra em `campos_totais_divergentes` (bloqueia mesmo com total batendo) e a mensagem diz "NF X de dd/mm/aaaa, sem data da compensação" ou "linha fora do leiaute" e pede para corrigir na SAGE. Teste `scripts/test-sage-retidos-notas-nao-lidas.js`.

## 21/10/2026 — v3.4.442: central de notificações no painel Admin

- Paulo (print): CRM → Gestão da carteira → Automações do CRM dava "window.abrirCentralNotificacoes is not a function". Causa: `admin.html` carregava `crm-contabil-ui.js` sem `notificacoes-ui.js`, `notificacoes.css` e `crm-sharepoint-ui.js` (o `index.html` já carregava). Trava em `test-notificacoes-compartilhadas.js`: toda página que abre o CRM carrega essas dependências antes.
- Decisão do Paulo: Teams continua por chat ou canal (Workflows), sem cadastro de usuário do tenant. "Ficha Financeira" foi engano de nome. Manual do usuário em PDF entregue nos arquivos do projeto (notificacoes/teams-ficha-financeira).

## 21/10/2026 — v3.4.443: automações criadas pelo administrador e central didática

- Paulo: a central abriu na 3.4.442, mas as regras fixas (A01–A08, F01–F03) não serviam e não havia como criar um aviso. Pediu também layout mais didático, com cores e símbolos.
- Automações próprias: ids reservados P01–P20 por módulo (`crm-automacoes.js`, `personalizada()`); `regra()` devolve um contrato comum (gatilho só `manual`, agenda permitida) e o nome/modelo/canal moram no documento de configuração (`personalizada:true`, `nome`). A central lista pelo `where('personalizada','==',true)` e devolve `proxima_personalizada`. Sem exclusão nesta versão (para parar, não ativar/pausar a agenda).
- Personalizadas aceitam `{{competencia}}` também no CRM (agenda com competência fixa/atual/anterior). Variável usada no texto e vazia bloqueia a prévia com "Informe X: o modelo usa {{x}}" (ausente ≠ vazio). Prévia ganhou `titulo` (nome da regra), usado no assunto do e-mail e no cartão do Teams no lugar do id.
- UI (`notificacoes-ui.js`/`notificacoes.css`): guia de 4 passos, situação ✅/⚠️ por cor calculada só do que está salvo (Teams exige conexão do mesmo destino), ícone por canal, passos por cartão e formulário numerado.

## 21/10/2026 — v3.4.444: exclusão administrativa de bem do Ativo Imobilizado

- Paulo (Serpol, empresa 1243): colaborador cadastrou duas vezes o bem nº 008 (impressora HP Smart Tank 724, 23/07/2026, R$ 1.449,90) e nem admin conseguia excluir; o módulo só tinha editar/aquisição/transferência/baixa.
- Decisão: exclusão LÓGICA (`status: excluido`, `excluido_em/por`, `motivo_exclusao`, `status_anterior`) + `auditoria_contabil` tipo `ATIVO_EXCLUIDO`. Bem excluído sai da listagem, da prévia/aprovação de depreciação, dos eventos, da edição e da homologação (`ativosVigentes`).
- Módulo puro `ativo-imobilizado-exclusao.js`: lançamentos do bem pela chave `AAAA-MM:<bemId>:...` (controle `ativos_lancamentos` + entradas da sessão). Se algum cair em período travado (3.4.440, pela chave ou pela data), bloqueia e indica Baixa/estorno a partir do mês seguinte ao marco; senão remove junto, sob a trava da sessão e com `impedirAlteracaoPeriodosFechados`. Baixado não se exclui.
- Rotas `POST .../:id/exclusao/previa` e `.../:id/excluir` com `adminRequired` e `hash_previa`. Listagem devolve `possiveis_duplicados` (descrição normalizada + data + custo) e `pode_excluir`. Teste `scripts/test-ativo-imobilizado-exclusao.js`.

## 21/10/2026 — v3.4.445: movimento do CFI com CT-e e ICMS/ICMS ST/IPI por CFOP (NOVA ERA 09/2026)

- Paulo: frete 2353 não subia (CCI 99 mil abaixo do Livro), ICMS das saídas não integrado. O CFI passou a mandar CT-e, tirar a NF do produtor do art. 136 (`foraDoLivro`) e levar `baseIcms, icms, icmsSt, ipi, isentas, outras` por grupo + `resumo.icms/icmsSt/ipi`.
- `movimento-fiscal-cfi.js`: aceita chave modelo 57/67 (`especie: 'CTE'`, `tipoDocumentoFiscal` `CTE_ENTRADA/SAIDA`, descrição "CT-e N"); principal ganha `valorIcms/baseIcms/valorIcmsSt/valorIpi/isentasIcms/outrasIcms`; ICMS/ICMS ST/IPI > 0 viram linha de imposto destacado no desenho do SAGE (`valor` negativo, `impostoFiscalTipo`, `REGISTRO_*_FISCAL_IMPOSTO`, `cfiLancamentoId` `id:CFOP:x:ICMS|ICMS_ST|IPI`).
- Ausente ≠ zero: grupo sem as colunas (CFI antigo) bloqueia; total de cada imposto confere com o resumo do CFI.
- Conferência mostra CT-e, ICMS, ICMS ST, IPI e as notas "Fora do Livro no CFI". Teste: `scripts/test-movimento-fiscal-nfe-cfi.js`.
- Ordem de deploy: CFI antes do CCI (o CCI novo bloqueia o payload antigo).

## 21/10/2026 — v3.4.446: layout PDF do Cora (banco 403)

- Paulo (HYPE CAFE): banco 403 dava "Nao existe layout PDF cadastrado". Novo `parser-cora-extrato.js` (`parsearPDF_Cora_Extrato`), layout `Cora - Extrato do Periodo` no `layouts-bancarios-padrao.js`.
- Leitura por coordenadas do PDF.js: resumo da pág. 1 (saldo inicial, entradas, saídas, saldo final), dias em ordem decrescente com "Saldo do dia", transações com sinal +/- impresso, contraparte truncada ("…") e CPF/CNPJ. Bloqueia se totais, fechamento diário ou saldo final não baterem, se faltar item do resumo ou se houver linha com R$ não reconhecida.
- PDF real de junho/2026 (9 págs.): 145 lançamentos, entradas 30.263,27, saídas 29.835,70, 30 dias conferidos, saldo final 7.965,22. O arquivo do print era "part-1" de um PDF 01/06–30/09 dividido: parte isolada é recusada (resumo é do período inteiro).
- Teste `scripts/test-cora-extrato.js`: sintético com coordenadas + parte real pulada fora do Mac (`~/Downloads/Hype Café - Extrato CORA - Junho 2026 1.pdf`).

## 22/10/2026 — Escopo de módulo por colaborador: EFD-Reinf / Informes (3.4.447)
Pedido do Paulo: admin/gestor libera no cadastro do colaborador o acesso ao EFD-Reinf / Informes (inclui Aplicações financeiras e Lucros e Dividendos). `permissoes-cci.js` ganha catálogo `MODULOS` (reinf → prefixo `/api/reinf`), `permissoesCci.modulos` opcional, `podeModulo` (admin sempre; colaborador só com `true` explícito; ausente = sem acesso) e o bloqueio no `protegerAcoes` antes da checagem de ação (403 `CCI_MODULO_NAO_PERMITIDO`). Defesa em profundidade no próprio router do Reinf e dos aluguéis. `/api/me` devolve `modulosCci`; o menu nasce oculto e `showPage('reinf')` recusa sem liberação. Admin → Usuários: caixa "Acesso a módulos" gravada pelo mesmo PUT auditado de permissões. Efeito no deploy: colaborador não admin perde o Reinf até ser marcado. Módulo novo = entrada no catálogo + `data-modulo-cci` na tela.

## 22/10/2026 — Balancete: ocultar contas sem movimento (3.4.448)
Pedido do Paulo (print da 2.4.7.01.0001 SUPERÁVIT DO EXERCÍCIO toda zerada). Não existia opção. `Core.ocultarContasSemMovimento(linhas, campos)` em `relatorios-contabeis.js`: analítica sai se todos os campos zerados (mensal: saldo anterior/débito/crédito/saldo atual; anual: `saldosMensais`); sintética fica se tiver valor ou filha mantida. Checkbox `rcOcultarSemMovimento` (só abas Balancete e Balancete Anual), preferência em `localStorage` `cci.balancete.ocultarSemMovimento`, padrão marcado. Filtra só `dados.balancete`/`balanceteAnual.linhas` (tela, impressão, PDF, Excel); DRE/balanço/análise usam o balancete completo. Título mostra "N contas sem movimento ocultas". Teste no `test-relatorios-contabeis.js`.

## 22/10/2026 — Serviços do CFI: competência declarada × emissão no mês seguinte (3.4.450)
DAXX 1336 tomados 09/2026: "Nota 52 com numero, data ou valor invalido no CFI". O CFI escolhia a nota pela competência (dCompet do RPS) e mandava a emissão (01/10). `movimento-fiscal-cfi.js`: mensagem lista todas as recusadas (NF, prestador, motivo, ação); decisão do Paulo: aceita quando `competencia` = mês, `competenciaOrigem` ∈ declarada/fato-gerador/campo-competencia/corrigida e emissão posterior; lança no último dia, `dataEmissaoNota` + "emitida em" na descrição, ressalva em `ressalvas_cfi`, `notas_emitidas_fora_do_mes`. Depende do CFI PR #1454 (deploy antes).

## 22/10/2026 — Correção: salvar permissões do CCI dava 400 (3.4.451)
Paulo não conseguia liberar o EFD-Reinf: "Nível ou ações inválidas.". Causa: `permissoes-cci-routes` era registrado no server.js ANTES do `express.json` de `/api`, então `req.body` chegava undefined e o PUT sempre caía no 400 (latente desde 06/10). Rota movida para logo após o express.json; teste de ordem em `test-permissoes-cci.js`, como já existia para `gestao-acessos`.

## 22/10/2026 — Colaborador liberado trabalha no EFD-Reinf (3.4.452)
Após liberar o módulo, o colaborador ainda esbarrava em travas antigas de admin (adminReinfCadastroRequired, checagens is_admin no index.html). Agora: `cadastroReinfRequired` (admin ou módulo) e o `protegerAcoes` decide pela ação do nível — cadastros/registrar/aluguéis = editar, solicitar/e-mail = emitir, cancelar preparação = fechar. Extrato de dividendos com envio confere `emitir` na rota (o protegerAcoes roda antes do express.json e não vê o corpo). Certificado A1 e Central de Notificações seguem só admin; botão de notificações com `data-somente-admin`.

## 23/10/2026 — Lançamento manual: Cód IOB travava o histórico no 1º dígito (3.4.453)
Colaborador digitava 1299 e o Histórico ficava "CHEQUES EMITIDOS NO MÊS" (0001). Causa: `preencherHistoricoManualPorCodigo` rodava no `oninput` com `padStart(4,'0')`, então o "1" já virava 0001 e preenchia; depois o campo não estava vazio e nada mais trocava. Regra pura `historicoPorCodigoIob` em `lancamentos-edicao-lote.js`: busca só com 4 dígitos ou no `onchange` (completa com zeros); troca só o histórico que o código preencheu (`dataset.historicoAuto`). Paulo escolheu (23/10) o botão "Reordenar e renumerar" por competência aberta: `planoReordenacao`/`reordenarCompetencia` no mesmo módulo redistribuem os números já usados pela competência na ordem (data, nº atual), mantendo as posições do array; trava via `garantirPeriodosAbertos`; evento `reordenacao_lancamentos` com mapa de→para em `auditoriaLancamentos`.

## 26/10/2026 — Importação: débito/crédito em branco sem memorização (3.4.454)
Paulo: extrato e movimento fiscal chegavam com 111/502, 111/111 etc. em todas as empresas, sem memorização (✅ = só "tem débito e crédito", 🧠 = memória). Causa: `state.mappings` nascia com 34 regras padrão de igreja (RENDIMENTO 111/502, PIX RECEBIDO 111/501, TED/DOC 111/112...) e `applyMapping` (substring na descrição, contrapartida fixa 111) rodava nas duas importações; a lista ficava gravada na sessão de cada empresa. Correção: `mapeamento-automatico.js` (`regrasDoUsuario`) descarta as regras padrão legadas na aplicação e na tela Mapeamento; `state.mappings` nasce vazio. Regras criadas pelo usuário e a memória seguem valendo. Lançamentos já importados não mudam. Teste `scripts/test-mapeamento-automatico.js`.

## 26/10/2026 — Importar FI IOB/SAGE: limite de 1 MB para 2 MB (3.4.455)
Paulo: FI da Sara Nossa Terra (FI22492249.01) passava de 1 MB e o modal recusava. Limite em três camadas, agora 2 MB: `importacao-fi-ui.js` (file.size), `importacao-fi-routes.js` (base64 ≤ `LIMITE_FI_BASE64`) e `lerFI` (`LIMITE_FI_BYTES`, exportado de `importacao-fi.js`). O `express.json` da rota já usa o padrão de 8 MB do `http-hardening.js` (base64 de 2 MB ≈ 2,8 MB), sem mudança. Teste cobre FI de ~2 MB aceito na leitura e na prévia e recusa acima do limite.

## 26/10/2026 — CRM Parâmetros: incluir, editar e excluir linhas (3.4.456)
Paulo: na aba Centro de custo, EMBU - CIPÓ (linha 90) aparece em duas linhas iguais; pediu incluir, excluir e editar. `crm-base.js`: `incluirRegistro` (fonte própria `cci_manual` + `fonte_base`, para não virar `extra_na_fonte` no `conferir-crm-jotform.js` nem quebrar a contagem do importador; CNPJ da empresa aberta; vazio = null; opções da v2 valem), `excluirRegistro`/`restaurarRegistro` (lógica, só admin, motivo, revisão) e `duplicidadesRegistros` (mesma aba, mesmos valores atuais ou de origem). Rotas `POST /api/crm/empresas/:cnpj/parametros`, `.../parametros/:id/excluir|restaurar`, com histórico na linha e `auditoria_contabil` (`CRM_REGISTRO_*`). Linha excluída sai dos documentos e não se edita. Teste: `scripts/test-crm-linhas-parametros.js`.

## 26/10/2026 — Ficha de aplicações financeiras para o Fiscal (3.4.457)
Paulo: no painel Aplicações financeiras (EFD-Reinf) o contábil não tinha onde digitar o que vai para o Departamento Fiscal; quer ficha em PDF publicada no canal Teams dos admins, servindo de comprovante salvo no SharePoint. Entregue: `reinf/ficha-aplicacoes-fiscal.js` (puro: `normalizarFicha` com rendimento bruto e IRRF obrigatórios, ausente = null e "Não informado", alertas de CNPJ da fonte ausente, IRRF > rendimento, rendimento negativo e classe não confirmada; total parcial; PDF jsPDF/autotable; `payloadTeams` com cartão adaptável + `arquivo.conteudo_base64`). Rotas em `ficha-aplicacoes-fiscal-routes.js`, montadas no router do Reinf (`/api/reinf/aplicacoes/ficha-fiscal`): versões `AAAAMM-vN` em `empresas/{cnpj}/fichas_aplicacoes_fiscal` com o PDF (base64) e sha256, mesmo conteúdo já enviado → 409, reenvio só de `recusado`/`sem_canal` (incerto não repete), canal único do escritório em `config_cci/ficha_aplicacoes_fiscal` (só admin; URL no Secret Manager via `notificacoes-teams.salvar`; `postar` extraído de `enviar`). SharePoint: o PDF vai no corpo do Workflows; o admin inclui "Criar arquivo" no fluxo (instrução na tela). Tela: `ficha-aplicacoes-fiscal-ui.js`/`.css`. Teste `scripts/test-ficha-aplicacoes-fiscal.js`.

## 27/10/2026 — Ficha para o fiscal: SharePoint automático, link e alertas no Teams (3.4.458)
Paulo testou a 3.4.457: o PDF está correto, mas deve ir ao Teams como anexo ou link, ser salvo automaticamente no SharePoint do contábil, e é preciso escolher quem recebe alerta no Teams a cada envio. Webhook do Workflows não leva anexo de arquivo. Por isso `ficha-aplicacoes-sharepoint.js` grava o PDF pelo Graph (app 59fd4ec9 de e-mail, que precisa de **Sites.Selected/escrita só no site do Contábil**; sem ela, 403 com a ação na mensagem) e o cartão recebe `Action.OpenUrl` para o arquivo e `msteams.entities` com @menção por UPN. Canal (`config_cci/ficha_aplicacoes_fiscal`) ganha `sharepoint` (drive/item resolvidos por `/shares/u!…`) e `alertas`; trocar pasta ou pessoas não exige colar o Workflows de novo. A ficha guarda `sharepoint {estado, web_url}`; reenvio repete o SharePoint (seguro, mesmo nome substitui) e o Teams só em recusado/sem_canal. Guia: `docs/ficha-aplicacoes-fiscal.md`.

## 27/10/2026 — Ficha para o fiscal: pasta do SharePoint pelo caminho (3.4.459)
Com Sites.Selected (write) liberado no site spassessoriacontabil (Graph Explorer, POST /sites/{id}/permissions → 201), Configurar canal ainda recusava a pasta com 403. `/shares/{u!…}/driveItem` exige permissão no tenant inteiro; `resolverPasta` agora resolve site (`/sites/{host}:/sites/X`) → bibliotecas (`/drives`, maior prefixo do webUrl) → pasta (`/root:/caminho:`), aceitando `AllItems.aspx?id=`. `/shares` só para link "Copiar link" (/:f:/). Em 401/403 o cliente descarta o token em cache (`invalidarTokenGraph`) e tenta uma vez. Mensagem cita o site.

## 27/10/2026 — CRM Parâmetros: admin altera Colaborador (3.4.460)
Pedido do Paulo: na aba Parâmetros (linhas importadas, ex. CONTROLE_OFICIAL_2026) o Colaborador (col. 8) não tinha Editar porque o import marca `protegido` em N°/EMPRESA/CNPJ/COLABORADOR. `crm-base.js` ganhou `campoEditavel(campo,user)`: protegido só abre para `is_admin === true` e nome COLABORADOR; não admin recebe 403 com a ação. A rota devolve `editaveis` por registro e a tela usa isso para o botão. Editar o Colaborador não muda `carteira_uids` (acesso segue em Gestão da carteira). N°, EMPRESA e CNPJ continuam travados. Testes em test-crm-base, test-crm-contabil-routes e test-crm-contabil.

## 27/10/2026 — Exclusão admin: conta reduzida resolvida como no Razão (3.4.461)
Caso 0093 Silvio Freire: Razão mostrava os lançamentos, mas Exclusão de Lançamentos com Conta reduzida 11 parava em "Conta não encontrada ou ambígua". `exclusao-conciliacao.js` comparava código e reduzido com `normalizarConta` (tira pontos), então grupo `1.1` colidia com reduzido `11`, e exigia a conta no plano mesmo com Situação = Todos. Agora: reduzido vence o código; reduzido duplicado lista os cadastros; conta fora do plano mas usada nos lançamentos filtra com aviso (`previa.avisoConta`) e S/N segue exigindo cadastro. Sem acesso ao Firestore da sessão: causa exata do caso (colisão × conta fora do plano) não foi conferida nos dados. Teste `test-exclusao-conciliacao.js` registrado no `check` e no `test:admin-exclusao`.
## 27/10/2026 — Checklist: cadastrar entrada na carteira (3.4.462)
Pedido do Paulo: entrada do Checklist (ex. KHAVA 1411) devia ir para a base geral da carteira. Causas: a prévia só casava o Nosso Número com `empresas` (ignorava `crm_empresas`), e não havia criação. O campo CPF/CNPJ (id 60) vem vazio nas entradas recentes; o CNPJ está no texto da observação (id 5). `crm-checklist.js`: CAMPOS ganhou cnpj(60)/tributacao(59); `cnpjDaOrigem` lê campo ou "CNPJ:" da observação com DV, divergência/múltiplos = pendência; `unirBases` (empresas prevalece); `cadastro_disponivel` só para entrada ACTIVE, sem vínculo, CNPJ válido e não cadastrado. `POST /api/crm/checklist/cadastrar` (admin) cria `crm_empresas/{cnpj}` sem equipe/contrato + `crm_checklist_cadastros/{submission}` + auditoria `CRM_CHECKLIST_CADASTRO`. `aplicar` passou a gravar na coleção do vínculo. Contrato futuro (início 02/11) segue bloqueado até a data.

## 27/10/2026 — Checklist cadastrar: submissão corrigida não vira "já cadastrado" (3.4.463)
Achado do Codex no PR #357: `POST /api/crm/checklist/cadastrar` devolvia `ja_cadastrado` sem comparar o registro `crm_checklist_cadastros/{submission}` com a submissão atual. Agora confere `assinatura_evento` e CNPJ (como o `aplicar`) e responde 409 pedindo revisão manual do dossiê. Tributação: mantida só como `tributacao_origem` (evidência), Topologia segue lendo `regime_tributario_*` do cadastro.

## 27/10/2026 — Importar relatório Conferência de Lançamentos da SAGE (3.4.464)
Paulo pediu validar a importação no CCI do Digita12.txt (0813 FR Climatização, 12/2025). Era o relatório impresso Conferência de Lançamentos, recusado pelo `lerFI` (328 posições). Novo leitor `importacao-sage-conferencia.js` no mesmo endpoint do FI: CNPJ do cabeçalho = empresa ativa, período, quantidade impressa, "NAO HA DIFERENCA", contas pela classificação exata (gravadas pelo reduzido) e aviso com confirmação quando a competência já tem lançamentos (o relatório mistura banco, folha e notas). Arquivo real: 344/344, R$ 1.506.496,64. Pedido do Paulo: atalhos de ECD/ECF e Validador de Obrigações ao lado do botão, na área "SAGE e obrigações acessórias". Detalhes em `docs/importacao-fi-iob.md`.

## 27/10/2026 — Balancete: conta fora do plano saía sem nome (3.4.465)
Paulo reportou o balancete PDF da Daxx (11.775.820/0001-71, 09/2026) "sem a nomenclatura": 137 linhas só com código (ex.: 1.1.1.03.0007, 1.1.2.01.0032, 2.1.1.07.1549, reduzidos 0757…), todas com saldo anterior e sem movimento no mês, e fora do grupo (ATIVO 7,03 mi × Total de Ativo 9,84 mi). Causa: `balancete()` recebe saldo (abertura ou lançamento anterior) em conta que `resolverConta` não acha no plano ativo (inexistente, ou chave anulada por duplicidade no `mapaContas`); a linha ficava com descrição e `codigoCompleto` vazios. Não veio do PR #343 (só filtra). Correção: `situacaoForaPlano` marca `foraPlano` ('inexistente'|'duplicada'), descrição de alerta no balancete e no razão, código estruturado entra na hierarquia, aviso na tela (`contasForaDoPlano`) e linha vermelha no PDF. Dado da Daxx não conferido (sem acesso ao Firestore): falta cadastrar essas contas no plano ou corrigir a origem dos saldos.

## 27/10/2026 — Importar Folha pedia o número da empresa no plano compartilhado (3.4.466)
Paulo reportou como regressão: Importar Folha no plano 1183 DAXX MIDIA (Josilaine) abriu o `prompt()` "tem 2 empresas vinculadas" (DAXX MIDIA e FERREIRA BRAGA HOLDING). Não houve mudança de código: o `prompt` existe desde a Fase 1 da folha (10c9607, 05/2026) e `vincular-folha-pagamento.js`/`/api/folha/empresas-do-plano` não mudaram desde então. O que mudou foi o dado: a holding passou a usar o mesmo plano (ou a usuária ganhou acesso a ela pela carteira), e com duas empresas o fluxo sempre perguntou. Correção: `escolherEmpresaAtivaDoPlano` usa a empresa ativa (`state.info.cnpj`, sessão confirmada) quando ela está entre as vinculadas; a lista só aparece se a empresa ativa não estiver no plano. Teste em `scripts/test-folha-acesso-colaboradores.js`.

## 27/10/2026 — Relatório SAGE: lançamentos de múltiplas partidas (3.4.467)
Paulo testou o Digita08 (1170 JG Soluções, 01-08/2026): linha 556 recusada como partida composta. São 19 lançamentos de uma conta contra várias, todos com soma conferida. `importacao-sage-conferencia.js` passou a ler por posição e desdobrar cada contrapartida em partida contra a conta única (mesmo número SAGE, `partidaSage`). N contra N e soma divergente bloqueiam. Rodapé com milhar (1.338) aceito. Arquivo real: 1.338 lançamentos → 1.360 partidas, R$ 14.318.325,81; Digita12 segue 344/344.

## 27/10/2026 — 📣 Avisos da Legalização no Contábil (3.4.468)
Auditoria do checklist da Legalização (Paulo: "Você não relaciona o consultor contábil!"): o Contábil não recebia nenhum aviso. Agora o legaliza-o grava `contabil` nos destinos (situação, dados gerais e Contabilidade contratada/retirada) e o CFI aceita `destino=contabil` no túnel `/api/admin/cadastro/avisos-legalizacao` (o projeto `projetos-app-sp` já era aceito). Aqui: `avisos-legalizacao.js` (puro + fetch com o token de quem está logado), rota `GET /api/legalizacao/avisos` (recusa do CFI volta 502, não 401) e a faixa recolhível `mostrarAvisosLegalizacao` abaixo do cabeçalho. Só mostra. Trava: `scripts/test-avisos-legalizacao.js`. Pendente (decisão do Paulo): o `crm-checklist.js` ainda lê o Checklist do Jotform 210135417457653, que foi desativado; empresa criada no checklist do app não chega ao Conferir Checklist do CRM.

## 28/10/2026 — CRM › Conferir Checklist lê o app Legalização (v3.4.469)

- Paulo: "todos apps passam a ler o checklist do app legalizacao, jotform morre". `crm-checklist.js` deixa o Jotform 210135417457653 e lê `GET /api/admin/cadastro/checklist-legalizacao` no CFI com o token de quem está logado (o CFI libera Nosso Número ao projeto `projetos-app-sp`; honorários não vêm).
- Uma linha por empresa; id `doc_<cnpj>`/`nome_<CHAVE>` vira o `submission_id` (os registros numéricos antigos em `crm_checklist_eventos`/`crm_checklist_cadastros` ficam como histórico).
- Consulta agendada A08 suspensa (sem usuário não há token); ligar exige credencial de serviço no CFI. `CCI_CHECKLIST_API_KEY` não é mais lida.
- Travas: `scripts/test-crm-checklist.js`, `test-crm-contabil-routes.js`, `test-notificacoes-automacao.js`.

## 28/10/2026 — v3.4.470: avisos com 0 e saída depois da entrada

- Paulo viu "Avisos da Legalização (0)". Causa no CFI (eventos antigos sem `contabil` nos destinos); corrigido lá (`destinosDoEvento`). Nada mudou aqui além da novidade.
- Achado do Codex no #364: a linha do app é a mesma a vida toda, e `crm_checklist_eventos` era chaveado só pelo id → depois da entrada, a saída/baixa da mesma empresa dava 409. Chave agora é `chaveEvento()` = id + passo + data de vigência; já aplicado compara só o CNPJ.

## 28/10/2026 — v3.4.471: movimento fiscal da filial integrado na matriz (modelo SAGE)

- Pedido do Paulo: na SAGE a filial aponta para a matriz ("Integração com o Contábil") e a exportação fiscal cai na matriz. Caso NOVA ERA: filial 1164 (0002-02) → matriz 1154 (0001-21).
- Desenho: com a MATRIZ ativa, Importações › Movimento Fiscal mostra "Estabelecimento do movimento" (matriz + filiais com `matriz_cnpj` = ela). Filial escolhida: CFI consultado pelo CNPJ da filial, lançamentos na matriz com `estabelecimentoFiscalCnpj`/`integradoNaMatrizCnpj` e "Filial ..." na descrição. Só sincronização direta do CFI (arquivo SAGE segue CNPJ = empresa ativa). Com a FILIAL ativa, só aviso apontando a matriz; importar na própria filial continua possível.
- Travas: `movimento-fiscal-escopo.js` (`estabelecimentosDoMovimentoFiscal`, `conferirFilialDaMatriz`, escopo por CNPJ de origem: matriz e filial coexistem no mês, mesma filial não repete). Servidor (`/api/fiscal/movimento-cfi?matriz=`) recusa filial que não aponta para a matriz. Teste: `scripts/test-movimento-fiscal-escopo.js`.
- Pendente: folha de pagamento na matriz (quando o módulo existir). Duplicidade cruzada (filial importada nela mesma E na matriz) não é detectada: livros diferentes.

## 28/10/2026 — v3.4.472: folha da filial integrada na matriz

- Extensão da 3.4.471 para Importar Folha (pedido do Paulo). Matriz com filial vinculada: "Estabelecimento da folha" no modal; `parse-resumo` recebe `filial`, confere `conferirFilialDaMatriz`, lê o FPIMP com o código SAGE da filial (PDF: CNPJ da filial, PDF sem CNPJ recusado) e marca `integrado_na_matriz`. `CCIImportarFolhaSage` só aceita filial marcada para a matriz ativa e grava `estabelecimentoFiscalCnpj`.
- Duplicidade, mapeamento e registro da folha ficam pelo CNPJ da filial. O .02 do PDF segue o nome da matriz.
- Teste: `scripts/test-folha-acesso-colaboradores.js`.

## 28/10/2026 — v3.4.473: Classificar com IA respeita o filtro

- Flanacar (soraia): 11 filtrados de 20711, toast "Classificando 20711" e aba caiu (RESULT_CODE_HUNG). `classificarComIA` usava `state.entries` em tudo (memória, sentido bancário, lotes da IA), reclassificando a base inteira.
- Novo `classificacao-ia-escopo.js`: escopo = selecionados > filtrados > base (só se couber); limite 500 por execução, acima disso recusa com a ação. Sentido bancário segue calculado na base (conta dominante), mas só o escopo recebe a correção (`mesclarNoEscopo`, no próprio objeto). `garantirLancamentosAbertos` no escopo e `confirm` com a contagem.
- `aplicarMemoriaEmLancamentos` cede a vez ao navegador a cada 25 linhas.
- Teste: `scripts/test-classificacao-ia-escopo.js`.
