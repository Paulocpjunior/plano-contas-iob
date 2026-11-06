"""Read-only Cloud Run probe: WireGuard + SMB negotiation, without login or files."""
import json
import uuid
from smbprotocol.connection import Connection, Dialects
from .vpn import wireguard_transport
from .core import ReplicaError


def main():
    print(json.dumps({'stage': 'wireguard_start'}))
    with wireguard_transport():
        print(json.dumps({'stage': 'smb_negotiate'}))
        connection = Connection(uuid.uuid4(), '127.0.0.1', port=1445, require_signing=True)
        try:
            connection.connect(timeout=30)
            print(json.dumps({'stage': 'smb_negotiated'}))
            if connection.dialect < Dialects.SMB_3_0_0:
                raise RuntimeError('SMB3_REQUIRED')
            encryption = bool(connection.supports_encryption)
            if not encryption:
                raise RuntimeError('SMB_ENCRYPTION_REQUIRED')
            print(json.dumps({'status': 'network_reachable', 'target': '10.0.0.215:445',
                              'smb_dialect': hex(connection.dialect), 'server_encryption': encryption,
                              'authenticated': False, 'files_written': 0}))
        finally:
            connection.disconnect(close=True, timeout=5)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'code': str(error) if isinstance(error, ReplicaError) else 'VPN_OR_SMB_NEGOTIATION_FAILED',
                          'error_type': type(error).__name__,
                          'authenticated': False, 'files_written': 0}))
        raise SystemExit(1) from None
