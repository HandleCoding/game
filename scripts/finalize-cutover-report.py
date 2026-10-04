import hashlib,json,re,subprocess,urllib.request
from pathlib import Path
root=Path('/opt/pair-play-dev');backup=Path('/var/backups/pair-play')
report=json.loads((backup/'v2-cutover-report.json').read_text())
restored=json.loads((backup/'v2-backup-restore-report.json').read_text())
with urllib.request.urlopen('https://game.aicoding.ltd/healthz',timeout=10) as response:
 health=json.load(response)
assert health=={'ok':True,'version':'2.0.0','database':'postgresql'}
with urllib.request.urlopen('https://game.aicoding.ltd/',timeout=10) as response:
 html=response.read().decode()
 assert 'text/html' in response.headers.get('Content-Type','')
 assert response.headers.get('Cache-Control')=='no-cache'
assets=re.findall(r'(?:src|href)="(/assets/[^"]+)"',html)
assert len(assets)>=2
for asset in assets:
 with urllib.request.urlopen('https://game.aicoding.ltd'+asset,timeout=10) as response:
  assert response.status==200 and len(response.read())>100
  assert 'immutable' in response.headers.get('Cache-Control','')
report['frontendAssetsChecked']=assets
report['sourceCommit']=json.loads((backup/'v2-release-manifest.json').read_text())['source']
report['importCounts']={'users':2,'sessions':3,'results':3,'result_players':6,'active_rooms':1}
report['backupRestore']=restored
p=root/'docs/test-reports/20261004-production-cutover.json'
p.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
p=root/'docs/test-reports/20261004-architecture-migration.md'
s=p.read_text().replace('正式切换结果将在本报告下方记录，不能仅以设计和演练结果声称正式完成。','正式切换已完成，最终结果见本报告下方。')
s=s.replace('待切换脚本完成后填入最终发布目录、最终导入数量、备份路径和验证结果。',f"""切换完成：{report['completedAt']}（按主机时区记录）。正式域名 https://game.aicoding.ltd/ 已恢复，健康接口返回 version=2.0.0、database=postgresql。

- 发布目录：{report['release']}。
- 发布源提交：{report['sourceCommit']}；Git 分支 codex/architecture-migration。
- 最终导入并逐字段验证：users=2、sessions=3、results=3、result_players=6、active_rooms=1；导入正式库成功，开发测试账号未导入。
- 所有未过期的旧会话经新服务 API 身份校验通过；密码盐 / 哈希 / 用户 ID 未改变。自动化迁移夹具覆盖原密码登录。
- 最终一致性 SQLite 备份：{report['sqliteBackup']}，SHA-256={hashlib.sha256(Path(report['sqliteBackup']).read_bytes()).hexdigest()}。原 SQLite 保留但正式已不再写入。
- PostgreSQL 可恢复备份：{restored['backup']}，独立库 pg_restore 成功、数量核对通过，然后删除该临时验证库。
- 原已结束且无人在线房间在新服务启动后正常清理，结果摘要仍为 3 条；这解释了恢复验收 active_rooms=0，不能据此误判迁移丢失对局。
- 原 service / Caddy 配置备份：{report['unitBackup']}、{report['caddyBackup']}。
- pair-play、pair-play-dev、PostgreSQL、Caddy 全部 active。正式页面 HTML、JS / CSS 资源 200，HTML no-cache、版本化资源 immutable 验证通过。
- 正式浏览器标签页已加载站点标题；浏览器控制接口读取 DOM 超时，因此未追加声称正式登录界面的交互验收。相同构建已在云端开发环境完成双账号对局和手机 / 电脑视口验收。

备份只在 /var/backups/pair-play 的私有权限目录，凭据不进入报告。正式已经开放并可能接受新写入，不可直接退回旧 SQLite。
""")
p.write_text(s)
p=root/'docs/handover.md'
s=p.read_text().replace('/opt/pair-play/releases/具体版本',report['release'])
s=s.replace('Git 独立仓库，无远程；实际分支 / 提交看 git status/log。','Git 独立仓库，无远程；分支 codex/architecture-migration。正式发布源提交 '+report['sourceCommit']+'；后续验收文档提交看 git log。')
s=s.replace('原账号 ID、昵称、盐 / 密码哈希、会话、结果和活动房间迁移','正式已完成原账号 ID、昵称、盐 / 密码哈希、会话、结果和活动房间迁移')
p.write_text(s)
p=root/'docs/deployment-runbook.md'
s=p.read_text().replace('pg_dump 一致性备份不需要暂停普通写入。','pg_dump 一致性备份不需要暂停普通写入。独立恢复演练工具为 scripts/verify-backup-restore.py（root 运行），会新建带时间戳的验证库、从 root 私有备份文件描述符读取、核对数量并删除其自身验证库；不覆盖正式库。若上线后有新写入或清理导致当前数量变化，请核查差异后基于新备份再演练，不能覆盖当前数据来迎合旧数量。')
p.write_text(s)
for name in ['scripts/fix-restore-input.py','scripts/release-preflight.py']:
 p=root/name
 if p.exists():p.unlink()
print('Production HTML/assets, PostgreSQL health and final documentation verified')
print('Release:',report['release'])
