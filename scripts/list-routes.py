import json, sys
data = json.load(open(sys.argv[1]))
print(f'count: {len(data)}')
for i, r in enumerate(data):
    rid = r.get('@id', '(no-id)')
    matches = r.get('match', [])
    host = matches[0].get('host', ['<any>']) if matches else ['<any>']
    print(f'  {i+1}. {rid}  host={host}')