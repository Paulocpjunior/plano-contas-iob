'use strict';
const { normalizarSocios } = require('./reinf-dividendos-utils');
const mesValido = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));
const dadosSocio = s => ({ cpf: s.cpf, nome: s.nome, email: s.email || '', percentual: s.percentual });
const todosSocios = c => [...(c.socios || []), ...(c.sociosInativos || [])];
function mesmoQuadro(a, b) {
  const canon = lista => JSON.stringify((lista || []).map(dadosSocio).sort((x, y) => x.cpf.localeCompare(y.cpf)));
  return canon(a) === canon(b);
}
function sociosNaCompetencia(cadastro, competencia) {
  if (!mesValido(competencia)) throw Error('Informe a competência para consultar o quadro societário.');
  const versoes = cadastro.societarioVersoes || [];
  if (!versoes.length) return (cadastro.socios || []).map(s => ({ ...s }));
  const versao = [...versoes].reverse().find(v => v.inicio <= competencia);
  if (!versao) throw Error('Quadro societário não identificado nesta competência. Confira o histórico cadastral.');
  const saldos = new Map(todosSocios(cadastro).map(s => [s.cpf, s]));
  if (saldos.size !== todosSocios(cadastro).length) throw Error('Há CPF repetido no controle de saldos. Confira o cadastro antes de continuar.');
  return versao.socios.map(s => {
    const saldo = saldos.get(s.cpf);
    if (!saldo || !Number.isSafeInteger(saldo.ataSaldoCentavos)) throw Error('Saldo individual não identificado no histórico societário. Confira o cadastro.');
    return { ...s, ataSaldoCentavos: saldo.ataSaldoCentavos };
  });
}
function prepararAlteracao(cadastro, body, controles, autor, agora) {
  if (!cadastro.controleAtaIndividual) throw Error('Confira e salve os saldos individuais antes de registrar a alteração societária.');
  if (!Number.isSafeInteger(body.ataRevisao) || body.ataRevisao !== Number(cadastro.ataRevisao || 0)) throw Error('O cadastro ou a ATA mudou. Carregue novamente antes de registrar a alteração.');
  const inicio = String(body.competenciaInicio || ''), dataContrato = String(body.dataContrato || ''), motivo = String(body.motivo || '').trim();
  if (!mesValido(inicio)) throw Error('Informe a competência inicial da distribuição no novo quadro societário.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataContrato) || !Number.isFinite(Date.parse(dataContrato)) || new Date(dataContrato).toISOString().slice(0, 10) !== dataContrato || dataContrato.slice(0, 7) > inicio) throw Error('Informe uma data contratual válida, não posterior à competência inicial.');
  if (!motivo || motivo.length > 1000) throw Error('Informe o motivo da alteração societária (até 1.000 caracteres).');
  const versoes = cadastro.societarioVersoes || [];
  if (versoes.length && inicio <= versoes[versoes.length - 1].inicio) throw Error('A nova vigência deve ser posterior à última alteração societária. O histórico não pode ser sobrescrito.');
  const bloqueados = controles.filter(c => !mesValido(c.competencia) || c.competencia >= inicio);
  if (bloqueados.length) throw Error('Há preparação, aceite ou movimento de ATA na vigência pretendida: ' + [...new Set(bloqueados.map(c => c.competencia || 'competência não identificada'))].sort().join(', ') + '. Confira esses registros antes da alteração; nenhum mês será substituído.');
  const validacao = normalizarSocios(body.socios);
  if (!validacao.socios.length || validacao.erros.length) throw Error(validacao.erros.join(' ') || 'Informe o novo quadro societário.');
  const novos = validacao.socios;
  if (mesmoQuadro(cadastro.socios, novos)) throw Error('O quadro societário informado é igual ao cadastro atual.');
  const saldos = new Map(todosSocios(cadastro).map(s => [s.cpf, s]));
  if (saldos.size !== todosSocios(cadastro).length) throw Error('Há CPF repetido no controle de saldos. Confira o cadastro antes de continuar.');
  if (!Number.isSafeInteger(cadastro.ataSaldoCentavos) || [...saldos.values()].some(s => !Number.isSafeInteger(s.ataSaldoCentavos) || s.ataSaldoCentavos < 0) || [...saldos.values()].reduce((a,s) => a+s.ataSaldoCentavos,0) !== cadastro.ataSaldoCentavos) throw Error('Os saldos individuais precisam ser conciliados antes da alteração societária.');
  const cpfs = new Set(novos.map(s => s.cpf));
  if ((cadastro.socios || []).some(s => !cpfs.has(s.cpf) && s.ataSaldoCentavos !== 0)) throw Error('Sócio retirante possui saldo de ATA. A alteração não transfere nem zera esse saldo; confira a destinação antes de prosseguir.');
  const socios = novos.map(s => {
    const anterior = saldos.get(s.cpf);
    const informado = body.socios.find(v => String(v.cpf || v.cpfBenef || '').replace(/\D/g, '') === s.cpf);
    if (!anterior && informado?.ataSaldo !== 0) throw Error('Informe explicitamente saldo ATA zero para o novo sócio. Não há transferência automática entre CPFs.');
    return { ...s, ataSaldoCentavos: anterior ? anterior.ataSaldoCentavos : 0 };
  });
  const sociosInativos = [...saldos.values()].filter(s => !cpfs.has(s.cpf));
  const inicial = versoes.length ? versoes : [{ inicio: '0001-01', legado: true, socios: (cadastro.socios || []).map(dadosSocio) }];
  const versao = { inicio, dataContrato, motivo, socios: socios.map(dadosSocio), registradoEm: agora, porUid: autor.uid };
  return { ...cadastro, socios, sociosInativos, societarioVersoes: [...inicial, versao], ataRevisao: Number(cadastro.ataRevisao || 0) + 1, atualizado_em: agora, atualizado_por_uid: autor.uid };
}
module.exports = { todosSocios, mesmoQuadro, sociosNaCompetencia, prepararAlteracao };
