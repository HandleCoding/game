# 接手状态

更新：2026-10-04。当前线上只有猜数字；以下环境表是本次开发工作区建成后的配置，验收日志保存在 `docs/test-reports/`。开发副本以当前正式源码为基线，没有复制正式玩家数据库。

## 实际环境

| 项目 | 正式 | 开发 / 测试 |
| --- | --- | --- |
| 主机 | `117.72.116.83`，京东云 Linux | 同一主机 |
| 代码 | `/opt/pair-play` | `/opt/pair-play-dev` |
| 服务 | `pair-play.service` | `pair-play-dev.service` |
| 运行账号 | `pairplay` | `pairplaydev` |
| 监听 | `127.0.0.1:3210` | `127.0.0.1:3211` |
| 数据 | `/var/lib/pair-play/pair-play.sqlite` | `/var/lib/pair-play-dev/pair-play.sqlite` |
| 网页入口 | `https://game.aicoding.ltd/`，Caddy | SSH 转发后 `http://localhost:3211/` |
| Node.js | `v22.22.1`，`/usr/bin/node` | 同一运行时 |
| 数据库 | SQLite WAL | 独立 SQLite WAL |

开发目录有独立 Git 仓库，用于保存基线及后续改动；尚未配置远程仓库。其分支、最新提交和工作区以 `git status` 实际输出为准。

服务器检查：4 核、约 16GB 内存，2026-10-04 检查时可用内存约 12GB、磁盘剩余约 59GB。容量不是承诺，后续观察负载。开发服务有资源限制，共享主机仍有共同故障边界。

开发库初始为空。首次测试注册新账号，不能用“线上账号无法登录开发环境”判断认证出错；两个环境的账号和会话独立。开发入口尚未公开为 IP 端口或测试域名，云安全组和 Caddy 未为其改变。

## 已完成的产品行为

- 游戏大厅、注册 / 登录、在线玩家列表；无需加好友即可邀请空闲玩家，显示所在游戏和开局时长。
- 双人猜数字：双方准备，分别锁定四位数字，再掷骰子，高点先猜，平局重掷。数字为 `0000`–`9999` 的字符串。
- 每次只返回相同位置命中数量。默认 30 秒，可选 15 / 30 / 45 / 60 / 90 秒，超时跳过。
- 邀请通知接受 / 拒绝，15 秒未响应自动拒绝；服务器控制权限、骰子、计时和结果。
- 默认可看猜测记录；记忆模式进行中不发送完整历史。输入区显示对方最近一次猜测和命中数，己方反馈短暂展示。
- 结束后两种模式都可查看本局双方完整记录，默认全部、按时间排列，可筛选；重新开局清空。
- 底部固定输入区，对方回合可预写，自己的回合才能提交；轮到自己有淡绿色边框提示。
- 掷骰动画、不同命中提示、胜利效果；日间 / 夜间主题和减少动态效果。
- 手机 / 电脑同一规则，可混合对战，草稿、焦点、历史滚动与软键盘有专门处理。
- 账号、会话、结果摘要和活动房间持久化；重启后进行中房间暂停，参与者有 60 秒重连窗口。

## 当前源码地图与接口

| 文件 | 职责 |
| --- | --- |
| `server.mjs` | HTTP、认证、SQLite、在线状态、邀请、广播和房间保存 / 恢复 |
| `game.mjs` | `Duel` 猜数字规则、阶段、计时、隐私视图 |
| `public/app.js` | 大厅、房间、登录、输入、动画、SSE 与复盘界面 |
| `public/styles.css` | 主题、响应式布局与效果 |
| `public/theme.js` | 首屏主题初始化，避免主题闪烁 |
| `test/*.test.mjs` | 10 项规则测试、1 项真实 HTTP 集成测试 |
| `deploy/` | 正式和开发 systemd 配置、正式安装脚本 |

当前公共接口：`GET /healthz`、`GET /api/catalog`；注册 / 登录 `POST /api/register`、`POST /api/login`。

认证后：`GET /api/state`、`GET /api/events`（SSE），`POST /api/logout`，`POST /api/invite`、`POST /api/invite/respond`，以及 `POST /api/room/{create,join,leave,settings,ready,secret,dice,guess,rematch}`。参数和状态结构以 server.mjs、game.mjs 及集成测试为准；目标通用 API 尚未替代这些接口。

SSE 事件有 `state`、`notice`、`logout`，每秒心跳。在线状态取决于 SSE 连接，不是登录会话是否存在。会话最长 30 天；HTTPS PUBLIC_ORIGIN 会启用 Secure Cookie。开发 PUBLIC_ORIGIN 为 `http://localhost:3211`，不能直接换成 `127.0.0.1` 地址后期待 Origin 校验仍匹配。

SQLite 表：`users`、`sessions`、`results`、`result_players`、`active_rooms`。密码是随机盐 + scrypt 哈希；快照含秘密，只能留在私有数据目录。

## 已知限制，不要误判为已完成

- 平台目前仍将创建、恢复、人数、阶段和结算绑定 `Duel`，还没有通用游戏注册与引擎分发。
- 当前 broadcast 会保存所有房间并向在线用户发送各自完整 state；不是按变化房间增量保存，也不是跨进程协调。
- 在线连接、邀请和限流是进程内状态；邀请不跨重启恢复。只支持一个 API 进程，不可直接多实例横向扩容。
- 完整复盘保存在活动房间快照；离开销毁或重开后不能从旧 results 找回。results 只保存摘要，迁移不能补出未保存的旧历史。
- 当前没有 TypeScript、Vue、Fastify、PostgreSQL、持续档案、动作 requestId 去重、revision 机制或多游戏 worker。
- 当前未提供固定测试域名 / 公网测试端口，手机验收需要先配置合适入口；SSH 隧道可用于电脑访问。

## 已认可的下一阶段

目标：Vue 3 + TypeScript + Vite，Node.js LTS + Fastify + TypeScript，PostgreSQL，沿用 Caddy。开发和测试在京东云；初期一个 PostgreSQL 实例，分别建 `playroom_dev`、`playroom_prod`，独立角色和权限。PostgreSQL 本身免费开源，数据保存服务器磁盘。

保持一个模块化后端，不按每个游戏另起账号或数据库。短局用 `match`，农场 / 牧场用 `persistent`，长期存档不能随退出房间删除。先迁平台边界与猜数字，再完成数据库迁移演练，正式长期游戏累积存档前切换 PostgreSQL。

这些选择已确认，但用户本次要求是建开发工作区与接手文档，未将所有目标重构视为本次必须完成。具体实现见三份架构设计。

## 下一个 Agent 的起步

读 AGENTS 和本文件 → 确认 `git status` 与两个服务状态 → 按 development-guide 在开发目录修改 → 按 testing-guide 验证 → 更新本文与测试记录 → 在当前用户授权范围内按 deployment-runbook 发布。

若继续技术迁移，优先建立前后端工程、公共契约与注册表，再迁现有猜数字，保持现有行为和数据可恢复；不要先写农场 UI 而跳过平台与事务基础。
