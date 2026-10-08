'use strict';
const { camposCadastroEmpresa } = require('./empresa-cadastro');
const { podeAcao } = require('./permissoes-cci');
const digits = valor => String(valor ?? '').replace(/\D/g, '');
const texto = valor => typeof valor === 'string' || typeof valor === 'number' ? String(valor).trim().replace(/\s+/g, ' ') : '';

function normalizarConsultaCnpj(dados, cnpj) {
  if (!dados || digits(dados.cnpj) !== cnpj || !texto(dados.razao_social)) {
    throw new Error('A fonte retornou dados incompatíveis com o CNPJ. Tente consultar novamente.');
  }
  const campos = {}, avisos = [];
  const mapa = {
    razao_social: 'razao_social', nome_fantasia: 'nome_fantasia', data_abertura: 'data_inicio_atividade',
    tipo_logradouro: 'descricao_tipo_de_logradouro', logradouro: 'logradouro', numero: 'numero', complemento: 'complemento',
    bairro: 'bairro', municipio: 'municipio', uf: 'uf', cep: 'cep', natureza_juridica: 'natureza_juridica',
    telefone: 'ddd_telefone_1', email: 'email'
  };
  for (const [campo, origem] of Object.entries(mapa)) {
    const valor = texto(dados[origem]);
    if (!valor) continue; // Ausência na fonte nunca propõe apagar um cadastro.
    const resultado = camposCadastroEmpresa({ [campo]: valor });
    if (resultado.ok) campos[campo] = resultado.campos[campo];
    else avisos.push('Confira manualmente o campo ' + campo + ': ' + resultado.erro);
  }
  const cnae = valor => /^\d{1,7}$/.test(texto(valor)) && Number(valor) > 0 ? texto(valor).padStart(7, '0') : '';
  if (cnae(dados.cnae_fiscal)) campos.cnae_principal = cnae(dados.cnae_fiscal);
  const secundarios = [...new Set((Array.isArray(dados.cnaes_secundarios) ? dados.cnaes_secundarios : []).map(item => cnae(item && item.codigo)).filter(Boolean))];
  if (secundarios.length === 1) campos.cnae_secundario = secundarios[0];
  if (secundarios.length > 1) avisos.push('A fonte informa vários CNAEs secundários: ' + secundarios.join(', ') + '. O cadastro possui um campo individual; confira qual informar, sem substituir automaticamente.');
  return { cnpj, campos, avisos, situacao: texto(dados.descricao_situacao_cadastral) };
}

function criarConsultaCnpjHandler({ checarAcessoEmpresa, fetchImpl = fetch, timeoutMs = 12000, logger = console }) {
  return async function consultarCnpj(req, res) {
    const cnpj = digits(req.params.cnpj);
    if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ erro: 'CNPJ inválido. Confira o cadastro.' });
    let timer;
    try {
      const acesso = await checarAcessoEmpresa(cnpj, req.user);
      if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const resposta = await fetchImpl('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, {
        signal: controller.signal,
        // Identificação real do integrador: o UA genérico do Node é rejeitado pela fonte.
        headers: { 'User-Agent': 'ConsultorContabilInteligente/1.0', Accept: 'application/json' }
      });
      if (!resposta.ok) {
        logger.warn(JSON.stringify({ evento: 'consulta_cnpj_fonte_indisponivel', fonte: 'BrasilAPI', status: resposta.status }));
        const status = resposta.status === 404 ? 404 : resposta.status === 429 ? 429 : 502;
        return res.status(status).json({ erro: status === 404 ? 'CNPJ não encontrado na fonte. Confira o número e tente novamente.' : status === 429 ? 'A fonte limitou as consultas. Aguarde um momento e tente novamente.' : 'Consulta de CNPJ indisponível. Tente novamente mais tarde; o cadastro foi preservado.' });
      }
      const resultado = normalizarConsultaCnpj(await resposta.json(), cnpj);
      res.set('Cache-Control', 'no-store');
      return res.json({ ...resultado, fonte: 'BrasilAPI', consultado_em: new Date().toISOString(), pode_editar: podeAcao(req.user, 'editar') });
    } catch (erro) {
      logger.warn(JSON.stringify({ evento: 'consulta_cnpj_falha', fonte: 'BrasilAPI', tipo: erro.name === 'AbortError' ? 'timeout' : 'resposta_ou_conexao' }));
      return res.status(502).json({ erro: erro.name === 'AbortError' ? 'A consulta demorou mais que o esperado. Tente novamente; o cadastro foi preservado.' : 'Não foi possível conferir os dados do CNPJ. Tente novamente; o cadastro foi preservado.' });
    } finally { clearTimeout(timer); }
  };
}
module.exports = { normalizarConsultaCnpj, criarConsultaCnpjHandler };
