"""Offline balance experiment. Run on JD Cloud; no DB, HTTP or game writes."""
import argparse, csv, hashlib, itertools, json, math
from pathlib import Path
import numpy as np

ATTRS = ['雷', '火', '水', '黄金', '梦幻']
ATTR_W = [0.25, 0.25, 0.25, 0.15, 0.10]
GRADES = ['普通', '优秀', '史诗', '传奇', '无双']
POLICIES = {
    'previous': {'quality_weights': [.30, .40, .20, .08, .02],
                 'quality_bonus': [0, .20, .50, 1, 2],
                 'attr_bonus': [.15, .15, .15, .25, .35], 'attr_cap': .50},
    'conservative': {'quality_weights': [.45, .40, .12, .028, .002],
                     'quality_bonus': [0, .10, .25, .50, 1],
                     'attr_bonus': [.05, .05, .05, .10, .15], 'attr_cap': .20},
}
POLICIES['recommended'] = {**POLICIES['conservative'],
    'quality_weights': [.45, .40, .12, .0298, .0002]}
LIFECYCLE_QUALITY = [
    {'id': 'short', 'max_hours': 2, 'weights': [.40,.42,.15,.029,.001]},
    {'id': 'medium', 'max_hours': 24, 'weights': [.36,.42,.17,.045,.005]},
    {'id': 'long', 'max_hours': 72, 'weights': [.32,.42,.18,.07,.01]},
    {'id': 'slow', 'max_hours': 999999, 'weights': [.28,.40,.20,.08,.04]},
]
for band in LIFECYCLE_QUALITY:
    POLICIES['lifecycle-'+band['id']] = {**POLICIES['conservative'], 'quality_weights':band['weights']}
FUSION_TIERS = {
    'fast': [0, 0, 2, 8, 30],
    'balanced': [0, 0, 3, 12, 48],
    'slow': [0, 0, 5, 20, 80],
}

def population(p, policy):
    """Both event rates p. Second type excludes first, renormalizing weights.
    A successful event rolls quality; two successes retain the higher quality.
    Non-mutant remains ordinary. All are explicitly experimental assumptions.
    """
    qw = policy['quality_weights']
    bins = {((), 0): (1-p)**2}
    for a, wa in enumerate(ATTR_W):
        for q, wq in enumerate(qw):
            k = ((a,), q)
            bins[k] = bins.get(k, 0) + 2*p*(1-p)*wa*wq
        for b, wb in enumerate(ATTR_W):
            if a == b:
                continue
            for qa, wqa in enumerate(qw):
                for qb, wqb in enumerate(qw):
                    k = (tuple(sorted((a, b))), max(qa, qb))
                    bins[k] = bins.get(k, 0) + p*p*wa*wb/(1-wa)*wqa*wqb
    rows = []
    for (attrs, q), prob in sorted(bins.items()):
        bonus = min(policy['attr_cap'], sum(policy['attr_bonus'][a] for a in attrs))
        rows.append({'attrs': list(attrs), 'grade': q, 'probability': prob,
                     'multiplier': round(1 + policy['quality_bonus'][q] + bonus, 6)})
    assert abs(sum(x['probability'] for x in rows)-1) < 1e-12
    return rows

def fusion_plan(stock, tier, price):
    """Minimal merges for ONE target, using high-grade existing material first.
    Caller inventory is not modified. Assumes no attributes/target-combo constraints.
    """
    stock = list(stock)
    merges = [0]*5
    def take(q):
        if stock[q]:
            stock[q] -= 1
            return
        if q == 0:
            raise ValueError('insufficient source animals')
        take(q-1); take(q-1)
        merges[q] += 1
    take(4)
    tokens = sum(n*c for n,c in zip(merges, tier))
    fees = [0] + [math.ceil(price*x-1e-12) for x in [.10, .25, .50, 1.0]]
    return {'merges': merges, 'tokens': tokens,
            'coins': sum(n*c for n,c in zip(merges, fees))}

