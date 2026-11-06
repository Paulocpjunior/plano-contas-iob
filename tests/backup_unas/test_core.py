import base64
import hashlib
import io
import json
import unittest
from unittest.mock import patch

import google_crc32c

from backup_unas.core import (SYSTEMS, Replicator, ReplicaError, encode, sha, signed_receipt,
                              validate_manifest, verify_receipt, safe_path)

RUN = "20261021T020039Z-f5774da9"
KEY = b"fixture-only-key-never-use-in-production-0123456789"


def meta(name, data):
    return {"name": name, "size": len(data), "generation": "1234",
            "crc32c": base64.b64encode(google_crc32c.Checksum(data).digest()).decode()}


class Source:
    def __init__(self, app="CCI"):
        self.prefix, self.app = f"daily/{RUN}/", app
        self.data = {self.prefix + "firestore/firestore.overall_export_metadata": b"metadata",
                     self.prefix + "firestore/all_namespaces/all_kinds/output-0": b"0123456789" * 30}
        self.manifest = {"application": app, "project": SYSTEMS[app]["project"], "run": RUN, "database": "(default)",
                         "status": "FIRESTORE_EXPORT_COMPLETED", "objects": [meta(k, v) for k, v in self.data.items()],
                         "objectCount": 2, "bytes": sum(map(len, self.data.values()))}
        self.data[self.prefix + "manifest.json"] = encode(self.manifest)
        self.data[self.prefix + "EXPORT_COMPLETED.json"] = encode({"manifest": f"gs://{SYSTEMS[app]['bucket']}/{self.prefix}manifest.json", "status": self.manifest["status"]})
        self.proofs, self.max_chunk, self.corrupt, self.changed = {}, 0, False, False
        self.publish_fail = False

    def metadata_file(self, name, limit):
        raw = self.data[name]
        return raw, meta(name, raw)

    def assert_metadata(self, obj):
        if self.changed:
            raise ReplicaError("SOURCE_CHANGED")
        assert obj == meta(obj["name"], self.data[obj["name"]])

    def chunks(self, obj, block):
        data = self.data[obj["name"]]
        if self.corrupt:
            data = b"x" + data[1:]
        for pos in range(0, len(data), block):
            chunk = data[pos:pos+block]
            self.max_chunk = max(self.max_chunk, len(chunk))
            yield chunk

    def receipt(self, path):
        return self.proofs.get(path)

    def publish_receipt(self, path, data):
        if self.publish_fail and path.endswith('/UNAS_VERIFIED.json'):
            raise OSError('simulated cloud outage')
        if path in self.proofs:
            assert encode(self.proofs[path]) == data
        self.proofs[path] = json.loads(data)


class Job:
    def __init__(self):
        self.files, self.binding, self.completed, self.updates = {}, None, None, []
        self.lost = False

    def touch(self):
        if self.lost:
            raise ReplicaError("LEASE_LOST")

    def bind(self, binding):
        if self.binding and self.binding != binding:
            raise ReplicaError("QUEUE_BINDING")
        self.binding = binding

    def checkpoint(self, rel):
        return self.files.get(rel, {})

    def save(self, rel, data):
        self.files[rel] = data

    def phase(self, *args):
        self.updates.append(args)

    def complete(self, payload):
        self.completed = payload


class Handle(io.BytesIO):
    def __init__(self, target, name, mode):
        super().__init__(target.files[name])
        self.target, self.name, self.mode = target, name, mode

    def write(self, data):
        if self.target.fail_after is not None and self.target.writes >= self.target.fail_after:
            raise OSError("simulated disconnect")
        self.target.writes += 1
        return super().write(data[:7] if self.target.short else data)

    def read(self, count=-1):
        return super().read(min(count, 7) if self.target.short else count)

    def flush(self):
        if not self.closed:
            self.target.files[self.name] = self.getvalue()

    def close(self):
        self.flush()
        super().close()


