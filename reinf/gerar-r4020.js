// ============================================================================
// reinf/gerar-r4020.js
// ----------------------------------------------------------------------------
// R-4020 — pagamentos/créditos a beneficiário PESSOA JURÍDICA.
//
// ═══ A FONTE DESTE MÓDULO É UM ARQUIVO ACEITO PELA RECEITA ═══════════════════
//
// Não foi escrito a partir do XSD (a doc do portal SPED é bloqueada pela rede
// do ambiente) nem por analogia com o R-4010. Foi escrito a partir de um
// R-4020 REAL que o IOB gerou e transmitiu (evento
// ID1546611450000002023110311392200004, perApur 2023-10, tpAmb 1 = PRODUÇÃO).
// Arquivo que a Receita aceitou vale mais que leiaute lido: prova a forma.
//
// O QUE O ARQUIVO PROVOU, e que a analogia com o R-4010 teria errado:
//
//   1. o evento é `evtRetPJ` e o namespace é `evt4020PagtoBeneficiarioPJ`
//   2. o beneficiário é `cnpjBenef` (o PF usa `cpfBenef`)
//   3. o valor é **`vlrBruto`** — o R-4010 usa `vlrRendBruto`. Copiar o nome do
//      PF passaria em qualquer teste nosso e seria RECUSADO na transmissão.
//   4. `observ` existe e fica em `idePgto`, DEPOIS de `natRend` e ANTES de
//      `infoPgto` — não dentro do pagamento
//   5. `indJud` fecha o `infoPgto`
//   6. a natureza do rendimento não é só a faixa 15xxx: o arquivo traz **17099**
//
// E confirmou o que o app já fazia certo, caractere a caractere:
//   · valor com VÍRGULA decimal (`0,00`) — `fmtValorReinf`
//   · `ideContri/nrInsc` com a RAIZ de 8 dígitos, não o CNPJ inteiro
//   · o `id` = "ID" + tpInsc + raiz preenchida a 14 + AAAAMMDDHHMMSS + seq(5)
//
// ═══ E A RETENÇÃO DESTRAVOU COM UM SEGUNDO ARQUIVO ACEITO (01/09) ═══════════
//
// Até 01/09 este gerador BLOQUEAVA quando havia retenção: o primeiro arquivo
// de referência tinha `vlrBruto` zerado e nenhum bloco de retenção, então onde
// entram os valores não estava provado.
//
// Paulo mandou um segundo R-4020 **aceito em produção** (evento
// ID1546611450000002026070609565000001, perApur 2026-06, tpAmb 1) — e ele é do
// MESMO contribuinte e do MESMO beneficiário do caso que estava travado
// (CONDOMINIO EDIFICIO MONTE CARLO × ELEVADORES ATLAS SCHINDLER):
//
//   <infoPgto>
//     <dtFG>2026-06-13</dtFG>
//     <vlrBruto>3210,96</vlrBruto>
//     <indJud>N</indJud>
//     <retencoes>
//       <vlrBaseAgreg>3210,96</vlrBaseAgreg>
//       <vlrAgreg>149,31</vlrAgreg>
//     </retencoes>
//   </infoPgto>
//
// 🚨 O QUE ELE DESMENTE — e a analogia teria errado nas TRÊS pontas de uma vez:
//
//   1. o bloco se chama **`retencoes`** e fica DENTRO de `infoPgto`, **depois**
//      do `indJud` — não em `idePgto`, não antes;
//   2. os campos provados são **`vlrBaseAgreg`** e **`vlrAgreg`**, os nomes que
//      o módulo listava como NÃO MAPEADOS;
//   3. e o principal: a retenção vai **AGREGADA, num valor só**. Eu ia emitir
//      IR, CSLL, PIS e COFINS separados — o arquivo aceito declara a **CSRF
//      inteira** numa linha. Confere ao centavo: 3.210,96 × 4,65% = **149,31**.
//
// 📌 É a régua da casa outra vez: **arquivo ACEITO vale mais que leiaute
// deduzido**. Quatro campos inventados teriam passado em qualquer teste nosso.
//
// ═══ E O IRRF DESTRAVOU COM UM TERCEIRO ARQUIVO ACEITO (03/09) ══════════════
//
// Paulo mandou um R-4020 **aceito em PRODUÇÃO** (`tpAmb 1`, perApur 2026-07,
// evento ID1628278600000002026080611342200001, verProc 3.46.0000) com a
// retenção **SEPARADA por tributo** — a forma que este módulo bloqueava:
//
//   <retencoes>
//     <vlrBaseIR>15371,80</vlrBaseIR>
//     <vlrIR>230,58</vlrIR>
//     <vlrBaseCofins>21708,16</vlrBaseCofins>
//     <vlrCofins>651,24</vlrCofins>
//     <vlrBasePP>21708,16</vlrBasePP>
//     <vlrPP>141,10</vlrPP>
//   </retencoes>
//
// 🚨 E ELE DESMENTE O NOME QUE A ANALOGIA TERIA ESCRITO: o PIS/PASEP é
// **`vlrBasePP`/`vlrPP`**, não `vlrPis`. Este módulo listava `vlrPis` como
// campo "não mapeado" — o nome nunca existiu. É a régua da casa outra vez:
// **arquivo ACEITO vale mais que leiaute deduzido**, e chutar o nome produz
// evento recusado ou, pior, aceito declarando retenção ZERO.
//
// 📖 O que mais ele prova, e vale campo a campo:
//   · a ORDEM dentro de `<retencoes>`: IR → COFINS → PP;
//   · **a CSLL pode ser OMITIDA** — Paulo, na mesma mensagem: *"esse
//     beneficiário ATESA não tem retenção de CSLL, apenas PIS/COFINS"*. Bloco
//     de tributo que não houve simplesmente não sai;
//   · **`vlrBaseIR` pode ser MENOR que o `vlrBruto`** (15.371,80 × 21.708,16):
//     a base do IR admite dedução. 230,58 sobre 21.708,16 daria 1,06%, não os
//     1,5% da lei — ou seja, a base ali NÃO é o bruto.
//   · o namespace do leiaute é **v2_01_02**.
//
// ═══ O QUE CONTINUA SEM PROVA, e por isso continua BLOQUEADO ════════════════
//
// Sobram DOIS buracos, e os dois são de NOME/COMBINAÇÃO, não de conta:
//
//   1. **a CSLL separada** — nenhum arquivo aceito a mostra. `vlrCsll` é
//      palpite: o do PIS/PASEP já provou que o palpite erra (`vlrPP`).
//   2. **IR junto de retenção AGREGADA** no mesmo `<retencoes>` — um arquivo
//      usa só a agregada, o outro usa só a separada; que os dois convivam
//      ninguém mostrou, e a ORDEM entre eles muito menos.
//
// Então a régua fica assim, e cada ramo tem a prova do lado:
//
//   · **CSRF completa** (PIS+COFINS+CSLL, a que o CFI decompõe pela Lei
//     10.833/2003) → **AGREGADA** em `vlrBaseAgreg`/`vlrAgreg` (arquivo aceito
//     de 06/2026), com o valor SOMADO de volta;
//   · **sem CSLL** (IR e/ou COFINS e/ou PIS) → **SEPARADA**, nos nomes provados
//     pelo arquivo de 07/2026;
//   · **CSLL separada** ou **IR + agregada** → **BLOQUEIA**, com o motivo — e
//     um R-4020 aceito que tenha CSLL retida destrava o primeiro.
//
// ⚠️ E a decomposição do CFI (PIS 0,65% · COFINS 3% · CSLL 1%) continua valendo
// onde ela é necessária — o EFD-Contribuições e o Relatório de Retenções pedem
// os três separados. O que este arquivo prova é que **o R-4020 pede o total**.
// Somar de volta aqui não é desfazer a decomposição: é declarar no formato que
// a Receita aceita, a partir do MESMO número.
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC,
  fmtValorReinf, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R4020 =
  `http://www.reinf.esocial.gov.br/schemas/evt4020PagtoBeneficiarioPJ/${LEIAUTE_REINF}`;

