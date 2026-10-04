# 牧场 HUD 遮挡修复 2.6.1

日期：2026-10-04。用户截图中的“离线也会成长 · 缺粮暂停”盖住动物选择栏；两者旧固定 bottom 分别为130/128px，手机106/112px，横屏88/90px，处于同一带。

## 最终修改

RanchGame.vue 将提示移入左上牧场资料牌，使用正常布局，保留离线成长/缺粮暂停和访客只读提示。移除所有提示的底部定位。横屏菜单起点104px，为增高资料牌留出间距。动物选择、动物坐标、成长/资源/图集/缓存规则不改。版本号与healthz为2.6.1，无schema变更或重置操作。

scripts/ranch-ui-qa.mjs 在初始场景、操作后与只读参观检查提示和动物选择栏/工具栏不相交，提示在资料牌内，资料牌不盖侧边菜单且不越过屏幕。

## 云端验证

/opt/pair-play-dev，开发库playroom_dev；每轮独立schema，固定3221端口加flock锁。npm run typecheck、npm run build均exit0。

最终Chromium与WebKit各5组通过、0失败：320×740、390×844、430×932、844×390、1440×1000。原始结果为20261004-ranch-hud-overlap-{chromium,webkit}.json。覆盖提示/菜单几何、动物选择/详情、喂食、收获/仓库、商店/图鉴、访客隐私、主题、触控平移/缩放、刷新存档、最小触点和页面无滚动。两引擎截图已实际查看，审阅拼图artifacts/ranch-hud-overlap-{review,webkit-review}.jpg。

首次移入资料牌后截图发现横屏菜单与牌底距离不足，补间距后重新验收。一次Chromium横屏触控验收失败是旧测试的双指手势y=140落在移后的菜单104–148区域，触发浏览器缩放而非Canvas缩放。夹具改在横屏草地y=195开始，并断言四个开始/终点位置确实命中Canvas；没有force点击或跳过触控验证。最终两引擎完整验收通过。

这是模拟浏览器尺寸和触控，不代表实体手机/微信内置浏览器验收。未重跑25项后端测试：本次只改界面与健康版本字符串，后端规则/事务/schema不变；2.6.0对应回归结果见数值报告。

## 调研

三个子Agent分别探索日常目标、经营和社交，综合草案保存于docs/animal-ranch.md“可玩性调研草案”。它是尚未实施的建议，不在本次界面修复中上线。中文参考和数值/事务边界随草案记录。

## 发布

普通PostgreSQL代码发布，命令python3 scripts/release-postgres.py --deploy，exit0。未使用--reset-ranch，没有清空或重置。schema仍为3。

- 源提交：4225376a58cfff8b1e8e709d51839915d6d0a476
- 正式路径：/opt/pair-play/releases/v2.6.1-20261004-195829
- 完成时间：2026-10-04T19:58:32+0800
- PG备份：/var/backups/pair-play/postgres-prod-20261004-195830.dump
- 原账号2、会话3、猜数字结果3、结果关联6、牧场档案1均保持；发布工具原有效会话身份验证通过，无令牌进入输出/报告。
- 发布前后4只动物、仓库与流水行数和钱包/动物/库存行摘要完全一致，确认玩家资源保持。
- Windows公网healthz：ok=true、version=2.6.1、database=postgresql。
- 公网RanchGame JS/CSS正文与web-dist逐字节一致，服务pair-play / pair-play-dev / caddy active。未追加读取正式令牌或登录牧场API验收。
- 发布元数据：20261004-ranch-hud-overlap-release.json。schema未改变；源码/GitHub与正式发布独立维护。
