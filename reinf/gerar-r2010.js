// ============================================================================
// reinf/gerar-r2010.js
// ----------------------------------------------------------------------------
// R-2010 — Retenção de contribuição previdenciária sobre SERVIÇOS TOMADOS
// (11% do art. 31 da Lei 8.212/91). Quem declara é o TOMADOR.
//
// ═══ A FONTE DESTE MÓDULO É UM ARQUIVO ACEITO PELA RECEITA ═══════════════════
//
// Não foi escrito a partir do XSD (a doc do portal SPED é bloqueada pela rede)
// nem por analogia com o R-2055. Foi escrito a partir de um `evtServTom` REAL
// transmitido e ACEITO em PRODUÇÃO (id ID1326027010000002026070811123300001,
// perApur 2026-06, tpAmb 1), com o recibo `evtTotal` ao lado:
// `cdRetorno 0 — SUCESSO`, `tpEv 2010`, `nrRecArqBase 6258005-01-2010-2606-…`.
//
// O QUE O ARQUIVO PROVOU, campo a campo:
//   1. evento = `evtServTom`, namespace `evtTomadorServicos/v2_01_02`
//   2. hierarquia: infoServTom > ideEstabObra > idePrestServ > nfs > infoTpServ
//   3. estabelecimento do TOMADOR = tpInscEstab=1 / nrInscEstab (14 dígitos)
//      + `indObra` no MESMO nível
//   4. prestador = `cnpjPrestador` (14 dígitos, sem tpInsc — é sempre CNPJ)
//   5. ordem dos totais do prestador: vlrTotalBruto → vlrTotalBaseRet →
//      vlrTotalRetPrinc → vlrTotalRetAdic → vlrTotalNRetPrinc →
//      vlrTotalNRetAdic → indCPRB
//   6. ordem do `nfs`: serie → numDocto → dtEmissaoNF → vlrBruto → obs
//   7. ordem do `infoTpServ`: tpServico → vlrBaseRet → vlrRetencao → vlrRetSub
//      → vlrNRetPrinc → vlrServicos15 → vlrServicos20 → vlrServicos25 →
//      vlrAdicional → vlrNRetAdic
//   8. `dtEmissaoNF` em AAAA-MM-DD; valores com VÍRGULA decimal
//   9. ideContri/nrInsc com a RAIZ de 8 dígitos; id = ID + 34 (mesmo gerador)
//  10. o recibo casa o valor com `CRTom 116201` — o código de receita da
//      retenção, que o app não podia inventar
//
// ═══ BASE ≠ BRUTO — O ACHADO QUE MANDA AQUI ═════════════════════════════════
//
// No evento aceito o bruto é **5.755,54** e a base retida é **4.604,43**, e a
// própria `obs` diz por quê: **INSUMOS**. A dedução de material/insumo (IN RFB
// 971, arts. 121-124) reduz a base e NÃO vem separada na NFS-e.
//
// Por isso `vlrBaseRet` é campo OBRIGATÓRIO de entrada aqui: ele nunca é
// derivado do bruto. O CFI só entrega a base quando a alíquota PROVA que não
// houve dedução (retido = 11% do bruto); nos demais casos ele manda uma base
// DERIVADA e marcada, e derivada não entra em declaração — este gerador recusa.
//
// ═══ O QUE ESTE MÓDULO SE RECUSA A FAZER ════════════════════════════════════
//
// · NÃO INVENTA `tpServico` (tabela 06, 9 dígitos) nem `indObra` — nenhum dos
//   dois está na nota. Faltando, BLOQUEIA. `indObra` "quase sempre 0" é o
//   default proibido: campo de declaração não tem valor de fábrica.
// · NÃO DEDUZ `indCPRB`. Retenção de ~3,5% tem duas leituras (desonerado × 11%
//   sobre base muito deduzida) e o CFI já se recusa a escolher.
// · Campo de VALOR ausente NÃO vira zero. Zero só entra onde zero É a resposta
//   (o evento aceito traz 0,00 em vlrTotalRetAdic/NRet*, e são zeros de fato).
// · Prestador PF não é R-2010 (contribuinte individual é eSocial) — recusa.
//
// ⚠️ **UM PRESTADOR POR EVENTO, e isto é DECISÃO, não leiaute lido.** O arquivo
// aceito tem UM `ideEstabObra` com UM `idePrestServ`; ele NÃO prova que os dois
// repetem. O R-2055 custou cinco versões e três sondas justamente por empilhar
// filhos que o XSD recusava (MS0030). Então: um evento por prestador — vários
// prestadores viram vários EVENTOS no mesmo lote (`gerarEventosR2010`), que é a
// forma provada.
//
// Já o grupo `nfs` é gerado REPETINDO, e a razão vem do próprio documento: os
// campos do prestador se chamam **vlrTotal**Bruto/BaseRet/RetPrinc. Total de UMA
// nota só seria redundante com a própria nota. Ainda assim é INFERÊNCIA, e por
// isso existe a sonda `maxNotas` — uma transmissão em produção restrita com 1
// nota responde por prova, em vez de descobrirmos na entrega.
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC,
  fmtValorReinf, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R2010 =
  `http://www.reinf.esocial.gov.br/schemas/evtTomadorServicos/${LEIAUTE_REINF}`;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Ausência ≠ zero. null/undefined/'' bloqueiam; zero só passa quando zero é a
