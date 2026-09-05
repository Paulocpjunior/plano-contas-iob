(function (root) {
  'use strict';
  const igual = (a, b) =>
    JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
  function ordenar(v) {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, ordenar(v[k])])
      );
    return v;
  }
  function combinar(base, local, remoto) {
    const conflitos = [];
    function merge(b, l, r, caminho) {
      if (igual(l, b)) return r;
      if (igual(r, b) || igual(l, r)) return l;
      if (caminho === 'entries') {
        const listas = [b, l, r];
        if (
          !listas.every(
            (a) =>
              Array.isArray(a) &&
              a.every((e) => e && e.id != null) &&
              new Set(a.map((e) => String(e.id))).size === a.length
          )
        ) {
          conflitos.push('Lançamentos sem identificação única');
          return l;
        }
        const [bm, lm, rm] = listas.map(
          (a) => new Map(a.map((e) => [String(e.id), e]))
        );
        const ids = new Set([...rm.keys(), ...lm.keys()]);
        return [...ids]
          .map((id) =>
            merge(bm.get(id), lm.get(id), rm.get(id), 'lançamento ' + id)
          )
          .filter((e) => e !== undefined);
      }
      // Um lançamento é indivisível: não combinar débito de uma pessoa com crédito de outra.
      if (
        !caminho.startsWith('lançamento ') &&
        [b, l, r].every((v) => v && typeof v === 'object' && !Array.isArray(v))
      ) {
        return Object.fromEntries(
          [
            ...new Set([
              ...Object.keys(b),
              ...Object.keys(l),
              ...Object.keys(r)
            ])
          ].map((k) => [
            k,
            merge(b[k], l[k], r[k], caminho ? caminho + '.' + k : k)
          ])
        );
      }
      conflitos.push(caminho);
      return l;
    }
    const state = merge(base, local, remoto, '');
    return { ok: !conflitos.length, state, conflitos };
  }
  const api = { combinar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CCISessionMerge = api;
})(typeof window !== 'undefined' ? window : globalThis);
