import io
import json
import unittest
from contextlib import nullcontext, redirect_stdout
from unittest.mock import patch, Mock
from smbprotocol.connection import SMB2NegotiateResponse, Dialects, Capabilities
from backup_unas import network_probe


class NetworkProbeTests(unittest.TestCase):
    def test_real_sdk_capability_field_and_read_only_result(self):
        response = SMB2NegotiateResponse()
        # SMB 3.1.1 negotiates encryption via contexts, not this legacy flag.
        response['capabilities'] = 0
        connection = Mock()
        connection.dialect = Dialects.SMB_3_1_1
        connection.server_capabilities = response['capabilities']
        connection.supports_encryption = True
        output = io.StringIO()
        with patch.object(network_probe, 'wireguard_transport', return_value=nullcontext()), \
             patch.object(network_probe, 'Connection', return_value=connection), redirect_stdout(output):
            network_probe.main()
        result = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(result['status'], 'network_reachable')
        self.assertEqual(result['smb_dialect'], '0x311')
        self.assertTrue(result['server_encryption'])
        self.assertFalse(result['authenticated'])
        self.assertEqual(result['files_written'], 0)
        connection.connect.assert_called_once_with(timeout=30)
        connection.disconnect.assert_called_once_with(close=True, timeout=5)
        self.assertEqual([call[0] for call in connection.mock_calls], ['connect', 'disconnect'])
