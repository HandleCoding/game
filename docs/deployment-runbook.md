# 发布、迁移与恢复

当前正式采用版本目录 + PostgreSQL。查看实际版本：

```sh
systemctl show pair-play -p WorkingDirectory -p ExecStart
curl --fail http://127.0.0.1:3210/healthz
curl --fail https://game.aicoding.ltd/healthz
```

开发环境完成实现、类型 / 构建 / 测试和浏览器验收后，再发布用户授权的版本。不要在正式发布目录编辑运行文件。开发 3211、测试 3221 与正式 3210 分开。

## 代码发布

1. 开发 git status / diff，提交已验收内容并记录提交。
2. 准备全新 /opt/pair-play/releases/版本，包含 dist、web-dist、package.json / lock、工作区 package 文件；npm ci --omit=dev --ignore-scripts 装运行依赖。发布材料不能包含开发库、.env、凭据或测试账号。
3. 备份现有 service 和正式数据库；如果新增 schema，先在开发演练并明确兼容 / 回滚边界。
4. 更改 pair-play.service 的 WorkingDirectory / ExecStart 指向新版本，保留 pairplay、3210、正式 PUBLIC_ORIGIN、/etc/pair-play/prod.env 及现有安全配置。
5. 校验 unit，daemon-reload，按活动对局选择维护时机重启 pair-play；检查本机健康、公开 HTTPS、原账号 / 会话、SSE、对局与复盘。
6. 更新 handover 和报告中的版本 / 提交 / 备份 / 已验收内容。

`scripts/prepare-release.py`、`scripts/cutover.py` 为本次从 SQLite 首次切换准备，不能当成日常部署脚本反复执行。prepare-release 读取旧 service 模板；正式已经迁移时，应从当前实际 unit 保留配置进行后续发布。

## 数据备份

```sh
cd /opt/pair-play-dev
python3 scripts/backup-postgres.py
```

备份到 /var/backups/pair-play，custom 格式数据库 dump + 角色 / 权限 SQL，目录 700、文件 600。角色文件含认证相关信息，不能展示、提交或置于网页可访问目录。此处提供手动备份工具，未声称已经设置自动备份定时器。

pg_dump 一致性备份不需要暂停普通写入。恢复演练先建独立恢复库并验证，不覆盖正式库。重要更新前保存数据库、代码和服务 / Caddy 配置，记录对应版本。

旧 SQLite 及一致性备份保留，路径在迁移报告；不再接受正式写入。旧 results 不含完整过程，恢复 / 迁移都不能补造未保存的历史。

## 本次首次数据切换

开发演练和 14 项测试通过后，准备不可变发布目录。Caddy 仅游戏域名短暂 503 维护，停止旧应用以收敛所有写入；此时再生成最新 SQLite 一致性备份，并全事务导入空正式 PostgreSQL。

保留 IDs、盐 / 哈希、会话、结果关联、活动房间；逐字段核对，转换旧快照到 v2，按游戏版本校验。启动新应用后在公网仍维护期间检查数据库健康及所有有效旧会话的身份，成功才恢复域名入口。

若入口尚未恢复且切换失败，可保留导入库供调查、恢复旧 unit 与原 SQLite 服务。入口已经开放且可能产生新写入后，不能自动退回旧 SQLite，否则会丢失新注册和游戏数据。

## 回滚与恢复

普通代码问题优先回滚到兼容当前 PostgreSQL schema 的上一代码版本，保持新玩家写入。带不可逆结构变更时使用已演练的数据处理方案，不直接覆盖备份。

新正式数据库已有写入后，旧 SQLite 仅是迁移时快照，绝不能作为直接回滚的数据源。需要暂停写入、保存新写入并制定同步 / 恢复方案；先保护新用户数据，再处理版本问题。

Caddy 配置修改先备份、validate，再 reload，保留其他域名。Milvus 和无关服务不随发布重启。新 API 单进程；扩容之前需要共享在线状态和房间归属机制。

## 故障定位

检查对应环境的 systemctl / journalctl、healthz、数据库连接和磁盘。健康接口会实际 SELECT 1。SSE 决定在线状态；登录会话不等于在线连接。

Origin / Cookie 错误检查 PUBLIC_ORIGIN、开发 ALLOWED_ORIGINS、浏览器真实 host / port。数据库凭据通过 EnvironmentFile 注入，不为排查而输出密钥。不要关闭认证或校验掩盖配置错误。
