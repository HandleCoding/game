# 牧场游戏面板与插画工具栏（v2.5.0）

## 目标与交互

用户提供九张 QQ 农场小程序截图，参考其全屏场景、木质窗口、奶油色格子、选中态、固定操作区与串门列表。使用原创插画与本项目现有动物素材；不添加广告、充值、好友申请、作物或未实现的装扮按钮。

- 动物商店：四个分类、名字搜索、仅看已解锁；紧凑格子点击只选中，不直接花金币。未解锁使用 15×18px 扁平白色小锁与淡遮罩显示等级，资料仍可查看；操作区显示成长时间、产出周期、每轮数量、认养价格，并在等级/金币/位置不足时禁用。
- 动物图鉴：36 种现有动物目录，幼年/成年两套外观可切换。进度是“已解锁”，不是历史收藏数据；没有虚构已养过的记录。
- 仓库：真实产物库存格子，选择后显示数量、单价与合计；出售当前种类为该种全部库存，与现有 API 规则一致；全部出售按钮独立。
- 食槽：余粮与容量、可续食时间，20/100/300 份按钮显示对应实际价格。
- 动物详情：草地展台、当前幼年/成年外观、真实可收获/缺粮/成长状态与进度。
- 串门：全部已开牧场的玩家，昵称搜索与等级/昵称排序，无好友申请；访问保持只读与钱包/仓库/喂食权限隔离。
- 扩建与日记：保留真实资源扣费及服务器日志，视觉改为统一游戏面板。
- 手机：上下分区，物品列表滚动，资料操作区保留在下方；横屏与电脑用右侧资料区。工具栏与场景安全区分别布局，食槽与动物选择器不能被菜单遮挡。日夜模式仍遵循平台主题。

## 代码与素材

- apps/web/src/games/animal-ranch/RanchGame.vue：全部面板与 HUD。
- RanchIcon.vue：使用 SVG viewBox 定位，并对 image 添加单格 clipPath 裁剪原始 PNG 图集，不改图像像素或透明度。
- apps/web/public/ranch/ui/ranch-tools-v1.png：内置 ImageGen 原创 3×3 透明图集。顺序：收获篮、动物小屋、食槽；仓库、邻居小屋、扩建工具；动物图鉴、金币、粮袋。
- AnimalPortrait.vue / soft-atlas-metadata.ts：继续使用已验收的 36 种柔和写实动物与独立幼年/成年素材。
- 后端动作、经济参数、数据库表和存档规则未变；版本健康标记更新至 2.5.0。

## 图片来源与生成

工具：内置 image_gen.imagegen，transparent_background=true；没有使用 CLI/API key。
风格参考：本项目 /ranch/scene/pasture.png；原始生成保存后原样复制，保留 alpha。
最终文件：apps/web/public/ranch/ui/ranch-tools-v1.png
Windows 原件副本：E:/AIWorkSpace/codexSpace/pair-play/output/ranch-game-ui/ranch-tools-v1.png

最终提示词：
> Use case: stylized-concept. Asset type: ONE transparent game UI icon atlas for an original cozy animal ranch. Image 1 is ONLY a style reference for warm, detailed hand-painted 2.5D countryside art. Generate a square 3-by-3 equal-cell atlas with exactly nine independent isolated icons, one centered in each cell. Row 1 left to right: wicker harvest basket with white eggs and soft wool; tiny red-roof animal barn with a little chick at doorway (animal shop); wooden feeding trough full of corn and hay (feed). Row 2: wooden storage chest with milk bottle and eggs (warehouse); cozy cottage with path and fence (visit neighbors); sturdy wooden hammer with rolled construction plan (expansion). Row 3: open illustrated animal field-guide book with a paw medallion (encyclopedia); golden coin stack with embossed paw (coins); fabric sack of grain with corn cob (food). Warm honey wood, creamy eggs, meadow green accents, sunlight from upper left, soft realistic textures and painted outlines. These should read clearly as rich game UI objects at 48px, not emoji or flat clipart. Every object occupies 72 percent of its equal square cell with transparent safety margins. True transparent alpha background, no ground plane, no frame, no text, no labels, no grid lines, no watermark. Identical scale and light direction across all nine cells.

## 验收

执行与实际结果另见 docs/test-reports/20261004-ranch-game-ui.md。
scripts/ranch-ui-qa.mjs 覆盖格子选中不扣费、锁定禁购、幼年/成年预览、图鉴无购买按钮、库存出售、串门搜索/隐私、主题、手机触摸、横屏与桌面。所有浏览器数据位于 playroom_dev 随机 schema，测试结束删除该测试 schema。
微信原程序 Computer Use 能定位“QQ经典农场”窗口，但捕获画面超时，未对原程序进行点击/购买；参考依据为用户直接提供的截图。

## v2.5.1 图集防渗漏

SVG viewBox 只定位/缩放，并不自动限定 image 的绘制到单帧；容器比例不同产生的留白可能显示相邻帧。AnimalPortrait.vue 和 RanchIcon.vue 必须保留对 image 的明确 clipPath，每个实例用 useId。裁切测试 npm run test:portraits 检查全部动物两生命周期、目录格子与九个工具，方/宽/高三种比例。详细报告 test-reports/20261004-ranch-portrait.md。

## 进入牧场与图片资源

v2.5.2 使用 RanchLoading.vue 显示存档准备与资源进度。RanchScene 内部按必要图片的加载/解码完成数计算，背景、工具和当前动物都准备完成并画出首帧后显示HUD。网络/解码失败与25秒无响应可原地重试，成功资源保留；卸载取消本组件任务。首屏不下载全部36种动物。不要恢复只显示文字、先露工具栏的旧加载态。

## 公网加载修正 v2.5.3

真实下载流更新每个资源完成比例，只有连续45秒未收到数据才超时；禁止恢复整图25秒限时。必要资源两路并发，首屏HUD用v-if避免额外SVG请求。版本化无损WebP尺寸/透明像素保持原样，PNG原件保留。-v1.webp长期缓存，未来改图必须增加文件版本；编码命令python3 scripts/encode-lossless-ranch.py。具体慢速验收和公网74.85秒实测见test-reports/20261004-ranch-loading-fix.md。
