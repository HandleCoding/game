# 京东云游戏大厅：Agent 接手说明

用户后续指令优先。开发和测试都在京东云 `117.72.116.83` 的 `/opt/pair-play-dev`，浏览器可在电脑、手机访问云端服务。

先读 `docs/handover.md` → `docs/development-guide.md` → `docs/testing-guide.md` → `docs/git-workflow.md`。涉及架构再读 technology-decisions、multi-game-architecture、persistent-game-architecture；正式发布读 deployment-runbook。

## 实际技术栈

Vue 3 + TypeScript + Vite；Node.js + Fastify + TypeScript；PostgreSQL 18；HTTP + SSE；Caddy HTTPS。猜数字通过游戏注册表接入。短局与长期型有独立引擎 / 存档契约。一起牧场是首个长期游戏，36 种动物，结构化钱包 / 仓库 / 动物 / 流水表已实现。作物种植、偷取、赠送和 world_jobs worker 尚未实现。

- 开发源码 `/opt/pair-play-dev`，服务 `pair-play-dev.service`，回环端口 3211，数据库 `playroom_dev`。
- 正式发布目录在 `/opt/pair-play/releases/`，真实版本以 `systemctl show pair-play -p WorkingDirectory` 为准，端口 3210，数据库 `playroom_prod`。
- 两库角色隔离；环境文件 `/etc/pair-play/dev.env`、`prod.env` 不进仓库。5432 仅本机监听，远程管理走 SSH。
- 编辑 / 构建 / 测试在开发目录。正式版本使用构建产物和运行依赖；不要将开发数据、密钥或测试账号导入正式库。
- 旧根目录 server.mjs、game.mjs、public、test 是迁移前兼容参考，不是新服务入口。禁止为了运行旧脚本重新启用正式 SQLite 写入。
- Milvus 保留；不修改或重启无关服务。原已停止的 OpenClaw、Hermes、openHusky、RustDesk 不因本项目开发恢复。

## 开发约定

新游戏按注册表、独立规则和独立 Vue 组件接入；平台不处理秘密数字、牌面或作物规则。共享 contracts 只能包含公开协议。HTTP、SSE、历史复盘和恢复路径都要按玩家权限生成视图。

猜数字为字符串 `0000`–`9999`，位置命中只反馈数量。大厅无需加好友；所有在线空闲玩家可邀请，15 秒接受 / 拒绝窗口。记忆模式默认关闭；开启时进行中隐藏历史，结束后双方完整复盘。

保留日夜主题、手机 / 电脑混合对战、输入草稿 / 焦点 / 滚动、软键盘和减少动态效果。时间、随机、权限、胜负、资源都由后端决定。

使用事务、requestId、matchId / revision 实际实现一致性；不可用类型检查代替运行时校验。长期进度独立于房间，具体资源互动必须另做规则和并发测试。

## 交付

先检查 git status 和运行环境，不覆盖其他 Agent 的工作；新分支使用 `codex/` 前缀。测试只连接开发库，独立 schema，固定 3221 集成端口要加锁。

GitHub origin 为 git@github.com:HandleCoding/game.git，main 为验收后的主分支。后续开发使用 codex/功能名 分支，提交前检查 diff 和敏感文件；将已验收提交推送到对应远程分支，不 force push。Git 推送与正式发布是两个步骤；推送不能自动触发服务重启。

修改后记录实际验证、未完成项、源提交和正式版本，更新 handover。用户授权的发布按 runbook 完成，数据库迁移必须备份和验证。正式新版本已经接受写入后，不能自动退回旧 SQLite 丢失新用户。

不要在文档、提交、日志、工具输出或前端产物暴露密码、会话、连接密钥、私钥或真实玩家秘密。

## 一起牧场

游戏 ID animal-ranch，kind=persistent。动物配置唯一来源 packages/contracts/src/ranch-catalog.ts。先读 docs/animal-ranch.md、ranch-balance.md、ranch-assets.md。首版 36 个物种，禁止用重复幼崽或换名图凑数。普通离线成长按食槽和实例保存周期结算，不需要 worker。缺粮暂停，不死亡；生产存量按24小时保护窗且至少3轮。访客只读且不显示钱、仓库、流水。

