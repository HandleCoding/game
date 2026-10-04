# 新架构接手状态

更新：2026-10-04。已完成架构和现有注册数据迁移，并按用户明确授权上线一起牧场 2.6.0。当前发布、备份与验证见 [当前数值与重置报告](test-reports/20261004-ranch-balance.md)；首次数据迁移见 [迁移报告](test-reports/20261004-architecture-migration.md)。

## 环境

| 项目 | 正式 | 开发 |
| --- | --- | --- |
| 主机 | 京东云 117.72.116.83 | 同一主机 |
| 代码 | /opt/pair-play/releases/v2.6.0-20261004-193242 | /opt/pair-play-dev |
| 服务 | pair-play.service | pair-play-dev.service |
| 用户 | pairplay | pairplaydev |
| 监听 | 127.0.0.1:3210 | 127.0.0.1:3211 |
| 数据库 | playroom_prod | playroom_dev |
| 受保护配置 | /etc/pair-play/prod.env | /etc/pair-play/dev.env |
| 入口 | https://game.aicoding.ltd/ | SSH 转发后 localhost:3211 或 127.0.0.1:3211 |

PostgreSQL 18.6，数据 `/var/lib/postgresql/18/main`，5432 仅回环。两库不能相互连接。Node.js 22.22.1。开发服务一核 CPU 配额，512MB MemoryHigh / 768MB MemoryMax。Git 仓库 origin=git@github.com:HandleCoding/game.git；主分支 main，迁移分支 codex/architecture-migration 保留。后续流程读 git-workflow.md。正式发布源提交 3729432553b0b27ad17cf4ae46428eff0d7d9cd7；后续验收文档提交看 git log。

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
| test-v2/ | 新架构的 25 项云端测试 |

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

## 2026-10-04 柔和写实动物 2.4.0（已上线）

用户选择 A 柔和写实。36 种独立幼年 / 成年、四帧步态；真实脚底、原比例、物种 / 纵深 / 密度体量、软阴影与错行站位。背景和侧边食槽沿用。素材 / 提示词 ranch-soft-realistic-assets.md，裁切脚本 analyze-soft-ranch-atlas.py，新元数据 soft-atlas-metadata.ts。类型 / 构建 / 两种浏览器 10 组 UI 通过；实际查看截图，见 test-reports/20261004-ranch-soft-realistic.md。后端规则和 schema 不变，未重跑 18 项后端测试。正式目录 /opt/pair-play/releases/v2.4.0-20261004-165553，发布源提交 10262458a8c150dd812cfc1e5741e90bc3828a0e；正式已备份并核验原账号 / 存档数量和有效会话。公网健康与九张素材的 SHA-256 均通过；发布明细见 test-reports/20261004-ranch-soft-realistic-release.json。

## 游戏面板 v2.5.0

木质窗口与奶油色格子；动物商店/图鉴支持选择详情及幼年/成年预览，锁定态为扁平白色小锁；仓库格子与库存详情、串门搜索/排序、插画工具栏。手机竖屏/横屏与电脑布局各自适配。Chromium 与 WebKit 各五组最终验收通过，实际查看截图；认养按钮点击前完整可见、格子不压缩。规则和 schema v2 不变，既有账号/会话/档案保留验证通过。报告见 test-reports/20261004-ranch-game-ui-release.json，设计与原始 ImageGen 提示词见 ranch-game-ui.md。后续界面优先读该文档；不要沿用已删除的旧网页卡片布局或 emoji 彩色大锁。

## 图集裁切修复 v2.5.1（已上线）

