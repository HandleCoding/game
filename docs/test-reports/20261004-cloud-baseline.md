# 云端开发工作区初始化验收

日期：2026-10-04。执行位置：京东云 `117.72.116.83` 的 `/opt/pair-play-dev`，Node.js v22.22.1。该报告针对本次环境初始化和当前 JS / SQLite 基线，不代表目标框架或 PostgreSQL 已迁移。

## 自动测试

执行以下命令，完整日志见 [TAP 日志](20261004-cloud-baseline.tap.log)：

```sh
cd /opt/pair-play-dev
flock -n /run/lock/pair-play-dev-tests.lock env -u PUBLIC_ORIGIN -u DATA_DIR -u PORT NODE_ENV=test HOST=127.0.0.1 npm test
```

结果：退出码 0，11 项通过，0 失败 / 跳过 / 取消，TAP 总时长约 23.9 秒。4 个 JS 入口的 `node --check` 均通过。

集成测试使用 3221 端口和系统临时 SQLite 目录，结束后端口已释放。没有使用正式或开发服务的持久数据库。

## 环境检查

- `pair-play-dev.service`、`pair-play.service`、`caddy` 均 active。
- 开发 `/healthz` 返回 `{"ok":true}`，正式本机 `/healthz` 同样正常。
- 开发 `/api/catalog` 返回猜数字，在线人数 0；未登录 `/api/state` 返回 401。
- 正式监听 `127.0.0.1:3210`，开发监听 `127.0.0.1:3211`；没有将开发端口公开到公网。
- 开发运行账号 pairplaydev，工作目录 `/opt/pair-play-dev`；独立数据目录权限 700，SQLite 文件权限 600，所有者均为 pairplaydev。
- 开发服务 CPU 配额 1 核、MemoryHigh 512MB、MemoryMax 768MB，配置值已检查。
- server.mjs、game.mjs、public/app.js 与初始化时正式源码 `cmp` 一致；只复制代码，没有复制正式数据库。

## 源码基线 SHA-256

```text
server.mjs
b3435280b0ad89a292487eb2426db3aa689e28525cf905c453beaaa33bd2a2d4
game.mjs
33fe10a4a1ccf5af739514c9131621214d198055c2a03bcf9e7072524af1d10f
public/app.js
885878bf0d8146fc79ee740bc7f5fa43f4984fabb17133b83cadc8acf28b5ea0
```

## 未执行与下一步

本次没有重新做浏览器端完整双人 / 真实手机验收，当前开发入口仅支持 SSH 转发；手机共同测试入口待配置。没有安装 PostgreSQL、创建目标数据库、迁移数据或接入 Vue / Fastify / TypeScript。下一阶段按 handover 与技术选型实施，并追加对应测试和迁移演练记录。
