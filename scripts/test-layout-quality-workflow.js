'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  criarGovernancaRejeicao,
  prepararAtualizacao,
  resumirSla
} = require('../layout-quality-workflow');

const inicio = new Date('2026-08-29T12:00:00Z');
const governanca = criarGovernancaRejeicao({ categoria_erro: 'total_oficial_divergente', criado_em: inicio });
assert.strictEqual(governanca.prioridade, 'critica');
assert.strictEqual(governanca.sla_horas, 8);
assert.strictEqual(governanca.sla_limite_em.toISOString(), '2026-08-29T20:00:00.000Z');

const rejeicao = {
  banco: '001',
  parser: 'parsearPDF_BB_ContaAtual',
  categoria_erro: 'total_oficial_divergente',
  status: 'pendente_parametrizacao',
  criado_em: inicio
};
assert.throws(
  () => prepararAtualizacao(rejeicao, { status: 'em_parametrizacao' }, {}),
  /responsavel_email obrigatorio/
);

const contexto = {
  ator_uid: 'admin-1',
  ator_email: 'admin@empresa.com.br',
  versao_publicada: '3.4.207',
  agora: new Date('2026-08-29T18:00:00Z'),
  evidencia: {
    id: 'bb-real', banco: '001', parser: 'parsearPDF_BB_ContaAtual',
    etapa: 'regressao_aprovada', status: 'Regressao aprovada'
  }
};
assert.throws(
  () => prepararAtualizacao(rejeicao, {
    status: 'resolvido', responsavel_email: 'dono@empresa.com.br',
    versao_correcao: '3.4.206', evidencia_id: 'bb-real'
  }, contexto),
  /versao atualmente publicada/
);
assert.throws(
  () => prepararAtualizacao(rejeicao, {
    status: 'resolvido', responsavel_email: 'dono@empresa.com.br',
    versao_correcao: '3.4.207', evidencia_id: 'outra'
  }, { ...contexto, evidencia: { ...contexto.evidencia, parser: 'parserErrado' } }),
  /evidencia de regressao aprovada/
);
const resolvida = prepararAtualizacao(rejeicao, {
  status: 'resolvido', responsavel_email: 'dono@empresa.com.br',
  versao_correcao: '3.4.207', evidencia_id: 'bb-real',
  observacao_admin: 'Totais conferidos no arquivo real.'
}, contexto);
assert.strictEqual(resolvida.status, 'resolvido');
assert.strictEqual(resolvida.versao_correcao, '3.4.207');
assert.strictEqual(resolvida.evidencia_id, 'bb-real');
assert.strictEqual(resolvida.resolvido_por_email, 'admin@empresa.com.br');

const evidenciaGenerica = {
  id: 'conciliado-real', banco: 'GEN', parser: 'parsearArquivoXLSXExtratoConciliado',
  arquivo: 'EXTRATO ITAU-FLANACAR 042026.xlsx', etapa: 'regressao_aprovada', status: 'Regressao aprovada'
};
const rejeicaoGenerica = {
  ...rejeicao, banco: '341', parser: '', arquivo: 'EXTRATO ITAU-FLANACAR 042026.xlsx'
};
assert.strictEqual(prepararAtualizacao(rejeicaoGenerica, {
  status: 'resolvido', responsavel_email: 'dono@empresa.com.br',
  versao_correcao: '3.4.207', evidencia_id: 'conciliado-real'
}, { ...contexto, evidencia: evidenciaGenerica }).status, 'resolvido');
assert.throws(() => prepararAtualizacao({ ...rejeicaoGenerica, arquivo: 'outro.xlsx' }, {
  status: 'resolvido', responsavel_email: 'dono@empresa.com.br',
  versao_correcao: '3.4.207', evidencia_id: 'conciliado-real'
}, { ...contexto, evidencia: evidenciaGenerica }), /evidencia de regressao aprovada/, 'evidencia generica nao pode resolver outro arquivo');

assert.strictEqual(resumirSla({ ...rejeicao, sla_limite_em: governanca.sla_limite_em }, new Date('2026-08-29T21:00:00Z')).vencido, true);
assert.strictEqual(resumirSla({ ...rejeicao, status: 'resolvido', sla_limite_em: governanca.sla_limite_em }, new Date('2026-08-29T21:00:00Z')).vencido, false);

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
assert(server.includes('homologacao_versao = lerVersao().version'));
assert(server.includes('homologacao_evidencias_ids = avaliacaoAprovacao.evidencias_ids'));
assert(server.includes('versao_publicada: lerVersao().version'));
assert(server.includes("if (e.tipo !== 'sucesso') return;"), 'evento administrativo não pode inflar sucesso de importação');
assert(admin.includes("tratarRejeicao('${escapeHtml(r.id)}','resolvido')"));
assert(admin.includes('Não existe evidência de regressão aprovada compatível'));

console.log('OK: fila de layouts exige responsável, SLA, versão publicada e evidência real de regressão.');
