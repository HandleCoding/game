import sqlite3,sys
from pathlib import Path
source=Path('/var/lib/pair-play/pair-play.sqlite')
target=Path(sys.argv[1])
if not target.is_absolute() or not target.is_relative_to('/var/backups/pair-play') or target.exists():raise RuntimeError('Invalid or existing backup destination')
with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as src:
 with sqlite3.connect(target) as dst:
  src.backup(dst)
  if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Backup integrity failed')
target.chmod(0o600)
with sqlite3.connect(target) as db:
 counts={t:db.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in ['users','sessions','results','result_players','active_rooms']}
print('Consistent private backup created; counts:',counts)
