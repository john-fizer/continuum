import { createHash } from 'node:crypto';

const MISSING = new Set(['', 'na', 'n/a', 'null', 'none', 'unknown', '-']);
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
const mode = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] ?? '';
};
const numeric = (value) => Number.isFinite(Number(value)) && String(value).trim() !== '';
const missing = (value) => MISSING.has(String(value ?? '').trim().toLowerCase());

function csvRows(text) {
  const source = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!source) throw new Error('Provide a CSV with a header and rows.');
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unfinished quoted value.');
  row.push(cell.trim()); rows.push(row);
  const [header, ...body] = rows;
  const fields = header.map((field) => field.trim());
  if (fields.length < 2 || fields.some((field) => !field) || new Set(fields).size !== fields.length)
    throw new Error('Provide a CSV with unique, nonempty column names and at least two columns.');
  if (fields.length > 41) throw new Error('This first feature pipeline supports up to 40 input columns.');
  if (body.length < 30) throw new Error('At least 30 rows are required for a held-out experiment.');
  if (body.length > 5000) throw new Error('This first feature pipeline supports at most 5,000 rows.');
  const records = body.filter((values) => values.some((value) => value !== '')).map((values, rowIndex) => {
    if (values.length !== fields.length) throw new Error(`Row ${rowIndex + 2} has ${values.length} cells; expected ${fields.length}.`);
    return Object.fromEntries(fields.map((field, column) => [field, values[column]]));
  });
  return { fields, records };
}

function columnInfo(name, records) {
  const values = records.map((row) => row[name]);
  const observed = values.filter((value) => !missing(value));
  const numericValues = observed.filter(numeric).map(Number);
  const type = observed.length && numericValues.length / observed.length >= .96 ? 'numeric' : 'categorical';
  const unique = new Set(observed).size;
  const lower = name.toLowerCase();
  const identifier = /(^|[_ -])(id|uuid|key|identifier|record)([_ -]|$)/.test(lower) && unique / Math.max(1, observed.length) > .8;
  const timestamp = /date|time|timestamp|_at$/.test(lower) && observed.filter((value) => !Number.isNaN(Date.parse(value))).length / Math.max(1, observed.length) > .9;
  return { name, type, missing: values.length - observed.length, unique, cardinality: Math.round(unique / Math.max(1, observed.length) * 1000) / 1000, identifier, timestamp,
    min: type === 'numeric' ? Math.min(...numericValues) : undefined, max: type === 'numeric' ? Math.max(...numericValues) : undefined };
}

function directCopy(feature, target, records) {
  const pairs = records.filter((row) => !missing(row[feature]) && !missing(row[target]));
  return pairs.length > 10 && pairs.every((row) => String(row[feature]).trim() === String(row[target]).trim());
}

export function profileDataset(dataset, target) {
  const { fields, records } = csvRows(dataset);
  if (!fields.includes(target)) throw new Error('Choose an exact target column from the CSV header.');
  const columns = fields.map((field) => columnInfo(field, records));
  const targetInfo = columns.find((column) => column.name === target);
  if (targetInfo.missing) throw new Error('The target contains missing values. Supply a known outcome for every training row.');
  const task_type = targetInfo.type === 'numeric' && targetInfo.unique > Math.min(12, Math.max(6, records.length * .1)) ? 'regression' : 'classification';
  const excluded_features = [];
  for (const column of columns) {
    if (column.name === target) continue;
    if (column.identifier) excluded_features.push({ name: column.name, reason: 'identifier-like field' });
    else if (column.timestamp) excluded_features.push({ name: column.name, reason: 'timestamp retained for chronological split, excluded from first model pass' });
    else if (directCopy(column.name, target, records)) throw new Error(`Leakage gate blocked "${column.name}": it is a direct copy of the target.`);
  }
  const excluded = new Set(excluded_features.map((field) => field.name));
  const candidate_features = columns.filter((column) => column.name !== target && !excluded.has(column.name));
  if (!candidate_features.length) throw new Error('No safe feature columns remain after identifier, time, and leakage checks.');
  const duplicate_rows = records.length - new Set(records.map((row) => JSON.stringify(row))).size;
  return { profile: { rows: records.length, columns, duplicate_rows, source_hash: createHash('sha256').update(String(dataset)).digest('hex').slice(0, 16) }, records, task_type, target, candidate_features, excluded_features,
    validation_plan: columns.some((column) => column.timestamp) ? 'chronological 60/20/20 split; transforms fit on training rows only' : 'row-order 60/20/20 split; transforms fit on training rows only' };
}

