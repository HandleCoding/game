"""Prepare and optionally deploy a PostgreSQL release without copying development data.
Run as root: python3 scripts/release-postgres.py [--deploy]
Only additive, backward-compatible schema changes may use automatic code rollback.
"""
import json,os,re,shutil,subprocess,sys,time,urllib.request,shlex
from pathlib import Path
ROOT=Path('/opt/pair-play-dev');BACKUP=Path('/var/backups/pair-play')
def call(args,**kw):return subprocess.run(args,check=True,**kw)
def sql(query):
 result=call(['runuser','-u','postgres','--','psql','-X','-A','-t','--dbname=playroom_prod','-c',query],stdout=subprocess.PIPE,text=True)
 return result.stdout.strip()
def counts():return json.loads(sql("SELECT json_build_object('users',(SELECT count(*) FROM users),'sessions',(SELECT count(*) FROM sessions),'results',(SELECT count(*) FROM results),'result_players',(SELECT count(*) FROM result_players),'persistent_profiles',(SELECT count(*) FROM persistent_profiles))"))
def health():
 with urllib.request.urlopen('http://127.0.0.1:3210/healthz',timeout=3) as r:return json.load(r)
if health().get('database')!='postgresql':raise RuntimeError('This procedure requires an already migrated PostgreSQL service')
lifecycle_requested='--migrate-ranch-lifecycle' in sys.argv
mutation_requested='--ranch-mutations' in sys.argv
reset_requested='--reset-ranch' in sys.argv
if (lifecycle_requested or mutation_requested) and reset_requested:raise RuntimeError('Lifecycle migration must preserve progress; reset flag forbidden')
if (lifecycle_requested or mutation_requested) and '--deploy' not in sys.argv:raise RuntimeError('Lifecycle migration requires deploy')
if version_guard:=int(sql("SELECT count(*) FROM persistent_profiles WHERE game_id='animal-ranch' AND version=1")):
 if '--deploy' in sys.argv and not lifecycle_requested:raise RuntimeError('Use explicit lifecycle migration flag for v1 ranch profiles')
if '--deploy' in sys.argv and int(sql('SELECT max(version) FROM schema_migrations'))<5 and not mutation_requested:raise RuntimeError('Schema5 requires --ranch-mutations with latest backup and forward repair')
if reset_requested and '--deploy' not in sys.argv:raise RuntimeError('Reset requires an explicit deploy')
if reset_requested and int(sql("SELECT count(*) FROM persistent_profiles WHERE game_id='animal-ranch'"))!=1:raise RuntimeError('Expected exactly one ranch player; reset aborted')
source=call(['git','rev-parse','HEAD'],cwd=ROOT,stdout=subprocess.PIPE,text=True).stdout.strip()
if call(['git','status','--porcelain','--untracked-files=no','--','apps','packages','scripts','package.json','package-lock.json'],cwd=ROOT,stdout=subprocess.PIPE,text=True).stdout.strip():raise RuntimeError('Commit or isolate changes before release')
if call(['git','ls-files','--others','--exclude-standard','apps','packages','scripts'],cwd=ROOT,stdout=subprocess.PIPE,text=True).stdout.strip():raise RuntimeError('Untracked runtime source must be committed before release')
package=json.loads((ROOT/'package.json').read_text());version=package['version']
if not (ROOT/'dist/apps/api/src/main.js').exists() or not (ROOT/'web-dist/index.html').exists():raise RuntimeError('Build first')
release=Path('/opt/pair-play/releases')/('v'+version+'-'+time.strftime('%Y%m%d-%H%M%S'))
release.mkdir(parents=True,exist_ok=False)
for name in ['package.json','package-lock.json']:shutil.copy2(ROOT/name,release/name)
for name in ['dist','web-dist']:shutil.copytree(ROOT/name,release/name)
for name in ['apps/api','apps/web','packages/contracts']:
 (release/name).mkdir(parents=True)
 shutil.copy2(ROOT/name/'package.json',release/name/'package.json')
