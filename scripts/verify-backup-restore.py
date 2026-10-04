import json,subprocess,time
from pathlib import Path
BACKUP=Path('/var/backups/pair-play')
dumps=sorted(BACKUP.glob('postgres-prod-*.dump'))
if not dumps: raise RuntimeError('No backup')
source=dumps[-1]
database='playroom_restorecheck_'+time.strftime('%Y%m%d%H%M%S')
def run(args,**kw):
 return subprocess.run(['runuser','-u','postgres','--',*args],check=True,**kw)
def sql(db,query):
 return run(['psql','-X','-A','-t','--dbname='+db,'-c',query],stdout=subprocess.PIPE,text=True).stdout.strip()
assert database.startswith('playroom_restorecheck_')
if sql('postgres',f"SELECT count(*) FROM pg_database WHERE datname='{database}'")!='0':
 raise RuntimeError('Restore target already exists')
tables=['users','sessions','results','result_players','active_rooms','import_runs','persistent_profiles','action_receipts','world_jobs','schema_migrations','ranch_wallets','ranch_animals','ranch_inventory','ranch_ledger']
run(['createdb','--template=template0',database])
try:
 with source.open('rb') as backup_input:
  run(['pg_restore','--exit-on-error','--no-owner','--no-privileges','--dbname='+database],stdin=backup_input)
 counts={table:int(sql(database,'SELECT count(*) FROM '+table)) for table in tables}
 original={table:int(sql('playroom_prod','SELECT count(*) FROM '+table)) for table in tables}
 if counts!=original: raise RuntimeError('Restore counts differ; rerun against fresh snapshot after investigating new writes')
 report={'backup':str(source),'restoredAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'counts':counts,'verified':True,'targetWasIndependent':True}
 p=BACKUP/'v2-backup-restore-report.json';p.write_text(json.dumps(report));p.chmod(0o600)
 print('Private PostgreSQL backup restoration verified:',counts)
finally:
 run(['dropdb',database])