/**
 * Campos de retenção que NENHUM arquivo aceito mostra até hoje.
 *
 * A lista só encolhe com PROVA: `vlrBaseAgreg`/`vlrAgreg` saíram em 01/09 e
 * `vlrBaseIR`/`vlrIR`/`vlrBaseCofins`/`vlrCofins`/`vlrBasePP`/`vlrPP` saíram em
 * 03/09, cada um com o arquivo aceito citado no cabeçalho.
 *
 * ⚠️ `vlrPis`/`vlrBasePis` FICAM na lista porque esses nomes **não existem** —
 * o arquivo aceito escreve `vlrPP`. Quem mandar o nome palpitado é barrado, em
 * vez de gerar um evento que a Receita recusa.
 */
const RETENCOES_NAO_MAPEADAS = ['vlrCsll', 'vlrBaseCsll', 'vlrPis', 'vlrBasePis'];

/**
 * ⚠️ A LISTA ACIMA MUDOU DE SIGNIFICADO em 04/09, e isso é o ponto.
 *
 * Ela era "campos cujo nome nenhum arquivo aceito mostra". Com o XSD no repo,
 * **os dez nomes são conhecidos** — e os quatro que sobraram na lista são
 * NOMES QUE NÃO EXISTEM: o XSD escreve `vlrCSLL`/`vlrBaseCSLL` (maiúsculas) e
 * `vlrPP`/`vlrBasePP`. Quem mandar `vlrCsll` ou `vlrPis` continua barrado — e
 * agora a mensagem diz o nome CERTO, em vez de dizer que o campo é impossível.
 */
