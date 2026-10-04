# 发布、备份与恢复

当前正式服务 `/opt/pair-play` + `pair-play.service` + SQLite；开发服务 `/opt/pair-play-dev` + `pair-play-dev.service`。目标 PostgreSQL 的迁移需独立演练和计划，不在普通静态文件发布中顺便切库。

## 发布前

确认当前用户授权的变更范围。先在开发环境完成代码、测试与可审查结果，检查工作区差异，并记录开发提交、测试报告和发布文件列表。

```sh
cd /opt/pair-play-dev
git status --short --branch
git diff --stat
systemctl is-active pair-play pair-play-dev caddy
curl --fail --silent http://127.0.0.1:3211/healthz
curl --fail --silent http://127.0.0.1:3210/healthz
```

当前 `npm test` 见 testing-guide，不在正式工作目录启动临时服务。发布材料只包含源码、前端资源、必要配置和文档；不能包含开发数据库、artifacts、缓存、密钥或开发服务的环境文件。

## 代码与数据库备份

发布前保存正式源代码快照到权限受控的备份目录，记录时间与对应版本。正式项目当前没有 data 子目录，数据库在 `/var/lib/pair-play`；以后仍需显式排除任何私有数据文件。

SQLite 备份使用在线备份 API，或在明确维护窗口暂停服务后保存一致的数据库及 WAL / SHM 状态；运行中直接复制单个 `.sqlite` 文件可能遗漏已提交数据。备份放 `/var/backups/pair-play` 等非网页可访问位置，目录权限 700、文件 600，开发和正式备份分开。

Python 标准 sqlite3 的在线备份操作示例如下，先确定唯一目标文件和已有备份目录权限，再执行；不要把示例目标反复覆盖成唯一备份：

```python
import sqlite3
from pathlib import Path

source = Path('/var/lib/pair-play/pair-play.sqlite')
target = Path('/var/backups/pair-play/prod-具体时间.sqlite')
if target.exists():
    raise RuntimeError('备份目标已存在，请使用新的时间标识')
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
    with sqlite3.connect(target) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('备份完整性检查失败')
target.chmod(0o600)
```

这只备份数据库，不代替代码、systemd 和 Caddy 配置备份。恢复演练在受控测试数据库路径进行，不能通过恢复测试覆盖正式文件。

## 当前代码发布

1. 将已验收文件准备到独立发布暂存目录，包含明确文件清单和测试记录。
2. 备份正式代码和需要的配置；涉及数据结构时，先备份数据库并定义回滚边界。
3. 只将正式需要的源码 / 静态资源更新到 `/opt/pair-play`，不要发布 `.git`、开发数据和开发 service。正式运行配置仍为 pairplay / 3210 / `/var/lib/pair-play` / 正式 PUBLIC_ORIGIN。
4. 后端有变更时协调活动对局的维护时机，再重启 `pair-play`。纯静态文件更新通常不需要重启后端。不要因代码发布重启 Milvus 或其他无关服务。
5. 检查正式本机健康、公开 HTTPS 入口、登录、SSE、邀请、对局与复盘；记录最终结果与版本。

```sh
systemctl restart pair-play
systemctl is-active pair-play caddy
curl --fail --silent http://127.0.0.1:3210/healthz
curl --fail --silent https://game.aicoding.ltd/healthz
journalctl -u pair-play -n 80 --no-pager
```

上面的重启只在发布确有需要时执行，不能作为 Agent 初次检查时的默认操作。活跃对局重启后只保留 60 秒重连窗口，不等于对局完全无感。

如果需要更新 systemd 或 Caddy，先备份并检查实际配置，Caddy 校验通过再 reload；保留原有其他域名配置。`deploy/install.sh` 是正式首次安装脚本，不能在开发目录直接拿来启动开发服务。

## 回滚

普通代码发布失败：恢复本次发布前对应版本源码与配置，必要时重启正式服务，复查健康与用户流程。不要顺手回滚数据库覆盖发布后的真实玩家写入。

带数据库迁移的发布：在切换前明确暂停写入 / 同步方式、可逆迁移与旧版本兼容边界。新版本已有正式写入时，需要保存和处理这些写入，不能直接用旧备份覆盖。否则可能丢失玩家进度。

恢复 SQLite 文件前停止对应环境服务，只针对该环境的已验证路径操作，将备份恢复给对应运行账号；避免残留旧 WAL / SHM 与恢复文件不一致。确认完整性后启动并验证。具体恢复脚本应先在开发环境演练，不凭文档示例直接对正式路径做删除操作。

## PostgreSQL 上线前

建 `playroom_dev` / `playroom_prod` 独立数据库和角色；连接凭据在受保护配置中保存。PostgreSQL 保持本机连接，外部管理走 SSH 隧道，数据目录持久化到服务器磁盘。

开发库演练 schema、旧数据迁移、恢复、应用切换，验证数量、关系、原密码登录、会话及活动房间。正式切换避免两套存储同时各自接受写入；备份策略包括数据库与恢复所需的角色 / 权限配置。正式数据产生后再次演练恢复到独立库。

## 故障定位

先确认故障在开发还是正式环境，再检查该服务日志、健康接口、端口、磁盘和权限。HTTP 正常但玩家不在线，检查 SSE 是否连接；邀请依赖在线连接，单纯登录不等于在线。

页面显示请求来源不匹配，检查 PUBLIC_ORIGIN 与浏览器实际 scheme / host / port。HTTPS 登录 Cookie 设置依赖 PUBLIC_ORIGIN。不要通过关闭 Origin / 权限校验掩盖配置问题。

每次部署后更新 handover 与测试报告；若目标框架、数据库、目录、端口或入口实际变更，同步更新 AGENTS 和本手册。
