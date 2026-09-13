import unittest,tempfile
from pathlib import Path
from brain import BrainStore,Worker
class ImportTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.store=BrainStore(Path(self.temp.name)/'db');self.brain=self.store.create_brain('A','')
 def tearDown(self):self.temp.cleanup()
 def test_metadata_and_deduplication_are_scoped(self):
  doc={'title':'Chat','body':'User: feedback memory','origin':'file:conversations.json','metadata':{'source_created_at':'2025-01-01T00:00:00Z','conversation_id':'chat1'}}
  first=self.store.import_source(self.brain['id'],doc);second=self.store.import_source(self.brain['id'],doc)
  self.assertEqual(first['status'],'imported');self.assertEqual(second['status'],'duplicate');self.assertEqual(first['source_id'],second['source_id'])
  snap=self.store.snapshot(self.brain['id']);self.assertEqual(snap['sources'][0]['metadata'],doc['metadata']);self.assertEqual(len(snap['jobs']),1)
  other=self.store.create_brain('B','');self.assertEqual(self.store.import_source(other['id'],doc)['status'],'imported')
  child=self.store.fork(self.brain['id'],'Fork','');self.assertEqual(self.store.snapshot(child['id'])['sources'][0]['metadata'],doc['metadata'])
 def test_status_survives_restart_and_worker_finishes(self):
  item=self.store.import_source(self.brain['id'],{'title':'Note','body':'feedback memory','metadata':{}})
  self.assertEqual(self.store.import_status(self.brain['id'],[item['source_id']])[0]['status'],'queued')
  Worker(self.store).tick();again=BrainStore(self.store.path)
  self.assertEqual(again.import_status(self.brain['id'],[item['source_id']])[0]['status'],'completed')
  other=self.store.create_brain('B','');self.assertEqual(again.import_status(other['id'],[item['source_id']]),[])
 def test_invalid_metadata_does_not_save_source(self):
  with self.assertRaises(ValueError):self.store.import_source(self.brain['id'],{'title':'Bad','body':'x','metadata':[]})
  self.assertEqual(self.store.snapshot(self.brain['id'])['sources'],[])