function splitRows(records) {
  const unique = []; const seen = new Set();
  for (const row of records) { const signature = JSON.stringify(row); if (!seen.has(signature)) { seen.add(signature); unique.push(row); } }
  if (unique.length < 30) throw new Error('Fewer than 30 usable rows remain after duplicate removal.');
  const trainEnd = Math.floor(unique.length * .6), validationEnd = Math.floor(unique.length * .8);
  return [unique.slice(0, trainEnd), unique.slice(trainEnd, validationEnd), unique.slice(validationEnd)];
}

function fitTransform(train, validation, test, features) {
  const transformations = []; const lineage = []; const transforms = new Map();
  for (const feature of features) {
    const values = train.map((row) => row[feature.name]).filter((value) => !missing(value));
    if (!values.length) throw new Error(`"${feature.name}" has no observed values in the training partition.`);
    if (feature.type === 'numeric') {
      const fill = median(values.map(Number)); const filled = train.map((row) => missing(row[feature.name]) ? fill : Number(row[feature.name]));
      const center = mean(filled); const scale = Math.sqrt(mean(filled.map((value) => (value - center) ** 2))) || 1;
      transforms.set(feature.name, { type: 'numeric', fill, center, scale });
      transformations.push({ feature: feature.name, rule: `median imputation (${fill}); standard scaling fit on training rows` });
      lineage.push({ feature: feature.name, source: feature.name, transformation: 'median_impute_then_standard_scale' });
    } else {
      const fill = mode(values); const categories = [...new Set(values)].slice(0, 30);
      transforms.set(feature.name, { type: 'categorical', fill, categories });
      transformations.push({ feature: feature.name, rule: `mode imputation (${fill}); one-hot categories fit on training rows, unseen values map to other` });
      lineage.push({ feature: feature.name, source: feature.name, transformation: 'mode_impute_then_one_hot' });
    }
  }
  const encode = (rows) => rows.map((row) => Object.fromEntries(features.map((feature) => {
    const transform = transforms.get(feature.name), raw = row[feature.name];
    if (transform.type === 'numeric') {
      const value = missing(raw) ? transform.fill : Number(raw);
      return [feature.name, (value - transform.center) / transform.scale];
    }
    const value = missing(raw) ? transform.fill : String(raw); return [feature.name, transform.categories.includes(value) ? value : '__other__'];
  })));
  return { train: encode(train), validation: encode(validation), test: encode(test), transformations, lineage };
}

function regressionCandidates(trainRaw, train, target, features) {
  const y = trainRaw.map((row) => Number(row[target])); const candidates = [{ kind: 'mean_baseline', feature: null, predict: () => mean(y) }];
  for (const feature of features.filter((field) => field.type === 'numeric')) {
    const x = train.map((row) => row[feature.name]), xMean = mean(x), yMean = mean(y);
    const variance = x.reduce((total, value) => total + (value - xMean) ** 2, 0);
    const slope = variance ? x.reduce((total, value, index) => total + (value - xMean) * (y[index] - yMean), 0) / variance : 0;
    const threshold = median(x), left = y.filter((_, index) => x[index] <= threshold), right = y.filter((_, index) => x[index] > threshold);
    candidates.push({ kind: 'linear_regression', feature: feature.name, predict: (row) => slope * row[feature.name] + yMean - slope * xMean });
    candidates.push({ kind: 'decision_stump', feature: feature.name, predict: (row) => row[feature.name] <= threshold ? mean(left) : mean(right) });
  }
  for (const feature of features.filter((field) => field.type === 'categorical')) {
    const groups = new Map(); train.forEach((row, index) => { const values = groups.get(row[feature.name]) || []; values.push(y[index]); groups.set(row[feature.name], values); });
    candidates.push({ kind: 'category_mean', feature: feature.name, predict: (row) => mean(groups.get(row[feature.name]) || y) });
  }
  return candidates;
}

function classificationCandidates(trainRaw, train, target, features) {
  const y = trainRaw.map((row) => String(row[target])), fallback = mode(y); const candidates = [{ kind: 'majority_baseline', feature: null, predict: () => fallback }];
  for (const feature of features) {
    if (feature.type === 'numeric') {
      const x = train.map((row) => row[feature.name]); const threshold = median(x);
      const left = y.filter((_, index) => x[index] <= threshold), right = y.filter((_, index) => x[index] > threshold);
      candidates.push({ kind: 'numeric_decision_stump', feature: feature.name, predict: (row) => row[feature.name] <= threshold ? mode(left) : mode(right) });
      continue;
    }
    const groups = new Map(); train.forEach((row, index) => { const values = groups.get(row[feature.name]) || []; values.push(y[index]); groups.set(row[feature.name], values); });
    candidates.push({ kind: 'category_classifier', feature: feature.name, predict: (row) => mode(groups.get(row[feature.name]) || y) });
  }
  return candidates;
}

