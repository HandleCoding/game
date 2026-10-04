# 云端开发流程

开发 / 构建 / 测试在京东云 /opt/pair-play-dev，访问端只运行浏览器或 SSH 转发。先读 AGENTS、handover，检查 git status，不覆盖其他 Agent 的未提交改动。

```sh
ssh root@117.72.116.83
cd /opt/pair-play-dev
git status --short --branch
systemctl is-active pair-play pair-play-dev caddy
npm ci
npm run typecheck
npm run build
systemctl restart pair-play-dev
curl --fail http://127.0.0.1:3211/healthz
```

源入口 apps/api/src/main.ts；运行 dist/apps/api/src/main.js。前端 apps/web/src，输出 web-dist，猜数字组件懒加载。后端 tsc、前端 vue-tsc 分别检查，不能以 Vite 打包代替类型检查。

数据库连接从受权限保护的 /etc/pair-play/dev.env 读取，不输出内容，不进 Git：

```sh
set -a
. /etc/pair-play/dev.env
set +a
npm run db:migrate
```

DB migration 针对明确的开发库。当前 version=1；新增结构须提交可审查的版本迁移并先在开发演练，不能直接操作正式库。

服务通常使用构建产物；调试时停止开发服务后，以相同 HOST / PORT / WEB_ROOT 和开发连接执行 npm run dev，避免与既有 3211 冲突。正式 3210 不作为调试端口。

浏览器入口：

```sh
ssh -N -L 3211:127.0.0.1:3211 root@117.72.116.83
```

打开 http://localhost:3211/；开发 allowlist 也包含 http://127.0.0.1:3211，可用两个主机名隔离 Cookie 做双账号验收。正式仅允许正式域名 Origin。当前没有手机可直达的公网测试域名；需要时另配置 HTTPS 测试入口和 Origin，不能声称 127.0.0.1 监听已支持公网 IP 访问。

## 新任务

检查工作区 → 从已确认基线建立 codex/任务 分支 → 修改模块 → 类型 / 构建 / 适当测试 → 开发浏览器验收 → 更新 handover 与 test-reports → 提交 → 按发布手册在用户授权范围发布。

当前独立模块：accounts、rooms、db、persistent、games registry。添加 match 游戏提供定义 / 引擎及独立 Vue 组件；平台公共类型不要求猜数字字段。添加 persistent 游戏实现 initialState / settle / action / view，并为资源、权限和成长添加实际表 / 事务。

引擎私有快照、数据库访问、密码和服务端规则不能导入前端 contracts。随机、时间、胜负、资源结算以服务器为准。保留两种主题和双端输入体验。

## 不执行的旧操作

不要直接无配置运行旧 npm start 期待 SQLite 服务；新 npm start 为编译后的 API，需要数据库配置。不要在开发目录运行正式 deploy/install.sh，不用测试数据覆盖正式库，不重启 Milvus 等无关服务。
