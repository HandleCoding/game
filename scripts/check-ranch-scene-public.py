import json,urllib.request
from pathlib import Path
version=json.loads(Path("package.json").read_text())["version"]
base='https://game.aicoding.ltd'
with urllib.request.urlopen(base+'/healthz',timeout=10) as r:
 health=json.load(r);assert health['version']==version and health['database']=='postgresql'
for name in ['pasture.png','animals-0.png','animals-1.png','animals-2.png','animals-3.png','feeder-states.png']:
 with urllib.request.urlopen(base+'/ranch/scene/'+name,timeout=10) as r:
  assert r.status==200 and r.headers['Content-Type'].startswith('image/png')
  assert r.read(8)==bytes([137,80,78,71,13,10,26,10])
print('Production',version,'/ PostgreSQL and all six animated-scene resources verified over HTTPS')
