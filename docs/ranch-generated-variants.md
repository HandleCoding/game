# 牧场生成属性外观

开发 Worktree：`/opt/pair-play-worktrees/ranch-generated-variants`；分支 `codex/ranch-generated-variants`，基于 main `95dec7d`。本任务没有修改正式服务、数据库或动物数值。

## 美术范围

用户选定“保留动物原貌，强化毛色与属性氛围”。36 物种 × 幼年/成年 × 雷/火/水/黄金/梦幻 = 360 款，四帧走路共 1440 帧，40 张透明图集。普通动物沿用原图；属性图保持自然眼睛、原始体型/花纹、柔和写实材质、左上暖光与草地反光。雷弧、火焰、水波、金辉与星雾随动物一起生成，单属性不再用程序染色替代。它们是二维透明帧图，不是三维模型。

使用内置 image_gen，未调用付费 API CLI。生成提示词、参考图路径、最新来源及文件哈希见 `docs/art/generation-plan.json`；返工过程保留在 `generated-journal.jsonl`。原始 PNG 与发布 WebP 在 `apps/web/public/ranch/scene/variants/`。五款兔样稿在 `art/elemental-drafts/`。

## 渲染与边界

`visual-sprites.ts` 根据物种、阶段、属性和帧编号选图。`generated-atlas-metadata.ts` 使用实际图片尺寸与逐帧透明边界；不假设生成结果尺寸或格子均匀。裁切包含光效，身体不透明主要连通区域单独计算尺寸、中心与脚底，防止光效导致身体缩小、悬空或邻格残影。

场景按需加载当前动物所需图集，保留两路并发、进度条、重试、CDN 回源、已解码缓存与减少动态效果。动物详情、名宠堂、融合材料用同一选图规则和 SVG clipPath；商店未购动物仍显示普通图。已有账号、品质/变异概率、产物售价、生命周期、图鉴发现与属性存档未改。

双属性目前按已保存顺序使用第一属性生成身体，第二属性继续使用动态氛围；没有生成专属双属性组合图，也没有叠两只动物。后续如需全生成双属性，单独制作十种无序组合，并明确保存顺序是否影响外观。

## 可复现检查

在此 Worktree 执行 `python3 scripts/build-generated-atlas-metadata.py` 分析 PNG，`python3 scripts/compress-generated-ranch-assets.py` 编码 WebP。Pillow 仅做只读 alpha/边界检查；ffmpeg 仅压缩编码。WebP 必须保持原尺寸和逐像素透明通道。脚本目前明确限制在该 Worktree 名称，其他目录使用前需审查路径。

`npx tsx --test test-v2/ranch-generated-sprites.test.ts` 检查全部 1440 帧文件、裁切和脚底范围、普通图回退、垂耳兔阶段与双属性。`npm run typecheck`、`npm run build` 验证构建。

UI 脚本 `ranch-generated-appearance-qa.mjs`、`ranch-generated-ui-qa.mjs` 只连接 playroom_dev 的随机隔离 schema，固定 3221 端口必须用 `/run/lock/pair-play-dev-tests.lock` 加锁。Chromium/WebKit 执行文件复用已有浏览器安装。报告前缀 ranch-generated，避免覆盖旧报告。模拟手机/电脑视口不是物理真机验收。

`scripts/prepare-generated-review.py` 生成 ignored 的 `artifacts/ranch-generated-preview/` 比较页，仅公开静态图片、裁切数据与 HTML。云端回环 3212，电脑 localhost:3212 通过 SSH 转发访问。不得改为公开整个仓库根目录。图集对比页不是正式游戏入口；实际场景以集成 UI 截图为准。
