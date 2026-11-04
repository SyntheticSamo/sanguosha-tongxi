# 可选 · Cloudflare 自动配对服务

不部署也能玩：手动交换邀请／回应保持不变。部署后，房主获得**一条房间链接**，所有好友打开、确认昵称即可入席，不再逐个发回回应；断线后通过同一服务自动做 ICE 重启。

## 它做什么、不做什么

- 只转发 WebRTC 连接描述（SDP）与候选地址。牌局状态、手牌、聊天、席位凭据都走浏览器之间的数据通道，不经过 Worker。
- 每个房间一个 Durable Object，使用 WebSocket Hibernation：桌子闲置时对象休眠，不计时长费用。不写存储，不记日志。
- 房间号 = SHA-256(房主密钥) 的前22位。房间链接只能以好友身份加入；没有房主密钥无法冒充房主。
- 连接描述含双方公网／局域网地址，与手动连接码相同；只发给同房间的人。
- **拿到房间链接的人都可以入席**（与转发手动邀请相同）。只发给要一起玩的朋友。

## 免费额度（2026-11 查证，以官方页面为准）

| 项目 | Workers Free | 本项目用量（估算） |
| --- | --- | --- |
| Worker 请求 | 100,000 / 天 | 每次打开 WebSocket 计 1 次 |
| Durable Objects 请求 | 100,000 / 天；仅 SQLite 后端类 | 建立连接 1 次；收到的消息按 20:1 计费，发出的消息与协议心跳免费 |
| Durable Objects 时长 | 13,000 GB-s / 天 | 休眠期间不计 |
| Realtime TURN（可选） | 每月前 1,000 GB 免费，之后 $0.05/GB | 文字牌局每人每小时通常不到 1 MB |
| STUN `stun.cloudflare.com` | 免费、不限量 | 默认已使用 |

一位好友入席大约产生 1 次连接和十几条信令消息（按 20:1 折算约 2 次请求）；客户端每 25 秒发一次应用层心跳，由 Durable Object 的自动应答处理，不唤醒对象。8 人桌连续玩一整晚，也远低于每日额度。Workers Free 超出额度时相应请求会报错，不会自动扣费；TURN 按流量计费。

来源：[Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[Realtime TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/)、[生成 TURN 凭据](https://developers.cloudflare.com/realtime/turn/generate-credentials/)。

## 部署

需要 Cloudflare 账号与 Node.js 22+。

```powershell
cd cloudflare
npx wrangler login
# 编辑 wrangler.toml 中的 ALLOWED_ORIGINS，填你托管网页的来源（不含路径）
npx wrangler deploy
```

部署输出形如 `https://tongxi-signal.<子域>.workers.dev`。打开 `…/v1/health` 应返回 `{"ok":true,…}`。

然后二选一：

1. **全站默认**：把地址写进 `dist/sync/relay-config.js` 的 `SIGNAL_URL`，提交后由 GitHub Pages 发布。所有人自动启用。
2. **仅本机**：在「联机 → 网络设置 → 自动配对服务」填写地址。房主生成的房间链接会带上这个地址，好友无需设置；好友页面会显示链接指定的服务主机名。

## 可选：TURN 中继

双方都在对称型 NAT（常见于手机流量、部分校园网／公司网）时，直连无法打通，需要 TURN 中继。

1. 按 [生成 TURN 凭据](https://developers.cloudflare.com/realtime/turn/generate-credentials/) 在 Cloudflare 控制台的 Realtime TURN 页面创建 TURN key，记下 Key ID 与 API Token。
2. 设为 Worker 机密（不要写进文件或仓库）：

```powershell
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
```

Worker 只在已连接房间的成员加入时生成 12 小时有效的凭据，内存缓存 1 小时，并去掉浏览器会超时的 53 端口地址。凭据只保留在页面内存，不写入存档或日志。凭据过期后经中继的连接会断开；超过12小时的长局若依赖中继，请让好友刷新页面后重新加入（回到原席位）。

注意：任何能打开你网页来源的人都能创建房间并拿到短期凭据。请保持 `ALLOWED_ORIGINS` 为自己的网页来源，并在 Cloudflare 控制台关注 TURN 用量。

## 本地调试

```powershell
cd cloudflare
npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:
```

在本地牌桌的网络设置中填 `http://localhost:8787`（仅本机及局域网地址允许 http）。

## 限制与边界

- 每个房间最多 12 位好友同时在线配对；每个连接 10 秒内最多 240 条消息；单条消息 64 KB。
- 房主刷新并恢复牌桌后沿用同一房间链接，仍在线的好友会自动重连；好友刷新后在本页点「加入牌桌」即可回到原席位（同一标签页的席位凭据）。
- 服务不可用时会退避重试，手动邀请始终可用。
- 未承诺所有 NAT 下都能直连；没有 TURN 时，对称型 NAT 与严格防火墙仍可能失败。
