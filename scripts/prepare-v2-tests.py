from pathlib import Path
p=Path('/opt/pair-play-dev');d=p/'test-v2';d.mkdir(exist_ok=True)
s=(p/'test/game.test.mjs').read_text().replace("from '../game.mjs'","from '../apps/api/src/games/guess-number/engine.js'")
(d/'game.test.ts').write_text(s)
s=(p/'test/server.test.mjs').read_text()
s=s.replace("import {spawn} from 'node:child_process';","import {spawn} from 'node:child_process';\nimport pg from 'pg';\nimport {randomBytes} from 'node:crypto';")
s=s.replace(" const dir=await mkdtemp(join(tmpdir(),'pair-play-test-')),url='http://127.0.0.1:3221';",""" const connection=process.env.DATABASE_URL;if(!connection||!new URL(connection).pathname.endsWith('/playroom_dev'))throw new Error('Integration tests require isolated development database');
 const admin=new pg.Pool({connectionString:connection}),schema='test_'+randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);
 const url='http://127.0.0.1:3221';
""")
s=s.replace("['server.mjs']","['dist/apps/api/src/main.js']").replace("DATA_DIR:dir","PGSCHEMA:schema,HOST:'127.0.0.1',PUBLIC_ORIGIN:''")
s=s.replace("await rm(dir,{recursive:true,force:true});","await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();")
(d/'server.test.ts').write_text(s)
print('Existing 11 tests adapted to new engine and real PostgreSQL service')
