"""Read-only alpha/frame-boundary inspection. Never edits or removes source PNGs."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parents[1]
results=[]
for path in sorted((root/'art/elemental-drafts').glob('*.png')):
 im=Image.open(path).convert('RGBA');alpha=im.getchannel('A');w,h=im.size
 frames=[]
 for row in range(2):
  for col in range(4):
   x0,x1=int(w*col/4),int(w*(col+1)/4);y0,y1=int(h*row/2),int(h*(row+1)/2)
   a=alpha.crop((x0,y0,x1,y1));mask=a.point(lambda n:255 if n>=32 else 0);box=mask.getbbox()
   boundary=sum(1 for x in range(a.width) for y in range(a.height) if (x<4 or x>=a.width-4 or y<4 or y>=a.height-4) and a.getpixel((x,y))>=32)
   frames.append({'stage':'adult' if row==0 else 'baby','frame':col,'cell':[x0,y0,x1-x0,y1-y0],'alphaBounds':box,'boundaryPixels':boundary,'requiresRegeneration':boundary>10})
 low,high=alpha.getextrema()
 results.append({'asset':path.name,'size':[w,h],'hasRealTransparency':low==0 and high==255,'frames':frames,'runtimeApproved':False,'reason':'Style samples only; boundary/paw baseline/animation identity require final QA before game use'})
out=root/'docs/art/draft-alpha-report.json';out.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{'asset':x['asset'],'transparent':x['hasRealTransparency'],'framesAtRisk':sum(f['requiresRegeneration'] for f in x['frames'])} for x in results]))
