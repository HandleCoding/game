# 牧场静态资源 CDN

2026-10-04，版本2.6.2。多吉云融合CDN仅用于公开牧场位图，主站/登录/游戏动作/SSE/存档仍访问game.aicoding.ltd及京东云原API。未改数据库、数值或动物实例。

## 控制台与DNS
- 加速域名static.aicoding.ltd；京东云主机记录static，CNAME指向static.aicoding.ltd.s2-web.dogedns.com，默认线路/600秒。
- 中国境内、网页小文件；源站域名game.aicoding.ltd、HTTPS回源、回源Host game.aicoding.ltd。game的A记录保持117.72.116.83，避免回源环路。
- 证书无忧自动选择/RSA，已签发并绑定。用户配置HTTPS页时建议强制HTTPS、HTTP2、TLS1.2/1.3、OCSP；QUIC额外收费保持关闭。控制台勾选不代表所有节点即时生效。
- 全部缓存按源站Cache-Control，参数全部保留；已有版本化WebP为一年immutable，HTML/API为no-store。不要改为强制缓存全部，也不要忽略Set-Cookie。
- HTTP响应头Access-Control-Allow-Origin固定https://game.aicoding.ltd；不要允许带凭据的任意Origin。开发浏览器不访问CDN，无需开放localhost。
- 自2026-10-04官网：实名20GB/月国内流量及200万HTTPS请求/月免费，超额按量收费。证书无忧公测限时免费，不承诺永久免费；流量封顶统计延迟约5分钟，不是硬零费用保障。查看控制台额度/费用，不自动购买套餐或开启付费QUIC。

## 实现
apps/web/src/games/animal-ranch/assets.ts集中生成URL。只有浏览器hostname=game.aicoding.ltd使用CDN；云端开发/测试回环地址保持同源。RanchScene的资源键仍是原路径，实际下载选择CDN；AnimalPortrait与RanchIcon使用同一资源入口，实际SVG裁切和Canvas源矩形保持。
SVG不直接引用外部CDN地址：先将下载图片解码成data URL再裁切，避免已下载但跨域SVG绘制空白；复用Scene已解码背景/图标/当前动物图集，其余图集最多两路队列按需获取。本页内共享公开图片缓存，与账号/存档无关。开发同源SVG保持原路径。
CDN网络/CORS/HTTP失败、图片解码失败或45秒连续无数据超时，自动尝试原站路径；成功路径记为本页会话使用原站，SVG商店图集下载错误也触发同一回退。回退仍失败才显示原重试界面；离开场景取消加载且不继续回退。原两路并发、实际分块进度、成功资源保留、首帧后显示HUD保持。无全局总时长限制。
API CSP只将https://static.aicoding.ltd加入img-src和connect-src，脚本/样式/API权限不扩展；不添加通配符或blob。静态fetch显式credentials=omit，不向CDN转发登录Cookie。
新增测试scripts/ranch-cdn-qa.mjs：生产hostname虚拟路由到开发库隔离schema，所有主站请求被拦截转到3221，绝不注册正式测试账号/读取正式令牌；成功用例下载真实公网CDN，失败用例注入网络/损坏/商店图集错误，Chromium额外45秒连续闲置回源用例。验证代表性动物和工具SVG栅格化结果确实有非透明像素，不能只检查href或HTTP200。SSE在该专项禁用，仅原平台与UI回归验证。WebKit虚拟HTTPS到HTTP中转的Secure测试Cookie显式中继，不改变产品认证。

## 后续与范围
首次实际6.3MB背景+工具+幼年/成年组图体积未缩小；CDN加速和文件减重是两个任务。仍按当前动物所需图集加载，商店再按需加载其它组；大厅三个旧封面小图继续同源。尚未做移动端背景、拆分图标/物种图集、付费转换或视频资源。不得声称真机秒开。
修改不可变素材必须新版本文件名；普通代码发版不会自动刷新旧同名CDN图片。变更CORS源站头后考虑节点旧缓存，而控制台响应头覆盖可直接验证。配置CDN封顶停用时返回404也会触发产品回源；不依赖已取消的DNS回源功能。

官方文档：
- https://docs.dogecloud.com/cdn/manual-config-cache-rules
- https://docs.dogecloud.com/cdn/manual-config-response-header
- https://docs.dogecloud.com/cdn/manual-config-auto-cert
- https://docs.dogecloud.com/cdn/manual-config-bandwidth-alert
- https://www.dogecloud.com/product/cdn
