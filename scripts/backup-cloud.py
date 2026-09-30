"""Exportação Firestore em Cloud Run. Não importa, altera ou exclui documentos."""
import datetime as dt
import json
import os
import subprocess
import tempfile
import uuid
import urllib.request
import urllib.parse
from pathlib import Path


def run(*args):
    return subprocess.run(["gcloud", *args, "--quiet"], check=True,
                          text=True, stdout=subprocess.PIPE).stdout


def inventory(raw, prefix):
    objects = [item["metadata"] for item in raw if item.get("type") == "cloud_object"]
    if not objects or not any(o["name"].endswith(".overall_export_metadata") for o in objects):
        raise ValueError("Exportação sem metadados finais do Firestore")
    result = []
    for obj in objects:
        if not obj["name"].startswith(prefix) or not obj.get("crc32c") or not obj.get("generation"):
            raise ValueError("Inventário incompleto ou fora do prefixo da execução")
        result.append({key: obj.get(key) for key in
                       ("name", "generation", "size", "crc32c", "md5Hash", "contentType")})
    if sum(int(o["size"]) for o in result) <= 0:
        raise ValueError("Exportação vazia")
    return result


def notify(app, stamp, status):
    url = os.environ.get("BACKUP_NOTIFICATION_URL", "https://plano-contas-iob-q4woqnee3a-uw.a.run.app/api/internal/backup-notifications")
    # Identidade da conta de serviço; nenhuma senha ou chave persistida.
    identity = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=" + urllib.parse.quote(url, safe="") + "&format=full"
    request = urllib.request.Request(identity, headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(request, timeout=15) as response:
        token = response.read().decode()
    request = urllib.request.Request(url, data=json.dumps({"app": app, "run": stamp, "status": status}).encode(), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read())


def export_backup(stamp, started):
    project, bucket = os.environ["BACKUP_PROJECT"], os.environ["BACKUP_BUCKET"]
    # PITR a minuto inteiro: banco consistente, cinco minutos antes da execução.
    snapshot = (started - dt.timedelta(minutes=5)).replace(second=0, microsecond=0)
    prefix = "daily/" + stamp + "/firestore/"
    destination = "gs://" + bucket + "/" + prefix.rstrip("/")
    run("firestore", "export", destination, "--project=" + project,
        "--database=(default)", "--snapshot-time=" + snapshot.isoformat())
    objects = inventory(json.loads(run("storage", "ls", "--json", destination + "/**")), prefix)
    manifest = {"schema": 1, "application": os.environ["BACKUP_APP"],
                "project": project, "database": "(default)", "run": stamp,
                "startedAt": started.isoformat(), "snapshotTime": snapshot.isoformat(),
                "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "status": "FIRESTORE_EXPORT_COMPLETED", "scope": "Firestore documents",
                "attachmentsIncluded": False, "restoreTested": False,
                "oneDriveConfirmed": False, "nasConfirmed": False,
                "objects": objects, "objectCount": len(objects),
                "bytes": sum(int(o["size"]) for o in objects)}
    with tempfile.TemporaryDirectory() as temp:
        file = Path(temp) / "manifest.json"
        file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        base = "gs://" + bucket + "/daily/" + stamp + "/"
        run("storage", "cp", str(file), base + "manifest.json", "--if-generation-match=0")
        marker = Path(temp) / "EXPORT_COMPLETED.json"
        marker.write_text(json.dumps({"manifest": base + "manifest.json", "status": manifest["status"]}))
        run("storage", "cp", str(marker), base + marker.name, "--if-generation-match=0")
    print(json.dumps({key: manifest[key] for key in
                      ("application", "run", "status", "objectCount", "bytes")}))


def main():
    started = dt.datetime.now(dt.timezone.utc)
    stamp = started.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    try:
        export_backup(stamp, started)
    except Exception:
        try:
            notify(os.environ["BACKUP_APP"], stamp, "failed")
        except Exception:
            print("EMAIL_NOTIFICATION_UNCONFIRMED: failed")
        raise
    try:
        result = notify(os.environ["BACKUP_APP"], stamp, "completed")
        print(json.dumps({"emailNotification": result}))
    except Exception:
        # Exportação já concluída: falha de e-mail não muda o resultado do banco.
        print("EMAIL_NOTIFICATION_UNCONFIRMED: completed")


if __name__ == "__main__":
    main()