// resposta (e aí ele vem escrito como 0).
const temValor = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));

// Campos de valor do prestador que o evento aceito traz zerados de verdade.
// Eles têm DEFAULT ZERO de propósito: "não houve retenção adicional" é uma
// resposta, não uma ausência — diferente de vlrBaseRet, que é desconhecido
// quando não informado.
const TOTAIS_OPCIONAIS = ['vlrTotalRetAdic', 'vlrTotalNRetPrinc', 'vlrTotalNRetAdic'];
const SERVICO_OPCIONAIS = ['vlrRetSub', 'vlrNRetPrinc', 'vlrServicos15', 'vlrServicos20',
  'vlrServicos25', 'vlrAdicional', 'vlrNRetAdic'];

const opcional = (o, campo) => fmtValorReinf(temValor(o && o[campo]) ? Number(o[campo]) : 0);

// ═══ `obs` É CAMPO DE LEIAUTE COM MaxLength, E A DISCRIMINAÇÃO É TEXTO LIVRE ═
//
// A `obs` do `nfs` recebe a DISCRIMINAÇÃO da NFS-e — texto que o PRESTADOR
// digita, sem teto nenhum. No evento aceito de 06/2026 ela tinha 35 caracteres
// e passou; em 08/2026 o mesmo prestador escreveu 340 (o serviço item a item,
// com valores e vencimento) e a Receita RECUSOU o lote inteiro:
//
//   MS0030 — "the '…/evtTomadorServicos/v2_01_02:obs' element is invalid …
//             The actual length is greater than the MaxLength value."
//
// Não é caso raro: é a garantia de estourar no dia em que o prestador escrever
// mais. Campo de leiaute com MaxLength não recebe texto de terceiro sem teto.
//
// ⚠️ O MaxLength do XSD NÃO ESTÁ MEDIDO, e o número abaixo é do APP, não do
// leiaute. O portal SPED é bloqueado por esta rede e só o XSD do R-4020 está no
// repo (docs/reinf/xsd); nele o campo IRMÃO `observ` (documentation
// "Observacoes") é `maxLength 200`, nas duas vezes em que aparece — o que
// CORROBORA a ordem de grandeza e **não é o número do 2010**: leiaute de evento
// vizinho já custou caro nesta casa (o 1010 tem sete campos num arquivo e nove
// no outro).
//
// 📏 O PISO É PROVADO POR ARQUIVO ACEITO, e ele subiu de 35 para 97 (10/09): o
// `evtServTom` de 07/2026 da MESMA empresa, MESMO prestador e MESMO namespace
// (evtTomadorServicos/v2_01_02), transmitido em PRODUÇÃO (`tpAmb 1`) pelo
// REINF.Web (`verProc 3.46.0000`), traz um `obs` de **97 caracteres** (98 bytes
// UTF-8) e foi ACEITO. Ou seja: a Receita aceita ao menos 97 neste campo — é a
// régua de sempre, arquivo ACEITO vence leiaute DEDUZIDO.
//
// ⚠️ E 97 CONTINUA SENDO PISO, NUNCA TETO: aquele `obs` é a MESMA discriminação
// da nota, COMPRIMIDA pelo outro sistema (rótulos suprimidos, valores colados —
// "…ALIMP8HS CDESCR 1587688 FALTAS R    34930601 INSUMOS"). Ele prova o que
// PASSOU, não onde o campo estoura. Subir acima de 97 é dedução, e dedução aqui
// devolve o MS0030 com o lote inteiro.
//
// 📌 A UNIDADE É A MESMA DOS DOIS LADOS, e isso não é coincidência a mexer: o
// validador da Receita é .NET (a recusa vem em inglês, "The actual length is
// greater than the MaxLength value") e `MaxLength` ali conta unidades UTF-16 —
// exatamente o que `String.prototype.length` conta abaixo. Trocar por bytes
// mediria outra coisa que a Receita não confere. E mesmo na leitura mais
// pessimista a folga fica: 97 caracteres todos acentuados dariam ~194 bytes,
// ainda abaixo dos 200 do campo irmão.
//
// Os dois erros continuam custando diferente, e é isso que fixa o número no
// piso em vez de num palpite maior. Errar para BAIXO omite uma observação
// informativa, e nenhum valor do evento depende dela. Errar para CIMA devolve o
// MS0030 e o lote inteiro volta recusado, com a competência sem entrega.
//
// 📌 Quando o XSD do evtTomadorServicos entrar em docs/reinf/xsd (do mesmo
// jeito que o do R-4020 entrou), este número vira o do leiaute.
const OBS_MAX_APP = 97;

