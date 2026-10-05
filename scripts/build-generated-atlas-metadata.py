"""Inspect generated alpha without changing any image pixels. Worktree only."""
from pathlib import Path
from PIL import Image
from collections import deque
import json,subprocess,hashlib
ROOT=Path(__file__).resolve().parents[1]
assert ROOT.name=='ranch-generated-variants',ROOT
assets=ROOT/'apps/web/public/ranch/scene/variants'
metadata={};report=[]
for p in sorted(assets.glob('*-v1.png')):
 result=subprocess.run(['python3',str(ROOT/'scripts/check-elemental-atlas.py'),str(p)],capture_output=True,text=True)
 if result.returncode:
  report.append(dict(asset=p.name,error=result.stderr,approved=False));continue
 qa=json.loads(result.stdout)
 (ROOT/'docs/art'/f'{p.stem}-qa.json').write_text(json.dumps(qa))
 if qa['atRisk']:
  report.append(dict(asset=p.name,atRisk=qa['atRisk'],approved=False));continue
 im=Image.open(p).convert('RGBA');alpha=im.getchannel('A');px=alpha.load();rows=[]
 for row in range(9):
  frames=[]
  for col in range(4):
   f=qa['frames'][row*4+col];x0,y0,x1,y1=f['rect'];box=f['bounds'];assert box
   remaining={(x,y) for y in range(y0,y1) for x in range(x0,x1) if px[x,y]>=220}
   largest=[]
   while remaining:
    point=remaining.pop();component=[point];q=deque([point])
    while q:
     x,y=q.popleft()
     for n in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
      if n in remaining:remaining.remove(n);component.append(n);q.append(n)
    if len(component)>len(largest):largest=component
   assert len(largest)>150,(p.name,row,col,'No opaque body')
   bx0=min(x for x,y in largest);by0=min(y for x,y in largest)
   bx1=max(x for x,y in largest)+1;by1=max(y for x,y in largest)+1
   sx=max(x0,x0+box[0]-2);sy=max(y0,y0+box[1]-2)
   right=min(x1,x0+box[2]+2);bottom=min(y1,y0+box[3]+2)
   frames.append(dict(x=sx,y=sy,width=right-sx,height=bottom-sy,bodyWidth=bx1-bx0,bodyHeight=by1-by0,centerX=(bx0+bx1)/2-sx,ground=by1-sy))
  assert len({f['hash'] for f in qa['frames'][row*4:row*4+4]})==4,(p.name,row,'Duplicate frames')
  rows.append(dict(frames=frames))
 metadata[p.stem]=dict(url='/ranch/scene/variants/'+p.with_suffix('.webp').name,width=im.width,height=im.height,rows=rows)
 report.append(dict(asset=p.name,approved=True,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),frames=36))
out=ROOT/'apps/web/src/games/animal-ranch/generated-atlas-metadata.ts'
out.write_text('/* Read-only alpha/body analysis; never uses requested canvas dimensions. */\nimport type { GeneratedAtlas } from "./visual-sprites";\nexport const generatedAtlasMetadata: Record<string, GeneratedAtlas> = '+json.dumps(metadata,separators=(',',':'))+';\n')
(ROOT/'docs/art/coverage-report.json').write_text(json.dumps(dict(atlases=len(metadata),designs=len(metadata)*9,frames=len(metadata)*36,assets=report),indent=2))
print(json.dumps(dict(accepted=len(metadata),pending=[r['asset'] for r in report if not r['approved']])))
