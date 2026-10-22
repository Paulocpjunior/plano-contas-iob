"""Google Cloud e SMB3: credenciais somente em arquivos montados pelo Secret Manager."""
import base64
import hashlib
import ipaddress
import json
import os
import stat
import time
import uuid
from functools import partial
from types import SimpleNamespace
from pathlib import Path

from google.api_core.exceptions import AlreadyExists, NotFound, PreconditionFailed
from google.cloud import firestore, storage
import smbclient

from .core import RUN, SYSTEMS, ReplicaError, require, safe_path, sha, encode, now, read_exact


class GCS:
    def __init__(self, bucket, client=None):
        self.bucket = (client or storage.Client()).bucket(bucket)

    def metadata(self, name):
        blob = self.bucket.blob(name)
        blob.reload(timeout=30)
        return {"name": name, "generation": str(blob.generation), "size": blob.size, "crc32c": blob.crc32c}

    def metadata_file(self, name, limit):
        obj = self.metadata(name)
        require(obj["size"] <= limit, "METADATA_TOO_LARGE")
        blob = self.bucket.blob(name, generation=int(obj["generation"]))
        raw = blob.download_as_bytes(if_generation_match=int(obj["generation"]), checksum="crc32c", timeout=60)
        return raw, obj

    def assert_metadata(self, obj):
        current = self.metadata(obj["name"])
        require(all(str(current[k]) == str(obj[k]) for k in ("generation", "size", "crc32c")), "SOURCE_CHANGED")

    def chunks(self, obj, block):
        blob = self.bucket.blob(obj["name"], generation=int(obj["generation"]))
        # CRC32C is computed over the complete stream by core; ranges lack a full checksum.
        for offset in range(0, int(obj["size"]), block):
            yield blob.download_as_bytes(start=offset, end=min(offset + block, int(obj["size"])) - 1,
                                         if_generation_match=int(obj["generation"]), raw_download=True,
                                         checksum=None, timeout=60, retry=None)

    def runs(self):
        for blob in self.bucket.list_blobs(prefix="daily/", page_size=500):
            parts = blob.name.split("/")
            if len(parts) == 3 and RUN.fullmatch(parts[1]) and parts[2] == "EXPORT_COMPLETED.json":
                yield parts[1]

    def receipt(self, path):
        try:
            raw, _ = self.metadata_file(path, 16 * 1024 * 1024)
            return json.loads(raw)
        except NotFound:
            return None

    def publish_receipt(self, path, data):
        try:
            self.bucket.blob(path).upload_from_string(data, content_type="application/json", if_generation_match=0, timeout=60)
        except PreconditionFailed:
            raw, _ = self.metadata_file(path, 16 * 1024 * 1024)
            require(raw == data, "RECEIPT_CONFLICT")


class Queue:
    def __init__(self, project, database, client=None, clock=time.time):
        require(database and database != "(default)", "ISOLATED_QUEUE_REQUIRED")
        self.db = client or firestore.Client(project=project, database=database)
        self.rows, self.clock = self.db.collection("backup_unas_queue"), clock

    def discover(self, app, run):
        require(app in SYSTEMS and RUN.fullmatch(run), "INVALID_RUN")
        try:
            self.rows.document(app + "-" + run).create({"app": app, "run": run, "state": "pending", "attempts": 0,
                                                       "nextAttempt": 0, "createdAt": now()})
        except AlreadyExists:
            pass

    def candidates(self):
        # Paged stream avoids composite indexes; fairness sorts retry time then app/run.
        rows = [s.to_dict() for s in self.rows.stream()]
        return sorted((r for r in rows if r.get("state") != "verified"), key=lambda r: (r.get("nextAttempt", 0), r["run"], r["app"]))

    def claim(self, app, run):
        ref, token = self.rows.document(app + "-" + run), uuid.uuid4().hex

        @firestore.transactional
        def claim(tx):
            row = ref.get(transaction=tx).to_dict()
            current = self.clock()
            if not row or row.get("state") == "verified" or row.get("leaseUntil", 0) > current or row.get("nextAttempt", 0) > current:
                return None
            attempts = row.get("attempts", 0) + 1
            tx.update(ref, {"state": "transferring", "owner": token, "leaseUntil": current + 300,
                            "lastAttemptAt": now(), "attempts": attempts, "errorCode": None, "phase": "preflight"})
            return Job(ref, token, self, attempts)
        return claim(self.db.transaction())


