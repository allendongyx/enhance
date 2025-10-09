// 后台脚本 - 处理快捷键、右键菜单、通知等功能

import { pdfStorage } from './lib/pdfStorage'
import { initializeDatabase, settingsOperations, saveUserSettingsToLocal, clipOperations, TableNames } from './lib/database'

// 统一获取通知图标的扩展URL，避免相对路径导致找不到资源
const ICON_URL = (() => {
  try {
    const m = chrome.runtime.getManifest()
    const candidate = (m.icons && (m.icons['128'] || m.icons['96'] || m.icons['64'] || m.icons['48'] || m.icons['32'])) || 'assets/icon.png'
    return chrome.runtime.getURL(candidate)
  } catch {
    return chrome.runtime.getURL('assets/icon.png')
  }
})()

// 扩展安装时的初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('KaKa Clipper 已安装/更新')
  
  // 初始化统一数据库
  await initializeDatabase()
  
  // 创建右键菜单
  await createContextMenus()
  
  // 初始化设置
  if (details.reason === 'install') {
    // 确保默认设置写入IndexedDB，并同步到本地存储（兼容现有代码）
    const ensured = await settingsOperations.ensureDefault()
    await saveUserSettingsToLocal(ensured)
    
    // 显示欢迎通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: ICON_URL,
      title: 'GPT-Enhance',
      message: '欢迎使用 GPT-Enhance！使用 ⌘+Shift+C 开始剪藏网页内容。'
    })
  }
})

// 浏览器启动时确保数据库已就绪（MV3 服务工作线程恢复时）
chrome.runtime.onStartup.addListener(async () => {
  try {
    console.log('[Startup] 开始初始化数据库与右键菜单')
    await initializeDatabase()
    await createContextMenus()
    console.log('[Startup] 初始化完成')
  } catch (e) {
    console.warn('启动初始化警告:', e)
  }
})

// 创建右键菜单
async function createContextMenus() {
  try {
    // 清除现有菜单
    await chrome.contextMenus.removeAll()
    
    // 检查设置（统一数据库）
    const unified = await settingsOperations.getCurrent()
    const enabled = unified?.contextMenu?.enabled ?? true
    
    if (enabled) {
      // 创建主菜单
      chrome.contextMenus.create({
        id: 'kaka-clipper-main',
        title: '剪藏到 GPT-Enhance',
        contexts: ['page', 'selection']
      })
      
      // 创建子菜单
      chrome.contextMenus.create({
        id: 'clip-page',
        parentId: 'kaka-clipper-main',
        title: '剪藏整个页面',
        contexts: ['page']
      })
      
      chrome.contextMenus.create({
        id: 'clip-selection',
        parentId: 'kaka-clipper-main',
        title: '剪藏选中内容',
        contexts: ['selection']
      })
      
      chrome.contextMenus.create({
        id: 'separator-1',
        parentId: 'kaka-clipper-main',
        type: 'separator',
        contexts: ['page', 'selection']
      })
      
      chrome.contextMenus.create({
        id: 'open-manager',
        parentId: 'kaka-clipper-main',
        title: '打开剪藏管理',
        contexts: ['page', 'selection']
      })
    }
  } catch (error) {
    console.error('创建右键菜单失败:', error)
  }
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  
  try {
    switch (info.menuItemId) {
      case 'clip-page':
        await clipCurrentPage(tab.id)
        break
        
      case 'clip-selection':
        await clipSelection(tab.id, info.selectionText || '')
        break
        
      case 'open-manager':
        // 直接打开新标签页，避免用户手势限制
        try {
          const panelUrl = chrome.runtime.getURL('sidepanel.html')
          const windowId = tab.windowId
          
          if (windowId) {
            const existingTabs = await chrome.tabs.query({ url: panelUrl })
            const inWindow = existingTabs.find((t) => t.windowId === windowId)
            if (inWindow?.id) {
              await chrome.tabs.update(inWindow.id, { active: true })
            } else {
              await chrome.tabs.create({ windowId, url: panelUrl, active: true })
            }
          } else {
            await chrome.tabs.create({ url: panelUrl, active: true })
          }
        } catch (error) {
          console.error('打开管理页面失败:', error)
        }
        break
    }
  } catch (error) {
    console.error('处理右键菜单失败:', error)
  }
})

