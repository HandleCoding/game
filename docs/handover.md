# 新架构接手状态

更新：2026-10-05。当前正式一起牧场2.8.0，变异、品质、真实发现图鉴、产物溢价、名宠融合和现代UI已上线；原有限生产与名宠堂保持，本次没有重置。实际实现 [2.8.0实施交接](ranch-mutation-v2.8.md)，验收与发布 [2.8.0报告](test-reports/20261005-ranch-mutation.md)。历史：2.7.0与此前CDN/HUD/数值报告保留。

## 环境

| 项目 | 正式 | 开发 |
| --- | --- | --- |
| 主机 | 京东云 117.72.116.83 | 同一主机 |
| 代码 | /opt/pair-play/releases/v2.8.0-20261005-112227 | /opt/pair-play-dev |
| 服务 | pair-play.service | pair-play-dev.service |
| 用户 | pairplay | pairplaydev |
| 监听 | 127.0.0.1:3210 | 127.0.0.1:3211 |
| 数据库 | playroom_prod | playroom_dev |
| 受保护配置 | /etc/pair-play/prod.env | /etc/pair-play/dev.env |
| 入口 | https://game.aicoding.ltd/ | SSH 转发后 localhost:3211 或 127.0.0.1:3211 |

PostgreSQL 18.6，数据 `/var/lib/postgresql/18/main`，5432 仅回环。两库不能相互连接。Node.js 22.22.1。开发服务一核 CPU 配额，512MB MemoryHigh / 768MB MemoryMax。Git 仓库 origin=git@github.com:HandleCoding/game.git；主分支 main，迁移分支 codex/architecture-migration 保留。后续流程读 git-workflow.md。正式发布源提交 44bc12f4e0b582aa4949d8708a7b200be3accb06；后续验收文档提交看 git log。

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


## 2026-10-04 HUD遮挡修复 2.6.1（已上线）

离线/缺粮提示改为左上资料牌内的正常布局，移除底部浮条；横屏菜单留足资料牌间距。原动物选择、后端数值与schema3保持。两引擎各5组尺寸验收及实际截图审阅通过，报告test-reports/20261004-ranch-hud-overlap.md；公网healthz、RanchGame JS/CSS与发布前后牧场资源摘要通过。普通代码发布且未重置，4只已有动物及钱包/仓库保留。

三个子Agent的玩法调研综合于animal-ranch.md“可玩性调研草案”，尚未实现：首选命名亲密互动+永久日记+可选委托+小装饰，其次异步互助，再加工/饲草。不要将建议当作已上线；跨玩家动作不能套单档案锁，奖励金币/加工需重跑数值模拟。


## 2026-10-04 牧场 CDN 2.6.2（已上线）
配置/源码与异常回退见ranch-cdn.md，验收见test-reports/20261004-ranch-cdn.md。static.aicoding.ltd通过多吉云CNAME/HTTPS，game主站保持直连。只加速公开牧场图片，API/SSE/存档仍主站；开发同源。跨域SVG必须共享已解码data URL，不能只把href改为远程地址。2种浏览器12个CDN/失败案例+1闲置超时、10组尺寸交互、25项后端通过；截图实际查看。schema3、数值和玩家资源不改。正式发布目录与备份见报告发布段及上方环境。


## 有限生产与名宠堂设计稿

用户确定将动物完成生产后的收藏去向命名为“名宠堂”，与出售、放生并列；未来变异、前缀和符文围绕独立个体扩展。完整方案见 [有限生产与名宠堂技术方案](ranch-lifecycle-and-hall-plan.md)，包含36种时间/轮次首轮草案、结算、经济、数据迁移与验收。此处保存最初设计背景；2.7.0现已实施、迁移并上线，最终规则与数值以ranch-balance.md及下方实际实现记录为准。不要沿用旧无限生产、满存耗粮或整档案删除重插来保存永久个体。认养价/售价/经验须重新模拟冻结，不能把旧小时制价格直接配上新分钟制。


## 2026-10-05 有限生产与名宠堂2.7.0（已上线）

已在现有Vue/Node/PG架构上实现，非另建项目。所有36种动物按5分钟→24小时的成长/生产梯度、6/8有限轮次、暂停停粮、生产结束等待；名宠堂/出售/放生永久保存身份和日记，昵称、可选6位公开与档案分页。未来变异/前缀/符文只预留数据，未生成或改变收入。新冻结数值见ranch-balance.md；原2.6数值移到ranch-balance-v2.6-history.md。

25项自动化、typecheck/build、9组90天模拟、两内核原牧场/名宠堂各5尺寸均通过，关键截图实际查看。验收test-reports/20261005-ranch-lifecycle.md。新schema4与存档v2需按deployment-runbook维护停写/最新备份/一次事务无损迁移；身份、阶段进度比例、库存价值、钱包和XP保留；已有动物周期和未来收益统一新目录，无重置。禁止迁后回退旧2.6删除重插storage。正式源ff96f06，目录与备份见上方及20261005-ranch-lifecycle-release.json。两份旧牧场、8只动物均已统一新参数；2账号/5会话/5结果/10关联/2档案前后保持。开发服务3211亦迁移并重启至2.7.0。


### 2026-10-05 用户最新修订：现有动物也统一新规则