const NOME_CERTO_DO_CAMPO = {
    vlrCsll: 'vlrCSLL', vlrBaseCsll: 'vlrBaseCSLL',
    vlrPis: 'vlrPP', vlrBasePis: 'vlrBasePP',
};

/**
 * A SEQUÊNCIA de `<retencoes>`, LIDA DO XSD — não deduzida.
 *
 * 🚨 04/09: o XSD `evt4020PagtoBeneficiarioPJ-v2_01_02` entrou no repo
 * (`docs/reinf/xsd/`) e respondeu de uma vez as DUAS perguntas que travavam o
 * módulo. Ele declara, nesta ordem e todos com `minOccurs="0"`:
 *
 *   vlrBaseIR · vlrIR · vlrBaseAgreg · vlrAgreg · vlrBaseCSLL · vlrCSLL ·
 *   vlrBaseCofins · vlrCofins · vlrBasePP · vlrPP
 *
 * 📌 O QUE ISSO DESTRAVA:
 *   1. **IR e AGREGADA convivem** no mesmo bloco, e a ordem está declarada (o
 *      IR ANTES). Era o bloqueio da SCHROEDER (IRRF + CSRF completa).
 *   2. **O nome da CSLL é `vlrBaseCSLL`/`vlrCSLL`, em MAIÚSCULAS** — este
 *      módulo listava `vlrCsll`/`vlrBaseCsll` como "não mapeados", e esses
 *      nomes NÃO EXISTEM. É o `vlrPis` de novo: o palpite erra a caixa.
 *
 * ✅ E ELE NÃO CONTRADIZ NADA — ao contrário, EXPLICA os dois arquivos aceitos
 * campo a campo: o de 06/2026 usa as posições 3-4 (agregada) e o de 07/2026 as
 * posições 1, 2, 7, 8, 9 e 10, na ordem. Schema que bate com duas provas de
 * produção é corroboração, não dedução.
 *
 * ⚠️ A tabela é PROVADA contra o arquivo XSD por teste (a régua da `XSD_DERE`
 * do CFI): tabela digitada de memória é a segunda cópia, e ela envelhece em
 * silêncio quando o leiaute muda.
 */
const RETENCOES_XSD = [
    ['vlrBaseIR', 'vlrIR'],
    ['vlrBaseAgreg', 'vlrAgreg'],
    ['vlrBaseCSLL', 'vlrCSLL'],
    ['vlrBaseCofins', 'vlrCofins'],
    ['vlrBasePP', 'vlrPP'],
];

/**
 * Os pares SEPARADOS por tributo — a tabela do XSD sem o par agregado.
 *
 * (Nome mantido: a apuração e os testes falam dele desde 03/09.)
 */
const RETENCOES_SEPARADAS = RETENCOES_XSD.filter(([b]) => b !== 'vlrBaseAgreg');

/** Alíquotas legais do IRRF sobre serviços — Lei 7.713/88 art. 52 e Dec. 9.580/2018. */
const ALIQ_IRRF = [1.5, 1.0];

/** Alíquota legal da CSRF somada (Lei 10.833/2003 art. 30: 1% + 3% + 0,65%). */
const ALIQ_CSRF = 4.65;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Motivo pelo qual ainda não dá pra declarar retenção. Texto único: aparece na
 * exceção, na tela e em qualquer lugar que perguntar "por que não gera?".
 */
const MOTIVO_RETENCAO_BLOQUEADA =
  'O nome do campo está com a CAIXA errada. O XSD v2_01_02 (em docs/reinf/xsd/) declara os DEZ '
  + 'campos de <retencoes> nesta ordem: vlrBaseIR · vlrIR · vlrBaseAgreg · vlrAgreg · vlrBaseCSLL · '
  + 'vlrCSLL · vlrBaseCofins · vlrCofins · vlrBasePP · vlrPP. Use o nome como está lá — a caixa das '
  + 'letras importa, e o palpite já errou uma vez (o PIS/PASEP é vlrPP, nunca vlrPis).';

