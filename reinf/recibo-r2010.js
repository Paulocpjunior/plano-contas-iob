// ============================================================================
// reinf/recibo-r2010.js — O RECIBO DO EVENTO R-2010, e a leitura do MS1028.
//
// 🚨 O CASO QUE FEZ ESTE MÓDULO NASCER (10/09/2026, J.N. VINATEX · 08/2026):
// depois de corrigido o `obs` que derrubava o lote com MS0030, a competência
// foi transmitida de novo e voltou **MS1028**:
//
//   "Não é permitido o envio de mais de um evento para o mesmo contribuinte,
//    num mesmo período de apuração para um mesmo estabelecimento e prestador,
//    EXCETO se for para retificação de um evento enviado anteriormente ou se o
//    evento anterior tiver sido excluído."
//
// 📌 **MS1028 NÃO DIZ QUE O EVENTO ESTÁ ERRADO — DIZ QUE ELE JÁ EXISTE.** É a
// diferença mais cara do retorno da Receita: a tela dizia "nada foi aceito",
// que se lê como "a competência está sem entrega", quando o que a Receita
// afirmou foi o contrário — aquele evento ESTÁ registrado. Quem lê aquilo
// transmite de novo, e a Receita devolve o MESMO MS1028, para sempre.
//
// 🔴 **A CAUSA MORA AQUI E É DE LEITURA**: a rota de transmissão sempre mandou
// `indRetif=1` (original) e **nunca guardou o `nrRecArqBase`** que o retorno
// entrega por evento aceito. Ou seja: o recibo — que é o ÚNICO caminho de volta
// (retificação exige o recibo do evento anterior) — chegava e era descartado.
// É a "régua que só escreve" na ponta da LEITURA: o dado vem, ninguém lê, e a
// competência fica trancada dentro do próprio app.
//
// ✅ **O `nrRecArqBase` COMO RECIBO NÃO É DEDUÇÃO**: é o mesmo campo que o
// caminho do R-4010 deste repo já grava e já usa para retificar
// (`registrarRetornoLoteReinf` → `nrRecibo` → `indRetif: 2`), e aquele caminho
// tem retificação funcionando. Reusar o campo provado é a régua de sempre —
// arquivo/retorno REAL vence leiaute deduzido.
//
// ⚠️ **A CHAVE É A QUE A RECEITA NOMEIA NO PRÓPRIO MS1028**: contribuinte +
// período de apuração + estabelecimento + prestador. Chavear por menos que isso
// (só prestador, ou só competência) faria o recibo de um estabelecimento
// retificar o evento de outro — e evento retificado contra o recibo ERRADO é
// ACEITO pela Receita, que é o pior desfecho, porque não volta recusa nenhuma.
//
// ⚠️ **O AMBIENTE ENTRA NA CHAVE**: recibo nascido em produção RESTRITA não
// retifica evento de PRODUÇÃO — são bases diferentes, e usar um no outro
// declara retificação de um evento que aquele ambiente não tem.
// ============================================================================

/** Só os dígitos — CNPJ chega mascarado em metade das telas. */
function soDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

/**
 * O ID do recibo é DONO ÚNICO de propósito.
 *
 * A competência circula em mais de uma forma neste projeto, e
 * `..._2026-08` × `..._202608` são documentos DIFERENTES: quem errasse a forma
 * leria SEMPRE vazio — e ler vazio aqui significa "não tenho recibo", ou seja
 * mandar um original que a Receita já tem. O sintoma seria exatamente o MS1028
 * que este módulo existe para fechar.
 */
function idReciboR2010({ tpAmb, perApur, cnpjContribuinte, cnpjEstab, cnpjPrestador }) {
  const amb = Number(tpAmb) === 1 ? '1' : '2';
  const comp = String(perApur || '').replace(/\D/g, '');
  return [amb, comp, soDigitos(cnpjContribuinte), soDigitos(cnpjEstab), soDigitos(cnpjPrestador)].join('_');
}

/**
 * OS RECIBOS QUE O RETORNO ENTREGOU — pareados com os eventos que saíram.
 *
 * O pareamento é pelo `id` do evento (o `idEv` do retorno), nunca pela ORDEM:
 * o lote reescreve o `Id` do WRAPPER (`<evento Id=...>`) para não colidir com o
 * id assinado, então ordem não é identidade. Pareamento por posição é a família
 * de defeito que já custou o "primeiro decide pelos outros".
 *
 * ⚠️ **SÓ ENTRA O EVENTO QUE TEM RECIBO E NÃO TEM OCORRÊNCIA.** Recibo é a prova
 * POSITIVA de que a Receita registrou (a mesma régua do `nProt` do evento de
 * cancelamento da SEFAZ); gravar recibo de evento que voltou com `codResp`
 * faria a próxima transmissão retificar contra um evento recusado.
 *
 * @param {Array} retornoEventos  saída de parseRetornoEventos(xml)
 * @param {Array} eventosEnviados [{ id, cnpjPrestador, cnpjTomador }]
 */