call(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=release)
manifest={'sourceCommit':source,'release':str(release),'version':version}
print('Prepared PostgreSQL release:',release)
if '--deploy' not in sys.argv:sys.exit(0)
playing=int(sql("SELECT count(*) FROM active_rooms WHERE snapshot->'engine'->>'phase' IN ('playing','secrets','dice')"))
if playing:raise RuntimeError('Active matches detected; release prepared, deploy when they finish')
if not reset_requested and not lifecycle_requested and not mutation_requested:
 call(['python3',str(ROOT/'scripts/backup-postgres.py')],cwd=ROOT)
 manifest['databaseBackup']=str(sorted(BACKUP.glob('postgres-prod-*.dump'))[-1])
stamp=time.strftime('%Y%m%d-%H%M%S')
unit=Path('/etc/systemd/system/pair-play.service');caddy=Path('/etc/caddy/Caddyfile')
old_unit=BACKUP/('pair-play-before-'+stamp+'.service');old_caddy=BACKUP/('Caddyfile-before-'+stamp)
resume=[a.split('=',1)[1] for a in sys.argv if a.startswith('--resume-caddy=')]
resume_source=Path(resume[0]).resolve() if resume else caddy
if resume and (not (lifecycle_requested or mutation_requested) or resume_source.parent!=BACKUP.resolve() or not resume_source.name.startswith('Caddyfile-before-') or not resume_source.is_file()):raise RuntimeError('Invalid maintenance recovery config')
shutil.copy2(unit,old_unit);old_unit.chmod(0o600);shutil.copy2(resume_source,old_caddy);old_caddy.chmod(0o600)
unit_text=unit.read_text()
unit_text=re.sub(r'^WorkingDirectory=.*$',f'WorkingDirectory={release}',unit_text,flags=re.M)
unit_text=re.sub(r'^ExecStart=.*$',f'ExecStart=/usr/bin/node {release}/dist/apps/api/src/main.js',unit_text,flags=re.M)
candidate=BACKUP/('pair-play-release-'+stamp+'.service');candidate.write_text(unit_text);candidate.chmod(0o600)
call(['systemd-analyze','verify',str(candidate)],stdout=subprocess.DEVNULL)
original=old_caddy.read_text();start=original.index('game.aicoding.ltd {');depth=0;end=None
for pos in range(original.index('{',start),len(original)):
 if original[pos]=='{':depth+=1
 elif original[pos]=='}':
  depth-=1
  if depth==0:end=pos+1;break
if end is None:raise RuntimeError('Invalid game Caddy block')
maintenance=BACKUP/('ranch-maintenance-'+stamp+'.caddy')
maintenance.write_text(original[:start]+'''game.aicoding.ltd {
 header Retry-After "20"
 header Content-Type "text/html; charset=utf-8"
 respond "<html lang='zh-CN'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>一起玩</title><body style='font:18px sans-serif;padding:60px 24px;text-align:center'><h1>牧场正在更新</h1><p>稍后刷新即可继续。</p></body></html>" 503
}'''+original[end:]);maintenance.chmod(0o600)
call(['caddy','validate','--config',str(maintenance),'--adapter','caddyfile'],stdout=subprocess.DEVNULL)
maintenance_on=False;new_started=False;opened=False;reset_done=False;lifecycle_started=False
reset_backup=BACKUP/('ranch-before-reset-'+stamp+'.json')
def ranch_operator(mode):
 env=os.environ.copy()
 for line in Path('/etc/pair-play/prod.env').read_text().splitlines():
  if line.strip() and not line.lstrip().startswith('#'):
   key,value=line.split('=',1);parsed=shlex.split(value)
   env[key]=parsed[0] if parsed else ''
 env['RANCH_RESET_MAINTENANCE']='1'
 env.pop('PGSCHEMA',None)
 call(['node',str(ROOT/'scripts/reset-ranch.mjs'),mode,str(reset_backup),'1'],cwd=ROOT,env=env)

