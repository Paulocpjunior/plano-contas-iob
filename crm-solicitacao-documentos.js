'use strict';
// ============================================================================
// crm-solicitacao-documentos.js  (PURO — testável)
// ----------------------------------------------------------------------------
// Modelos de solicitação de documentos AO CLIENTE (03/11/2026, pedido dos
// colaboradores via Paulo): o colaborador abre a empresa no CRM, escolhe o
// modelo, marca o que falta e o CCI preenche o texto sozinho (empresa, CNPJ,
// competência, prazo, quem pede). Sai por e-mail (caixa do colaborador, pelo
// Microsoft 365) ou abre a conversa no WhatsApp com o texto pronto.
//
// Regras da casa aplicadas aqui:
// - Alerta, nunca contorno: contato ausente no cadastro gera a mensagem que
//   diz ONDE corrigir; nada é deduzido de outra empresa ou de outro campo.
// - Ausente ≠ vazio: variável usada no modelo e não informada bloqueia a
//   prévia. Só a observação é opcional (e some do texto quando vazia).
// - O texto que sai é sempre recalculado no servidor a partir do modelo
//   salvo; o navegador nunca manda o texto final.
// ============================================================================

const MAX_MODELOS = 20;
const IDS = Array.from({ length: MAX_MODELOS }, (_, i) => 'S' + String(i + 1).padStart(2, '0'));
const idValido = id => IDS.includes(String(id));

const ASSINATURA = '\n\nQualquer dúvida, é só responder esta mensagem.\n\n{{responsavel}}\nSP Assessoria Contábil';

