'use strict';
// Somente leitura. Nunca consulta URLs presentes nos dados nem altera o Firestore.
// node scripts/conferir-crm-jotform.js <payload-privado.json> <relatorio-novo.json>
const fs = require('fs');
const crypto = require('crypto');
const { isDeepStrictEqual: igual } = require('util');
const digest = v => crypto.createHash('sha256').update(v).digest('hex');
function conferir(payload, registros, manifests) {
  if (!Array.isArray(payload?.fontes) || !payload.fontes.length || !Array.isArray(payload.registros) || !payload.registros.length) throw Error('Payload vazio ou inválido.');
  function mapa(rows) {
    const m = new Map();
    for (const r of rows) {
      if (!r || typeof r.id !== 'string' || !r.id || m.has(r.id)) throw Error('Identificador ausente ou duplicado.');
      m.set(r.id, r);
    }
    return m;
  }
  const fontes = mapa(payload.fontes), origens = mapa(payload.registros), destino = mapa(registros), importacoes = mapa(manifests);
  const contagens = new Map();
  for (const r of origens.values()) {
    const f = fontes.get(r.fonte);
    if (!f || !Array.isArray(r.campos) || r.campos.length !== f.colunas || r.origem_sha256 !== f.sha256) throw Error('Manifesto inconsistente.');
    contagens.set(r.fonte, (contagens.get(r.fonte) || 0) + 1);
  }
  for (const f of fontes.values()) if (contagens.get(f.id) !== f.registros) throw Error('Contagem da origem inconsistente.');
  const divergencias = [], alterados = new Set();
  let campos = 0, edicoes = 0, identificacoes = 0;
  // Relatório sem valores cadastrais, nomes de campos, URLs ou identificadores pessoais.
  const falha = (id, caminho, tipo) => divergencias.push({ referencia_sha256: digest(id), caminho, tipo });
  for (const f of fontes.values()) {
    const d = importacoes.get(f.id);
    if (!d) { falha(f.id, 'manifesto', 'ausente'); continue; }
    for (const k of Object.keys(f)) if (!igual(f[k], d[k])) falha(f.id, 'manifesto.' + k, 'diferente');
  }
  for (const [id, r] of origens) {
    const d = destino.get(id);
    campos += r.campos.length;
    if (!d) { falha(id, 'registro', 'ausente'); continue; }
    for (const k of Object.keys(r).filter(k => !['id', 'campos', 'revisao'].includes(k))) {
      if(k==='cnpj' && Object.hasOwn(d,'cnpj_origem')){
        if(!igual(r[k],d.cnpj_origem))falha(id,'cnpj_origem','diferente');
        if(!(d.revisao>r.revisao)||!d.identificacao_conferida_em||!d.identificacao_conferida_por)falha(id,'cnpj','edicao_sem_metadados');
        identificacoes++;continue;
      }
      if (!igual(r[k], d[k])) falha(id, k, 'diferente');
    }
    if (!Number.isInteger(d.revisao) || d.revisao < r.revisao) falha(id, 'revisao', 'invalida');
    if (!Array.isArray(d.campos) || d.campos.length !== r.campos.length) { falha(id, 'campos', 'quantidade'); continue; }
    r.campos.forEach((c, i) => {
      const atual = d.campos[i];
      if (!atual || typeof atual !== 'object') { falha(id, `campos[${i}]`, 'ausente'); return; }
      for (const k of Object.keys(c).filter(k => k !== 'valor')) {
        if (!igual(c[k], atual[k])) falha(id, `campos[${i}].${k}`, 'diferente');
      }
      if (!igual(c.valor, atual.valor)) {
        edicoes++; alterados.add(id);
        if (!(d.revisao > r.revisao) || !d.atualizado_por_uid || !d.atualizado_em) falha(id, `campos[${i}].valor`, 'edicao_sem_metadados');
      }
    });
  }
  let adicionais = 0;
  for (const [id, d] of destino) if (!origens.has(id)) {
    adicionais++;
    if (fontes.has(d.fonte)) falha(id, 'registro', 'extra_na_fonte');
  }
  return { esquema: 1, somente_leitura: true, escopo: 'Snapshot exportado; não comprova equivalência com o Jotform atual.',
    identificacoes_conferidas_cci: identificacoes, fontes: fontes.size, registros_esperados: origens.size, campos_esperados: campos, registros_lidos: destino.size,
    registros_adicionais: adicionais, campos_editados_cci: edicoes, registros_editados_cci: alterados.size,
    preservacao_origem: divergencias.length ? 'divergente' : 'conferida', divergencias,
    equivalencia_funcional: 'nao_homologada', corte_jotform: false };
}
async function executar(args = process.argv.slice(2)) {
  if (args.length !== 2 || args.some(a => a.startsWith('--'))) throw Error('Informe payload privado e caminho de relatório novo.');
  const bytes = fs.readFileSync(args[0]), payload = JSON.parse(bytes);
  // Falhar antes de acessar a rede se o contrato da origem estiver inválido.
  conferir(payload, payload.registros, payload.fontes);
  const { Firestore } = require('@google-cloud/firestore');
  const db = new Firestore({ projectId: 'gen-lang-client-0569062468' });
  try {
    // Uma transação read-only fornece um snapshot consistente das duas coleções.
    const inicio = Date.now();
    const result = await db.runTransaction(async tx => {
      const registros = await tx.get(db.collection('crm_registros'));
      const manifests = await tx.get(db.collection('crm_importacoes'));
      const rows = s => s.docs.map(d => ({ ...d.data(), id: d.id }));
      return conferir(payload, rows(registros), rows(manifests));
    }, { readOnly: true });
    const relatorio = { ...result, gerado_em: new Date().toISOString(), duracao_ms: Date.now() - inicio, payload_sha256: digest(bytes) };
    fs.writeFileSync(args[1], JSON.stringify(relatorio, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ preservacao_origem: result.preservacao_origem, registros: result.registros_esperados, campos: result.campos_esperados, divergencias: result.divergencias.length, edicoes_cci: result.campos_editados_cci, duracao_ms: relatorio.duracao_ms }));
    if (result.divergencias.length) process.exitCode = 2;
  } finally { await db.terminate(); }
}
if (require.main === module) executar().catch(() => { console.error('Conferência não concluída. Verifique contrato, credencial de leitura e caminho de saída; nenhum dado foi alterado.'); process.exitCode = 1; });
module.exports = { conferir };
