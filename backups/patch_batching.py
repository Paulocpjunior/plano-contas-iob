#!/usr/bin/env python3
import shutil, datetime, sys, os

INDEX = 'index.html'
BACKUP = 'index.html.pre-batching.' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
shutil.copy(INDEX, BACKUP)
print('[backup] ' + BACKUP)

with open(INDEX, 'r', encoding='utf-8') as f:
    content = f.read()

OLD = """            await Promise.all(contas.map(c => window.API.apiFetch('/api/planos/' + planoId + '/contas', {
                method: 'POST',
                body: JSON.stringify({ cod: c.codigo, desc: c.descricao, analitica: true, ref_rfb: c.reduzido || null })
            })));"""

NEW = """            // v4.1: envio em lotes serializados com retry (evita rate limit)
            const LOTE = 20;
            const MAX_RETRY = 3;
            let enviadas = 0, falhas = 0;
            for (let i = 0; i < contas.length; i += LOTE) {
                const chunk = contas.slice(i, i + LOTE);
                const promises = chunk.map(async (c) => {
                    for (let tentativa = 1; tentativa <= MAX_RETRY; tentativa++) {
                        try {
                            const r = await window.API.apiFetch('/api/planos/' + planoId + '/contas', {
                                method: 'POST',
                                body: JSON.stringify({ cod: c.codigo, desc: c.descricao, analitica: true, ref_rfb: c.reduzido || null })
                            });
                            if (r.ok) return true;
                            if (r.status >= 500 || r.status === 429) {
                                await new Promise(res => setTimeout(res, 200 * tentativa));
                                continue;
                            }
                            return false;
                        } catch (err) {
                            if (tentativa === MAX_RETRY) return false;
                            await new Promise(res => setTimeout(res, 200 * tentativa));
                        }
                    }
                    return false;
                });
                const resultados = await Promise.all(promises);
                resultados.forEach(ok => ok ? enviadas++ : falhas++);
                if (typeof showToast === 'function') {
                    showToast('⏳ Enviando contas: ' + enviadas + '/' + contas.length + (falhas ? ' (' + falhas + ' falhas)' : ''), 'success');
                }
                if (i + LOTE < contas.length) await new Promise(res => setTimeout(res, 100));
            }
            if (falhas > 0) throw new Error(enviadas + ' gravadas, ' + falhas + ' falharam. Tente novamente.');"""

count = content.count(OLD)
if count != 1:
    print('FALHA: trecho encontrado ' + str(count) + 'x (esperado 1)')
    sys.exit(1)

content = content.replace(OLD, NEW)
with open(INDEX, 'w', encoding='utf-8') as f:
    f.write(content)
print('[ok] Patch batching+retry aplicado')
