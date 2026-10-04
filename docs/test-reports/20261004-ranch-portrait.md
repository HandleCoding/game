# 2026-10-04 动物与工具图集裁切修复（v2.5.1）

## 问题和改动

用户截图中，小狗、绵羊、白鹅、山羊、奶牛、羊驼右边出现旁边一帧的身体碎片。此前 AnimalPortrait 仅用 viewBox 与 overflow:hidden：preserveAspectRatio=meet 产生的横/竖留白仍属于 SVG 视口，完整 atlas 会在这些区域露出其它帧。

AnimalPortrait.vue 对 image 增加 userSpaceOnUse 的 clipPath，矩形为实际 alpha 元数据的一帧 bounds；viewBox 和自然比例保留。RanchIcon.vue 同样对 3×3 图集限定单格 100×100。各实例用 Vue useId，避免目录中多个 SVG 的裁切 ID 冲突。
Canvas 场景已经使用 drawImage 的源矩形裁切，无该留白问题，不改场景或原 PNG。后端仅更新版本号，不改规则、资源数值、数据库 schema 或存档。

## 验证

- npm run typecheck、npm run build：退出 0。
- 新脚本 scripts/ranch-portrait-qa.mjs，在 playroom_dev 随机 schema / 3221 测试锁下运行实际构建页面。
- 测试真实挂载组件的 72 种动物生命阶段、36 个目录格子、9 个工具图标；每张在 240×240、420×160、140×320 三种比例栅格化，共 351 项 / 引擎。检查 intended frame 外的留白像素 alpha 必须为空，不依赖具体 clipPath 实现。新增非空图像检查避免把空白图片当作裁切成功。
- 旧版本 Chromium 基线：351 项中 252 项有串图，退出 1 为预期复现。报告 20261004-ranch-portrait-baseline-chromium.json。
- 修复后 Chromium 与 WebKit 各 351 项通过、串图为 0，共 702 项。最终结果见 20261004-ranch-portrait-{chromium,webkit}.json。只测试开发隔离 schema，完成后清理，没有写正式数据。
- 实际查看 390px 与 1440px 的商店首行、羊驼与详情截图；修复后邻帧碎片消失。截图 artifacts/ranch-portrait/{chromium,webkit}，Windows 副本 E:/AIWorkSpace/codexSpace/pair-play/output/ranch-portrait。
- 非空图像断言在 Chromium 首轮裁切通过后加入，WebKit 验收包含该增强断言；本次没有改浏览器图片/安全策略。

命令：加载 /etc/pair-play/dev.env 后，用 flock 和环境变量选择浏览器，执行 npm run test:portraits（或 node scripts/ranch-portrait-qa.mjs）。浏览器路径与 testing-guide 相同，PORTRAIT_BASELINE=1 仅用于明确的旧构建复现，不会跳过或降低断言。

## 验收边界

浏览器渲染及手机模拟视口，不声称实体手机测试。没有重复整个大厅/后端套件，既有规则与 UI 布局没有改变；当前检查直接针对用户发现的图集渗漏，并覆盖共用组件的所有动物与图标。
发布结果及账号/会话/存档保留验证另见 20261004-ranch-portrait-release.json。

## 正式发布

2026-10-04 18:11:57 +0800 发布完成。发布源 bd56c11918dd4e5816f83150843bb5f2cefed347；目录 /opt/pair-play/releases/v2.5.1-20261004-181153。部署前备份 /var/backups/pair-play/postgres-prod-20261004-181156.dump，账号、会话、结果、结果参与者、长期档案数量一致，既有有效会话验证成功。公网 /healthz 返回 2.5.1 / postgresql，正式 RanchGame JS / CSS 与本次构建逐字节一致。pair-play、pair-play-dev、caddy 均 active。没有改数据库 schema 或原始素材。
