import test from 'node:test';
import assert from 'node:assert/strict';
import { runNumericExperiment } from '../app/research/automl.mjs';

test('numeric experiment chooses a model using validation and holds out its final score', () => {
  const csv = ['x,noise,target'];
  for (let index = 0; index < 60; index++) csv.push(`${index},${(index * 7) % 5},${index * 3 + 2}`);

  const result = runNumericExperiment(csv.join('\n'), 'target');

  assert.equal(result.status, 'completed');
  assert.equal(result.rows, 60);
  assert.equal(result.split_sizes.test, 12);
  assert.equal(result.selected.kind, 'linear');
  assert.equal(result.selected.feature, 'x');
  assert.ok(result.test_mae < result.baseline_test_mae);
  assert.match(result.limitations, /not causation/i);
});

test('numeric experiment rejects missing values instead of silently fitting them', () => {
  const csv = ['x,target', ...Array.from({ length: 30 }, (_, index) => `${index},${index === 3 ? '' : index * 2}`)].join('\n');
  assert.throws(() => runNumericExperiment(csv, 'target'), /finite number/i);
});