AnimalPortrait 与 RanchIcon 增加独立 clipPath，修复 SVG 比例留白露出相邻帧碎片；保留动物自然比例与原素材，Canvas 源矩形裁切保持。72 个生命阶段、36 个目录格子、9 个图标在三种比例下验证；Chromium / WebKit 各 351 项通过，旧版基线复现 252 项串图。类型和构建通过，正式账号、有效会话和牧场档案保留；公网 JS/CSS 与构建逐字节一致，三项服务 active。完整报告见 test-reports/20261004-ranch-portrait.md 与 20261004-ranch-portrait-release.json。后续头像或工具图集必须有实际单帧裁切，不能仅依赖 viewBox / overflow。

## 首次加载进度 v2.5.2（已上线）

RanchLoading.vue统一存档准备和资源加载画面；RanchScene按必要图片的加载/解码完成数显示实际进度，画出首帧后显示游戏工具。资源失败/25秒超时可重试，保留成功资源，退出取消当前加载。商店在加载新动物图集时暂时隐藏，完成后恢复原选择和面板。加载专项Chromium22/WebKit20项通过，现有牧场交互两种引擎共10组通过；手机竖屏/横屏与电脑截图实际查看。规则/schema/存档不变，已备份、核验有效会话和公网JS/CSS。见test-reports/20261004-ranch-loading.md、20261004-ranch-loading-release.json。

## 公网慢速加载修复 v2.5.3（已上线）

旧25秒整图限时在公网误中断正常下载，Windows单PNG实测74.85秒。现为分块进度/45秒连续无数据超时/两路并发；HUD就绪后才挂载，11张版本化无损WebP减少约26%体积且长期缓存。原PNG、可见像素、透明度和裁切保持。两种引擎32秒六图慢速测试、42项重试检查、702项新格式裁切检查和Chromium5组交互回归通过；已核验原有效会话、存档、公开13个资源正文与缓存头。见test-reports/20261004-ranch-loading-fix.md。不要把本机快速加载通过当作公网带宽通过，也不要恢复25秒总时长中断；改图必须使用新的版本文件名。

## 2026-10-04 数值重做 2.6.0（已上线）

小时级成长/产出；每只30分钟1份饲料；初始240份供4只30小时，满槽1000份供16只31小时15分。经验按80+25(L-1)+10(L-1)^2递增；购买/送别/扩建/售产物/喂食零XP。扩建Lv3/6/9/12/15/18、600/1800/4200/8000/14000/22000金币，保持4→16位置。36种均保留，规则与全表在ranch-balance.md，实际180天模拟全解锁约40天（15分钟XP策略）至85–90天（6/12/24小时收益策略），不是保证日期。

用户明确授权重置唯一真实牧场；已在维护/停写下备份完整库和仅牧场私有快照，仅重置animal-ranch资源、流水及其动作回执，原档案revision+1。2个账号、3会话、3猜数字结果、6结果玩家关联均保持；新牧场Lv1/800金币/240饲料/4位置/1成年小鸡带3鸡蛋。严禁未来发布自动重复重置：需要新的用户授权和明确范围。

schema3仅扩大ranch_wallets.feed_ms约束至1800000000；摘要增加feedUnitMs，缺失按旧一分钟单位读取；实例周期仍在购入时保存。operator reset.ts、scripts/reset-ranch.mjs没有HTTP接口。scripts/release-postgres.py --deploy --reset-ranch限定1个牧场，停写后备份/重置；若开放前失败只恢复牧场行，不能回滚用户/猜数字。

验证：25项回归、operator CLI重置/恢复/600文件/人数变化守卫、Chromium/WebKit各5组尺寸通过且截图实际查看；公网healthz2.6.0、正式钱包/周期/单位数值和新RanchGame JS/CSS逐字节验证正常。追加使用生产登录令牌的牧场API验收被自动审批拒绝，未绕过；改为直接数值与公网文件核对。正式登录后的互动未作这项追加验收，开发库HTTP与双内核完整交互已验证。报告test-reports/20261004-ranch-balance.md和release.json。保留2.5.3分块加载/45秒闲置超时/2并发/WebP不可变缓存、真实帧裁切、柔和写实幼年成年与侧边食槽。
