'use strict';

const assert = require('assert');
const Alertas = require('../progressao-alertas');

const avaliacao = {
  cnpj: '00112233000144', codigo_empresa: '0040', razao_social: 'Clínica Mantoan', competencia: '2026-07',
  status: 'parada', etapa_nome: 'Áreas pendentes', percentual: 25, dias_sem_atividade: 7,
  motivo_parada: 'Sem movimento em Fiscal, Folha', proxima_acao: 'Registre os movimentos pendentes.', alerta_devido: true,
  responsavel_principal: { email: 'contador@sp.com' },
  areas: [{ nome: 'Financeiro', esperada: true, total: 20, classificados: 20, concluida: true, iniciada: true }],
  acompanhamento: { alerta_ativo: true, alerta_dias: 5, canais_alerta: { email: true, teams: true }, destinatarios_alerta: ['gestor@sp.com'] }
};

assert.deepStrictEqual(Alertas.destinatarios(avaliacao), ['contador@sp.com', 'gestor@sp.com']);
assert.strictEqual(Alertas.podeEnviar(avaliacao, new Date('2026-08-31T12:00:00Z')), true);
assert(Alertas.mensagem(avaliacao).texto.includes('Sem movimento em Fiscal, Folha'));

(async function () {
  const emails = [];
  const originalFetch = global.fetch;
  global.fetch = async function () { return { ok: true, status: 200 }; };
  const resultado = await Alertas.enviar(avaliacao, {
    remetente: 'cci@sp.com', teamsWebhookUrl: 'https://teams.example/webhook',
    enviarEmail: async function (dados) { emails.push(dados.para); return { ok: true }; }
  });
  global.fetch = originalFetch;
  assert.strictEqual(resultado.ok, true);
  assert.deepStrictEqual(emails, ['contador@sp.com', 'gestor@sp.com']);
  assert.strictEqual(resultado.resultados.filter(r => r.canal === 'teams').length, 1);

  const repetido = JSON.parse(JSON.stringify(avaliacao));
  repetido.acompanhamento.ultimo_alerta_em = '2026-08-30T12:00:00Z';
  assert.strictEqual(Alertas.podeEnviar(repetido, new Date('2026-08-31T12:00:00Z')), false, 'não deve repetir antes da mesma régua');
  console.log('OK: avisos respeitam régua, destinatários, e-mail, Teams e intervalo de reenvio.');
})().catch(function (erro) {
  console.error(erro);
  process.exitCode = 1;
});
