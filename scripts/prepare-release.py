import json,os,shutil,subprocess,time
from pathlib import Path
root=Path('/opt/pair-play-dev')
tag='v2-'+time.strftime('%Y%m%d-%H%M%S')
release=Path('/opt/pair-play/releases')/tag
release.mkdir(parents=True,exist_ok=False)
for name in ['package.json','package-lock.json']:shutil.copy2(root/name,release/name)
for name in ['dist','web-dist']:shutil.copytree(root/name,release/name)
for folder in ['apps/api','apps/web','packages/contracts']:
 (release/folder).mkdir(parents=True)
 shutil.copy2(root/folder/'package.json',release/folder/'package.json')
subprocess.run(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=release,check=True)
unit=(root/'deploy/pair-play.service').read_text()
unit=unit.replace('WorkingDirectory=/opt/pair-play',f'WorkingDirectory={release}').replace('ExecStart=/usr/bin/node /opt/pair-play/server.mjs',f'ExecStart=/usr/bin/node {release}/dist/apps/api/src/main.js')
unit=unit.replace('Environment=NODE_ENV=production','Environment=NODE_ENV=production\nEnvironmentFile=/etc/pair-play/prod.env')
(root/'deploy/pair-play-v2.service').write_text(unit)
manifest={'release':str(release),'preparedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()}
target=Path('/var/backups/pair-play/v2-release-manifest.json');target.write_text(json.dumps(manifest));target.chmod(0o600)
print('Prepared release:',release)
