import os,subprocess
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
subprocess.run(['runuser','-u','postgres','--','psql','-v','ON_ERROR_STOP=1'],input='CREATE DATABASE playroom_rehearsal OWNER playroom_prod;\nREVOKE CONNECT ON DATABASE playroom_rehearsal FROM PUBLIC;\n',text=True,check=True,stdout=subprocess.DEVNULL)
value=Path('/etc/pair-play/prod.env').read_text().strip().split('=',1)[1];url=urlsplit(value);connection=urlunsplit((url.scheme,url.netloc,'/playroom_rehearsal',url.query,url.fragment))
subprocess.run(['npm','run','db:import','--','/var/backups/pair-play/pre-migration-rehearsal-20261004.sqlite'],cwd='/opt/pair-play-dev',env={**os.environ,'DATABASE_URL':connection},check=True)
print('Production snapshot rehearsed in isolated private rehearsal database')
