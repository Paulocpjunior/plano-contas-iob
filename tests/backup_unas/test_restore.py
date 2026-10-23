import datetime
import unittest
from unittest.mock import Mock
from backup_unas.restore_test import normalize, import_isolated, digest_database
from backup_unas.core import ReplicaError


class RestoreTests(unittest.TestCase):
    def test_values_preserve_type_and_zero(self):
        self.assertNotEqual(normalize(0), normalize(False))
        self.assertNotEqual(normalize(0), normalize(0.0))
        self.assertNotEqual(normalize(b'abc'), normalize('abc'))
        self.assertNotEqual(normalize(None), normalize(''))
        self.assertEqual(normalize({'b':1,'a':0}), normalize({'a':0,'b':1}))
        self.assertNotEqual(normalize([1,2]), normalize([2,1]))

    def test_no_import_into_default_or_preexisting(self):
        session = Mock()
        with self.assertRaisesRegex(ReplicaError, 'ISOLATED_RESTORE_REQUIRED'):
            import_isolated(session, 'test', '(default)', 'gs://test/firestore')
        session.post.assert_not_called()
        session.post.return_value.raise_for_status.side_effect = RuntimeError('409')
        with self.assertRaises(RuntimeError):
            import_isolated(session, 'test', 'restore-unas-existing', 'gs://test/firestore')
        self.assertEqual(session.post.call_count,1)
        self.assertNotIn(':importDocuments', session.post.call_args.args[0])

    def test_subcollections_under_missing_parents_are_compared(self):
        child = Mock(path='parent/missing/child/doc')
        child.get.return_value = Mock(exists=True,to_dict=lambda:{'value':0})
        child.collections.return_value = []
        child_collection = Mock(id='child',path='parent/missing/child')
        child_collection.list_documents.return_value = [child]
        parent = Mock(path='parent/missing')
        parent.get.return_value = Mock(exists=False)
        parent.collections.return_value = [child_collection]
        root_collection = Mock(id='parent',path='parent')
        root_collection.list_documents.return_value = [parent]
        client = Mock(_database_string='projects/test/databases/restore-unas-test')
        client.collections.return_value = [root_collection]
        result = digest_database(client)
        self.assertEqual(result['documents'],1)
        self.assertEqual(result['collections']['parent/missing/child'],1)
        child.get.return_value = Mock(exists=True,to_dict=lambda:{'value':1})
        self.assertNotEqual(result['sha256'],digest_database(client)['sha256'])


if __name__ == '__main__': unittest.main()