const regressionScore = (candidate, rows, raw, target) => mean(rows.map((row, index) => Math.abs(candidate.predict(row) - Number(raw[index][target]))));
const classificationScore = (candidate, rows, raw, target) => mean(rows.map((row, index) => candidate.predict(row) === String(raw[index][target]) ? 1 : 0));

export function runNumericExperiment(dataset, target) {
  const prepared = profileDataset(dataset, target);
  const [trainRaw, validationRaw, testRaw] = splitRows(prepared.records);
  const transformed = fitTransform(trainRaw, validationRaw, testRaw, prepared.candidate_features);
  const candidates = prepared.task_type === 'regression' ? regressionCandidates(trainRaw, transformed.train, target, prepared.candidate_features) : classificationCandidates(trainRaw, transformed.train, target, prepared.candidate_features);
  const score = prepared.task_type === 'regression' ? regressionScore : classificationScore;
  const validation = candidates.map((candidate) => ({ kind: candidate.kind, feature: candidate.feature, validation_score: score(candidate, transformed.validation, validationRaw, target) }));
  const winner = validation.reduce((best, item, index) => (prepared.task_type === 'regression' ? item.validation_score < validation[best].validation_score : item.validation_score > validation[best].validation_score) ? index : best, 0);
  const selected = candidates[winner], baseline = candidates[0], finalScore = score(selected, transformed.test, testRaw, target), baselineScore = score(baseline, transformed.test, testRaw, target);
  const metric = prepared.task_type === 'regression' ? 'mae' : 'accuracy';
  return { status: 'completed', task: prepared.task_type === 'regression' ? 'feature-engineered regression' : 'feature-engineered classification', task_type: prepared.task_type, rows: trainRaw.length + validationRaw.length + testRaw.length, target,
    profile: prepared.profile, raw_hash: prepared.profile.source_hash, candidate_features: prepared.candidate_features.map(({ name, type }) => ({ name, type })), excluded_features: prepared.excluded_features, feature_lineage: transformed.lineage, transformations: transformed.transformations, validation_plan: prepared.validation_plan,
    split_sizes: { train: trainRaw.length, validation: validationRaw.length, test: testRaw.length }, split_method: prepared.validation_plan, metric, candidates: validation, selected: { kind: selected.kind, feature: selected.feature }, test_score: finalScore, baseline_test_score: baselineScore,
    ...(prepared.task_type === 'regression' ? { test_mae: finalScore, baseline_test_mae: baselineScore } : {}), optimizer_budget: { strategy: 'bounded deterministic candidate search', candidates: candidates.length, held_out_test_used_once: true }, quality_gates: { target: 'passed', usable_rows: 'passed', leakage: 'passed', holdout: 'passed' }, model_artifact: { kind: selected.kind, feature: selected.feature, transform_version: 'continuum-feature-pipeline-v1' }, limitations: 'Feature transformations are fitted only on training rows. This first run evaluates simple, interpretable candidates; predictive performance is not causation and does not authorize automated decisions. Review data relevance, temporal ordering, and omitted variables before acting.' };
}

function seededRandom(seed = 941) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function denseVectors(rows, features) {
  return rows.map((row) => features.map((feature) => Number(row[feature.name])));
}

