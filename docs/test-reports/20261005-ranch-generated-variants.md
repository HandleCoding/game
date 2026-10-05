# 生成属性外观验收 · 2026-10-05

分支 codex/ranch-generated-variants，基线 main 95dec7d。仅前端美术与裁切选择；正式服务未修改，无迁移、真实进度重置或账号变更。

- 40 张真实透明图集覆盖 36 物种、幼年/成年、五属性，共 360 款/1440 帧。alpha/相邻帧边界扫描全部通过；不均匀行列按实际边界处理。
- WebP 编码 40/40，逐像素 alpha 与 PNG 相同，尺寸一致。PNG 总计 65671834 字节；发布 WebP 总计 20290834 字节，约减少 69.1%。仅下载当前动物所需图集，不一次下载全部。
- 两项独立资源回归通过，内部覆盖全部 1440 帧存在、裁切/脚底范围，以及普通图、垂耳兔阶段和双属性选择。TypeScript/vue-tsc 与生产构建通过。
- Chromium/WebKit 各 390×844、1440×1000 检查普通、雷、火、水、黄金、梦幻、火+水的实际场景像素，共28组场景。属性像素改变可见且未染整个场景；成年/幼年均存在，无 JS 错误。
- Chromium/WebKit 各 320×740、390×844、430×932、844×390、1440×1000，共10组 UI 流程；图鉴、名宠堂、融合、仓库及窗口边界通过，报告无失败。均为模拟视口，未宣称物理手机测试。
- 静态比较页8组、360款真实alpha合成均绘制非空。审阅8张完整物种比较截图与实际手机火属性/电脑水属性场景截图，未发现此前邻格动物残影或白底块。

报告：ranch-generated-gallery.json、ranch-generated-appearance-{chromium,webkit}.json、ranch-generated-ui-{chromium,webkit}.json。截图在 ignored 的 artifacts/ranch-generated-gallery、ranch-generated-appearance、ranch-generated-ui。测试全部只使用 playroom_dev 随机 schema，3221端口加锁，测试完成销毁自己的schema；正式库未连接。

边界：专属双属性组合图片未制作，目前第一属性生成身体+第二属性已有动态氛围；不会叠加两只动物。四帧走路为二维图帧，尚无三维骨骼或任意视角。属性品质不另乘五套外观，品质信息仍由标签/边框表达。生产 CDN 的新资源尚未发布，正式域名上线需正常发布流程。

预览：云端回环3212，systemd临时单元 pair-play-generated-art-preview；电脑 localhost:3212 经 SSH 转发，展示图集比较。正式3210、原开发3211与另一个Agent的3D路由保持。源码、原图、提示词与说明均在新Worktree。
