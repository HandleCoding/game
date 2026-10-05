# 2026-10-05 三维牧场体验小样验收

源码 `/opt/pair-play-dev/prototypes/ranch-3d`，入口 https://game.aicoding.ltd/ranch-3d/ 。版本 0.1.0，分支 `codex/ranch-3d-prototype`。这是视觉/交互原型，正式应用目录仍为 `/opt/pair-play/releases/v2.7.0-20261005-003621`。

## 构建与访问

- 京东云独立 npm install、npm run check、npm run build 均成功。Three.js 0.186.1，Vite 7.3.6，依赖锁文件固定；未修改根项目依赖。
- 构建 JS 590.53 kB，gzip 151.23 kB；CSS gzip 2.46 kB。Vite 提示单块超过 500 kB，是体积提示，非构建失败。没有背景图片或外部图片/字体请求。
- `/ranch-3d/`、`/healthz`、原大厅 `/` 返回 200；`/ranch-3d` 返回 308。首页与引用的 JS/CSS 正文和云端 dist 逐字节相同。
- Caddy 新增独立 handle_path，只提供本项目 dist，其余路径继续反代3210。修改前备份 `/var/backups/pair-play/caddy-ranch-3d-20261005-103637.conf`，validate 成功后 reload；未重启应用、数据库或无关服务，无迁移/重置。

## 浏览器实际检查

Codex Browser 访问公开 HTTPS 入口，在电脑浏览器切换 viewport；以下是尺寸模拟，不能称为真实手机硬件测试。

| 尺寸 | 验证 |
| --- | --- |
| 1440×900 | 三个动物、房屋、食槽、树、围栏、池塘实际绘制；ready=true、持续帧计数；无横向溢出；近景与全景切换 |
| 390×844 | 首屏绘制和持续帧计数；喂食→走向食槽→正在吃食；选择兔子、幼年比例、夜晚、暂停/继续；触摸尺寸 |
| 360×780 | DOM 几何无横向溢出；伙伴卡底668、操作栏顶701，未互相覆盖 |
| 844×390 | 首屏绘制；左下伙伴卡与右下操作栏分开；实际拖动镜头，截图确认围栏/房屋/动物角度变化 |

390px 操作栏按钮实测83×51 CSS px，幼年按钮44×44，近景按钮63×44。加载层退出后 DOM snapshot 仍可列出100%文本；实际截图确认场景可见、可操作。

实际检查全景/近景、阴影/遮挡、昼夜切换、动物腿部走动、呼吸和喂食动作。修正首屏过远、草地矩形边缘、过曝、手机标题遮挡和旧PCFSoftShadowMap枚举警告，采用当前PCFShadowMap。最终构建没有新的浏览器error/warn；历史日志保留第一次构建的旧枚举警告，对应旧资源hash DtTVycUD，最终为DgyHj_iT。

截图实际查看并保存至本项目 `artifacts/`：mobile-390.png、mobile-night.png、mobile-landscape.png、desktop-1440.png、desktop-final.png。截图不提交Git，云端和本机都有验收副本。

## 原型能力与限制

场景和动物都是共享灯光/深度缓冲的三维网格。程序模型是简化造型，幼年为缩小身体和调整头身比例；不代表最终柔和写实毛发、完整幼年解剖或72套精细模型。移动避让是简单局部避让，尚无正式导航网格/完整寻路。

未接账号、实际产出、变异或永久动物ID；喂食是演示动画，不花金币；没有通过正式登录读取真实存档。其他Agent的变异工作保持原状。

手机降低像素比和阴影尺寸，循环限帧；未在真实Android/iOS、微信浏览器验证性能、热量或双指触控。最终Three.js/Cocos选择及正式模型管线尚未锁定。
