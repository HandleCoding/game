import json
from pathlib import Path
from PIL import Image
root=Path('/opt/pair-play-dev');metadata=[]
for p in sorted((root/'apps/web/public/ranch/scene').glob('animals-*.png')):
 im=Image.open(p).convert('RGBA');width,height=im.size;pixels=im.getchannel('A').load()
 density=[sum(pixels[x,y]>90 for x in range(width)) for y in range(height)]
 gaps=[];start=None
 for y,d in enumerate(density):
  if d<=5 and start is None:start=y
  elif d>5 and start is not None:
   if start>30 and y<height-30:gaps.append((y-start,start,y))
   start=None
 chosen=sorted(sorted(gaps,reverse=True)[:8],key=lambda g:g[1])
 assert len(chosen)==8
 boundaries=[0]+[(a+b)//2 for _,a,b in chosen]+[height];rows=[]
 for lo,hi in zip(boundaries,boundaries[1:]):
  occupied=[y for y in range(lo,hi) if density[y]>5]
  rows.append([max(lo,min(occupied)-3),min(hi,max(occupied)+4)])
 metadata.append({'width':width,'height':height,'rows':rows})
 print(p.name,rows,'gaps',chosen)
(root/'apps/web/src/games/animal-ranch/atlas-metadata.ts').write_text('export const atlasMetadata = '+json.dumps(metadata)+' as const;\n')
