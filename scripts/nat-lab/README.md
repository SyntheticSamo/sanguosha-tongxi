# NAT 实验（可选，Linux + root）

用于复现“手动交换太慢导致连接失败”和验证修复，不是运行依赖。需要 root、iproute2、nftables、conntrack 与 Playwright Chromium。可在 WSL2 或 Linux 虚拟机中运行。

```bash
sudo scripts/nat-lab/setup.sh            # 两个端口受限锥形NAT；加参数 symmetric 让好友侧变为对称型NAT
sudo DELAY=2  PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.mjs scripts/nat-lab/run.sh
sudo DELAY=45 PLAYWRIGHT_MODULE=… scripts/nat-lab/run.sh
```

`DELAY` 是房主收到好友回应后、粘贴前等待的秒数。结果与解释见 [v9说明](../../docs/V9_NETWORK_AND_TABLE.md)。headless Chromium 在命名空间中可能永不报告候选收集完成，这正好覆盖了收集超时的修复路径。
