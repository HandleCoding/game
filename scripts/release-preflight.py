from pathlib import Path
import subprocess
root=Path('/opt/pair-play-dev')
p=root/'docs/test-reports/20261004-architecture-migration.md'
s=p.read_text().replace('- npm run typecheck、npm run build 通过。','- npm run typecheck、npm run build 通过。\n- @fastify/static 已升级至 10.1.5，生产依赖 npm audit --omit=dev 为 0 漏洞；升级后重新完成类型检查、编译和全部 14 项测试。')
p.write_text(s)
subprocess.run(['git','rm','--cached','--ignore-unmatch','-r','scripts/__pycache__'],cwd=root,check=True)
(root/'scripts/finish-dependency-upgrade.py').unlink()
subprocess.run(['git','add','-A'],cwd=root,check=True)
subprocess.run(['git','commit','-m','Harden static serving and finish cloud migration validation'],cwd=root,check=True)
