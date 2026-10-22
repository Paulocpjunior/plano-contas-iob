import io
import stat
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from google.api_core.exceptions import AlreadyExists
from backup_unas.adapters import GCS, Queue, SMB
from backup_unas.core import ReplicaError
from test_core import RUN


class Doc:
    def __init__(self, db, path): self.db, self.path = db, path
    def create(self, value):
        if self.path in self.db.data: raise AlreadyExists('exists')
        self.db.data[self.path] = dict(value)
    def get(self, transaction=None): return SimpleNamespace(to_dict=lambda: self.db.data.get(self.path))
    def collection(self, name): return Collection(self.db, self.path+'/'+name)


class Collection:
    def __init__(self, db, path): self.db, self.path = db, path
    def document(self, name): return Doc(self.db, self.path+'/'+name)
    def stream(self):
        for key in self.db.data:
            if key.startswith(self.path+'/') and key.count('/') == self.path.count('/')+1:
                yield Doc(self.db, key).get()


class DB:
    def __init__(self): self.data = {}
    def collection(self, name): return Collection(self, name)
    def transaction(self): return self
    def update(self, doc, value): self.data[doc.path].update(value)
    def set(self, doc, value): self.data[doc.path] = value


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.time = 1000
        self.db = DB()
        self.q = Queue('test', 'backup-control', client=self.db, clock=lambda: self.time)
        self.patch = patch('backup_unas.adapters.firestore.transactional', lambda f: f)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_all_runs_both_apps_idempotent_discovery(self):
        for app in ('CCI','CFI'):
            for run in (RUN, RUN.replace('21T','20T'), RUN.replace('21T','19T')):
                self.q.discover(app, run)
                self.q.discover(app, run)
        self.assertEqual(len(self.q.candidates()), 6)
        self.assertEqual(self.q.candidates()[0]['run'], RUN.replace('21T','19T'))

    def test_lease_fencing_and_expiry(self):
        self.q.discover('CCI', RUN)
        old = self.q.claim('CCI', RUN)
        self.assertIsNone(self.q.claim('CCI', RUN))
        self.time += 301
        new = self.q.claim('CCI', RUN)
        self.assertNotEqual(new.owner, old.owner)
        with self.assertRaisesRegex(ReplicaError, 'LEASE_LOST'): old.save('file', {'offset':1})
        new.save('file', {'offset':2, 'owned':True})
        self.assertEqual(new.checkpoint('file')['offset'], 2)

    def test_backoff_and_verified_exclusion(self):
        self.q.discover('CFI', RUN)
        job = self.q.claim('CFI', RUN)
        job.fail('READBACK_HASH')
        self.assertIsNone(self.q.claim('CFI', RUN))
        self.time += 121
        job = self.q.claim('CFI', RUN)
        job.complete({'verifiedAt':'2026-10-21T00:00:00Z','totalBytes':10,'fileCount':2})
        self.assertFalse(self.q.candidates())

    def test_no_production_queue(self):
        with self.assertRaisesRegex(ReplicaError, 'ISOLATED_QUEUE_REQUIRED'): Queue('test', '(default)', client=self.db)


