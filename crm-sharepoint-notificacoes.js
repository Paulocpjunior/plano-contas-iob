'use strict';

// Nucleo puro de roteamento. Nao consulta Graph, nao concede acesso e nao envia mensagens.
const EVENTOS = new Set(['arquivo_criado', 'arquivo_alterado', 'arquivo_excluido', 'arquivo_movido']);
function falha(mensagem, code = 'SHAREPOINT_VALIDACAO', status = 400) {
  throw Object.assign(new Error(mensagem), {status, code, motivo: mensagem});
}
function cnpjNormalizado(valor) {
  const cnpj = String(valor || '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(cnpj)) falha('CNPJ invalido.');
  return cnpj;
}
function caminhoSharePoint(valor) {
  let url;
  try { url = new URL(String(valor || '')); } catch (_) { falha('URL SharePoint invalida.'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.sharepoint.com') ||
      url.username || url.password || url.search || url.hash) falha('Use a URL canonica HTTPS da pasta SharePoint.');
  const caminho = decodeURIComponent(url.pathname).replace(/\/+$/, '');
  if (!caminho || caminho === '/' || caminho.includes('..') || caminho.includes('\\')) falha('Pasta SharePoint invalida.');
  return url.hostname.toLowerCase() + caminho;
}
function pastaContemArquivo(pasta, arquivo) {
  const base = caminhoSharePoint(pasta), alvo = caminhoSharePoint(arquivo);
  return alvo.startsWith(base + '/');
}
function localizarEmpresa(vinculos, arquivo) {
  if (!Array.isArray(vinculos)) falha('Vinculos invalidos.');
  const encontrados = vinculos.filter(v => v && v.ativo === true && pastaContemArquivo(v.pasta_url, arquivo));
  if (encontrados.length !== 1) falha('Pasta sem vinculo unico e ativo; encaminhe para revisao.');
  return encontrados[0];
}
function emailCorporativo(valor, dominio) {
  const email = String(valor || '').trim().toLowerCase();
  const dominioEsperado = String(dominio || '').trim().toLowerCase();
  return emailValido(email) && email.slice(email.lastIndexOf('@') + 1) === dominioEsperado ? email : null;
}
function emailValido(valor) {
  const email = String(valor || '').trim().toLowerCase();
  if (email.length > 254) return false;
  const partes = email.split('@');
  if (partes.length !== 2 || !partes[0] || partes[0].length > 64) return false;
  // Endereços simples do diretório corporativo: sem espaços, cabeçalhos ou parte local vazia.
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(partes[0])) return false;
  return /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(partes[1]);
}
function uidValido(uid) {
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && uid.trim() === uid && !/[\s/\x00-\x1f\x7f]/.test(uid);
}
function identificarGestores(responsaveis, gestao) {
  if (!Array.isArray(responsaveis) || !gestao || !Array.isArray(gestao.equipes) || !gestao.equipes.length) {
    falha('Confira a topologia de gestão do CRM: a equipe responsável precisa ter gestor.', 'SHAREPOINT_GESTOR_AUSENTE', 409);
  }
  for (const equipe of gestao.equipes) {
    if (!equipe || !uidValido(equipe.lider_uid) || !Array.isArray(equipe.membros) || !equipe.membros.length || equipe.membros.some(uid => !uidValido(uid))) {
      falha('Corrija a equipe incompleta na topologia de gestão do CRM.', 'SHAREPOINT_TOPOLOGIA_INVALIDA', 409);
    }
  }
  return responsaveis.map(responsavel => {
    if (!responsavel || !uidValido(responsavel.uid)) falha('Corrija o responsável sem UID na carteira do CRM.', 'SHAREPOINT_CARTEIRA_INVALIDA', 409);
    // Um líder responsável por empresa pode receber também na qualidade de gestor.
    const lideres = new Set(gestao.equipes
      .filter(e => e.lider_uid === responsavel.uid || e.membros.includes(responsavel.uid))
      .map(e => e.lider_uid));
    if (!lideres.size) falha('Associe todos os responsáveis a uma equipe com gestor na topologia do CRM.', 'SHAREPOINT_GESTOR_AUSENTE', 409);
    if (lideres.size !== 1) falha('Resolva os gestores divergentes do responsável na topologia do CRM.', 'SHAREPOINT_GESTOR_AMBIGUO', 409);
    return {colaborador_uid: responsavel.uid, gestor_uid: [...lideres][0]};
  });
}
function resolverDestinatarios({responsaveis, usuarios, gestao, dominio}) {
  if (!Array.isArray(responsaveis) || !Array.isArray(usuarios) || !responsaveis.length) {
    falha('Confirme os responsáveis na carteira do CRM.', 'SHAREPOINT_CARTEIRA_INVALIDA', 409);
  }
  const uids = new Set();
  for (const r of responsaveis) {
    if (!r || !uidValido(r.uid) || !['principal', 'apoio'].includes(r.papel) || uids.has(r.uid)) {
      falha('Corrija os responsáveis duplicados ou inválidos na carteira do CRM.', 'SHAREPOINT_CARTEIRA_AMBIGUA', 409);
    }
    uids.add(r.uid);
  }
  if (responsaveis.filter(r => r.papel === 'principal').length !== 1) {
    falha('Defina exatamente um responsável principal na carteira do CRM.', 'SHAREPOINT_PRINCIPAL_INVALIDO', 409);
  }
  const porUid = new Map();
  for (const u of usuarios) {
    if (!u || !uidValido(u.uid)) continue;
    if (!porUid.has(u.uid)) porUid.set(u.uid, []);
    porUid.get(u.uid).push(u);
  }
  const emails = new Map();
  function identidade(uid) {
    const registros = porUid.get(uid) || [];
    if (registros.length !== 1) falha('Confira a identidade única de cada responsável e gestor no cadastro de usuários.', 'SHAREPOINT_IDENTIDADE_AMBIGUA', 409);
    const u = registros[0];
    if (u.ativo !== true) falha('Substitua o responsável ou gestor inativo na carteira/topologia do CRM.', 'SHAREPOINT_USUARIO_INATIVO', 403);
    const email = emailCorporativo(u.email, dominio);
    if (!email) falha('Corrija o e-mail corporativo do responsável ou gestor no cadastro de usuários.', 'SHAREPOINT_EMAIL_INVALIDO', 409);
    if (emails.has(email) && emails.get(email) !== uid) falha('Resolva os usuários diferentes com o mesmo e-mail corporativo.', 'SHAREPOINT_EMAIL_AMBIGUO', 409);
    emails.set(email, uid);
    return {uid, email};
  }
  const colaboradores = responsaveis.map(r => ({...identidade(r.uid), papel: r.papel, ...(r.temporario === true ? {temporario: true} : {})}));
  const vinculosGestao = identificarGestores(responsaveis, gestao);
  const gestores = [...new Set(vinculosGestao.map(v => v.gestor_uid))].map(identidade);
  const unicos = new Map(colaboradores.map(c => [c.uid, {uid: c.uid, email: c.email, papel: c.papel}]));
  for (const g of gestores) if (!unicos.has(g.uid)) unicos.set(g.uid, {...g, papel: 'gestor'});
  return {colaboradores, gestores, destinatarios: [...unicos.values()]};
}
function prepararEvento({evento, arquivo_url, vinculos, empresa, usuarios, gestao, dominio, contato}) {
  if (!EVENTOS.has(evento)) falha('Evento documental nao suportado.');
  const vinculo = localizarEmpresa(vinculos, arquivo_url);
  const cnpj = cnpjNormalizado(vinculo.cnpj);
  if (cnpjNormalizado(empresa && empresa.cnpj) !== cnpj) falha('Cadastro da empresa nao corresponde a pasta.');
  const {colaboradores, gestores, destinatarios} = resolverDestinatarios({responsaveis: empresa.responsaveis, usuarios, gestao, dominio});
  // Contato externo so entra com confirmacao explicita e vinculo ao mesmo CNPJ.
  const cliente = contato && contato.autorizado === true &&
    cnpjNormalizado(contato.cnpj) === cnpj && contato.email_confirmado === true &&
    emailValido(contato.email)
      ? {email: String(contato.email).trim().toLowerCase()} : null;
  return {
    estado: 'pendente_validacao', envio_realizado: false, evento, cnpj,
    pasta_url: vinculo.pasta_url, arquivo_url,
    colaboradores, gestores, destinatarios, cliente,
    requer_confirmacao_permissoes_sharepoint: true
  };
}
module.exports = {EVENTOS, cnpjNormalizado, caminhoSharePoint, pastaContemArquivo, localizarEmpresa, prepararEvento, emailCorporativo, identificarGestores, resolverDestinatarios};

