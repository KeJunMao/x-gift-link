# 开发指南

[返回 README](../README.md)

## 环境与命令

使用 Node.js 22 或更高版本。本项目没有 npm 依赖和构建步骤，无需运行 `npm install`。

进入扩展根目录（包含 `package.json` 的目录）：

```sh
npm run check
npm test
npm run package
```

- `check`：检查 JavaScript 语法、Manifest、版本一致性和发布文件。
- `test`：使用 Node.js 内置测试运行器，覆盖报价校验、订单流程、网络解析和网络变化检查。全部使用模拟数据，不请求真实 X 接口。
- `package`：先执行检查和测试，再通过文件白名单生成 ZIP，输出到 `dist/`。ZIP 根目录包含 `manifest.json`，不打包文档、测试或浏览器数据。

调试 UI 时，直接在 Chrome / Edge 中加载此目录。修改源码后在扩展管理页重新加载，然后重新打开弹窗。后台日志可在扩展详情中的 Service Worker 检查窗口查看。

## 源码导航

| 文件 | 职责 |
| --- | --- |
| `manifest.json` | Manifest V3、权限及扩展入口 |
| `app.html`、`app.css`、`app.js` | 工具栏弹窗及交互 |
| `background.js` | 消息入口、代理认证与恢复事件 |
| `controller.js` | 账号 → 报价 → 创建链接的状态流程 |
| `core.js` | 产品标识、账号 / 金额 / 付款会话校验 |
| `x-request.js` | 注入 X 页面的请求及出口信息解析 |
| `proxy.js` | 代理配置、临时测试、认证与恢复 |
| `tests/` | 模拟浏览器 API 的自动化测试 |
| `scripts/` | 发布检查和打包工具 |

`core.js` 中的 Bearer 是 X 网页客户端使用的公开标识，不是个人登录凭据；产品 ID 和 GraphQL 操作 ID 也属于客户端协议标识。个人 Cookie 和代理凭据应始终留在浏览器中。

X 网页接口可能变更。更新操作 ID、产品 ID 或响应解析时，应同时更新对应模拟用例，保持账号、价格和付款会话校验。

注入函数必须自包含，不能依赖模块闭包。业务流程和代理控制通过后台执行，弹窗负责展示与发送操作消息。

## 发布

1. 在 `manifest.json` 和 `package.json` 中同步更新版本，并维护 `CHANGELOG.md`。
2. 执行 `npm run package`，检查 ZIP 内容。
3. 在单独的测试浏览器配置中加载解压后的安装包，检查弹窗、登录提示、代理测试与原设置恢复。
4. 仅在明确需要时，用自己的账号验证真实赠礼流程，完成后核对订单。
5. 将 ZIP 上传到仓库 Release，说明版本变化；应用商店发布需另行准备并提交审核。

`.github/workflows/ci.yml` 可用于以本目录为根的独立仓库，自动运行检查、测试并保存安装包产物。如果放进更大的仓库，需要将工作流移到仓库根目录的 `.github/workflows/`，并调整工作目录。
