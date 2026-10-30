# 独立托管与发布

## GitHub Pages

- 仓库：https://github.com/SyntheticSamo/sanguosha-tongxi
- 正式网址：https://syntheticsamo.github.io/sanguosha-tongxi/
- 发布内容：完整 `dist/`，无需构建、安装依赖或 GPT/Sites 服务。
- 发布配置：[`.github/workflows/site.yml`](../.github/workflows/site.yml)。

2026-10-30 经用户确认，仓库已设为公开，Pages 已启用。`PAGES_ENABLED=true`，`github-pages` 环境仅允许 `main` 分支部署；[首次部署](https://github.com/SyntheticSamo/sanguosha-tongxi/actions/runs/41127996663)的检查与发布均成功，正式网址匿名请求返回 HTTP 200，HTTPS 已强制启用。后续合并到 `main` 会在检查通过后自动更新网站。公开仓库支持 Fork 和 PR，直接写入仍需维护者授权，见 [协作指南](../CONTRIBUTING.md)。

准备阶段曾因私有仓库套餐限制无法启用 Pages；公开后已解决。官方套餐范围见 [GitHub Pages 文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。不能只凭源码推送判断线上部署成功，应核对对应 Actions 运行结果。

重新配置或迁移到其他仓库时：

1. 确保账号套餐和仓库可见性支持 Pages。
2. 仓库 Settings → Pages → Build and deployment，将 Source 设为 **GitHub Actions**。
3. Settings → Secrets and variables → Actions → Variables，创建仓库变量 `PAGES_ENABLED`，值为 `true`。这是发布开关，不是密钥。
4. Actions → **Check and deploy** → Run workflow，选择 `main`。首次手动运行后，之后推送或合并到 `main` 会自动发布。
5. 等待 Check source and rules 与 Deploy GitHub Pages 成功，打开部署结果中的网址。建议在 Settings → Environments → github-pages 限制仅 `main` 可部署。

PR 只运行检查，不部署。部署作业只使用 GitHub 自动提供、作用于当前仓库的 `GITHUB_TOKEN`，不需要添加个人 Token 或 Sites 凭据；部署包只包含 `dist/`。关闭自动发布时将 `PAGES_ENABLED` 改为 `false`，已发布的网站仍会保留。

`syntheticsamo.github.io/sanguosha-tongxi/` 是现有仓库对应的项目网址，不占用账号主页。若需要根网址 `syntheticsamo.github.io/`，须另外配置同名用户站点仓库；不要覆盖已有主页。本项目中的 HTML、模块、CSS 和 Worker 均使用相对路径，可部署到项目子路径。

## 游戏与存档

`dist/backend/` 在房主浏览器 Worker 内运行，不是需要云服务器启动的服务。房主通过 WebRTC 与朋友同步；静态托管只分发网页文件。STUN 可选，TURN 由使用者配置，公网直连仍受 NAT 和防火墙影响。

浏览器 IndexedDB 和 sessionStorage 不跨域共享。房主可先在旧站导出完整恢复存档，再到新站导入；但朋友在新站不会自动拥有旧来源的席位凭据，当前也没有跨域迁移好友凭据的界面。进行中的旧局建议在原站完成，再从新网址建桌；不能承诺导入后好友会自动认领原席位。所有玩家须使用同一协议版本。完整恢复存档含隐藏牌、身份和凭据，由房主私下保管。

## 其他静态托管与原站

任意 HTTPS 静态托管上传 `dist/` 即可。不能通过 `file://` 打开模块与 Worker；本地调试运行 `node scripts/serve.mjs`。

旧 Sites 地址：https://sanguosha-tongxi-andy.glass-peacock.chatgpt.site 。独立托管不修改、删除或更新旧站，旧网址不自动跳转。`.openai/hosting.json` 仅保留历史 Sites 项目标识，不参与 GitHub Pages 的运行或发布。

自有域名可后续在 GitHub Pages 设置中绑定，并按 GitHub 返回的记录配置 DNS；仅换域名无需增加游戏后端。
