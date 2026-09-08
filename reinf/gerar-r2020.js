// ============================================================================
// reinf/gerar-r2020.js
// ----------------------------------------------------------------------------
// R-2020 — Retenção de contribuição previdenciária SOFRIDA em SERVIÇOS
// PRESTADOS (11% do art. 31 da Lei 8.212/91). Quem declara é o PRESTADOR.
//
// ═══ A FONTE DESTE MÓDULO É UM ARQUIVO ACEITO PELA RECEITA ═══════════════════
//
// Não foi escrito espelhando o R-2010 de memória. Foi escrito a partir de um
// `evtServPrest` REAL de 07/2026, transmitido pelo REINF.Web e ACEITO em
// PRODUÇÃO (tpAmb 1), que o Paulo mandou em 08/09/2026 (*"preciso gerar a
// REINF de INSS de serviços prestados e não está habilitado, pode liberar"*).
//
// O QUE O ARQUIVO PROVOU, campo a campo:
//   1. evento = `evtServPrest`, namespace `evtPrestadorServicos/v2_01_02`
//   2. hierarquia: infoServPrest > ideEstabPrest > ideTomador > nfs > infoTpServ
//   3. estabelecimento do PRESTADOR = tpInscEstabPrest=1 / nrInscEstabPrest (14)
//   4. o TOMADOR é o eixo: tpInscTomador=1 / nrInscTomador (14) + `indObra` no
//      MESMO nível, seguido dos totais do tomador
//   5. ordem dos totais: vlrTotalBruto → vlrTotalBaseRet → vlrTotalRetPrinc →
//      vlrTotalRetAdic → vlrTotalNRetPrinc → vlrTotalNRetAdic
//   6. ordem do `nfs`: serie → numDocto → dtEmissaoNF → vlrBruto
//   7. `infoTpServ` traz SÓ tpServico → vlrBaseRet → vlrRetencao
//   8. `dtEmissaoNF` em AAAA-MM-DD; valores com VÍRGULA decimal; série
//      ALFANUMÉRICA ("E" no aceito)
//   9. ideContri/nrInsc com a RAIZ de 8 dígitos; id = ID + 34 (mesmo gerador)
//
// ═══ O QUE O ARQUIVO DESMENTIU DO ESPELHO INGÊNUO ═══════════════════════════
//
// · **NÃO existe `indCPRB` no R-2020.** A desoneração do prestador (que aqui é
//   o próprio cliente) é do R-1000 (`indDesoneracao`), não deste evento.
//   Emitir a tag aqui é XML que o XSD recusa.
// · **O `infoTpServ` NÃO leva os sete zeros** (`vlrRetSub`, `vlrNRetPrinc`,
//   `vlrServicos15/20/25`, `vlrAdicional`, `vlrNRetAdic`) que o R-2010 emite.
//   O aceito traz só os três campos; este gerador emite só o que foi provado.
// · **`obs` não aparece** no aceito. Fica de fora — tag não provada não sai.
//
// ═══ O QUE ESTE MÓDULO SE RECUSA A FAZER ════════════════════════════════════
//
// · NÃO INVENTA `tpServico` nem `indObra` — nenhum dos dois está na nota. São
//   cadastrados por TOMADOR (o indicador de obra é do contrato com AQUELE
//   tomador). Faltando, BLOQUEIA.
// · Campo de VALOR ausente NÃO vira zero. Zero só entra onde zero É a resposta
//   (os três totais `Adic`/`NRet`, que o aceito traz em 0,00 de fato).
// · Base DERIVADA não entra: `vlrBaseRet` é obrigatório de entrada.
// · Tomador PF não é R-2020 — a retenção do art. 31 é entre PJ.
//
// ⚠️ **UM TOMADOR POR EVENTO, e isto é DECISÃO, não leiaute lido.** O aceito
// tem UM `ideEstabPrest` com UM `ideTomador`; ele NÃO prova que repetem. O
// R-2055 custou três sondas por empilhar filho que o XSD recusava (MS0030).
// Vários tomadores viram vários EVENTOS no mesmo lote (`gerarEventosR2020`).
// ============================================================================

