# 动态牧场素材与生成记录

2026-10-04，使用内置 ImageGen（非 CLI/API fallback）生成原创游戏素材。云端文件目录 /opt/pair-play-dev/apps/web/public/ranch/scene；电脑选定素材副本 E:/AIWorkSpace/codexSpace/pair-play/output/ranch-scene。原始生成文件留在 Codex generated_images，不作为项目运行依赖。

- pasture.png：1536×1024，完整牧场背景，围栏、草地、红顶畜舍、食槽、池塘、山丘。
- animals-0.png 至 animals-3.png：每张实际 836×1881，四列、九个物种行。每个物种四个走路姿势，总共 36 个物种 / 144 帧。
- 生成图集的行距并非严格等分；analyze-ranch-atlas.py 只读透明间隔生成 atlas-metadata.ts。Canvas 与 SVG 图鉴裁切共用真实边界，没有修改位图内容。PNG alpha 保留。
- 商店 / 场景共用 sprites.ts 物种映射。场景先加载背景及当前动物所需图集，新增不同图集动物时按需加载；不进入商店就不预加载无关图集。
- 原 Kenney CC0 素材保留，许可记录在 ranch-assets.md；新的全身动物与场景使用本次生成的素材。

## 背景生成提示词

Use case: stylized-concept. Production bitmap asset for an original Chinese nostalgic social animal ranch browser game, the polished visual language of classic 2009 social farming Flash games: richly painted colorful 2.5D cartoon isometric-ish ranch. NOT a website mockup, NOT icons, NO UI, NO text, NO animals. Wide 1536x1024 landscape background. High slightly tilted camera looking at a fully enclosed wooden fenced green pasture. Composition: spacious uninterrupted lush lime-green playfield occupying central 65% and lower center, where animated animals will be overlaid. Upper left charming red-roof cream barn and open stable doors, upper right large shady trees and hay bales, small shallow oval duck pond at right edge only, rustic wooden feeding trough just inside left fence around mid-height. Enclosure fence rear across upper third and front along bottom edge with open gate center, footpath outside front. Background behind ranch rolling green hills, blue sky and rounded white clouds. Small flowers at edges only. Warm sunlight, soft volumetric shading, gentle painted textures, thick clean outlines, whimsical full-bodied game world, high quality original game art. Avoid flat vector blocks, avoid modern dashboards, avoid purple colors, avoid logos, watermarks and Tencent-specific assets.

## 动物图集提示词模板

每组分别调用一次内置 ImageGen，transparent_background=true。下方 ROWS 替换为各组有序九物种，使用 “1. chicken; 2. rabbit” 的行编号格式。

Use case: stylized-concept. Production full-body WALK ANIMATION SPRITE SHEET for an original classic Chinese social ranch game. Transparent alpha background. Exact canvas 1024 pixels wide x 2304 pixels tall. Rigid invisible grid of 4 columns and 9 rows. Each cell exactly 256x256. Each cell contains ONE complete cute animal centered, entirely inside its cell, with a consistent baseline at 80% height and 15% padding. 36 separate poses in total. Row order TOP TO BOTTOM: ROWS. Each row contains the SAME individual animal in four consecutive WALK CYCLE frames facing right in three-quarter profile: frame1 standing/left foreleg forward, frame2 passing stance, frame3 right foreleg forward, frame4 other passing stance. Clearly change leg and wing positions between consecutive frames to allow real frame animation, keep body sizes and head shapes identical within each row. Birds walk with alternating feet, snake slithers, turtle waddles; every animal is FULL BODY including feet, tails, wings, horns as appropriate. Hand-painted richly shaded soft 2.5D cartoon game illustration, original friendly rounded chubby anatomy, expressive shiny eyes, cream outline highlights, warm cheerful colors, strong consistent visual style like premium nostalgic farming games. Animals NOT face-only icons, not flat vector stickers, not emoji, not photoreal. Crisp clean edges with real alpha transparency. No shadows outside each cell, no fence, no background scene, no words, no labels, no lines or cell borders. STRICT uniform grid with all animals entirely visible. Row species must be exactly correct and distinct, no duplicate substitute species. No Tencent branding or logos.

四组分别为：

1. chicken, rabbit, dog, duck, sheep, goose, goat, cow, cat
2. pig, parrot, turtle, horse, frog, peacock, fox, alpaca, hedgehog
3. deer, owl, penguin, snake, buffalo, moose, zebra, bear, monkey
4. gorilla, giraffe, rhino, hippo, crocodile, lion, elephant, panda, sloth

实际输出尺寸和边界以文件、atlas-metadata.ts 为准，不能只依据提示词切图。
