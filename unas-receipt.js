'use strict';
const crypto = require('crypto');
const fs = require('fs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SHARES = {CCI: 'Backup_CCI', CFI: 'Backup_CFI'};
const ERRORS = {
  SOURCE_CHANGED: 'A origem mudou em relação ao inventário.', SOURCE_CRC32C: 'CRC32C da origem divergente.',
  SOURCE_SIZE: 'Tamanho da origem divergente.', DESTINATION_CONFLICT: 'Arquivo existente divergente; preservado para investigação.',
  READBACK_HASH: 'SHA-256 divergente na releitura do UNAS.', READBACK_SIZE: 'Tamanho divergente na releitura do UNAS.',
  DESTINATION_INVENTORY: 'Quantidade ou caminhos divergentes no destino.', UNOWNED_PARTIAL: 'Arquivo parcial sem vínculo com esta execução.',
  LEASE_LOST: 'Transferência interrompida; aguardando nova tentativa.', BUDGET_EXHAUSTED: 'Janela da execução encerrada; retomada pendente.',
  TRANSPORT_OR_SERVICE_UNAVAILABLE: 'UNAS, rede, permissões ou serviço de nuvem indisponível.',
  LEASE_OR_QUEUE_UNAVAILABLE: 'Não foi possível atualizar a fila; confirmação pendente.',
  RECEIPT_INVALID: 'Comprovante inválido ou chave de verificação indisponível.', RECEIPT_BINDING: 'Comprovante não corresponde a esta cópia.',
  RECEIPT_MISSING: 'Fila indica conclusão, mas o comprovante não foi encontrado.', QUEUE_UNAVAILABLE: 'Consulta da fila indisponível.',
  STATUS_UNAVAILABLE: 'Não foi possível conferir o comprovante.', QUEUE_BINDING: 'Origem ou destino mudou; revisão necessária.',
};
function errorMessage(code) { return ERRORS[code] || (code ? 'Falha na replicação; consulte o registro técnico protegido.' : null); }
function keysFromFile(file = process.env.UNAS_RECEIPT_KEYS_FILE) {
  if (!file) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(raw).map(([id, key]) => [id, Buffer.from(key, 'base64')]));
}
function check(ok, code = 'RECEIPT_INVALID') { if (!ok) throw new Error(code); }
function verify(envelope, {app, run, system, manifest, manifestRaw, manifestGeneration, markerRaw, keys, server}) {
  check(envelope && envelope.algorithm === 'HMAC-SHA256' && typeof envelope.payload === 'string' && envelope.payload.length < 24 * 1024 * 1024);
  const key = keys[envelope.keyId];
  check(Buffer.isBuffer(key) && key.length >= 32 && /^[a-f0-9]{64}$/.test(envelope.signature || ''));
  const raw = Buffer.from(envelope.payload, 'base64');
  const expected = crypto.createHmac('sha256', key).update(raw).digest();
  check(crypto.timingSafeEqual(expected, Buffer.from(envelope.signature, 'hex')));
  const p = JSON.parse(raw.toString('utf8'));
  check(p.schema === 1 && p.status === 'UNAS_VERIFIED' && p.readBack === true);
  check(p.application === app && p.run === run && p.project === system.project && p.bucket === system.bucket &&
    p.manifestSha256 === hash(manifestRaw) && p.manifestGeneration === String(manifestGeneration) && p.markerSha256 === hash(markerRaw), 'RECEIPT_BINDING');
  check(server && p.destination?.server === server && p.destination?.share === SHARES[app] &&
    p.destination?.path === run && p.destination?.transport === 'smb3-vpn', 'RECEIPT_BINDING');
  const timestamp = Date.parse(p.verifiedAt);
  check(Number.isFinite(timestamp) && timestamp <= Date.now() + 300000);
  check(Array.isArray(p.files) && p.files.length === manifest.objects.length + 2 && p.fileCount === p.files.length);
  const names = new Set();
  for (const f of p.files) {
    check(typeof f.path === 'string' && !names.has(f.path) && Number.isSafeInteger(f.size) && f.size >= 0 && /^[a-f0-9]{64}$/.test(f.sha256));
    names.add(f.path);
  }
  const map = new Map(p.files.map(f => [f.path, f]));
  for (const o of manifest.objects) {
    check(o.name.startsWith('daily/' + run + '/firestore/'), 'RECEIPT_BINDING');
    const f = map.get(o.name.slice(('daily/' + run + '/').length));
    check(f && f.size === Number(o.size) && f.generation === String(o.generation) && f.crc32c === o.crc32c, 'RECEIPT_BINDING');
  }
  check(map.get('manifest.json')?.sha256 === hash(manifestRaw) && map.get('manifest.json')?.size === Buffer.byteLength(manifestRaw) &&
    map.get('EXPORT_COMPLETED.json')?.sha256 === hash(markerRaw) && map.get('EXPORT_COMPLETED.json')?.size === Buffer.byteLength(markerRaw));
  check(p.totalBytes === p.files.reduce((n, f) => n + f.size, 0) && p.firestoreBytes === manifest.bytes && p.firestoreObjectCount === manifest.objectCount);
  return p;
}
function queueState(row = {}, now = Date.now()) {
  const active = row.state === 'transferring' && Number(row.leaseUntil) * 1000 > now;
  const expired = row.state === 'transferring' && !active;
  const state = active ? 'transferring' : (row.state === 'failed' || expired ? 'failed' : 'pending');
  const errorCode = expired ? 'LEASE_LOST' : row.errorCode || null;
  return {state, lastAttemptAt: row.lastAttemptAt || null, attempts: Number(row.attempts) || 0,
    progress: {bytes: Number(row.verifiedBytes) || 0, totalBytes: Number(row.totalBytes) || 0,
      files: Number(row.verifiedFiles) || 0, fileCount: Number(row.fileCount) || 0, currentFileBytes: Number(row.fileBytes) || 0},
    phase: row.phase || null, errorCode, error: errorMessage(errorCode), verifiedAt: null};
}
module.exports = {verify, keysFromFile, queueState, hash, errorMessage};
