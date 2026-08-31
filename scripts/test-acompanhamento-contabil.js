'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sanitizarAcompanhamento } = require('../acompanhamento-contabil');

const limpo = sanitizarAcompanhamento({
  prazo: '2026-09-15', prioridade: 'alta', impedimento: 'Aguardando documento', observacao: 'Cobrar cliente',
  revisao_status: 'aguardando_revisao', evidencia_titulo: 'Balancete', evidencia_url: 'https://exemplo.com/balancete.pdf',
  areas_esperadas: ['financeiro', 'fiscal', 'folha', 'invalida'], alerta_ativo: true, alerta_dias: 7,
  canais_alerta: { email: true, teams: false }, destinatarios_alerta: ['GESTOR@SP.COM', 'invalido']
});
assert.strictEqual(limpo.prioridade, 'alta');
assert.strictEqual(limpo.revisao_status, 'aguardando_revisao');
assert.strictEqual(limpo.evidencia_url, 'https://exemplo.com/balancete.pdf');
assert.deepStrictEqual(limpo.areas_esperadas, ['financeiro', 'fiscal', 'folha']);
assert.strictEqual(limpo.alerta_dias, 7);
assert.deepStrictEqual(limpo.canais_alerta, { email: true, teams: false });
assert.deepStrictEqual(limpo.destinatarios_alerta, ['gestor@sp.com']);
assert.throws(function () { sanitizarAcompanhamento({ alerta_ativo: true, canais_alerta: {} }); }, /canal de aviso/);
assert.throws(function () { sanitizarAcompanhamento({ evidencia_url: 'javascript:alert(1)' }); }, /HTTPS válida/);
assert.throws(function () { sanitizarAcompanhamento({ prazo: '15\/09\/2026' }); }, /Prazo inválido/);
assert.throws(function () { sanitizarAcompanhamento({ prazo: '2026-02-31' }); }, /Prazo inválido/);
assert.throws(function () { sanitizarAcompanhamento({ revisao_status: 'aprovada', impedimento: 'Ainda bloqueada', observacao: 'Revisado' }); }, /Remova o impedimento/);
assert.throws(function () { sanitizarAcompanhamento({ revisao_status: 'aprovada' }); }, /observação ou evidência/);

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const inicio = server.indexOf("app.put('/api/admin/progressao-contabil/:cnpj/:competencia/acompanhamento'");
const fim = server.indexOf("app.get('/api/layouts-bancarios'", inicio);
assert(inicio > 0 && fim > inicio, 'rota de acompanhamento deve existir');
const rota = server.slice(inicio, fim);
assert(rota.includes('adminRequired'), 'somente gestor administrador pode alterar acompanhamento');
assert(rota.includes("collection('acompanhamento_contabil').doc(competencia)"), 'acompanhamento deve ficar isolado por empresa e competência');
assert(rota.includes("evento: 'acompanhamento_contabil_atualizado'"), 'alteração deve gerar auditoria administrativa');
assert(rota.includes('lote.set(acompanhamentoRef') && rota.includes('lote.create(auditoriaRef'), 'acompanhamento e auditoria devem ser gravados atomicamente');
assert(!rota.includes("collection('sessoes')"), 'acompanhamento não pode gravar nem abrir a sessão de lançamentos');
assert(admin.includes('function abrirAcompanhamentoContabil'), 'edição deve acontecer dentro da Progressão Contábil existente');
assert(admin.includes('Nenhum lançamento será alterado'), 'modal deve declarar a proteção dos lançamentos');
assert(admin.includes('Áreas esperadas nesta competência'), 'modal deve permitir definir Financeiro, Fiscal e Folha esperados');
assert(admin.includes('Enviar avisos devidos'), 'gestor deve poder processar avisos vencidos de modo explícito');
assert(admin.includes('Configuração restrita a administradores'), 'canais de e-mail e Teams devem ficar identificados no componente administrativo');
assert(admin.includes('SOMENTE ADMIN'), 'componente de automação deve sinalizar a restrição de acesso');

const inicioProcessar = server.indexOf("app.post('/api/admin/progressao-contabil/processar-alertas'");
const fimProcessar = server.indexOf("app.post('/api/internal/progressao-contabil/processar-alertas'", inicioProcessar);
assert(inicioProcessar > 0 && fimProcessar > inicioProcessar, 'rota administrativa de envio deve existir');
assert(server.slice(inicioProcessar, fimProcessar).includes('adminRequired'), 'disparo manual dos avisos deve ser exclusivo do ADMIN no backend');

console.log('OK: acompanhamento aprimora a progressão existente com prazo, impedimento, evidência, revisão e auditoria isolada.');