const {
  LEIAUTE_REINF, VER_PROC,
  fmtValorReinf, gerarIdEvento, nrInscContribuinteReinf,
} = require('./reinf-utils');

const NS_R2020 =
  `http://www.reinf.esocial.gov.br/schemas/evtPrestadorServicos/${LEIAUTE_REINF}`;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Ausência ≠ zero. null/undefined/'' bloqueiam; zero só passa quando zero é a
// resposta (e aí ele vem escrito como 0).
const temValor = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));

// Totais do tomador que o evento aceito traz zerados de verdade: "não houve
// retenção adicional / não retida" é uma resposta, não uma ausência.
const TOTAIS_OPCIONAIS = ['vlrTotalRetAdic', 'vlrTotalNRetPrinc', 'vlrTotalNRetAdic'];
const opcional = (o, campo) => fmtValorReinf(temValor(o && o[campo]) ? Number(o[campo]) : 0);

/**
 * Gera UM evento R-2020 (evtServPrest) — um estabelecimento prestador, UM tomador.
 *
 * @param {object} ev
 * @param {object} ev.contribuinte   { tpInsc:1|2, nrInsc }  (ideContri — raiz)
 * @param {object} ev.estab          { tpInscEstabPrest:1, nrInscEstabPrest (14) }
 * @param {string} ev.perApur        'AAAA-MM'
 * @param {1|2}    ev.tpAmb          1=produção, 2=produção restrita
 * @param {1|2}    [ev.indRetif=1]
 * @param {string} [ev.nrRecibo]     recibo do evento retificado (indRetif=2)
 * @param {number} [ev.seq=1]
 * @param {Date}   [ev.data]         para o id (injetável nos testes)
 * @param {object} ev.tomador        { cnpjTomador, indObra:0|1|2, notas:[...] }
 *   nota: { serie, numDocto, dtEmissaoNF:'AAAA-MM-DD', vlrBruto,
 *           servicos:[{ tpServico, vlrBaseRet, vlrRetencao }] }
 * @returns {{ id:string, cnpjPrestador:string, cnpjTomador:string, xml:string }}
 */
