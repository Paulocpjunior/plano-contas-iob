"""Homologação explícita em Cloud Run: NAS -> bucket de teste -> dois bancos isolados.

Não exporta Firestore, não exclui recursos, não importa em banco preexistente.
Compara a restauração da cópia NAS com uma restauração independente da origem.
"""
import argparse
import base64
import datetime
import hashlib
import json
import math
import os
import time
import uuid

import google.auth
from google.auth.transport.requests import AuthorizedSession
from google.cloud import firestore, storage

from .vpn import wireguard_transport
from .adapters import GCS, SMB, configuration
from .core import SYSTEMS, RUN, BLOCK, MAX_MANIFEST, encode, require, sha, validate_manifest, verify_receipt, ReplicaError, now


def normalize(value, own_database=None):
    """Representação tipada; não ignora zeros, bytes, referências ou timestamps."""
    if value is None: return ["null"]
    if isinstance(value, bool): return ["bool", value]
    if isinstance(value, int): return ["int", str(value)]
    if isinstance(value, float): return ["float", value.hex() if math.isfinite(value) else str(value)]
    if isinstance(value, str): return ["string", value]
    if isinstance(value, bytes): return ["bytes", base64.b64encode(value).decode()]
    if isinstance(value, datetime.datetime):
        return ["timestamp", value.isoformat(), getattr(value, 'nanosecond', value.microsecond * 1000)]
    if isinstance(value, firestore.GeoPoint): return ["geo", value.latitude, value.longitude]
    if isinstance(value, firestore.DocumentReference):
        path = value._document_path
        if own_database and path.startswith(own_database + '/documents/'):
            path = '<restored-database>' + path[len(own_database):]
        return ["reference", path]
    if isinstance(value, dict): return ["map", [[k, normalize(v, own_database)] for k, v in sorted(value.items())]]
    if isinstance(value, (list, tuple)): return ["array", [normalize(v, own_database) for v in value]]
    raise ReplicaError("RESTORE_UNSUPPORTED_TYPE")


def digest_database(client):
    """Percorre também subcoleções de documentos-pai ausentes; nunca imprime dados."""
    total, digest, collections = 0, hashlib.sha256(), {}
    def walk(parent):
        nonlocal total
        for collection in sorted(parent.collections(), key=lambda c: c.id):
            count = 0
            # list_documents inclui pais ausentes; ordenação determinística por caminho.
            for ref in sorted(collection.list_documents(page_size=200), key=lambda d: d.path):
                snapshot = ref.get()
                if snapshot.exists:
                    data = encode([ref.path, normalize(snapshot.to_dict(), client._database_string)])
                    digest.update(len(data).to_bytes(8, 'big'))
                    digest.update(data)
                    total += 1
                    count += 1
                walk(ref)
            collections[collection.path] = count
    walk(client)
    return {"documents": total, "sha256": digest.hexdigest(), "collections": collections}


def wait_operation(session, operation, timeout=7200):
    deadline = time.monotonic() + timeout
    while not operation.get('done'):
        require(time.monotonic() < deadline, "RESTORE_TIMEOUT")
        time.sleep(10)
        response = session.get('https://firestore.googleapis.com/v1/' + operation['name'], timeout=60)
        response.raise_for_status()
        operation = response.json()
    require('error' not in operation, "RESTORE_OPERATION_FAILED")
    return operation


