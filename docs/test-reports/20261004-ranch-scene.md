# 动态牧场 2.2.0：手机和桌面验收

2026-10-04，全部开发、构建、数据库和独立浏览器运行在京东云 /opt/pair-play-dev。

## 实际实现

用户要求牧场场景和全身动画动物，原图标面板被替换为 Canvas 2D 场景、原创背景、36 个物种的 144 个走路帧、待机 / 喂食时走向食槽、收获和金币提示。属于带体积感的 2D 游戏画面，不是 3D 模型引擎。
工具栏打开商店、仓库、喂食、串门、扩建 / 日记；点击动物或可访问按钮打开详情。移动端支持 Pointer Events 拖动、双指缩放、全景与动画暂停，遵从减少动画偏好，后台暂停渲染。
不修改牧场经济、账号、存档协议或数据库 schema v2。游戏进度仍由服务器决定，视觉走动不参与资源计算。

## 验收结果

- npm run typecheck、npm run build 通过。
- 全部 18 项开发库回归 pass，fail / skipped 0；日志 20261004-ranch-scene.tap.log。
- 当前 Chromium / WebKit 各五组 UI 流程，合计 10/10，fail 0。报告见 20261004-ranch-scene-ui-chromium.json、20261004-ranch-scene-ui-webkit.json。
- 尺寸：320×740、390×844、430×932、844×390、1440×1000。
- UI 流程：注册 / 进入牧场、动画实际改变画布 / 暂停静止、收获、出售仓库、商店搜索 / 认养、喂食、详情、日夜主题、刷新保存、页面和弹窗无横向溢出、工具按钮 44px、减少动画。
- Chromium 手机触摸：真实输入事件模拟拖动 / 双指缩放；WebKit：触摸点击和 Pointer Events 拖动。WebKit 不声称验过原生 iPhone 双指事件。
- 实际读取截图并修复：图集不均匀行距串图、手机场景留白、标题布局、夜间文字对比度、面板按钮触控尺寸。
- 每次 UI 测试创建独立随机 schema，限制 DATABASE_URL 为 playroom_dev，使用 3221 并加锁。退出时删除自己的临时 schema，无正式测试账号。
- 截图在 artifacts/ranch-ui/chromium、webkit（忽略提交），选定截图副本在电脑 pair-play/output/ranch-ui。

## 工具和边界

本次 Codex 内置浏览器的导航 / DOM / 截图控制反复超时，不能用它验收。改用项目自己的云端 Playwright 测试浏览器，从云端直接访问独立测试服务；不是接管用户浏览器或读取其存储。
当前 Playwright 1.63.0；Chromium 153.0.8010.12 从 Google 官方地址下载并比对官方 MD5；WebKit 26.6 / 2359 从 Playwright CLI 指定的微软官方备用地址下载并校验 ZIP CRC。下载产物仅在 artifacts/browser-download，不提交。
安装中文 / emoji 字体、WebKit 运行库；needrestart 仅报告，无关服务没有重启。官方 install-deps 的 apt update 被原 Docker / GitHub 源缺公钥阻断，之后只从正常签名的 Ubuntu 源安装缺失依赖；没有关闭签名校验或改动这些源。
这是 Linux 浏览器引擎和手机尺寸 / 触控模拟验收，不等同于真实 iPhone / Android 硬件、微信内置浏览器或软键盘实机测试。截图、操作、动画均是实际运行结果，不是设计稿。

## 预览和发布

京东云开发服务：127.0.0.1:3211。Windows localhost:3211 为仅本机 SSH 转发入口，程序与数据库在云端。转发已恢复并实际验证 healthz=2.2.0 / PostgreSQL；不开放公网开发端口。
正式版本更新以本报告后续发布结果和 handover 环境表为准。上线先备份、核对无活动短局、保存账号会话和牧场档案，不导入开发数据。

## 正式发布结果

已于 2026-10-04T14:20:34+0800 上线 https://game.aicoding.ltd/。
源提交 38ced49989a779223720cf26364a13fcdaa9d3fe，发布目录 /opt/pair-play/releases/v2.2.0-20261004-142030；备份 /var/backups/pair-play/postgres-prod-20261004-142032.dump。
原用户 2、会话 3、猜数字结果 3、参与记录 6、长期牧场档案 1，切换前后数量一致；有效会话身份验证通过。数据库继续 schema v2，无开发测试账号导入。
公网 healthz=2.2.0 / PostgreSQL，HTML、JS/CSS、原 36 个动物资源和新 5 个场景 / 图集 HTTPS 验证通过。正式 / 开发 / Caddy 均 active，未更改无关服务。
