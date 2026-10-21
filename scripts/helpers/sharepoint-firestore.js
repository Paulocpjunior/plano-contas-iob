'use strict';

// Banco exclusivamente de teste: transacoes serializadas, rollback atomico e
// mesmas restricoes relevantes de leitura/escrita do adaptador Firestore.
const copiar = value => value === undefined ? undefined : structuredClone(value);
const objeto = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validarDado(value, caminho = 'documento') {
  if (value === undefined) throw Object.assign(new Error('Undefined nao permitido em ' + caminho), { code: 'MOCK_UNDEFINED' });
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new Error('Tipo nao suportado em ' + caminho);
  }
  if (value && typeof value === 'object') {
    for (const [chave, filho] of Object.entries(value)) validarDado(filho, caminho + '.' + chave);
  }
}

function mesclar(anterior, novo) {
  const saida = copiar(anterior || {});
  for (const [chave, value] of Object.entries(novo)) {
    // Firestore merge preserva os demais campos de mapas, mas null substitui.
    saida[chave] = objeto(value) && Object.keys(value).length && objeto(saida[chave])
      ? mesclar(saida[chave], value) : copiar(value);
  }
  return saida;
}

function valorCampo(data, campo) {
  return campo.split('.').reduce((v, k) => v == null ? undefined : v[k], data);
}

class Snapshot {
  constructor(ref, row) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = row !== undefined;
    this._data = row === undefined ? undefined : copiar(row.data);
    this.updateTime = { toMillis: () => row ? row.rev : 0 };
  }
  data() { return copiar(this._data); }
}

class Ref {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').at(-1);
  }
  collection(nome) { return new Query(this.db, this.path + '/' + nome); }
  async get() { return this.db._snapshot(this); }
  async set(data, options) { return this.db.runTransaction(tx => { tx.set(this, data, options); }); }
  async create(data) { return this.db.runTransaction(tx => { tx.create(this, data); }); }
  async update(data) { return this.db.runTransaction(tx => { tx.update(this, data); }); }
  async delete() { return this.db.runTransaction(tx => { tx.delete(this); }); }
}

class Query {
  constructor(db, path, filtros = [], limite = Infinity, ordenacao = []) {
    this.db = db;
    this.path = path;
    this.filtros = filtros;
    this.limite = limite;
    this.ordenacao = ordenacao;
  }
  doc(id) {
    if (typeof id !== 'string' || !id || id.includes('/')) throw new Error('ID de documento invalido no teste');
    return new Ref(this.db, this.path + '/' + id);
  }
  where(campo, operador, valor) {
    return new Query(this.db, this.path, [...this.filtros, [campo, operador, valor]], this.limite, this.ordenacao);
  }
  limit(limite) { return new Query(this.db, this.path, this.filtros, limite, this.ordenacao); }
  orderBy(campo, sentido = 'asc') {
    return new Query(this.db, this.path, this.filtros, this.limite, [...this.ordenacao, [campo, sentido]]);
  }
  startAfter(value) {
    if (this.ordenacao.length !== 1) throw new Error('Cursor de teste exige uma ordenação');
    const [campo, sentido] = this.ordenacao[0];
    return this.where(campo, sentido === 'desc' ? '<' : '>', value);
  }
  async get() { return this.db._query(this); }
}

class Transacao {
  constructor(db) {
    this.db = db;
    this.ops = [];
    this.escreveu = false;
  }
  async get(ref) {
    if (this.escreveu) throw Object.assign(new Error('Leitura depois de escrita na transacao'), { code: 'MOCK_READ_AFTER_WRITE' });
    this.db.leituras.push(ref.path);
    if (this.db.failRead) {
      const erro = await this.db.failRead(ref.path);
      if (erro) throw erro;
    }
    return ref instanceof Query ? this.db._query(ref) : this.db._snapshot(ref);
  }
  async getAll(...refs) { return Promise.all(refs.map(ref => this.get(ref))); }
  _gravar(tipo, ref, data, options) {
    this.escreveu = true;
    if (!(ref instanceof Ref)) throw new Error('Escrita exige referencia de documento');
    if (tipo !== 'delete') validarDado(data);
    this.ops.push({ tipo, path: ref.path, data: copiar(data), options: copiar(options) });
    return this;
  }
  set(ref, data, options) { return this._gravar('set', ref, data, options); }
  create(ref, data) { return this._gravar('create', ref, data); }
  update(ref, data) { return this._gravar('update', ref, data); }
  delete(ref) { return this._gravar('delete', ref); }
}

