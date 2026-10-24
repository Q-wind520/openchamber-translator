# OpenChamber Translation

一个只做**全文翻译**的 OpenChamber 侧栏扩展。

- 按段落翻译长文，支持「对照 / 译文 / 原文」切换。
- 使用 OpenChamber 已配置的 **Small Model**，无需在扩展里再填写 API Key。
- 如果你已经在 OpenCode 中配置了 DeepSeek，只需把 Small Model 指向它即可。
- 翻译过程显示进度，可取消；结果可一键复制。
- 自动跟随 OpenChamber 的明暗主题和字体。

## 环境要求

- OpenChamber `>= 2.5.1`（Web 或桌面版）
- Node.js `>= 22.12`（仅构建需要）

## 构建与安装

```bash
npm install
npm run check
```

构建产物是 `panel/main.js`。OpenChamber 不编译扩展源码，安装前请先构建。

在 OpenChamber 中：

1. 打开 **设置 → 扩展**。
2. 在「文件夹、ZIP 或 URL」中填入当前仓库的绝对路径，例如：
   `/path/to/openchamber-translation`
3. 点击添加，并批准「使用你的 Small Model」权限。
4. 点击右侧栏的「全文翻译」图标打开面板。

开发时可直接使用文件夹安装：修改 `src/` 后运行 `npm run dev`（或 `npm run build`），再重新加载面板。

## 使用 DeepSeek / 切换模型

本扩展不单独保存模型 Key，也不直接请求 DeepSeek。它通过 OpenChamber SDK 的 `host.generate` 使用你的 Small Model：

1. 确保 DeepSeek 已配置在 OpenCode / OpenChamber 的 Provider 中。
2. 打开 **设置 → 会话 → Small Model**。
3. 选择 DeepSeek，例如 `deepseek/deepseek-flash`。
4. 回到「全文翻译」面板，直接翻译即可。

> OpenChamber 扩展接口只开放 Small Model 生成能力，扩展无法自行选择或读取具体 Provider/模型。因此实际使用的模型以你的 Small Model 设置为准。
>
> 如果当前 Small Model 不可用，面板会提示没有可用模型；修改设置后重试即可。

## 翻译方式

1. 粘贴文章或 Markdown 到输入框，也可以点击「剪贴板」读取。
2. 选择目标语言，点击「全文翻译」或按 `Ctrl/Cmd + Enter`。
3. 翻译中可查看已完成的段落数量并取消。
4. 结果支持：
   - **对照**：原文与译文逐段并列；
   - **译文**：只显示译文；
   - **原文**：只显示原文。
5. 右上角复制按钮仅复制译文。

单次最多翻译 50,000 个字符。长文会按空行拆段，超长段落再按句子边界拆分；每段单独发给模型，因此长文会消耗更多次模型调用。

## 权限与隐私

扩展只申请一个能力：

```json
"capabilities": ["model"]
```

- 不访问网络，不运行本地服务，不读取项目文件。
- 不申请任何翻译服务集成，不需要单独配置 API Key。
- 原文会通过 OpenChamber 的 Small Model 发送给你在 OpenCode 中配置的模型提供商；会消耗对应模型的额度。
- 原文、译文和偏好不会写入 OpenChamber 会话；只持久化目标语言和显示方式。
- 复制大结果时受 OpenChamber 剪贴板 32,000 字符上限限制，请分段复制。

## 开发

```bash
npm run dev        # esbuild watch -> panel/main.js
npm run typecheck  # tsc --noEmit
npm test           # Vitest 单元测试
npm run check      # typecheck + test + production build
```

目录：

```text
src/
  main.ts                     OpenChamber host 启动与主题接入
  panel/
    app.ts                    全文翻译面板状态与交互
    preferences.ts            目标语言 / 显示方式持久化
    template.ts               静态面板结构
  translation/
    plan.ts                   段落拆分、长句切分、分批、进度与取消
    errors.ts                 错误类型
    languages.ts              目标语言
    providers/
      opencode.ts             host.generate 翻译调用
panel/
  index.html                  扩展入口页
  style.css                   面板样式（使用宿主主题变量）
  main.js                     构建产物
icon.svg                      侧栏图标
build.mjs                     打包脚本（IIFE）
```

## 限制

- 使用 Small Model 意味着速度和质量取决于你在 OpenChamber 中配置的模型。
- 每次模型请求的段落上限为 2,000 字符，单次全文上限为 50,000 字符。
- 取消会阻止后续段落继续请求，但当前已在生成中的一次模型调用可能仍会完成。
- 不提供划词翻译、截图翻译或整页 DOM 注入；本扩展是 OpenChamber 沙箱侧栏内的全文翻译面板。
