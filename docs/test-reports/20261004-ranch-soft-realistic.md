# 柔和写实动物与场景融合验收（2.4.0）

2026-10-04。开发 / 构建 / 测试均在京东云 /opt/pair-play-dev；电脑只生成与查看素材，不运行开发后端或数据库。

## 实现

使用用户选择的 A 柔和写实方向，36 种动物分别生成幼年 / 成年及四帧步态。九张保留 alpha 的 PNG，场景和肖像实际使用 72 个阶段形象 / 288 帧。垂耳兔采用两行独立补充图；其他八张中的直耳兔备用行不用。素材与完整提示词见 ../ranch-soft-realistic-assets.md。

背景光照与动物暖色左上光、草地反射统一；自然眼睛与身体比例。脚底真实基线贴地、保持原生宽高比、软接触阴影、物种体量和纵深缩放、减少待机浮动、错行站位及密度缩放。既有侧边食槽 / 状态提示 / 主题 / 访客权限保留。

## 实际验证

- python3 scripts/analyze-soft-ranch-atlas.py：exit 0。只读 PNG alpha；所有图集行、四列帧非空；每帧脚底和边界生成到 soft-atlas-metadata.ts，原 PNG 未修改。
- npm run typecheck：exit 0；tsc 与 vue-tsc 均通过。
- npm run build：exit 0；Vite 39 模块，懒加载 RanchGame。
- npm run test:ui：Chromium 5 / WebKit 5，failures=[]，均 exit 0。最后一次在站位 / 密度调整、重新构建后运行；两引擎通过独立 schema 和同一端口锁依次运行。
- 尺寸：390×844、320×740、430×932、844×390、1440×1000；手机模拟触控 / 横竖屏，桌面。
- 覆盖：视口铺满、页头隐藏 / 返回恢复、无横向溢出、独立幼年图加载 / 旧 cartoon 图不请求、动画 / 暂停 / 减少动态、收获 / 仓库出售、商店搜索 / 认养、侧边实体 / 木牌添粮、一次购买无穿透、详情、日夜切换、刷新存档、44px 操作区、触控平移 / Chromium 双指缩放、访客资源隐藏及面板关闭。
- 390 / 1440 额外通过浏览器只读公开视图夹具渲染所有 36 个物种及两阶段、混合牧场。夹具只拦截测试浏览器 GET，不修改正式或开发公共档案。其他操作仍在独立开发 schema 通过实际后端执行。
- 最终 390 混合牧场、1440 大型成年 / 幼年截图已实际查看：透明背景无底色块，脚底贴地、比例与阶段可辨识，扩大间距后原先被完全挡住的河马可以辨识。近景手机可平移 / 全景浏览完整牧场，不将整张世界塞进窄屏。
- 开发健康：{ok:true,version:2.4.0,database:postgresql}。

报告：20261004-ranch-soft-realistic-ui-chromium.json / webkit.json；截图：artifacts/ranch-soft-ui/（忽略提交）；电脑所选截图与原图副本 E:/AIWorkSpace/codexSpace/pair-play/output/ranch-soft-realistic。

## 边界

素材为 3D 质感 PNG 精灵，未制作三维网格或骨骼。浏览器模拟不等于实体 iPhone / Android / 微信真机。已有 18 项后端规则回归本次未重跑；本次未改成长、钱包、数据库 schema 或后端游戏规则，只改图像渲染与版本标识。

## 正式发布

使用 scripts/release-postgres.py --deploy；备份、源提交、发布目录、会话与数据数量校验将在同日期 ranch-soft-realistic-release.json 记录。服务端使用旧存档、物种 ID 和参数，无数据导入或重置。
