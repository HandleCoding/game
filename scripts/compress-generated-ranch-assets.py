"""Encode publishing WebP files, preserving dimensions and alpha. No visual edits."""
from pathlib import Path
from PIL import Image,ImageChops
import subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
assert ROOT.name=='ranch-generated-variants'
source=ROOT/'apps/web/public/ranch/scene/variants'
results=[]
for p in sorted(source.glob('*-v1.png')):
 out=p.with_suffix('.webp')
 subprocess.run(['ffmpeg','-y','-v','error','-threads','1','-i',str(p),'-c:v','libwebp','-lossless','0','-quality','86','-compression_level','6','-frames:v','1',str(out)],check=True)
 raw=Image.open(p).convert('RGBA');web=Image.open(out).convert('RGBA')
 assert raw.size==web.size,(p.name,'Dimensions changed')
 assert ImageChops.difference(raw.getchannel('A'),web.getchannel('A')).getbbox() is None,(p.name,'Alpha changed')
 results.append(dict(asset=out.name,rawBytes=p.stat().st_size,webpBytes=out.stat().st_size,sha256=hashlib.sha256(out.read_bytes()).hexdigest()))
(ROOT/'docs/art/compression-report.json').write_text(json.dumps(dict(rawBytes=sum(r['rawBytes'] for r in results),webpBytes=sum(r['webpBytes'] for r in results),assets=results),indent=2))
print(json.dumps(dict(files=len(results),rawBytes=sum(r['rawBytes'] for r in results),webpBytes=sum(r['webpBytes'] for r in results))))
