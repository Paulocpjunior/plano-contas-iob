'use strict';
// Baixa automática da solicitação de documentos pelo SharePoint (v3.4.500).
// Pedido do Paulo (06/11/2026): quando o cliente salva os arquivos na pasta da
// empresa (site Contábil → Clientes → "CNPJ - nome"), a solicitação em aberto
// recebe baixa sozinha, com o nome dos arquivos, e entra na movimentação.
// Lê a biblioteca pelo Delta do Graph (só o que mudou desde a última leitura),
// com o app do CCI que já tem Sites.Selected no site do Contábil.

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ABERTAS = new Set(['enviado', 'whatsapp_aberto']);
const MAX_ARQUIVOS = 10;

/** CNPJ no nome da pasta: "12.345.678/0001-90 - Nome", "12345678000190 Nome" etc. */
function cnpjDoNome(nome) {
  const trechos = String(nome || '').match(/\d[\d.\-/ ]{11,22}\d/g) || [];
  for (const t of trechos) {
    const d = t.replace(/\D/g, '');
    if (d.length === 14) return d;
  }
  return null;
}

function decodificar(t) { try { return decodeURIComponent(t); } catch { return t; } }

/**
 * Caminho dentro da biblioteca. O Graph escreve a raiz de dois jeitos:
 * "/drive/root:" (item raiz, sem parentReference.path) e "/drives/{id}/root:".
 * Quando a pasta configurada é a própria biblioteca (v3.4.502, caso Clientes SP),
 * os dois lados precisam do mesmo formato, senão nenhum arquivo casa.
 */
function relativoDaBiblioteca(caminho) {
  const c = String(caminho || '');
  const m = c.match(/^\/drives?\/(?:[^/]+\/)?root:/i);
  if (!m) return null;
  return decodificar(c.slice(m[0].length)).replace(/\/+$/, '').replace(/^\/*/, '/');
}

/** Primeira pasta abaixo da raiz configurada (a pasta da empresa). */
function pastaDaEmpresa(caminhoPai, raiz) {
  if (!raiz) return null;
  const p = relativoDaBiblioteca(caminhoPai), r = relativoDaBiblioteca(raiz);
  if (p === null || r === null) return null;
  const base = r === '/' ? '' : r;
  if (p !== base && p !== r && !p.startsWith(base + '/')) return null;
  const resto = p.slice(base.length).replace(/^\/+/, '');
  if (!resto) return null; // arquivo solto na raiz: não é de nenhuma empresa
  return resto.split('/')[0];
}

const chaveArquivo = a => String(a.url || '') || String(a.nome || '') + '|' + String(a.quando || a.criado_em || '');

/**
 * arquivos: [{cnpj, nome, url, criado_em}] · abertas: [{id, cnpj, quando, estado, recebida_em, arquivos_recebidos}]
 * Só conta arquivo criado DEPOIS do envio da solicitação e ainda não registrado.
 * v3.4.505 (Paulo, 06/11): arquivo no SharePoint NÃO dá baixa — "quem garante
 * que foi tudo postado?". Vira sinal "conferir"; a baixa é do colaborador.
 */
function baixasPorArquivos({ arquivos = [], abertas = [] }) {
  const out = [];
  for (const s of abertas) {
    if (!ABERTAS.has(s.estado) || s.recebida_em || !s.quando) continue;
    const ja = new Set((Array.isArray(s.arquivos_recebidos) ? s.arquivos_recebidos : []).map(chaveArquivo));
    const novos = arquivos.filter(a => a.cnpj === s.cnpj && a.criado_em && Date.parse(a.criado_em) >= Date.parse(s.quando))
      .map(a => ({ nome: String(a.nome || '').slice(0, 180), url: String(a.url || '').slice(0, 2000), quando: a.criado_em }))
      .filter(a => !ja.has(chaveArquivo(a)))
      .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
    if (!novos.length) continue;
    out.push({ cnpj: s.cnpj, id: s.id, total: novos.length, arquivos: novos.slice(0, MAX_ARQUIVOS) });
  }
  return out;
}

function detalheBaixa(b) {
  const nomes = b.arquivos.map(a => a.nome).join(', ');
  return b.total + ' arquivo(s) na pasta do SharePoint: ' + nomes + (b.total > b.arquivos.length ? ' (mostrando ' + b.arquivos.length + ' de ' + b.total + ')' : '') + '. Confira se chegou tudo antes de dar baixa.';
}

// ── Graph ──────────────────────────────────────────────────────────────────
function criarGraph({ token = () => require('./graph-email-provider').getGraphToken(), renovar = () => require('./graph-email-provider').invalidarTokenGraph(), fetcher = globalThis.fetch } = {}) {
  async function uma(url) {
    let t;
    try { t = await token(); } catch { throw Object.assign(new Error('Não foi possível autenticar no Microsoft 365.'), { status: 503 }); }
    return fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: 'Bearer ' + t } });
  }
  async function get(url) {
    let r = await uma(url);
    if (r.status === 401 || r.status === 403) { try { renovar(); } catch { /* sem cache */ } r = await uma(url); }
    if (r.status === 410) throw Object.assign(new Error('O SharePoint pediu para recomeçar a leitura da biblioteca.'), { status: 410 });
    if (!r.ok) throw Object.assign(new Error(r.status === 401 || r.status === 403 ? 'O app do CCI não tem permissão de leitura nesta biblioteca do SharePoint (Sites.Selected).' : 'O SharePoint respondeu HTTP ' + r.status + '.'), { status: r.status });
    return r.json();
  }
  return { get };
}

