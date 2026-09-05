'use strict';
class MemoryFirestore {
  constructor() {
    this.rows = new Map();
    this.revision = 0;
    this.failCommit = null;
  }
  collection(path) {
    return new Query(this, path);
  }
  batch() {
    return new Batch(this);
  }
  async runTransaction(fn) {
    const tx = new Batch(this);
    const r = await fn(tx);
    await tx.commit();
    return r;
  }
  async getAll(...refs) {
    return Promise.all(refs.map((r) => r.get()));
  }
}
class Ref {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }
  collection(name) {
    return new Query(this.db, this.path + '/' + name);
  }
  async get() {
    const row = this.db.rows.get(this.path);
    const rev = row && row.rev;
    return {
      ref: this,
      id: this.id,
      exists: !!row,
      data: () => row && structuredClone(row.data),
      updateTime: {
        isEqual: (o) => o && o.rev === rev,
        rev,
        toMillis: () => rev
      }
    };
  }
  async set(data, opts) {
    const b = new Batch(this.db);
    b.set(this, data, opts);
    await b.commit();
  }
  async create(data) { const b = new Batch(this.db); b.create(this, data); await b.commit(); }
  async update(data) {
    return this.set(data, { merge: true });
  }
  async delete() {
    const b = new Batch(this.db);
    b.delete(this);
    await b.commit();
  }
}
class Query {
  constructor(db, path, filters = []) {
    this.db = db;
    this.path = path;
    this.filters = filters;
  }
  doc(id) {
    return new Ref(
      this.db,
      this.path + '/' + (id || require('crypto').randomUUID())
    );
  }
  where(k, op, v) {
    return new Query(this.db, this.path, [...this.filters, [k, op, v]]);
  }
  orderBy() {
    return this;
  }
  limit() {
    return this;
  }
  async add(data) {
    const r = this.doc();
    await r.set(data);
    return r;
  }
  async get() {
    const docs = [];
    for (const path of this.db.rows.keys())
      if (
        path.startsWith(this.path + '/') &&
        path.split('/').length === this.path.split('/').length + 1
      ) {
        const snap = await new Ref(this.db, path).get();
        const d = snap.data();
        if (
          this.filters.every(([k, op, v]) =>
            op === 'array-contains'
              ? (d[k] || []).includes(v)
              : op === '<'
                ? d[k] < v
                : d[k] === v
          )
        )
          docs.push(snap);
      }
    return { docs, size: docs.length, empty: !docs.length };
  }
}
class Batch {
  constructor(db) {
    this.db = db;
    this.ops = [];
  }
  get(ref) {
    return ref.get();
  }
  getAll(...refs) {
    return Promise.all(refs.map((r) => r.get()));
  }
  set(ref, data, opts) {
    this.ops.push(['set', ref, data, opts]);
    return this;
  }
  update(ref, data) {
    return this.set(ref, data, { merge: true });
  }
  create(ref, data) {
    this.ops.push(['create', ref, data]);
    return this;
  }
  delete(ref) {
    this.ops.push(['delete', ref]);
    return this;
  }
  async commit() {
    if (this.db.failCommit && this.db.failCommit(this.ops))
      throw Error('falha injetada');
    const next = new Map(this.db.rows);
    for (const [op, r, d, opts] of this.ops) {
      if (op === 'delete') {
        next.delete(r.path);
        continue;
      }
      if (op === 'create' && next.has(r.path)) throw Error('already exists');
      const data =
        opts && opts.merge ? { ...(next.get(r.path) || {}).data } : {};
      for (const [k, v] of Object.entries(d)) {
        if (v && v.__delete) delete data[k];
        else if (v && v.__arrayUnion)
          data[k] = [...new Set([...(data[k] || []), ...v.values])];
        else data[k] = structuredClone(v);
      }
      next.set(r.path, { data, rev: ++this.db.revision });
    }
    this.db.rows = next;
  }
}
const FieldValue = {
  delete: () => ({ __delete: true }),
  arrayUnion: (...values) => ({ __arrayUnion: true, values })
};
module.exports = { MemoryFirestore, FieldValue };
