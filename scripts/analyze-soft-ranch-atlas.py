"""Read-only PNG analysis. Preserve ImageGen alpha; generate sprite bounds/feet metadata."""
import json
from pathlib import Path
from PIL import Image
ROOT=Path('/opt/pair-play-dev')
ASSETS=ROOT/'apps/web/public/ranch/scene/soft'
metadata=[]
for name,row_count in [(f'{age}-{group}.png',9) for age in ['adult','baby'] for group in range(4)]+[('rabbit-stages.png',2)]:
  path=ASSETS/name
  im=Image.open(path).convert('RGBA');width,height=im.size
  assert width>=400, f'Unexpected sprite width: {path}'
  pixels=im.getchannel('A').load()
  density=[sum(pixels[x,y]>90 for x in range(width)) for y in range(height)]
  gaps=[];start=None
  for y,d in enumerate(density):
   if d<=5 and start is None:start=y
   elif d>5 and start is not None:
    if start>20 and y<height-20:gaps.append((y-start,start,y))
    start=None
  chosen=sorted(sorted(gaps,reverse=True)[:row_count-1],key=lambda g:g[1])
  assert len(chosen)==row_count-1, f'Expected {row_count} separated species rows: {path}'
  boundaries=[0]+[(a+b)//2 for _,a,b in chosen]+[height]
  cw=width//4;rows=[]
  for lo,hi in zip(boundaries,boundaries[1:]):
   occupied=[y for y in range(lo,hi) if density[y]>5]
   assert occupied
   y0=max(lo,min(occupied)-2);y1=min(hi,max(occupied)+3)
   xs=[];feet=[]
   for col in range(4):
    points=[(x,y) for y in range(y0,y1) for x in range(cw) if pixels[round(col*width/4)+x,y]>90]
    assert len(points)>250,f'Missing walk frame: {path} col={col}'
    xs.extend(x for x,y in points)
    feet.append(max(y for x,y in points)+1)
   x0=max(0,min(xs)-2);x1=min(cw,max(xs)+3)
   rows.append({'x':x0,'y':y0,'width':x1-x0,'height':y1-y0,'ground':feet})
  metadata.append({'width':width,'height':height,'rows':rows})
  print(path.name,im.size,'rows',len(rows),'frames',len(rows)*4)
out=ROOT/'apps/web/src/games/animal-ranch/soft-atlas-metadata.ts'
out.write_text('/* Generated from PNG alpha, not requested canvas dimensions. */\nexport const softAtlasMetadata = '+json.dumps(metadata)+' as const;\n')
print('Validated 36 species, 72 life-stage designs, 288 walk frames; PNG files unchanged.')
