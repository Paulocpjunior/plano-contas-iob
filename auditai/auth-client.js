(function (root) {
  'use strict';
  const paths = new Set(['/api/auditai/extrair-pdf-contabil', '/api/gemini/generate', '/api/gemini/chat']);
  function sessionError() {
    const error = new Error('Sua sessão precisa ser reconectada. Entre novamente na aba do CCI que abriu o AuditAI e tente novamente aqui. Se ela foi fechada, reabra o AuditAI pelo CCI. O arquivo selecionado foi preservado.');
    error.status = 401;
    return error;
  }
  function createClient(auth, fetchImpl, origin) {
    async function getUser() {
      await auth.authStateReady();
      if (!auth.currentUser) throw sessionError();
      return auth.currentUser;
    }
    async function token(user, forceRefresh) {
      try {
        const value = await user.getIdToken(forceRefresh);
        if (!value || auth.currentUser !== user) throw sessionError();
        return value;
      } catch (_) { throw sessionError(); }
    }
    async function getToken(forceRefresh = false) {
      return token(await getUser(), forceRefresh);
    }
    async function request(input, init) {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, origin);
      if (url.origin !== origin || !paths.has(url.pathname)) return fetchImpl(input, init);
      const user = await getUser();
      // Clone antes da primeira tentativa: mantém PDF, opções e sinal de cancelamento.
      const base = new Request(url, input instanceof Request ? input : undefined);
      const original = new Request(base, init);
      async function send(force) {
        const jwt = await token(user, force);
        const headers = new Headers(original.headers);
        headers.set('Authorization', 'Bearer ' + jwt);
        return fetchImpl(new Request(original.clone(), { headers }));
      }
      let response = await send(false);
      if (response.status === 401) {
        if (auth.currentUser !== user) throw sessionError();
        response = await send(true);
        if (response.status === 401) throw sessionError();
      }
      return response;
    }
    return { getToken, request };
  }
  function authFromCci(host) {
    function resolve() {
      for (const candidate of [host, host.opener, host.parent]) {
        try {
          if (candidate && !candidate.closed && candidate.location.origin === host.location.origin
              && candidate.firebase && candidate.firebase.auth) return candidate.firebase.auth();
        } catch (_) { /* outra origem não pode fornecer a sessão */ }
      }
      throw sessionError();
    }
    return {
      get currentUser() { try { return resolve().currentUser; } catch (_) { return null; } },
      async authStateReady() {
        const auth = resolve();
        if (auth.currentUser) return;
        await new Promise((ok, fail) => {
          let unsubscribe;
          unsubscribe = auth.onAuthStateChanged(() => { if (unsubscribe) unsubscribe(); ok(); }, fail);
        });
      }
    };
  }
  function install(auth = authFromCci(root)) {
    const client = createClient(auth, root.fetch.bind(root), root.location.origin);
    root.__getFirebaseToken = client.getToken;
    root.fetch = client.request;
    return client;
  }
  const api = { createClient, install, authFromCci };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditAiAuth = api;
})(typeof window !== 'undefined' ? window : globalThis);
