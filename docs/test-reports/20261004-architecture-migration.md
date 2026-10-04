# 新架构迁移验收

日期：2026-10-04。开发和测试执行于京东云 /opt/pair-play-dev。正式切换已完成，最终结果见本报告下方。

## 已完成的开发验收

- Vue 3 / TypeScript / Vite 与 Node.js / Fastify / TypeScript / PostgreSQL 实际建立并运行于开发环境。
- npm run typecheck、npm run build 通过。
- @fastify/static 已升级至 10.1.5，生产依赖 npm audit --omit=dev 为 0 漏洞；升级后重新完成类型检查、编译和全部 14 项测试。
- 全部 14 项测试通过，0 失败 / 跳过，最近运行约 25.5 秒；详见同名 TAP 日志。
- 原 10 项规则和真实 HTTP 测试迁至新后端，新增原密码 / 会话 / 快照迁移、多人数 / 版本 / 去重 / 写入失败回滚、长期档案并发事务测试。
- 私有真实数据快照演练：2 个账号、3 个会话、3 个结果、6 条结果参与关联、1 个活动房间，原字段校验通过；正式切换时仍需取最终最新数据。
- 开发 / 正式账号跨库 CONNECT 权限均为 false；PostgreSQL 只监听回环。

## 浏览器验收

两个独立开发账号使用 localhost / 127.0.0.1 的 SSH 转发入口，实际后端和数据库都在京东云。完成邀请与 15 秒弹窗、准备、0000 / 0123 秘密、骰子动画、记忆模式完整对局、对方最新猜测、对方回合预写并保留草稿、己方回合提示和提交、不同命中效果、结束三条完整复盘、刷新 / 筛选 / 返回大厅。

桌面与 390px 手机视口验收，最终 documentWidth=innerWidth=390，无横向溢出；日间 / 夜间可切换并刷新保持。未声称已验证真实手机键盘和后台切换；由用户实际设备补充验收。

## 数据边界

开发测试账号不导入正式库。旧盐 / 哈希保持不变，不需要重设密码；有效 Cookie 会话与原用户 ID 保留。活动房间快照含秘密，备份及演练库保持私有，日志不输出秘密。

旧 results 没有完整复盘，目标字段留 null。新对局完整复盘持久化并按参与者权限提供 API；本局结束界面仍显示双方完整记录。

## 正式切换结果

切换完成：2026-10-04T12:50:31+0800（按主机时区记录）。正式域名 https://game.aicoding.ltd/ 已恢复，健康接口返回 version=2.0.0、database=postgresql。

- 发布目录：/opt/pair-play/releases/v2-20261004-124956。
- 发布源提交：dd15692fb726032493e4b9be5c1212a6ae8cbc43；Git 分支 codex/architecture-migration。
- 最终导入并逐字段验证：users=2、sessions=3、results=3、result_players=6、active_rooms=1；导入正式库成功，开发测试账号未导入。
- 所有未过期的旧会话经新服务 API 身份校验通过；密码盐 / 哈希 / 用户 ID 未改变。自动化迁移夹具覆盖原密码登录。
- 最终一致性 SQLite 备份：/var/backups/pair-play/final-sqlite-20261004-125030.sqlite，SHA-256=1606a8d0adcbf1de738a205054d688d84b2fe2ac101ba79cac5e9fd321a2298f。原 SQLite 保留但正式已不再写入。
- PostgreSQL 可恢复备份：/var/backups/pair-play/postgres-prod-20261004-125303.dump，独立库 pg_restore 成功、数量核对通过，然后删除该临时验证库。
- 原已结束且无人在线房间在新服务启动后正常清理，结果摘要仍为 3 条；这解释了恢复验收 active_rooms=0，不能据此误判迁移丢失对局。
- 原 service / Caddy 配置备份：/var/backups/pair-play/pair-play-unit-20261004-125030、/var/backups/pair-play/Caddyfile-20261004-125030。
- pair-play、pair-play-dev、PostgreSQL、Caddy 全部 active。正式页面 HTML、JS / CSS 资源 200，HTML no-cache、版本化资源 immutable 验证通过。
- 正式浏览器标签页已加载站点标题；浏览器控制接口读取 DOM 超时，因此未追加声称正式登录界面的交互验收。相同构建已在云端开发环境完成双账号对局和手机 / 电脑视口验收。

备份只在 /var/backups/pair-play 的私有权限目录，凭据不进入报告。正式已经开放并可能接受新写入，不可直接退回旧 SQLite。