// 处理快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    
    switch (command) {
      case 'clip-page':
        await clipCurrentPage(tab.id)
        break
        
      case 'open-manager':
        // 直接打开新标签页，避免用户手势限制
        try {
          const panelUrl = chrome.runtime.getURL('sidepanel.html')
          const windowId = tab.windowId
          
          if (windowId) {
            const existingTabs = await chrome.tabs.query({ url: panelUrl })
            const inWindow = existingTabs.find((t) => t.windowId === windowId)
            if (inWindow?.id) {
              await chrome.tabs.update(inWindow.id, { active: true })
            } else {
              await chrome.tabs.create({ windowId, url: panelUrl, active: true })
            }
          } else {
            await chrome.tabs.create({ url: panelUrl, active: true })
          }
        } catch (error) {
          console.error('打开管理页面失败:', error)
        }
        break
    }
  } catch (error) {
    console.error('处理快捷键失败:', error)
  }
})

// 剪藏当前页面
async function clipCurrentPage(tabId: number) {
  try {
    console.log('[Clip] 准备剪藏当前页面，tabId=', tabId)
    // 注入内容脚本
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contents/clipper.js']
    })
    
    // 发送剪藏消息
    const response = await chrome.tabs.sendMessage(tabId, { action: 'clipPage' })
    console.log('[Clip] 内容脚本返回：', response)
    
    // 显示通知（统一数据库设置）
    const settings = await settingsOperations.getCurrent()
    const notifEnabled = settings?.notifications?.enabled ?? true
    
    if (notifEnabled) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: ICON_URL,
        title: 'KaKa Clipper',
        message: response.success ? '页面剪藏成功！' : `剪藏失败：${response.message}`
      })
    }
    
    return response
  } catch (error) {
    console.error('剪藏页面失败:', error)
    
    // 显示错误通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: ICON_URL,
      title: 'KaKa Clipper',
      message: '剪藏失败，请重试'
    })
    
    return { success: false, message: '剪藏失败' }
  }
}

// 剪藏选中内容
async function clipSelection(tabId: number, selectionText: string) {
  try {
    console.log('[ClipSelection] 准备剪藏选中内容，tabId=', tabId, 'textLen=', selectionText?.length || 0)
    if (!selectionText.trim()) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: ICON_URL,
        title: 'KaKa Clipper',
        message: '请先选择要剪藏的内容'
      })
      return
    }
    
    // 注入内容脚本
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contents/clipper.js']
    })
    
    // 发送剪藏选中内容的消息
    const response = await chrome.tabs.sendMessage(tabId, { 
      action: 'clipSelection',
      text: selectionText
    })
    console.log('[ClipSelection] 内容脚本返回：', response)
    
    // 显示通知（统一数据库设置）
    const settings = await settingsOperations.getCurrent()
    const notifEnabled = settings?.notifications?.enabled ?? true
    
    if (notifEnabled) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: ICON_URL,
        title: 'KaKa Clipper',
        message: response.success ? '选中内容剪藏成功！' : `剪藏失败：${response.message}`
      })
    }
    
    return response
  } catch (error) {
    console.error('剪藏选中内容失败:', error)
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: ICON_URL,
      title: 'KaKa Clipper',
      message: '剪藏失败，请重试'
    })
    
    return { success: false, message: '剪藏失败' }
  }
}

// 打开侧边栏
// 注意：由于Chrome扩展的用户手势限制，从content script发送消息到background script会丢失用户手势上下文
// 因此无法在background script中调用sidePanel.open()，改为直接打开新标签页

