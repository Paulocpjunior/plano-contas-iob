"""Carga sintética local; não acessa GCS, Firestore ou UNAS."""
import base64
import os
from pathlib import Path
import tempfile
import tracemalloc
import unittest

import google_crc32c
from backup_unas.core import Replicator
from test_core import Job, KEY


class StreamingMemoryTests(unittest.TestCase):
    def test_96_mib_payload_does_not_accumulate_in_memory(self):
        block_size, count = 1024 * 1024, 96
        block = b'x' * block_size
        crc = google_crc32c.Checksum()
        for _ in range(count): crc.update(block)
        obj = {'name':'synthetic','size':block_size*count,'generation':'1','crc32c':base64.b64encode(crc.digest()).decode()}
        class SyntheticSource:
            def assert_metadata(self, _): pass
            def chunks(self, _, requested):
                self_test.assertEqual(requested, block_size)
                for _ in range(count): yield block
        class TestDisk:
            def __init__(self, root): self.root=Path(root)
            def size(self,p): return (self.root/p).stat().st_size if (self.root/p).exists() else None
            def prepare(self,p): (self.root/p).touch(exist_ok=False)
            def open(self,p,mode): return (self.root/p).open(mode,buffering=0)
            def commit(self,p,f): os.link(self.root/p,self.root/f);(self.root/p).unlink()
        self_test = self
        with tempfile.TemporaryDirectory(prefix='unas-synthetic-test-') as root:
            target = TestDisk(root)
            worker = Replicator(SyntheticSource(),target,Job(),{},'test',KEY,{'test':KEY},block=block_size)
            tracemalloc.start()
            try:
                result = worker.file(obj,'synthetic')
                peak = tracemalloc.get_traced_memory()[1]
            finally: tracemalloc.stop()
            self.assertEqual(result['size'],96*1024*1024)
            self.assertLess(peak,16*1024*1024, f'peak={peak}')


if __name__ == '__main__': unittest.main()
