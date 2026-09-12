// ============================================================================
// reinf/recibo-r4020.js — O RECIBO DO EVENTO R-4020, e a retificação por ele.
//
// 🚨 O CASO QUE FEZ ESTE MÓDULO NASCER (12/09/2026, WALDESA COMERCIO · 08/2026):
// o R-4020 da SERASA foi transmitido em PRODUÇÃO com a natureza 15006 para as
// DUAS notas — e são serviços diferentes (15008 e 15032). O evento foi ACEITO
// (recibo `…-03-4020-2608-…` no e-CAC). Corrigir a natureza exige RETIFICAR
// aquele evento, e retificar exige o recibo dele: a rota do R-4020 só sabia
// mandar ORIGINAL (`indRetif=1`) e nunca guardou o `nrRecArqBase` que o
// retorno entrega — a mesma lacuna que o R-2010 fechou em 10/09 (MS1028).
//
// ✅ O DESENHO É O DO `recibo-r2010.js`, campo a campo, e pelas mesmas razões:
// · o `nrRecArqBase` é o recibo (o caminho do R-4010 deste repo já retifica por
//   ele — reusar o campo provado, nunca deduzir outro);
// · a CHAVE é a que identifica o evento: contribuinte + período + ESTABELECIMENTO
//   + BENEFICIÁRIO + AMBIENTE. Chavear por menos faria o recibo de uma filial
//   retificar o evento de outra — e retificação contra o recibo ERRADO é ACEITA,
//   que é o pior desfecho, porque não volta recusa nenhuma;
// · o recibo digitado à mão (o e-CAC é a FONTE) fica gravado com QUEM digitou.
//
// ⚠️ **NÃO é cópia do R-2010 com outro nome — é OUTRO evento.** O R-2010 chaveia
// por PRESTADOR; aqui é por BENEFICIÁRIO (quem RECEBEU o pagamento). Reusar o
// módulo do 2010 faria o id gravar "prestador" onde a Receita fala
// "beneficiário", e o `-4020-` do recibo é o que a conferência olha.
// ============================================================================

/** Só os dígitos — CNPJ chega mascarado em metade das telas. */
function soDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

/**
 * O ID do recibo é DONO ÚNICO de propósito (a régua do `idDoFechamento` do CFI):
 * `..._2026-08` × `..._202608` seriam documentos DIFERENTES, e quem errasse a
 * forma leria SEMPRE vazio — ou seja, mandaria um ORIGINAL que a Receita já tem.
 */
function idReciboR4020({ tpAmb, perApur, cnpjContribuinte, cnpjEstab, cnpjBeneficiario }) {
  const amb = Number(tpAmb) === 1 ? '1' : '2';
  const comp = String(perApur || '').replace(/\D/g, '');
  return [amb, comp, soDigitos(cnpjContribuinte), soDigitos(cnpjEstab), soDigitos(cnpjBeneficiario)].join('_');
}

/**
 * OS RECIBOS QUE O RETORNO ENTREGOU — pareados com os eventos que saíram.
 *
 * Pareamento pelo `id` do evento (`idEv` do retorno), nunca pela ORDEM: o lote
 * reescreve o `Id` do wrapper, então posição não é identidade — é a família do
 * "primeiro decide pelos outros".
 *
 * ⚠️ SÓ ENTRA O EVENTO QUE TEM RECIBO E NÃO TEM OCORRÊNCIA: recibo é a prova
 * POSITIVA de que a Receita registrou; gravar recibo de evento recusado faria a
 * próxima transmissão retificar contra um evento que não existe.
 *
 * @param {Array} retornoEventos  saída de parseRetornoEventos(xml)
 * @param {Array} eventosEnviados [{ id, cnpjBeneficiario, cnpjEstab }]
 */
function recibosDoRetornoR4020(retornoEventos, eventosEnviados) {
  const porId = new Map();
  (Array.isArray(eventosEnviados) ? eventosEnviados : []).forEach((e) => {
    if (e && e.id) porId.set(String(e.id), e);
  });

  const aceitos = [];
  const semRecibo = [];
  (Array.isArray(retornoEventos) ? retornoEventos : []).forEach((ret) => {
    const enviado = porId.get(String((ret && ret.idEv) || ''));
    if (!enviado) return;
    const nrRecibo = String((ret && ret.nrRecArqBase) || '').trim();
    const ocorrencias = Array.isArray(ret && ret.codResp) ? ret.codResp.filter(Boolean) : [];
    if (nrRecibo && !ocorrencias.length) {
      aceitos.push({
        idEv: String(ret.idEv),
        nrRecibo,
        cnpjBeneficiario: soDigitos(enviado.cnpjBeneficiario),
        cnpjEstab: soDigitos(enviado.cnpjEstab),
      });
    } else {
      semRecibo.push({
        idEv: String((ret && ret.idEv) || ''),
        cnpjBeneficiario: soDigitos(enviado.cnpjBeneficiario),
        ocorrencias,
      });
    }
  });
  return { aceitos, semRecibo };
}