// 监听来自popup和content script的消息
// 简单的侧边栏状态跟踪
let sidePanelOpenState = new Map<number, boolean>()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('[BGMessage] 收到消息：', message?.action, '来自tabId=', sender?.tab?.id)
  } catch {}
  switch (message.action) {
    case 'clipPage':
      if (sender.tab?.id) {
        clipCurrentPage(sender.tab.id).then(sendResponse)
        return true // 保持消息通道开放
      }
      break
      
    case 'openManager':
      // 立即调用sidePanel.open()，避免异步间隙导致用户手势丢失
      console.log('[BGMessage] 处理openManager消息，sender:', { tabId: sender.tab?.id, windowId: sender.tab?.windowId })
      
      if (sender.tab?.id) {
        // 立即调用，不能有任何异步间隙
        chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
          console.log('[BGMessage] 侧边栏打开成功')
          sendResponse({ success: true })
        }).catch((error) => {
          console.error('[BGMessage] 侧边栏打开失败:', error)
          sendResponse({ success: false, error: error.message })
        })
      } else {
        console.error('[BGMessage] 无法获取tabId')
        sendResponse({ success: false, error: '无法获取tabId' })
      }
      return true // 保持消息通道开放以支持异步响应
      break
    
    case 'toggleSidePanel':
      // 切换侧边栏：使用简单的状态跟踪避免异步操作
      console.log('[BGMessage] 处理toggleSidePanel消息')
      
      const tabId = sender.tab?.id
      if (!tabId) {
        console.error('[BGMessage] 无法获取tabId')
        sendResponse({ success: false, error: '无法获取tabId' })
        return false
      }
      
      const isCurrentlyOpen = sidePanelOpenState.get(tabId) || false
      
      if (isCurrentlyOpen) {
        // 侧边栏已打开，发送关闭消息
        console.log('[BGMessage] 侧边栏已打开，发送关闭消息')
        sidePanelOpenState.set(tabId, false)
        chrome.runtime.sendMessage({ action: 'closeSidePanel' })
        sendResponse({ success: true, action: 'closed' })
      } else {
        // 侧边栏未打开，直接打开（不使用异步）
        console.log('[BGMessage] 侧边栏未打开，尝试打开')
        try {
          chrome.sidePanel.open({ tabId: tabId })
          sidePanelOpenState.set(tabId, true)
          console.log('[BGMessage] 侧边栏打开成功')
          sendResponse({ success: true, action: 'opened' })
        } catch (error) {
          console.error('[BGMessage] 侧边栏打开失败:', error)
          sendResponse({ success: false, error: error.message })
        }
      }
      return false // 同步响应，不需要保持消息通道
      break
    
    case 'openSettings':
      // 打开设置页面
      console.log('[BGMessage] 处理openSettings消息')
      
      chrome.tabs.query({ url: chrome.runtime.getURL('options.html') })
        .then(existingTabs => {
          if (existingTabs.length > 0) {
            // 如果设置页面已经打开，激活该标签页
            return chrome.tabs.update(existingTabs[0].id!, { active: true })
              .then(() => {
                console.log('[BGMessage] 激活现有设置页面标签')
                sendResponse({ success: true })
              })
          } else {
            // 创建新的设置页面标签
            return chrome.tabs.create({ url: chrome.runtime.getURL('options.html'), active: true })
              .then(() => {
                console.log('[BGMessage] 创建新设置页面标签')
                sendResponse({ success: true })
              })
          }
        })
        .catch(error => {
          console.error('[BGMessage] 打开设置页面失败:', error)
          sendResponse({ success: false, error: error.message })
        })
      return true
      break
    case 'sidePanelOpened':
      // 侧边栏已打开，更新状态
      if (message.tabId) {
        sidePanelOpenState.set(message.tabId, true)
        console.log('[BGMessage] 侧边栏状态更新：已打开', message.tabId)
      }
      break
      
    case 'sidePanelClosed':
      // 侧边栏已关闭，更新状态
      if (message.tabId) {
        sidePanelOpenState.set(message.tabId, false)
        console.log('[BGMessage] 侧边栏状态更新：已关闭', message.tabId)
      }
      break

    case 'getSettings':
      (async () => {
        try {
          const s = await settingsOperations.ensureDefault()
          sendResponse({ success: true, data: s })
        } catch (e) {
          sendResponse({ success: false })
        }
      })()
      return true
    case 'setQuickEntryEnabled':
      (async () => {
        try {
          await settingsOperations.saveUserSettings({ quickEntry: { enabled: Boolean(message?.data?.enabled) } })
          sendResponse({ success: true })
        } catch (e) {
          sendResponse({ success: false })
        }
      })()
      return true
      
    case 'updateContextMenu':
      createContextMenus().then(() => sendResponse({ success: true }))
      return true
      
    case 'downloadPDF':
      downloadPDF(message.data).then(sendResponse).catch(error => {
        console.error('[downloadPDF] 处理失败：', error)
        sendResponse({ success: false, error: error.message })
      })
      return true
    
    case 'saveClip':
      (async () => {
        try {
          console.log('[saveClip] 入参概览：', {
            id: message?.data?.id,
            title: message?.data?.title,
            url: message?.data?.url,
            size: message?.data?.size,
            pdfId: message?.data?.pdfId
          })
          const id = await clipOperations.create(TableNames.CLIPS, message.data)
          console.log('[saveClip] 写入成功，id=', id)
          sendResponse({ success: true, id })
          // 广播保存完成事件，便于侧边栏刷新列表
          try {
            chrome.runtime.sendMessage({ action: 'clipSaved', id })
            console.log('[saveClip] 已广播 clipSaved 事件，id=', id)
          } catch (e) {}
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.error('保存剪藏失败:', error)
          sendResponse({ success: false, error: msg })
        }
      })()
      return true

    case 'getClips':
      (async () => {
        try {
          console.log('[getClips] 开始读取剪藏列表')
          const clips = await clipOperations.getAll<any>(TableNames.CLIPS)
          // 统一排序，最新在前
          const sorted = clips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          console.log('[getClips] 读取完成：数量=', sorted.length, '示例id=', sorted[0]?.id)
          sendResponse({ success: true, clips: sorted })
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.error('获取剪藏列表失败:', error)
          sendResponse({ success: false, error: msg })
        }
      })()
      return true
    
    default:
      break
  }
})

