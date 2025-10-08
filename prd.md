# GPT-Enhance 浏览器扩展 PRD（当前实现版）

## 概述
GPT-Enhance 是一个基于 Chrome MV3 的网页剪藏扩展，支持在用户浏览网页时将页面主要内容提取、生成 PDF 并保存到扩展内部的 IndexedDB，提供侧边栏管理与内置预览能力，同时具备设置页面与基础的上下文菜单与快捷键功能。

## 目标用户与核心场景
- 目标用户：需要快速保存网页内容为 PDF 的用户（学习、资料收集、研究）。
- 核心场景：
  - 在浏览网页时一键剪藏，自动提取正文并生成 PDF。
  - 在侧边栏查看剪藏列表、预览 PDF、下载或删除。
  - 在设置页调整基础偏好与查看存储信息。

## 功能清单（按模块）

### 1. 剪藏（contents/clipper.ts）
- 提取内容：
  - 使用 `@mozilla/readability` 对页面进行正文提取（标题、HTML 内容、纯文本）。
- PDF 生成：
  - 通过 `html2canvas` 将提取内容渲染为图片，使用 `jspdf` 生成 A4 PDF（多页拼接）。
  - 支持三种模式：`smart`（正文）、`fullpage`（整页截图）、`manual`（手动框选元素）。
- 交互引导：
  - 在 `manual` 模式下提供覆盖层、边框高亮、确认/取消按钮、键盘 ESC 退出等 UX。
- 数据存储：
  - 写入 `clips` 表（IndexedDB）：字段包含 `id/title/url/content/size/pdfId`，时间戳由数据库层统一生成。
  - 通过 `background.ts` 的 `downloadPDF` 消息可触发下载（当前实现仍保留文件路径字段但主要使用 `pdfId`）。
- 消息通信：
  - 监听 `clipPage` 消息并返回 `ClipResponse`（包含剪藏数据的基础信息）。

### 2. PDF 预览与下载（components/PDFPreview.tsx）
- 数据读取：
  - 通过 `clipOperations.getById` 获取 `pdfId`（仅保留 IndexedDB 读取路径）。
  - 通过 `pdfOperations.getPDFBinaryData(pdfId)` 读取二进制并转为 `data:application/pdf;base64`。
- 预览注入：
  - 使用 `chrome.scripting.executeScript` 注入 PDF.js 与样式，在当前活动页内生成一个覆盖层窗口进行预览。
  - 顶部展示标题、来源链接、大小、时间等元信息，支持关闭。
- 下载与打印：
  - 下载：读取 PDF 二进制转 Blob，使用 a 标签触发浏览器下载。
  - 打印：在新窗口打开 `pdfData`，调用 `print()`。

### 3. 侧边栏管理（sidepanel.tsx）
- 列表展示：
  - 读取 `clips` 表，按日期或标题排序，支持搜索（前端过滤）。
- 操作：
  - 预览：打开 `PDFPreview`。
  - 下载：通过 `storageManager`/`pdfOperations` 读取并下载。
  - 删除：从 `clips` 表删除记录，联动 `pdfs` 表删除文件（通过 `pdfOperations.delete`）。
  - 重命名：更新剪藏标题。
- 拖拽导入：
  - `DragDropPDF.tsx` 支持拖拽 PDF 导入（存储到 IndexedDB 的 `pdfs`），并写入对应的剪藏记录。

### 4. 设置页（options.tsx）
- 展示与编辑：
  - 展示基础设置：自动剪藏、快捷键、最大剪藏数量、导出相关、外观、语言、通知、右键菜单。
  - 当前 UI 使用本地 `Settings` 类型；持久化通过 `settingsOperations.saveUserSettings` 与 `chrome.storage.local` 兼容桥接。
- 存储信息：
  - 展示使用空间与上限概览（进度条），读取自 `getDatabaseStatus()` 与 `clipOperations.getAll()`。

### 5. 背景脚本（background.ts）
- 消息处理：
  - `clipPage`：协调内容脚本执行。
  - `openManager`：打开侧边栏。
  - `updateContextMenu`：重建右键菜单。
  - `downloadPDF`：接收二进制数组与文件名，触发下载并返回结果。
- 侧边栏控制：
  - `openSidePanel(windowId)` 在当前窗口打开侧面板。

### 6. 数据库与存储（lib/database, lib/pdfStorage, lib/storage）
- IndexedDB 层（`lib/database/index.ts`）：
  - 表：`settings`、`clips`、`pdfs`（后者由 `pdfStorage` 管理）。
  - 操作：`create/update/getAll/getById/delete/clear/searchClips`。
  - `UserSettings` 默认值与合并保存逻辑；`settingsOperations.ensureDefault/getCurrent/saveUserSettings`。
- PDF 存储（`lib/pdfStorage.ts`）：
  - `storePDF/getPDF/deletePDF/getAllPDFMetadata`，以 `id/fileName/title/url/content/size/tags` 管理 PDF 二进制与元信息。
- 存储管理（`lib/storage.ts`）：
  - 封装与 `chrome.storage.local` 的交互、PDF 存取辅助、设置键名映射（已调整为 `clip/manager/defaultPath`）。

