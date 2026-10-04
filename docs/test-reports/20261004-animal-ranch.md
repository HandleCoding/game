# 一起牧场：36 种动物首版验收

日期：2026-10-04（客户端 Asia/Shanghai）。开发、编译和数据库测试全部在京东云 /opt/pair-play-dev。

## 实现

应用 2.1.0，schema v2；大厅保留猜数字，新增 animal-ranch / 一起牧场。36 个独立物种分家禽家畜、萌宠、动物园，独立素材和描述，按等级解锁；时间、产量、价格不同。买幼崽、喂养、成长、离线产出、容量上限、收获、出售、扩建、日记、只读串门构成完整循环。

钱包、动物、仓库、流水采用结构化表与档案行锁事务，请求去重和 revision 抵御多设备并发；SSE 变化提示 + 15 秒轮询。新游戏注册及前端模块独立，不依赖房间和双人准备。

## 通过的验证

- npm run typecheck、npm run build 通过；懒加载牧场组件、JS/CSS 构建成功。
- 全部 18 项云端测试 pass / fail 0 / skipped 0，包含原猜数字以及新增 4 项牧场专属测试，真实 HTTP 测试增加牧场流程。
- 唯一初始化 / 多设备重复收获 / 旧 revision 冲突 / 钱包和仓库非负 / 动物素材 36 个 / 离线饲料 / 分段时间 / 时钟回拨 / 储存上限 / 无效参数 / 访客隐私 / 数据库错误整体回滚 / 进程重启。
- 生产依赖审计结果保存在 20261004-animal-ranch-audit.json。
- 开发 HTML、构建入口、目录和 36 个动物静态资源验证结果由 check-ranch-cloud.py 确认。
- 原账号 / 会话 / 猜数字结果保持原数据库，不导入开发测试账号。

## 前端实际验收限制（2.1.0 发布时）

后续 2.2.0 已完成云端独立浏览器 10 组手机尺寸 / 桌面交互模拟验收，详见 20261004-ranch-scene.md；下文保留当次真实状态。

本次浏览器自动控制在导航、DOM、可见控件读取上反复超时，SSH 开发转发健康接口正常。未获得实际页面交互、截图或手机视口验收结果；不能把编译 / HTTP 成功当成真机验证。已实现 CSS 响应断点、44px 触控按钮、日夜主题和减少动画，真实手机及正式界面仍需补充视觉操作验收。

## 素材及参考

26 种图标来自 Kenney Animal Pack Redux（CC0），另外 10 种为原创 SVG；小鸡幼崽单独图不算物种数量。授权和来源见 ranch-assets.md。

新版官方公告未提供可核验完整牧场数值，旧版原始配置通过 GitHub API 核实；时间层次参考后缩短，其余 36 种参数 / 文案独立设计，详见 ranch-balance.md。不是新版 QQ 小程序数值的完整复制。

## 发布结果

用户明确批准“现在正式上线”后，于 2026-10-04T13:28:24+0800 完成发布。
正式源提交：b30c80334fd0e5eb800d9d0c90d2e7073a96e6bc；发布目录：/opt/pair-play/releases/v2.1.0-20261004-132821。
公网 https://game.aicoding.ltd/ 已运行 2.1.0 / PostgreSQL / schema v2；猜数字和一起牧场均在大厅目录。
维护前备份：/var/backups/pair-play/postgres-prod-20261004-132823.dump。旧用户 2、会话 3、猜数字结果 3、参与记录 6，切换前后数量一致；有效登录会话经身份接口验证。
维护恢复后公网 HTML、JS/CSS 入口、游戏目录、全部 36 个动物资源返回正常。未导入开发账号或修改无关服务。
上线后再次备份：/var/backups/pair-play/postgres-prod-20261004-133120.dump，在独立临时库恢复并核对 14 张表的数量，包含新增牧场表及 schema v2；临时验证库已删除，生产库未被恢复覆盖。
尚未完成的手机真机、前端视觉和交互验收见上文限制，不能把 HTTP 成功当成全部体验验收。
GitHub 仓库 https://github.com/HandleCoding/game；发布后的文档提交不会改变运行构建。

完整恢复数量（不含玩家内容、密钥）：
```json
{
  "users": 2,
  "sessions": 3,
  "results": 3,
  "result_players": 6,
  "active_rooms": 0,
  "import_runs": 1,
  "persistent_profiles": 0,
  "action_receipts": 1,
  "world_jobs": 0,
  "schema_migrations": 2,
  "ranch_wallets": 0,
  "ranch_animals": 0,
  "ranch_inventory": 0,
  "ranch_ledger": 0
}
```