// 处理PDF文件保存
async function downloadPDF(data: { pdfData: number[], fileName: string, title?: string, url?: string }): Promise<{ success: boolean, pdfId?: string, fileName?: string, error?: string }> {
  try {
    const { pdfData, fileName, title, url } = data
    
    // 确保文件名有正确的.pdf后缀
    const pdfFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`
    
    // 生成唯一ID
    const id = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 将number[]转换为ArrayBuffer
    const uint8Array = new Uint8Array(pdfData)
    const arrayBuffer = uint8Array.buffer
    
    // 使用OPFS存储PDF二进制数据
    await pdfStorage.storePDF(id, arrayBuffer)
    
    console.log(`PDF已保存到OPFS: ${pdfFileName}, 大小: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`)
    
    return { success: true, pdfId: id, fileName: pdfFileName }
  } catch (error) {
    console.error('PDF保存失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

// 通过消息触发右键菜单更新（设置保存后通知）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'updateContextMenu') {
    createContextMenus().then(() => sendResponse({ success: true }))
    return true
  }
})

// 监听通知点击
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // 点击通知时打开新标签页到侧边栏页面
  try {
    const panelUrl = chrome.runtime.getURL('sidepanel.html')
    const currentWindow = await chrome.windows.getCurrent()
    
    if (currentWindow.id) {
      // 检查是否已有标签页打开
      const existingTabs = await chrome.tabs.query({ url: panelUrl })
      const inWindow = existingTabs.find((t) => t.windowId === currentWindow.id)
      if (inWindow?.id) {
        await chrome.tabs.update(inWindow.id, { active: true })
      } else {
        await chrome.tabs.create({ windowId: currentWindow.id, url: panelUrl, active: true })
      }
    } else {
      await chrome.tabs.create({ url: panelUrl, active: true })
    }
  } catch (error) {
    console.error('打开管理页面失败:', error)
  }
})

// 定期清理过期数据
setInterval(async () => {
  try {
    const settings = await settingsOperations.getCurrent()
    const maxClips = settings?.storage?.maxClips ?? 100
    const clips = await clipOperations.getAll<any>(TableNames.CLIPS)

    // 按创建时间降序，保留前 maxClips
    const sorted = clips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    if (sorted.length > maxClips) {
      const toRemove = sorted.slice(maxClips)
      for (const clip of toRemove) {
        try {
          await clipOperations.delete(TableNames.CLIPS, clip.id)
        } catch (e) {
          console.warn('清理剪藏失败（忽略）：', e)
        }
      }
      console.log(`清理了 ${toRemove.length} 个过期剪藏（IndexedDB）`)
    }
  } catch (error) {
    console.error('清理数据失败:', error)
  }
}, 60 * 60 * 1000) // 每小时执行一次

// 导出类型供其他模块使用
export interface BackgroundMessage {
  action: 'clipPage' | 'openManager' | 'updateContextMenu' | 'downloadPDF' | 'saveClip' | 'clipSaved' | 'getClips'
  data?: any
}

export interface BackgroundResponse {
  success: boolean
  message?: string
  data?: any
}