此修订覆盖此前“老动物保留旧周期”的内容。本次全部已有动物与新认养使用当前目录，既有幼年/生产比例等比例换算到新时间；不按新分钟周期追补旧离线，不瞬间生成多年产物。认养/出售计算基数有偿动物统一当前价、赠送仍0；原钱包/XP等级/库存和既有产物不清空。个体ID、名字、发现/归档记录保留，无法知道的历史日期仍未知。

统一转换在维护停写下只执行一次，二次无变化；游戏运行时只支持当前存档v2和规则，没有旧周期/旧返还/旧XP分支。原v1代码已移入test-v2/ranch-v1-fixture.ts，仅用于真实旧结构夹具；旧目录仅离线迁移时给既有库存定价。普通未来版本是否统一改所有动物另以用户要求为准。

启动检查首次暂停的原因是healthz仍硬编码2.6.2，服务实际能启动；现已自动读取根package版本，避免同类遗漏。第一次迁移已保留数据，保持维护后做前向更新，未回退2.6或覆盖数据库。恢复发布需--resume-caddy指向同次维护保存的原Caddyfile，仅允许/var/backups/pair-play/Caddyfile-before-*，不会将503维护配置当成要恢复的正式配置。


## 2026-10-05 变异、品质、名宠融合2.8.0（已上线）
详细实现/规则/迁移/后续边界见 ranch-mutation-v2.8.md；验收 test-reports/20261005-ranch-mutation.md、发布JSON同名前缀。购买/成年各一次10%～30%；五品质、雷火水黄金梦幻与双属性；品质最高值保留、真实发现图鉴与目标、冻结溢价/金币余数、晶露按生产日限额、2/2/3/3材料融合、珍藏与库存锁定。原周期/耗粮/XP/轮次保持，不加入训练。
现代浅/深色弹窗、手机版分页材料与可选数量仓库；属性毛发色泽/光泽、雷弧/火焰/水波/金色星光/梦幻光点，幼年成年和双属性均覆盖，保持原图透明裁切、脚底影与侧边食槽。用户提出“看不到效果”时正式仍2.7.0，开发旧少量粒子已加强后验收发布；已有普通动物不补抽，普通外观保持。
35项自动化、类型/构建、实际引擎40万概率样本、两内核30组交互回归与28张外观场景通过；均浏览器模拟，非真机。未知响应重试保留原requestId，提交后503不重复认养/抽取/扣费。schema5新增feature/codex/daily/fusion独立表，摘要仍v2（与初稿v3选择不同），不重置，材料fused永久留档。旧库存保值，已成年不补抽，旧幼年仅生效之后成年一次机会。
源提交 `44bc12f4e0b582aa4949d8708a7b200be3accb06`，正式 `/opt/pair-play/releases/v2.8.0-20261005-112227`，最新停写备份 `/var/backups/pair-play/postgres-prod-20261005-112229.dump`。正式/开发与公开HTTPS均2.8.0；原账号2、会话5、结果5、关联10、档案2保持，钱包快照一致，原16只动物保留。全部公开JS/CSS哈希一致，独立 `/ranch-3d/*` 仍可用。仅本任务源码提交，另一Agent三维小样未包含。
未来发布必须按 --ranch-mutations/schema5前向修复边界，禁止降级旧2.7或恢复整库覆盖新进度；真实数据高危删除须用户新确认。读deployment-runbook。

## 2026-10-05 柔和二维/2.5D场景独立小样

用户拒绝简化 3D 动物和仅叠加阴影的单背景方案，要求保留柔和写实原动物与原背景画风，增强场景融合和实际互动。后又要求独立分支；现 /opt/pair-play-2d-dev 工作树，codex/ranch-2d-scene，项目 prototypes/ranch-2d。另一 Agent 完成后已将本分支更新到 main 的 2.8.0 基线 95dec7d；未覆盖共享工作树未提交文件。

预览 https://game.aicoding.ltd/ranch-2d/：独立地面/远景、树/食槽/围栏/门；足底深度排序、轮廓投影、接触影、草叶遮挡、树荫色调、远景视差、树风动/点树落叶、A*绕行与开关门通路。原小鸡/兔/山羊成年幼年图集不改，演示喂食不写用户存档。场景 PNG 由内置 Imagegen 根据旧画风生成；提示词见项目 ASSET-PROMPTS.json。

仅新增 Caddy /ranch-2d 静态目录路由，备份 /var/backups/pair-play/caddy-ranch-2d-20261005-111946.conf；大厅仍 3210、数据库和正式玩法不改。后续修改 Caddy 要保留两个独立预览。正式 2.8.0 已启用写入，禁止为视觉小样退回旧发布或恢复旧数据库。

云端独立 typecheck、导航碰撞校验与构建通过，内置浏览器桌面/手机尺寸实际交互与截图查看；横屏选择栏和工具栏遮挡已修正。具体证据、未实现项见项目 QA.md。手机为模拟尺寸，未验真机/微信内核，勿误报。小样普通动物；未来接入要继续保留最新 appearance.ts 的属性材质/光环、双属性、quality 与最新游戏API契约，不能覆盖本次已上线功能。用户确认画面方向后再提取渲染层集成，尚未替换生产 RanchScene.vue。
