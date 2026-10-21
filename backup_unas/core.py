"""Núcleo independente dos serviços; memória limitada ao bloco e ao inventário."""
import base64
import hashlib
import hmac
import json
import re
from datetime import datetime, timezone

import google_crc32c

SYSTEMS = {
    "CCI": {"project": "gen-lang-client-0569062468", "bucket": "cci-firestore-backups-292090471177", "share": "Backup_CCI"},
    "CFI": {"project": "consultorfiscalapp", "bucket": "cfi-firestore-backups-631239634290", "share": "Backup_CFI"},
}
RUN = re.compile(r"^\d{8}T\d{6}Z-[a-f0-9]{8}$")
BLOCK = 4 * 1024 * 1024
MAX_MANIFEST = 16 * 1024 * 1024


class ReplicaError(Exception):
    """Código público, sem mensagens de SDK que possam conter segredos."""


def require(condition, code):
    if not condition:
        raise ReplicaError(code)


def now():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_exact(stream, length):
    """Raw SMB may return less than requested due to negotiated packet size."""
    parts, received = [], 0
    while received < length:
        chunk = stream.read(length - received)
        if not chunk:
            break
        parts.append(chunk)
        received += len(chunk)
    return b''.join(parts)


def safe_path(path):
    require(isinstance(path, str) and 0 < len(path) <= 900, "UNSAFE_PATH")
    for part in path.split("/"):
        require(bool(re.fullmatch(r"[A-Za-z0-9_.-]+", part)) and part not in (".", "..")
                and not part.endswith((".", " ")) and len(part) <= 200
                and not re.fullmatch(r"(?i)(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\..*)?", part), "UNSAFE_PATH")
    return path


def validate_manifest(app, run, raw, marker_raw):
    require(app in SYSTEMS and RUN.fullmatch(run), "INVALID_RUN")
    require(len(raw) <= MAX_MANIFEST and len(marker_raw) <= 16384, "METADATA_TOO_LARGE")
    try:
        m, marker = json.loads(raw), json.loads(marker_raw)
    except (ValueError, TypeError):
        raise ReplicaError("INVALID_MANIFEST") from None
    system, prefix = SYSTEMS[app], f"daily/{run}/"
    require(isinstance(m, dict) and isinstance(marker, dict), "INVALID_MANIFEST")
    require(m.get("application") == app and m.get("project") == system["project"]
            and m.get("database") == "(default)" and m.get("run") == run
            and m.get("status") == "FIRESTORE_EXPORT_COMPLETED", "MANIFEST_BINDING")
    require(marker.get("manifest") == f"gs://{system['bucket']}/{prefix}manifest.json"
            and marker.get("status") == m["status"], "MARKER_BINDING")
    objects = m.get("objects")
    require(isinstance(objects, list) and 0 < len(objects) <= 50000, "INVALID_INVENTORY")
    names, total = set(), 0
    for obj in objects:
        require(isinstance(obj, dict) and isinstance(obj.get("name"), str)
                and obj["name"].startswith(prefix + "firestore/"), "OBJECT_PREFIX")
        rel = safe_path(obj["name"][len(prefix):])
        require(rel.casefold() not in names, "DUPLICATE_PATH")
        names.add(rel.casefold())
        require(re.fullmatch(r"[0-9]+", str(obj.get("generation", "")))
                and re.fullmatch(r"[0-9]+", str(obj.get("size", ""))), "INVALID_METADATA")
        try:
            crc = base64.b64decode(obj.get("crc32c", ""), validate=True)
        except (ValueError, TypeError):
            raise ReplicaError("INVALID_CRC32C") from None
        require(len(crc) == 4, "INVALID_CRC32C")
        total += int(obj["size"])
    require("firestore/firestore.overall_export_metadata" in names, "EXPORT_METADATA_MISSING")
    require(m.get("objectCount") == len(objects) and m.get("bytes") == total and total > 0, "INVENTORY_TOTALS")
    return m


