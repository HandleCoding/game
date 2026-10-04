import os,subprocess,time
from pathlib import Path
root=Path('/var/backups/pair-play');root.mkdir(mode=0o700,exist_ok=True)
stamp=time.strftime('%Y%m%d-%H%M%S');path=root/('postgres-prod-'+stamp+'.dump')
with path.open('xb') as output:
 os.chmod(path,0o600)
 subprocess.run(['runuser','-u','postgres','--','pg_dump','--format=custom','--dbname=playroom_prod'],stdout=output,check=True)
roles=root/('postgres-roles-'+stamp+'.sql')
with roles.open('xb') as output:
 os.chmod(roles,0o600)
 subprocess.run(['runuser','-u','postgres','--','pg_dumpall','--globals-only'],stdout=output,check=True)
print('Private PostgreSQL backup:',path)
