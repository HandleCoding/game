from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request,hashlib,subprocess,zipfile
root=Path('/opt/pair-play-dev/artifacts/browser-download/webkit');root.mkdir(parents=True,exist_ok=True)
url='https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/webkit/2359/webkit-ubuntu-22.04.zip'
length=107492233;block=8*1024*1024
def part(i):
 lo=i*block;hi=min(length-1,lo+block-1);p=root/('webkit.part'+str(i))
 if p.exists() and p.stat().st_size==hi-lo+1:return p
 req=urllib.request.Request(url,headers={'Range':f'bytes={lo}-{hi}'})
 with urllib.request.urlopen(req,timeout=120) as r:
  if r.status!=206:raise RuntimeError('Official server ignored range')
  data=r.read()
 assert len(data)==hi-lo+1
 p.write_bytes(data);return p
with ThreadPoolExecutor(max_workers=6) as workers:parts=list(workers.map(part,range((length+block-1)//block)))
archive=root/'webkit.zip'
with archive.open('wb') as output:
 for p in parts:output.write(p.read_bytes())
destination=root/'extracted';destination.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as z:
 for name in z.namelist():assert (destination/name).resolve().is_relative_to(destination)
 assert z.testzip() is None,'Archive CRC mismatch'
subprocess.run(['unzip','-q','-o',str(archive),'-d',str(destination)],check=True)
print('Official WebKit downloaded; complete ZIP CRC verified, SHA256:',hashlib.sha256(archive.read_bytes()).hexdigest())
print('Executable:',destination/'pw_run.sh')
