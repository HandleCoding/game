# 新架构接手状态

更新：2026-10-04。已完成架构和现有注册数据迁移，并按用户明确授权上线一起牧场 2.3.1。当前发布、备份与验证见 [当前食槽修正报告](test-reports/20261004-ranch-side-feeder.md)；首次数据迁移见 [迁移报告](test-reports/20261004-architecture-migration.md)。

## 环境

| 项目 | 正式 | 开发 |
| --- | --- | --- |
| 主机 | 京东云 117.72.116.83 | 同一主机 |
| 代码 | /opt/pair-play/releases/v2.3.1-20261004-152536 | /opt/pair-play-dev |
| 服务 | pair-play.service | pair-play-dev.service |
| 用户 | pairplay | pairplaydev |
| 监听 | 127.0.0.1:3210 | 127.0.0.1:3211 |
| 数据库 | playroom_prod | playroom_dev |
| 受保护配置 | /etc/pair-play/prod.env | /etc/pair-play/dev.env |
| 入口 | https://game.aicoding.ltd/ | SSH 转发后 localhost:3211 或 127.0.0.1:3211 |

PostgreSQL 18.6，数据 `/var/lib/postgresql/18/main`，5432 仅回环。两库不能相互连接。Node.js 22.22.1。开发服务一核 CPU 配额，512MB MemoryHigh / 768MB MemoryMax。Git 仓库 origin=git@github.com:HandleCoding/game.git；主分支 main，迁移分支 codex/architecture-migration 保留。后续流程读 git-workflow.md。正式发布源提交 5e6691afeeb56b27ba6e83fe0986df56953aa008；后续验收文档提交看 git log。

## 已落地