schema v4 的 ranch_wallets / ranch_animals / ranch_inventory / ranch_ledger / ranch_animal_batches / ranch_inventory_lots / ranch_animal_events 与档案、动作回执在同一行锁事务内写入；不可仅修改 JSON 而绕开钱包、仓库或流水。配置修改不能追溯改已有动物参数。有限生产当前测试以20261005报告为准。

动态场景前端为 RanchScene.vue；资源计算仍在后端。手机 / 桌面 UI 验收 npm run test:ui，必须开发库与独立 schema / 3221 锁，见 testing-guide 和 ranch-scene 验收报告。不得把模拟测试说成真机测试。

## 当前牧场数值与重置边界（2.6.0）

先读ranch-balance.md最新表；成长/生产单位小时，每只30分钟耗1份，初始240份。XP逐级增加、仅收获获得XP、扩建等级金币双门槛；不要再写xp/80或每分钟一份的逻辑。食槽单位feedUnitMs保存在摘要；旧摘要缺失时按旧单位读，普通改配置不追溯已购动物。schema3扩大feed_ms预算CHECK。

唯一正式旧牧场已按用户本次明确授权重置，账号/会话/猜数字保持。任何未来清空真实进度需新的明确授权与范围，禁止例行发布附带--reset-ranch。operator文件不暴露HTTP重置接口；备份留/var/backups/pair-play私有目录，不提交。重置/恢复验收脚本ranch-reset-qa.mjs强制开发库隔离schema。当前25项回归与两内核10组尺寸通过，报告20261004-ranch-balance.md。


## HUD遮挡修复与玩法草案（2.6.1）

离线/缺粮/访客提示在左上资料牌内，禁止再浮放底部覆盖animal-picker。横屏菜单起点104px，UI验收含提示/资料牌/菜单几何遮挡检查；双指夹具须先确认命中Canvas，不要把HUD上的浏览器缩放算作游戏缩放。当前2.6.1普通代码发布未重置，报告20261004-ranch-hud-overlap.md。

animal-ranch.md末尾为3个子Agent综合玩法调研草案，尚未实施。后续互动/委托/装饰/加工奖励要守数值边界，跨玩家互助需多档案事务；不要未经授权一次性实现所有候选。


## 牧场 CDN 接入（2.6.2）
先读docs/ranch-cdn.md。正式hostname game.aicoding.ltd的公开牧场图片走static.aicoding.ltd，开发同源；API/登录/SSE仍走主站。assets.ts集中路径和回退，CSP只明确允许该CDN的图片/连接。
SVG外部图片请求200不代表已绘制；必须使用已解码data URL并复用场景缓存，商店其余图集两路排队。不要恢复直接远程SVG href；保留单帧clipPath。CDN网络/CORS/解码/45秒闲置异常回源；退出场景不额外发起回退。
scripts/ranch-cdn-qa.mjs只在开发隔离schema运行，虚拟正式hostname拦截到3221，成功图集走真实CDN，主站API绝不落到正式库。两种浏览器、实际像素检查和截图审阅必需，CDN_IDLE=1验证45秒无响应回退。控制台证书/免费额度以当前账户和官方说明为准，不承诺永久免费。


## 有限生产与名宠堂（2.7.0）
先读docs/ranch-balance.md（已替换为rulesVersion3）、animal-ranch.md本次实现段、test-reports/20261005-ranch-lifecycle.md；旧2.6节奏为历史记录。6/8有限轮次，生产完成与满存均停粮；名宠堂/出售/放生保留同一永久个体。storage禁止DELETE重插动物，批次与价格来源持久化；收藏分页仅加载活跃/目标个体，不让归档数量进入每次离线计算。新动物UUID，昵称≤12 Unicode字；公开最多6位，私有日记只给主人。
变异/前缀/符文仅预留快照，不能误报已实现。新数值只对新认养生效，旧存档先旧规则结算再保留原资产/周期，无重置。生产迁移必须维护停写、最新备份、校验；v2档案之后旧2.6 storage不兼容，发布失败保持维护做前向修复，禁止自动旧代码回滚。Git提交只包含本任务文件，保持其他Agent未提交的文档。
