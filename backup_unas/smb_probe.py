"""Authenticated, read-only preflight of the two existing UNAS shares."""
import json
import os
from pathlib import Path
from .adapters import SMB
from .core import ReplicaError, require
from .vpn import wireguard_transport


def main():
    stage = 'credentials'
    app = None
    try:
        credentials = json.loads(Path(os.environ['UNAS_CREDENTIALS_FILE']).read_text())
        require(isinstance(credentials, dict) and all(isinstance(credentials.get(k), str)
                and credentials[k] for k in ('username', 'password')), 'CREDENTIALS_FORMAT_INVALID')
        require(credentials['password'] != 'SUBSTITUA_PELA_SENHA_SMB', 'CREDENTIALS_PLACEHOLDER')
        stage = 'wireguard'
        with wireguard_transport():
            for app in ('CCI', 'CFI'):
                stage = 'smb_login'
                target = SMB('10.0.0.215', 'Backup_' + app, '20261021T020039Z-f5774da9',
                             credentials, wireguard=True)
                stage = 'share_permissions'
                target.preflight(ensure_run=False)
                print(json.dumps({'app': app, 'status': 'share_access_confirmed',
                                  'share': 'Backup_' + app, 'authenticated': True,
                                  'encryption_required': True, 'signing_required': True,
                                  'files_written': 0}))
    except Exception as error:
        print(json.dumps({'app': app, 'stage': stage, 'status': 'failed',
                          'code': str(error) if isinstance(error, ReplicaError) else 'SMB_PREFLIGHT_FAILED',
                          'error_type': type(error).__name__, 'files_written': 0}))
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