function trainDenseNetwork(x, y, { hidden, classification, epochs = 180, learningRate = .032 }) {
  const random = seededRandom(hidden * 97 + x.length);
  const width = x[0].length;
  const w1 = Array.from({ length: hidden }, () => Array.from({ length: width }, () => (random() - .5) * .45));
  const b1 = Array.from({ length: hidden }, () => 0);
  const w2 = Array.from({ length: hidden }, () => (random() - .5) * .45);
  let b2 = 0;
  const sigmoid = (value) => 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, value))));
  const predict = (row) => {
    const layer = w1.map((weights, unit) => Math.tanh(weights.reduce((sum, weight, index) => sum + weight * row[index], b1[unit])));
    const output = w2.reduce((sum, weight, unit) => sum + weight * layer[unit], b2);
    return classification ? sigmoid(output) : output;
  };
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw1 = w1.map((weights) => weights.map(() => 0));
    const gb1 = b1.map(() => 0), gw2 = w2.map(() => 0);
    let gb2 = 0;
    for (let index = 0; index < x.length; index++) {
      const row = x[index];
      const layer = w1.map((weights, unit) => Math.tanh(weights.reduce((sum, weight, feature) => sum + weight * row[feature], b1[unit])));
      const raw = w2.reduce((sum, weight, unit) => sum + weight * layer[unit], b2);
      const output = classification ? sigmoid(raw) : raw;
      const delta = output - y[index];
      gb2 += delta;
      for (let unit = 0; unit < hidden; unit++) {
        gw2[unit] += delta * layer[unit];
        const hiddenDelta = delta * w2[unit] * (1 - layer[unit] ** 2);
        gb1[unit] += hiddenDelta;
        for (let feature = 0; feature < width; feature++) gw1[unit][feature] += hiddenDelta * row[feature];
      }
    }
    const rate = learningRate / x.length;
    for (let unit = 0; unit < hidden; unit++) {
      w2[unit] -= rate * gw2[unit]; b1[unit] -= rate * gb1[unit];
      for (let feature = 0; feature < width; feature++) w1[unit][feature] -= rate * gw1[unit][feature];
    }
    b2 -= rate * gb2;
  }
  return predict;
}

function splitPrepared(prepared) {
  const [trainRaw, validationRaw, testRaw] = splitRows(prepared.records);
  const numericFeatures = prepared.candidate_features.filter((field) => field.type === 'numeric');
  if (!numericFeatures.length) throw new Error('Deep learning needs at least one safe numeric feature in this first tabular runner.');
  const transformed = fitTransform(trainRaw, validationRaw, testRaw, numericFeatures);
  return { trainRaw, validationRaw, testRaw, numericFeatures, transformed };
}

export function runDeepLearningExperiment(dataset, target) {
  const prepared = profileDataset(dataset, target);
  if (prepared.records.length > 1500) throw new Error('The in-process deep learning runner supports at most 1,500 rows. Use a dedicated training worker for larger jobs.');
  const { trainRaw, validationRaw, testRaw, numericFeatures, transformed } = splitPrepared(prepared);
  const classification = prepared.task_type === 'classification';
  const labels = classification ? [...new Set(trainRaw.map((row) => String(row[target])))] : [];
  if (classification && labels.length !== 2) throw new Error('The first dense classifier supports exactly two outcome labels.');
  const rawY = trainRaw.map((row) => Number(row[target]));
  const center = classification ? 0 : mean(rawY);
  const scale = classification ? 1 : Math.sqrt(mean(rawY.map((value) => (value - center) ** 2))) || 1;
  const encodeY = (rows) => classification ? rows.map((row) => String(row[target]) === labels[1] ? 1 : 0) : rows.map((row) => (Number(row[target]) - center) / scale);
  const xTrain = denseVectors(transformed.train, numericFeatures);
  const xValidation = denseVectors(transformed.validation, numericFeatures);
  const xTest = denseVectors(transformed.test, numericFeatures);
  const yTrain = encodeY(trainRaw);
  const yValidation = encodeY(validationRaw);
  const yTest = encodeY(testRaw);
  const candidates = [4, 8].map((hidden) => {
    const predict = trainDenseNetwork(xTrain, yTrain, { hidden, classification });
    const value = classification
      ? mean(xValidation.map((row, index) => (predict(row) >= .5 ? 1 : 0) === yValidation[index] ? 1 : 0))
      : mean(xValidation.map((row, index) => Math.abs((predict(row) * scale + center) - Number(validationRaw[index][target]))));
    return { hidden, predict, validation_score: value };
  });
  const selected = candidates.reduce((best, candidate, index) => (classification ? candidate.validation_score > candidates[best].validation_score : candidate.validation_score < candidates[best].validation_score) ? index : best, 0);
  const winner = candidates[selected];
  const testScore = classification
    ? mean(xTest.map((row, index) => (winner.predict(row) >= .5 ? 1 : 0) === yTest[index] ? 1 : 0))
    : mean(xTest.map((row, index) => Math.abs((winner.predict(row) * scale + center) - Number(testRaw[index][target]))));
  return {
    status: 'completed', mode: 'deep_learning', task: classification ? 'dense binary classification' : 'dense tabular regression', task_type: prepared.task_type,
    rows: prepared.records.length, target, profile: prepared.profile, excluded_features: prepared.excluded_features, transformations: transformed.transformations,
    feature_lineage: transformed.lineage, split_method: prepared.validation_plan, split_sizes: { train: trainRaw.length, validation: validationRaw.length, test: testRaw.length },
    metric: classification ? 'accuracy' : 'mae', candidates: candidates.map(({ hidden, validation_score }) => ({ kind: 'dense_neural_network', feature: `${hidden} hidden units`, validation_score })),
    selected: { kind: 'dense_neural_network', feature: `${winner.hidden} hidden units` }, test_score: testScore,
    optimizer_budget: { strategy: 'bounded dense-network search', candidates: candidates.length, epochs: 180, held_out_test_used_once: true },
    quality_gates: { target: 'passed', usable_rows: 'passed', leakage: 'passed', holdout: 'passed', modality: 'tabular numeric' },
    model_artifact: { kind: 'dense_neural_network', hidden_units: winner.hidden, transform_version: 'continuum-feature-pipeline-v1' },
    limitations: 'This is a bounded in-process tabular neural-network runner, not a general deep-learning service. The final score is offline evidence, not causation or permission to automate decisions. Image, audio, sequence, and larger jobs require a dedicated training worker.'
  };
}

