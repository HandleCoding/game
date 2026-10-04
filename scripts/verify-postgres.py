import subprocess
sql="""SELECT version();
SELECT has_database_privilege('playroom_dev','playroom_prod','CONNECT'),has_database_privilege('playroom_prod','playroom_dev','CONNECT');
SELECT datname FROM pg_database WHERE datname LIKE 'playroom%';
"""
subprocess.run(['runuser','-u','postgres','--','psql','-At'],input=sql,text=True,check=True)