// ── Execução (agendador interno) ───────────────────────────────────────────
const CONFIG_DOC = ['crm_solicitacao_config', 'sharepoint'];

function criarBaixaSharepoint({ db, graph = criarGraph(), agora = () => new Date().toISOString(), paginas = 20, consultas = 200, Mov = require('./crm-movimentacao'), S = require('./crm-solicitacao-documentos') }) {
  const cfgRef = db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]);

  async function pastaDe(driveId, parentId, cache, conta) {
    if (cache.has(parentId)) return cache.get(parentId);
    if (conta.n >= consultas) return undefined;
    conta.n++;
    const it = await graph.get(GRAPH + '/drives/' + encodeURIComponent(driveId) + '/items/' + encodeURIComponent(parentId) + '?$select=name,parentReference');
    const caminho = it.parentReference && it.parentReference.path ? it.parentReference.path + '/' + it.name : '/drive/root:';
    cache.set(parentId, caminho);
    return caminho;
  }

  async function darBaixa(b) {
    const ref = db.collection('empresas').doc(b.cnpj).collection('crm_solicitacoes').doc(b.id);
    const statusRef = db.collection('crm_solicitacao_status').doc(b.cnpj);
    return db.runTransaction(async tx => {
      const [d, st] = await Promise.all([tx.get(ref), tx.get(statusRef)]);
      if (!d.exists) return false;
      const r = d.data();
      if (r.recebida_em || !ABERTAS.has(r.estado)) return false;
      // Acumula: o cliente pode complementar depois. Guarda os 10 mais recentes e o total.
      const antes = Array.isArray(r.arquivos_recebidos) ? r.arquivos_recebidos : [];
      const ja = new Set(antes.map(chaveArquivo));
      const novos = b.arquivos.filter(a => !ja.has(chaveArquivo(a)));
      if (!novos.length) return false;
      const quando = agora();
      const marca = { arquivos_recebidos: [...antes, ...novos].slice(-MAX_ARQUIVOS), arquivos_total: (Number(r.arquivos_total) || antes.length) + b.total - (b.arquivos.length - novos.length), arquivos_sharepoint_em: quando, arquivos_sharepoint_primeiro_em: r.arquivos_sharepoint_primeiro_em || quando };
      tx.set(ref, marca, { merge: true });
      const comp = r.competencia ? ' · competência ' + S.competenciaBr(r.competencia) : '';
      Mov.gravar(db, tx, b.cnpj, Mov.movimento({ tipo: 'solicitacao_arquivos', titulo: (r.modelo_nome || 'Solicitação de documentos') + comp, detalhe: detalheBaixa({ ...b, arquivos: novos, total: b.total - (b.arquivos.length - novos.length) }), user: { uid: 'sharepoint', nome: 'Cliente pelo SharePoint' }, quando, origem: 'sharepoint', referencia: b.id }));
      if (st.exists && st.data().solicitacao_id === b.id) tx.set(statusRef, S.resumoSolicitacao(b.id, { ...r, ...marca }));
      return true;
    });
  }

  async function rodar() {
    const snap = await cfgRef.get();
    const cfg = snap.exists ? snap.data() : null;
    if (!cfg || cfg.habilitado !== true || !cfg.drive_id) return { estado: 'desligado' };
    const inicio = agora();
    try {
      if (!cfg.delta_link) {
        // Primeira leitura: marca o ponto de partida sem varrer a biblioteca inteira.
        const r = await graph.get(GRAPH + '/drives/' + encodeURIComponent(cfg.drive_id) + '/root/delta?token=latest');
        await cfgRef.set({ delta_link: r['@odata.deltaLink'] || '', ultima_execucao: inicio, ultimo_resultado: { estado: 'iniciado', detalhe: 'Leitura iniciada. Arquivos salvos a partir de agora aparecem nas solicitações em aberto para conferir.' } }, { merge: true });
        return { estado: 'iniciado' };
      }
      let url = cfg.delta_link, proximo = null, fim = null, n = 0;
      const arquivos = [], cache = new Map(), conta = { n: 0 };
      // Diagnóstico na tela (v3.4.503): o que foi lido e por que não deu baixa.
      const lidos = { total: 0, fora: 0, sem_cnpj: 0, exemplos: [] };
      let parouEm = null;
      while (url && n < paginas && !parouEm) {
        const atual = url;
        const pag = await graph.get(url); n++;
        for (const it of pag.value || []) {
          if (!it.file || it.deleted || !it.parentReference || !it.parentReference.id) continue;
          const caminho = await pastaDe(cfg.drive_id, it.parentReference.id, cache, conta);
          // Limite de consultas da rodada: relê esta página na próxima (a baixa não repete).
          if (caminho === undefined) { parouEm = atual; break; }
          lidos.total++;
          const pasta = pastaDaEmpresa(caminho, cfg.raiz_caminho);
          const cnpj = pasta && cnpjDoNome(pasta);
          if (!pasta) { lidos.fora++; continue; }
          if (!cnpj) { lidos.sem_cnpj++; if (lidos.exemplos.length < 3 && !lidos.exemplos.includes(pasta)) lidos.exemplos.push(pasta.slice(0, 80)); continue; }
          arquivos.push({ cnpj, nome: it.name, url: it.webUrl, criado_em: it.createdDateTime });
        }
        if (parouEm) break;
        if (pag['@odata.nextLink']) { url = pag['@odata.nextLink']; proximo = url; } else { fim = pag['@odata.deltaLink'] || null; url = null; proximo = null; }
      }
      const cnpjs = [...new Set(arquivos.map(a => a.cnpj))];
      const abertas = [];
      for (const c of cnpjs) {
        const s = await db.collection('empresas').doc(c).collection('crm_solicitacoes').get();
        s.docs.forEach(d => abertas.push({ ...d.data(), id: d.id, cnpj: c }));
      }
      let baixas = 0;
      for (const b of baixasPorArquivos({ arquivos, abertas })) if (await darBaixa(b)) baixas++;
      const resultado = { estado: 'ok', arquivos: arquivos.length, empresas: cnpjs.length, baixas, pendente: !!(proximo || parouEm),
        lidos: lidos.total, fora_da_pasta: lidos.fora, sem_cnpj: lidos.sem_cnpj, pastas_sem_cnpj: lidos.exemplos,
        detalhe: baixas + ' solicitação(ões) sinalizada(s) para conferir · ' + arquivos.length + ' arquivo(s) novo(s) em ' + cnpjs.length + ' pasta(s) de empresa'
          + (lidos.total > arquivos.length ? ' · ' + lidos.total + ' arquivo(s) alterado(s) na biblioteca' + (lidos.fora ? ', ' + lidos.fora + ' fora da pasta configurada' : '') + (lidos.sem_cnpj ? ', ' + lidos.sem_cnpj + ' em pasta sem CNPJ de 14 dígitos no nome (ex.: ' + lidos.exemplos.join('; ') + ')' : '') : '')
          + (proximo || parouEm ? ' · ainda há novidades; continuam na próxima rodada' : '') };
      // Só avança o ponto de leitura quando a página inteira foi tratada.
      const link = parouEm || proximo || fim || cfg.delta_link;
      await cfgRef.set({ delta_link: link, ultima_execucao: inicio, ultimo_resultado: resultado }, { merge: true });
      return resultado;
    } catch (e) {
      const recomecar = e && e.status === 410;
      const resultado = { estado: 'falhou', detalhe: (e && e.message) || 'Falha ao ler o SharePoint.' };
      await cfgRef.set({ ...(recomecar ? { delta_link: '' } : {}), ultima_execucao: inicio, ultimo_resultado: resultado }, { merge: true });
      return resultado;
    }
  }
  return { rodar };
}

module.exports = { cnpjDoNome, pastaDaEmpresa, relativoDaBiblioteca, baixasPorArquivos, detalheBaixa, criarGraph, criarBaixaSharepoint, CONFIG_DOC, GRAPH };