def signed_receipt(payload, kid, key):
    require(len(key) >= 32 and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", kid), "SIGNING_CONFIG")
    body = encode(payload)
    return {"algorithm": "HMAC-SHA256", "keyId": kid, "payload": base64.b64encode(body).decode(),
            "signature": hmac.new(key, body, hashlib.sha256).hexdigest()}


def verify_receipt(envelope, keys, expected):
    try:
        require(envelope["algorithm"] == "HMAC-SHA256", "RECEIPT_INVALID")
        key = keys[envelope["keyId"]]
        require(len(key) >= 32, "RECEIPT_INVALID")
        body = base64.b64decode(envelope["payload"], validate=True)
        require(hmac.compare_digest(hmac.new(key, body, hashlib.sha256).hexdigest(), envelope["signature"]), "RECEIPT_INVALID")
        p = json.loads(body)
        require(all(p.get(k) == v for k, v in expected.items()), "RECEIPT_BINDING")
        require(p.get("schema") == 1 and p.get("status") == "UNAS_VERIFIED"
                and p.get("readBack") is True and isinstance(p.get("files"), list), "RECEIPT_INVALID")
        require(len(p["files"]) == p["fileCount"] and sum(f["size"] for f in p["files"]) == p["totalBytes"], "RECEIPT_TOTALS")
        return p
    except (KeyError, TypeError, ValueError):
        raise ReplicaError("RECEIPT_INVALID") from None


class Replicator:
    def __init__(self, source, target, job, destination, key_id, key, keys, block=BLOCK):
        require(0 < block <= BLOCK, "BLOCK_LIMIT")
        self.source, self.target, self.job = source, target, job
        self.destination, self.key_id, self.key, self.keys, self.block = destination, key_id, key, keys, block

    def file(self, obj, rel):
        """Revalida prefixo retomado; nunca trunca nem substitui um arquivo final."""
        safe_path(rel)
        self.job.touch()
        self.source.assert_metadata(obj)
        checkpoint = self.job.checkpoint(rel)
        final = self.target.size(rel)
        part = rel + ".unas-part"
        if final is None:
            require(self.target.size(part) is None or checkpoint.get("owned") is True, "UNOWNED_PARTIAL")
            if not checkpoint:
                self.job.save(rel, {"owned": True, "offset": 0})
            self.target.prepare(part)  # exclusive create when missing; existing partial kept
            offset = self.target.size(part)
            require(offset is not None and 0 <= offset <= int(obj["size"]), "PARTIAL_SIZE")
        else:
            require(final == int(obj["size"]), "DESTINATION_CONFLICT")
            offset = final
        path = rel if final is not None else part
        source_sha, crc, position = hashlib.sha256(), google_crc32c.Checksum(), 0
        # Exclusive SMB writer handle prevents two lease owners writing the same partial.
        with self.target.open(path, "rb" if final is not None else "r+b") as remote:
            for chunk in self.source.chunks(obj, self.block):
                self.job.touch()
                require(0 < len(chunk) <= self.block, "SOURCE_BLOCK")
                source_sha.update(chunk)
                crc.update(chunk)
                overlap = min(len(chunk), max(0, offset - position))
                if overlap:
                    require(read_exact(remote, overlap) == chunk[:overlap], "DESTINATION_CONFLICT")
                if overlap < len(chunk):
                    require(final is None, "DESTINATION_CONFLICT")
                    remainder = memoryview(chunk)[overlap:]
                    while remainder:
                        written = remote.write(remainder)
                        require(written and written <= len(remainder), "SHORT_WRITE")
                        remainder = remainder[written:]
                    remote.flush()
                position += len(chunk)
                self.job.save(rel, {"owned": final is None, "offset": position})
            require(position == int(obj["size"]), "SOURCE_SIZE")
            require(base64.b64encode(crc.digest()).decode() == obj["crc32c"], "SOURCE_CRC32C")
        self.source.assert_metadata(obj)
        digest = source_sha.hexdigest()
        self.read_back(path, position, digest)
        if final is None:
            self.job.touch()
            self.target.commit(part, rel)  # no replace; server-side rename
        self.job.save(rel, {"owned": False, "offset": position, "sha256": digest, "verified": True})
        return {"path": rel, "size": position, "sha256": digest, "generation": str(obj["generation"]), "crc32c": obj["crc32c"]}

    def read_back(self, path, expected_size, expected_hash):
        self.job.touch()
        total, digest = 0, hashlib.sha256()
        with self.target.open(path, "rb") as stream:
            while True:
                self.job.touch()
                chunk = stream.read(self.block)
                if not chunk:
                    break
                total += len(chunk)
                require(total <= expected_size, "READBACK_SIZE")
                digest.update(chunk)
        require(total == expected_size and digest.hexdigest() == expected_hash, "READBACK_HASH")

    def execute(self, app, run):
        system, prefix = SYSTEMS[app], f"daily/{run}/"
        require(self.destination["share"] == system["share"], "DESTINATION_BINDING")
        raw, manifest_obj = self.source.metadata_file(prefix + "manifest.json", MAX_MANIFEST)
        marker, marker_obj = self.source.metadata_file(prefix + "EXPORT_COMPLETED.json", 16384)
        m = validate_manifest(app, run, raw, marker)
        binding = {"application": app, "run": run, "project": system["project"], "bucket": system["bucket"],
                   "manifestSha256": sha(raw), "manifestGeneration": str(manifest_obj["generation"]),
                   "markerSha256": sha(marker), "destination": self.destination}
        self.job.bind(binding)
        receipt_path = prefix + "UNAS_VERIFIED.json"
        prior = self.source.receipt(receipt_path)
        if prior is not None:
            p = verify_receipt(prior, self.keys, binding)
            self.read_back("UNAS_VERIFIED.json", len(encode(prior)), sha(encode(prior)))
            # A prior receipt is historical evidence, not a fresh audit of the NAS.
            self.job.complete(p)
            return prior
        # Missing marker, invalid inventory or changed binding cannot create a run directory.
        self.target.preflight()
        objects = [*m["objects"], manifest_obj, marker_obj]
        files, verified_bytes = [], 0
        for obj in objects:
            self.job.phase("transfer", verified_bytes, len(files), len(objects), sum(int(o["size"]) for o in objects))
            files.append(self.file(obj, obj["name"][len(prefix):]))
            verified_bytes += files[-1]["size"]
        self.job.phase("verify", verified_bytes, len(files), len(objects), verified_bytes)
        # Independent second pass over final names, including already present files.
        for item in files:
            self.read_back(item["path"], item["size"], item["sha256"])
        for obj in objects:
            self.job.touch()
            self.source.assert_metadata(obj)
        actual = self.target.inventory()
        # Receipt files are checked byte-for-byte below; no other extra files allowed.
        require({k: v for k, v in actual.items() if k not in ("UNAS_VERIFIED.json", "UNAS_VERIFIED.json.unas-part")}
                == {f["path"]: f["size"] for f in files}, "DESTINATION_INVENTORY")
        payload = {**binding, "schema": 1, "status": "UNAS_VERIFIED", "verifiedAt": now(), "readBack": True,
                   "files": files, "fileCount": len(files), "totalBytes": verified_bytes,
                   "firestoreObjectCount": m["objectCount"], "firestoreBytes": m["bytes"], "restoreTested": False}
        existing = self.target.read_small("UNAS_VERIFIED.json", MAX_MANIFEST)
        if existing is not None:
            # Recover crash after NAS receipt commit but before GCS publication.
            envelope = json.loads(existing)
            old = verify_receipt(envelope, self.keys, binding)
            require(old["files"] == files, "RECEIPT_BINDING")
            payload = old
        else:
            candidate = self.source.receipt(prefix + "UNAS_VERIFIED.pending.json")
            if candidate is not None:
                old = verify_receipt(candidate, self.keys, binding)
                require(old["files"] == files, "RECEIPT_BINDING")
                payload, envelope = old, candidate
            else:
                envelope = signed_receipt(payload, self.key_id, self.key)
                # Retains exact signed bytes across a crash during NAS receipt writing.
                self.source.publish_receipt(prefix + "UNAS_VERIFIED.pending.json", encode(envelope))
            self.target.put_exclusive("UNAS_VERIFIED.json", encode(envelope))
        self.read_back("UNAS_VERIFIED.json", len(encode(envelope)), sha(encode(envelope)))
        self.job.touch()
        self.source.publish_receipt(receipt_path, encode(envelope))
        self.job.complete(payload)
        return envelope