/**
 * O QUE VAI NO `ideEvento` DAQUELE BENEFICIÁRIO.
 *
 * ⚠️ É POR BENEFICIÁRIO, NUNCA POR LOTE: o lote mistura beneficiário já entregue
 * com beneficiário que nunca saiu. Marcar retificação no lote faria o novo sair
 * retificando um evento que não existe — e o antigo, com o recibo do vizinho.
 */
function retificacaoDoBeneficiario(recibos, chave) {
  const id = idReciboR4020(chave);
  const achado = recibos && (typeof recibos.get === 'function' ? recibos.get(id) : recibos[id]);
  const nrRecibo = String((achado && (achado.nrRecibo || achado)) || '').trim();
  if (!nrRecibo) return { indRetif: 1 };
  return { indRetif: 2, nrRecibo };
}

// ────────────────────────────────────────────────────────────────────────────
// DUPLICIDADE — o evento JÁ EXISTE.
//
// O código MS1028 é o da tabela da Receita e o TEXTO corrobora (código isolado
// pode ser reaproveitado por nota técnica futura, e o leiaute do retorno já
// mudou antes neste projeto). O texto do R-4020 fala em "beneficiário"; o do
// R-2010 em "prestador" — a assinatura casa a parte comum.
// ────────────────────────────────────────────────────────────────────────────
const COD_DUPLICIDADE_R4020 = 'MS1028';
const TEXTO_DUPLICIDADE = /mais de um evento para o mesmo contribuinte/i;

function ehDuplicidadeR4020(o) {
  const codigo = String((o && o.codigo) || '').trim().toUpperCase();
  const descricao = String((o && o.descricao) || '');
  return codigo === COD_DUPLICIDADE_R4020 || TEXTO_DUPLICIDADE.test(descricao);
}

/**
 * A LEITURA DO MS1028 — com DUAS saídas OPOSTAS, como no R-2010.
 *
 * ⚠️ NUNCA diz "nada foi aceito": com duplicidade a competência PODE JÁ ESTAR
 * ENTREGUE, e a única frase honesta manda conferir o recibo no e-CAC.
 */
function duplicidadeR4020(ocorrencias, { tinhaRecibo = false } = {}) {
  const casos = (Array.isArray(ocorrencias) ? ocorrencias : []).filter(ehDuplicidadeR4020);
  if (!casos.length) return null;
  return {
    codigo: COD_DUPLICIDADE_R4020,
    quantidade: casos.length,
    tinhaRecibo: !!tinhaRecibo,
    titulo: 'A Receita respondeu DUPLICIDADE: este R-4020 JÁ EXISTE para esta competência.',
    explicacao: 'MS1028 não diz que o evento está errado — diz que ele já foi recebido para este '
      + 'contribuinte, nesta competência, neste estabelecimento e para este beneficiário. '
      + 'A competência pode já estar ENTREGUE: confira o recibo no e-CAC (EFD-Reinf) antes de '
      + 'qualquer coisa. Transmitir de novo devolve exatamente este mesmo MS1028.',
    acao: tinhaRecibo
      ? 'O app tem o recibo deste beneficiário e mesmo assim saiu um evento ORIGINAL — isto é defeito '
        + 'de caminho, não do cadastro. Mande este retorno para o time.'
      : 'Se os valores já entregues estão certos, não há o que fazer. Se precisam mudar (a natureza '
        + 'do rendimento, por exemplo), é RETIFICAÇÃO: informe abaixo o número do recibo do evento '
        + 'anterior (está no e-CAC da EFD-Reinf) e transmita de novo — o app manda a retificação em '
        + 'vez de um original.',
  };
}

module.exports = {
  idReciboR4020,
  recibosDoRetornoR4020,
  retificacaoDoBeneficiario,
  duplicidadeR4020,
  ehDuplicidadeR4020,
  COD_DUPLICIDADE_R4020,
};