class Job:
    def __init__(self, ref, owner, queue, attempts):
        self.ref, self.owner, self.queue, self.attempts = ref, owner, queue, attempts
        self.last_touch = 0
        self.deadline = float('inf')

    def update(self, changes, checkpoint=None):
        @firestore.transactional
        def update(tx):
            row = self.ref.get(transaction=tx).to_dict()
            require(row and row.get("owner") == self.owner and row.get("leaseUntil", 0) > self.queue.clock(), "LEASE_LOST")
            tx.update(self.ref, {**changes, "leaseUntil": self.queue.clock() + 300, "updatedAt": now()})
            if checkpoint:
                rel, data = checkpoint
                tx.set(self.ref.collection("files").document(sha(rel.encode())), {**data, "path": rel})
        update(self.queue.db.transaction())
        self.last_touch = self.queue.clock()

    def touch(self):
        # Called before every network operation; bound operation timeouts < lease duration.
        require(time.monotonic() < self.deadline, "BUDGET_EXHAUSTED")
        if self.queue.clock() - self.last_touch >= 15:
            self.update({})

    def bind(self, binding):
        row = self.ref.get().to_dict()
        require(not row.get("binding") or row["binding"] == binding, "QUEUE_BINDING")
        self.update({"binding": binding})

    def checkpoint(self, rel):
        return self.ref.collection("files").document(sha(rel.encode())).get().to_dict() or {}

    def save(self, rel, data):
        self.update({"currentFile": rel, "fileBytes": data["offset"]}, (rel, data))

    def phase(self, phase, done, count, total_count, total):
        self.update({"phase": phase, "verifiedBytes": done, "verifiedFiles": count, "fileCount": total_count, "totalBytes": total})

    def complete(self, payload):
        self.update({"state": "verified", "verifiedAt": payload["verifiedAt"], "verifiedBytes": payload["totalBytes"],
                     "verifiedFiles": payload["fileCount"], "phase": "complete", "errorCode": None})

    def fail(self, code):
        self.update({"state": "failed", "errorCode": code, "nextAttempt": self.queue.clock() + min(86400, 60 * 2 ** min(self.attempts, 10))})
        # Expire only our own lease; never release a replacement worker's lock.
        @firestore.transactional
        def release(tx):
            row = self.ref.get(transaction=tx).to_dict()
            if row.get("owner") == self.owner:
                tx.update(self.ref, {"leaseUntil": 0})
        release(self.queue.db.transaction())