### 7. 类型与工具（lib/types.ts, lib/utils.ts）
- `ClipItem`：统一剪藏记录类型（包含 `id/title/url/content/size/timestamp/pdfId/tags` 等）。
- `utils`：通用辅助函数（如格式化、校验等，视具体实现而定）。

## 关键用户流程
1) 用户在网页点击扩展弹窗「开始剪藏」→ 背景脚本发消息给内容脚本 → 内容脚本提取、生成 PDF → 存储至 IndexedDB `pdfs` 并写入 `clips` 表 `pdfId` → 返回成功提示。
2) 用户打开侧边栏 → 读取 `clips` → 点击记录预览 → 在当前页注入 PDF.js 进行预览；支持下载、打印、删除与重命名。
3) 用户打开设置页 → 查看并修改偏好 → 保存到 `settings` 表（并写入 `chrome.storage.local` 作为兼容）。

## 非功能需求
- 兼容：Chrome MV3（Plasmo 打包）。
- 性能：PDF 生成与渲染尽量在用户可接受时间内完成；IndexedDB 操作异步、非阻塞 UI。
- 可维护性：统一类型定义、清晰的数据库操作层、模块划分明确。

---

# 优化报告（当前代码的改进建议）

## 架构与数据层
- 用库替换手写 IndexedDB：引入 `Dexie` 或 `idb` 简化事务与索引操作，减少样板代码与错误率。
- 统一 `UserSettings` 与 Options 页的类型：
  - 将 `options.tsx` 的 `Settings` 对齐 `UserSettings`（快捷键键名使用 `clip/manager`，导出使用 `export.defaultPath`）。
  - 提供单一来源的类型与默认值（`lib/database/index.ts` 的 `DEFAULT_USER_SETTINGS`）。
- 移除历史字段：彻底移除对 `filePath` 的依赖，确保全链路仅用 `pdfId`（已基本完成，建议后续删除类型中的可选字段与相关分支）。

## PDF 生成与预览
- 生成：
  - 目前通过 `html2canvas + jspdf` 将 HTML 转图片再入 PDF，复杂页面下表现与清晰度有限。可评估：
    - `puppeteer`（仅后台/服务侧可用）或 `print to PDF` API（浏览器支持有限）。
    - 对前端方案，建议抽象生成器接口，便于未来替换实现。
- 预览：
  - 现在使用 `chrome.scripting.executeScript` 动态注入 PDF.js 与样式，复杂度高、与 React 状态割裂。建议改为：
    - 在侧边栏或独立 React 组件内直接使用 `react-pdf`（基于 pdf.js），避免跨上下文注入与手写 DOM 操作。
    - 统一使用组件化的 UI，便于维护与复用（下载、打印、关闭等按钮）。

## 代码结构与复用
- 将「下载」逻辑抽象为 `useDownloadPDF(pdfId, meta)` Hook 或 `downloadPDF(pdfId)` 工具函数，在 `sidepanel` 与 `PDFPreview` 复用，减少重复。
- 将「读取剪藏 + 读取 PDF 二进制 + 转 dataURL」封装为单一函数，如 `getPDFDataURL(clipId)`。
- 将注入样式字符串迁移到静态 CSS（`styles/pdf-preview.scss` 已存在），并在组件使用，避免内联大段字符串。
- 提取通用图标组件或改用现成图标库，避免重复的 SVG 片段（侧边栏与弹窗中多个小图标）。

## 异常与稳定性
- 数据读取与渲染：对 `pdfId` 缺失、`ArrayBuffer` 为空、PDF.js 渲染失败的分支，统一错误提示与上报（可加日志聚合）。
- 并发安全：对同一条记录的并发更新，`clipOperations.update` 目前简单覆盖，建议加入版本号或乐观锁策略（可选）。
- 资源释放：预览组件中使用 `URL.createObjectURL` 后应确保 `revokeObjectURL`，并在组件卸载时清理事件与节点（已部分处理，建议统一封装）。

## UI/UX
- 侧边栏：
  - 搜索与排序可迁移到数据库层（按索引检索），减少前端过滤成本。
  - 列表虚拟化（如 `react-window`）在记录较多时提升性能。
- 设置页：
  - 使用 `react-hook-form` 管理表单与校验，简化状态逻辑与避免重复代码。
  - 快捷键设置可提供校验与录制能力（监听键盘组合）。

## 工程实践
- 类型与边界：
  - 移除所有未使用的类型与兼容分支（`clipData` 残留等）。
  - 统一导出入口（`lib/index.ts`）便于模块化引用。
- 测试：
  - 添加针对 `lib/database` 与 `pdfStorage` 的单元测试（可用 `vitest`）。
  - 引入 `eslint` 和 `prettier` 统一风格；配置 CI（已有 `submit.yml`，可加 lint/test）。

## 里程碑建议
1. 完全去除旧 `file://` 逻辑与字段（类型清理 + 代码搜索替换）。
2. 组件化 PDF 预览（替换脚本注入）并统一下载逻辑。
3. 引入 `Dexie/idb` 简化数据层；统一 `UserSettings` 与 `options.tsx`。
4. 增加基础测试与表单管理库，提升稳定性。

---

以上为当前代码库的功能说明与可落地的优化方向，保持模块边界清晰、数据流统一（以 `pdfId` 为主），逐步替换临时实现为组件化与库化以提升可维护性与开发效率。