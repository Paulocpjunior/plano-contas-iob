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
  const novosEventos = (depois.auditoriaLancamentos || []).filter(e => e && !anteriores.some(a => isDeepStrictEqual(a, e)));
  const eventos = novosEventos.filter(e => e.tipo === 'exclusao_lancamento');
  // Substituição de movimento do CFI: UM evento lista as linhas que saem
  // (resumo com id; a linha sem id vai inteira em `completo`).
  const substituidos = novosEventos.filter(e => e.tipo === 'substituicao_movimento_cfi' && Array.isArray(e.lancamentos))
    .flatMap(e => e.lancamentos);
  const autorizado = e => eventos.some(a => isDeepStrictEqual(a.lancamento, e))
    || substituidos.some(s => s && (e.id != null ? s.id != null && String(s.id) === String(e.id) : isDeepStrictEqual(s.completo, e)));
  const semExclusao = removidos.filter(e => !autorizado(e));
  return semExclusao.length
    ? { ok: false, codigo: 'PERDA_LANCAMENTOS_BLOQUEADA', erro: 'O salvamento omitiu ' + semExclusao.length + ' lançamento(s) sem exclusão registrada. Os dados online foram preservados. Reabra a empresa após conferir as alterações pendentes.' }
    : { ok: true };
}
module.exports = { validarPerdaLancamentos };
