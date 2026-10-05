"""Read alpha only; emit actual frame bounds without editing source pixels."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

def bands(values,threshold,gap):
    points=np.where(values>threshold)[0]
    result=[];start=last=int(points[0])
    for value in points[1:]:
        if value-last>gap:result.append((start,last));start=int(value)
        last=int(value)
    result.append((start,last))
    return result

root=Path(__file__).parent/'public/actions'
result={}
# Reviewed nose/beak contact points in source pixels; horns and ears are not mouths.
mouths={'goat':[(1280,454),(1267,822)],'rabbit':[(1294,425),(1288,765)],'chicken':[(1277,409),(1244,791)]}
for species in ('goat','rabbit','chicken'):
    image=Image.open(root/(species+'-feeding-v1.png'))
    alpha=np.asarray(image)[:,:,3]>200
    groups=bands(alpha.sum(axis=1),8,10)
    assert len(groups)==2,(species,groups)
    split=(groups[0][1]+groups[1][0])//2
    rows=[]
    for stage,(lo,hi) in enumerate(((0,split),(split,image.height))):
        ranges=bands(alpha[lo:hi].sum(axis=0),2,5)
        assert len(ranges)==4,(species,ranges)
        cuts=[0]+[(ranges[i][1]+ranges[i+1][0])//2 for i in range(3)]+[image.width]
        poses=[]
        for index in range(4):
            left,right=cuts[index:index+2]
            ys,xs=np.where(alpha[lo:hi,left:right])
            x0=max(left,left+int(xs.min())-3);x1=min(right,left+int(xs.max())+4)
            y0=max(lo,lo+int(ys.min())-3);y1=min(hi,lo+int(ys.max())+4)
            ground=lo+int(ys.max())
            anchor=left+float(xs.min())+float(xs.max()-xs.min())*.4
            low=alpha[max(y0,ground-int((y1-y0)*.45)):ground+1,left:right]
            ny,nx=np.where(low)
            near=nx>=nx.max()-5
            tipx=left+float(nx[near].mean())
            tipy=max(y0,ground-int((y1-y0)*.45))+float(ny[near].mean())
            if index==2:tipx,tipy=mouths[species][stage]
            poses.append({'x':x0,'y':y0,'w':x1-x0,'h':y1-y0,'ground':ground,'anchor':round(anchor,2),'tip':[round(tipx-anchor,2),round(tipy-ground,2)]})
        rows.append(poses)
    result[species]={'width':image.width,'height':image.height,'rows':rows}
(root/'manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
print('Verified 24 independent frames; actual alpha gaps determine cuts.')