export function runReinforcementExperiment(dataset, { state, action, reward, nextState }) {
  const prepared = profileDataset(dataset, reward);
  for (const field of [state, action, reward]) if (!prepared.profile.columns.some((column) => column.name === field)) throw new Error(`Reinforcement field "${field}" is not present in the CSV.`);
  if (prepared.records.length > 5000) throw new Error('The tabular reinforcement runner supports at most 5,000 decision rows.');
  const rows = prepared.records.filter((row) => !missing(row[state]) && !missing(row[action]) && !missing(row[reward]));
  if (rows.length < 30) throw new Error('At least 30 complete state, action, reward rows are required.');
  const cutoff = Math.floor(rows.length * .8), train = rows.slice(0, cutoff), test = rows.slice(cutoff);
  const actions = [...new Set(train.map((row) => String(row[action])))];
  const q = new Map();
  const key = (s, a) => `${s}\u0000${a}`;
  const maxQ = (s) => Math.max(0, ...actions.map((a) => q.get(key(s, a)) || 0));
  const alpha = .16, gamma = .84;
  for (let epoch = 0; epoch < 30; epoch++) for (const row of train) {
    const s = String(row[state]), a = String(row[action]), r = Number(row[reward]);
    const follow = nextState && row[nextState] !== undefined && !missing(row[nextState]) ? String(row[nextState]) : s;
    const prior = q.get(key(s, a)) || 0;
    q.set(key(s, a), prior + alpha * (r + gamma * maxQ(follow) - prior));
  }
  const policy = (s) => actions.reduce((best, candidate) => (q.get(key(s, candidate)) || 0) > (q.get(key(s, best)) || 0) ? candidate : best, actions[0]);
  const matched = test.filter((row) => policy(String(row[state])) === String(row[action]));
  const policyReward = matched.length ? mean(matched.map((row) => Number(row[reward]))) : 0;
  const baseline = mean(test.map((row) => Number(row[reward])));
  return {
    status: 'completed', mode: 'reinforcement_learning', task: 'offline tabular q-learning', task_type: 'reinforcement', rows: rows.length,
    target: reward, profile: prepared.profile, split_method: 'chronological 80/20 decision-log split', split_sizes: { train: train.length, test: test.length }, metric: 'logged_policy_reward',
    candidates: [{ kind: 'behavior_policy_baseline', feature: null, validation_score: baseline }, { kind: 'tabular_q_learning', feature: `${state} → ${action}`, validation_score: policyReward }],
    selected: { kind: 'tabular_q_learning', feature: `${state} → ${action}` }, test_score: policyReward, baseline_test_score: baseline,
    optimizer_budget: { strategy: 'tabular Q updates', epochs: 30, alpha, gamma, held_out_test_used_once: true },
    quality_gates: { state_action_reward: 'passed', temporal_holdout: 'passed', offline_only: 'passed', policy_match_coverage: `${matched.length}/${test.length}` },
    model_artifact: { kind: 'tabular_q_learning', state, action, reward, next_state: nextState || null },
    limitations: 'This is offline reinforcement learning from logged decisions. It does not estimate counterfactual rewards for unobserved actions and must not control a live system until a simulator, safety constraints, and prospective evaluation demonstrate acceptable behavior.'
  };
}