def import_isolated(session, project, database, uri):
    require(database.startswith('restore-unas-') and database != '(default)', 'ISOLATED_RESTORE_REQUIRED')
    root = f'https://firestore.googleapis.com/v1/projects/{project}/databases'
    created = session.post(root, params={'databaseId': database}, json={
        'locationId': 'southamerica-east1', 'type': 'FIRESTORE_NATIVE',
        'deleteProtectionState': 'DELETE_PROTECTION_ENABLED'}, timeout=60)
    # 409 is fatal: never import into a preexisting database, even with the test prefix.
    created.raise_for_status()
    wait_operation(session, created.json())
    imported = session.post(root + '/' + database + ':importDocuments', json={'inputUriPrefix': uri}, timeout=60)
    imported.raise_for_status()
    result = wait_operation(session, imported.json())
    return result['name']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', required=True, choices=SYSTEMS)
    parser.add_argument('--run', required=True)
    parser.add_argument('--execute-restore', action='store_true')
    args = parser.parse_args()
    require(args.execute_restore and os.environ.get('UNAS_ENABLE_RESTORE_TEST') == 'true', 'RESTORE_TEST_DISABLED')
    require(RUN.fullmatch(args.run), 'INVALID_RUN')
    config, credentials, _, keys = configuration()
    system, prefix = SYSTEMS[args.app], f'daily/{args.run}/'
    staging_bucket = os.environ['UNAS_RESTORE_BUCKET']
    require(staging_bucket not in [s['bucket'] for s in SYSTEMS.values()], 'ISOLATED_BUCKET_REQUIRED')
    source = GCS(system['bucket'])
    raw, metadata = source.metadata_file(prefix+'manifest.json', MAX_MANIFEST)
    marker, _ = source.metadata_file(prefix+'EXPORT_COMPLETED.json', 16384)
    validate_manifest(args.app, args.run, raw, marker)
    envelope = source.receipt(prefix+'UNAS_VERIFIED.json')
    binding = {'application': args.app, 'run': args.run, 'project': system['project'], 'bucket': system['bucket'],
               'manifestSha256': sha(raw), 'manifestGeneration': metadata['generation'], 'markerSha256': sha(marker),
               'destination': {'transport':'smb3-unifi-wireguard','server':config['server'],'share':system['share'],'path':args.run}}
    proof = verify_receipt(envelope, keys, binding)
    nas = SMB(config['server'], system['share'], args.run, credentials, wireguard=True)
    require(nas.read_small('UNAS_VERIFIED.json', MAX_MANIFEST) == encode(envelope), 'NAS_RECEIPT_MISMATCH')
    attempt = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S') + '-' + uuid.uuid4().hex[:8]
    target_prefix = f'unas-restore/{args.app}/{args.run}/{attempt}/'
    bucket = storage.Client().bucket(staging_bucket)
    for f in proof['files']:
        digest, size = hashlib.sha256(), 0
        blob = bucket.blob(target_prefix + f['path'])
        with nas.open(f['path'], 'rb') as reader, blob.open('wb', chunk_size=BLOCK, if_generation_match=0, checksum='crc32c') as writer:
            while True:
                block = reader.read(BLOCK)
                if not block: break
                digest.update(block)
                size += len(block)
                writer.write(block)
        require(size == f['size'] and digest.hexdigest() == f['sha256'], 'RESTORE_READBACK_HASH')
    credentials_gcp, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
    session = AuthorizedSession(credentials_gcp)
    # Both imports are new isolated databases, using the same project as their original.
    baseline_id, nas_id = 'restore-unas-ref-'+attempt, 'restore-unas-nas-'+attempt
    baseline_op = import_isolated(session, system['project'], baseline_id, f"gs://{system['bucket']}/{prefix}firestore")
    nas_op = import_isolated(session, system['project'], nas_id, f'gs://{staging_bucket}/{target_prefix}firestore')
    baseline = digest_database(firestore.Client(project=system['project'], database=baseline_id))
    restored = digest_database(firestore.Client(project=system['project'], database=nas_id))
    require(baseline == restored and baseline['documents'] > 0, 'RESTORE_DATA_MISMATCH')
    # Store per-collection counts only in the private test bucket, never in console logs.
    report = {'schema':1,'app':args.app,'run':args.run,'status':'RESTORE_DATA_VERIFIED','completedAt':now(),
              'manifestSha256':sha(raw),'receiptSha256':sha(encode(envelope)),
              'baselineDatabase':baseline_id,'restoredDatabase':nas_id,'baselineOperation':baseline_op,
              'nasOperation':nas_op,'comparison':baseline,'scope':'document paths and typed values, including subcollections'}
    bucket.blob(target_prefix+'RESTORE_VERIFIED.json').upload_from_string(encode(report), content_type='application/json', if_generation_match=0)
    print(json.dumps({'app':args.app,'run':args.run,'status':report['status'],'report':f'gs://{staging_bucket}/{target_prefix}RESTORE_VERIFIED.json'}))


if __name__ == '__main__':
    try:
        with wireguard_transport():
            main()
    except Exception as error:
        print(json.dumps({'status':'failed','code':str(error) if isinstance(error,ReplicaError) else 'RESTORE_UNCONFIRMED'}))
        raise SystemExit(1) from None
