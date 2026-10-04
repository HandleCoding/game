# 沉浸式牧场与侧边食槽（2.3.1）

开发目录 /opt/pair-play-dev。用户要求进入牧场后像独立的小游戏：场景铺满屏幕，信息和按钮浮在场景上，商店等点击后出现；不是大厅网页中的一张牧场卡片。素材为原创，没有使用用户参考截图中的腾讯素材。

## 界面与交互

- App.vue 仅在 animal-ranch 持续游戏激活且没有短局房间时隐藏大厅页头，锁定网页滚动。离开牧场、注销或进入短局时恢复。网络状态、游戏邀请和通知继续可用。
- RanchGame.vue 拥有 100dvh 视口，适配 safe-area-inset；账号、等级 / 经验、金币 / 饲料浮在顶部，返回 / 日夜 / 玩法 / 可用时浏览器全屏位于边缘，六个主要操作位于底部。页面本身不滚动。
- 浏览器真正的 fullscreen 需要用户点击，支持时请求 document.documentElement，使 Teleport 到 body 的原生对话框仍可见；手机即使不支持 Fullscreen API，游戏也铺满页面可见区域，浏览器自己的地址栏不在网页控制范围内。
- 场景默认按 cover 比例铺满；全景按钮可缩小查看整个世界。旋转 / 调整窗口会重新计算相机；拖动 / 双指缩放保持。背景与动物在 Canvas 世界坐标中绘制，动物按纵深排序。食槽复用背景左侧围栏旁的原设施，中央不绘制新食槽。
- 各动物有产物时头顶显示“可收获 N”，缺粮无产物时“需要喂食”。有产物且缺粮同时出现时保留“可收获 N · 缺粮”。不公开额外私有资源。Canvas 字体保证约 12 屏幕像素，底部动物选项同时提供状态和可访问入口。
- 左侧原食槽实体 / 小木牌均可点击打开现有喂食窗口；木牌只显示“食槽”二字，具体余额在顶部 HUD / 弹窗显示。标牌随相机平移缩放，设施不在视野时隐藏，不将大标牌固定在屏幕边缘。
- 手机竖屏看不到左侧设施时，底部添饲料入口保留；可用全景 / 平移找到设施。全景标牌在窄屏边缘保持完整和 44px 点击范围。
- 可添加 20 / 100 / 300 份，实际余额、上限和扣费由服务端裁定。侧边食槽可见时动物向旁边草地聚集；设施在当前视野外时动物原地吃食，避免手机上的动物全部走出画面。暂停与减少动态效果仍有效。
- 食槽实体点击由 Canvas 判断，到完整 click 时再打开弹窗，避免 pointerup 后兼容点击穿透到补粮按钮；拖动不触发点击；仅标签使用 44px 高的按钮，避免一个透明大按钮挡住中央拖动区域。
- 访客只读：木牌仅显示“食槽”，公开缺粮状态仅作为提示；不显示数量、金币、库存、添粮按钮。点击参观后关闭原面板，回我的牧场恢复主人视图。
- 商店 / 仓库 / 喂食 / 详情 / 串门 / 扩建日记 / 玩法说明使用原生 dialog 层，独立滚动、关闭和焦点返回。日夜切换在游戏内保留，夜间场景温和降低亮度。

## 曾用中央食槽素材（2.3.0 归档）

用户反馈中央食槽碍事且突兀；2.3.1 已删除其运行时绘制与加载，直接复用背景左侧食槽。以下文件 / 提示词为历史素材归档，不是当前显示的设施。

使用 ImageGen 内置工具生成，保持 RGBA 透明通道，无 Python 像素编辑。原图 1774 × 887，两格各 887 × 887：左为有粮，右为空槽。由 hungry 公共状态选择格子；数量只为主人显示。

项目文件：apps/web/public/ranch/scene/feeder-states.png
Windows 副本：E:/AIWorkSpace/codexSpace/pair-play/output/ranch-scene/feeder-states.png
背景作为风格参考：apps/web/public/ranch/scene/pasture.png
原图集 alpha / 尺寸已验证；2.3.1 不再加载或绘制该图集，避免重复设施与额外图片下载。

最终生成提示词：

> Use case: stylized-concept. Asset type: transparent game sprite atlas, two states of ONE central wooden animal feeding trough for a cozy animated ranch. Reference image is style reference only, keep its warm painterly 2.5D look and sunlight, do not reproduce the background. Create a wide transparent PNG sprite sheet with two equally sized cells side by side, same camera, same object size, same position within each cell: LEFT a rustic oval-ended long wooden feeding trough generously filled with golden grains and green hay; RIGHT the IDENTICAL trough completely empty, dark clean wood interior. Small rounded sturdy wooden legs, iron corner braces, charming handpainted wood grain, readable depth, three-quarter slightly elevated front view; no sign, no text, no animals, no landscape, no grass patch, no border, no watermark. Center each fully visible trough in its half of the canvas with clear transparent margin; nothing crosses the vertical midpoint. Exactly two objects; repeated identical silhouette with only food differing. Genuine alpha transparency everywhere outside objects. The trough must occupy most of each half, mild soft shadow only directly beneath it.

## 后端与后续

当前改造不修改数据库 schema、成长时间、饲料消耗、价格或动物解锁等级；动作、事务、重复请求和访客权限继续由原持久游戏引擎执行。旧账号、牧场存档和猜数字记录沿用现有 PostgreSQL。

尚未实现的讨论候选：抚摸与心情、装饰布局、邻居互助、稀有花色图鉴、每日订单。不要把这些写成已上线功能；确定玩法后另做协议 / 并发 / 资源规则与测试。

当前验收见 test-reports/20261004-ranch-side-feeder.md 与独立 Chromium / WebKit JSON 报告；2.3.0 历史记录见 20261004-ranch-immersive.md。模拟浏览器验收不等于实体 iPhone / Android / 微信内置浏览器验收。