// 🚨 A MENSAGEM MANDAVA SÓ PELO CAMINHO CARO — e o barato existe (03/09, print
// do Paulo na PEC PRONTA ENTREGA, beneficiário SCHROEDER: bruto 6.136,91 · IRRF
// 92,05 · PIS 39,89 · COFINS 184,11 · CSLL 61,37, situação "não vira evento").
//
// Ela dizia só *"entregue pelo e-CAC e mande o XML depois"* — entrega à mão,
// competência a competência, esperando um arquivo aceito que talvez demore. Só
// que o buraco aqui **não é de conta, é de NOME e de ORDEM**, e quem responde
// isso numa leitura é o **XSD** do próprio leiaute: `xs:sequence` DECLARA que
// campos existem e em que ordem os irmãos entram.
//
// 📌 E ELE FECHA OS DOIS BURACOS DE UMA VEZ: o nome da CSLL separada (o único
// dos quatro tributos sem prova — IR, COFINS e PP saíram no aceito de 07/2026)
// e a coexistência agregada+IR. É o caminho que já funcionou nesta casa: os XSD
// da DeRE chegaram por PDF/ZIP em 02/09 e confirmaram o módulo em vez de
// derrubá-lo.
//
// ⚠️ NÃO É "peça o XSD em vez de entregar": a competência vence, então a
// entrega pelo e-CAC continua sendo o que destrava HOJE. O que mudou é a
// mensagem parar de esconder o caminho que destrava PARA SEMPRE — aviso que
// nomeia uma saída só, quando existem duas com custos diferentes, é o achado 18
// com outra roupa.
const MOTIVO_IR_COM_AGREGADA =
  'Esta nota tem IRRF retido E a CSRF completa (PIS+COFINS+CSLL). A CSRF vai AGREGADA e o IR vai '
  + 'SEPARADO — mas nenhum arquivo aceito mostra os dois no MESMO <retencoes>, nem em que ORDEM. O '
  + 'evento NÃO é gerado: o leiaute é uma sequência, e irmão fora de ordem derruba o evento. '
  + 'O QUE FALTA É POUCO: dos quatro tributos, IR, COFINS e PIS/PASEP já têm o nome PROVADO '
  + '(vlrBaseIR/vlrIR · vlrBaseCofins/vlrCofins · vlrBasePP/vlrPP, aceito de 07/2026) — falta o nome '
  + 'da CSLL separada e a ordem entre os irmãos. DUAS SAÍDAS, e elas têm custos diferentes: '
  + '(1) HOJE, entregue esta competência pelo e-CAC e mande o XML dela depois; '
  + '(2) DE VEZ, mande o XSD v2_01_02 do EFD-Reinf (evt4020PagtoBeneficiarioPJ) — ele é uma '
  + 'xs:sequence, então DECLARA o nome do campo e a ordem, e destrava esta trava e a da CSLL '
  + 'separada numa leitura só, sem esperar arquivo aceito de cada combinação.';

const MOTIVO_BASE_IR_DESCONHECIDA =
  'Esta nota tem IRRF retido e o valor NÃO fecha com 1,5% nem 1% do bruto — ou seja, a base do IR '
  + 'tem dedução (é o caso das cooperativas: o arquivo aceito de 07/2026 traz vlrBaseIR 15.371,80 '
  + 'sobre um bruto de 21.708,16). O app NÃO tem essa base: o Consultor Fiscal entrega o valor do '
  + 'serviço, não a base do IR. Carimbar o bruto ali declararia base A MAIOR. Entregue esta nota pelo '
  + 'e-CAC, ou informe o ajuste da retenção com a base correta.';

/**
 * Gera UM evento R-4020 (um beneficiário PJ por evento).
 *
 * @param {object} ev
 * @param {object} ev.contribuinte    { tpInsc:1|2, nrInsc }
 * @param {object} ev.estabelecimento { tpInscEstab:1|2|3, nrInscEstab }
 * @param {string} ev.perApur         'AAAA-MM'
 * @param {1|2}    ev.tpAmb           1=produção, 2=produção restrita
 * @param {1|2}    [ev.indRetif=1]    1=original, 2=retificador
 * @param {string} [ev.nrRecibo]      recibo do evento retificado
 * @param {number} [ev.seq=1]
 * @param {Date}   [ev.data]          para o id (injetável nos testes)
 * @param {object} ev.beneficiario    { cnpj }
 * @param {Array}  ev.pagamentos      [{ natRend, dtFG, vlrBruto, indJud, observ }]
 * @returns {{ id:string, cnpj:string, xml:string }}
 */
