import React, { useState, useEffect } from "react"
import "./style.css"
import { getCurrentUserSettings, settingsOperations, clipOperations, TableNames, DEFAULT_USER_SETTINGS, pdfOperations } from "./lib/database"
import { formatFileSize } from "./lib/utils"

// 设置项类型定义
interface Settings {
  autoClip: boolean
  clipShortcut: string
  managerShortcut: string
  maxClips: number
  autoExport: boolean
  exportPath: string
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
  notifications: boolean
  contextMenu: boolean
  quickEntry: boolean
}

// 默认设置来源于数据库层的 DEFAULT_USER_SETTINGS，并映射到本页的展现结构
const defaultSettings: Settings = {
  autoClip: DEFAULT_USER_SETTINGS.autoClip ?? false,
  clipShortcut: DEFAULT_USER_SETTINGS.shortcuts?.clip ?? 'Command+Shift+C',
  managerShortcut: DEFAULT_USER_SETTINGS.shortcuts?.manager ?? 'Command+Shift+M',
  maxClips: DEFAULT_USER_SETTINGS.storage?.maxClips ?? 100,
  autoExport: DEFAULT_USER_SETTINGS.export?.autoExport ?? false,
  exportPath: DEFAULT_USER_SETTINGS.export?.defaultPath ?? '',
  theme: (DEFAULT_USER_SETTINGS.appearance?.theme as Settings['theme']) ?? 'auto',
  language: (DEFAULT_USER_SETTINGS.appearance?.language as Settings['language']) ?? 'zh-CN',
  notifications: DEFAULT_USER_SETTINGS.notifications?.enabled ?? true,
  contextMenu: DEFAULT_USER_SETTINGS.contextMenu?.enabled ?? true,
  quickEntry: DEFAULT_USER_SETTINGS.quickEntry?.enabled ?? true
}

// 图标组件
const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const SaveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17,21 17,13 7,13 7,21"/>
    <polyline points="7,3 7,8 15,8"/>
  </svg>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3,6 5,6 21,6"/>
    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
  </svg>
)

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="l12,16v-4"/>
    <path d="l12,8h.01"/>
  </svg>
)

function OptionsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [storageInfo, setStorageInfo] = useState({ clipCount: 0, usedSpace: 0, maxSpace: 500 * 1024 * 1024 })
  // quickEntry 开关统一纳入 settings

  // 加载设置
  useEffect(() => {
    loadSettings()
    loadStorageInfo()
  }, [])

  const loadSettings = async () => {
    try {
      // 优先从统一的 IndexedDB 读取设置
      const unified = await getCurrentUserSettings()
      const mapped: Settings = {
        autoClip: unified.autoClip ?? defaultSettings.autoClip,
        clipShortcut: unified.shortcuts?.clip ?? defaultSettings.clipShortcut,
        managerShortcut: unified.shortcuts?.manager ?? defaultSettings.managerShortcut,
        maxClips: unified.storage?.maxClips ?? defaultSettings.maxClips,
        autoExport: unified.export?.autoExport ?? defaultSettings.autoExport,
        exportPath: unified.export?.defaultPath ?? defaultSettings.exportPath,
        theme: (unified.appearance?.theme as Settings["theme"]) ?? defaultSettings.theme,
        language: (unified.appearance?.language as Settings["language"]) ?? defaultSettings.language,
        notifications: unified.notifications?.enabled ?? defaultSettings.notifications,
        contextMenu: unified.contextMenu?.enabled ?? defaultSettings.contextMenu,
        quickEntry: unified.quickEntry?.enabled ?? defaultSettings.quickEntry
      }
      setSettings(mapped)
    } catch (error) {
      console.error('加载设置失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStorageInfo = async (): Promise<void> => {
    try {
      const [clips, pdfMetas] = await Promise.all([
        clipOperations.getAll(TableNames.CLIPS),
        pdfOperations.getAllPDFMetadata()
      ])
      const clipSize = clips.reduce((sum, c) => sum + (c.size || 0), 0)
      const pdfSize = pdfMetas.reduce((sum, p) => sum + (p.size || 0), 0)
      const used = clipSize + pdfSize
      const MAX_BYTES = 500 * 1024 * 1024 // 500MB 上限
      setStorageInfo({
        clipCount: clips.length,
        usedSpace: used,
        maxSpace: MAX_BYTES
      })
    } catch (error) {
      console.error('加载存储信息失败:', error)
    }
  }

  // 保存设置
  const saveSettings = async () => {
    setIsSaving(true)
    try {
      await settingsOperations.saveUserSettings({
        autoClip: settings.autoClip,
        shortcuts: { clip: settings.clipShortcut, manager: settings.managerShortcut },
        storage: { maxClips: settings.maxClips },
        export: { autoExport: settings.autoExport, defaultPath: settings.exportPath },
        appearance: { theme: settings.theme, language: settings.language },
        notifications: { enabled: settings.notifications },
        contextMenu: { enabled: settings.contextMenu },
        quickEntry: { enabled: settings.quickEntry }
      })
      // 通知后台更新右键菜单
      try { await chrome.runtime.sendMessage({ action: 'updateContextMenu' }) } catch {}
      // 通知内容脚本刷新浮标展示
      try { chrome.runtime.sendMessage({ action: 'settingsUpdated' }) } catch {}
      setSaveMessage('设置已保存')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('保存设置失败:', error)
      setSaveMessage('保存失败')
      setTimeout(() => setSaveMessage(''), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  // 导出所有数据
  const exportAllData = async (): Promise<void> => {
    try {
      const [clips, unifiedSettings] = await Promise.all([
        clipOperations.getAll(TableNames.CLIPS),
        getCurrentUserSettings()
      ])
      const exportData = {
        clipList: clips,
        settings: unifiedSettings,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      }
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gpt-enhance-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败，请重试')
    }
  }

  // 清空所有数据
  const clearAllData = async (): Promise<void> => {
    if (!window.confirm('确定要清除所有数据吗？此操作不可撤销！')) {
      return
    }
    
    try {
      // 清空所有剪藏（包含PDF），并重置设置至默认（仅数据库）
      await clipOperations.clear(TableNames.CLIPS)
      await pdfOperations.clearAllPDFs()
      await settingsOperations.saveUserSettings({
        autoClip: defaultSettings.autoClip,
        shortcuts: { clip: defaultSettings.clipShortcut, manager: defaultSettings.managerShortcut },
        storage: { maxClips: defaultSettings.maxClips },
        export: { autoExport: defaultSettings.autoExport, defaultPath: defaultSettings.exportPath },
        appearance: { theme: defaultSettings.theme, language: defaultSettings.language },
        notifications: { enabled: defaultSettings.notifications },
        contextMenu: { enabled: defaultSettings.contextMenu }
      })
      try { await chrome.runtime.sendMessage({ action: 'updateContextMenu' }) } catch {}
      setSettings(defaultSettings)
      await loadStorageInfo()
    } catch (error) {
      console.error('清除数据失败:', error)
      alert('清空失败，请重试')
    }
  }

  // 复用全局工具的文件大小格式化

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载设置中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center">
            <SettingsIcon />
            <h1 className="ml-3 text-2xl font-semibold text-gray-900">GPT-Enhance 设置</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 主要设置 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 基本设置 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">基本设置</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">页面右侧浮标快捷入口</label>
                    <p className="text-xs text-gray-500">点击打开剪藏列表侧边栏，右键可快捷隐藏</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.quickEntry}
                    onChange={(e) => setSettings({ ...settings, quickEntry: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">启用通知</label>
                    <p className="text-xs text-gray-500">剪藏成功或失败时显示通知</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications}
                    onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">显示右键菜单</label>
                    <p className="text-xs text-gray-500">在页面右键菜单中显示剪藏选项</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.contextMenu}
                    onChange={(e) => setSettings({ ...settings, contextMenu: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最大剪藏数量</label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={settings.maxClips}
                    onChange={(e) => setSettings({ ...settings, maxClips: parseInt(e.target.value) || 100 })}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">超过此数量时会自动删除最旧的剪藏</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">主题</label>
                  <select
                    value={settings.theme}
                    onChange={(e) => setSettings({ ...settings, theme: e.target.value as 'light' | 'dark' | 'auto' })}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="auto">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 快捷键设置 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">快捷键</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">剪藏页面</label>
                  <div className="flex items-center space-x-2">
                    <kbd className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-mono">
                      {settings.clipShortcut}
                    </kbd>
                    <InfoIcon />
                    <span className="text-xs text-gray-500">在扩展管理页面可以修改快捷键</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">打开管理面板</label>
                  <div className="flex items-center space-x-2">
                    <kbd className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-mono">
                      {settings.managerShortcut}
                    </kbd>
                    <InfoIcon />
                    <span className="text-xs text-gray-500">在扩展管理页面可以修改快捷键</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 数据管理 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">数据管理</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <h3 className="text-sm font-medium text-blue-900">导出所有数据</h3>
                    <p className="text-xs text-blue-700">将所有剪藏和设置导出为JSON文件</p>
                  </div>
                  <button
                    onClick={exportAllData}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <DownloadIcon />
                    <span className="ml-2">导出</span>
                  </button>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                  <div>
                    <h3 className="text-sm font-medium text-red-900">清空所有数据</h3>
                    <p className="text-xs text-red-700">删除所有剪藏和设置，此操作不可恢复</p>
                  </div>
                  <button
                    onClick={clearAllData}
                    className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <TrashIcon />
                    <span className="ml-2">清空</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 侧边栏信息 */}
          <div className="space-y-6">
            {/* 保存按钮 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className={`w-full flex items-center justify-center px-4 py-3 rounded-lg font-medium text-white transition-all duration-200 ${
                  isSaving
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700 hover:shadow-lg'
                }`}
              >
                <SaveIcon />
                <span className="ml-2">{isSaving ? '保存中...' : '保存设置'}</span>
              </button>
              
              {saveMessage && (
                <p className={`mt-2 text-sm text-center ${
                  saveMessage.includes('失败') ? 'text-red-600' : 'text-green-600'
                }`}>
                  {saveMessage}
                </p>
              )}
            </div>

            {/* 存储信息 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">存储信息</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">剪藏数量</span>
                  <span className="text-sm font-medium text-gray-900">{storageInfo.clipCount}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">已用空间</span>
                  <span className="text-sm font-medium text-gray-900">{formatFileSize(storageInfo.usedSpace)}</span>
                </div>
                
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500">存储使用率</span>
                    <span className="text-xs text-gray-500">
                      {((storageInfo.usedSpace / storageInfo.maxSpace) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((storageInfo.usedSpace / storageInfo.maxSpace) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* 版本信息 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">关于</h3>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>版本</span>
                  <span className="font-medium">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span>开发者</span>
                  <span className="font-medium">GPT Team</span>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 leading-relaxed">
                  GPT-Enhance 是一个简单易用的网页剪藏工具，帮助您快速保存和管理网页内容。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OptionsPage