class SharePointFirestore {
  constructor(dados = {}) {
    this.rows = new Map();
    this.revision = 0;
    this.leituras = [];
    this.commits = [];
    this.failCommit = null;
    this.failRead = null;
    this._fila = Promise.resolve();
    for (const [path, data] of Object.entries(dados)) this.seed(path, data);
  }
  collection(path) { return new Query(this, path); }
  doc(path) { return new Ref(this, path); }
  seed(path, data) {
    validarDado(data);
    this.rows.set(path, { data: copiar(data), rev: ++this.revision });
    return this.doc(path);
  }
  read(path) { return copiar(this.rows.get(path)?.data); }
  list(path) {
    return this._query(this.collection(path)).docs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() }));
  }
  _snapshot(ref) { return new Snapshot(ref, this.rows.get(ref.path)); }
  _query(query) {
    const docs = [...this.rows.keys()]
      .filter(path => path.startsWith(query.path + '/') &&
        path.split('/').length === query.path.split('/').length + 1)
      .sort()
      .map(path => this._snapshot(this.doc(path)))
      .filter(s => query.filtros.every(([campo, operador, valor]) => {
        const atual = campo === '__name__' ? s.id : valorCampo(s.data(), campo);
        switch (operador) {
          case '==': return atual === valor;
          case '!=': return atual !== undefined && atual !== valor;
          case '<': return atual < valor;
          case '<=': return atual <= valor;
          case '>': return atual > valor;
          case '>=': return atual >= valor;
          case 'in': return valor.includes(atual);
          case 'array-contains': return Array.isArray(atual) && atual.includes(valor);
          default: throw new Error('Operador nao implementado: ' + operador);
        }
      }));
    if (query.ordenacao.length) docs.sort((a, b) => {
      for (const [campo, sentido] of query.ordenacao) {
        const va = campo === '__name__' ? a.id : valorCampo(a.data(), campo);
        const vb = campo === '__name__' ? b.id : valorCampo(b.data(), campo);
        if (va !== vb) return (va < vb ? -1 : 1) * (sentido === 'desc' ? -1 : 1);
      }
      return a.id.localeCompare(b.id);
    });
    const limitados = docs.slice(0, query.limite);
    return { docs: limitados, size: limitados.length, empty: !limitados.length };
  }
  async runTransaction(fn) {
    const execucao = this._fila.then(async () => {
      const tx = new Transacao(this);
      const resultado = await fn(tx);
      if (this.failCommit) {
        const e = await this.failCommit(tx.ops);
        if (e) throw e;
      }
      const proximo = new Map(this.rows);
      for (const op of tx.ops) {
        const existente = proximo.get(op.path);
        if (op.tipo === 'create' && existente) throw Object.assign(new Error('Documento ja existe'), { code: 6 });
        if (op.tipo === 'update' && !existente) throw Object.assign(new Error('Documento ausente'), { code: 5 });
        if (op.tipo === 'delete') { proximo.delete(op.path); continue; }
        const data = op.tipo === 'update' || op.options?.merge ? mesclar(existente?.data, op.data) : copiar(op.data);
        validarDado(data);
        proximo.set(op.path, { data, rev: ++this.revision });
      }
      this.rows = proximo;
      this.commits.push(copiar(tx.ops));
      return resultado;
    });
    this._fila = execucao.catch(() => {});
    return execucao;
  }
}

module.exports = { SharePointFirestore };
