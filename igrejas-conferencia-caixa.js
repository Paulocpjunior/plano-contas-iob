(function(root, factory) {
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IgrejasConferenciaCaixa = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';

  var STATUS_LABELS = {
    conciliado: 'Conciliado',
    valor_divergente: 'Valor divergente',
    ausente_razao: 'Ausente no razão',
    extra_razao: 'Extra no razão'
  };

  var state = {
    igrejaFile: null,
    razaoFile: null,
    igreja: null,
    razao: null,
    resultado: null,
    filtro: 'todos',
    busca: ''
  };

  function texto(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function repararMojibake(value) {
    var s = texto(value);
    if (!/[ÃÂ]/.test(s)) return s;
    try {
      var bytes = Uint8Array.from(Array.prototype.map.call(s, function(ch) { return ch.charCodeAt(0) & 255; }));
      var fixed = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return fixed || s;
    } catch (_) {
      return s;
    }
  }

  function normalizarTexto(value) {
    return repararMojibake(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function moedaParaCentavos(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.round(value * 100);
    var s = texto(value).replace(/R\$/gi, '').replace(/\s/g, '');
    if (!s) return 0;
    var negativo = /^-/.test(s) || /^\(.*\)$/.test(s);
    s = s.replace(/[()\-]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    var n = Number(s.replace(/[^0-9.]/g, ''));
    return isFinite(n) ? Math.round(n * 100) * (negativo ? -1 : 1) : 0;
  }

  function dataIso(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
    }
    if (typeof value === 'number' && isFinite(value)) {
      var date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
      return date.toISOString().slice(0, 10);
    }
    var s = texto(value);
    var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (br) {
      var ano = br[3].length === 2 ? Number(br[3]) + (Number(br[3]) >= 70 ? 1900 : 2000) : Number(br[3]);
      return ano + '-' + br[2].padStart(2, '0') + '-' + br[1].padStart(2, '0');
    }
    var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (us) return us[3] + '-' + us[1].padStart(2, '0') + '-' + us[2].padStart(2, '0');
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[1] + '-' + iso[2] + '-' + iso[3] : '';
  }

  function formatarData(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || '-');
  }

  function formatarMoeda(cents, sinal) {
    var n = Number(cents || 0) / 100;
    if (!sinal) n = Math.abs(n);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escapar(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function natureza(value) {
    var s = normalizarTexto(value);
    if (/REDIZIMA/.test(s)) return 'redizima';
    if (/DIZIM|OFERTA/.test(s)) return 'dizimos_ofertas';
    if (/ALUGUEL.*MAQUINA|MAQUINA.*GETNET|NUMERO DO TERMINAL/.test(s)) return 'aluguel_maquina';
    if (/REPASSE.*REGIONAL|REGIONAL.*REPASSE/.test(s)) return 'repasse_regional';
    if (/GRAFIC|LIVRARIA|SERIE ARENA/.test(s)) return 'grafica_livraria';
    if (/JUROS/.test(s)) return 'juros';
    if (/CONTRIBUICAO.*NAC|NACIONAL SERVICOS/.test(s)) return 'contribuicao_nacional';
    if (/ENERGIA|NEOENERGIA/.test(s)) return 'energia';
    if (/TELEF|INTERNET|ALLREDE/.test(s)) return 'telecom';
    if (/AGUA|CAESB/.test(s)) return 'agua';
    if (/MANUTENCAO|CONSERVACAO|REFORMA/.test(s)) return 'manutencao';
    var stop = { VR:1, REF:1, PAGTO:1, PAGAMENTO:1, SANTA:1, MARIA:1, SUL:1, REG:1, CE:1, COMUNIDADE:1, EVANGELICA:1, NOSSA:1, TERRA:1, DA:1, DE:1, DO:1, DAS:1, DOS:1, E:1 };
    return s.split(' ').filter(function(x) { return x.length > 2 && !stop[x]; }).slice(0, 6).join('_').toLowerCase() || 'outros';
  }

  function tokens(value) {
    var stop = { VR:1, REF:1, PAGTO:1, PAGAMENTO:1, SANTA:1, MARIA:1, SUL:1, REG:1, CE:1, COMUNIDADE:1, EVANGELICA:1, NOSSA:1, TERRA:1, DA:1, DE:1, DO:1, DAS:1, DOS:1, E:1, PARA:1, NO:1, NA:1 };
    var result = {};
    normalizarTexto(value).split(' ').forEach(function(x) { if (x.length > 2 && !stop[x]) result[x] = true; });
    return result;
  }

  function similaridade(a, b) {
    var ta = tokens(a), tb = tokens(b);
    var ka = Object.keys(ta), kb = Object.keys(tb);
    if (!ka.length || !kb.length) return 0;
    var inter = ka.filter(function(k) { return tb[k]; }).length;
    return inter / (ka.length + kb.length - inter);
  }

  function parsearLinhasIgreja(rows, meta) {
    meta = meta || {};
    var movimentos = [];
    var abertura = meta.aberturaCentavos == null ? null : meta.aberturaCentavos;
    var fechamento = meta.fechamentoCentavos == null ? null : meta.fechamentoCentavos;
    var anterior = abertura;

    (rows || []).forEach(function(row, index) {
      if (!row || !row.data || !row.valor) return;
      var valor = Math.abs(moedaParaCentavos(row.valor));
      var saldo = moedaParaCentavos(row.saldo);
      if (!valor) return;
      var sinal = 0;
      if (anterior != null && Math.abs(Math.abs(saldo - anterior) - valor) <= 1) sinal = saldo >= anterior ? 1 : -1;
      if (!sinal) {
        var cat = normalizarTexto((row.categoria || '') + ' ' + (row.descricao || ''));
        sinal = /DIZIM|OFERTA/.test(cat) && !/REDIZIMA/.test(cat) ? 1 : -1;
      }
      movimentos.push({
        id: 'igreja-' + index,
        origem: 'igreja',
        data: dataIso(row.data),
        descricao: repararMojibake(row.descricao || row.historico || row.categoria),
        categoria: repararMojibake(row.categoria),
        fornecedor: repararMojibake(row.fornecedor),
        valorCentavos: valor * sinal,
        saldoCentavos: saldo,
        natureza: natureza((row.categoria || '') + ' ' + (row.descricao || '')),
        indice: index
      });
      anterior = saldo;
    });

    if (fechamento == null && movimentos.length) fechamento = movimentos[movimentos.length - 1].saldoCentavos;
    if (abertura == null && fechamento != null) {
      abertura = fechamento - movimentos.reduce(function(total, item) { return total + item.valorCentavos; }, 0);
    }
    return {
      tipo: 'igreja',
      nome: meta.nome || '',
      cnpj: meta.cnpj || '',
      periodo: meta.periodo || '',
      aberturaCentavos: abertura || 0,
      fechamentoCentavos: fechamento || 0,
      movimentos: movimentos
    };
  }

  function parsearRelatorioIgrejaHtml(html) {
    if (!root.DOMParser) throw new Error('Leitor HTML indisponível neste navegador.');
    var doc = new root.DOMParser().parseFromString(String(html || ''), 'text/html');
    var table = doc.querySelector('table#principal_relatorios');
    if (!table) throw new Error('O arquivo não corresponde ao Extrato Financeiro das igrejas.');
    var metaRows = Array.from(doc.querySelectorAll('table#cabeca_relatorio tr')).map(function(tr) {
      return Array.from(tr.querySelectorAll('th,td')).map(function(td) { return repararMojibake(td.textContent); });
    });
    function metaValue(label) {
      var row = metaRows.find(function(r) { return normalizarTexto(r[0]).indexOf(normalizarTexto(label)) === 0; });
      return row && row[1] ? row[1] : '';
    }
    var summaryStarted = false;
    var abertura = null, fechamento = null, rows = [];
    Array.from(table.querySelectorAll('tr')).forEach(function(tr) {
      var cells = Array.from(tr.querySelectorAll('th,td')).map(function(td) { return repararMojibake(td.textContent); });
      var cls = tr.getAttribute('class') || '';
      if (/resumo_financeiro/.test(cls)) summaryStarted = true;
      if (summaryStarted && /saldo_atual/.test(cls) && normalizarTexto(cells[1]).indexOf('SALDO ANTERIOR') >= 0) abertura = moedaParaCentavos(cells[2] || cells[6]);
      if (/finan_total/.test(cls) && normalizarTexto(cells[1]).indexOf('SALDO ATUAL') >= 0) fechamento = moedaParaCentavos(cells[2] || cells[6]);
      if (cls.split(/\s+/).indexOf('nao') < 0 || cells.length < 8 || !/^\d{2}\/\d{2}\/\d{4}$/.test(cells[0])) return;
      rows.push({ data: cells[0], categoria: cells[2], historico: cells[3], descricao: cells[4], fornecedor: cells[5], valor: cells[6], saldo: cells[7] });
    });
    var parsed = parsearLinhasIgreja(rows, {
      nome: metaValue('Igreja'),
      cnpj: metaValue('CNPJ'),
      periodo: metaValue('Período'),
      aberturaCentavos: abertura,
      fechamentoCentavos: fechamento
    });
    if (!parsed.movimentos.length) throw new Error('Nenhum movimento foi encontrado no Extrato Financeiro.');
    return parsed;
  }

  function indicesCabecalho(row) {
    var map = {};
    (row || []).forEach(function(cell, index) { map[normalizarTexto(cell).toLowerCase().replace(/ /g, '_')] = index; });
    return map;
  }

  function parsearLinhasRazao(rows) {
    var headerIndex = (rows || []).findIndex(function(row) {
      var h = (row || []).map(normalizarTexto);
      return h.indexOf('CONTA') >= 0 && h.indexOf('DATA') >= 0 && h.indexOf('LANCAMENTO') >= 0 && h.indexOf('COMPLEMENTO') >= 0 && h.indexOf('DEBITO') >= 0 && h.indexOf('CREDITO') >= 0;
    });
    if (headerIndex < 0) throw new Error('Cabeçalho do razão contábil não reconhecido.');
    var idx = indicesCabecalho(rows[headerIndex]);
    function at(row, names) {
      for (var i = 0; i < names.length; i++) if (idx[names[i]] != null) return row[idx[names[i]]];
      return '';
    }
    var movimentos = [];
    (rows || []).slice(headerIndex + 1).forEach(function(row, index) {
      var data = dataIso(at(row, ['data']));
      var debito = Math.abs(moedaParaCentavos(at(row, ['debito'])));
      var credito = Math.abs(moedaParaCentavos(at(row, ['credito'])));
      if (!data || (!debito && !credito)) return;
      var descricao = repararMojibake(at(row, ['complemento', 'historico']));
      movimentos.push({
        id: 'razao-' + index,
        origem: 'razao',
        data: data,
        lancamento: texto(at(row, ['lancamento', 'lancto'])),
        contrapartida: texto(at(row, ['contra_partida', 'contrapartida'])),
        descricao: descricao,
        valorCentavos: debito - credito,
        saldoCentavos: moedaParaCentavos(at(row, ['saldo'])),
        natureza: natureza(descricao),
        indice: index
      });
    });
    if (!movimentos.length) throw new Error('Nenhum lançamento foi encontrado no razão contábil.');
    var first = rows[headerIndex + 1] || [];
    return {
      tipo: 'razao',
      aberturaCentavos: moedaParaCentavos(at(first, ['saldo_anterior'])),
      fechamentoCentavos: movimentos[movimentos.length - 1].saldoCentavos,
      movimentos: movimentos
    };
  }

  function parsearRazaoWorkbook(arrayBuffer, XLSX) {
    if (!XLSX || !XLSX.read) throw new Error('Leitor Excel indisponível.');
    var wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    var errors = [];
    for (var i = 0; i < wb.SheetNames.length; i++) {
      try {
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, defval: '', raw: true });
        return parsearLinhasRazao(rows);
      } catch (e) { errors.push(e.message || String(e)); }
    }
    throw new Error(errors[0] || 'Planilha de razão não reconhecida.');
  }

  function agruparItensPdf(items) {
    var lines = [];
    (items || []).forEach(function(item) {
      var str = texto(item.str);
      if (!str) return;
      var x = Number(item.x != null ? item.x : item.transform && item.transform[4]) || 0;
      var y = Number(item.y != null ? item.y : item.transform && item.transform[5]) || 0;
      var line = lines.find(function(l) { return Math.abs(l.y - y) <= 1.6; });
      if (!line) { line = { y: y, items: [] }; lines.push(line); }
      line.items.push({ str: str, x: x });
    });
    lines.forEach(function(line) { line.items.sort(function(a, b) { return a.x - b.x; }); });
    return lines.sort(function(a, b) { return b.y - a.y; });
  }

  function parsearRazaoPdfPaginas(pages) {
    var movimentos = [], abertura = null, fechamento = null, lines = [];
    (pages || []).forEach(function(pageItems, pageIndex) {
      agruparItensPdf(pageItems).forEach(function(line) {
        line.pageIndex = pageIndex;
        lines.push(line);
      });
    });
    var starts = [];
    lines.forEach(function(line, index) {
      var first = line.items.find(function(i) { return i.x < 64 && /^\d{2}\/\d{2}\/\d{4}$/.test(i.str); });
      if (first) starts.push({ index: index, data: first.str });
      var joined = line.items.map(function(i) { return i.str; }).join(' ');
      var saldoItem = line.items.filter(function(i) { return i.x >= 500 && /^-?[\d.]+,\d{2}$/.test(i.str); }).pop();
      if (/SALDO ANTERIOR/i.test(normalizarTexto(joined)) && saldoItem && abertura == null) abertura = moedaParaCentavos(saldoItem.str);
      if (/SALDO ATUAL/i.test(normalizarTexto(joined)) && saldoItem) fechamento = moedaParaCentavos(saldoItem.str);
    });
    starts.forEach(function(start, si) {
        var end = si + 1 < starts.length ? starts[si + 1].index : lines.length;
        var block = lines.slice(start.index, end);
        var startItems = block[0].items;
        var lancamento = (startItems.find(function(i) { return i.x >= 60 && i.x < 108 && /^\d{6,}$/.test(i.str); }) || {}).str || '';
        var contrapartida = (startItems.find(function(i) { return i.x >= 108 && i.x < 185 && /^\d+(?:\.\d+)+$/.test(i.str); }) || {}).str || '';
        var desc = [], debito = 0, credito = 0, saldo = 0;
        block.forEach(function(line) {
          var joined = normalizarTexto(line.items.map(function(i) { return i.str; }).join(' '));
          if (/SALDO (ANTERIOR|ATUAL|DO MES|GERAL)/.test(joined)) return;
          line.items.forEach(function(item) {
            if (item.x >= 180 && item.x < 355) desc.push(item.str);
            else if (item.x >= 355 && item.x < 430 && /^-?[\d.]+,\d{2}$/.test(item.str)) debito = moedaParaCentavos(item.str);
            else if (item.x >= 430 && item.x < 500 && /^-?[\d.]+,\d{2}$/.test(item.str)) credito = moedaParaCentavos(item.str);
            else if (item.x >= 500 && /^-?[\d.]+,\d{2}$/.test(item.str)) saldo = moedaParaCentavos(item.str);
          });
        });
        if (!debito && !credito) return;
        var descricao = repararMojibake(desc.join(' '));
        movimentos.push({
          id: 'razao-pdf-' + movimentos.length,
          origem: 'razao', data: dataIso(start.data), lancamento: lancamento,
          contrapartida: contrapartida, descricao: descricao,
          valorCentavos: Math.abs(debito) - Math.abs(credito), saldoCentavos: saldo,
          natureza: natureza(descricao), indice: movimentos.length
        });
    });
    if (!movimentos.length) throw new Error('Nenhum lançamento foi reconhecido no PDF do razão.');
    return { tipo: 'razao', aberturaCentavos: abertura || 0, fechamentoCentavos: movimentos[movimentos.length - 1].saldoCentavos, movimentos: movimentos };
  }

  async function parsearRazaoPdf(arrayBuffer, pdfjsLib) {
    if (!pdfjsLib || !pdfjsLib.getDocument) throw new Error('Leitor PDF indisponível.');
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var pages = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      pages.push(content.items.map(function(item) { return { str: item.str, x: item.transform[4], y: item.transform[5] }; }));
    }
    return parsearRazaoPdfPaginas(pages);
  }

  function conciliar(igreja, razao) {
    var src = (igreja.movimentos || []).map(function(x) { return Object.assign({}, x); });
    var acc = (razao.movimentos || []).map(function(x) { return Object.assign({}, x); });
    var usadosSrc = {}, usadosAcc = {}, itens = [];

    function vincular(si, ai, status, motivo) {
      usadosSrc[si] = true; usadosAcc[ai] = true;
      itens.push({
        status: status, motivo: motivo, igreja: src[si], razao: acc[ai],
        diferencaCentavos: src[si].valorCentavos - acc[ai].valorCentavos
      });
    }

    src.forEach(function(s, si) {
      var candidates = acc.map(function(a, ai) { return { a:a, ai:ai }; }).filter(function(x) {
        return !usadosAcc[x.ai] && x.a.data === s.data && x.a.valorCentavos === s.valorCentavos && x.a.natureza === s.natureza;
      }).sort(function(x, y) { return similaridade(s.descricao, y.a.descricao) - similaridade(s.descricao, x.a.descricao); });
      if (candidates.length) vincular(si, candidates[0].ai, 'conciliado', 'Data, valor e natureza conferem');
    });

    src.forEach(function(s, si) {
      if (usadosSrc[si]) return;
      var sourceCount = src.filter(function(x, xi) { return !usadosSrc[xi] && x.data === s.data && x.valorCentavos === s.valorCentavos; }).length;
      var candidates = acc.map(function(a, ai) { return { a:a, ai:ai }; }).filter(function(x) { return !usadosAcc[x.ai] && x.a.data === s.data && x.a.valorCentavos === s.valorCentavos; });
      if (sourceCount === 1 && candidates.length === 1) vincular(si, candidates[0].ai, 'conciliado', 'Data e valor únicos no dia');
    });

    src.forEach(function(s, si) {
      if (usadosSrc[si]) return;
      var candidates = acc.map(function(a, ai) {
        var sim = similaridade((s.categoria || '') + ' ' + s.descricao, a.descricao);
        return { a:a, ai:ai, sim:sim, distancia:Math.abs(Math.abs(s.valorCentavos) - Math.abs(a.valorCentavos)) };
      }).filter(function(x) {
        return !usadosAcc[x.ai] && x.a.data === s.data && Math.sign(x.a.valorCentavos) === Math.sign(s.valorCentavos) && (x.a.natureza === s.natureza || x.sim >= 0.45);
      }).sort(function(x, y) {
        if ((x.a.natureza === s.natureza) !== (y.a.natureza === s.natureza)) return x.a.natureza === s.natureza ? -1 : 1;
        if (x.distancia !== y.distancia) return x.distancia - y.distancia;
        return y.sim - x.sim;
      });
      if (candidates.length) vincular(si, candidates[0].ai, 'valor_divergente', 'Mesma data, sentido e natureza; valor não confere');
    });

    src.forEach(function(s, si) {
      if (!usadosSrc[si]) itens.push({ status:'ausente_razao', motivo:'Movimento da igreja não localizado no razão', igreja:s, razao:null, diferencaCentavos:s.valorCentavos });
    });
    acc.forEach(function(a, ai) {
      if (!usadosAcc[ai]) itens.push({ status:'extra_razao', motivo:'Lançamento contábil sem correspondente no relatório da igreja', igreja:null, razao:a, diferencaCentavos:-a.valorCentavos });
    });

    var ordem = { valor_divergente:0, ausente_razao:1, extra_razao:2, conciliado:3 };
    itens.sort(function(a, b) {
      var da = (a.igreja || a.razao).data, db = (b.igreja || b.razao).data;
      return da.localeCompare(db) || ordem[a.status] - ordem[b.status];
    });
    var contagens = { conciliado:0, valor_divergente:0, ausente_razao:0, extra_razao:0 };
    itens.forEach(function(i) { contagens[i.status]++; });
    return {
      itens: itens,
      contagens: contagens,
      totalIgrejaCentavos: src.reduce(function(t, i) { return t + i.valorCentavos; }, 0),
      totalRazaoCentavos: acc.reduce(function(t, i) { return t + i.valorCentavos; }, 0),
      saldoInicialDiferencaCentavos: igreja.aberturaCentavos - razao.aberturaCentavos,
      saldoFinalDiferencaCentavos: igreja.fechamentoCentavos - razao.fechamentoCentavos,
      aderencia: src.length ? Math.round(contagens.conciliado * 100 / src.length) : 0
    };
  }

  function empresaAtivaEhIgreja() {
    // O acesso nao depende de uma empresa aberta: os arquivos originais carregam
    // os dados da igreja e o parser do Extrato Financeiro e a trava definitiva.
    return true;
  }

  function atualizarAcesso() {
    var btn = root.document && root.document.getElementById('btnConferenciaIgrejaNav');
    if (btn) btn.style.display = empresaAtivaEhIgreja() ? '' : 'none';
  }

  function injetarEstilos() {
    if (!root.document || root.document.getElementById('ccigStyles')) return;
    var style = root.document.createElement('style');
    style.id = 'ccigStyles';
    style.textContent = '\
      .ccig-overlay{position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:18px}\
      .ccig-modal{width:min(1180px,100%);max-height:min(850px,95vh);background:#fff;border-radius:8px;box-shadow:0 24px 70px rgba(15,23,42,.35);display:flex;flex-direction:column;overflow:hidden;color:#111827}\
      .ccig-header{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e5e7eb;gap:16px}\
      .ccig-header h2{font-size:19px;margin:0 0 4px}.ccig-header p{font-size:12px;color:#64748b;margin:0}\
      .ccig-icon-btn{width:36px;height:36px;border:1px solid #d1d5db;background:#fff;border-radius:6px;font-size:22px;cursor:pointer;flex:0 0 auto}\
      .ccig-body{overflow:auto;padding:18px 22px 24px}.ccig-files{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}\
      .ccig-file{border:1px dashed #94a3b8;border-radius:6px;padding:15px;min-height:106px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f8fafc}\
      .ccig-file strong{display:block;font-size:13px;margin-bottom:4px}.ccig-file small{display:block;color:#64748b;font-size:11px}.ccig-file-name{margin-top:9px;color:#1d4ed8;font-size:12px;font-weight:600;overflow-wrap:anywhere}\
      .ccig-btn{border:1px solid #cbd5e1;border-radius:6px;padding:9px 13px;background:#fff;color:#0f172a;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap}.ccig-btn-primary{background:#2563eb;border-color:#2563eb;color:#fff}.ccig-btn:disabled{opacity:.45;cursor:not-allowed}\
      .ccig-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #e5e7eb}.ccig-actions-right{display:flex;gap:8px;flex-wrap:wrap}.ccig-status{font-size:12px;color:#64748b}.ccig-status.error{color:#b91c1c}.ccig-status.success{color:#047857}\
      .ccig-metrics{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px;margin:15px 0}.ccig-metric{border:1px solid #e2e8f0;border-radius:6px;padding:11px;background:#fff}.ccig-metric span{display:block;font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700}.ccig-metric strong{display:block;font-size:20px;margin-top:3px}.ccig-ok{color:#059669}.ccig-warn{color:#d97706}.ccig-bad{color:#dc2626}\
      .ccig-balances{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:6px;margin-bottom:14px}.ccig-balance{display:grid;grid-template-columns:1fr auto auto auto;gap:12px;align-items:center;font-size:12px}.ccig-balance strong{font-size:12px}.ccig-diff{font-weight:800}\
      .ccig-toolbar{display:flex;align-items:end;gap:10px;margin:12px 0}.ccig-field{display:flex;flex-direction:column;gap:4px}.ccig-field label{font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700}.ccig-field select,.ccig-field input{height:36px;border:1px solid #cbd5e1;border-radius:6px;padding:0 10px;font-size:12px}.ccig-search{flex:1}\
      .ccig-table-wrap{border:1px solid #e2e8f0;border-radius:6px;overflow:auto;max-height:390px}.ccig-table{width:100%;border-collapse:collapse;font-size:11px}.ccig-table th{position:sticky;top:0;background:#f1f5f9;text-align:left;padding:9px 8px;z-index:1;white-space:nowrap}.ccig-table td{padding:8px;border-top:1px solid #e5e7eb;vertical-align:top}.ccig-money{text-align:right;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.ccig-desc{min-width:230px;max-width:320px}.ccig-badge{display:inline-block;border-radius:12px;padding:3px 8px;font-size:10px;font-weight:800;white-space:nowrap}.ccig-badge-conciliado{background:#dcfce7;color:#166534}.ccig-badge-valor_divergente{background:#fef3c7;color:#92400e}.ccig-badge-ausente_razao,.ccig-badge-extra_razao{background:#fee2e2;color:#991b1b}\
      .ccig-empty{text-align:center;padding:36px;color:#64748b}.ccig-hidden{display:none!important}\
      @media(max-width:900px){.ccig-overlay{padding:0}.ccig-modal{height:100vh;border-radius:0}.ccig-files,.ccig-balances{grid-template-columns:1fr}.ccig-metrics{grid-template-columns:repeat(2,1fr)}.ccig-actions,.ccig-toolbar{align-items:stretch;flex-direction:column}.ccig-actions-right{width:100%}.ccig-btn{flex:1}.ccig-balance{grid-template-columns:1fr 1fr}.ccig-desc{min-width:190px}}';
    root.document.head.appendChild(style);
  }

  function criarModal() {
    if (root.document.getElementById('ccigModal')) return;
    var wrap = root.document.createElement('div');
    wrap.id = 'ccigModal'; wrap.className = 'ccig-overlay';
    wrap.innerHTML = '<div class="ccig-modal" role="dialog" aria-modal="true" aria-labelledby="ccigTitle">' +
      '<div class="ccig-header"><div><h2 id="ccigTitle">Conferência de Caixa - Igrejas</h2><p>De-para entre o Extrato Financeiro da igreja e o razão contábil importado.</p></div><button class="ccig-icon-btn" type="button" id="ccigClose" title="Fechar" aria-label="Fechar">×</button></div>' +
      '<div class="ccig-body"><div class="ccig-files">' +
        '<div class="ccig-file"><div><strong>1. Relatório da igreja</strong><small>Extrato Financeiro original em .xls</small><div class="ccig-file-name" id="ccigIgrejaName">Nenhum arquivo selecionado</div></div><button class="ccig-btn" id="ccigPickIgreja">Selecionar</button><input id="ccigIgrejaInput" type="file" accept=".xls,.html" hidden></div>' +
        '<div class="ccig-file"><div><strong>2. Razão contábil</strong><small>Razão de saldos .xls/.xlsx ou Razão Analítico .pdf</small><div class="ccig-file-name" id="ccigRazaoName">Nenhum arquivo selecionado</div></div><button class="ccig-btn" id="ccigPickRazao">Selecionar</button><input id="ccigRazaoInput" type="file" accept=".xls,.xlsx,.pdf" hidden></div>' +
      '</div><div class="ccig-actions"><div class="ccig-status" id="ccigStatus">Selecione os dois arquivos originais.</div><div class="ccig-actions-right"><button class="ccig-btn ccig-hidden" id="ccigCsv">Exportar CSV</button><button class="ccig-btn ccig-hidden" id="ccigPdf">Imprimir / PDF</button><button class="ccig-btn ccig-btn-primary" id="ccigRun" disabled>Conferir arquivos</button></div></div>' +
      '<div id="ccigResults" class="ccig-hidden"><div class="ccig-metrics" id="ccigMetrics"></div><div class="ccig-balances" id="ccigBalances"></div>' +
      '<div class="ccig-toolbar"><div class="ccig-field"><label for="ccigFilter">Status</label><select id="ccigFilter"><option value="todos">Todos</option><option value="valor_divergente">Valor divergente</option><option value="ausente_razao">Ausente no razão</option><option value="extra_razao">Extra no razão</option><option value="conciliado">Conciliado</option></select></div><div class="ccig-field ccig-search"><label for="ccigSearch">Buscar histórico ou lançamento</label><input id="ccigSearch" type="search" placeholder="Digite para filtrar"></div></div>' +
      '<div class="ccig-table-wrap"><table class="ccig-table"><thead><tr><th>Status</th><th>Data</th><th>Relatório da igreja</th><th class="ccig-money">Valor</th><th>Razão contábil</th><th class="ccig-money">Valor</th><th class="ccig-money">Diferença</th></tr></thead><tbody id="ccigRows"></tbody></table></div></div></div></div>';
    root.document.body.appendChild(wrap);
    wrap.addEventListener('click', function(e) { if (e.target === wrap) fecharModal(); });
    root.document.getElementById('ccigClose').onclick = fecharModal;
    root.document.getElementById('ccigPickIgreja').onclick = function() { root.document.getElementById('ccigIgrejaInput').click(); };
    root.document.getElementById('ccigPickRazao').onclick = function() { root.document.getElementById('ccigRazaoInput').click(); };
    root.document.getElementById('ccigIgrejaInput').onchange = selecionarIgreja;
    root.document.getElementById('ccigRazaoInput').onchange = selecionarRazao;
    root.document.getElementById('ccigRun').onclick = executar;
    root.document.getElementById('ccigFilter').onchange = function(e) { state.filtro = e.target.value; renderTabela(); };
    root.document.getElementById('ccigSearch').oninput = function(e) { state.busca = normalizarTexto(e.target.value); renderTabela(); };
    root.document.getElementById('ccigCsv').onclick = exportarCsv;
    root.document.getElementById('ccigPdf').onclick = imprimirPdf;
  }

  function setStatus(message, type) {
    var el = root.document.getElementById('ccigStatus');
    if (!el) return;
    el.textContent = message; el.className = 'ccig-status' + (type ? ' ' + type : '');
  }

  function atualizarBotao() {
    var btn = root.document.getElementById('ccigRun');
    if (btn) btn.disabled = !(state.igrejaFile && state.razaoFile);
  }

  function resetResultado() {
    state.resultado = null;
    var results = root.document.getElementById('ccigResults'); if (results) results.classList.add('ccig-hidden');
    ['ccigCsv','ccigPdf'].forEach(function(id) { var el = root.document.getElementById(id); if (el) el.classList.add('ccig-hidden'); });
  }

  function selecionarIgreja(e) {
    state.igrejaFile = e.target.files && e.target.files[0] || null; state.igreja = null; resetResultado();
    root.document.getElementById('ccigIgrejaName').textContent = state.igrejaFile ? state.igrejaFile.name : 'Nenhum arquivo selecionado';
    setStatus(state.igrejaFile && state.razaoFile ? 'Arquivos prontos para conferência.' : 'Selecione os dois arquivos originais.'); atualizarBotao();
  }

  function selecionarRazao(e) {
    state.razaoFile = e.target.files && e.target.files[0] || null; state.razao = null; resetResultado();
    root.document.getElementById('ccigRazaoName').textContent = state.razaoFile ? state.razaoFile.name : 'Nenhum arquivo selecionado';
    setStatus(state.igrejaFile && state.razaoFile ? 'Arquivos prontos para conferência.' : 'Selecione os dois arquivos originais.'); atualizarBotao();
  }

  async function lerTexto(file) {
    var buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal:true }).decode(buf); }
    catch (_) { return new TextDecoder('windows-1252').decode(buf); }
  }

  async function executar() {
    var btn = root.document.getElementById('ccigRun'); btn.disabled = true; btn.textContent = 'Conferindo...';
    setStatus('Lendo e confrontando os arquivos...', '');
    try {
      state.igreja = parsearRelatorioIgrejaHtml(await lerTexto(state.igrejaFile));
      var ext = (state.razaoFile.name.split('.').pop() || '').toLowerCase();
      var buffer = await state.razaoFile.arrayBuffer();
      state.razao = ext === 'pdf' ? await parsearRazaoPdf(buffer, root.pdfjsLib) : parsearRazaoWorkbook(buffer, root.XLSX);
      state.resultado = conciliar(state.igreja, state.razao);
      state.filtro = 'todos'; state.busca = '';
      root.document.getElementById('ccigFilter').value = 'todos'; root.document.getElementById('ccigSearch').value = '';
      renderResultado(); setStatus('Conferência concluída sem alterar os arquivos originais.', 'success');
    } catch (e) {
      console.error('[Conferencia Igrejas]', e); setStatus(e.message || String(e), 'error');
    } finally { btn.disabled = false; btn.textContent = 'Conferir arquivos'; atualizarBotao(); }
  }

  function metric(label, value, cls) { return '<div class="ccig-metric"><span>' + escapar(label) + '</span><strong class="' + (cls || '') + '">' + escapar(value) + '</strong></div>'; }

  function renderResultado() {
    var r = state.resultado, c = r.contagens;
    root.document.getElementById('ccigMetrics').innerHTML =
      metric('Movimentos igreja', state.igreja.movimentos.length, '') + metric('Lançamentos razão', state.razao.movimentos.length, '') +
      metric('Conciliados', c.conciliado, 'ccig-ok') + metric('Valor divergente', c.valor_divergente, 'ccig-warn') +
      metric('Ausentes / extras', c.ausente_razao + c.extra_razao, 'ccig-bad') + metric('Aderência', r.aderencia + '%', r.aderencia === 100 ? 'ccig-ok' : 'ccig-bad');
    function balance(label, a, b) {
      var d = a - b, cls = d === 0 ? 'ccig-ok' : 'ccig-bad';
      return '<div class="ccig-balance"><strong>' + label + '</strong><span>Igreja: ' + formatarMoeda(a, true) + '</span><span>Razão: ' + formatarMoeda(b, true) + '</span><span class="ccig-diff ' + cls + '">Dif.: ' + formatarMoeda(d, true) + '</span></div>';
    }
    root.document.getElementById('ccigBalances').innerHTML = balance('Saldo inicial', state.igreja.aberturaCentavos, state.razao.aberturaCentavos) + balance('Saldo final', state.igreja.fechamentoCentavos, state.razao.fechamentoCentavos);
    root.document.getElementById('ccigResults').classList.remove('ccig-hidden');
    root.document.getElementById('ccigCsv').classList.remove('ccig-hidden'); root.document.getElementById('ccigPdf').classList.remove('ccig-hidden');
    renderTabela();
  }

  function itensFiltrados() {
    if (!state.resultado) return [];
    return state.resultado.itens.filter(function(item) {
      if (state.filtro !== 'todos' && item.status !== state.filtro) return false;
      if (!state.busca) return true;
      var s = item.igreja, a = item.razao;
      return normalizarTexto([s && s.descricao, s && s.categoria, a && a.descricao, a && a.lancamento].filter(Boolean).join(' ')).indexOf(state.busca) >= 0;
    });
  }

  function renderTabela() {
    var body = root.document.getElementById('ccigRows'); if (!body) return;
    var items = itensFiltrados();
    if (!items.length) { body.innerHTML = '<tr><td colspan="7" class="ccig-empty">Nenhum item neste filtro.</td></tr>'; return; }
    body.innerHTML = items.map(function(item) {
      var s = item.igreja, a = item.razao, ref = s || a;
      var sd = s ? '<strong>' + escapar(s.categoria || 'Movimento') + '</strong><br>' + escapar(s.descricao) : '<span style="color:#94a3b8">Sem correspondente</span>';
      var ad = a ? '<strong>' + escapar(a.lancamento || 'Lançamento') + '</strong><br>' + escapar(a.descricao) : '<span style="color:#94a3b8">Sem correspondente</span>';
      return '<tr><td><span class="ccig-badge ccig-badge-' + item.status + '">' + STATUS_LABELS[item.status] + '</span><br><small title="' + escapar(item.motivo) + '">' + escapar(item.motivo) + '</small></td><td>' + formatarData(ref.data) + '</td><td class="ccig-desc">' + sd + '</td><td class="ccig-money">' + (s ? formatarMoeda(s.valorCentavos, true) : '-') + '</td><td class="ccig-desc">' + ad + '</td><td class="ccig-money">' + (a ? formatarMoeda(a.valorCentavos, true) : '-') + '</td><td class="ccig-money ' + (item.diferencaCentavos ? 'ccig-bad' : 'ccig-ok') + '">' + formatarMoeda(item.diferencaCentavos, true) + '</td></tr>';
    }).join('');
  }

  function exportarCsv() {
    var rows = [['Status','Motivo','Data','Categoria igreja','Histórico igreja','Valor igreja','Lançamento razão','Histórico razão','Valor razão','Diferença']];
    state.resultado.itens.forEach(function(i) {
      var s=i.igreja,a=i.razao,r=s||a;
      rows.push([STATUS_LABELS[i.status],i.motivo,formatarData(r.data),s&&s.categoria||'',s&&s.descricao||'',s?(s.valorCentavos/100).toFixed(2):'',a&&a.lancamento||'',a&&a.descricao||'',a?(a.valorCentavos/100).toFixed(2):'',(i.diferencaCentavos/100).toFixed(2)]);
    });
    var csv = '\uFEFF' + rows.map(function(row) { return row.map(function(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(';'); }).join('\r\n');
    baixar(new Blob([csv], { type:'text/csv;charset=utf-8' }), 'conferencia-caixa-igreja.csv');
  }

  function baixar(blob, name) {
    var url = URL.createObjectURL(blob), a = root.document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(function(){ URL.revokeObjectURL(url); },1000);
  }

  function imprimirPdf() {
    var win = root.open('', '_blank'); if (!win) return setStatus('Permita pop-ups para gerar o PDF.', 'error');
    var rows = state.resultado.itens.map(function(i) { var s=i.igreja,a=i.razao,r=s||a; return '<tr><td>'+STATUS_LABELS[i.status]+'</td><td>'+formatarData(r.data)+'</td><td>'+escapar(s&&s.descricao||'-')+'</td><td class="n">'+(s?formatarMoeda(s.valorCentavos,true):'-')+'</td><td>'+escapar(a&&a.descricao||'-')+'</td><td class="n">'+(a?formatarMoeda(a.valorCentavos,true):'-')+'</td><td class="n">'+formatarMoeda(i.diferencaCentavos,true)+'</td></tr>'; }).join('');
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Conferência de Caixa - Igrejas</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:2px 0 12px}.summary{display:flex;gap:18px;padding:8px 0;border-block:1px solid #bbb;margin-bottom:10px}.summary b{font-size:14px}table{width:100%;border-collapse:collapse;font-size:8px}th,td{border:1px solid #ccc;padding:4px;vertical-align:top}th{background:#eee}.n{text-align:right;white-space:nowrap}</style></head><body><h1>Conferência de Caixa - Igrejas</h1><p>'+escapar(state.igreja.nome)+' | '+escapar(state.igreja.periodo)+' | '+new Date().toLocaleString('pt-BR')+'</p><div class="summary"><span>Conciliados <b>'+state.resultado.contagens.conciliado+'</b></span><span>Valor divergente <b>'+state.resultado.contagens.valor_divergente+'</b></span><span>Ausentes <b>'+state.resultado.contagens.ausente_razao+'</b></span><span>Extras <b>'+state.resultado.contagens.extra_razao+'</b></span><span>Aderência <b>'+state.resultado.aderencia+'%</b></span></div><table><thead><tr><th>Status</th><th>Data</th><th>Relatório da igreja</th><th>Valor</th><th>Razão contábil</th><th>Valor</th><th>Diferença</th></tr></thead><tbody>'+rows+'</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>');
    win.document.close();
  }

  function abrirModal() {
    injetarEstilos(); criarModal(); return true;
  }

  function fecharModal() { var el=root.document&&root.document.getElementById('ccigModal'); if(el) el.remove(); }

  function init() {
    if (!root.document || root.document.getElementById('btnConferenciaIgrejaNav')) return;
    var nav = root.document.querySelector('.nav'); if (!nav) return;
    var btn = root.document.createElement('button'); btn.id='btnConferenciaIgrejaNav'; btn.type='button'; btn.innerHTML='<span>✓</span> Conferir Caixa'; btn.onclick=abrirModal;
    var exportBtn = Array.from(nav.querySelectorAll('button')).find(function(b){ return /Exportar/.test(b.textContent); });
    nav.insertBefore(btn, exportBtn || null); atualizarAcesso();
    var bar = root.document.getElementById('companyBar'); if (bar && root.MutationObserver) new root.MutationObserver(atualizarAcesso).observe(bar,{subtree:true,childList:true,characterData:true,attributes:true});
    root.document.addEventListener('click', function() { setTimeout(atualizarAcesso, 0); }, true);
  }

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
    root.abrirConferenciaCaixaIgreja = abrirModal;
  }

  return {
    moedaParaCentavos: moedaParaCentavos,
    dataIso: dataIso,
    natureza: natureza,
    similaridade: similaridade,
    parsearLinhasIgreja: parsearLinhasIgreja,
    parsearRelatorioIgrejaHtml: parsearRelatorioIgrejaHtml,
    parsearLinhasRazao: parsearLinhasRazao,
    parsearRazaoWorkbook: parsearRazaoWorkbook,
    parsearRazaoPdfPaginas: parsearRazaoPdfPaginas,
    parsearRazaoPdf: parsearRazaoPdf,
    conciliar: conciliar,
    empresaAtivaEhIgreja: empresaAtivaEhIgreja,
    STATUS_LABELS: STATUS_LABELS
  };
});
