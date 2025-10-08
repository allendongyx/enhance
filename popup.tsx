import { useState } from "react"
import "./style.css"

// 简化的图标组件
const ScissorsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="6" cy="6" r="3"/>
    <path d="m21.5 21.5-4.5-4.5"/>
    <path d="m21.5 2.5-4.5 4.5"/>
    <circle cx="6" cy="18" r="3"/>
    <path d="m20 4-8.5 8.5"/>
    <path d="m20 20-8.5-8.5"/>
  </svg>
)

// 已移除调试模式相关逻辑

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
)

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

function IndexPopup() {
  const [isClipping, setIsClipping] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [extractMode, setExtractMode] = useState<'smart' | 'fullpage' | 'manual'>('smart')
  // 调试模式已移除

  const handleClipPage = async () => {
    setIsClipping(true)
    setNotification(null)
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) {
        throw new Error('无法获取当前标签页')
      }
      
      // 检查chrome.scripting API是否可用
      if (!chrome.scripting) {
        throw new Error('chrome.scripting API 不可用')
      }
      
      // 先注入content script（如果还没有注入的话）
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['contents/clipper.js']
        })
      } catch (scriptError) {
      }
      
      // 发送剪藏消息，包含提取模式
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'clipPage',
        mode: extractMode
      })
      
      
      if (response.success) {
        setNotification({ 
          type: 'success', 
          message: `${extractMode === 'smart' ? '智能' : extractMode === 'fullpage' ? '整页' : '手动选取'}剪藏成功！` 
        })
        
        // 显示系统通知
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon.png',
          title: 'GPT-Enhance',
          message: `${extractMode === 'smart' ? '智能' : extractMode === 'fullpage' ? '整页' : '手动选取'}剪藏完成！`
        })
      } else {
        throw new Error(response.message || '剪藏失败')
      }
    } catch (error) {
      console.error('剪藏失败:', error)
      setNotification({ 
        type: 'error', 
        message: error instanceof Error ? error.message : '剪藏失败，请重试' 
      })
    } finally {
      setIsClipping(false)
    }
  }

  const handleOpenManager = async () => {
    await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id })
    window.close()
  }

  const handleOpenSettings = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") })
    window.close()
  }

  return (
    <div className="w-80 bg-white shadow-xl border border-gray-100">
      {/* 头部 - Notion风格 */}
      <div className="flex items-center justify-between p-6 bg-white border-b border-gray-100">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
            <ScissorsIcon />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">GPT-Enhance</h1>
            <p className="text-xs text-gray-500 mt-0.5">智能网页剪藏工具</p>
          </div>
        </div>
        {/* 调试模式按钮已移除 */}
      </div>

      <div className="p-6 space-y-6">
        {/* 调试信息已移除 */}
        
        {/* 提取模式选择 - Notion风格 */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center">
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
            提取模式
          </h3>
          <div className="space-y-3">
            <label className="flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${
              extractMode === 'smart' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            }">
              <input
                type="radio"
                name="extractMode"
                value="smart"
                checked={extractMode === 'smart'}
                onChange={(e) => setExtractMode(e.target.value as 'smart')}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 mt-0.5"
              />
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">智能提取</div>
                <div className="text-xs text-gray-500 mt-1">自动识别正文内容，过滤广告和导航</div>
              </div>
            </label>
            <label className="flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${
              extractMode === 'fullpage' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            }">
              <input
                type="radio"
                name="extractMode"
                value="fullpage"
                checked={extractMode === 'fullpage'}
                onChange={(e) => setExtractMode(e.target.value as 'fullpage')}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 mt-0.5"
              />
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">整页提取</div>
                <div className="text-xs text-gray-500 mt-1">完整网页截图，保留所有内容</div>
              </div>
            </label>
            <label className="flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${
              extractMode === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            }">
              <input
                type="radio"
                name="extractMode"
                value="manual"
                checked={extractMode === 'manual'}
                onChange={(e) => setExtractMode(e.target.value as 'manual')}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 mt-0.5"
              />
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">手动选取</div>
                <div className="text-xs text-gray-500 mt-1">选择页面特定区域进行剪藏</div>
              </div>
            </label>
          </div>
        </div>

        {/* 通知显示 - Notion风格 */}
        {notification && (
          <div className={`p-4 rounded-xl border-l-4 ${
            notification.type === 'success' 
              ? 'bg-emerald-50 border-l-emerald-500 text-emerald-800' 
              : 'bg-red-50 border-l-red-500 text-red-800'
          }`}>
            <div className="flex items-center">
              <span className="text-lg mr-2">
                {notification.type === 'success' ? '✅' : '❌'}
              </span>
              <span className="text-sm font-medium">{notification.message}</span>
            </div>
          </div>
        )}

        {/* 主要功能按钮 - Notion风格 */}
        <button
          onClick={handleClipPage}
          disabled={isClipping}
          className={`
            w-full flex items-center justify-center px-6 py-4 rounded-xl font-semibold transition-all duration-200
            ${isClipping 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 hover:shadow-lg transform hover:-translate-y-0.5 active:scale-95'
            }
          `}
        >
          {isClipping ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-3" />
              <span className="text-sm">
                {extractMode === 'manual' ? '等待选择区域...' : '剪藏中...'}
              </span>
            </>
          ) : (
            <>
              <ScissorsIcon />
              <span className="ml-3 text-sm">
                {extractMode === 'smart' ? '开始智能剪藏' : extractMode === 'fullpage' ? '开始整页剪藏' : '开始手动选取'}
              </span>
            </>
          )}
        </button>

        {/* 辅助功能按钮 - Notion风格 */}
        <div className="space-y-3">
          <button
            onClick={handleOpenManager}
            className="w-full flex items-center px-4 py-3 text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:shadow-sm group"
          >
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3 group-hover:bg-blue-200 transition-colors">
              <FolderIcon />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">管理剪藏内容</div>
              <div className="text-xs text-gray-500">查看和管理已保存的剪藏</div>
            </div>
          </button>

          <button
            onClick={handleOpenSettings}
            className="w-full flex items-center px-4 py-3 text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:shadow-sm group"
          >
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3 group-hover:bg-purple-200 transition-colors">
              <SettingsIcon />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">设置</div>
              <div className="text-xs text-gray-500">配置扩展选项和偏好</div>
            </div>
          </button>
        </div>

        {/* 快捷键提示 - Notion风格 */}
        <div className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center mb-3">
            <span className="text-sm mr-2">⌨️</span>
            <div className="text-sm font-semibold text-gray-900">快捷键</div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">剪藏页面</span>
              <kbd className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 font-mono shadow-sm">⌘+Shift+C</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">打开管理</span>
              <kbd className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 font-mono shadow-sm">⌘+Shift+M</kbd>
            </div>
          </div>
        </div>

        {/* 版本信息 - Notion风格 */}
        <div className="text-center pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-400 font-medium">GPT-Enhance v1.0.0</div>
          {/* 调试模式提示已移除 */}
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