// O que o app se permite mandar no `obs`. Devolve o texto ou `null` + o motivo,
// nunca um texto CORTADO: recortar a discriminação de terceiro produz frase
// picada no meio ("…RETENCAO SEG.SOCI"), que é dado com cara de declaração.
function obsQueCabe(bruto) {
  const texto = String(bruto == null ? '' : bruto).trim();
  if (!texto) return { obs: null, motivo: null };
  if (texto.length <= OBS_MAX_APP) return { obs: texto, motivo: null };
  return {
    obs: null,
    motivo: `observação da nota com ${texto.length} caracteres não foi enviada: o campo obs do `
      + `leiaute tem tamanho máximo e o app não recorta texto de declaração (teto do app: `
      + `${OBS_MAX_APP}). O campo é informativo — o evento e a retenção não dependem dele.`,
  };
}

/**
 * Gera UM evento R-2010 (evtServTom) — um estabelecimento, UM prestador.
 *
 * @param {object} ev
 * @param {object} ev.contribuinte   { tpInsc:1|2, nrInsc }  (ideContri — raiz)
 * @param {object} ev.estab          { tpInscEstab:1|4, nrInscEstab (14), indObra:0|1|2 }
 * @param {string} ev.perApur        'AAAA-MM'
 * @param {1|2}    ev.tpAmb          1=produção, 2=produção restrita
 * @param {1|2}    [ev.indRetif=1]
 * @param {string} [ev.nrRecibo]     recibo do evento retificado (indRetif=2)
 * @param {number} [ev.seq=1]
 * @param {Date}   [ev.data]         para o id (injetável nos testes)
 * @param {object} ev.prestador      { cnpjPrestador, indCPRB:0|1, notas:[...] }
 *   nota: { serie, numDocto, dtEmissaoNF:'AAAA-MM-DD', vlrBruto, obs?,
 *           servicos:[{ tpServico, vlrBaseRet, vlrRetencao, ... }] }
 * @returns {{ id:string, cnpjTomador:string, cnpjPrestador:string, xml:string }}
 */
