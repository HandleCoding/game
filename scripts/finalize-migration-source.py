import json
from pathlib import Path
p=Path('/opt/pair-play-dev')
cut=p/'scripts/cutover.py';s=cut.read_text()
s=s.replace("manifest=json.loads", """with urllib.request.urlopen('http://127.0.0.1:3210/healthz',timeout=3) as response:
 if json.load(response).get('database')=='postgresql':raise RuntimeError('Already migrated; use the normal PostgreSQL release procedure')
manifest=json.loads""")
s=s.replace('started=False;maintenance_on=False','started=False;maintenance_on=False;public_reopened=False')
s=s.replace('restore_caddy();maintenance_on=False','restore_caddy();maintenance_on=False;public_reopened=True')
s=s.replace("except Exception:\n # Never restore","except Exception:\n if public_reopened:\n  print('Public ingress already reopened; refusing automatic data rollback')\n  raise\n # Never restore")
cut.write_text(s)
for name in ['type-legacy-engine.py','fix-types.py','fix-build.py','fix-frontend-state.py','configure-dev-v2.py','generalize-game-views.py','fix-public-core.py','fix-guess-view-type.py','strengthen-migration-checks.py']:
 f=p/'scripts'/name
 if f.exists():f.unlink()
audit=json.loads((p/'docs/test-reports/20261004-runtime-audit.json').read_text())
print('Runtime dependency audit:',audit.get('metadata',{}).get('vulnerabilities'))
for name in ['technology-decisions.md','multi-game-architecture.md','persistent-game-architecture.md']:
 f=p/'docs'/name;s=f.read_text()
 title_end=s.index('\n')
 status="""

> 2026-10-04 实施状态：Vue / TypeScript / Vite、Fastify / TypeScript、PostgreSQL、游戏注册、v2 快照、事务和动作去重已落地；开发及正式环境见 [handover](handover.md)，最终数据切换见 [迁移报告](test-reports/20261004-architecture-migration.md)。本文保留原设计和扩展说明，旧的“尚未迁移”表述属于迁移前状态。尚未完成具体农场 / 牧场、经济表、worker 和多实例协调，不能视为全部未来玩法已实现。
"""
 # Preserve original design as history, explicit up-to-date entry point takes precedence.
 f.write_text(s[:title_end]+status+s[title_end:])
print('Temporary source transformation helpers removed; architecture status updated')
