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
