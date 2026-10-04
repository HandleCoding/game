import json,os,shutil,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path('/opt/pair-play-dev');BACKUP=Path('/var/backups/pair-play')
with urllib.request.urlopen('http://127.0.0.1:3210/healthz',timeout=3) as response:
 if json.load(response).get('database')=='postgresql':raise RuntimeError('Already migrated; use the normal PostgreSQL release procedure')
manifest=json.loads((BACKUP/'v2-release-manifest.json').read_text())
release=Path(manifest['release'])
if not release.resolve().is_relative_to('/opt/pair-play/releases') or not (release/'dist/apps/api/src/main.js').exists():raise RuntimeError('Invalid prepared release')
stamp=time.strftime('%Y%m%d-%H%M%S')
unit=Path('/etc/systemd/system/pair-play.service');caddy=Path('/etc/caddy/Caddyfile')
old_unit=BACKUP/('pair-play-unit-'+stamp);old_caddy=BACKUP/('Caddyfile-'+stamp)
shutil.copy2(unit,old_unit);shutil.copy2(caddy,old_caddy)
old_unit.chmod(0o600);old_caddy.chmod(0o600)
code_backup=BACKUP/('legacy-source-'+stamp+'.tar.gz')
subprocess.run(['tar','-czf',str(code_backup),'--exclude=releases','-C','/opt','pair-play'],check=True);code_backup.chmod(0o600)
original=caddy.read_text();start=original.index('game.aicoding.ltd {');depth=0;end=None
for pos in range(original.index('{',start),len(original)):
 if original[pos]=='{':depth+=1
 elif original[pos]=='}':
  depth-=1
  if depth==0:end=pos+1;break
if end is None:raise RuntimeError('Invalid Caddy game block')
maintenance='''game.aicoding.ltd {
 header Retry-After "30"
 header Content-Type "text/html; charset=utf-8"
 respond "<!doctype html><html lang='zh-CN'><meta charset='UTF-8'><meta name='viewport' content='width=device-width'><title>一起玩</title><body style='font:18px sans-serif;padding:60px 24px;text-align:center'><h1>游戏大厅正在升级</h1><p>稍后刷新即可继续。已有账号和记录会保留。</p></body></html>" 503
}'''
candidate=BACKUP/('maintenance-'+stamp+'.caddy');candidate.write_text(original[:start]+maintenance+original[end:]);candidate.chmod(0o600)
def call(args,**kwargs):return subprocess.run(args,check=True,**kwargs)
call(['caddy','validate','--config',str(candidate),'--adapter','caddyfile'],stdout=subprocess.DEVNULL)
def restore_caddy():
 shutil.copy2(old_caddy,caddy);os.chmod(caddy,0o644);call(['systemctl','reload','caddy'])
started=False;maintenance_on=False;public_reopened=False
source=BACKUP/('final-sqlite-'+stamp+'.sqlite')
try:
 shutil.copy2(candidate,caddy);os.chmod(caddy,0o644);call(['systemctl','reload','caddy']);maintenance_on=True
 call(['systemctl','stop','pair-play'])
 call(['python3',str(ROOT/'scripts/backup-sqlite.py'),str(source)])
 env={**os.environ,'DATABASE_URL':Path('/etc/pair-play/prod.env').read_text().strip().split('=',1)[1]}
 call(['npm','run','db:import','--',str(source)],cwd=ROOT,env=env)
 shutil.copy2(ROOT/'deploy/pair-play-v2.service',unit);os.chmod(unit,0o644)
 call(['systemd-analyze','verify',str(unit)])
 call(['systemctl','daemon-reload']);call(['systemctl','start','pair-play']);started=True
 healthy=False
 for n in range(30):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3210/healthz',timeout=2) as response:body=json.load(response)
   if body.get('database')=='postgresql':healthy=True;break
  except Exception:time.sleep(.25)
 if not healthy:raise RuntimeError('New production health check failed')
 # Verify preserved sessions with real API without disclosing tokens or user fields.
 import sqlite3
 with sqlite3.connect(source) as old:
  for cookie,user_id in old.execute('SELECT token,user FROM sessions WHERE expires>?',(int(time.time()*1000),)):
   req=urllib.request.Request('http://127.0.0.1:3210/api/state',headers={'Cookie':'pair_session='+cookie})
   with urllib.request.urlopen(req,timeout=3) as response:state=json.load(response)
   if state['me']['id']!=user_id:raise RuntimeError('Preserved session identity mismatch')
 restore_caddy();maintenance_on=False;public_reopened=True
 report={'release':str(release),'sqliteBackup':str(source),'unitBackup':str(old_unit),'caddyBackup':str(old_caddy),'completedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'database':'postgresql','schemaVersion':1}
 (BACKUP/'v2-cutover-report.json').write_text(json.dumps(report));(BACKUP/'v2-cutover-report.json').chmod(0o600)
 print('Production cutover successful; original sessions verified')
 print('Backup:',source)
except Exception:
 if public_reopened:
  print('Public ingress already reopened; refusing automatic data rollback')
  raise
 # Never restore SQLite after the new service could accept writes.
 # The public ingress remains under maintenance until validation succeeds.
 if started:call(['systemctl','stop','pair-play'])
 shutil.copy2(old_unit,unit);os.chmod(unit,0o644);call(['systemctl','daemon-reload']);call(['systemctl','start','pair-play'])
 if maintenance_on:restore_caddy()
 print('Cutover failed; original service restored with its preserved SQLite data')
 raise
