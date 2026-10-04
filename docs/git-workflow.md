# GitHub 协作与版本维护

仓库：https://github.com/HandleCoding/game
SSH origin：git@github.com:HandleCoding/game.git
云端开发目录：/opt/pair-play-dev
主分支：main。codex/architecture-migration 保留首次架构迁移历史。

## 认证

服务器现有 root SSH 身份已验证为 HandleCoding，目标仓库读取成功。复用已有密钥，本次不创建或上传新公钥，不修改 GitHub 账号的密钥设置。仓库 core.sshCommand 固定身份并使用 /root/.ssh/github_game_known_hosts；GitHub 主机公钥来自官方文档并已核验。私钥留在服务器，不能上传、打印或提交。

若未来改用专用 Deploy key，需使用只授权此仓库且允许写入的公钥；更换前验证读写，不影响线上应用。常规 push 不需要重新请求公钥。

## 开发流程

1. 先检查 git status、分支与远程，读取交接文档，不覆盖其他 Agent 未提交工作。
2. git fetch origin，确认 main 与远程关系。工作区干净时 git switch main、git pull --ff-only。
3. git switch -c codex/功能名；在开发环境实现和测试，禁止在正式发布目录编辑源码。
4. 检查 git diff、git diff --cached、文件清单；更新必要的架构 / 验收 / handover 文档，提交明确的改动。
5. git push -u origin codex/功能名。按当前用户授权协作范围处理评审、合并；需要创建 PR 时关联该任务。不要 force push 或删除他人分支。
6. main 保存完成验收的版本。发布按 deployment-runbook，记录源提交、发布目录、数据库备份与结果。

首次接入为空仓库初始化 main，并上传原提交历史及迁移分支。没有自动部署 webhook 或 CI 发布；push 本身不会改动正式服务。

## 数据边界

可提交源码、依赖锁文件、开发说明、无敏感信息的测试与验收报告。环境文件在 /etc/pair-play，数据库在 PostgreSQL 数据目录，备份在 /var/backups/pair-play，均不进入源码树或 GitHub。

禁止提交 .env、数据库 dump、SQLite、私钥、认证令牌、真实会话与玩家秘密。忽略规则不能移除已经提交的敏感历史；若发现泄漏，先停止推送并处理泄漏范围，不能只删除工作区文件后继续。

## 验证

git remote -v
git status --short --branch
git log -3 --oneline
git ls-remote origin

首次迁移源提交在 docs/test-reports/20261004-production-cutover.json，当前牧场上线源提交和发布目录在 docs/test-reports/20261004-animal-ranch.md；main 后续的文档提交不代表线上构建改变。源码同步不需要重新导入数据或重启 PostgreSQL。
