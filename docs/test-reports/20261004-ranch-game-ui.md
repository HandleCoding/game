# 2026-10-04 牧场游戏面板验收（v2.5.0）

开发环境：京东云 /opt/pair-play-dev。生产数据库没有导入任何测试数据。本次只修改前端面板、插画工具栏与健康接口版本号，不更改游戏经济、服务器动作、数据库 schema 或已有存档。

## 验收范围

- 动物商店四分类/搜索/解锁过滤、格子选中不扣费、锁定动物禁购、幼年/成年预览、实际认养。
- 36 种动物图鉴，显示等级解锁进度，不能在图鉴意外花钱；柔和写实幼年/成年资源保持独立。
- 仓库真实库存、选中详情、全部出售与实际回包；食槽显式购买和一次提交去重。
- 真实动物详情、动画/暂停/减少动画、场景拖动与 Chromium 触摸双指缩放、页面铺满及进出大厅。
- 串门昵称搜索与只读权限，不能查看/操作他人私有钱包和食槽。
- 木质/奶油色面板、扁平 15×18px 白色小锁与等级文字、日夜样式、列表独立滚动。
- 认养操作按钮在点击前完整位于窗口内；动物格子高度至少 120px，不再被九行目录挤成扁条。
- 320×740、390×844、430×932、844×390、1440×1000；Chromium 与 WebKit 各 5 组。
- 390 与 1440 的全部 36 物种/两生命周期截图使用隔离浏览器公开视图夹具，未改变生产或开发公共数据。

## 命令与记录

`npm run typecheck`、`npm run build` 均通过（退出码 0）。
浏览器命令先在 cloud 设置 /etc/pair-play/dev.env，再用 flock 锁保护 3221。脚本强制 playroom_dev，创建和清理随机 schema。

```sh
flock -n /run/lock/pair-play-dev-tests.lock env -u PUBLIC_ORIGIN -u ALLOWED_ORIGINS -u PORT -u PGSCHEMA HOST=127.0.0.1 UI_BROWSER=chromium UI_BROWSER_EXECUTABLE=/opt/pair-play-dev/artifacts/browser-download/extracted/chrome-linux64/chrome npm run test:ui
# 同一命令切换 UI_BROWSER=webkit 与 UI_BROWSER_EXECUTABLE=/opt/pair-play-dev/artifacts/browser-download/webkit/extracted/pw_run.sh
```

最终结果见同目录 20261004-ranch-game-ui-chromium.json、20261004-ranch-game-ui-webkit.json。截图：artifacts/ranch-game-ui/{chromium,webkit}。实际查看手机格子/仓库/日夜/图鉴/串门、320px 和横屏认养区及桌面商店，修复并加入按钮可见性/格子高度检查。

本次未重复后端 18 项测试：服务器规则和存储没有改变；既有结果见此前报告。上述浏览器交易仍访问真实隔离开发数据库和 API。

## 图片

原创内置 ImageGen 3×3 图集，1254×1254 RGBA（PNG color type 6），源 alpha 原样保留。
SHA256: 2f256b6e8262e08f86b6e8334817738773f025989a63faf6e2a1ec6e2d79c57b。
提示词与布局索引见 docs/ranch-game-ui.md。

## 实际边界

验收为云端 Chromium/WebKit 浏览器及手机模拟视口，不声称实体 iPhone/Android/微信内置浏览器测试；实体软键盘和后台行为未新增实机验证。
Computer Use 找到用户“QQ经典农场”窗口，但两次画面捕获失败（FrameArrived / window capture timed out）；没有对微信原程序执行购买或其它游戏动作。界面参考来自用户截图。
正式发布与保留账号/会话/数据的核对结果，发布后记录于同目录 20261004-ranch-game-ui-release.json。
