import json, glob, subprocess, sys
d = sys.argv[1]
for w in glob.glob(d + '/sessions/workspaces/t-*/w-*/'):
    print('workspace', w.split('/')[-2])
    for args in (['status', '-s'], ['diff', '--stat']):
        out = subprocess.run(['git', '-C', w] + args, capture_output=True, text=True).stdout.strip().splitlines()
        print(' ', ' '.join(args), '->', out[-6:] if out else '(clean)')
for f in glob.glob(d + '/sessions/workspaces/t-*/w-*.jsonl'):
    L = [json.loads(l) for l in open(f)]
    print(f.split('/')[-1], len(L), [(r['kind'], (r['data'].get('tool') or r['data'].get('state') or '')) for r in L[-8:]])
