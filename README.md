# GPT-Enhance - 网页剪藏工具

一个现代化的Chrome扩展，用于快速捕获和保存网页正文内容为PDF文件。

## 功能特性

### 🔥 核心功能
- **智能剪藏**: 使用Readability.js提取网页正文内容
- **PDF生成**: 将网页内容转换为高质量PDF文件
- **本地存储**: 使用Chrome本地存储，支持无限容量
- **快速访问**: 弹窗界面快速剪藏当前页面

### 📋 管理功能
- **侧边栏管理**: 完整的PDF列表和预览界面
- **搜索排序**: 支持标题、URL、内容搜索和多种排序方式
- **重命名删除**: 便捷的文件管理操作
- **拖拽排序**: 直观的列表排序体验

### ⚙️ 辅助功能
- **个性化设置**: 主题、语言、快捷键等配置
- **通知提醒**: 剪藏成功/失败状态通知
- **数据导出**: 支持批量导出和备份
- **快捷键**: 全局快捷键快速操作
- **右键菜单**: 上下文菜单集成

## 技术架构

- **框架**: Plasmo - 现代化Chrome扩展开发框架
- **UI**: React + TypeScript + Tailwind CSS
- **内容提取**: @mozilla/readability
- **PDF生成**: jsPDF + html2canvas
- **PDF预览**: pdf.js
- **存储**: Chrome Storage API (本地存储)
- **图标**: Lucide React

## 安装使用

### 开发环境

1. **安装依赖**
   ```bash
   npm install
   ```

2. **开发模式**
   ```bash
   npm run dev
   ```

3. **构建扩展**
   ```bash
   npm run build
   ```

### Chrome扩展安装

1. 打开Chrome浏览器，进入 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目的 `build/chrome-mv3-dev` 目录
5. 扩展安装完成，可在工具栏看到GPT-Enhance图标

## 使用指南

### 快速剪藏
1. **弹窗剪藏**: 点击扩展图标，在弹窗中点击「剪藏当前页面」
2. **快捷键**: 使用 `⌘+Shift+C` (Mac) 或 `Ctrl+Shift+C` (Windows)
3. **右键菜单**: 在网页上右键选择「剪藏到 GPT-Enhance」

### 管理剪藏
1. **打开管理**: 点击弹窗中的「内容管理」或使用快捷键 `⌘+Shift+M`
2. **搜索内容**: 在侧边栏顶部搜索框输入关键词
3. **排序列表**: 选择按时间、标题或大小排序
4. **预览PDF**: 点击列表项在右侧预览PDF内容
5. **重命名**: 双击标题或点击编辑图标
6. **下载**: 点击下载图标保存PDF到本地
7. **删除**: 点击删除图标移除剪藏

### 个性化设置
1. 点击弹窗中的「设置」进入设置页面
2. 配置通知、右键菜单、最大剪藏数等选项
3. 选择主题模式（浅色/深色/自动）
4. 查看和管理存储空间使用情况
5. 导出或清空所有数据

## 快捷键

- `⌘+Shift+C` / `Ctrl+Shift+C`: 剪藏当前页面
- `⌘+Shift+M` / `Ctrl+Shift+M`: 打开剪藏管理

## 权限说明

- **activeTab**: 获取当前标签页信息用于剪藏
- **storage**: 本地存储剪藏数据
- **unlimitedStorage**: 支持大容量PDF存储
- **sidePanel**: 侧边栏管理界面
- **contextMenus**: 右键菜单集成
- **notifications**: 操作状态通知
- **http://*/***, **https://*/***: 访问网页内容进行剪藏

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
