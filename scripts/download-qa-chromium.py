from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request,hashlib,subprocess,zipfile
root=Path('/opt/pair-play-dev/artifacts/browser-download');root.mkdir(parents=True,exist_ok=True)
url='https://storage.googleapis.com/chrome-for-testing-public/153.0.8010.12/linux64/chrome-linux64.zip'
length=195836009;block=8*1024*1024
def part(i):
 lo=i*block;hi=min(length-1,lo+block-1);p=root/('chrome.part'+str(i))
 if p.exists() and p.stat().st_size==hi-lo+1:return p
 request=urllib.request.Request(url,headers={'Range':f'bytes={lo}-{hi}'})
 with urllib.request.urlopen(request,timeout=60) as r:
  if r.status!=206:raise RuntimeError('Official server did not return requested range')
  data=r.read()
 if len(data)!=hi-lo+1:raise RuntimeError('Incomplete download part')
 p.write_bytes(data);return p
with ThreadPoolExecutor(max_workers=6) as workers:parts=list(workers.map(part,range((length+block-1)//block)))
archive=root/'chrome-linux64.zip'
with archive.open('wb') as output:
 for p in parts:output.write(p.read_bytes())
assert hashlib.md5(archive.read_bytes()).hexdigest()=='8d9cec9d3099ecd7e826e429ec663ca9','Official archive checksum mismatch'
destination=root/'extracted';destination.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as z:
 for name in z.namelist():
  assert (destination/name).resolve().is_relative_to(destination),'Unsafe archive path'
subprocess.run(['unzip','-q','-o',str(archive),'-d',str(destination)],check=True)
print('Official current Chromium downloaded and checksum verified:',destination/'chrome-linux64/chrome')
