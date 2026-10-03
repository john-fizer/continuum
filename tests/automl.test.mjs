import test from 'node:test';
import assert from 'node:assert/strict';
import { runNumericExperiment, runDeepLearningExperiment, runReinforcementExperiment } from '../app/research/automl.mjs';

test('feature pipeline profiles, cleans, and records lineage without mutating raw CSV', () => {
  const csv = [
    'record_id,temperature,shift,failure_risk',
    'a1,21,night,0',
    'a2,22,day,0',
    'a3,,night,1',
    ...Array.from({ length: 33 }, (_, index) => `a${index + 4},${23 + index % 5},${index % 2 ? 'day' : 'night'},${index % 7 === 0 ? 1 : 0}`),
  ].join('\n');
  const result = runNumericExperiment(csv, 'failure_risk');
  assert.equal(result.status, 'completed');
  assert.equal(result.task_type, 'classification');
  assert.equal(result.profile.columns.find((column) => column.name === 'temperature').missing, 1);
  assert.ok(result.excluded_features.some((field) => field.name === 'record_id'));
  assert.ok(result.transformations.some((step) => /median/i.test(step.rule)));
  assert.ok(result.feature_lineage.some((field) => field.source === 'shift'));
  assert.equal(result.raw_hash.length, 16);
  assert.equal(result.quality_gates.leakage, 'passed');
});

test('feature pipeline blocks a direct target copy as leakage', () => {
  const csv = ['signal,target,copy_target'];
  for (let index = 0; index < 40; index++) csv.push(`${index},${index % 3},${index % 3}`);
  assert.throws(() => runNumericExperiment(csv.join('\n'), 'target'), /leakage/i);
});

test('numeric experiment chooses a model using validation and holds out its final score', () => {
  const csv = ['x,noise,target'];
  for (let index = 0; index < 60; index++) csv.push(`${index},${(index * 7) % 5},${index * 3 + 2}`);

  const result = runNumericExperiment(csv.join('\n'), 'target');

  assert.equal(result.status, 'completed');
  assert.equal(result.rows, 60);
  assert.equal(result.split_sizes.test, 12);
  assert.equal(result.selected.kind, 'linear_regression');
  assert.equal(result.selected.feature, 'x');
  assert.ok(result.test_mae < result.baseline_test_mae);
  assert.match(result.limitations, /not causation/i);
});

test('numeric experiment rejects missing values instead of silently fitting them', () => {
  const csv = ['x,target', ...Array.from({ length: 30 }, (_, index) => `${index},${index === 3 ? '' : index * 2}`)].join('\n');
  assert.throws(() => runNumericExperiment(csv, 'target'), /target contains missing/i);
});

test('dense tabular runner uses validation before reporting a held-out score', () => {
  const csv = ['signal,noise,target'];
  for (let index = 0; index < 80; index++) csv.push(`${index / 10},${index % 4},${index / 10 * 2 + 1}`);
  const result = runDeepLearningExperiment(csv.join('\n'), 'target');
  assert.equal(result.status, 'completed');
  assert.equal(result.mode, 'deep_learning');
  assert.equal(result.selected.kind, 'dense_neural_network');
  assert.equal(result.optimizer_budget.held_out_test_used_once, true);
  assert.ok(Number.isFinite(result.test_score));
});

test('tabular reinforcement runner requires explicit state, action, and reward evidence', () => {
  const csv = ['state,action,reward,next_state'];
  for (let index = 0; index < 80; index++) {
    const state = index % 2 ? 'warm' : 'cool';
    const action = index % 2 ? 'reduce' : 'hold';
    csv.push(`${state},${action},${action === 'reduce' ? 1 : .4},${state}`);
  }
  const result = runReinforcementExperiment(csv.join('\n'), { state: 'state', action: 'action', reward: 'reward', nextState: 'next_state' });
  assert.equal(result.status, 'completed');
  assert.equal(result.mode, 'reinforcement_learning');
  assert.equal(result.selected.kind, 'tabular_q_learning');
  assert.match(result.limitations, /offline/i);
});
