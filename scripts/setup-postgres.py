import os,secrets,subprocess
from pathlib import Path
conf=Path('/etc/pair-play')
conf.mkdir(mode=0o750,exist_ok=True)
for suffix,systemuser in [('dev','pairplaydev'),('prod','pairplay')]:
 role='playroom_'+suffix
 secret=secrets.token_hex(32)
 sql=f"""CREATE ROLE {role} LOGIN PASSWORD '{secret}';
CREATE DATABASE {role} OWNER {role};
REVOKE CONNECT ON DATABASE {role} FROM PUBLIC;
GRANT CONNECT ON DATABASE {role} TO {role};
"""
 subprocess.run(['runuser','-u','postgres','--','psql','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
 import grp
 f=conf/(suffix+'.env')
 f.write_text('DATABASE_URL=postgresql://'+role+':'+secret+'@127.0.0.1:5432/'+role+'\n')
 os.chown(f,0,grp.getgrnam(systemuser).gr_gid); f.chmod(0o640)
print('Independent PostgreSQL databases and protected environment files created')