function gerarR4020(ev) {
  const erros = validarEntradaR4020(ev);
  if (erros.length) throw new Error('R-4020 inválido:\n - ' + erros.join('\n - '));

  const { contribuinte, estabelecimento, perApur, tpAmb,
          indRetif = 1, nrRecibo, seq = 1, data, beneficiario, pagamentos } = ev;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
    ...(data ? { data } : {}),
  });

  // idePgto: um bloco por natureza; infoPgto: um por pagamento. Mesma regra do
  // R-4010 e confirmada pelo arquivo de referência.
  const porNatureza = new Map();
  for (const p of pagamentos) {
    const chave = `${p.natRend}|${p.observ || ''}`;
    if (!porNatureza.has(chave)) porNatureza.set(chave, []);
    porNatureza.get(chave).push(p);
  }

  const idePgtoXml = [...porNatureza.values()].map((lista) => {
    const { natRend, observ } = lista[0];
    const infoPgtos = lista.map((p) => (
      // ORDEM conferida contra o arquivo aceito:
      //   dtFG → vlrBruto → indJud → retencoes
      // O <retencoes> vem DEPOIS do indJud, não antes — e dentro do infoPgto,
      // não do idePgto. Posição se lê do arquivo, nunca de dedução.
      '        <infoPgto>\n'
      + `          <dtFG>${p.dtFG}</dtFG>\n`
      + `          <vlrBruto>${fmtValorReinf(p.vlrBruto)}</vlrBruto>\n`
      + `          <indJud>${p.indJud === 'S' ? 'S' : 'N'}</indJud>\n`
      + blocoRetencoes(p)
      + '        </infoPgto>'
    )).join('\n');
    // `observ` sai SEMPRE, vazio quando não há texto — é como o arquivo de
    // referência veio (`<observ />`).
    const obs = observ ? `<observ>${escXml(observ)}</observ>` : '<observ />';
    return `      <idePgto>\n        <natRend>${natRend}</natRend>\n        ${obs}\n${infoPgtos}\n      </idePgto>`;
  }).join('\n');

  const ideEventoLinhas = [`    <indRetif>${indRetif}</indRetif>`];
  if (indRetif === 2 && nrRecibo) ideEventoLinhas.push(`    <nrRecibo>${escXml(nrRecibo)}</nrRecibo>`);
  ideEventoLinhas.push(
    `    <perApur>${perApur}</perApur>`,
    `    <tpAmb>${tpAmb}</tpAmb>`,
    '    <procEmi>1</procEmi>',
    `    <verProc>${escXml(VER_PROC)}</verProc>`,
  );

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R4020}">
  <evtRetPJ id="${id}">
    <ideEvento>
${ideEventoLinhas.join('\n')}
    </ideEvento>
    <ideContri>
      <tpInsc>${contribuinte.tpInsc}</tpInsc>
      <nrInsc>${nrInscContribuinteReinf(contribuinte)}</nrInsc>
    </ideContri>
    <ideEstab>
      <tpInscEstab>${estabelecimento.tpInscEstab}</tpInscEstab>
      <nrInscEstab>${soDigitos(estabelecimento.nrInscEstab)}</nrInscEstab>
      <ideBenef>
        <cnpjBenef>${soDigitos(beneficiario.cnpj)}</cnpjBenef>
${idePgtoXml}
      </ideBenef>
    </ideEstab>
  </evtRetPJ>
  <!-- ASSINATURA: o <Signature> (XMLDSig, certificado A1) entra na etapa de
       assinatura do backend, antes de transmitir. O XSD exige. -->
