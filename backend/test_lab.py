import unittest
from lab import run_experiment

class LabTests(unittest.TestCase):
    def test_regression_compares_baseline_and_preserves_holdout(self):
        csv='x,y\n'+'\n'.join(f'{i},{3*i+7}' for i in range(80))
        result=run_experiment(csv,'y')
        self.assertEqual(result['status'],'completed')
        self.assertEqual(result['rows'],80)
        self.assertEqual(sum(result['split_sizes'].values()),80)
        self.assertGreaterEqual(len(result['candidates']),3)
        self.assertLess(result['test_mae'],result['baseline_test_mae'])
        self.assertIn('parameters',result['model_artifact'])

    def test_rejects_non_numeric_and_missing_data(self):
        for text in ['x,y\nhello,3\n','x,y\n1,\n','x,y\n1,nan\n']:
            with self.assertRaises(ValueError):run_experiment(text,'y')

    def test_requires_enough_observations(self):
        with self.assertRaises(ValueError):run_experiment('x,y\n1,2\n2,3\n','y')

if __name__=='__main__':unittest.main()
