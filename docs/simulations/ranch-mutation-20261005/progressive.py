"""Compare merge arities without touching any game state. JD Cloud only."""
import argparse, csv, json, math
from pathlib import Path
import numpy as np

ARITIES={'pair':[0,2,2,2,2],'progressive':[0,2,2,3,3]}
FEES=[0,.10,.25,.50,1.0]
TOKENS=[0,0,3,12,48]
REROLL=[0,1,2,4,8]

def weights(arity):
    w=[1]
    for n in arity[1:]:w.append(w[-1]*n)
    return w

def plan(stock,arity,target=4):
    stock=list(stock);counts=[0]*5
    def take(q):
        if stock[q]:stock[q]-=1;return
        if q==0:raise ValueError('insufficient same-species materials')
        for _ in range(arity[q]):take(q-1)
        counts[q]+=1
    take(target)
    return counts

def run(root):
    a=json.loads((root/'analysis-results.json').read_text())
    rng=np.random.default_rng(20261005)
    out={'seed':20261005,'arity':ARITIES,'fusion_tokens':TOKENS,'reroll_surcharge':REROLL,
         'rules':[],'species':[],'first_material_samples':[]}
    for name,arity in ARITIES.items():
        w=weights(arity);counts=plan([w[4],0,0,0,0],arity)
        assert counts==([0,8,4,2,1] if name=='pair' else [0,18,9,3,1])
        token=sum(n*c for n,c in zip(counts,TOKENS))
        extra=sum(n*c for n,c in zip(counts,REROLL))
        out['rules'].append({'rule':name,'ordinary_required':w[4],
            'upgrade_counts':counts,'tokens':token,'all_steps_reroll_tokens':token+extra,
            'last_step_reroll_tokens':token+REROLL[4],
            'nominal_token_days':token/3,'chicken_coins':sum(n*math.ceil(13*f-1e-12) for n,f in zip(counts,FEES))})
        for s in a['source']['catalog']:
            career=(s['growthMs']+s['maxRounds']*s['cycleMs'])/3600000
            for slots in [4,8,16]:
                for gap in [4,8,12]:
                    raw=math.ceil(w[4]/slots)*math.ceil((career-1e-9)/gap)*gap/24
                    out['species'].append({'rule':name,'id':s['id'],'name':s['name'],
                        'slots':slots,'visit_hours':gap,'raw_material_days_after_unlock':raw,
                        'token_days':token/3,'coins':sum(n*math.ceil(s['price']*f-1e-12) for n,f in zip(counts,FEES)),
                        'minimum_resource_days':max(raw,token/3)})
        for policy in ['conservative','lifecycle-short','lifecycle-medium','lifecycle-long','lifecycle-slow']:
            for p in [.1,.3]:
                pop=a['populations'][f'{policy}-{p:.2f}']['rows']
                probs=np.bincount([x['grade'] for x in pop],weights=[x['probability'] for x in pop],minlength=5)
                draws=rng.choice(5,size=(10000,w[4]),p=probs)
                material=[];cost=[]
                for row in draws:
                    stock=[0]*5
                    for n,q in enumerate(row,1):
                        stock[q]+=1
                        if sum(c*z for c,z in zip(stock,w))>=w[4]:
                            count=plan(stock,arity)
                            material.append(n);cost.append(sum(c*z for c,z in zip(count,TOKENS)));break
                out['first_material_samples'].append({'rule':name,'policy':policy,'p':p,'samples':10000,
                    'sources_p05_p50_p95':np.quantile(material,[.05,.5,.95]).tolist(),
                    'tokens_p05_p50_p95':np.quantile(cost,[.05,.5,.95]).tolist(),
                    'limitation':'first sufficient material stock only; not actual player time or targeted attributes'})
    for q in range(1,5):
        stock=[0]*5;stock[q-1]=ARITIES['progressive'][q]
        count=plan(stock,ARITIES['progressive'],q)
        assert count[q]==1 and sum(count)==1
    assert out['rules'][1]['ordinary_required']==36
    assert out['rules'][1]['tokens']==111 and out['rules'][1]['chicken_coins']==106
    out['checks']=['same grade, same species; 2/2/3/3 arity validated',
        'all ordinary: 36 sources, 31 upgrades, 111 tokens, 106 chicken coins',
        'existing higher grades shorten the recipe; no grades consumed twice',
        '200000 seeded first-material samples; not time percentiles']
    (root/'progressive-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    with (root/'progressive.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(out['species'][0]));writer.writeheader();writer.writerows(out['species'])
    print(json.dumps({'rules':out['rules'],'samples':out['first_material_samples']},ensure_ascii=False,indent=2))

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True)
    run(ap.parse_args().root)
