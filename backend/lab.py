"""Small reproducible AutoML baseline: numeric regression, no external packages.

This intentionally bounded search compares a constant, univariate linear models,
and regression stumps. It is not a replacement for a general AutoML framework.
"""
import csv
import hashlib
import io
import math
import statistics


def predict(model, row):
    kind=model['kind']
    p=model['parameters']
    if kind=='mean':return p['value']
    x=row[model['feature']]
    if kind=='linear':return p['slope']*x+p['intercept']
    return p['left'] if x<=p['threshold'] else p['right']


def fit(kind,feature,rows,target):
    y=[r[target] for r in rows]
    if kind=='mean':return {'kind':kind,'feature':None,'parameters':{'value':statistics.mean(y)}}
    x=[r[feature] for r in rows]
    if kind=='linear':
        try:slope,intercept=statistics.linear_regression(x,y)
        except statistics.StatisticsError:slope,intercept=0,statistics.mean(y)
        return {'kind':kind,'feature':feature,'parameters':{'slope':slope,'intercept':intercept}}
    threshold=statistics.median(x)
    left=[r[target] for r in rows if r[feature]<=threshold]
    right=[r[target] for r in rows if r[feature]>threshold]
    return {'kind':kind,'feature':feature,'parameters':{'threshold':threshold,'left':statistics.mean(left) if left else statistics.mean(y),'right':statistics.mean(right) if right else statistics.mean(y)}}


def mae(model,rows,target):
    return statistics.mean(abs(predict(model,r)-r[target]) for r in rows)


def run_experiment(text,target):
    reader=csv.DictReader(io.StringIO(text))
    fields=reader.fieldnames or []
    if target not in fields or len(fields)<2 or len(set(fields))!=len(fields):
        raise ValueError('Provide a CSV with unique column names, a target, and at least one input column')
    if len(fields)>21:raise ValueError('The baseline supports up to 20 input columns')
    rows=[]
    for raw in reader:
        if len(rows)>=5000:raise ValueError('The baseline supports at most 5,000 rows')
        if None in raw:raise ValueError('CSV row has extra columns')
        try:row={k:float(raw[k]) for k in fields}
        except (ValueError,TypeError,KeyError):raise ValueError('Every cell must be a finite number; remove missing or nonnumeric values')
        if not all(math.isfinite(v) and abs(v)<=1e12 for v in row.values()):raise ValueError('Use finite numeric values with magnitude at most one trillion')
        rows.append(row)
    if len(rows)<30:raise ValueError('At least 30 complete numeric rows are required')
    # Tail is reserved for final evaluation; validation immediately precedes it.
    # This preserves time order if the uploaded data is chronological.
    train_end=int(len(rows)*.6); validation_end=int(len(rows)*.8)
    train,validation,test=rows[:train_end],rows[train_end:validation_end],rows[validation_end:]
    candidates=[fit('mean',None,train,target)]
    for field in fields:
        if field!=target:
            candidates.extend([fit('linear',field,train,target),fit('stump',field,train,target)])
    scores=[{'kind':m['kind'],'feature':m['feature'],'validation_mae':mae(m,validation,target)} for m in candidates]
    best=min(range(len(scores)),key=lambda i:scores[i]['validation_mae'])
    selected=candidates[best]
    # Final fit uses train+validation only; holdout is evaluated once after selection.
    final=fit(selected['kind'],selected['feature'],train+validation,target)
    baseline=fit('mean',None,train+validation,target)
    return {'status':'completed','task':'numeric regression','rows':len(rows),'target':target,
            'dataset_hash':hashlib.sha256(text.encode()).hexdigest(),
            'split_sizes':{'train':len(train),'validation':len(validation),'test':len(test)},
            'split_method':'ordered 60/20/20; final fit on first 80%; final test on last 20%',
            'candidates':scores,'selected':{'kind':selected['kind'],'feature':selected['feature']},
            'test_mae':mae(final,test,target),'baseline_test_mae':mae(baseline,test,target),
            'model_artifact':final,
            'limitations':'Small baseline search: constant, single-feature linear regression, and median-split stumps. Predictive association is not causation. Check leakage and dataset relevance; a successful test is not automatic deployment.'}