function gerarR2020(ev) {
  const erros = validarEntradaR2020(ev);
  if (erros.length) throw new Error('R-2020 inválido:\n - ' + erros.join('\n - '));

  const { contribuinte, estab, perApur, tpAmb,
          indRetif = 1, nrRecibo, seq = 1, data, tomador } = ev;

  const id = gerarIdEvento({
    tpInsc: contribuinte.tpInsc,
    nrInsc: contribuinte.nrInsc,
    seq,
    ...(data ? { data } : {}),
  });

  // SÓ os três campos: é o que o evento aceito traz.
  const infoTpServXml = (s) => (
    '            <infoTpServ>\n'
    + `              <tpServico>${escXml(s.tpServico)}</tpServico>\n`
    + `              <vlrBaseRet>${fmtValorReinf(s.vlrBaseRet)}</vlrBaseRet>\n`
    + `              <vlrRetencao>${fmtValorReinf(s.vlrRetencao)}</vlrRetencao>\n`
    + '            </infoTpServ>'
  );

  const nfsXml = (n) => (
    '          <nfs>\n'
    + `            <serie>${escXml(n.serie)}</serie>\n`
    + `            <numDocto>${escXml(n.numDocto)}</numDocto>\n`
    + `            <dtEmissaoNF>${escXml(n.dtEmissaoNF)}</dtEmissaoNF>\n`
    + `            <vlrBruto>${fmtValorReinf(n.vlrBruto)}</vlrBruto>\n`
    + n.servicos.map(infoTpServXml).join('\n') + '\n'
    + '          </nfs>'
  );

  // Os totais do tomador vêm SOMADOS das notas — é o que o aceito mostra
  // (9.105,95 / 9.105,95 / 1.001,65 com uma nota só). Somar aqui, e não
  // receber pronto, impede que total e detalhe divirjam.
  const soma = (f) => tomador.notas.reduce((t, n) => t + f(n), 0);
  const totalBruto = soma((n) => Number(n.vlrBruto));
  const totalBaseRet = soma((n) => n.servicos.reduce((t, s) => t + Number(s.vlrBaseRet), 0));
  const totalRetPrinc = soma((n) => n.servicos.reduce((t, s) => t + Number(s.vlrRetencao), 0));

  const ideTomadorXml =
    '        <ideTomador>\n'
    + '          <tpInscTomador>1</tpInscTomador>\n'
    + `          <nrInscTomador>${soDigitos(tomador.cnpjTomador)}</nrInscTomador>\n`
    + `          <indObra>${Number(tomador.indObra)}</indObra>\n`
    + `          <vlrTotalBruto>${fmtValorReinf(totalBruto)}</vlrTotalBruto>\n`
    + `          <vlrTotalBaseRet>${fmtValorReinf(totalBaseRet)}</vlrTotalBaseRet>\n`
    + `          <vlrTotalRetPrinc>${fmtValorReinf(totalRetPrinc)}</vlrTotalRetPrinc>\n`
    + TOTAIS_OPCIONAIS.map((c) => `          <${c}>${opcional(tomador, c)}</${c}>`).join('\n') + '\n'
    + tomador.notas.map(nfsXml).join('\n') + '\n'
    + '        </ideTomador>';

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
<Reinf xmlns="${NS_R2020}">
  <evtServPrest id="${id}">
    <ideEvento>
${ideEventoLinhas.join('\n')}
    </ideEvento>
    <ideContri>
      <tpInsc>${contribuinte.tpInsc}</tpInsc>
      <nrInsc>${nrInscContribuinteReinf(contribuinte)}</nrInsc>
    </ideContri>
    <infoServPrest>
      <ideEstabPrest>
        <tpInscEstabPrest>${Number(estab.tpInscEstabPrest)}</tpInscEstabPrest>
        <nrInscEstabPrest>${soDigitos(estab.nrInscEstabPrest)}</nrInscEstabPrest>
${ideTomadorXml}
      </ideEstabPrest>
    </infoServPrest>
  </evtServPrest>
  <!-- ASSINATURA: o <Signature> (XMLDSig, certificado A1) entra na etapa de
       assinatura do backend/gateway, antes de transmitir. O XSD exige. -->
</Reinf>`;

  return {
    id,
    cnpjPrestador: soDigitos(estab.nrInscEstabPrest),
    cnpjTomador: soDigitos(tomador.cnpjTomador),
    xml,
  };
}

/**
 * Um EVENTO por tomador, todos para o MESMO lote.
 *
 * O `seq` entra no id, então cada evento precisa do seu — id repetido é RECUSA
 * do lote inteiro (lição MS0017 do assinador). O `indObra` é do TOMADOR e
 * viaja com ele: "o primeiro decide pelos outros" é a forma silenciosa do
 * defeito do R-2010 de 14/08 (evento ACEITO declarando a natureza errada).
 *
 * @returns {Array<{ id, cnpjPrestador, cnpjTomador, xml }>}
 */
function gerarEventosR2020(ev) {
  const tomadores = Array.isArray(ev && ev.tomadores) ? ev.tomadores : [];
  if (!tomadores.length) throw new Error('R-2020 inválido:\n - tomadores deve ter ao menos 1 item');
  const seqBase = Number(ev.seq) > 0 ? Number(ev.seq) : 1;
  return tomadores.map((t, i) => gerarR2020({
    ...ev,
    seq: seqBase + i,
    tomador: t,
    tomadores: undefined,
  }));
}

/** Pré-condições. Devolve lista de erros (vazia = ok). */
function validarEntradaR2020(ev) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evento ausente'];
  const { contribuinte, estab, perApur, tpAmb, tomador, tomadores } = ev;

  if (Array.isArray(tomadores) && tomadores.length > 1) {
    e.push(`tomadores tem ${tomadores.length} itens: o arquivo aceito de referência tem UM `
      + '`ideTomador`, e a multiplicidade não está provada. Use gerarEventosR2020, que devolve '
      + 'um evento por tomador para o MESMO lote.');
  }

  if (!contribuinte || ![1, 2].includes(Number(contribuinte.tpInsc))) {
    e.push('contribuinte.tpInsc deve ser 1 (CNPJ) ou 2 (CPF)');
  } else if (!/^([0-9]{8}|[0-9]{11}|[0-9]{14})$/.test(soDigitos(contribuinte.nrInsc))) {
    e.push('contribuinte.nrInsc deve ter 8, 11 ou 14 dígitos');
  }

  if (!estab || Number(estab.tpInscEstabPrest) !== 1) {
    e.push('estab.tpInscEstabPrest deve ser 1 (CNPJ) — é o único valor provado');
  } else if (!/^[0-9]{14}$/.test(soDigitos(estab.nrInscEstabPrest))) {
    e.push('estab.nrInscEstabPrest deve ter 14 dígitos (CNPJ do estabelecimento prestador)');
  }

  if (!/^\d{4}-\d{2}$/.test(String(perApur || ''))) e.push('perApur deve ser AAAA-MM');
  if (![1, 2].includes(Number(tpAmb))) e.push('tpAmb deve ser 1 (produção) ou 2 (produção restrita)');

  if (!tomador || typeof tomador !== 'object') {
    e.push('tomador ausente');
    return e;
  }
  const cnpj = soDigitos(tomador.cnpjTomador);
  if (cnpj.length !== 14) {
    e.push(cnpj.length === 11
      ? 'tomador.cnpjTomador tem 11 dígitos (CPF): pessoa física não retém a contribuição do art. 31 — '
        + 'não é R-2020'
      : 'tomador.cnpjTomador deve ter 14 dígitos');
  }
  if (![0, 1, 2].includes(Number(tomador.indObra))) {
    // NÃO tem default. "Quase sempre 0" é o palpite que campo de declaração
    // não aceita — e indObra errado muda a natureza do que se declara.
    e.push('tomador.indObra não informado — 0 (não é obra), 1 (obra com CNO próprio) ou 2 (empreitada total). '
      + 'Não está na nota e não se deduz: é informado por tomador na tela.');
  }
  if (tomador.indCPRB !== undefined) {
    // O espelho ingênuo do R-2010 mandaria este campo — e o R-2020 não o tem.
    e.push('tomador.indCPRB não existe no R-2020: a desoneração do prestador é do R-1000 (indDesoneracao).');
  }

  const notas = tomador.notas;
  if (!Array.isArray(notas) || !notas.length) {
    e.push('tomador.notas deve ter ao menos 1 item');
    return e;
  }
  notas.forEach((n, i) => {
    const onde = `tomador.notas[${i}]`;
    if (!String((n && n.numDocto) || '').trim()) e.push(`${onde}.numDocto ausente`);
    if (!String((n && n.serie) || '').trim()) e.push(`${onde}.serie ausente — o aceito traz "E"; série vazia não é provada`);
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
      if (!/^[0-9]{9}$/.test(String((s && s.tpServico) || ''))) {
        e.push(`${ondej}.tpServico não informado (tabela 06 da EFD-Reinf, 9 dígitos). Não está na NFS-e — `
          + 'é marcado por tomador na tela. Sem ele o R-2020 é recusado; com ele chutado, é pior.');
      }
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

module.exports = { gerarR2020, gerarEventosR2020, validarEntradaR2020, NS_R2020 };