function gerarR2010(ev) {
  const erros = validarEntradaR2010(ev);
  if (erros.length) throw new Error('R-2010 inválido:\n - ' + erros.join('\n - '));

  const { contribuinte, estab, perApur, tpAmb,
          indRetif = 1, nrRecibo, seq = 1, data, prestador } = ev;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
    ...(data ? { data } : {}),
  });

  const infoTpServXml = (s) => (
    '            <infoTpServ>\n'
    + `              <tpServico>${escXml(s.tpServico)}</tpServico>\n`
    + `              <vlrBaseRet>${fmtValorReinf(s.vlrBaseRet)}</vlrBaseRet>\n`
    + `              <vlrRetencao>${fmtValorReinf(s.vlrRetencao)}</vlrRetencao>\n`
    + SERVICO_OPCIONAIS.map((c) => `              <${c}>${opcional(s, c)}</${c}>`).join('\n') + '\n'
    + '            </infoTpServ>'
  );

  // O que ficou de FORA do evento sai NOMEADO — omissão calada faz quem
  // confere procurar buraco de captura numa nota que está inteira.
  const avisos = [];

  const nfsXml = (n) => {
    // `obs` é o campo que, no evento aceito, descreve o serviço da nota. Só sai
    // quando existe (tag vazia não é informação) E quando cabe no leiaute.
    const { obs, motivo } = obsQueCabe(n.obs);
    if (motivo) avisos.push({ numDocto: String(n.numDocto), campo: 'obs', motivo });
    return (
      '          <nfs>\n'
      + `            <serie>${escXml(n.serie)}</serie>\n`
      + `            <numDocto>${escXml(n.numDocto)}</numDocto>\n`
      + `            <dtEmissaoNF>${escXml(n.dtEmissaoNF)}</dtEmissaoNF>\n`
      + `            <vlrBruto>${fmtValorReinf(n.vlrBruto)}</vlrBruto>\n`
      + (obs ? `            <obs>${escXml(obs)}</obs>\n` : '')
      + n.servicos.map(infoTpServXml).join('\n') + '\n'
      + '          </nfs>'
    );
  };

  // Os totais do prestador vêm SOMADOS das notas — é o que o evento aceito
  // mostra (5.755,54 / 4.604,43 / 506,49 com uma nota só). Somar aqui, e não
  // receber pronto, impede que o total e o detalhe divirjam (a classe de erro
  // que a auditoria de saída do SPED vigia).
  const soma = (f) => prestador.notas.reduce((t, n) => t + f(n), 0);
  const totalBruto = soma((n) => Number(n.vlrBruto));
  const totalBaseRet = soma((n) => n.servicos.reduce((t, s) => t + Number(s.vlrBaseRet), 0));
  const totalRetPrinc = soma((n) => n.servicos.reduce((t, s) => t + Number(s.vlrRetencao), 0));

  const idePrestServXml =
    '        <idePrestServ>\n'
    + `          <cnpjPrestador>${soDigitos(prestador.cnpjPrestador)}</cnpjPrestador>\n`
    + `          <vlrTotalBruto>${fmtValorReinf(totalBruto)}</vlrTotalBruto>\n`
    + `          <vlrTotalBaseRet>${fmtValorReinf(totalBaseRet)}</vlrTotalBaseRet>\n`
    + `          <vlrTotalRetPrinc>${fmtValorReinf(totalRetPrinc)}</vlrTotalRetPrinc>\n`
    + TOTAIS_OPCIONAIS.map((c) => `          <${c}>${opcional(prestador, c)}</${c}>`).join('\n') + '\n'
    + `          <indCPRB>${Number(prestador.indCPRB)}</indCPRB>\n`
    + prestador.notas.map(nfsXml).join('\n') + '\n'
    + '        </idePrestServ>';

  const ideEventoLinhas = [`      <indRetif>${indRetif}</indRetif>`];
  if (indRetif === 2 && nrRecibo) ideEventoLinhas.push(`      <nrRecibo>${escXml(nrRecibo)}</nrRecibo>`);
  ideEventoLinhas.push(
    `      <perApur>${perApur}</perApur>`,
    `      <tpAmb>${tpAmb}</tpAmb>`,
    '      <procEmi>1</procEmi>',
    `      <verProc>${escXml(VER_PROC)}</verProc>`,
  );

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="${NS_R2010}">
  <evtServTom id="${id}">
    <ideEvento>
${ideEventoLinhas.join('\n')}
    </ideEvento>
    <ideContri>
      <tpInsc>${contribuinte.tpInsc}</tpInsc>
      <nrInsc>${nrInscContribuinteReinf(contribuinte)}</nrInsc>
    </ideContri>
    <infoServTom>
      <ideEstabObra>
        <tpInscEstab>${Number(estab.tpInscEstab)}</tpInscEstab>
        <nrInscEstab>${soDigitos(estab.nrInscEstab)}</nrInscEstab>
        <indObra>${Number(estab.indObra)}</indObra>
${idePrestServXml}
      </ideEstabObra>
    </infoServTom>
  </evtServTom>
  <!-- ASSINATURA: o <Signature> (XMLDSig, certificado A1) entra na etapa de
       assinatura do backend/gateway, antes de transmitir. O XSD exige. -->