</Reinf>`;

  return { id, cnpj: soDigitos(beneficiario.cnpj), xml };
}

/**
 * O bloco `<retencoes>` — nas DUAS formas que arquivo aceito prova.
 *
 * · **SEPARADA** por tributo (`vlrBaseIR`/`vlrIR` · `vlrBaseCofins`/`vlrCofins`
 *   · `vlrBasePP`/`vlrPP`), na ORDEM do arquivo de 07/2026;
 * · **AGREGADA** (`vlrBaseAgreg`/`vlrAgreg`), a CSRF de 4,65% do arquivo de
 *   06/2026.
 *
 * ⚠️ As duas NÃO saem juntas hoje — que elas convivam, e em que ordem, nenhum
 * arquivo mostra. Quem barra é `validarPagamentoR4020`; aqui a função só emite
 * o que recebeu, porque decidir em dois lugares é como os dois divergem.
 */
function blocoRetencoes(p) {
    const tem = (k) => p[k] !== undefined && p[k] !== null && p[k] !== '';
    // ⚠️ ZERO É "NÃO HOUVE", e o par simplesmente não sai — é o que o arquivo
    // aceito de 07/2026 faz com a CSLL. Emitir `<vlrCSLL>0,00</vlrCSLL>` seria
    // AFIRMAR uma retenção de zero.
    const houve = (k) => tem(k) && Number(String(p[k]).replace(',', '.')) > 0;
    const linhas = [];

    // 🚨 UM LAÇO SÓ, NA ORDEM DO XSD — e é isso que destrava a SCHROEDER.
    //
    // Antes eram DOIS blocos: os separados primeiro, a agregada depois. Com os
    // dois presentes isso emitiria IR → Cofins → PP → Agreg, e o XSD manda
    // Agreg ANTES de Cofins: `xs:sequence`, irmão fora de ordem derruba o
    // evento (foi o que derrubou o R-2099 três vezes). Percorrer a tabela do
    // XSD faz a ordem sair certa por CONSTRUÇÃO, em qualquer combinação.
    for (const [campoBase, campoValor] of RETENCOES_XSD) {
        if (!houve(campoValor)) continue;
        // A base sai do campo PRÓPRIO: no arquivo aceito a do IR é MENOR que o
        // bruto (dedução da cooperativa). Carimbar o bruto declararia a maior.
        // Só a AGREGADA cai no bruto — é o que o arquivo de 06/2026 mostra.
        const base = tem(campoBase) ? p[campoBase]
            : (campoBase === 'vlrBaseAgreg' ? p.vlrBruto : null);
        if (base === null || base === undefined) continue;
        linhas.push(`            <${campoBase}>${fmtValorReinf(base)}</${campoBase}>`);
        linhas.push(`            <${campoValor}>${fmtValorReinf(p[campoValor])}</${campoValor}>`);
    }

    // ⚠️ SEM RETENÇÃO O BLOCO NÃO SAI: `<retencoes>` com zero é a AFIRMAÇÃO de
    // que não houve retenção. Quando de fato não houve, a ausência do bloco é a
    // resposta certa — e é assim que o primeiro arquivo de referência foi aceito.
    if (!linhas.length) return '';
    return `          <retencoes>\n${linhas.join('\n')}\n          </retencoes>\n`;
}

/**
 * Confere UM pagamento — o dono da pergunta *"isto vira evento?"*.
 *
 * 🚨 Ela existe como função PRÓPRIA (03/09) porque a TELA precisa da MESMA
 * resposta ANTES do clique. Até aqui só o gerador sabia: a apuração dizia
 * *"1 pronto(s) · 0 pendente(s)"*, o botão "Transmitir em PRODUÇÃO" nascia
 * verde, e só DEPOIS do clique vinha *"Nenhum beneficiário pôde ser convertido
 * em evento"* (Paulo, 03/09, com o print). Duas leituras do mesmo fato na mesma
 * tela — e a errada era a que decide se a pessoa clica.
 *
 * @returns {string[]} motivos, já prefixados para caber em `pagamentos[i]…`
 */
function validarPagamentoR4020(p) {
  const e = [];
  const num = (v) => Number(String(v == null ? '' : v).replace(',', '.'));
  const tem = (k) => p && p[k] !== undefined && p[k] !== null && p[k] !== '';

  if (!/^[0-9]{5}$/.test(String((p && p.natRend) || ''))) {
    e.push('.natRend deve ter 5 dígitos (Tabela 01)');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String((p && p.dtFG) || ''))) {
    e.push('.dtFG deve ser AAAA-MM-DD');
  }
  // Ausência NÃO vira zero: valor de declaração não tem default.
  if (!tem('vlrBruto')) e.push('.vlrBruto é obrigatório (ausente ≠ zero)');

  // ── Campo cujo NOME nenhum arquivo aceito mostra ────────────────────────
  const naoMapeados = RETENCOES_NAO_MAPEADAS.filter((k) => tem(k));
  if (naoMapeados.length) {
    // 🚨 A MENSAGEM MUDOU DE NATUREZA com o XSD no repo: antes ela dizia que o
    // campo era impossível ("nenhum arquivo aceito mostra o nome"). Agora o
    // nome é CONHECIDO e o que está errado é a CAIXA das letras — então ela
    // diz o nome certo, em vez de mandar esperar um arquivo aceito.
    const comCerto = naoMapeados.map((k) => `${k} (o nome no leiaute é ${NOME_CERTO_DO_CAMPO[k]})`);
    e.push(` traz ${comCerto.join(' e ')}. ${MOTIVO_RETENCAO_BLOQUEADA}`);
  }

  // ── AS DUAS FORMAS NO MESMO BLOCO: DESTRAVADO PELO XSD (04/09) ─────────
  //
  // 🚨 Isto BLOQUEAVA — *"nenhum arquivo aceito mostra os dois no MESMO
  // <retencoes>, nem em que ORDEM"* —, e era o que segurava a SCHROEDER
  // (IRRF + CSRF completa) em "não vira evento", com o botão de transmitir
  // sumido: 1 beneficiário, 0 prontos, nada para enviar.
  //
  // O XSD respondeu: os dez campos são `minOccurs="0"` na MESMA sequence, com
  // `vlrBaseIR`/`vlrIR` ANTES de `vlrBaseAgreg`/`vlrAgreg`. Conviver é válido,
  // e a ORDEM está declarada — que era exatamente o que faltava. Quem monta na
  // ordem certa é `blocoRetencoes`, percorrendo `RETENCOES_XSD`.
  //
  // ⚠️ E ISSO NÃO AFROUXA NADA: continua sem inventar nome nem valor. O que
  // sai é a soma de duas coisas provadas por arquivo ACEITO — o IR separado
  // (07/2026) e a CSRF agregada (06/2026) — na ordem que o schema manda.

  // ── Separada: base e valor andam JUNTOS ────────────────────────────────
  // ⚠️ ZERO É "NÃO HOUVE" e não se acusa: o arquivo aceito OMITE a CSLL porque
  // não houve. Acusar aqui seria alarme sobre a forma certa.
  const houve = (k) => tem(k) && num(p[k]) > 0;
  for (const [campoBase, campoValor] of RETENCOES_SEPARADAS) {
    if (!houve(campoValor)) {
      if (tem(campoValor) && num(p[campoValor]) < 0) e.push(`.${campoValor} inválido`);
      continue;
    }
    if (!tem(campoBase)) {
      // ⚠️ O IR tem motivo PRÓPRIO — dizer "falta a base" sobre a nota da
      // cooperativa manda procurar erro de digitação onde o problema é que o
      // app não TEM a base (a régua de 31/08: alarme que nomeia a falha errada).
      e.push(campoValor === 'vlrIR' ? `: ${MOTIVO_BASE_IR_DESCONHECIDA}`
        : ` tem ${campoValor} sem ${campoBase}: valor de retenção sem base não se declara`);
      continue;
    }
    if (!Number.isFinite(num(p[campoValor]))) e.push(`.${campoValor} inválido`);
  }

  // ── Agregada: o que o arquivo aceito de 06/2026 prova ───────────────────
  if (!tem('vlrAgreg') && tem('vlrBaseAgreg')) {
    e.push(' tem vlrBaseAgreg sem vlrAgreg: base sem retenção não se declara');
  }
  if (tem('vlrAgreg')) {
    const vAgreg = num(p.vlrAgreg);
    if (!Number.isFinite(vAgreg) || vAgreg < 0) {
      e.push('.vlrAgreg inválido');
    } else if (vAgreg === 0) {
      e.push('.vlrAgreg é 0,00. Nota sem retenção NÃO leva o bloco <retencoes>: '
        + 'declarar zero é AFIRMAR que não houve retenção. Omita o campo.');
    } else {
      // 🚨 CONFERÊNCIA DA ALÍQUOTA — a mesma assinatura que o CFI usa para
      // reconhecer a CSRF. O arquivo aceito fecha ao centavo:
      // 3.210,96 × 4,65% = 149,31.
      //
      // ⚠️ Ela ACUSA, não corrige: retenção parcial e base com dedução existem,
      // e recalcular aqui faria o evento e a apuração declararem números
      // diferentes sobre a mesma nota (a régua do R-2055).
      const base = num(tem('vlrBaseAgreg') ? p.vlrBaseAgreg : p.vlrBruto);
      if (Number.isFinite(base) && base > 0) {
        const esperado = Math.round(base * ALIQ_CSRF) / 100;
        if (Math.abs(esperado - vAgreg) > 0.02) {
          e.push(`: vlrAgreg ${vAgreg.toFixed(2)} não fecha com ${ALIQ_CSRF}% da base `
            + `${base.toFixed(2)} (esperado ${esperado.toFixed(2)}). O R-4020 declara a CSRF `
            + 'AGREGADA; confira se a base ou o valor está certo.');
        }
      }
    }
  }
  return e;
}

/** Pré-condições. Devolve lista de erros (vazia = ok). */
function validarEntradaR4020(ev) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evento ausente'];
  const { contribuinte, estabelecimento, perApur, tpAmb, beneficiario, pagamentos } = ev;

  if (!contribuinte || ![1, 2].includes(Number(contribuinte.tpInsc))) {
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  } else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(contribuinte.nrInsc))) {
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  }
  if (!estabelecimento || ![1, 2, 3].includes(Number(estabelecimento.tpInscEstab))) {
    e.push('estabelecimento.tpInscEstab deve ser 1, 2 ou 3');
  } else if (!/^([0-9]{11}|[0-9]{14})$/.test(soDigitos(estabelecimento.nrInscEstab))) {
    e.push('estabelecimento.nrInscEstab deve ter 11 ou 14 dígitos');
  }
  if (!/^\d{4}-\d{2}$/.test(String(perApur || ''))) e.push('perApur deve ser AAAA-MM');
  if (![1, 2].includes(Number(tpAmb))) e.push('tpAmb deve ser 1 (produção) ou 2 (produção restrita)');

  // BENEFICIÁRIO PJ: 14 dígitos. CPF aqui é R-4010, outro evento — e mandar um
  // CPF no cnpjBenef não é "quase certo", é o evento errado.
  const cnpj = soDigitos(beneficiario && beneficiario.cnpj);
  if (cnpj.length !== 14) {
    e.push(cnpj.length === 11
      ? 'beneficiario.cnpj tem 11 dígitos (CPF): pagamento a pessoa física é R-4010, não R-4020'
      : 'beneficiario.cnpj deve ter 14 dígitos');
  }

  if (!Array.isArray(pagamentos) || !pagamentos.length) {
    e.push('pagamentos deve ter ao menos 1 item');
  } else {
    pagamentos.forEach((p, i) => {
      validarPagamentoR4020(p).forEach((m) => e.push(`pagamentos[${i}]${m}`));
    });
  }
  return e;
}


/**
 * A TRADUÇÃO beneficiário → pagamento do R-4020 — dono único.
 *
 * 🚨 Ela morava DENTRO da rota, e por isso a TELA não tinha como saber o que o
 * gerador receberia: era assim que *"1 pronto"* convivia com *"nenhum evento
 * gerado"* na mesma tela (Paulo, 03/09).
 *
 * 📌 QUAL FORMA SAI, e cada ramo tem a prova do lado:
 *   · **com CSLL** ⇒ a CSRF vai **AGREGADA** (arquivo aceito de 06/2026). A
 *     apuração separa PIS/COFINS/CSLL porque o EFD-Contribuições e o Relatório
 *     de Retenções pedem assim; o R-4020 declara o TOTAL, a partir do MESMO
 *     número — somar de volta não é recalcular.
 *   · **sem CSLL** ⇒ vai **SEPARADA** (arquivo aceito de 07/2026), que é o caso
 *     do beneficiário que retém só PIS e COFINS.
 *
 * ⚠️ E o `vlrBaseIR` só sai quando o IR FECHA na alíquota legal sobre o bruto —
 * é isso que PROVA que a base é o bruto. Quando não fecha (cooperativa, base
 * com dedução: o arquivo aceito traz 15.371,80 sobre bruto de 21.708,16), o
 * valor sai SEM a base e `validarPagamentoR4020` bloqueia dizendo por quê.
 * Carimbar o bruto ali declararia base A MAIOR, em silêncio.
 */
function pagamentoR4020DoBeneficiario(b) {
  const n = (v) => Number(v || 0);
  const bruto = n(b && b.bruto);
  const ir = n(b && b.ir);
  const csll = n(b && b.csll);
  const pis = n(b && b.pis);
  const cofins = n(b && b.cofins);

  const p = {
    natRend: b && b.natureza,
    // A data do fato gerador sai da NOTA. Sem ela o gerador recusa — carimbar
    // "o último dia do mês" seria inventar a data que decide a competência do IR.
    dtFG: b && b.dataFatoGerador,
    vlrBruto: b && b.bruto,
    indJud: 'N',
  };

  if (ir > 0) {
    p.vlrIR = ir;
    const fecha = bruto > 0 && ALIQ_IRRF.some((a) => Math.abs(Math.round(bruto * a) / 100 - ir) <= 0.02);
    if (fecha) p.vlrBaseIR = b.bruto;
  }

  if (csll > 0) {
    const agregado = Math.round((pis + cofins + csll) * 100) / 100;
    if (agregado > 0) { p.vlrBaseAgreg = b.bruto; p.vlrAgreg = agregado; }
  } else {
    if (cofins > 0) { p.vlrBaseCofins = b.bruto; p.vlrCofins = cofins; }
    if (pis > 0) { p.vlrBasePP = b.bruto; p.vlrPP = pis; }
  }
  return p;
}

/**
 * O beneficiário vira evento? — a resposta que a TELA mostra ANTES do clique.
 *
 * @returns {string|null} o motivo do bloqueio, ou null
 */
function bloqueioDoR4020(beneficiario) {
  const motivos = validarPagamentoR4020(pagamentoR4020DoBeneficiario(beneficiario));
  if (!motivos.length) return null;
  // Os prefixos existem para a mensagem de CAMPO (`pagamentos[0].natRend…`);
  // aqui a frase é do beneficiário, então eles saem.
  return motivos.map((m) => m.replace(/^[.:]\s*/, '').replace(/^\s+/, '')).join(' · ');
}

module.exports = {
  NS_R4020, gerarR4020, validarEntradaR4020, validarPagamentoR4020,
  pagamentoR4020DoBeneficiario, bloqueioDoR4020, RETENCOES_SEPARADAS,
  // A sequence LIDA do XSD e o de-para dos nomes com a caixa errada — o teste
  // prova os dois contra o arquivo em docs/reinf/xsd/.
  RETENCOES_XSD, NOME_CERTO_DO_CAMPO,
  MOTIVO_RETENCAO_BLOQUEADA, MOTIVO_IR_COM_AGREGADA, MOTIVO_BASE_IR_DESCONHECIDA,
  RETENCOES_NAO_MAPEADAS, ALIQ_CSRF,
};
