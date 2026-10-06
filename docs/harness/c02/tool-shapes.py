import json,glob,sys
from collections import Counter
d=sys.argv[1]
fs=[x for x in glob.glob(d+'/sessions/t-*.jsonl') if not x.endswith('view.jsonl')]
c=Counter(); kinds=Counter()
for l in open(fs[0]):
    r=json.loads(l); kinds[r['kind']]+=1
    if r['kind']=='action' and r['data'].get('tool') not in (None,'step'):
        c[(r['data']['tool'],json.dumps(r['data'].get('input'))[:90])]+=1
print(dict(kinds))
for k,v in c.most_common(6): print(' ',v,k)
