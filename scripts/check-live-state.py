import sqlite3,json
from collections import Counter
with sqlite3.connect('file:/var/lib/pair-play/pair-play.sqlite?mode=ro',uri=True) as db:
 print('Live legacy counts:',{t:db.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in ['users','sessions','results','result_players','active_rooms']})
 print('Room phases:',dict(Counter(json.loads(s[0])['game']['phase'] for s in db.execute('SELECT snapshot FROM active_rooms'))))
