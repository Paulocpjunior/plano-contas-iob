// Parser Bradesco Net Empresa digitalizado. A IA le uma pagina por vez e a
// importacao so e liberada quando os totais impressos e a sequencia de saldos conferem.
(function(root) {
  'use strict';

  const TOLERANCIA = 0.02;

  function centavos(valor) {
    return Math.round((Number(valor) || 0) * 100);
  }

  function arredondar(valor) {
    return centavos(valor) / 100;
  }

  function limparConta(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';
    const digitos = texto.replace(/\D/g, '');
    if (digitos.length < 5) return texto;
    return digitos.slice(0, -1) + '-' + digitos.slice(-1);
  }

  function dataISO(valor, dataAnterior) {
    const texto = String(valor || '').trim();
    if (!texto) return dataAnterior || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    const completa = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (completa) return completa[3] + '-' + completa[2] + '-' + completa[1];
    const curta = texto.match(/^(\d{2})\/(\d{2})$/);
    if (curta && dataAnterior) return dataAnterior.slice(0, 4) + '-' + curta[2] + '-' + curta[1];
    return '';
  }

  function somarMovimentos(lancamentos) {
    return lancamentos.reduce(function(total, item) {
      const valor = Number(item.valor || 0);
      if (valor > 0) total.credito += valor;
      if (valor < 0) total.debito += Math.abs(valor);
      return total;
    }, { credito: 0, debito: 0 });
  }

  function erroValidacao(mensagem, pagina) {
    const erro = new Error(mensagem);
    erro.pagina = pagina || 0;
    return erro;
  }

  function consolidarPaginas(paginas, opcoes) {
    const opts = opcoes || {};
    const contas = new Map();
    let contaAtual = '';
    let agenciaAtual = '';

    (paginas || []).forEach(function(pagina, indice) {
      if (!pagina || pagina.is_statement !== true) return;
      const numeroPagina = Number(pagina.page_number || indice + 1);
      const contaInformada = limparConta(pagina.account);
      if (contaInformada && contaAtual && contaInformada !== contaAtual && contas.has(contaAtual)) {
        contas.get(contaAtual).encerramentoConfirmado = true;
      }
      if (contaInformada) contaAtual = contaInformada;
      if (pagina.agency) agenciaAtual = String(pagina.agency).replace(/\D/g, '');
      if (!contaAtual) throw erroValidacao('Nao foi possivel identificar a conta Bradesco na pagina ' + numeroPagina + '.', numeroPagina);

      if (!contas.has(contaAtual)) {
        contas.set(contaAtual, {
          conta: contaAtual,
          agencia: agenciaAtual,
          saldoInicial: null,
          saldoFinal: null,
          saldoFinalImpresso: null,
          totalCreditoOficial: null,
          totalDebitoOficial: null,
          encerramentoConfirmado: false,
          dataAnterior: '',
          lancamentos: [],
          divergenciasSaldoIntermediario: [],
          paginas: []
        });
      }
      const grupo = contas.get(contaAtual);
      if (agenciaAtual) grupo.agencia = agenciaAtual;
      grupo.paginas.push(numeroPagina);

      const abertura = pagina.opening_balance;
      if (abertura !== null && abertura !== undefined && Number.isFinite(Number(abertura))) {
        if (grupo.saldoInicial === null) grupo.saldoInicial = arredondar(Number(abertura));
      }

      let saldoAnterior = grupo.saldoFinal;
      if (saldoAnterior === null && grupo.saldoInicial !== null) saldoAnterior = grupo.saldoInicial;
      const transacoes = Array.isArray(pagina.transactions) ? pagina.transactions : [];
      transacoes.forEach(function(tx, posicao) {
        const credito = Math.abs(Number(tx.credit || 0));
        const debito = Math.abs(Number(tx.debit || 0));
        if ((credito > 0 && debito > 0) || (credito <= 0 && debito <= 0)) {
          throw erroValidacao('Movimento sem natureza unica na pagina ' + numeroPagina + ', linha ' + (posicao + 1) + '.', numeroPagina);
        }
        const saldo = Number(tx.balance);
        if (!Number.isFinite(saldo)) {
          throw erroValidacao('Saldo nao reconhecido na pagina ' + numeroPagina + ', linha ' + (posicao + 1) + '.', numeroPagina);
        }
        const valor = credito > 0 ? arredondar(credito) : -arredondar(debito);
        if (saldoAnterior !== null) {
          const esperado = arredondar(saldoAnterior + valor);
          if (Math.abs(esperado - saldo) > TOLERANCIA) {
            grupo.divergenciasSaldoIntermediario.push({
              pagina: numeroPagina,
              linha: posicao + 1,
              esperado: esperado,
              impresso_lido: saldo
            });
          }
          saldoAnterior = esperado;
        } else {
          saldoAnterior = arredondar(saldo);
        }
        const data = dataISO(tx.date, grupo.dataAnterior);
        if (!data) throw erroValidacao('Data nao reconhecida na pagina ' + numeroPagina + ', linha ' + (posicao + 1) + '.', numeroPagina);
        grupo.dataAnterior = data;
        grupo.saldoFinal = saldoAnterior;
        grupo.saldoFinalImpresso = arredondar(saldo);
        const descricao = String(tx.description || '').replace(/\s+/g, ' ').trim();
        if (!descricao) throw erroValidacao('Historico vazio na pagina ' + numeroPagina + ', linha ' + (posicao + 1) + '.', numeroPagina);
        grupo.lancamentos.push({
          id: root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : ('bra-ocr-' + numeroPagina + '-' + posicao + '-' + Date.now()),
          data: data,
          descricao: descricao,
          documento: String(tx.document || '').trim(),
          valor: valor,
          saldo: arredondar(saldo),
          tipo: valor > 0 ? 'C' : 'D',
          banco: 'BRADESCO',
          conta: contaAtual,
          agencia: grupo.agencia,
          nome_conta: 'BRADESCO AG ' + (grupo.agencia || '-') + ' CC ' + contaAtual,
          origem: 'pdf-bradesco-netempresa-ocr',
          pagina_origem: numeroPagina,
          categoria: 'Nao categorizado',
          contaDebito: '',
          contaCredito: '',
          historico: descricao,
          codigoHistorico: ''
        });
      });

      if (pagina.total_credit !== null && pagina.total_credit !== undefined && Number.isFinite(Number(pagina.total_credit))) {
        grupo.totalCreditoOficial = Math.abs(Number(pagina.total_credit));
        grupo.encerramentoConfirmado = true;
      }
      if (pagina.total_debit !== null && pagina.total_debit !== undefined && Number.isFinite(Number(pagina.total_debit))) {
        grupo.totalDebitoOficial = Math.abs(Number(pagina.total_debit));
        grupo.encerramentoConfirmado = true;
      }
    });

    if (!contas.size) return { detectado: false, lancamentos: [], contas: [] };

    const grupos = Array.from(contas.values());
    grupos.forEach(function(grupo) {
      if (!grupo.lancamentos.length) throw erroValidacao('Nenhum movimento reconhecido para a conta ' + grupo.conta + '.', grupo.paginas[0]);
      if (opts.exigirTotais !== false && !grupo.encerramentoConfirmado) {
        throw erroValidacao(
          'Extrato incompleto para a conta ' + grupo.conta + ': nao foi encontrado o total impresso nem o inicio da conta seguinte.',
          grupo.paginas[grupo.paginas.length - 1]
        );
      }
      const totais = somarMovimentos(grupo.lancamentos);
      if (grupo.totalCreditoOficial !== null && Math.abs(totais.credito - grupo.totalCreditoOficial) > TOLERANCIA) {
        throw erroValidacao('Credito da conta ' + grupo.conta + ' divergente do total impresso no extrato.', grupo.paginas[grupo.paginas.length - 1]);
      }
      if (grupo.totalDebitoOficial !== null && Math.abs(totais.debito - grupo.totalDebitoOficial) > TOLERANCIA) {
        throw erroValidacao('Debito da conta ' + grupo.conta + ' divergente do total impresso no extrato.', grupo.paginas[grupo.paginas.length - 1]);
      }
      if (grupo.saldoInicial !== null) {
        const fechamento = arredondar(grupo.saldoInicial + totais.credito - totais.debito);
        if (grupo.saldoFinalImpresso === null || Math.abs(fechamento - grupo.saldoFinalImpresso) > TOLERANCIA) {
          throw erroValidacao('Saldo final da conta ' + grupo.conta + ' nao fecha com os movimentos extraidos.', grupo.paginas[grupo.paginas.length - 1]);
        }
        grupo.saldoFinal = fechamento;
      }
    });

    const lancamentos = grupos.flatMap(function(grupo) { return grupo.lancamentos; });
    const totaisGerais = somarMovimentos(lancamentos);
    const todosComTotaisImpressos = grupos.every(function(grupo) {
      return grupo.totalCreditoOficial !== null && grupo.totalDebitoOficial !== null;
    });
    return {
      detectado: true,
      lancamentos: lancamentos,
      contas: grupos,
      banco_detectado: 'BRADESCO',
      conta_detectada: grupos.length === 1 ? grupos[0].conta : grupos.length + ' contas no arquivo',
      nome_conta_detectado: grupos.length === 1 ? grupos[0].nome_conta : 'BRADESCO - MULTIPLAS CONTAS',
      total_credito: arredondar(totaisGerais.credito),
      total_debito: arredondar(totaisGerais.debito),
      total_credito_oficial_resumo: todosComTotaisImpressos ? arredondar(grupos.reduce(function(s, g) { return s + Number(g.totalCreditoOficial || 0); }, 0)) : 0,
      total_debito_oficial_resumo: todosComTotaisImpressos ? arredondar(grupos.reduce(function(s, g) { return s + Number(g.totalDebitoOficial || 0); }, 0)) : 0,
      observacao_importacao: grupos.length + ' conta(s) conferida(s) por saldo e totais impressos.'
    };
  }

  const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      is_statement: { type: 'BOOLEAN' },
      page_number: { type: 'INTEGER' },
      agency: { type: 'STRING' },
      account: { type: 'STRING' },
      opening_balance: { type: 'NUMBER', nullable: true },
      total_credit: { type: 'NUMBER', nullable: true },
      total_debit: { type: 'NUMBER', nullable: true },
      transactions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING' },
            description: { type: 'STRING' },
            document: { type: 'STRING' },
            credit: { type: 'NUMBER' },
            debit: { type: 'NUMBER' },
            balance: { type: 'NUMBER' }
          },
          required: ['date', 'description', 'document', 'credit', 'debit', 'balance']
        }
      }
    },
    required: ['is_statement', 'page_number', 'agency', 'account', 'transactions']
  };

  function promptPagina(numero, total) {
    return [
      'Leia somente esta pagina digitalizada de um documento Bradesco Net Empresa.',
      'Pagina do PDF: ' + numero + ' de ' + total + '.',
      'Considere extrato de conta corrente apenas quando houver a tabela Data, Lancamento, Dcto., Credito, Debito e Saldo.',
      'Paginas de investimentos, CDB, fundos, aplicacoes ou demonstrativos devem retornar is_statement=false e transactions=[].',
      'Extraia absolutamente todos os movimentos visiveis, na ordem da pagina. Nao inclua SALDO ANTERIOR, Total, saldo bloqueado ou linha de transporte.',
      'Junte linhas complementares ao historico do mesmo movimento. Nao crie movimento separado para a segunda linha da descricao.',
      'credit e debit sao sempre positivos e apenas um deles pode ser maior que zero. balance conserva o sinal impresso.',
      'Repita a ultima data visivel quando as linhas seguintes estiverem sem data. Use YYYY-MM-DD.',
      'opening_balance deve ser preenchido somente se a pagina mostrar SALDO ANTERIOR.',
      'total_credit e total_debit devem ser preenchidos somente quando a pagina mostrar a linha Total da conta; use valores absolutos.',
      'agency e account devem vir do cabecalho quando visiveis; caso contrario retorne string vazia.',
      'Nao estime, nao resuma, nao omita e nao duplique linhas.'
    ].join('\n');
  }

  async function renderizarPagina(page, escala) {
    const viewport = page.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.94).split(',')[1];
  }

  async function chamarGeminiPagina(page, numero, total, escala) {
    const imagem = await renderizarPagina(page, escala);
    const resposta = await root.API.callGemini({
      contents: [{ parts: [
        { text: promptPagina(numero, total) },
        { inline_data: { mime_type: 'image/jpeg', data: imagem } }
      ] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 24576,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const corpo = await resposta.json().catch(function() { return {}; });
    if (!resposta.ok) throw new Error((corpo.error && corpo.error.message) || corpo.erro || ('Erro HTTP ' + resposta.status + ' na leitura da pagina ' + numero));
    let texto = corpo.candidates && corpo.candidates[0] && corpo.candidates[0].content && corpo.candidates[0].content.parts && corpo.candidates[0].content.parts[0] && corpo.candidates[0].content.parts[0].text;
    texto = String(texto || '').replace(/```json|```/g, '').trim();
    if (!texto) throw new Error('A IA nao retornou dados para a pagina ' + numero + '.');
    const pagina = JSON.parse(texto);
    pagina.page_number = numero;
    return pagina;
  }

  async function lerPaginaComTentativas(pdf, numero, escalaForcada) {
    const page = await pdf.getPage(numero);
    const escalas = escalaForcada ? [escalaForcada] : [2.6, 3.2];
    let ultimoErro = null;
    for (let i = 0; i < escalas.length; i++) {
      try {
        return await chamarGeminiPagina(page, numero, pdf.numPages, escalas[i]);
      } catch (e) {
        ultimoErro = e;
        console.warn('[bradesco-ocr] pagina ' + numero + ', tentativa ' + (i + 1) + ':', e.message || e);
      }
    }
    throw new Error('Nao foi possivel ler integralmente a pagina ' + numero + ': ' + (ultimoErro && ultimoErro.message || ultimoErro));
  }

  async function parsearPDF_Bradesco_NetEmpresaOCR(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js nao carregado');
    if (!root.API || typeof root.API.callGemini !== 'function') throw new Error('Servico de leitura por IA indisponivel');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const paginas = new Array(pdf.numPages);
    let proxima = 1;

    async function trabalhador() {
      while (proxima <= pdf.numPages) {
        const numero = proxima++;
        if (typeof showToast === 'function') showToast('Bradesco escaneado: conferindo pagina ' + numero + '/' + pdf.numPages + '...', 'success');
        paginas[numero - 1] = await lerPaginaComTentativas(pdf, numero);
      }
    }

    await Promise.all([trabalhador(), trabalhador()]);
    const paginasRevisadas = new Set();
    while (true) {
      try {
        return consolidarPaginas(paginas, { exigirTotais: true });
      } catch (e) {
        if (!e.pagina || paginasRevisadas.has(e.pagina)) throw e;
        paginasRevisadas.add(e.pagina);
        if (typeof showToast === 'function') showToast('Revisando pagina ' + e.pagina + ' por divergencia de saldo...', 'error');
        paginas[e.pagina - 1] = await lerPaginaComTentativas(pdf, e.pagina, 3.5);
      }
    }
  }

  root.parsearPDF_Bradesco_NetEmpresaOCR = parsearPDF_Bradesco_NetEmpresaOCR;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parsearPDF_Bradesco_NetEmpresaOCR: parsearPDF_Bradesco_NetEmpresaOCR,
      __test__: {
        consolidarPaginas: consolidarPaginas,
        limparConta: limparConta,
        dataISO: dataISO,
        somarMovimentos: somarMovimentos,
        promptPagina: promptPagina,
        responseSchema: RESPONSE_SCHEMA
      }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