const MODELOS_PADRAO = [
  {
    id: 'S01',
    nome: 'Documentos do fechamento mensal',
    assunto: 'Documentos para o fechamento de {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara fecharmos a contabilidade de {{empresa}} (CNPJ {{cnpj}}) referente a {{competencia}}, precisamos dos documentos abaixo:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Extratos bancários de todas as contas (PDF ou OFX)',
      'Extratos das aplicações financeiras',
      'Notas fiscais de compras e de serviços tomados',
      'Comprovantes de pagamentos e recebimentos',
      'Contratos de empréstimo ou financiamento (se houver)'
    ]
  },
  {
    id: 'S02',
    nome: 'Extratos bancários e de aplicações',
    assunto: 'Extratos de {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara a conciliação bancária de {{empresa}} (CNPJ {{cnpj}}) em {{competencia}}, precisamos dos extratos abaixo, do primeiro ao último dia do mês:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}. Se possível, envie o arquivo OFX além do PDF.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Extrato da conta corrente (PDF ou OFX)',
      'Extrato das aplicações financeiras',
      'Extrato do cartão de crédito empresarial',
      'Extrato da conta de pagamentos (maquininha, Pix, marketplace)'
    ]
  },
  {
    id: 'S03',
    nome: 'Pendências da conciliação',
    assunto: 'Pendências de {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nNa conferência de {{empresa}} (CNPJ {{cnpj}}) referente a {{competencia}} ficaram algumas pendências. Precisamos de:\n\n{{documentos}}\n\n{{observacao}}\nPedimos o retorno até {{prazo}}.' + ASSINATURA,
    documentos: [
      'Comprovantes dos lançamentos sem identificação',
      'Notas fiscais dos pagamentos em aberto',
      'Explicação dos depósitos e transferências recebidos'
    ]
  },
  {
    id: 'S04',
    nome: 'Encerramento do exercício (balanço)',
    assunto: 'Documentos para o balanço de {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nEstamos preparando o encerramento do exercício e o balanço de {{empresa}} (CNPJ {{cnpj}}), com base em {{competencia}}. Precisamos dos documentos abaixo:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Extratos bancários e de aplicações de dezembro, com o saldo de 31/12',
      'Inventário do estoque em 31/12',
      'Relação dos bens comprados ou vendidos no ano',
      'Contratos de empréstimos e financiamentos com saldo em 31/12',
      'Relação de contas a receber e a pagar em 31/12'
    ]
  },
  {
    id: 'S05',
    nome: 'DITR (imóvel rural)',
    assunto: 'Documentos para a DITR — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara entregarmos a DITR (declaração do ITR) de {{empresa}} (CNPJ {{cnpj}}), referência {{competencia}}, precisamos dos documentos abaixo de cada imóvel rural:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Recibo e cópia da DITR do ano anterior',
      'CCIR e número do CIB/NIRF de cada imóvel',
      'Recibo do CAR (Cadastro Ambiental Rural)',
      'Área total, área utilizada e áreas de preservação, em hectares',
      'Valor da terra nua (VTN) informado pela prefeitura ou laudo'
    ]
  },
  {
    id: 'S06',
    nome: 'DIMOB (imóveis e aluguéis)',
    assunto: 'Documentos para a DIMOB — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara entregarmos a DIMOB de {{empresa}} (CNPJ {{cnpj}}), referência {{competencia}}, precisamos das informações abaixo:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Relação dos contratos de locação do ano, com locador, locatário e CPF/CNPJ',
      'Valores de aluguel pagos e recebidos mês a mês',
      'Comissões e taxas de administração cobradas',
      'Relação das vendas e intermediações de imóveis no ano',
      'Endereço completo e inscrição municipal de cada imóvel'
    ]
  },
  {
    id: 'S07',
    nome: 'Extratos bancários anuais (informes)',
    assunto: 'Extratos e informes bancários de {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara o fechamento anual de {{empresa}} (CNPJ {{cnpj}}), referência {{competencia}}, precisamos dos documentos bancários abaixo:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Extratos de todas as contas com o saldo em 31/12',
      'Informe de rendimentos de cada banco',
      'Extrato de empréstimos e financiamentos com o saldo devedor em 31/12',
      'Extrato do cartão de crédito empresarial de dezembro'
    ]
  },
  {
    id: 'S08',
    nome: 'Aluguéis pagos a pessoa física',
    assunto: 'Aluguéis pagos a pessoa física em {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara a EFD-Reinf de {{empresa}} (CNPJ {{cnpj}}), precisamos das informações sobre os aluguéis pagos a pessoas físicas (CPF) em {{competencia}}:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Comprovantes dos aluguéis pagos no mês',
      'Nome e CPF de cada locador (proprietário)',
      'Contrato de locação de cada imóvel (se novo ou renovado)',
      'Valor do IRRF retido, se houver, com o comprovante do recolhimento',
      'Demonstrativo da imobiliária com a taxa de administração (se houver)'
    ]
  },
  {
    id: 'S09',
    nome: 'Distribuição de lucros aos sócios',
    assunto: 'Lucros distribuídos em {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara registrarmos a distribuição de lucros de {{empresa}} (CNPJ {{cnpj}}) referente a {{competencia}}, precisamos de:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Valor distribuído a cada sócio, com a data de cada pagamento',
      'Comprovantes das transferências aos sócios',
      'Ata ou deliberação dos sócios aprovando a distribuição (se houver)'
    ]
  },
  {
    id: 'S10',
    nome: 'Inventário anual de estoques',
    assunto: 'Inventário de estoques de {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara o encerramento de {{empresa}} (CNPJ {{cnpj}}), referência {{competencia}}, precisamos do inventário de estoques:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Relação dos itens em estoque em 31/12, com quantidade, unidade e custo unitário',
      'Valor total do estoque por tipo (mercadorias, matéria-prima, produtos acabados)',
      'Estoque em poder de terceiros ou de terceiros em seu poder (se houver)',
      'Assinatura do responsável pela contagem'
    ]
  },
  {
    id: 'S11',
    nome: 'Informes de rendimento de aplicações financeiras',
    assunto: 'Informes de aplicações de {{competencia}} — {{empresa}}',
    texto: 'Olá! Tudo bem?\n\nPara conciliarmos as aplicações financeiras de {{empresa}} (CNPJ {{cnpj}}), referência {{competencia}}, precisamos de:\n\n{{documentos}}\n\nPedimos o envio até {{prazo}}.\n{{observacao}}' + ASSINATURA,
    documentos: [
      'Informe de rendimentos de cada banco ou corretora',
      'Extrato das aplicações com saldo, rendimento e IR retido',
      'Notas de corretagem e resgates do período (se houver)'
    ]
  }
];

