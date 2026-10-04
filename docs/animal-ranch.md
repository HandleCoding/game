# 一起牧场：实际实现与接手

2026-10-04，客户端日期 Asia/Shanghai。新增 ID animal-ranch，kind=persistent，version=1；当前应用版本 2.6.0 / 数据库 schema v3。用户要求先养动物，首版 30+ 种、不同等级和周期；实际 36 个独立物种。未加入作物种植。

## 入口与玩法

大厅新增一起牧场卡片，登录后进入个人存档；也可使用 /?game=animal-ranch。无需开房、准备或邀请才能玩。离开界面、参与猜数字不重置进度。在线状态显示一起牧场 / 正在游玩，同时仍可接受短局邀请。

800 金币、240 饲料、4 个位置、1 只带 3 份鸡蛋的成年小鸡。认养幼崽 → 食槽自动喂养 → 成长产出 → 收获仓库 → 出售 → 升级 / 扩建 / 解锁新品种。36 种按家禽家畜、萌宠、动物园分类、按等级逐步解锁；可分类、搜索和仅看已解锁。

所有已有牧场可从串门目录参观，包含离线玩家，无加好友机制。首版只读，不支持偷取、帮喂、交易、赠送。访客视图不返回金币、经验数值、饲料数量、仓库和私人日记。

## 数据与事务

通用 persistent_profiles 保存存档版本、revision、结算时间和轻量摘要 version / at / feedUnitMs。PersistentDefinition 增加可选 storage.load / storage.save，供牧场以结构化表加载保存；旧的纯 JSON 测试游戏兼容。

- ranch_wallets：非负金币、经验、饲料毫秒、4–16 偶数容量、下一个动物编号。
- ranch_animals：每只独立行，私有 JSON 保存物种、年龄、积攒产量及购入时周期 / 产量 / 产物 / 实际价格 / 收获经验。不是把整个牧场放进一个房间快照。
- ranch_inventory：每种产物数量有非负约束。
- ranch_ledger：购买、饲料、收获、出售、扩建的日记和金币变化，不删除旧流水；页面展示最近条目。
- action_receipts：重复请求只执行一次；expectedRevision 防止两台设备覆盖。
- 全部与档案 SELECT FOR UPDATE 在同一事务提交；失败整体回滚。访客读取也会按规则结算后裁剪公共视图。

schema v3 扩大食槽毫秒预算上限；v2 仅添加新表和索引，不重建原 users / sessions / results / active_rooms。数据库迁移和新增游戏都不导入开发 QA 用户到正式库。

## 时间与资源

时间来自服务器，settle 将离线经过时间限制在食槽实际可供给的时间；新牧场每只每30分钟一份，共享饲料。累计量最多三轮，缺粮暂停、不死亡，补粮从当前时间继续，不追补饥饿期。

保存实例参数，未来调整商店不能修改已有动物周期。读和动作都会结算；离线不用定时器不停写数据库。onMounted / visibilitychange / 15 秒轮询刷新，倒计时只展示。提交后只给主人 SSE persistent-change 提示，各设备重新读取权限视图；轮询作为重连补偿。

牧场浏览 presence 为临时在线信息（60 秒租约），不作长期游戏开局计时，离线即清理；短局房间状态优先，仍沿用双人游戏邀请逻辑。

## 文件地图

后端 apps/api/src/games/animal-ranch/engine.ts、storage.ts、definition.ts。
前端 apps/web/src/games/animal-ranch/RanchGame.vue，独立懒加载；共享 packages/contracts/src/ranch.ts、ranch-catalog.ts。
数值及原始参考：ranch-balance.md；图片授权：ranch-assets.md。
测试 test-v2/ranch.test.ts、ranch-storage.test.ts 与扩充 server.test.ts。

## 实际验证与限制

25 项云端自动化测试、类型检查和构建均已通过，验收细节见 test-reports/20261004-animal-ranch.md。
前端保留日夜主题、响应布局、最小触控按钮、减少动画设置；最终浏览器 / 手机验证结果如实记在报告，不能以构建通过代替实机验证。
牧场没有公开重置按钮，避免误删长期进度；具体动物扩展、图鉴收集奖励、装饰、跨玩家互动待后续授权开发。

## 2.2.0 动态场景更新

前端新增 RanchScene.vue（独立 Canvas 视觉模拟）、AnimalPortrait.vue（共用真实帧边界）、sprites.ts 与 atlas-metadata.ts。36 种全身动物四帧走路、场景直接点击、工具栏弹窗、移动端平移 / 缩放。资料见 ranch-scene-assets.md；10 组浏览器尺寸 / 触控验收见 test-reports/20261004-ranch-scene.md。视觉计时不改变服务器资源规则。

## 2.6.0 数值重做

每级经验增加，扩建有等级/金币要求，买卖与扩建零XP；小时成长/生产，初始240份饲料每只30分钟一份。数据边界、模拟与本次唯一牧场重置见 ranch-balance.md 和 test-reports/20261004-ranch-balance.md。operator reset.ts 与 scripts/reset-ranch.mjs 仅供用户授权的维护操作，不作为网页重置接口。
