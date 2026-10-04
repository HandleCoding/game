# 一起玩 · 游戏大厅

入口 https://game.aicoding.ltd/ ，部署于京东云 `117.72.116.83`。当前游戏：猜数字（2 人）；所有在线空闲玩家可直接邀请，无加好友机制。

新架构：Vue 3 + TypeScript + Vite，Node.js + Fastify + TypeScript，PostgreSQL，HTTP + SSE，Caddy HTTPS。开发源码位于 `/opt/pair-play-dev`；正式运行发布目录在 `/opt/pair-play/releases/`。

Agent 从 [AGENTS.md](AGENTS.md) 和 [接手状态](docs/handover.md) 开始；全部开发文档见 [docs/README.md](docs/README.md)。

## 开发与测试

在京东云开发目录运行；数据库连接由受保护的环境文件提供：

```sh
cd /opt/pair-play-dev
npm ci
npm run typecheck
npm run build
set -a
. /etc/pair-play/dev.env
set +a
flock -n /run/lock/pair-play-dev-tests.lock npm test
systemctl restart pair-play-dev
curl --fail http://127.0.0.1:3211/healthz
```

开发 `playroom_dev` 与正式 `playroom_prod` 使用不同数据库和账号。测试自动创建 / 清理独立 schema，不连接正式库。浏览器通过 SSH 转发访问云端 3211；手机共同测试的公网开发入口尚未配置。

## 猜数字规则

双方准备 → 分别锁定 `0000`–`9999` 四位字符串（可重复、可前导零）→ 掷骰（高点先猜、平局重掷）→ 轮流猜测。只反馈相同位置命中数，4 位命中胜利。默认 30 秒，可配置 15 / 30 / 45 / 60 / 90 秒，超时跳过。

记忆模式进行中隐藏完整历史，显示对方最近一次猜测与命中数；结束后双方完整复盘。新架构把新对局复盘持久化到结果表，接口按参与者权限返回。旧 results 未保存的完整历史无法补出。

邀请通知 15 秒有效。断线暂停，60 秒重连窗口。支持日间 / 夜间、固定输入区、对方回合预写草稿、己方回合边框提示、骰子和命中效果、手机 / 电脑混合对战。

根目录旧 JS / SQLite 文件仅保留作为迁移参考；新入口是 `apps/api/src/main.ts`，构建运行 `dist/apps/api/src/main.js`，网页输出 `web-dist/`。

## GitHub 与协作

源码仓库：https://github.com/HandleCoding/game 。主分支 main，云端开发目录 /opt/pair-play-dev。后续 Agent 先读 AGENTS.md、docs/handover.md 和 docs/git-workflow.md。GitHub 保存源码、文档和版本历史；运行数据库、备份、配置密钥不上传。