const VARIAVEIS = ['empresa', 'cnpj', 'competencia', 'documentos', 'prazo', 'responsavel', 'observacao'];
const ROTULOS = {
  empresa: 'a razão social da empresa (cadastro da empresa)',
  cnpj: 'o CNPJ',
  competencia: 'a competência',
  documentos: 'ao menos um documento',
  prazo: 'o prazo de envio',
  responsavel: 'o seu nome (cadastro do colaborador)',
  observacao: 'a observação'
};
const CANAIS = ['email', 'whatsapp'];
const { listaEmails } = require('./empresa-cadastro');
const RE_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function erro(mensagem, status = 400) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function texto(v, max, campo, obrigatorio) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw erro('Informe ' + campo + ' como texto.');
  const t = v.replace(/\r\n?/g, '\n').trim();
  if (obrigatorio && !t) throw erro('Informe ' + campo + '.');
  if (t.length > max) throw erro('O campo ' + campo + ' aceita até ' + max + ' caracteres.');
  return t;
}

function listaDocumentos(entrada, { obrigatoria }) {
  const bruta = Array.isArray(entrada) ? entrada : String(entrada || '').split('\n');
  const itens = [];
  for (const v of bruta) {
    if (typeof v !== 'string') throw erro('Informe os documentos como texto, um por linha.');
    const t = v.replace(/^[\s•*\-–]+/, '').trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length > 200) throw erro('Cada documento aceita até 200 caracteres.');
    if (!itens.some(x => x.toLowerCase() === t.toLowerCase())) itens.push(t);
  }
  if (itens.length > 30) throw erro('Liste até 30 documentos por solicitação.');
  if (obrigatoria && !itens.length) throw erro('Marque ou escreva ao menos um documento.');
  return itens;
}

function variaveisUsadas(t) {
  return [...String(t || '').matchAll(/{{([a-z]+)}}/g)].map(m => m[1]);
}

function conferirVariaveis(t, campo, proibidas = []) {
  for (const v of variaveisUsadas(t)) {
    if (!VARIAVEIS.includes(v)) throw erro('Variável desconhecida no ' + campo + ': {{' + v + '}}. Use: ' + VARIAVEIS.map(x => '{{' + x + '}}').join(', ') + '.');
    if (proibidas.includes(v)) throw erro('A variável {{' + v + '}} não pode ser usada no ' + campo + '.');
  }
  if (/[{}]/.test(String(t).replace(/{{[a-z]+}}/g, ''))) throw erro('Use as variáveis no formato {{empresa}} no ' + campo + '.');
}

/** Modelos efetivos: os padrões (S01–S04) com o que o administrador salvou por cima, mais os criados. */
function modelosEfetivos(salvos = []) {
  const porId = new Map((salvos || []).filter(s => s && idValido(s.id)).map(s => [s.id, s]));
  const lista = [];
  for (const id of IDS) {
    const padrao = MODELOS_PADRAO.find(m => m.id === id);
    const s = porId.get(id);
    if (!padrao && !s) continue;
    const base = padrao || { id, nome: '', assunto: '', texto: '', documentos: [] };
    lista.push({
      id,
      padrao: !!padrao,
      nome: s ? s.nome : base.nome,
      assunto: s ? s.assunto : base.assunto,
      texto: s ? s.texto : base.texto,
      documentos: s ? (s.documentos || []) : base.documentos,
      ativo: s ? s.ativo !== false : true,
      revisao: s ? (s.revisao || 0) : 0,
      alterado_por: s ? (s.alterado_por || null) : null,
      alterado_em: s ? (s.alterado_em || null) : null
    });
  }
  return lista;
}

function proximoId(salvos = []) {
  const usados = new Set([...MODELOS_PADRAO.map(m => m.id), ...(salvos || []).map(s => s && s.id)]);
  return IDS.find(id => !usados.has(id)) || null;
}

/** Valida a edição do administrador. Devolve o documento a gravar. */
function configurarModelo(id, antes, b, uid, quando) {
  if (!idValido(id)) throw erro('Modelo inválido. Atualize a lista de modelos.', 404);
  const atual = antes || {};
  const corpo = b || {};
  if (!Number.isSafeInteger(corpo.revisao) || corpo.revisao !== (atual.revisao || 0)) throw erro('O modelo foi alterado por outra pessoa. Reabra a lista de modelos.', 409);
  const nome = texto(corpo.nome, 80, 'o nome do modelo', true);
  const assunto = texto(corpo.assunto, 180, 'o assunto do e-mail', true);
  const corpoTexto = texto(corpo.texto, 3000, 'o texto da mensagem', true);
  conferirVariaveis(assunto, 'assunto', ['documentos', 'observacao']);
  conferirVariaveis(corpoTexto, 'texto');
  if (!variaveisUsadas(corpoTexto).includes('documentos')) throw erro('Inclua {{documentos}} no texto: é onde entra a lista do que está sendo pedido.');
  const documentos = listaDocumentos(corpo.documentos, { obrigatoria: false });
  const ativo = corpo.ativo !== false;
  return { id, nome, assunto, texto: corpoTexto, documentos, ativo, revisao: (atual.revisao || 0) + 1, alterado_por: uid, alterado_em: quando };
}

