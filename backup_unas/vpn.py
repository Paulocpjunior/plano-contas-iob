"""Client WireGuard rootless, limitado ao UNAS; sem gateway ou VPC pagos."""
import os
import selectors
import subprocess
from contextlib import contextmanager
from .core import require


@contextmanager
def wireguard_transport():
    require(os.environ.get('CLOUD_RUN_JOB'), 'CLOUD_RUN_REQUIRED')
    require(os.environ.get('UNAS_WIREGUARD_PROFILE_FILE'), 'WIREGUARD_PROFILE_REQUIRED')
    process = subprocess.Popen(['/usr/local/bin/unas-wireguard'], stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL)
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            require(selector.select(30), 'WIREGUARD_START_TIMEOUT')
            require(process.stdout.readline() == b'WIREGUARD_LOCAL_FORWARD_READY\n'
                    and process.poll() is None, 'WIREGUARD_START_FAILED')
        # Listener readiness does not attest handshake; SMB preflight verifies access.
        yield
        require(process.poll() is None, 'WIREGUARD_PROCESS_FAILED')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
        process.stdout.close()