def lifecycle_operator():
 env=os.environ.copy()
 for line in Path('/etc/pair-play/prod.env').read_text().splitlines():
  if line.strip() and not line.lstrip().startswith('#'):
   key,value=line.split('=',1);parsed=shlex.split(value);env[key]=parsed[0] if parsed else ''
 env['RANCH_LIFECYCLE_MAINTENANCE']='1';env.pop('PGSCHEMA',None)
 report=BACKUP/('ranch-lifecycle-'+stamp+'.json')
 call(['node',str(ROOT/'scripts/migrate-ranch-lifecycle.mjs'),str(report)],cwd=ROOT,env=env)
 manifest['ranchLifecycle']=json.loads(report.read_text());manifest['ranchLifecycleReport']=str(report)

def restore_caddy():
 shutil.copy2(old_caddy,caddy);caddy.chmod(0o644);call(['systemctl','reload','caddy'])
try:
 shutil.copy2(maintenance,caddy);caddy.chmod(0o644);call(['systemctl','reload','caddy']);maintenance_on=True
 # Recheck after closing public ingress, so a just-started game is not interrupted.
 if int(sql("SELECT count(*) FROM active_rooms WHERE snapshot->'engine'->>'phase' IN ('playing','secrets','dice')")):raise RuntimeError('A match started before maintenance; deploy deferred')
 before=counts()
 call(['systemctl','stop','pair-play'])
 if mutation_requested:
  # Mutation state is additive but old engines cannot safely sell priced lots or interpret fused pets.
  call(['python3',str(ROOT/'scripts/backup-postgres.py')],cwd=ROOT)
  manifest['databaseBackup']=str(sorted(BACKUP.glob('postgres-prod-*.dump'))[-1])
  mutation_before=sql("SELECT md5(COALESCE(string_agg(row_to_json(w)::text,',' ORDER BY game_id,world_id,\"user\"),'')) FROM ranch_wallets w")
  lifecycle_started=True # Forward repair only from this point; never open older code on schema5.
 if lifecycle_requested:
  # Latest consistent backup after closing ingress and stopping all application writes.
  call(['python3',str(ROOT/'scripts/backup-postgres.py')],cwd=ROOT)
  manifest['databaseBackup']=str(sorted(BACKUP.glob('postgres-prod-*.dump'))[-1])
  lifecycle_started=True
  lifecycle_operator()
 if reset_requested:
  # Closed ingress and stopped writer: capture the latest full DB before the scoped reset.
  call(['python3',str(ROOT/'scripts/backup-postgres.py')],cwd=ROOT)
  manifest['databaseBackup']=str(sorted(BACKUP.glob('postgres-prod-*.dump'))[-1])
  ranch_operator('reset');reset_done=True
  manifest['ranchReset']={'profiles':1,'backup':str(reset_backup),'scope':'animal-ranch only','balanceVersion':2}
 shutil.copy2(candidate,unit);unit.chmod(0o644);call(['systemctl','daemon-reload']);call(['systemctl','start','pair-play']);new_started=True
 healthy=False
 for _ in range(40):
  try:
   h=health()
   if h.get('version')==version and h.get('database')=='postgresql':healthy=True;break
  except Exception:pass
  time.sleep(.25)
 if not healthy:raise RuntimeError('New release health failed')
 after=counts()
 if mutation_requested:
  if int(sql("SELECT max(version) FROM schema_migrations"))<5:raise RuntimeError('Mutation schema missing')
  if int(sql("SELECT count(*) FROM ranch_features"))!=int(sql("SELECT count(*) FROM ranch_wallets")):raise RuntimeError('Mutation account initialization incomplete')
  mutation_after=sql("SELECT md5(COALESCE(string_agg(row_to_json(w)::text,',' ORDER BY game_id,world_id,\"user\"),'')) FROM ranch_wallets w")
  if mutation_before!=mutation_after:raise RuntimeError('Existing ranch wallets changed during additive migration')
  manifest['ranchMutations']={'schema':5,'walletsPreserved':True,'reset':False,'forwardRepairOnly':True}
 if lifecycle_requested:
  if int(sql("SELECT count(*) FROM persistent_profiles WHERE game_id='animal-ranch' AND version<>2")) or int(sql("SELECT count(*) FROM ranch_animals WHERE status='legacy'")):raise RuntimeError('Lifecycle migration left legacy profiles')
 if reset_requested:
  reset_check=json.loads(sql("SELECT json_build_object('wallets',(SELECT count(*) FROM ranch_wallets),'xp',(SELECT max(xp) FROM ranch_wallets),'coins',(SELECT max(coins) FROM ranch_wallets),'capacity',(SELECT max(capacity) FROM ranch_wallets),'animals',(SELECT count(*) FROM ranch_animals),'inventory',(SELECT count(*) FROM ranch_inventory),'ledger',(SELECT count(*) FROM ranch_ledger),'feedMs',(SELECT max(feed_ms) FROM ranch_wallets))"))
  if reset_check!={'wallets':1,'xp':0,'coins':800,'capacity':4,'animals':1,'inventory':0,'ledger':0,'feedMs':432000000}:raise RuntimeError('Ranch reset verification failed')
  manifest['ranchReset']['verified']=reset_check

 for name in ['users','results','result_players','persistent_profiles']:
  if before[name]!=after[name]:raise RuntimeError('Unexpected change in existing data counts: '+name)
 # Verify preserved, still-valid sessions; only IDs enter memory, never logs.
 session_json=sql("SELECT COALESCE(json_agg(json_build_object('token',token,'user',\"user\")),'[]') FROM sessions WHERE expires>(extract(epoch from clock_timestamp())*1000)::bigint")
 for session in json.loads(session_json):
  request=urllib.request.Request('http://127.0.0.1:3210/api/state',headers={'Cookie':'pair_session='+session['token']})
  with urllib.request.urlopen(request,timeout=5) as r:state=json.load(r)
  if state['me']['id']!=session['user']:raise RuntimeError('Session identity changed')
 with urllib.request.urlopen('http://127.0.0.1:3210/api/catalog',timeout=5) as r:catalog=json.load(r)
 if not any(g['id']=='animal-ranch' and g['kind']=='persistent' for g in catalog['games']):raise RuntimeError('Animal ranch absent from catalog')
 with urllib.request.urlopen('http://127.0.0.1:3210/',timeout=5) as r:html=r.read().decode()
 for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"',html):
  with urllib.request.urlopen('http://127.0.0.1:3210'+asset,timeout=5) as r:
   if r.status!=200:raise RuntimeError('Missing frontend build asset')
 manifest.update(before=before,after=after,unitBackup=str(old_unit),caddyBackup=str(old_caddy),schemaVersion=int(sql("SELECT max(version) FROM schema_migrations")),completedAt=time.strftime('%Y-%m-%dT%H:%M:%S%z'))
 report=BACKUP/'animal-ranch-release.json';report.write_text(json.dumps(manifest));report.chmod(0o600)
 restore_caddy();maintenance_on=False;opened=True
 print('Animal ranch production release successful; existing data and valid sessions verified')
 print('Release report:',report)
except Exception:
 if opened:raise
 call(['systemctl','stop','pair-play'])
 if lifecycle_started:
  # v1 storage deletes/reinserts animals and cannot safely read the new lifecycle state.
  # Preserve new relational state and maintenance; do not downgrade or restore a DB snapshot.
  report=BACKUP/('ranch-lifecycle-failed-'+stamp+'.json')
  report.write_text(json.dumps(manifest));report.chmod(0o600)
  print('Lifecycle release halted. Ingress stays in maintenance and writer stopped; forward repair required. Data retained. Report:',report)
  raise
 if reset_done:
  # Ingress has not reopened: restore ONLY the affected ranch rows, never users or guesses.
  ranch_operator('restore')

 shutil.copy2(old_unit,unit);unit.chmod(0o644);call(['systemctl','daemon-reload']);call(['systemctl','start','pair-play'])
 if maintenance_on:restore_caddy()
 print('Deployment stopped; previous PostgreSQL application restored. Account / guess data untouched; any pre-open ranch reset restored from its scoped backup.')
 raise