- Vue 组件化大厅、认证弹窗、邀请、在线玩家和猜数字界面；TypeScript 前后端与共享 contracts，Vite 构建，游戏界面按注册表懒加载。
- Fastify 请求 schema 与 Origin 校验，兼容原 /api/room/*；新 `POST /api/rooms/:code/actions` 使用 requestId / matchId / expectedRevision。
- 游戏注册表区分 match / persistent。创建 / 恢复按 gameId 和版本分发；平台容量使用元数据，三人测试引擎验证多人流程。
- PostgreSQL users / sessions / results / result_players / active_rooms；事务保存变化房间、一次性结算、持久化动作回执。写入失败回滚内存状态，已覆盖测试。
- 新结果记录 game_id / game_version / match_id / settings_json / review_json，参与者 outcome / score；旧结果摘要保留。
- 快照 v2 包含游戏、规则版本、对局编号、revision、成员和私有引擎状态；旧快照经导入器转换。
- 长期档案基础：首次进入唯一、行锁、时间结算接口、动作事务、请求去重、主人 / 访客视图；world_jobs 表已建，具体 worker 未启用。
- 正式已完成原账号 ID、昵称、盐 / 密码哈希、会话、结果和活动房间迁移，不导入开发测试账号。真实数据演练与测试夹具原密码登录均验证。

## 源码地图

| 目录 / 文件 | 职责 |
| --- | --- |
| apps/api/src/main.ts | Fastify 路由、校验、静态文件、启动 / 停止 |
| apps/api/src/platform/accounts.ts | 账号、scrypt、会话 |
| apps/api/src/platform/rooms.ts | 房间、在线 / 邀请、串行调度、事务、按用户广播 |
| apps/api/src/platform/db/ | PostgreSQL 连接、事务、schema migration |
| apps/api/src/platform/persistent.ts | 持续档案、时间结算、事务动作 |
| apps/api/src/games/ | 注册、契约、guess-number 与 animal-ranch 定义 / 引擎 / 存储 |
| apps/web/src/platform/ | 大厅、连接和通用玩家界面 |
| apps/web/src/games/ | 界面注册、猜数字组件 / 骰子、RanchGame.vue |
| packages/contracts/src/ | 公开协议；平台视图与猜数字专属视图区分 |
| scripts/import-sqlite.ts | 一次性导入与逐字段校验，拒绝非空目标 |
| scripts/backup-sqlite.py | 旧库一致性私有备份 |
| scripts/prepare-release.py、cutover.py | 本次首次迁移发布；不可当成日常部署脚本反复执行 |
| scripts/release-postgres.py | 日常 PostgreSQL 发布；准备构建或经授权 --deploy，备份与会话验证、只回退代码 |
| scripts/backup-postgres.py、verify-backup-restore.py | 私有备份与独立库恢复验证 |
| test-v2/ | 新架构的 18 项云端测试 |

旧 server.mjs / game.mjs / public / test 留作兼容参考，服务不再以其为新入口。

## 接口

原 catalog、注册 / 登录、state、events、logout、invite 和 room/* 保持兼容。SSE state / notice / logout，在线依赖 SSE，心跳每秒。

新增：

- `POST /api/rooms/:code/actions`：type、payload、requestId、matchId、expectedRevision。
- `GET /api/results/:id`：仅参与者可读；available=false 表示旧结果没有保存复盘。
- `GET /api/games/:gameId/me`、`GET /api/games/:gameId/players/:owner`。
- `POST /api/games/:gameId/actions`：长期型动作，版本和请求去重。
- `GET /api/games/:gameId/players`：可参观牧场目录，包含离线玩家。
- `POST /api/presence`：长期游戏浏览状态；可被大厅邀请，房间状态优先。

已注册 guess-number 和 animal-ranch（一起牧场，36 个独立物种）。一起牧场为每个账号自动创建独立档案，支持喂养 / 成长 / 收获 / 出售 / 扩建 / 等级解锁 / 只读参观。默认世界 default；具体长期游戏需要实现定义和资源规则。

## 当前限制与后续

单个 API 进程负责在线 / 邀请和房间调度，不可直接多实例扩容。广播仍发送按用户裁剪的完整 state；已经按变化房间写入，但未做事件增量 / 跨进程分发。

为兼容原游戏，房间 phase 和传统设置路由仍保留；猜数字通过独立适配模块提供规则、视图和结果。未来游戏可使用自己的内部阶段与公开字段，公共平台视图不要求秘密数字 / 骰子字段。

旧结果没有完整猜测历史，不能补造。新结果有权限控制的持久复盘 API，当前大厅尚未提供点击往届复盘的 UI（本局结束复盘已保留）。

已经实现动物牧场与 ranch_wallets / ranch_animals / ranch_inventory / ranch_ledger；作物种植、交易、偷取、赠送和后台事件 worker 尚未实现。普通动物成长在访问或操作时结算，不依赖浏览器和后台逐秒写入。

此前猜数字浏览器验证覆盖桌面和 390px 手机视口、日夜主题、双账号完整记忆模式对局、草稿 / 最新提示、结束复盘 / 刷新 / 筛选。沉浸式牧场 2.3.0 已在云端独立 Chromium / WebKit 通过 10 组手机尺寸、桌面与交互模拟验收，截图已实际检查。真实手机硬件、软键盘及微信内置浏览器行为不在本次模拟验收范围；不要把模拟器说成真机。

下一游戏先实现后端定义和 Vue 模块，补专属测试，再注册。持续游戏要完成资源事务 / 时间 / 权限规则，不能将档案塞进 active_rooms。

## 2026-10-04 动物牧场扩展

版本 2.1.0，schema v2。游戏 ID animal-ranch，36 种动物覆盖家禽家畜、宠物、动物园。源码 games/animal-ranch 与共享 ranch-catalog.ts；前端 RanchGame.vue。资料、数值、素材、规则见 animal-ranch.md、ranch-balance.md、ranch-assets.md。正式发布目录和源提交以 test-reports/20261004-ranch-scene.md 的发布结果为准，上方环境表已更新，旧账号和猜数字记录保留。

## 此前动态牧场 2.2.0

全身动物、Canvas 场景、四帧走路、待机、喂食 / 收获提示、触摸平移 / 缩放、木质工具栏和弹窗。渲染入口 RanchScene.vue，图鉴 AnimalPortrait.vue，裁切 atlas-metadata.ts，素材 / 提示词 ranch-scene-assets.md。18 项回归 + 10 组浏览器 UI 验收通过，正式账号与牧场档案保留。Windows localhost:3211 为云端开发的 SSH 转发（仅本机监听），程序并不在 Windows 运行。

## 2026-10-04 沉浸式牧场 2.3.0（已上线）

独立铺满视口的 Canvas 游戏、浮动 HUD / 工具、中央食槽两状态 / 点击添食 / 动物聚集、清晰头顶状态、原生面板和访客隐私。读取 ranch-immersive.md 与 test-reports/20261004-ranch-immersive.md。18 项回归与 Chromium / WebKit 共 10 组 UI 验收通过，手机触屏弹窗点击穿透已修复并检查购买请求唯一。正式目录 /opt/pair-play/releases/v2.3.0-20261004-145017，发布源提交 a4a348a0817d84f3f4074204f252bdd6ce75e857；备份与数据数量核验见 20261004-ranch-immersive-release.json。候选互动 / 装饰 / 互助尚未实现。

## 2026-10-04 侧边食槽 2.3.1（已上线）

移除中央大食槽，复用背景左侧原设施，增加小木牌“食槽”；实体 / 木牌点击可添粮，手机保留底部入口。原中央 PNG 为历史归档，不再加载。源码 RanchScene.vue，文档 ranch-immersive.md / test-reports/20261004-ranch-side-feeder.md。两种浏览器共10组验收通过，后端规则和 schema 未变。正式目录 /opt/pair-play/releases/v2.3.1-20261004-152536，源提交 5e6691afeeb56b27ba6e83fe0986df56953aa008；已备份并核验原账号 / 存档 / 有效会话，见 20261004-ranch-side-feeder-release.json。
