# 京东云游戏大厅：Agent 接手说明

本目录在云端的开发工作区是 `/opt/pair-play-dev`。先读本文和 `docs/handover.md`，再读任务涉及的设计。用户的后续指令优先于这里的工作约定。

## 必读顺序

1. `docs/handover.md`：实际部署、已完成内容、限制和下一阶段。
2. `docs/development-guide.md`：开发目录、运行方法与工作流程。
3. `docs/testing-guide.md`：云端自动测试、双端人工验收。
4. `docs/technology-decisions.md`：认可的技术栈与迁移边界。
5. `docs/multi-game-architecture.md` 与 `docs/persistent-game-architecture.md`：短局游戏与持续养成的模块契约。
6. `docs/deployment-runbook.md`：正式发布、备份和恢复。

## 环境与工作边界

- 用户要求开发和测试都在京东云 `117.72.116.83` 上进行；浏览器可以在用户电脑、手机上访问云端应用。无需在 Windows 运行另一个开发数据库。
- 编辑、构建、测试用 `/opt/pair-play-dev`；正式源码 `/opt/pair-play`、正式数据 `/var/lib/pair-play`。
- 开发服务 `pair-play-dev.service`，回环端口 3211，独立数据 `/var/lib/pair-play-dev`；正式服务 `pair-play.service`，端口 3210。
- 当前两个环境仍是 Node.js + 原生 JS + SQLite。Vue / TypeScript / Fastify / PostgreSQL 是后续目标，尚未实施。
- 不在正式目录边编辑边测试，不将开发数据库、会话、测试账号或秘密数字覆盖到正式环境。测试不能清理正式库。
- `deploy/install.sh` 和 `deploy/pair-play.service` 是正式安装文件；不要为启动开发环境直接执行它们。
- 用户指定保留 Milvus；不修改、停止或重新部署无关服务。原已停止的 OpenClaw、Hermes、openHusky、RustDesk 不因本项目开发而重启。

## 实现约定

- 当前四位数字是字符串 `0000`–`9999`，允许重复和前导零；只返回位置命中数量，不标出命中的位置。
- 大厅支持多个注册玩家，无需加好友；猜数字是其中的双人游戏。后续短局允许多人，长期存档独立于房间。
- HTTP、SSE 和恢复路径必须使用按玩家裁剪的视图。禁止把服务端快照或对方秘密送到客户端。
- 禁用历史默认关闭；开启时进行中隐藏完整历史，结束后双方可查看本局全部猜测及命中数。
- 日间 / 夜间、电脑 / 手机及混合设备都需要可用；保留输入草稿、焦点、历史滚动和软键盘体验。
- 随机、时间、权限、胜负和资源结算以服务器为准。请求去重、版本校验和事务是目标重构中必须实际实现的能力，不能只靠 TypeScript 类型声称完成。
- 新游戏按注册表和独立模块接入；不持续往大厅通用代码里堆专属规则。农场 / 牧场不能依赖对局房间保存长期进度。

## 每次交付

先核对工作区、运行服务和文档状态，再做修改；已有其他 Agent 的改动不能直接覆盖。测试入口见 testing-guide，同一时间仅跑一组占用 3221 的集成测试。

修改后记录做了什么、实际验证了什么、尚未完成什么；更新 `docs/handover.md`，重要选择补到相关架构文档。正式发布遵循当前用户授权和 deployment-runbook；不要把写了方案、测试通过或重启成功等同于迁移完成。

不要将密码、会话 Cookie、数据库连接密钥、私钥或真实玩家秘密写入文档、提交、日志示例或前端产物。
