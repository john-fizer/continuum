function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function parseCsv(text, target) {
  const [header, ...lines] = String(text || '').trim().split(/\r?\n/);
  const fields = (header || '').split(',').map((field) => field.trim());
  if (!fields.includes(target) || fields.length < 2 || new Set(fields).size !== fields.length)
    throw new Error('Provide a CSV with unique column names, a target, and at least one input column.');
  if (fields.length > 21) throw new Error('The first AutoML pass supports up to 20 input columns.');
  if (lines.length < 30) throw new Error('At least 30 complete numeric rows are required.');
  if (lines.length > 5000) throw new Error('The first AutoML pass supports at most 5,000 rows.');
  return lines.map((line) => {
    const values = line.split(',');
    if (values.length !== fields.length) throw new Error('Each CSV row must have the same number of columns.');
    if (values.some((value) => !value.trim()))
      throw new Error('Every cell must be a finite number; remove missing or nonnumeric values.');
    const row = Object.fromEntries(fields.map((field, index) => [field, Number(values[index].trim())]));
    if (!Object.values(row).every((value) => Number.isFinite(value) && Math.abs(value) <= 1e12))
      throw new Error('Every cell must be a finite number; remove missing or nonnumeric values.');
    return row;
  });
}

function fit(kind, feature, rows, target) {
  const y = rows.map((row) => row[target]);
  if (kind === 'mean') return { kind, feature: null, parameters: { value: average(y) } };
  const x = rows.map((row) => row[feature]);
  if (kind === 'linear') {
    const xMean = average(x), yMean = average(y);
    const variance = x.reduce((total, value) => total + (value - xMean) ** 2, 0);
    const covariance = x.reduce((total, value, index) => total + (value - xMean) * (y[index] - yMean), 0);
    const slope = variance ? covariance / variance : 0;
    return { kind, feature, parameters: { slope, intercept: yMean - slope * xMean } };
  }
  const threshold = median(x);
  const left = rows.filter((row) => row[feature] <= threshold).map((row) => row[target]);
  const right = rows.filter((row) => row[feature] > threshold).map((row) => row[target]);
  return { kind, feature, parameters: { threshold, left: left.length ? average(left) : average(y), right: right.length ? average(right) : average(y) } };
}

function predict(model, row) {
  if (model.kind === 'mean') return model.parameters.value;
  if (model.kind === 'linear') return model.parameters.slope * row[model.feature] + model.parameters.intercept;
  return row[model.feature] <= model.parameters.threshold ? model.parameters.left : model.parameters.right;
}

function mae(model, rows, target) {
  return average(rows.map((row) => Math.abs(predict(model, row) - row[target])));
}

export function runNumericExperiment(dataset, target) {
  const rows = parseCsv(dataset, target);
  const fields = Object.keys(rows[0]);
  const trainEnd = Math.floor(rows.length * 0.6);
  const validationEnd = Math.floor(rows.length * 0.8);
  const [train, validation, test] = [rows.slice(0, trainEnd), rows.slice(trainEnd, validationEnd), rows.slice(validationEnd)];
  const candidates = [fit('mean', null, train, target)];
  for (const field of fields) if (field !== target) candidates.push(fit('linear', field, train, target), fit('stump', field, train, target));
  const scores = candidates.map((candidate) => ({ kind: candidate.kind, feature: candidate.feature, validation_mae: mae(candidate, validation, target) }));
  const bestIndex = scores.reduce((best, score, index) => score.validation_mae < scores[best].validation_mae ? index : best, 0);
  const selected = candidates[bestIndex];
  const final = fit(selected.kind, selected.feature, [...train, ...validation], target);
  const baseline = fit('mean', null, [...train, ...validation], target);
  return {
    status: 'completed', task: 'numeric regression', rows: rows.length, target,
    split_sizes: { train: train.length, validation: validation.length, test: test.length },
    split_method: 'ordered 60/20/20; final fit on first 80%; final test on last 20%',
    candidates: scores, selected: { kind: selected.kind, feature: selected.feature },
    test_mae: mae(final, test, target), baseline_test_mae: mae(baseline, test, target), model_artifact: final,
    limitations: 'Bounded search: constant, single-feature linear regression, and median-split stumps. Predictive association is not causation. Check leakage, dataset relevance, and whether time order is valid before acting on a result.',
  };
}