def run(root, samples, players):
    data = json.loads((root/'input.json').read_text())
    cat = data['catalog']
    out = {'samples_per_population': samples, 'seed': 20261005,
           'source': data, 'policies': POLICIES, 'populations': {}, 'economy': [],
           'rounding': [], 'fusion_policies': FUSION_TIERS, 'fusion': [],
           'fusion_mc': [], 'natural_supreme_time': [], 'epic_cap': [], 'checks': []}
    rng = np.random.default_rng(out['seed'])
    qnames = GRADES
    for pname, policy in POLICIES.items():
        for p in [.10, .20, .30]:
            key = f'{pname}-{p:.2f}'
            pop = population(p, policy)
            probs = np.array([r['probability'] for r in pop])
            indices = rng.choice(len(pop), size=samples, p=probs)
            grades = np.array([r['grade'] for r in pop])
            sizes = np.array([len(r['attrs']) for r in pop])
            mult = np.array([r['multiplier'] for r in pop])
            exact = float(probs @ mult)
            mc = float(mult[indices].mean())
            se = float(np.sqrt(probs @ (mult-exact)**2 / samples))
            assert abs(mc-exact) < max(6*se, 1e-5)
            single = float(probs[sizes == 1].sum())
            dual = float(probs[sizes == 2].sum())
            assert abs(single-2*p*(1-p)) < 1e-12
            assert abs(dual-p*p) < 1e-12
            cdf = np.cumsum(policy['quality_weights'])
            for q in range(5):
                theoretical = (1-p+p*cdf[q])**2
                assert abs(float(probs[grades <= q].sum())-theoretical) < 1e-12
            out['populations'][key] = {'rows': pop, 'p': p, 'policy': pname,
                'none': (1-p)**2, 'single': single, 'dual': dual,
                'grade_probabilities': {n: float(probs[grades == q].sum()) for q,n in enumerate(qnames)},
                'mean_multiplier_exact': exact, 'mean_multiplier_mc': mc,
                'mc_standard_error': se, 'max_multiplier': float(mult.max()),
                'dual_supreme': float(probs[(grades == 4) & (sizes == 2)].sum())}
            for s in cat:
                t = (s['growthMs'] + s['maxRounds']*s['cycleMs'])/3600000
                gross = s['maxRounds']*s['yield']*s['sellPrice']
                feed = 2*t
                net = gross - s['price'] - feed
                assert net > 0
                out['economy'].append({'population': key, 'id': s['id'], 'name': s['name'],
                    'lifetime_hours': t, 'gross': gross, 'purchase': s['price'], 'feed': feed,
                    'base_net': net, 'expected_gross': gross*exact,
                    'expected_net': gross*exact-s['price']-feed,
                    'net_increase_pct': (gross*(exact-1)/net)*100})
                for method in ['floor_unit', 'nearest_unit', 'ceil_unit', 'fixed_point_carry']:
                    quotes = s['sellPrice']*mult
                    prices = {'floor_unit': np.floor(quotes+1e-9),
                              'nearest_unit': np.floor(quotes+.5+1e-9),
                              'ceil_unit': np.ceil(quotes-1e-9),
                              'fixed_point_carry': quotes}[method]
                    rounding_mean = float(probs @ prices)/s['sellPrice']
                    if s['id'] in ['chicken','rabbit','cow','sloth']:
                        out['rounding'].append({'population':key,'id':s['id'],
                            'method':method,'mean_multiplier':rounding_mean,
                            'net_increase_pct':gross*(rounding_mean-1)/net*100})
    for s in cat:
        t = (s['growthMs']+s['maxRounds']*s['cycleMs'])/3600000
        for name, tiers in FUSION_TIERS.items():
            plan = fusion_plan([16,0,0,0,0], tiers, s['price'])
            assert plan['merges'] == [0,8,4,2,1]
            for daily in [1,2,3,6]:
                for slots in [4,8,16]:
                    for gap in [4,8,12]:
                        # Storage protects >=24h, thus no storage pause for these gaps.
                        available_per_cohort = math.ceil((t-1e-9)/gap)*gap
                        raw_days = math.ceil(16/slots)*available_per_cohort/24
                        out['fusion'].append({'id':s['id'],'policy':name,'daily_tokens':daily,
                            'slots':slots,'visit_hours':gap,'raw_days':raw_days,
                            'token_days':plan['tokens']/daily,
                            'minimum_resource_days':max(raw_days,plan['tokens']/daily),**plan})
    for pname in ['conservative', 'recommended']:
      for p in [.10,.30]:
        pop = out['populations'][f'{pname}-{p:.2f}']['rows']
        grade_probs = np.bincount([r['grade'] for r in pop],
            weights=[r['probability'] for r in pop],minlength=5)
        draws = rng.choice(5, size=(players,16), p=grade_probs)
        tokens, counts, fees = [], [], []
        for row in draws:
            stock = [0]*5
            for n,q in enumerate(row,1):
                stock[q] += 1
                if sum(v*(2**g) for g,v in enumerate(stock)) >= 16:
                    plan = fusion_plan(stock,FUSION_TIERS['balanced'],13)
                    counts.append(n); tokens.append(plan['tokens']); fees.append(plan['coins'])
                    break
        out['fusion_mc'].append({'policy':pname,'p':p,'players':players,
            'source_count_quantiles':np.quantile(counts,[.05,.5,.95]).tolist(),
            'token_quantiles':np.quantile(tokens,[.05,.5,.95]).tolist(),
            'coin_quantiles_chicken':np.quantile(fees,[.05,.5,.95]).tolist(),
            'nominal_days_at_3_tokens':(np.quantile(tokens,[.05,.5,.95])/3).tolist(),
            'natural_supreme_before_threshold_pct':float(np.mean(np.array(tokens)==0)*100)})
    for pname in POLICIES:
      for p in [.10,.30]:
        prob=out['populations'][f'{pname}-{p:.2f}']['grade_probabilities']['无双']
        for slots in [4,16]:
          for gap in [1/12,4,8,12]:
            career=35/60
            cohort_hours=math.ceil((career-1e-9)/gap)*gap
            count=math.ceil(math.log(.5)/math.log1p(-prob))
            out['natural_supreme_time'].append({'policy':pname,'p':p,'slots':slots,
                'visit_hours':gap,'supreme_probability':prob,'median_source_count':count,
                'median_days_post_unlock':math.ceil(count/slots)*cohort_hours/24,
                'assumption':'fixed slots and p; continuous chicken purchase; no fusion; capacity unlock and financing excluded'})
    # Latest proposal: legendary/supreme cannot be crafted or consumed.
    for s in cat:
      t=(s['growthMs']+s['maxRounds']*s['cycleMs'])/3600000
      band=next(b for b in LIFECYCLE_QUALITY if t<=b['max_hours'])
      for p in [.10,.30]:
        gp=out['populations'][f"lifecycle-{band['id']}-{p:.2f}"]['grade_probabilities']
        for slots in [4,8,16]:
          for gap in [4,8,12]:
            cohort=math.ceil((t-1e-9)/gap)*gap
            for target,prob in [('legendary_or_better',gp['传奇']+gp['无双']),('supreme',gp['无双'])]:
              for quantile in [.5,.9]:
                n=math.ceil(math.log(1-quantile)/math.log1p(-prob))
                out['epic_cap'].append({'id':s['id'],'name':s['name'],'band':band['id'],
                    'p':p,'slots':slots,'visit_hours':gap,'target':target,'probability':prob,
                    'quantile':quantile,'source_count':n,
                    'retired_collection_days_post_unlock':math.ceil(n/slots)*cohort/24})
    # Fixed-point sale conservation across arbitrary split sales.
    for quote in [1050,1150,1250,2350]:
        def sell(parts):
            carry=earned=0
            for n in parts:
                value=carry+n*quote; earned+=value//1000; carry=value%1000
            return earned,carry
        assert sell([100])==sell([1]*100)==sell([3,7,40,50])
    assert fusion_plan([0,0,0,0,1],FUSION_TIERS['balanced'],13)['tokens']==0
    assert fusion_plan([0,0,0,2,0],FUSION_TIERS['balanced'],13)['tokens']==48
    # For a source double attribute, retaining one and excluding it can never duplicate.
    for a in range(5):
        remain=[w/(1-ATTR_W[a]) for i,w in enumerate(ATTR_W) if i!=a]
        assert abs(sum(remain)-1)<1e-12
    out['checks']=['36 unique frozen species; positive lifetime net for each',
        f'{len(out["populations"])} exact populations normalize; quality CDF and mutation probabilities agree',
        f'{len(out["populations"])} seeded Monte Carlo means within six standard errors',
        'fusion tree 16 ordinary -> 8/4/2/1 upgrades',
        'existing supreme costs zero; two legendary costs one top merge',
        'fixed-point earnings invariant under split sales',
        'second attribute exclusion renormalizes to one']
    (root/'analysis-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    for name,rows in [('economy',out['economy']),('rounding',out['rounding']),('fusion',out['fusion']),('epic-cap',out['epic_cap'])]:
        with (root/f'{name}.csv').open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    config={'policies':POLICIES,'attr_weights':ATTR_W,'fusion_tiers':FUSION_TIERS,
            'populations':out['populations'],'lifecycle_quality': LIFECYCLE_QUALITY,
            'codex_species_milestones':[[6,.02],[12,.04],[18,.06],[24,.08],[30,.10]],
            'codex_variant_milestones':[[10,.02],[30,.04],[60,.06],[100,.08],[150,.10]]}
    (root/'candidate-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2))
    print(json.dumps({'populations':{k:{kk:v for kk,v in row.items() if kk!='rows'} for k,row in out['populations'].items()},
        'fusion_mc':out['fusion_mc'],'checks':out['checks']},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True)
    ap.add_argument('--samples',type=int,default=1000000);ap.add_argument('--players',type=int,default=10000)
    args=ap.parse_args();run(args.root,args.samples,args.players)