class AdapterTests(unittest.TestCase):
    @patch('backup_unas.adapters.smbclient')
    def test_real_sdk_missing_existing_and_denied_statuses(self, smb):
        from smbprotocol.exceptions import SMBOSError, NtStatus
        target = SMB('10.0.0.215','Backup_CFI',RUN,{'username':'test','password':'fixture'})
        for code in (NtStatus.STATUS_OBJECT_NAME_NOT_FOUND, NtStatus.STATUS_OBJECT_PATH_NOT_FOUND):
            smb.stat.side_effect = SMBOSError(code, 'fixture')
            self.assertIsNone(target.size('folder/file'))
        smb.stat.side_effect = SMBOSError(NtStatus.STATUS_ACCESS_DENIED, 'fixture')
        with self.assertRaises(SMBOSError): target.size('folder/file')
        smb.stat.side_effect = None
        smb.stat.return_value = SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0)
        smb.mkdir.side_effect = SMBOSError(NtStatus.STATUS_OBJECT_NAME_COLLISION, 'fixture')
        target.preflight()
        target.parents('folder/file')
        smb.open_file.side_effect = SMBOSError(NtStatus.STATUS_OBJECT_NAME_COLLISION, 'fixture')
        target.prepare('file.unas-part')
        smb.open_file.side_effect = SMBOSError(NtStatus.STATUS_ACCESS_DENIED, 'fixture')
        with self.assertRaises(SMBOSError): target.prepare('file.unas-part')

    def test_directory_preflight_uses_raw_sdk_handle(self):
        import smbclient
        from smbclient._io import SMBDirectoryIO
        directory = SMBDirectoryIO.__new__(SMBDirectoryIO)
        # Real SDK buffering rejects directory handles; raw mode must bypass it.
        directory._mode = 'rb'
        with patch('smbclient._os.SMBDirectoryIO', return_value=directory), \
             patch.object(SMBDirectoryIO, 'open'), \
             patch.object(SMBDirectoryIO, 'close'):
            target = SMB.__new__(SMB)
            target.share = r'\\server\Backup_CCI'
            target.client = SimpleNamespace(open_file=smbclient.open_file)
            target.checked_stat = lambda path: SimpleNamespace(st_mode=stat.S_IFDIR)
            target.preflight(ensure_run=False)

    @patch('backup_unas.adapters.smbclient')
    def test_smb_reads_have_timeout_and_no_symlink_resolution(self, smb):
        original = Mock()
        connection = SimpleNamespace(receive=original)
        smb.register_session.return_value = SimpleNamespace(connection=connection)
        SMB('10.0.0.215','Backup_CFI',RUN,{'username':'test','password':'fixture'})
        connection.receive('request')
        self.assertEqual(original.call_args.kwargs['timeout'],60)
        self.assertFalse(original.call_args.kwargs['resolve_symlinks'])

    @patch('backup_unas.adapters.smbclient')
    def test_wireguard_routes_every_smb_operation_through_loopback(self, smb):
        target = SMB('10.0.0.215','Backup_CFI',RUN,{'username':'test','password':'fixture'}, wireguard=True)
        self.assertEqual(smb.register_session.call_args.args[0], '127.0.0.1')
        self.assertEqual(smb.register_session.call_args.kwargs['port'], 1445)
        self.assertTrue(smb.register_session.call_args.kwargs['encrypt'])
        smb.stat.return_value = SimpleNamespace(st_mode=stat.S_IFREG,st_file_attributes=0,st_size=5)
        target.size('file')
        target.commit('file.unas-part', 'file')
        for call in smb.stat.call_args_list + smb.rename.call_args_list:
            self.assertEqual(call.kwargs['port'], 1445)
            self.assertTrue(call.args[0].startswith('\\\\127.0.0.1\\'))
        with self.assertRaisesRegex(ReplicaError, 'TARGET_CONFIG'):
            SMB('10.0.0.5','Backup_CFI',RUN,{},wireguard=True)

    def test_gcs_ranges_are_pinned_and_bounded(self):
        blob, bucket, client = Mock(), Mock(), Mock()
        blob.download_as_bytes.return_value = b'abcd'
        bucket.blob.return_value = blob
        client.bucket.return_value = bucket
        source = GCS('bucket', client)
        list(source.chunks({'name':'object','generation':'12','size':11},4))
        self.assertEqual([c.kwargs['start'] for c in blob.download_as_bytes.call_args_list],[0,4,8])
        self.assertEqual([c.kwargs['end'] for c in blob.download_as_bytes.call_args_list],[3,7,10])
        for call in blob.download_as_bytes.call_args_list:
            self.assertEqual(call.kwargs['if_generation_match'],12)
            self.assertTrue(call.kwargs['raw_download'])

    def test_gcs_discovers_markers_not_latest_or_pending_receipts(self):
        client = Mock()
        client.bucket.return_value.list_blobs.return_value = [SimpleNamespace(name=n) for n in [
            f'daily/{RUN}/manifest.json',f'daily/{RUN}/UNAS_VERIFIED.pending.json',f'daily/{RUN}/EXPORT_COMPLETED.json',
            f'daily/{RUN.replace("21T","20T")}/EXPORT_COMPLETED.json','daily/invalid/EXPORT_COMPLETED.json']]
        self.assertEqual(len(list(GCS('bucket',client).runs())),2)

    @patch('backup_unas.adapters.smbclient')
    def test_encryption_private_target_and_no_replace(self, smb):
        target = SMB('10.0.0.215','Backup_CFI',RUN,{'username':'test','password':'fixture'})
        self.assertTrue(smb.register_session.call_args.kwargs['encrypt'])
        smb.stat.return_value = SimpleNamespace(st_mode=stat.S_IFREG,st_file_attributes=0,st_size=5)
        target.commit('f.unas-part','f')
        smb.rename.assert_called_once()
        smb.replace.assert_not_called()
        with self.assertRaises(ReplicaError): SMB('8.8.8.8','Backup_CFI',RUN,{})
        with self.assertRaises(ReplicaError): target.path('../outside')

    @patch('backup_unas.adapters.smbclient')
    def test_reparse_point_blocked(self, smb):
        target = SMB('10.0.0.215','Backup_CCI',RUN,{'username':'test','password':'fixture'})
        smb.stat.return_value = SimpleNamespace(st_mode=stat.S_IFREG,st_file_attributes=0x400,st_size=5)
        with self.assertRaisesRegex(ReplicaError,'UNSAFE_REPARSE_POINT'): target.open('file','r+b')
        smb.open_file.assert_not_called()

    @patch('backup_unas.adapters.smbclient')
    def test_preflight_requires_existing_share_and_access(self, smb):
        target = SMB('10.0.0.215','Backup_CCI',RUN,{'username':'test','password':'fixture'})
        smb.stat.side_effect = FileNotFoundError()
        with self.assertRaises(FileNotFoundError): target.preflight()
        smb.mkdir.assert_not_called()


if __name__ == '__main__': unittest.main()
