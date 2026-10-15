'use strict';
// Offline: não escreve no Firestore, não consulta URLs e não aplica o plano.
const fs = require('fs');
const crypto = require('crypto');
const { isDeepStrictEqual: igual } = require('util');
const { conferir } = require('./conferir-crm-jotform');
const { documentosEmpresa } = require('../crm-base');
const { valido } = require('./importar-crm-jotform');
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
function mapa(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || !r.id || m.has(r.id)) throw Error('Identificador ausente ou repetido.');
    m.set(r.id, r);
  }
  return m;
}
function planejar(anterior, nova, atuais, vinculos = []) {
  conferir(anterior, anterior.registros, anterior.fontes);
  conferir(nova, nova.registros, nova.fontes);
  const auditoria = conferir(anterior, atuais, anterior.fontes);
  if (auditoria.divergencias.length) throw Error('Base CCI diverge do snapshot anterior. Reconcilie antes de planejar.');
  const antigos = mapa(anterior.registros), novos = mapa(nova.registros), cci = mapa(atuais);
  const fontesAntes = mapa(anterior.fontes), fontesNovas = mapa(nova.fontes);
  const usados = new Set(), explicitos = new Map();
  if (!Array.isArray(vinculos)) throw Error('Informe vínculos explícitos em uma lista.');
  for (const v of vinculos) {
    const a = antigos.get(v.anterior), n = novos.get(v.novo);
    if (!a || !n || a.fonte !== n.fonte || usados.has(a.id) || explicitos.has(n.id) || typeof v.motivo !== 'string' || !v.motivo.trim()) throw Error('Vínculo inválido, repetido ou sem motivo.');
    usados.add(a.id); explicitos.set(n.id, a.id);
  }
  usados.clear();
  const itens = [];
  const item = (id, estado, extra = {}) => itens.push({ referencia_sha256: hash(id), estado, ...extra });
  for (const n of novos.values()) {
    const f = fontesNovas.get(n.fonte), antes = fontesAntes.get(n.fonte);
    const mesmaFonte = antes && igual(antes, f);
    const aid = explicitos.get(n.id) || (mesmaFonte && antigos.has(n.id) ? n.id : null);
    if (!aid) {
      item(n.id, antes ? 'identidade_a_confirmar' : 'nova_fonte_a_conferir');
      continue;
    }
    if (usados.has(aid)) throw Error('Mais de um registro aponta para a mesma origem.');
    usados.add(aid);
    const a = antigos.get(aid), d = cci.get(aid);
    // Não admite vínculo de identidade diferente, mesmo com justificativa.
    if (!igual([a.cnpj,a.codigo,a.nome], [n.cnpj,n.codigo,n.nome])) {
      item(n.id, 'identificacao_alterada'); continue;
    }
    if (!igual(fontesAntes.get(a.fonte).cabecalhos, f.cabecalhos) || a.campos.length !== n.campos.length) {
      item(n.id, 'estrutura_alterada'); continue;
    }
    const campos = n.campos.map((c, i) => {
      const old = a.campos[i], atual = d.campos[i];
      const origemMudou = !igual(old, c), cciMudou = !igual(old.valor, atual.valor);
      let estado = 'inalterado';
      if (origemMudou) estado = cciMudou ? (igual(c.valor, atual.valor) ? 'convergente_conferir_metadados' : 'conflito') : 'mudanca_origem_a_conferir';
      else if (cciMudou) estado = 'preservar_edicao_cci';
      return { coluna: i, estado };
    }).filter(c => c.estado !== 'inalterado');
    item(n.id, campos.some(c => c.estado === 'conflito') ? 'conflito' : campos.length ? 'revisar_campos' : 'inalterado', { anterior_sha256: hash(aid), campos });
  }
  for (const a of antigos.values()) if (!usados.has(a.id)) item(a.id, 'origem_anterior_sem_vinculo_preservar');
  const totais = {};
  for (const i of itens) totais[i.estado] = (totais[i.estado] || 0) + 1;
  return { esquema: 1, somente_previa: true, aplicacao_automatica: false, corte_jotform: false,
    aviso: 'Linha, nome e CNPJ não comprovam identidade de submissão. Vínculos explícitos exigem conferência humana. Ausência nunca autoriza exclusão.', totais, itens };
}
function inventariar(payload) {
  conferir(payload, payload.registros, payload.fontes);
  const arquivos = new Map();
  for (const r of payload.registros) for (const doc of documentosEmpresa([r])) {
    // Mesmo URL em empresas diferentes nunca compartilha a autorização ou o objeto.
    const chave = hash(JSON.stringify([r.cnpj, doc.url]));
    if (!arquivos.has(chave)) arquivos.set(chave, { arquivo_ref: chave, empresa_ref: hash(r.cnpj || ''),
      url_sha256: hash(doc.url), identidade_valida: valido(r.cnpj), host: new URL(doc.url).hostname,
      estado: 'link_nao_copiado', referencias: [] });
    arquivos.get(chave).referencias.push({ registro_ref: hash(r.id), coluna: doc.coluna, indice: doc.indice,
      obrigacao: doc.obrigacao || 'a_conferir' });
  }
  return { esquema: 1, somente_leitura: true, binarios_copiados: 0, corte_jotform: false,
    aviso: 'Inventário de links reconhecidos; não comprova cobertura de binários, acesso, conteúdo ou hash do arquivo.',
    arquivos: [...arquivos.values()] };
}
function executar(args = process.argv.slice(2)) {
  if (args.length < 4 || args.length > 5 || args.some(a => a.startsWith('--'))) throw Error('Informe anterior, novo, registros CCI, relatório novo e, opcionalmente, vínculos.');
  const bytes = args.slice(0,3).map(p => fs.readFileSync(p));
  const [anterior,nova,atuais] = bytes.map(b => JSON.parse(b));
  const vinculos = args[4] ? JSON.parse(fs.readFileSync(args[4])) : [];
  const result = { ...planejar(anterior,nova,atuais,vinculos), anexos: inventariar(nova),
    entradas_sha256: bytes.map(hash), gerado_em: new Date().toISOString() };
  fs.writeFileSync(args[3], JSON.stringify(result,null,2)+'\n', { flag:'wx', mode:0o600 });
  console.log(JSON.stringify({totais: result.totais, links_distintos_por_empresa: result.anexos.arquivos.length, somente_previa:true}));
}
if (require.main === module) { try { executar(); } catch { console.error('Plano não concluído. Confira snapshots, vínculos, base CCI e caminho de saída. Nenhum dado foi aplicado.'); process.exitCode=1; } }
module.exports = { planejar, inventariar, executar };
