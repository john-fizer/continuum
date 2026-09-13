import tempfile
import unittest
from pathlib import Path
from brain import BrainStore, Worker


class BrainTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = BrainStore(Path(self.temp.name) / 'brain.db')
        self.brain = self.store.create_brain('Research', 'Explore feedback and memory')

    def tearDown(self):
        self.temp.cleanup()

    def test_isolation_and_deduplication(self):
        a = self.store.add_source(self.brain['id'], 'One', 'Feedback systems preserve memory and adapt.')
        b = self.store.add_source(self.brain['id'], 'Again', 'Feedback systems preserve memory and adapt.')
        other = self.store.create_brain('Other', '')
        self.assertEqual(a['id'], b['id'])
        self.assertEqual(len(self.store.snapshot(self.brain['id'])['sources']), 1)
        self.assertEqual(self.store.snapshot(other['id'])['sources'], [])
        self.assertEqual(self.store.ask(other['id'], 'feedback')['citations'], [])

    def test_fork_is_independent_snapshot(self):
        self.store.add_source(self.brain['id'], 'Original', 'Feedback connects memory systems.')
        child = self.store.fork(self.brain['id'], 'Child', 'Specialized')
        self.store.add_source(self.brain['id'], 'Later', 'Later source only belongs to parent.')
        self.assertEqual(len(self.store.snapshot(child['id'])['sources']), 1)
        self.assertEqual(child['parent_id'], self.brain['id'])
        self.assertNotEqual(self.store.snapshot(child['id'])['sources'][0]['id'], self.store.snapshot(self.brain['id'])['sources'][0]['id'])

    def test_two_loops_have_traceable_evidence(self):
        self.store.add_source(self.brain['id'], 'Memory', 'Feedback systems adapt through memory and observations.')
        self.store.add_source(self.brain['id'], 'Control', 'Control systems use feedback and observations to adapt.')
        worker = Worker(self.store)
        for _ in range(8):
            worker.tick()
        data = self.store.snapshot(self.brain['id'])
        self.assertTrue(any(j['kind'] == 'explore' and j['status'] == 'completed' for j in data['jobs']))
        self.assertTrue(any(j['kind'] == 'analyze' and j['status'] == 'completed' for j in data['jobs']))
        self.assertTrue(data['links'])
        ids = {s['id'] for s in data['sources']}
        self.assertIn(data['links'][0]['source_a'], ids)
        self.assertIn(data['links'][0]['source_b'], ids)
        self.assertEqual(data['links'][0]['status'], 'candidate')
        self.assertTrue(self.store.ask(self.brain['id'], 'feedback')['citations'])

    def test_pause_and_budget_prevent_dispatch(self):
        self.store.add_source(self.brain['id'], 'One', 'Memory and feedback')
        self.store.configure(self.brain['id'], active=False)
        worker = Worker(self.store)
        self.assertFalse(worker.tick())
        self.store.configure(self.brain['id'], active=True, cycle_limit=1)
        self.assertTrue(worker.tick())
        self.assertFalse(worker.tick())
        self.assertEqual(self.store.snapshot(self.brain['id'])['brain']['cycles_used'], 1)

    def test_recover_interrupted_job(self):
        self.store.add_source(self.brain['id'], 'One', 'Memory and feedback')
        job = self.store.claim_job()
        self.assertEqual(job['status'], 'running')
        restarted = BrainStore(self.store.path)
        restarted.recover()
        self.assertEqual(restarted.snapshot(self.brain['id'])['jobs'][0]['status'], 'queued')

    def test_review_cannot_cross_brains(self):
        self.store.add_source(self.brain['id'], 'A', 'Feedback memory systems')
        self.store.add_source(self.brain['id'], 'B', 'Feedback memory control')
        worker = Worker(self.store)
        for _ in range(6): worker.tick()
        link = self.store.snapshot(self.brain['id'])['links'][0]
        other = self.store.create_brain('Other', '')
        with self.assertRaises(ValueError):
            self.store.review(other['id'], link['id'], 'accepted')


if __name__ == '__main__':
    unittest.main()
