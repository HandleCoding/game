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

pg_dump 一致性备份不需要暂停普通写入。独立恢复演练工具为 scripts/verify-backup-restore.py（root 运行），会新建带时间戳的验证库、从 root 私有备份文件描述符读取、核对数量并删除其自身验证库；不覆盖正式库。若上线后有新写入或清理导致当前数量变化，请核查差异后基于新备份再演练，不能覆盖当前数据来迎合旧数量。恢复演练先建独立恢复库并验证，不覆盖正式库。重要更新前保存数据库、代码和服务 / Caddy 配置，记录对应版本。

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

## 经明确授权的牧场重置（2.6.0）

普通代码发布不可重置用户进度。本次用户明确允许清空唯一线上牧场，才执行：

python3 scripts/release-postgres.py --deploy --reset-ranch

--reset-ranch必须同时--deploy，预期恰好1个牧场档案；打开维护且停应用后再检查、备份最新PG dump和root私有ranch-before-reset-时间.json，并在同一事务仅重置animal-ranch钱包/动物/仓库/流水/其动作回执。原档案revision+1，账号/会话/猜数字不变。schema3食槽预算CHECK扩大至1800000000毫秒。禁止把此次用户授权当成未来可任意删玩家的授权。

仅 operator scripts/reset-ranch.mjs 调用后端 reset.ts，未注册公开接口。正式执行需要 RANCH_RESET_MAINTENANCE=1 且pair-play已停止，禁止对在线服务直接运行。restore只可用于入口尚未开放的发布失败，脚本自动局部恢复牧场，账号与其他游戏不回滚；维护打开后产生新进度时不能覆盖旧快照。恢复失败时保持维护和停机排查，不能贸然打开旧代码。日后玩家数大于1须先取得具体重置范围授权并修改操作工具的限定，不绕过数量守卫。


## 有限生产与名宠堂升级（2.7.0）

先完成独立开发schema的迁移/幂等/批次与归档测试，类型构建、数值模拟与两浏览器双端UI。正式命令：

python3 scripts/release-postgres.py --deploy --migrate-ranch-lifecycle

此旗标禁止与--reset-ranch并用。检查活动对局→只关闭游戏域名→停止正式应用→最新PG一致性备份→编译后的migration operator一次事务校验并统一v1及v2旧规则档案→启动2.7.0→核对账号/结果/档案数量与健康/目录/前端→恢复入口。操作报告仅数量，私有PG dump和服务备份仍在/var/backups/pair-play；不对外暴露连接或玩家数据。

v2档案与永久动物不兼容旧版删除重插storage：迁移一旦开始，任何部署失败保持503与停写，保存报告、做兼容当前库的前向修复。禁止自动降级旧2.6代码、覆盖PG备份或清空名宠堂来“恢复”。独立恢复备份演练仍不覆盖正式库。


### 2026-10-05 用户最新修订：现有动物也统一新规则

此修订覆盖此前“老动物保留旧周期”的内容。本次全部已有动物与新认养使用当前目录，既有幼年/生产比例等比例换算到新时间；不按新分钟周期追补旧离线，不瞬间生成多年产物。认养/出售计算基数有偿动物统一当前价、赠送仍0；原钱包/XP等级/库存和既有产物不清空。个体ID、名字、发现/归档记录保留，无法知道的历史日期仍未知。

统一转换在维护停写下只执行一次，二次无变化；游戏运行时只支持当前存档v2和规则，没有旧周期/旧返还/旧XP分支。原v1代码已移入test-v2/ranch-v1-fixture.ts，仅用于真实旧结构夹具；旧目录仅离线迁移时给既有库存定价。普通未来版本是否统一改所有动物另以用户要求为准。

启动检查首次暂停的原因是healthz仍硬编码2.6.2，服务实际能启动；现已自动读取根package版本，避免同类遗漏。第一次迁移已保留数据，保持维护后做前向更新，未回退2.6或覆盖数据库。恢复发布需--resume-caddy指向同次维护保存的原Caddyfile，仅允许/var/backups/pair-play/Caddyfile-before-*，不会将503维护配置当成要恢复的正式配置。
