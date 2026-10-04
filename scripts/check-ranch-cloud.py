import json,urllib.request,re,sys
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3211'
with urllib.request.urlopen(base+'/healthz',timeout=5) as r:h=json.load(r)
assert h['version']=='2.1.0'
with urllib.request.urlopen(base+'/api/catalog',timeout=5) as r:catalog=json.load(r)
assert {g['id'] for g in catalog['games']}=={'guess-number','animal-ranch'}
with urllib.request.urlopen(base+'/',timeout=5) as r:html=r.read().decode()
for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"',html):
 with urllib.request.urlopen(base+asset,timeout=5) as r:assert len(r.read())>100
from pathlib import Path
source=Path('/opt/pair-play-dev/packages/contracts/src/ranch-catalog.ts').read_text()
ids=re.findall(r'id: "([a-z-]+)"',source)
assert len(ids)==36
svgs={'cat','sheep','goose','fox','deer','alpaca','peacock','hedgehog','turtle','lion'}
for id in ids:
 with urllib.request.urlopen(base+'/ranch/'+id+('.svg' if id in svgs else '.png'),timeout=5) as r:
  assert r.status==200 and len(r.read())>100
print('HTML, build entry, catalog and all 36 animal assets checked:',base)
