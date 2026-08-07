(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReinfImportXmlUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ATENÇÃO: esta lista é uma CÓPIA da tabela da série, que mora em
  // `reinf/serie-2000.js` (lá ficam também o que cada evento declara, quem
  // entrega, e o que falta pra gerar cada um). A cópia existe porque este
  // módulo é UMD e roda TAMBÉM no navegador, onde não há `require`.
  //
  // A divergência entre as duas é impedida por TESTE CRUZADO:
  // `scripts/test-reinf-serie-2000.js` compara este mapa com `EVENTOS_POR_TAG`
  // e falha se saírem do lugar. Evento novo entra nos DOIS, no mesmo PR.
  const EVENTOS_PREVIDENCIARIOS = Object.freeze({
    evtServTom: 'R-2010',
    evtServPrest: 'R-2020',
    evtAssocDespRec: 'R-2030',
    evtAssocDespRep: 'R-2040',
    evtComProd: 'R-2050',
    evtAqProd: 'R-2055',
    evtCPRB: 'R-2060',
    evtFechaEvPer: 'R-2099',
    evtEspDesportivo: 'R-3010'
  });

  function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function normalizarCnpj(valor) {
    return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function nomeLocal(no) {
    return String((no && (no.localName || no.nodeName)) || '').split(':').pop();
  }

  function elementos(root) {
    if (!root || typeof root.getElementsByTagName !== 'function') return [];
    return Array.from(root.getElementsByTagName('*') || []);
  }

  function primeiroElemento(root, nome) {
    if (root && nomeLocal(root) === nome) return root;
    return elementos(root).find(no => nomeLocal(no) === nome) || null;
  }

  function textoElemento(root, nome) {
    const no = primeiroElemento(root, nome);
    return no ? String(no.textContent || '').trim() : '';
  }

  function criarDocumento(xml, DOMParserCtor) {
    if (typeof DOMParserCtor !== 'function') throw new Error('Leitor XML indisponível.');
    const erros = [];
    let parser;
    try {
      parser = new DOMParserCtor({
        errorHandler: {
          warning: function () {},
          error: function (msg) { erros.push(String(msg || 'XML inválido.')); },
          fatalError: function (msg) { erros.push(String(msg || 'XML inválido.')); }
        }
      });
    } catch (_) {
      parser = new DOMParserCtor();
    }
    const doc = parser.parseFromString(String(xml || ''), 'application/xml');
    const erroBrowser = elementos(doc).some(no => nomeLocal(no).toLowerCase() === 'parsererror');
    if (!doc || !doc.documentElement || erros.length || erroBrowser) throw new Error('XML malformado ou incompleto.');
    return doc;
  }

  function validarCnpjDeclarante(cnpjArquivo, cnpjAtivo) {
    const arquivo = normalizarCnpj(cnpjArquivo);
    const ativo = normalizarCnpj(cnpjAtivo);
    if (ativo.length !== 14 || !/^[A-Z0-9]{12}\d{2}$/.test(ativo)) throw new Error('Selecione uma empresa com CNPJ válido antes da importação.');
    if (![8, 14].includes(arquivo.length) || !/^[A-Z0-9]+$/.test(arquivo) || (arquivo.length === 14 && !/\d{2}$/.test(arquivo))) {
      throw new Error('CNPJ do declarante ausente ou inválido no ideContri.');
    }
    const corresponde = arquivo.length === 8 ? ativo.slice(0, 8) === arquivo : ativo === arquivo;
    if (!corresponde) throw new Error('CNPJ declarante do XML não corresponde à empresa ativa.');
    return arquivo;
  }

  function analisarXmlPrevidenciario(xml, opcoes) {
    const opts = opcoes || {};
    const doc = criarDocumento(xml, opts.DOMParserCtor);
    const encontrados = elementos(doc).filter(no => EVENTOS_PREVIDENCIARIOS[nomeLocal(no)]);
    if (encontrados.length !== 1) {
      throw new Error(encontrados.length ? 'XML contém mais de um evento previdenciário.' : 'XML não pertence às séries R-2000/R-3000 suportadas para conferência.');
    }

    const eventoNo = encontrados[0];
    const tagEvento = nomeLocal(eventoNo);
    const evento = EVENTOS_PREVIDENCIARIOS[tagEvento];
    const namespaceEvento = String(eventoNo.namespaceURI || doc.documentElement.namespaceURI || (doc.documentElement.getAttribute && doc.documentElement.getAttribute('xmlns')) || '');
    const namespaceEsperado = new RegExp('reinf\\.esocial\\.gov\\.br/schemas/' + tagEvento + '/', 'i');
    if (!namespaceEsperado.test(namespaceEvento)) throw new Error(evento + ' com namespace EFD-Reinf inválido.');
    const idEvento = String(eventoNo.getAttribute && (eventoNo.getAttribute('Id') || eventoNo.getAttribute('id')) || '').trim();
    if (!idEvento) throw new Error(evento + ' sem identificador do evento.');

    const ideContri = primeiroElemento(eventoNo, 'ideContri');
    if (!ideContri) throw new Error(evento + ' sem identificação do contribuinte.');
    const tpInsc = somenteDigitos(textoElemento(ideContri, 'tpInsc'));
    if (tpInsc && tpInsc !== '1') throw new Error(evento + ' não identifica o declarante como CNPJ.');
    const cnpjDeclarante = validarCnpjDeclarante(textoElemento(ideContri, 'nrInsc'), opts.cnpjAtivo);
    const competencia = textoElemento(eventoNo, 'perApur') || textoElemento(eventoNo, 'dtApur');
    if (!competencia) throw new Error(evento + ' sem período/data de apuração.');

    return {
      evento,
      idEvento,
      cnpjDeclarante,
      competencia,
      valido: true
    };
  }

  function validarDuplicidades(itens, idsExistentes) {
    const vistos = new Set(Array.isArray(idsExistentes) ? idsExistentes.filter(Boolean) : []);
    for (const item of itens || []) {
      if (vistos.has(item.idEvento)) throw new Error('Evento duplicado na importação: ' + item.idEvento + '.');
      vistos.add(item.idEvento);
    }
    return itens;
  }

  return {
    EVENTOS_PREVIDENCIARIOS,
    analisarXmlPrevidenciario,
    normalizarCnpj,
    validarCnpjDeclarante,
    validarDuplicidades
  };
});
