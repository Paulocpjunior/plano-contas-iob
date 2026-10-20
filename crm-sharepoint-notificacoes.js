'use strict';

// Nucleo puro de roteamento. Nao consulta Graph, nao concede acesso e nao envia mensagens.
const EVENTOS = new Set(['arquivo_criado', 'arquivo_alterado', 'arquivo_excluido', 'arquivo_movido', 'arquivo_baixado']);
function falha(mensagem) { throw Object.assign(new Error(mensagem), {status: 400}); }
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
  const suffix = '@' + String(dominio || '').trim().toLowerCase();
  return email && email.endsWith(suffix) && email.indexOf('@') === email.length - suffix.length ? email : null;
}
function prepararEvento({evento, arquivo_url, vinculos, empresa, usuarios, gestao, dominio, contato}) {
  if (!EVENTOS.has(evento)) falha('Evento documental nao suportado.');
  const vinculo = localizarEmpresa(vinculos, arquivo_url);
  const cnpj = cnpjNormalizado(vinculo.cnpj);
  if (cnpjNormalizado(empresa && empresa.cnpj) !== cnpj) falha('Cadastro da empresa nao corresponde a pasta.');
  if (!Array.isArray(empresa.responsaveis) || !Array.isArray(usuarios)) falha('Carteira nao confirmada.');
  const porUid = new Map(usuarios.filter(u => u && u.ativo === true && u.uid).map(u => [u.uid, u]));
  const colaboradores = [];
  const uids = new Set();
  for (const r of empresa.responsaveis) {
    if (!r || !r.uid || uids.has(r.uid)) continue;
    const u = porUid.get(r.uid);
    const email = u && emailCorporativo(u.email, dominio);
    if (!email) falha('Responsavel sem identidade corporativa ativa; encaminhe para revisao.');
    uids.add(r.uid);
    colaboradores.push({uid: r.uid, email, papel: r.papel === 'principal' ? 'principal' : 'apoio'});
  }
  if (!colaboradores.some(x => x.papel === 'principal')) falha('Empresa sem responsavel principal confirmado.');
  const gestores = [];
  for (const equipe of (gestao && gestao.equipes) || []) {
    if (!equipe || !Array.isArray(equipe.membros) || !equipe.membros.some(uid => uids.has(uid))) continue;
    const lider = porUid.get(equipe.lider_uid);
    const email = lider && emailCorporativo(lider.email, dominio);
    if (!email) falha('Gestor nao confirmado; encaminhe para revisao.');
    if (!gestores.some(g => g.uid === lider.uid)) gestores.push({uid: lider.uid, email});
  }
  // Contato externo so entra com confirmacao explicita e vinculo ao mesmo CNPJ.
  const cliente = contato && contato.autorizado === true &&
    cnpjNormalizado(contato.cnpj) === cnpj && contato.email_confirmado === true &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contato.email || '').trim())
      ? {email: String(contato.email).trim().toLowerCase()} : null;
  return {
    estado: 'pendente_validacao', envio_realizado: false, evento, cnpj,
    pasta_url: vinculo.pasta_url, arquivo_url,
    colaboradores, gestores, cliente,
    requer_confirmacao_permissoes_sharepoint: true
  };
}
module.exports = {EVENTOS, cnpjNormalizado, caminhoSharePoint, pastaContemArquivo, localizarEmpresa, prepararEvento};