</Reinf>`;

  return {
    id,
    cnpjTomador: soDigitos(estab.nrInscEstab),
    cnpjPrestador: soDigitos(prestador.cnpjPrestador),
    xml,
    // Vazio no caso normal. Quem transmite mostra na tela — o que ficou de fora
    // do evento tem de aparecer para quem confere.
    avisos,
  };
}

/**
 * Um EVENTO por prestador, todos para o MESMO lote.
 *
 * O `seq` entra no id, então cada evento precisa do seu — id repetido é RECUSA
 * do lote inteiro (lição MS0017 do assinador).
 *
 * ⚠️ **`indObra` É DO PRESTADOR, não do lote.** Ele é cadastrado prestador a
 * prestador (é do contrato dele: limpeza mensal não é obra, empreitada total
 * é), e até 14/08 o caminho de transmissão mandava o `indObra` do PRIMEIRO
 * prestador pronto dentro de TODOS os eventos — porque `{...ev}` repetia um
 * `estab` só. Com dois prestadores de naturezas diferentes, o segundo era
 * declarado com a natureza do primeiro: ACEITO pela Receita, e errado — que é
 * o pior desfecho, porque não volta recusa nenhuma para avisar.
 * "O primeiro decide pelos outros" é a forma silenciosa desse defeito; por isso
 * cada prestador resolve o SEU estabelecimento aqui.
 *
 * @returns {Array<{ id, cnpjTomador, cnpjPrestador, xml, avisos }>}
 */
function gerarEventosR2010(ev) {
  const prestadores = Array.isArray(ev && ev.prestadores) ? ev.prestadores : [];
  if (!prestadores.length) throw new Error('R-2010 inválido:\n - prestadores deve ter ao menos 1 item');
  const seqBase = Number(ev.seq) > 0 ? Number(ev.seq) : 1;
  return prestadores.map((p, i) => gerarR2010({
    ...ev,
    estab: estabDoPrestador(ev.estab, p),
    seq: seqBase + i,
    prestador: p,
    prestadores: undefined,
  }));
}

/**
 * O estabelecimento tomador DAQUELE prestador.
 *
 * O que o prestador traz vence o padrão do lote; o que ele não traz continua
 * vindo de lá (o CNPJ do tomador é o mesmo para todos). Ausência NÃO vira
 * herança silenciosa do valor de OUTRO prestador: quando ninguém informou,
 * `indObra` fica ausente e a validação BLOQUEIA — que é o comportamento certo
 * para campo de declaração sem resposta.
 */
function estabDoPrestador(estabDoLote, prestador) {
  const base = { ...(estabDoLote || {}) };
  const p = prestador || {};
  if (p.indObra !== null && p.indObra !== undefined && String(p.indObra).trim() !== ''
      && [0, 1, 2].includes(Number(p.indObra))) {
    base.indObra = Number(p.indObra);
  }
  if (String(p.nrInscEstab || '').trim()) base.nrInscEstab = p.nrInscEstab;
  if ([1, 4].includes(Number(p.tpInscEstab))) base.tpInscEstab = Number(p.tpInscEstab);
  return base;
}

/** Pré-condições. Devolve lista de erros (vazia = ok). */
function validarEntradaR2010(ev) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evento ausente'];
  const { contribuinte, estab, perApur, tpAmb, prestador, prestadores } = ev;

  if (Array.isArray(prestadores) && prestadores.length > 1) {
    // MATA-BURRO: empilhar prestador é exatamente o que derrubou o R-2055 três
    // vezes (MS0030). Não é aviso — é recusa, com o caminho ao lado.
    e.push(`prestadores tem ${prestadores.length} itens: o arquivo aceito de referência tem UM `
      + '`idePrestServ`, e a multiplicidade não está provada. Use gerarEventosR2010, que devolve '
      + 'um evento por prestador para o MESMO lote.');
  }

  if (!contribuinte || ![1, 2].includes(Number(contribuinte.tpInsc))) {
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  } else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(contribuinte.nrInsc))) {
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  }

  // tpInscEstab: 1 = CNPJ · 4 = CNO (obra). O evento aceito usa 1.
  if (!estab || ![1, 4].includes(Number(estab.tpInscEstab))) {
    e.push('estab.tpInscEstab deve ser 1 (CNPJ) ou 4 (CNO)');
  } else if (!/^[0-9]{12,14}$/.test(soDigitos(estab.nrInscEstab))) {
    e.push('estab.nrInscEstab deve ter 14 dígitos (CNPJ do estabelecimento tomador) ou 12 (CNO)');
  }
  if (!estab || ![0, 1, 2].includes(Number(estab.indObra))) {
    // NÃO tem default. "Quase sempre 0" é o palpite que campo de declaração
    // não aceita — e indObra errado muda a natureza do que se declara.
    e.push('estab.indObra não informado — 0 (não é obra), 1 (obra com CNO próprio) ou 2 (empreitada total). '
      + 'Não está na nota e não se deduz: é informado por prestador na tela.');
  }

  if (!/^\d{4}-\d{2}$/.test(String(perApur || ''))) e.push('perApur deve ser AAAA-MM');
  if (![1, 2].includes(Number(tpAmb))) e.push('tpAmb deve ser 1 (produção) ou 2 (produção restrita)');

  if (!prestador || typeof prestador !== 'object') {
    e.push('prestador ausente');
    return e;
  }
  const cnpj = soDigitos(prestador.cnpjPrestador);
  if (cnpj.length !== 14) {
    e.push(cnpj.length === 11
      ? 'prestador.cnpjPrestador tem 11 dígitos (CPF): serviço tomado de pessoa física é contribuinte '
        + 'individual e entra pelo eSocial, não pelo R-2010'
      : 'prestador.cnpjPrestador deve ter 14 dígitos');
  }
  if (![0, 1].includes(Number(prestador.indCPRB))) {
    e.push('prestador.indCPRB não informado — 0 (retenção de 11%) ou 1 (prestador desonerado, 3,5%). '
      + 'Retenção de ~3,5% tem duas leituras e o app não escolhe: confirme com a nota/contrato.');
  }

  const notas = prestador.notas;
  if (!Array.isArray(notas) || !notas.length) {
    e.push('prestador.notas deve ter ao menos 1 item');
    return e;
  }
  notas.forEach((n, i) => {
    const onde = `prestador.notas[${i}]`;
    if (!String((n && n.numDocto) || '').trim()) e.push(`${onde}.numDocto ausente`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String((n && n.dtEmissaoNF) || ''))) {
      e.push(`${onde}.dtEmissaoNF deve ser AAAA-MM-DD`);
    }
    if (!temValor(n && n.vlrBruto)) e.push(`${onde}.vlrBruto ausente — valor de declaração não tem default.`);

    const servicos = n && n.servicos;
    if (!Array.isArray(servicos) || !servicos.length) {
      e.push(`${onde}.servicos deve ter ao menos 1 item`);
      return;
    }
    servicos.forEach((s, j) => {
      const ondej = `${onde}.servicos[${j}]`;
      // tpServico: tabela 06 do Reinf, 9 dígitos (100000001 = limpeza no evento
      // aceito). Não está na nota e não se chuta.
      if (!/^[0-9]{9}$/.test(String((s && s.tpServico) || ''))) {
        e.push(`${ondej}.tpServico não informado (tabela 06 da EFD-Reinf, 9 dígitos). Não está na NFS-e — `
          + 'é marcado por prestador na tela. Sem ele o R-2010 é recusado; com ele chutado, é pior.');
      }
      // vlrBaseRet NUNCA se deriva do bruto: no evento aceito o bruto é
      // 5.755,54 e a base é 4.604,43 (dedução de INSUMOS).
      if (!temValor(s && s.vlrBaseRet)) {
        e.push(`${ondej}.vlrBaseRet ausente — a base NÃO é o valor bruto quando há dedução de `
          + 'material/insumo (IN RFB 971, arts. 121-124). Informe a base da nota.');
      }
      if (!temValor(s && s.vlrRetencao)) {
        e.push(`${ondej}.vlrRetencao ausente — valor de declaração não tem default (nunca vira zero).`);
      }
    });
  });

  return e;
}

module.exports = {
  gerarR2010, gerarEventosR2010, estabDoPrestador, validarEntradaR2010,
  obsQueCabe, OBS_MAX_APP, NS_R2010,
};
