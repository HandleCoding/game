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

当前 14 项，正常约 25 秒；包含真实 15 秒邀请过期。exit 0 和 TAP pass 14 / fail 0 才算通过。测试迁移夹具使用 /var/backups/pair-play 私有临时 SQLite 文件，由测试自行清理；执行账号需要该路径权限。node:sqlite 的实验提示仅来自迁移测试，不是在线 PostgreSQL 后端。

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
