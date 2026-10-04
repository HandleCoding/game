# 在京东云开发

本文件针对已建立的 `/opt/pair-play-dev`；当前代码仍为无第三方依赖的原生 JS / Node.js / SQLite。目标框架的目录和构建流程在实施后更新，不提前写不存在的 npm 命令。

## 连接和确认工作区

```sh
ssh root@117.72.116.83
cd /opt/pair-play-dev
pwd
git status --short --branch
node --version
systemctl is-active pair-play pair-play-dev caddy
```

SSH 凭据由执行环境提供，不存入项目文件。首次连接核对主机身份。后续 Agent 使用具备权限的既有连接方式，不假设只能使用 root。

正式目录只用于已验收版本的发布；开发进程不能指向 `/var/lib/pair-play`。开发服务读取 `/opt/pair-play-dev` 下的代码，修改 Node 后端后需要重启开发服务。

## 常用开发操作

```sh
cd /opt/pair-play-dev
git status --short --branch
# 新任务在当前已确认的基线上建立自己的分支，名称遵循 codex/ 前缀。
# 存在其他 Agent 未提交改动时先协调，不能重置工作区。
git switch -c codex/你的任务名

node --check server.mjs
node --check game.mjs
node --check public/app.js
node --check public/theme.js
systemctl restart pair-play-dev
curl --fail --silent http://127.0.0.1:3211/healthz
journalctl -u pair-play-dev -n 80 --no-pager
```

`git switch` 示例需替换为实际任务名，只在有需要时执行一次。不要修改全局 Git 配置或覆盖他人分支。

页面静态文件通常重新加载就生效；后端源码修改需要重启。开发服务用独立低权限账号 `pairplaydev`，代码由开发者编辑，数据仅由该运行账号管理。

开发服务限制为一核 CPU 配额、MemoryHigh 512MB、MemoryMax 768MB；这些只限制该服务，不自动限制 SSH 中启动的测试 / 构建。重构后评估实际需要再调整，观察日志中的 OOM 或退出原因。

## 从电脑浏览器访问云端开发服务

在访问端执行 SSH 转发并保持窗口运行：

```sh
ssh -N -L 3211:127.0.0.1:3211 root@117.72.116.83
```

打开 `http://localhost:3211/`。后端、数据和规则仍运行在京东云，访问端只负责转发和浏览器。当前 PUBLIC_ORIGIN 必须与该地址匹配。

需要手机共同访问时，配置独立 HTTPS 测试入口并同步 PUBLIC_ORIGIN，再分别测试两个设备。当前尚无该入口；不能把开发服务监听 `127.0.0.1` 描述成已可访问 `117.72.116.83:3211`。若采用 IP + 端口，需要 Caddy / 监听与云安全组实际放通；正式域名证书不能自动用于 IP。

## 手动启动替代方式

通常直接使用开发 systemd 服务。只在调试确有需要时停止开发服务，然后以相同账号和配置手动运行，避免端口冲突：

```sh
systemctl stop pair-play-dev
cd /opt/pair-play-dev
runuser -u pairplaydev -- env NODE_ENV=development HOST=127.0.0.1 PORT=3211 DATA_DIR=/var/lib/pair-play-dev PUBLIC_ORIGIN=http://localhost:3211 node server.mjs
```

结束手动进程后执行 `systemctl start pair-play-dev`。不要在开发目录直接无配置 `npm start`：默认端口是 3210，会与正式服务冲突，默认数据目录也不符合现有隔离设置。

## 修改到交付的顺序

1. 根据 handover 分清当前实现和目标设计，确认本次范围。
2. 在开发目录改代码，不直接编辑在线版本。
3. 做适合本次变更的验证，涉及规则、数据库、隐私或同步时跑相应自动测试；完整发布前跑全部测试。
4. 在云端开发服务验证浏览器行为；UI 改动覆盖手机 / 电脑、主题、键盘与两账号协作。
5. 将具体命令、结果和未验收项写入 test-reports，更新 handover。
6. 检查差异、提交已完成的开发变更，再按发布手册发布当前用户授权的内容。

## PostgreSQL 与新框架的接入

迁移在开发目录进行，正式 SQLite 保持服务直到新版本验收。开发 / 正式使用独立数据库和角色，数据库连接密钥放受权限保护的环境配置，不进 Git。

先定义版本化 schema 与迁移器，演练保留账号 ID、盐 / 哈希、会话、结果关联和活动房间。旧快照须通过明确的猜数字适配器迁入，不能丢弃后声称兼容完成。开发数据不直接复制到正式库；若迁移演练需要真实数据，只能使用受保护且访问受控的备份，不能放到公开 docs 或提交里。

进入 TypeScript / Vue 阶段后，把 `vue-tsc`、`tsc`、构建和 schema 校验加入真实 package scripts 与 CI / 测试流程，再更新本手册。每个新游戏有规则、视图、存档版本和验收记录。
