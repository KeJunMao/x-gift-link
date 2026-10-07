<div align="center">
  <img src="icons/128.png" width="72" height="72" alt="X Gift Link 图标">
  <h1>X Gift Link</h1>
  <p><strong>把 X Premium 礼品，变成一条付款链接。</strong></p>
  <p>输入账号，查看实时报价，选择时长。剩下的，交给浏览器。</p>
  <p>Chrome / Edge · Manifest V3 · 无需后端 · MIT 开源</p>
  <p><a href="#快速开始">快速开始</a> · <a href="docs/usage.md">使用指南</a> · <a href="docs/privacy.md">隐私与权限</a> · <a href="CONTRIBUTING.md">参与贡献</a></p>
</div>

![输入账号 → 选择时长 → 生成链接](docs/images/overview.svg)

X Gift Link 是一个轻量的浏览器扩展，让你直接在工具栏中为指定 X 账号创建 Premium 礼品付款链接。使用浏览器已有的 X 登录状态，实时读取可用套餐、币种和价格，生成链接后即可复制或打开付款页。

## 为什么用 X Gift Link

- **三步完成**：检查账号 → 选择时长 → 生成链接，操作集中在一个弹窗里。
- **实时报价**：支持 3 / 6 个月礼品套餐，展示 X 当前返回的币种与价格。
- **网络可控**：查看 X 出口国家，支持 HTTP、HTTPS 和 SOCKS5 代理及连接测试。
- **随时继续**：关闭弹窗后任务继续运行，再次打开即可恢复进度。
- **减少重复创建**：复用已有链接；报价变化时重新确认，结果不明时保留记录供核对。
- **轻量开源**：原生 JavaScript，无运行时依赖，无需部署服务器。

## 快速开始

### 安装

1. 下载项目源码并解压，找到包含 `manifest.json` 的目录。
2. 打开 `chrome://extensions` 或 `edge://extensions`，启用「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择该目录，再将 **X Gift Link** 固定到工具栏。

也可以使用维护者提供的 ZIP 安装包：解压后，选择包含 `manifest.json` 的目录加载。扩展要求 Chromium 120 或更高版本。

### 生成第一条链接

1. 在同一个浏览器的普通窗口中打开 [x.com](https://x.com/) 并登录。
2. 点击扩展图标，输入收礼人的 `@用户名`，点击「检查」。
3. 选择可用的礼品时长，确认报价后点击「创建链接」。
4. 复制链接，或点击「打开」前往付款页。

付款由你在付款页完成，请以付款页的最终金额为准。账号是否符合赠礼条件、套餐是否可用，以 X 返回的结果为准。

### 获取低价区代理

```prompt
帮我找一个免费的孟加拉国出口代理，HTTP 或 SOCKS5 都行，临时使用，目标网站是 https://x.com。请获取近期公开候选，实测目标网站，不能只看端口是否开放或代理列表的“在线”标记。找到后，用实际 GET 请求复测，确认页面正常返回，并核对出口 IP 属于孟加拉国。给我协议、IP、端口、是否需要账号密码、测试时间和响应耗时。优先给复测成功的地址；没有找到就明确说明，不要把未经验证的候选当成可用节点
```

## 了解更多

| 想做什么 | 去哪里 |
| --- | --- |
| 配置代理、更新扩展、处理常见问题 | [使用指南](docs/usage.md) |
| 了解本地数据和浏览器权限 | [隐私与权限](docs/privacy.md) |
| 运行测试、打包、了解源码 | [开发指南](docs/development.md) |
| 提交问题或改进代码 | [贡献指南](CONTRIBUTING.md) |
| 查看版本变化 | [更新记录](CHANGELOG.md) |

## 本地开发

需要 Node.js 22+，进入包含 `package.json` 的扩展目录后运行：

```sh
npm run check
npm test
npm run package
```

无需安装依赖。安装包输出至 `dist/x-gift-link-<版本>.zip`，仅包含运行文件和许可证。

## 致谢与许可

赠礼流程参考 [mizorewww/x_gift_bot](https://github.com/mizorewww/x_gift_bot)。本项目使用 [MIT License](LICENSE)，保留原作者与贡献者的版权声明。

X Gift Link 是独立的社区项目，与 X、Twitter 或 Stripe 无官方关联。
