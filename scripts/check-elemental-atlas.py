from PIL import Image
from pathlib import Path
import json,sys,hashlib
im=Image.open(sys.argv[1]).convert('RGBA');w,h=im.size
alpha=im.getchannel('A');px=alpha.load()
assert alpha.getextrema()[0]==0 and alpha.getextrema()[1]>=200,'Missing genuine transparent background'
density=[sum(px[x,y]>=32 for x in range(w)) for y in range(h)]
gaps=[];start=None
for y,d in enumerate(density):
 if d<=5 and start is None:start=y
 elif d>5 and start is not None:
  if start>20 and y<h-20:gaps.append((y-start,start,y))
  start=None
chosen=sorted(sorted(gaps,reverse=True)[:8],key=lambda g:g[1])
assert len(chosen)==8,'Expected nine separated species rows'
cuts=[0]+[(a+b)//2 for _,a,b in chosen]+[h]
results=[]
for row in range(9):
 lo,hi=cuts[row],cuts[row+1]
 xd=[sum(px[x,y]>=32 for y in range(lo,hi)) for x in range(w)]
 xg=[];start=None
 for x,d in enumerate(xd):
  if d<=3 and start is None:start=x
  elif d>3 and start is not None:
   if x-start>=8:xg.append((x-start,start,x))
   start=None
 xcuts=[0]
 for i in range(1,4):
  options=[g for g in xg if abs((g[1]+g[2])/2-w*i/4)<w*.11]
  gap=max(options,key=lambda g:(g[0],-abs((g[1]+g[2])/2-w*i/4))) if options else None
  xcuts.append((gap[1]+gap[2])//2 if gap else int(w*i/4))
 xcuts.append(w)
 assert xcuts==sorted(set(xcuts)),('Overlapping column cuts',row)
 for col in range(4):
  rect=(xcuts[col],cuts[row],xcuts[col+1],cuts[row+1])
  a=im.getchannel('A').crop(rect);mask=a.point(lambda n:255 if n>=32 else 0);box=mask.getbbox()
  boundary=sum(1 for x in range(a.width) for y in range(a.height) if (x<4 or x>=a.width-4 or y<4 or y>=a.height-4) and a.getpixel((x,y))>=32)
  results.append(dict(row=row,frame=col,rect=rect,bounds=box,boundary=boundary,hash=hashlib.sha256(im.crop(rect).tobytes()).hexdigest()))
report=dict(size=[w,h],alpha=im.getchannel('A').getextrema(),frames=results,atRisk=sum(f['boundary']>10 for f in results))
print(json.dumps(report))
