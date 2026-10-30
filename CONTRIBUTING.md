# 参与协作

需要 Node.js 22+ 和 Git，无需安装运行依赖。先阅读 [AGENTS.md](AGENTS.md)，了解规则内核、隐藏信息和同步边界。

## 开发

在 PowerShell 中：

```powershell
git clone https://github.com/SyntheticSamo/sanguosha-tongxi.git
cd sanguosha-tongxi
git switch -c feat/your-change
node scripts/serve.mjs
```

打开 http://localhost:4173，修改后刷新即可。静态资源在 `dist/`，规则在 `dist/backend/`，联机在 `dist/sync/`，牌库和武将在 `dist/data/`。

提交前运行：

```powershell
node scripts/check.mjs
node --test
git add .
git commit -m "描述具体改动"
git push -u origin feat/your-change
```

然后向 `main` 提交 Pull Request，说明改动、验证结果及仍未覆盖的情况。改规则、同步或权限时补充相应场景；可选浏览器测试见 [docs/TESTING.md](docs/TESTING.md)，通过 `PLAYWRIGHT_MODULE` 指定 Playwright 模块，通过 `BROWSER_PATH` 指定 Chromium 可执行文件，通过 `TEST_URL` 指定测试网址。

没有写权限时，公开仓库可先 Fork，克隆自己的 Fork，向原仓库提 PR；私有仓库须由维护者在 Settings → Collaborators 邀请 GitHub 用户。仓库公开不代表访客能直接写入 `main`，合并仍由维护者负责。

## 检查和发布

推送到 `main`、向 `main` 提 PR 或手动运行 Actions 都会检查语法和内核测试。PR 不会发布正式网页；启用 Pages 后，`main` 的检查通过才会自动部署 `dist/`。部署方式见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，不需要 GPT、Sites、云端游戏后端或个人访问令牌。

不要提交真实存档、连接码、浏览器资料、ICE/TURN 凭据或其他私人数据。报告同步问题时只给经过脱敏的操作步骤与错误信息。卡牌及武将资料保留来源，不加入未授权插画或音效。
