# 新架构接手状态

更新：2026-10-04。本次按用户授权实施架构和现有注册数据迁移。正式切换结果、最终版本、备份路径与数据数量以 [迁移报告](test-reports/20261004-architecture-migration.md) 为准。

## 环境

| 项目 | 正式 | 开发 |
| --- | --- | --- |
| 主机 | 京东云 117.72.116.83 | 同一主机 |
| 代码 | /opt/pair-play/releases/具体版本 | /opt/pair-play-dev |
| 服务 | pair-play.service | pair-play-dev.service |
| 用户 | pairplay | pairplaydev |
| 监听 | 127.0.0.1:3210 | 127.0.0.1:3211 |
| 数据库 | playroom_prod | playroom_dev |
| 受保护配置 | /etc/pair-play/prod.env | /etc/pair-play/dev.env |
| 入口 | https://game.aicoding.ltd/ | SSH 转发后 localhost:3211 或 127.0.0.1:3211 |

PostgreSQL 18.6，数据 `/var/lib/postgresql/18/main`，5432 仅回环。两库不能相互连接。Node.js 22.22.1。开发服务一核 CPU 配额，512MB MemoryHigh / 768MB MemoryMax。Git 独立仓库，无远程；实际分支 / 提交看 git status/log。

## 已落地

- Vue 组件化大厅、认证弹窗、邀请、在线玩家和猜数字界面；TypeScript 前后端与共享 contracts，Vite 构建，游戏界面按注册表懒加载。
- Fastify 请求 schema 与 Origin 校验，兼容原 /api/room/*；新 `POST /api/rooms/:code/actions` 使用 requestId / matchId / expectedRevision。
- 游戏注册表区分 match / persistent。创建 / 恢复按 gameId 和版本分发；平台容量使用元数据，三人测试引擎验证多人流程。
- PostgreSQL users / sessions / results / result_players / active_rooms；事务保存变化房间、一次性结算、持久化动作回执。写入失败回滚内存状态，已覆盖测试。
- 新结果记录 game_id / game_version / match_id / settings_json / review_json，参与者 outcome / score；旧结果摘要保留。
- 快照 v2 包含游戏、规则版本、对局编号、revision、成员和私有引擎状态；旧快照经导入器转换。
- 长期档案基础：首次进入唯一、行锁、时间结算接口、动作事务、请求去重、主人 / 访客视图；world_jobs 表已建，具体 worker 未启用。
- 原账号 ID、昵称、盐 / 密码哈希、会话、结果和活动房间迁移，不导入开发测试账号。真实数据演练与测试夹具原密码登录均验证。

## 源码地图

| 目录 / 文件 | 职责 |
| --- | --- |
| apps/api/src/main.ts | Fastify 路由、校验、静态文件、启动 / 停止 |
| apps/api/src/platform/accounts.ts | 账号、scrypt、会话 |
| apps/api/src/platform/rooms.ts | 房间、在线 / 邀请、串行调度、事务、按用户广播 |
| apps/api/src/platform/db/ | PostgreSQL 连接、事务、schema migration |
| apps/api/src/platform/persistent.ts | 持续档案、时间结算、事务动作 |
| apps/api/src/games/ | 注册、契约、guess-number 定义 / 引擎 |
| apps/web/src/platform/ | 大厅、连接和通用玩家界面 |
| apps/web/src/games/ | 界面注册与猜数字组件 / 骰子 |
| packages/contracts/src/ | 公开协议；平台视图与猜数字专属视图区分 |
| scripts/import-sqlite.ts | 一次性导入与逐字段校验，拒绝非空目标 |
| scripts/backup-sqlite.py | 旧库一致性私有备份 |
| scripts/prepare-release.py、cutover.py | 本次首次迁移发布；不可当成日常部署脚本反复执行 |
| test-v2/ | 新架构的 14 项云端测试 |

旧 server.mjs / game.mjs / public / test 留作兼容参考，服务不再以其为新入口。

## 接口

原 catalog、注册 / 登录、state、events、logout、invite 和 room/* 保持兼容。SSE state / notice / logout，在线依赖 SSE，心跳每秒。

新增：

- `POST /api/rooms/:code/actions`：type、payload、requestId、matchId、expectedRevision。
- `GET /api/results/:id`：仅参与者可读；available=false 表示旧结果没有保存复盘。
- `GET /api/games/:gameId/me`、`GET /api/games/:gameId/players/:owner`。
- `POST /api/games/:gameId/actions`：长期型动作，版本和请求去重。

当前只注册 guess-number，长期 API 不会凭空开放一个农场。默认世界 default；具体长期游戏需要实现定义和资源规则。

## 当前限制与后续

单个 API 进程负责在线 / 邀请和房间调度，不可直接多实例扩容。广播仍发送按用户裁剪的完整 state；已经按变化房间写入，但未做事件增量 / 跨进程分发。

为兼容原游戏，房间 phase 和传统设置路由仍保留；猜数字通过独立适配模块提供规则、视图和结果。未来游戏可使用自己的内部阶段与公开字段，公共平台视图不要求秘密数字 / 骰子字段。

旧结果没有完整猜测历史，不能补造。新结果有权限控制的持久复盘 API，当前大厅尚未提供点击往届复盘的 UI（本局结束复盘已保留）。

尚未加入实际农场 / 牧场、仓库 / 经济表、作业执行器、交易或偷菜规则。长期存档基础并不等于这些玩法已完成。

浏览器已验证桌面和 390px 手机视口、日夜主题、双账号完整记忆模式对局、草稿 / 最新提示、结束复盘 / 刷新 / 筛选。真实手机键盘与后台行为仍需要用户实际设备验收。

下一游戏先实现后端定义和 Vue 模块，补专属测试，再注册。持续游戏要完成资源事务 / 时间 / 权限规则，不能将档案塞进 active_rooms。