function competenciaBr(c) {
  return c.slice(5, 7) + '/' + c.slice(0, 4);
}

function dataBr(d) {
  return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
}

function dataValida(d) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + 'T12:00:00Z');
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}

function cnpjFormatado(c) {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
}

function normalizarWhatsapp(bruto) {
  let d = String(bruto || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  if (!d.startsWith('55')) d = '55' + d;
  if (!/^55\d{10,11}$/.test(d) || Number(d.slice(2, 4)) < 11) return null;
  return d;
}

function whatsappFormatado(n) {
  const d = String(n || '');
  if (!/^55\d{10,11}$/.test(d)) return d;
  const ddd = d.slice(2, 4), num = d.slice(4);
  return '+55 (' + ddd + ') ' + num.slice(0, num.length - 4) + '-' + num.slice(-4);
}

/** Contato do cadastro da empresa, sem deduzir nada de outro campo. */
function contatoEmpresa(empresa) {
  const e = empresa || {};
  const lista = listaEmails(e.email);
  const emails = lista.filter(x => RE_EMAIL.test(x));
  const whatsapp = normalizarWhatsapp(e.whatsapp || e.whatsapp_cliente || '');
  return {
    email: emails.join('; '),
    emails,
    email_invalido: emails.length !== lista.length,
    whatsapp: whatsapp || '',
    whatsapp_exibicao: whatsapp ? whatsappFormatado(whatsapp) : '',
    whatsapp_invalido: whatsapp === null,
    contato: String(e.contato || '').trim()
  };
}

function resolverDestino(canal, b, empresa) {
  const c = contatoEmpresa(empresa);
  const tipo = b.destino_tipo === 'outro' ? 'outro' : 'cadastro';
  if (canal === 'email') {
    if (tipo === 'cadastro') {
      if (c.email_invalido) throw erro('O e-mail do cadastro desta empresa é inválido. Corrija em Empresas → Dados da empresa → E-mail, ou informe outro e-mail para este envio.');
      if (!c.email) throw erro('Esta empresa não tem e-mail no cadastro. Cadastre em Empresas → Dados da empresa → E-mail, ou informe outro e-mail para este envio.');
      return { destino: c.email, destinos: c.emails, destino_tipo: tipo };
    }
    const lista = listaEmails(texto(b.destino, 600, 'o e-mail do cliente', true));
    const invalidos = lista.filter(x => !RE_EMAIL.test(x));
    if (invalidos.length) throw erro('E-mail inválido: ' + invalidos.join(', ') + '. Para mais de um, separe com ponto e vírgula (;).');
    if (lista.length > 10) throw erro('Informe até 10 e-mails por envio.');
    return { destino: lista.join('; '), destinos: lista, destino_tipo: tipo };
  }
  if (tipo === 'cadastro') {
    if (c.whatsapp_invalido) throw erro('O WhatsApp do cadastro desta empresa é inválido. Corrija em Empresas → Dados da empresa → WhatsApp API, ou informe outro número para este envio.');
    if (!c.whatsapp) throw erro('Esta empresa não tem WhatsApp no cadastro. Cadastre em Empresas → Dados da empresa → WhatsApp API, ou informe outro número para este envio.');
    return { destino: c.whatsapp, destinos: [c.whatsapp], destino_tipo: tipo };
  }
  const numero = normalizarWhatsapp(texto(b.destino, 30, 'o WhatsApp do cliente', true));
  if (!numero) throw erro('WhatsApp inválido: informe DDD + número, com 10 ou 11 dígitos.');
  return { destino: numero, destinos: [numero], destino_tipo: tipo };
}

function preencher(t, dados) {
  return String(t).replace(/{{([a-z]+)}}/g, (_, v) => dados[v] ?? '');
}

function limparTexto(t) {
  return t.split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function linkWhatsapp(numero, mensagem) {
  return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensagem);
}

/**
 * Monta a solicitação a partir do modelo salvo e do que o colaborador marcou.
 * @param {object} modelo     modelo efetivo (modelosEfetivos)
 * @param {object} b          { canal, destino_tipo, destino, competencia, prazo, documentos, observacao }
 * @param {object} ctx        { cnpj, empresa, colaborador: { nome, email }, hoje: 'AAAA-MM-DD' }
 */
function prepararSolicitacao(modelo, b, ctx) {
  if (!modelo || !idValido(modelo.id)) throw erro('Modelo indisponível. Atualize a lista de modelos.', 404);
  if (modelo.ativo === false) throw erro('Este modelo está desativado. Escolha outro ou peça ao administrador para reativá-lo.', 409);
  const corpo = b || {};
  const contexto = ctx || {};
  const canal = corpo.canal;
  if (!CANAIS.includes(canal)) throw erro('Escolha o canal: e-mail ou WhatsApp.');
  const usadas = new Set([...variaveisUsadas(modelo.texto), ...(canal === 'email' ? variaveisUsadas(modelo.assunto) : [])]);
  const empresa = contexto.empresa || {};
  const dados = {
    empresa: String(empresa.razao_social || '').trim(),
    cnpj: cnpjFormatado(contexto.cnpj),
    responsavel: String((contexto.colaborador || {}).nome || (contexto.colaborador || {}).email || '').trim(),
    observacao: texto(corpo.observacao, 1000, 'a observação', false)
  };
  const documentos = listaDocumentos(corpo.documentos, { obrigatoria: usadas.has('documentos') });
  dados.documentos = documentos.map(d => '• ' + d).join('\n');
  let competencia = null, prazo = null;
  if (usadas.has('competencia') || corpo.competencia) {
    competencia = String(corpo.competencia || '');
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competencia)) throw erro('Informe a competência no formato mês/ano.');
    dados.competencia = competenciaBr(competencia);
  }
  if (usadas.has('prazo') || corpo.prazo) {
    prazo = String(corpo.prazo || '');
    if (!dataValida(prazo)) throw erro('Informe o prazo de envio (data).');
    if (contexto.hoje && prazo < contexto.hoje) throw erro('O prazo não pode ser anterior a hoje.');
    dados.prazo = dataBr(prazo);
  }
  for (const v of usadas) {
    if (v !== 'observacao' && !dados[v]) throw erro('Informe ' + (ROTULOS[v] || v) + ': o modelo usa {{' + v + '}}.');
  }
  const { destino, destinos, destino_tipo } = resolverDestino(canal, corpo, empresa);
  const mensagem = limparTexto(preencher(modelo.texto, dados));
  if (mensagem.length > 4000) throw erro('A mensagem passou de 4.000 caracteres. Reduza a lista de documentos ou a observação.');
  const assunto = canal === 'email' ? preencher(modelo.assunto, dados).replace(/\s+/g, ' ').trim().slice(0, 180) : '';
  return {
    modelo: modelo.id,
    modelo_nome: modelo.nome,
    modelo_revisao: modelo.revisao || 0,
    canal,
    destino,
    destinos,
    destino_tipo,
    destino_exibicao: canal === 'whatsapp' ? whatsappFormatado(destino) : destinos.join(', '),
    assunto,
    mensagem,
    competencia,
    prazo,
    documentos,
    observacao: dados.observacao,
    ...(canal === 'whatsapp' ? { whatsapp_link: linkWhatsapp(destino, mensagem) } : {})
  };
}

function escaparHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Miolo HTML do e-mail: o texto do modelo, escapado, com quebras de linha. */
function htmlDaMensagem(mensagem) {
  return '<div style="margin:0; white-space:normal;">' + escaparHtml(mensagem).replace(/\n/g, '<br>') + '</div>';
}

/** Firestore rejeita undefined: o registro só leva valores definidos. */
function semIndefinidos(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

// ── Situação da empresa na carteira (v3.4.484) ──────────────────────────────
// Cada envio grava um resumo da última solicitação por empresa; a carteira mostra
// a situação para os administradores acompanharem. Ausência de envio é "sem".
const SITUACOES_SOLICITACAO = {
  aguardando: 'Aguardando cliente',
  atrasada: 'Cliente atrasado',
  recebida: 'Documentos recebidos',
  falhou: 'Envio não confirmado',
  sem: 'Sem solicitação'
};

/** Resumo gravado em crm_solicitacao_status/{cnpj} a partir do registro do envio. */
function resumoSolicitacao(id, registro) {
  const r = registro || {};
  return semIndefinidos({
    cnpj: r.cnpj,
    solicitacao_id: id,
    situacao: r.estado === 'falhou' ? 'falhou' : r.recebida_em ? 'recebida' : 'aguardando',
    canal: r.canal,
    modelo_nome: r.modelo_nome,
    competencia: r.competencia || null,
    prazo: r.prazo || null,
    quando: r.quando,
    autor_email: r.autor_email || '',
    destino_exibicao: r.destino_exibicao || '',
    recebida_em: r.recebida_em || null,
    recebida_por: r.recebida_por || null
  });
}

/** Situação para a tela: o atraso é calculado na leitura, nunca gravado. */
function situacaoSolicitacao(resumo, hoje) {
  if (!resumo || !resumo.solicitacao_id) return 'sem';
  if (resumo.situacao === 'recebida' || resumo.situacao === 'falhou') return resumo.situacao;
  return resumo.prazo && hoje && resumo.prazo < hoje ? 'atrasada' : 'aguardando';
}

function solicitacaoPublica(resumo, hoje) {
  const situacao = situacaoSolicitacao(resumo, hoje);
  if (situacao === 'sem') return { situacao };
  return { situacao, rotulo: SITUACOES_SOLICITACAO[situacao], modelo_nome: resumo.modelo_nome || '', competencia: resumo.competencia || null, prazo: resumo.prazo || null, quando: resumo.quando || null, canal: resumo.canal || '', recebida_em: resumo.recebida_em || null };
}

// ── Cópias automáticas (v3.4.495) ───────────────────────────────────────────
// Mesmo modelo do app Legalização ("Cópias automáticas dos alertas"): o admin
// define uma vez quem recebe cópia OCULTA de todo e-mail de solicitação ao
// cliente, e o líder da equipe de quem envia (Topologia do CRM) entra sozinho.
// Ninguém precisa lembrar de incluir. WhatsApp não tem cópia.
const MAX_COPIAS = 20;

function configurarCopias(b, uid, quando) {
  const corpo = b || {};
  const bruto = Array.isArray(corpo.emails) ? corpo.emails.join(';') : String(corpo.emails || '');
  const lista = listaEmails(bruto);
  const invalidos = lista.filter(x => !RE_EMAIL.test(x));
  if (invalidos.length) throw erro('E-mail inválido nas cópias: ' + invalidos.join(', ') + '. Corrija e salve de novo.');
  if (lista.length > MAX_COPIAS) throw erro('Informe até ' + MAX_COPIAS + ' e-mails nas cópias automáticas.');
  return { emails: lista, lider_da_equipe: corpo.lider_da_equipe !== false, atualizado_em: quando, atualizado_por: uid };
}

function copiasConfiguradas(d) {
  const c = d || {};
  return { emails: Array.isArray(c.emails) ? listaEmails(c.emails.join(';')).filter(x => RE_EMAIL.test(x)) : [], lider_da_equipe: c.lider_da_equipe !== false, atualizado_em: c.atualizado_em || null };
}

/** Cópias ocultas do envio: configuradas + líder(es), sem repetir remetente nem cliente. */
function copiasDoEnvio({ config, lideres = [], remetente = '', destinos = [] }) {
  const c = copiasConfiguradas(config);
  const fora = new Set([String(remetente || '').toLowerCase(), ...destinos.map(x => String(x || '').toLowerCase())]);
  const todos = [...c.emails, ...(c.lider_da_equipe ? lideres : [])].map(x => String(x || '').trim().toLowerCase()).filter(x => RE_EMAIL.test(x));
  return [...new Set(todos)].filter(x => !fora.has(x)).slice(0, MAX_COPIAS + 5);
}

module.exports = {
  MAX_MODELOS, IDS, MODELOS_PADRAO, VARIAVEIS, idValido, modelosEfetivos, proximoId, configurarModelo,
  contatoEmpresa, prepararSolicitacao, normalizarWhatsapp, whatsappFormatado, linkWhatsapp, htmlDaMensagem,
  semIndefinidos, competenciaBr, dataBr,
  SITUACOES_SOLICITACAO, resumoSolicitacao, situacaoSolicitacao, solicitacaoPublica,
  MAX_COPIAS, configurarCopias, copiasConfiguradas, copiasDoEnvio
};
