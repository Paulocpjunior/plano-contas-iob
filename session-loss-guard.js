'use strict';
const { isDeepStrictEqual } = require('node:util');
// Autosave transporta o estado inteiro: ausência de uma partida não é exclusão autorizada.
function validarPerdaLancamentos(antes, depois, resumo, usuario) {
  const atuais = antes.entries || [], novos = depois.entries || [];
  if (!atuais.length) return { ok: true };
  if (!novos.length && resumo && resumo.zerada === true) {
    return usuario && usuario.is_admin === true
      ? { ok: true }
      : { ok: false, codigo: 'ADMIN_REQUIRED', erro: 'Zerar todos os lançamentos é uma operação administrativa.' };
  }
  const ids = new Set(novos.filter(e => e.id != null).map(e => String(e.id)));
  const semId = novos.filter(e => e.id == null).slice();
  const removidos = atuais.filter(e => {
    if (e.id != null) return !ids.has(String(e.id));
    const i = semId.findIndex(n => isDeepStrictEqual(n, e));
    if (i < 0) return true;
    semId.splice(i, 1); return false;
  });
  const anteriores = antes.auditoriaLancamentos || [];
  const eventos = (depois.auditoriaLancamentos || []).filter(e => e.tipo === 'exclusao_lancamento' &&
    !anteriores.some(a => isDeepStrictEqual(a, e)));
  const semExclusao = removidos.filter(e => !eventos.some(a => isDeepStrictEqual(a.lancamento, e)));
  return semExclusao.length
    ? { ok: false, codigo: 'PERDA_LANCAMENTOS_BLOQUEADA', erro: 'O salvamento omitiu ' + semExclusao.length + ' lançamento(s) sem exclusão registrada. Os dados online foram preservados. Reabra a empresa após conferir as alterações pendentes.' }
    : { ok: true };
}
module.exports = { validarPerdaLancamentos };
