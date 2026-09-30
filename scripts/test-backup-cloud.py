import importlib.util
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('worker', 'scripts/backup-cloud.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class WorkerTests(unittest.TestCase):
    def test_completed_notifies_once(self):
        with patch.dict(worker.os.environ, {'BACKUP_APP': 'CCI'}), patch.object(worker, 'export_backup'), patch.object(worker, 'notify', return_value={'ok': True}) as notify:
            worker.main()
            self.assertEqual(notify.call_args.args[2], 'completed')
            self.assertEqual(notify.call_count, 1)
    def test_export_failure_notifies_failure(self):
        with patch.dict(worker.os.environ, {'BACKUP_APP': 'CFI'}), patch.object(worker, 'export_backup', side_effect=ValueError('export')), patch.object(worker, 'notify') as notify:
            with self.assertRaises(ValueError): worker.main()
            self.assertEqual(notify.call_args.args[2], 'failed')
    def test_email_failure_does_not_invalidate_export(self):
        with patch.dict(worker.os.environ, {'BACKUP_APP': 'CCI'}), patch.object(worker, 'export_backup'), patch.object(worker, 'notify', side_effect=TimeoutError()):
            worker.main()

if __name__ == '__main__': unittest.main()