function recibosDoRetornoR2010(retornoEventos, eventosEnviados) {
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
        cnpjPrestador: soDigitos(enviado.cnpjPrestador),
        cnpjEstab: soDigitos(enviado.cnpjTomador),
      });
    } else {
      semRecibo.push({
        idEv: String((ret && ret.idEv) || ''),
        cnpjPrestador: soDigitos(enviado.cnpjPrestador),
        ocorrencias,
      });
    }
  });
  return { aceitos, semRecibo };
}

// ────────────────────────────────────────────────────────────────────────────
// MS1028 — DUPLICIDADE
//
// O código é o da tabela da própria Receita e o TEXTO corrobora. Os dois entram
// porque o leiaute do retorno já mudou antes neste projeto (o `localErroAviso`
// que o app procurava com outro nome), e porque código isolado pode ser
// reaproveitado por nota técnica futura.
// ────────────────────────────────────────────────────────────────────────────
const COD_DUPLICIDADE_R2010 = 'MS1028';
const TEXTO_DUPLICIDADE = /mais de um evento para o mesmo contribuinte/i;

function ehDuplicidadeR2010(o) {
  const codigo = String((o && o.codigo) || '').trim().toUpperCase();
  const descricao = String((o && o.descricao) || '');
  return codigo === COD_DUPLICIDADE_R2010 || TEXTO_DUPLICIDADE.test(descricao);
}

/**
 * A LEITURA DO MS1028 — e ela tem DUAS saídas OPOSTAS.
 *
 * Quando o app TEM o recibo daquele prestador, duplicidade é defeito de
 * caminho: era para ter saído retificação e saiu original. Quando ele NÃO tem,
 * o evento foi transmitido antes de o app guardar recibo (ou por fora, pelo
 * REINF.Web) — e aí a saída não é código, é o recibo vindo da FONTE.
 *
 * ⚠️ **NUNCA DIZ "nada foi aceito"**: com MS1028 a competência PODE JÁ ESTAR
 * ENTREGUE, e mandar conferir é a única frase honesta. Dizer que está sem
 * entrega manda transmitir de novo — que devolve o mesmo MS1028.
 */
function duplicidadeR2010(ocorrencias, { tinhaRecibo = false } = {}) {
  const casos = (Array.isArray(ocorrencias) ? ocorrencias : []).filter(ehDuplicidadeR2010);
  if (!casos.length) return null;
  return {
    codigo: COD_DUPLICIDADE_R2010,
    quantidade: casos.length,
    tinhaRecibo: !!tinhaRecibo,
    titulo: 'A Receita respondeu DUPLICIDADE: este evento JÁ EXISTE para esta competência.',
    explicacao: 'MS1028 não diz que o evento está errado — diz que ele já foi recebido para este '
      + 'contribuinte, nesta competência, neste estabelecimento e para este prestador. '
      + 'A competência pode já estar ENTREGUE: confira o recibo no e-CAC (EFD-Reinf) antes de '
      + 'qualquer coisa. Transmitir de novo devolve exatamente este mesmo MS1028.',
    acao: tinhaRecibo
      ? 'O app tem o recibo deste prestador e mesmo assim saiu um evento ORIGINAL — isto é defeito '
        + 'de caminho, não do cadastro. Mande este retorno para o time.'
      : 'Se os valores já entregues estão certos, não há o que fazer. Se precisam mudar, é '
        + 'RETIFICAÇÃO: informe abaixo o número do recibo do evento anterior (ele está no e-CAC '
        + 'da EFD-Reinf, ou no REINF.Web se a competência foi transmitida por lá) e transmita de '
        + 'novo — o app manda a retificação em vez de um original.',
  };
}

/**
 * O QUE VAI NO `ideEvento` DAQUELE PRESTADOR.
 *
 * ⚠️ **É POR PRESTADOR, NUNCA POR LOTE.** Cada evento tem o seu recibo, e o lote
 * mistura prestador que já foi entregue com prestador que nunca saiu. Marcar
 * retificação no LOTE faria o prestador novo sair retificando um evento que não
 * existe — e o antigo sair com o recibo do vizinho. É o `indObra` do "primeiro
 * decide pelos outros" com outra roupa.
 */
function retificacaoDoPrestador(recibos, chave) {
  const id = idReciboR2010(chave);
  const achado = recibos && (typeof recibos.get === 'function' ? recibos.get(id) : recibos[id]);
  const nrRecibo = String((achado && (achado.nrRecibo || achado)) || '').trim();
  if (!nrRecibo) return { indRetif: 1 };
  return { indRetif: 2, nrRecibo };
}

module.exports = {
  idReciboR2010,
  recibosDoRetornoR2010,
  duplicidadeR2010,
  ehDuplicidadeR2010,
  retificacaoDoPrestador,
  COD_DUPLICIDADE_R2010,
};