class SMB:
    def __init__(self, server, share, run, credentials, wireguard=False):
        require(ipaddress.ip_address(server).is_private and share in ("Backup_CCI", "Backup_CFI") and RUN.fullmatch(run), "TARGET_CONFIG")
        if wireguard:
            require(server == "10.0.0.215", "TARGET_CONFIG")
        transport_server = "127.0.0.1" if wireguard else server
        self.client = SimpleNamespace(**{name: partial(getattr(smbclient, name), port=1445 if wireguard else 445)
            for name in ("stat", "open_file", "mkdir", "rename", "scandir")})
        self.share = "\\\\" + transport_server + "\\" + share
        self.root = self.share + "\\" + run
        smbclient.ClientConfig(skip_dfs=True, require_secure_negotiate=True)
        session = smbclient.register_session(transport_server, port=1445 if wireguard else 445, username=credentials["username"], password=credentials["password"],
                                            encrypt=True, require_signing=True, connection_timeout=30)
        # smbclient's high-level I/O otherwise waits indefinitely in Connection.receive.
        # Bound the public transport method below the 300 s lease; never resolve symlinks.
        if not getattr(session.connection, '_unas_bounded', False):
            receive = session.connection.receive
            def bounded_receive(request, wait=True, timeout=None, resolve_symlinks=True):
                return receive(request, wait=wait, timeout=min(timeout or 60, 60), resolve_symlinks=False)
            session.connection.receive = bounded_receive
            session.connection._unas_bounded = True

    def path(self, rel):
        safe_path(rel)
        return self.root + "\\" + rel.replace("/", "\\")

    def checked_stat(self, path):
        s = self.client.stat(path, follow_symlinks=False)
        require(not stat.S_ISLNK(s.st_mode) and not (s.st_file_attributes & 0x400), "UNSAFE_REPARSE_POINT")
        return s

    def preflight(self, ensure_run=True):
        require(stat.S_ISDIR(self.checked_stat(self.share).st_mode), "SHARE_MISSING")
        # Request list/add-file/add-subdirectory rights without creating any probe file.
        with self.client.open_file(self.share, mode="rb", buffering=0, file_type="dir", desired_access=0x00000007):
            pass
        if not ensure_run:
            return
        try:
            self.client.mkdir(self.root)
        except FileExistsError:
            pass
        require(stat.S_ISDIR(self.checked_stat(self.root).st_mode), "RUN_PATH_CONFLICT")

    def parents(self, rel):
        path = self.root
        for segment in safe_path(rel).split("/")[:-1]:
            path += "\\" + segment
            try:
                self.client.mkdir(path)
            except FileExistsError:
                pass
            require(stat.S_ISDIR(self.checked_stat(path).st_mode), "UNSAFE_PARENT")

    def size(self, rel):
        try:
            value = self.checked_stat(self.path(rel))
            require(stat.S_ISREG(value.st_mode), "DESTINATION_CONFLICT")
            return value.st_size
        except FileNotFoundError:
            return None

    def open(self, rel, mode):
        self.checked_stat(self.path(rel))
        return self.client.open_file(self.path(rel), mode=mode, buffering=0, share_access="")

    def prepare(self, rel):
        self.parents(rel)
        try:
            with self.client.open_file(self.path(rel), mode="xb", buffering=0, share_access=""):
                pass
        except FileExistsError:
            self.checked_stat(self.path(rel))

    def commit(self, part, final):
        self.checked_stat(self.path(part))
        self.client.rename(self.path(part), self.path(final))  # unlike replace(), never overwrites

    def inventory(self):
        result = {}
        def visit(directory, prefix):
            for item in self.client.scandir(directory):
                rel = safe_path(prefix + item.name)
                s = self.checked_stat(self.path(rel))
                if stat.S_ISDIR(s.st_mode):
                    visit(self.path(rel), rel + "/")
                else:
                    require(stat.S_ISREG(s.st_mode), "UNSAFE_FILE_TYPE")
                    result[rel] = s.st_size
        visit(self.root, "")
        return result

    def read_small(self, rel, limit):
        size = self.size(rel)
        if size is None:
            return None
        require(size <= limit, "METADATA_TOO_LARGE")
        with self.open(rel, "rb") as stream:
            raw = read_exact(stream, size)
            require(len(raw) == size and not stream.read(1), "METADATA_SIZE")
            return raw

    def put_exclusive(self, rel, data):
        # Final receipt created atomically from a deterministic temporary file.
        part = rel + ".unas-part"
        try:
            with self.client.open_file(self.path(part), mode="xb", buffering=0, share_access="") as stream:
                offset = 0
                while offset < len(data):
                    n = stream.write(data[offset:])
                    require(n and n > 0, "SHORT_WRITE")
                    offset += n
                stream.flush()
        except FileExistsError:
            # Append only after verifying the exact signed prefix; never truncate.
            partial = self.read_small(part, 16 * 1024 * 1024)
            require(partial is not None and data.startswith(partial), "RECEIPT_PARTIAL_CONFLICT")
            with self.open(part, "r+b") as stream:
                stream.seek(len(partial))
                offset = len(partial)
                while offset < len(data):
                    n = stream.write(data[offset:])
                    require(n and n > 0, "SHORT_WRITE")
                    offset += n
                stream.flush()
        self.commit(part, rel)


def configuration():
    require(os.environ.get("CLOUD_RUN_JOB"), "CLOUD_RUN_REQUIRED")
    config = json.loads(Path(os.environ["UNAS_CONFIG_FILE"]).read_text())
    require(config.get("approved") is True and config.get("transport") == "smb3-unifi-wireguard"
            and config.get("shares") == {a: s["share"] for a, s in SYSTEMS.items()}, "CONFIG_NOT_APPROVED")
    require(ipaddress.ip_address(config["server"]).is_private, "PRIVATE_TARGET_REQUIRED")
    credentials = json.loads(Path(os.environ["UNAS_CREDENTIALS_FILE"]).read_text())
    keys_raw = json.loads(Path(os.environ["UNAS_RECEIPT_KEYS_FILE"]).read_text())
    keys = {kid: base64.b64decode(key, validate=True) for kid, key in keys_raw.items()}
    kid = os.environ["UNAS_SIGNING_KEY_ID"]
    require(kid in keys and all(len(k) >= 32 for k in keys.values()), "SIGNING_CONFIG")
    return config, credentials, kid, keys
