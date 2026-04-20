#!/usr/bin/env python3
import shutil, datetime, sys

BACKUP = 'api-adapter.js.pre-safari.' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
shutil.copy('api-adapter.js', BACKUP)
print('[backup]', BACKUP)

with open('api-adapter.js', 'r', encoding='utf-8') as f:
    content = f.read()

OLD = """      const contasPorPlano = {};
      await Promise.all(planos.map(async (p) => {
        const r = await apiFetch(API_BASE + '/api/planos/' + p.id + '/contas');
        contasPorPlano[p.id] = r.ok ? await r.json() : [];
      }));"""

NEW = """      const contasPorPlano = {};
      // Safari-safe: lotes de 3 em paralelo + retry em caso de Load failed
      const LOTE = 3;
      async function fetchContasComRetry(p) {
        for (let t = 1; t <= 3; t++) {
          try {
            const r = await apiFetch(API_BASE + '/api/planos/' + p.id + '/contas');
            if (r.ok) return await r.json();
            if (r.status >= 500 || r.status === 429) {
              await new Promise(res => setTimeout(res, 200 * t));
              continue;
            }
            return [];
          } catch (err) {
            if (t === 3) { console.warn('[API] Falha em contas ' + p.id, err); return []; }
            await new Promise(res => setTimeout(res, 300 * t));
          }
        }
        return [];
      }
      for (let i = 0; i < planos.length; i += LOTE) {
        const chunk = planos.slice(i, i + LOTE);
        const results = await Promise.all(chunk.map(fetchContasComRetry));
        chunk.forEach((p, idx) => { contasPorPlano[p.id] = results[idx]; });
      }"""

count = content.count(OLD)
if count != 1:
    print('FALHA: trecho encontrado', count, 'x'); sys.exit(1)

content = content.replace(OLD, NEW)
with open('api-adapter.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('[ok] adapter com retry aplicado')
