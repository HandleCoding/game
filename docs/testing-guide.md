# 云端测试

开发工作区 /opt/pair-play-dev。测试要求 DATABASE_URL 指向 playroom_dev，自动随机创建 / 清理独立 PostgreSQL schema；不会清空开发公共 schema 或正式库。集成 HTTP 端口固定 3221，同一时刻只跑一组。

```sh
cd /opt/pair-play-dev
npm run typecheck
npm run build
set -a
. /etc/pair-play/dev.env
set +a
flock -n /run/lock/pair-play-dev-tests.lock env -u PUBLIC_ORIGIN -u ALLOWED_ORIGINS -u PORT -u PGSCHEMA HOST=127.0.0.1 npm test
```

当前 18 项，正常约 25 秒；包含真实 15 秒邀请过期。exit 0 和 TAP pass 18 / fail 0 才算通过。测试迁移夹具使用 /var/backups/pair-play 私有临时 SQLite 文件，由测试自行清理；执行账号需要该路径权限。node:sqlite 的实验提示仅来自迁移测试，不是在线 PostgreSQL 后端。

## 覆盖

10 项原规则：数字 / 命中、准备 / 锁定、骰子平局、回合 / 胜利、超时、断线 / 重连、双方离线 / 重开、记忆隐私、前导零 / 最新对方猜测、各种结束原因完整复盘。

1 项真实 Fastify / PostgreSQL HTTP 回归：认证、Origin、目录 / 在线、邀请接受 / 拒绝 / 过期、容量 / 权限、完整对局、记忆模式、进程重启恢复、退出。

3 项新架构验证：

- 迁移保留 ID、原密码、会话、结果和私有快照；拒绝重复 / 非空导入。
- 长期档案初始化唯一、并发重复动作一次、访客视图、旧 revision / 无效动作拒绝与事务回滚。
- 注册表版本 / 三人容量 / 准备、请求去重、旧 revision、持久复盘，以及 PostgreSQL 写入失败后内存席位回滚。

测试专用三人 / 持续引擎不注册到正式目录，不伪装为已上线游戏。

## 浏览器验收

两个独立账号 / 会话访问开发服务，覆盖桌面 + 桌面、手机 + 手机、混合设备；390px / 更小视口辅助布局验证。真实手机的键盘和后台切换不能仅靠模拟视口代替。

检查：所有在线可邀请、15 秒弹窗、双方准备、0000 / 0123、骰子平局 / 先手、0–4 位效果、超时、断线暂停 / 恢复、日夜主题、固定输入区、SSE 更新后草稿 / 焦点 / 滚动、记忆模式最新对方猜测、结束双方全记录 / 筛选 / 刷新 / 重开。

API / SSE 不提前公开秘密、旧结果复盘按权限拒绝、非参与者不得读取。数据库迁移需逐字段核对，不只看总数；正式切换后检查原会话及真实入口，不在正式库灌测试账号。

## 报告

每次写 docs/test-reports/日期-任务.md 和必要日志，列命令 / 退出码 / 提交 / 设备 / 已验收 / 未执行项。禁止写真实凭据或玩家秘密。当前迁移日志见 20261004-architecture-migration.tap.log，完整报告见同名 md。

## 牧场验收

新增 4 项牧场专属测试并扩充真实 HTTP：36 个唯一物种、分类、参数与素材；离线 / 缺粮 / 分段 / 时钟回拨 / 上限；认养、收获、出售、升级和访客隐私；结构化表首次初始化、多设备重复 / 冲突、钱包仓库流水事务、写入失败回滚、重载。HTTP 覆盖目录、串门、牧场在线状态仍可邀请、篡改 owner / 负数 / 未解锁拒绝、进程重启保留。

## 手机 / 桌面动态牧场验收

Playwright 测试代码 scripts/ranch-ui-qa.mjs，npm run test:ui。来源 / 依赖 / 实际边界见 test-reports/20261004-ranch-scene.md。加载 dev.env、加 /run/lock/pair-play-dev-tests.lock，脚本强制 playroom_dev 并创建 / 删除随机 schema，端口 3221；不要对生产库运行。UI_BROWSER=chromium（默认）或 webkit，UI_BROWSER_EXECUTABLE 可指定已验证的官方引擎路径。常规环境用 npx playwright install chromium webkit；本次官方下载修复脚本 download-qa-chromium.py、download-qa-webkit.py 固定于 Playwright 1.63.0 所需版本，未来升级不能盲目复用其版本 / 校验值。脚本输出和截图均在 artifacts（忽略提交）。

截图必须实际查看；模拟器不得声称为实体手机验收。测试新版本之后重新载入浏览器，localhost:3211 依赖到云端的 SSH 转发。

## 图集裁切回归

npm run test:portraits（scripts/ranch-portrait-qa.mjs），同样要求 dev.env / playroom_dev / 3221 flock 锁及浏览器路径。每个引擎 351 项：72 种生命周期、36 个目录格子和 9 个工具，在三种容器比例下栅格化真实组件；帧外留白必须透明，并校验图片非空。报告 20261004-ranch-portrait-{chromium,webkit}.json，截图 artifacts/ranch-portrait。旧版本可设置 PORTRAIT_BASELINE=1 复现，原版 252 项泄漏；不要把旧构建失败视为新构建通过。

## 牧场首次加载

npm run test:loading，scripts/ranch-loading-qa.mjs。使用同样的playroom_dev、独立schema、3221锁和浏览器路径；通过真实页面请求延迟/失败/损坏图片检查进度与恢复，Chromium覆盖25秒实际超时。报告20261004-ranch-loading-{chromium,webkit}.json。需新文档冷图片请求验证网络错误，已解码浏览器缓存的图片可能不再访问网络。