class Target:
    def __init__(self):
        self.files, self.writes, self.fail_after, self.short = {}, 0, None, False
        self.offline, self.bad_read, self.receipt_partial = False, False, False

    def preflight(self):
        if self.offline:
            raise OSError("offline")

    def size(self, path):
        return len(self.files[path]) if path in self.files else None

    def open(self, path, mode):
        if self.bad_read and mode == "rb":
            return io.BytesIO(b"corrupt")
        return Handle(self, path, mode)

    def prepare(self, path):
        self.files.setdefault(path, b"")

    def commit(self, part, final):
        if final in self.files:
            raise FileExistsError(final)
        self.files[final] = self.files.pop(part)

    def inventory(self):
        return {p: len(b) for p, b in self.files.items()}

    def read_small(self, path, limit):
        return self.files.get(path)

    def put_exclusive(self, path, data):
        if self.receipt_partial:
            self.files[path + '.unas-part'] = data[:25]
            raise OSError('receipt interrupted')
        if path + '.unas-part' in self.files:
            assert data.startswith(self.files.pop(path + '.unas-part'))
        assert path not in self.files
        self.files[path] = data


class Tests(unittest.TestCase):
    def setup_replica(self, app="CCI"):
        self.s, self.t, self.j = Source(app), Target(), Job()
        self.destination = {"transport": "smb3-unifi-wireguard", "server": "10.0.0.215", "share": SYSTEMS[app]['share'], "path": RUN}
        self.r = Replicator(self.s, self.t, self.j, self.destination, "test", KEY, {"test": KEY}, block=32)

    def setUp(self):
        self.setup_replica()

    def execute(self, app="CCI"):
        return self.r.execute(app, RUN)

    def test_both_destinations_and_authenticated_receipt(self):
        for app in SYSTEMS:
            with self.subTest(app=app):
                self.setup_replica(app)
                proof = self.execute(app)
                payload = verify_receipt(proof, {"test": KEY}, self.j.binding)
                self.assertEqual(payload['fileCount'], 4)
                self.assertEqual(payload['destination']['share'], SYSTEMS[app]['share'])
                self.assertTrue(payload['readBack'])
                self.assertFalse(payload['restoreTested'])
                self.assertLessEqual(self.s.max_chunk, 32)
                self.assertEqual(self.t.files['manifest.json'], self.s.data[self.s.prefix+'manifest.json'])

    def test_resume_after_partial_write_with_new_worker(self):
        self.t.fail_after = 3
        with self.assertRaises(OSError): self.execute()
        before = dict(self.t.files)
        self.assertIsNone(self.j.completed)
        self.t.fail_after = None
        self.r = Replicator(self.s, self.t, self.j, self.destination, "test", KEY, {"test": KEY}, block=32)
        self.execute()
        self.assertIsNotNone(self.j.completed)
        for name, data in before.items():
            self.assertTrue(self.t.files[name.removesuffix('.unas-part')].startswith(data))

    def test_retry_after_nas_outage(self):
        self.t.offline = True
        with self.assertRaises(OSError): self.execute()
        self.assertFalse(self.s.proofs)
        self.t.offline = False
        self.execute()

    def test_duplicate_is_idempotent(self):
        first = self.execute()
        writes = self.t.writes
        self.assertEqual(self.execute(), first)
        self.assertEqual(self.t.writes, writes)

    def test_existing_valid_files_are_not_rewritten(self):
        for path, data in self.s.data.items(): self.t.files[path[len(self.s.prefix):]] = data
        self.execute()
        self.assertEqual(self.t.writes, 0)

    def test_existing_corruption_is_preserved(self):
        path = 'firestore/firestore.overall_export_metadata'
        self.t.files[path] = b'badbytes'
        with self.assertRaisesRegex(ReplicaError, 'DESTINATION_CONFLICT'): self.execute()
        self.assertEqual(self.t.files[path], b'badbytes')
        self.assertFalse(self.s.proofs)

    def test_crc_source_corruption_blocks_proof(self):
        self.s.corrupt = True
        with self.assertRaisesRegex(ReplicaError, 'SOURCE_CRC32C'): self.execute()
        self.assertFalse(self.s.proofs)

    def test_changed_generation_blocks_proof(self):
        self.s.changed = True
        with self.assertRaisesRegex(ReplicaError, 'SOURCE_CHANGED'): self.execute()

    def test_corrupt_readback_blocks_proof(self):
        self.t.bad_read = True
        with self.assertRaisesRegex(ReplicaError, 'READBACK'): self.execute()
        self.assertFalse(self.s.proofs)

    def test_extra_file_blocks_proof(self):
        self.t.files['unexpected'] = b'preserve'
        with self.assertRaisesRegex(ReplicaError, 'DESTINATION_INVENTORY'): self.execute()
        self.assertEqual(self.t.files['unexpected'], b'preserve')

    def test_short_writes(self):
        self.t.short = True
        self.execute()

    def test_short_reads_on_resume_and_existing_files(self):
        self.t.short = True
        self.t.fail_after = 3
        with self.assertRaises(OSError): self.execute()
        self.t.fail_after = None
        self.execute()

    def test_lost_lease_stops_before_writes(self):
        self.j.lost = True
        with self.assertRaisesRegex(ReplicaError, 'LEASE_LOST'): self.execute()
        self.assertFalse(self.t.files)

    def test_wrong_share(self):
        self.destination['share'] = 'Backup_CFI'
        with self.assertRaisesRegex(ReplicaError, 'DESTINATION_BINDING'): self.execute()

    def test_unowned_partial(self):
        self.t.files['firestore/firestore.overall_export_metadata.unas-part'] = b'meta'
        with self.assertRaisesRegex(ReplicaError, 'UNOWNED_PARTIAL'): self.execute()

    def test_crash_after_nas_receipt_before_cloud_publication(self):
        self.s.publish_fail = True
        with self.assertRaises(OSError): self.execute()
        proof = self.t.files['UNAS_VERIFIED.json']
        self.assertIsNone(self.j.completed)
        self.s.publish_fail = False
        self.execute()
        self.assertEqual(self.t.files['UNAS_VERIFIED.json'], proof)

    def test_crash_during_receipt_write_resumes_identical_bytes(self):
        self.t.receipt_partial = True
        with self.assertRaises(OSError): self.execute()
        pending = self.s.proofs[self.s.prefix+'UNAS_VERIFIED.pending.json']
        self.t.receipt_partial = False
        self.execute()
        self.assertEqual(encode(pending), self.t.files['UNAS_VERIFIED.json'])

    def test_forged_or_replayed_proof(self):
        proof = self.execute()
        with self.assertRaises(ReplicaError): verify_receipt(proof, {'test': b'x'*32}, self.j.binding)
        with self.assertRaises(ReplicaError): verify_receipt(proof, {'test': KEY}, {**self.j.binding, 'application': 'CFI'})
        proof['signature'] = '0'*64
        with self.assertRaises(ReplicaError): verify_receipt(proof, {'test': KEY}, self.j.binding)

    def test_manifest_traversal_duplicates_totals_and_marker(self):
        raw, marker = self.s.data[self.s.prefix+'manifest.json'], self.s.data[self.s.prefix+'EXPORT_COMPLETED.json']
        for name in ['../x', '/etc/passwd', 'firestore/a\\b', 'firestore/CON', 'firestore/a:', 'firestore/a/../b']:
            with self.subTest(name=name), self.assertRaises(ReplicaError): safe_path(name)
        for change in ['duplicate', 'bytes', 'project']:
            m = json.loads(raw)
            if change == 'duplicate': m['objects'].append(m['objects'][0])
            elif change == 'bytes': m['bytes'] += 1
            else: m['project'] = 'other'
            with self.assertRaises(ReplicaError): validate_manifest('CCI', RUN, encode(m), marker)
        with self.assertRaises(ReplicaError): validate_manifest('CCI', RUN, raw, b'{}')


if __name__ == '__main__': unittest.main()
