"""Entrypoint Cloud Run; não contém chamadas de exportação ou exclusão."""
import argparse
import json
import os
import time
from google.auth.transport.requests import Request
from google.oauth2.id_token import fetch_id_token
import requests

from .vpn import wireguard_transport
from .adapters import GCS, Queue, SMB, configuration
from .core import SYSTEMS, Replicator, ReplicaError, require

NOTIFICATION_URL = "https://plano-contas-iob-q4woqnee3a-uw.a.run.app/api/internal/backup-notifications"


def notify_pending(queue):
    if os.environ.get("UNAS_ENABLE_NOTIFICATIONS") != "true":
        return
    for snap in queue.rows.stream():
        row = snap.to_dict()
        state = row.get("state")
        if state not in ("verified", "failed") or row.get("notifiedState") == state:
            continue
        try:
            token = fetch_id_token(Request(), NOTIFICATION_URL)
            response = requests.post(NOTIFICATION_URL, json={"app": row["app"], "run": row["run"],
                "status": "replica_verified" if state == "verified" else "replica_failed"},
                headers={"Authorization": "Bearer " + token}, timeout=45)
            response.raise_for_status()
            # Event endpoint is idempotent; failed sends stay in this durable outbox.
            snap.reference.update({"notifiedState": state}, option=queue.db.write_option(last_update_time=snap.update_time))
        except Exception:
            print(json.dumps({"app": row["app"], "run": row["run"], "notification": "pending"}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--discover-only", action="store_true")
    parser.add_argument("--preflight", action="store_true", help="Confere acesso SMB sem criar pastas ou arquivos")
    parser.add_argument("--app", choices=SYSTEMS)
    parser.add_argument("--run", help="Execução existente para homologação; não cria exportação")
    args = parser.parse_args()
    require(not args.run or args.app, "APP_REQUIRED")
    config, credentials, kid, keys = configuration()
    if args.preflight:
        for app in ([args.app] if args.app else SYSTEMS):
            target = SMB(config["server"], SYSTEMS[app]["share"], args.run or "20000101T000000Z-00000000", credentials, wireguard=True)
            target.preflight(ensure_run=False)
            print(json.dumps({"app": app, "status": "share_access_checked", "dataWritten": False}))
        return
    queue = Queue(os.environ["UNAS_QUEUE_PROJECT"], os.environ["UNAS_QUEUE_DATABASE"])
    sources = {app: GCS(s["bucket"]) for app, s in SYSTEMS.items()}
    for app, source in sources.items():
        if args.app and app != args.app:
            continue
        for run in source.runs():
            if not args.run or args.run == run:
                queue.discover(app, run)
    if args.discover_only:
        print(json.dumps({"status": "discovered"}))
        return
    require(os.environ.get("UNAS_ENABLE_TRANSFERS") == "true", "TRANSFERS_DISABLED")
    deadline = time.monotonic() + int(os.environ.get("UNAS_WORK_SECONDS", "3000"))
    failures = 0
    for row in queue.candidates():
        app, run = row["app"], row["run"]
        if (args.app and args.app != app) or (args.run and args.run != run):
            continue
        if time.monotonic() >= deadline:
            break
        job = queue.claim(app, run)
        if job is None:
            continue
        job.deadline = deadline
        try:
            target = SMB(config["server"], SYSTEMS[app]["share"], run, credentials, wireguard=True)
            destination = {"transport": "smb3-unifi-wireguard", "server": config["server"], "share": SYSTEMS[app]["share"], "path": run}
            replica = Replicator(sources[app], target, job, destination, kid, keys[kid], keys)
            replica.execute(app, run)
            print(json.dumps({"app": app, "run": run, "status": "verified"}))
        except Exception as error:
            failures += 1
            code = str(error) if isinstance(error, ReplicaError) else "TRANSPORT_OR_SERVICE_UNAVAILABLE"
            try:
                job.fail(code)
            except Exception:
                code = "LEASE_OR_QUEUE_UNAVAILABLE"
            print(json.dumps({"app": app, "run": run, "status": "failed", "code": code, "errorType": type(error).__name__}))
    notify_pending(queue)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        with wireguard_transport():
            main()
    except Exception as error:
        # Never serialize SDK exceptions: may include URLs, credentials or document data.
        print(json.dumps({"status": "failed", "code": str(error) if isinstance(error, ReplicaError) else "CONFIG_OR_DISCOVERY_FAILED"}))
        raise SystemExit(1) from None
