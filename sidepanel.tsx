import React, { useState, useEffect } from "react"
import "./style.css"
import PDFPreview from "./components/PDFPreview"
import { clipOperations, TableNames } from "./lib/database"
import { pdfStorage } from "./lib/pdfStorage"
import type { ClipItem } from './lib/types'
import { Search, Download, Trash, Edit, FileText, RefreshCw } from 'lucide-react'
import { formatFileSize, formatDate } from './lib/utils'

// 使用 lucide-react 图标库替换自定义 SVG 图标；大小与日期格式化改为复用 utils

function SidePanel() {
  const [clips, setClips] = useState<ClipItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date')
  const [isLoading, setIsLoading] = useState(true)
  const [previewClip, setPreviewClip] = useState<ClipItem | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  
  // 为拖拽功能缓存PDF File对象
  const [pdfFiles, setPdfFiles] = useState<Record<string, File>>({})

  // 加载剪藏列表
  useEffect(() => {
    // 首次加载列表
    console.log('[SidePanel] 首次加载剪藏列表')
    loadClips()

    // 监听后台广播的剪藏保存事件，实时刷新列表
    const onMessage = (message: any, sender: any, sendResponse: any) => {
      if (message?.action === 'clipSaved') {
        console.log('[SidePanel] 收到 clipSaved 广播，id=', message?.id)
        loadClips()
      } else if (message?.action === 'checkSidePanelOpen') {
        // 响应侧边栏状态检查
        console.log('[SidePanel] 收到 checkSidePanelOpen 消息')
        sendResponse({ isOpen: true })
        return true
      } else if (message?.action === 'closeSidePanel') {
        // 关闭侧边栏
        console.log('[SidePanel] 收到 closeSidePanel 消息，关闭窗口')
        window.close()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    
    // 通知background侧边栏已打开
    chrome.runtime.sendMessage({ action: 'sidePanelOpened', tabId: chrome.devtools?.inspectedWindow?.tabId })
    
    return () => {
      console.log('[SidePanel] 卸载，移除消息监听')
      chrome.runtime.onMessage.removeListener(onMessage)
      // 通知background侧边栏已关闭
      chrome.runtime.sendMessage({ action: 'sidePanelClosed', tabId: chrome.devtools?.inspectedWindow?.tabId })
    }
  }, [])

  // 组件卸载时的清理（不再需要释放Blob URLs）
  useEffect(() => {
    return () => {
      // 清理逻辑已移除，因为不再预缓存PDF URLs
    }
  }, [])

  const loadClips = async () => {
    try {
      console.log('[SidePanel] 开始加载剪藏列表（直接读取 Dexie）')
      setIsLoading(true)
      const local = await clipOperations.getAll<any>(TableNames.CLIPS)
      const mapped = local.map((c: any) => ({
        id: c.id,
        title: c.title,
        url: c.url,
        timestamp: c.createdAt || Date.now(),
        size: c.size || 0,
        // 列表项只需要元数据，避免将大文本/二进制塞入状态导致界面卡死
        content: '',
        pdfId: c.pdfId
      })) as ClipItem[]
      console.log('[SidePanel] Dexie 数据到达，数量=', mapped.length)
      setClips(mapped)
      
      // 预加载PDF文件用于拖拽（异步进行，不阻塞UI）
      preloadPDFFiles(mapped)
      
      setIsLoading(false)
    } catch (error) {
      console.error('加载剪藏列表失败:', error)
      setIsLoading(false)
    }
  }

  // 预加载PDF文件用于拖拽
  const preloadPDFFiles = async (clips: ClipItem[]) => {
    const files: Record<string, File> = {}
    
    for (const clip of clips) {
      try {
        let pdfId = clip.pdfId
        if (!pdfId) {
          const dbClip = await clipOperations.getById<any>(TableNames.CLIPS, clip.id)
          pdfId = dbClip?.pdfId
        }
        
        if (pdfId) {
          const pdfArrayBuffer = await pdfStorage.getPDFBinaryData(pdfId)
          if (pdfArrayBuffer) {
            let fileName = clip.title
            if (!fileName.toLowerCase().endsWith('.pdf')) {
              fileName += '.pdf'
            }
            
            const file = new File([pdfArrayBuffer], fileName, {
              type: 'application/pdf',
              lastModified: clip.timestamp
            })
            
            files[clip.id] = file
            console.log(`[预加载] PDF文件已缓存: ${fileName}`)
          }
        }
      } catch (error) {
        console.error(`预加载PDF失败 (${clip.id}):`, error)
      }
    }
    
    setPdfFiles(files)
  }

  // 过滤和排序剪藏
  const filteredAndSortedClips = clips
    .filter(clip => 
      clip.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clip.url.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'date') {
        return b.timestamp - a.timestamp
      } else {
        return a.title.localeCompare(b.title)
      }
    })

  // 打开PDF在新标签页
  const handleOpenPDF = async (clip: ClipItem) => {
    try {
      let pdfId = clip.pdfId
      if (!pdfId) {
        const dbClip = await clipOperations.getById<any>(TableNames.CLIPS, clip.id)
        pdfId = dbClip?.pdfId
      }
      if (!pdfId) {
        alert('未找到该剪藏对应的PDF数据')
        return
      }
      
      // 从OPFS读取PDF数据
      const pdfArrayBuffer = await pdfStorage.getPDFBinaryData(pdfId)
      if (pdfArrayBuffer) {
        const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        
        // 在新标签页中打开PDF
        const newTab = window.open(url, '_blank')
        if (newTab) {
          // 设置标签页标题
          newTab.document.title = clip.title
        }
        
        // 清理URL对象（延迟清理，确保标签页已加载）
        setTimeout(() => {
          URL.revokeObjectURL(url)
        }, 5000)
      } else {
        alert('PDF数据不存在或已被删除')
      }
    } catch (error) {
      console.error('打开PDF失败:', error)
      alert('打开PDF失败，请重试')
    }
  }

  // 下载PDF
  const handleDownload = async (clip: ClipItem) => {
    try {
      let pdfId = clip.pdfId
      if (!pdfId) {
        const dbClip = await clipOperations.getById<any>(TableNames.CLIPS, clip.id)
        pdfId = dbClip?.pdfId
      }
      if (!pdfId) {
        alert('未找到该剪藏对应的PDF数据')
        return
      }
      
      // 从OPFS读取PDF数据
      const pdfArrayBuffer = await pdfStorage.getPDFBinaryData(pdfId)
      if (pdfArrayBuffer) {
        const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${clip.title}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        alert('PDF数据不存在或已被删除')
      }
    } catch (error) {
      console.error('下载失败:', error)
      alert('下载失败，请重试')
    }
  }
  const handleDelete = async (clip: ClipItem) => {
    if (confirm(`确定要删除"${clip.title}"吗？`)) {
      try {
        // 从统一数据库删除
        await clipOperations.delete(TableNames.CLIPS, clip.id)
        
        // 更新列表
        const updatedClips = clips.filter(c => c.id !== clip.id)
        setClips(updatedClips)
        
        // 如果当前预览的是被删除的项目，关闭预览
        if (previewClip?.id === clip.id) {
          setPreviewClip(null)
        }
      } catch (error) {
        console.error('删除失败:', error)
      }
    }
  }



  // 重命名剪藏
  const handleRename = async (clip: ClipItem, newTitle: string) => {
    if (newTitle.trim() && newTitle !== clip.title) {
      try {
        // 更新统一数据库
        await clipOperations.update(TableNames.CLIPS, clip.id, { title: newTitle.trim(), updatedAt: Date.now() } as any)
        // 更新列表
        const updatedClips = clips.map(c => c.id === clip.id ? { ...c, title: newTitle.trim() } : c)
        setClips(updatedClips)
        
        // 更新预览项
        if (previewClip?.id === clip.id) {
          setPreviewClip({ ...previewClip, title: newTitle.trim() })
        }
      } catch (error) {
        console.error('重命名失败:', error)
      }
    }
    setEditingId(null)
    setEditTitle('')
  }

  // 开始编辑
  const startEdit = (clip: ClipItem) => {
    setEditingId(clip.id)
    setEditTitle(clip.title)
  }

  // 清空所有剪藏
  const handleClearAll = async () => {
    if (confirm('确定要清空所有剪藏吗？此操作不可恢复！')) {
      try {
        // 清空 clips 表并清理所有 PDF 数据
        await clipOperations.clear(TableNames.CLIPS)
        await pdfStorage.clearAll()
        
        setClips([])
        setPreviewClip(null)
      } catch (error) {
        console.error('清空失败:', error)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#fafafa]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">加载剪藏内容...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#fafafa] font-inter">
      {/* 主要内容区域 */}
      <div className="h-full bg-white flex flex-col shadow-sm">
        {/* 头部 - Notion风格 */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                 <FileText size={18} />
               </div>
              <h1 className="text-xl font-semibold text-gray-900">剪藏管理</h1>
            </div>
            <button
              onClick={() => loadClips()}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
              title="刷新"
              aria-label="刷新"
              disabled={isLoading}
            >
              <span className={isLoading ? 'animate-spin' : ''}>
                <RefreshCw size={18} />
              </span>
            </button>
          </div>
          
          {/* 搜索框 - Notion风格 */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="搜索剪藏内容..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border-0 rounded-xl text-sm placeholder-gray-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all duration-200"
            />
          </div>
          
          {/* 排序和操作 - Notion风格 */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'title')}
                className="text-sm bg-gray-50 border-0 rounded-lg px-3 py-2 text-gray-700 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none"
              >
                <option value="date">最近创建</option>
                <option value="title">按标题</option>
              </select>
              <span className="text-xs text-gray-500">{filteredAndSortedClips.length} 个剪藏</span>
            </div>
            <button
              onClick={handleClearAll}
              className="text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all duration-200"
              disabled={clips.length === 0}
            >
              清空全部
            </button>
          </div>
        </div>
        
        {/* 剪藏列表 - Notion风格 */}
        <div className="flex-1 overflow-y-auto px-4">
          {filteredAndSortedClips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <FileText size={18} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? '没有找到匹配的剪藏' : '开始你的第一个剪藏'}
              </h3>
              <p className="text-sm text-gray-500 mb-4 max-w-sm">
                {searchTerm ? '尝试使用不同的关键词搜索' : '使用快捷键 ⌘+Shift+C 剪藏当前页面内容'}
              </p>
            </div>
          ) : (
            <div className="py-4 space-y-2">
              {filteredAndSortedClips.map((clip) => {
                 return (
                   <div
                     key={clip.id}
                     draggable="true"
                     className={`group p-4 rounded-xl cursor-pointer transition-all duration-200 border ${
                       previewClip?.id === clip.id
                         ? 'bg-blue-50 border-blue-200 shadow-sm'
                         : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200 hover:shadow-sm'
                     } hover:cursor-grab active:cursor-grabbing`}
                     onClick={() => handleOpenPDF(clip)}
                     onDragStart={(e) => {
                       // 使用预缓存的File对象进行拖拽
                       const cachedFile = pdfFiles[clip.id]
                       if (!cachedFile) {
                         console.warn('[dragstart] 未找到缓存的PDF文件，请等待预加载完成')
                         e.preventDefault()
                         return
                       }

                       // 设置拖拽效果
                       e.dataTransfer.effectAllowed = 'copy'
                       
                       // 创建临时下载链接
                       const blob = new Blob([cachedFile], { type: 'application/pdf' })
                       const downloadUrl = URL.createObjectURL(blob)
                       
                       // 创建临时的a标签用于下载
                       const tempLink = document.createElement('a')
                       tempLink.href = downloadUrl
                       tempLink.download = cachedFile.name
                       tempLink.style.display = 'none'
                       document.body.appendChild(tempLink)
                       
                       // 设置拖拽数据 - 使用多种格式确保兼容性
                       try {
                         // 添加File对象
                         if (e.dataTransfer.items) {
                           e.dataTransfer.items.add(cachedFile)
                         }
                         
                         // 设置各种数据类型
                         e.dataTransfer.setData('text/uri-list', downloadUrl)
                         e.dataTransfer.setData('text/plain', cachedFile.name)
                         e.dataTransfer.setData('application/pdf', downloadUrl)
                         
                         // Chrome特有的DownloadURL格式
                         const downloadURLData = `application/pdf:${cachedFile.name}:${downloadUrl}`
                         e.dataTransfer.setData('DownloadURL', downloadURLData)
                         
                         // 设置HTML格式（某些应用支持）
                         const htmlData = `<a href="${downloadUrl}" download="${cachedFile.name}">${cachedFile.name}</a>`
                         e.dataTransfer.setData('text/html', htmlData)
                         
                       } catch (err) {
                         console.warn('设置拖拽数据时出错:', err)
                       }
                       
                       // 清理函数
                       const cleanup = () => {
                         URL.revokeObjectURL(downloadUrl)
                         if (tempLink.parentNode) {
                           document.body.removeChild(tempLink)
                         }
                       }
                       
                       // 延迟清理，给足够时间完成拖拽操作
                       setTimeout(cleanup, 60000) // 1分钟后清理
                       
                       console.log('[dragstart] 拖拽数据设置完成', {
                         clipId: clip.id,
                         fileName: cachedFile.name,
                         fileSize: cachedFile.size,
                         fileType: cachedFile.type,
                         downloadUrl: downloadUrl,
                         hasItems: !!e.dataTransfer.items,
                         itemsLength: e.dataTransfer.items?.length || 0,
                         filesLength: e.dataTransfer.files?.length || 0,
                         types: Array.from(e.dataTransfer.types || [])
                       })
                     }}
                     onDragEnd={(e) => {
                       console.log('[dragend] 拖拽结束', {
                         dropEffect: e.dataTransfer.dropEffect,
                         effectAllowed: e.dataTransfer.effectAllowed
                       })
                     }}
                     title="点击在新标签页打开PDF，拖拽上传到其他应用"
                     >
                       <div className="flex justify-between items-start mb-3">
                         {editingId === clip.id ? (
                           <input
                             type="text"
                             value={editTitle}
                             onChange={(e) => setEditTitle(e.target.value)}
                             onBlur={() => handleRename(clip, editTitle)}
                             onKeyPress={(e) => {
                               if (e.key === 'Enter') {
                                 handleRename(clip, editTitle)
                               }
                             }}
                             className="flex-1 text-base font-medium text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 mr-3 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 focus:outline-none"
                             autoFocus
                           />
                         ) : (
                           <h3 className="flex-1 text-base font-medium text-gray-900 leading-6 line-clamp-2">
                             {clip.title}
                           </h3>
                         )}
                         
                         <div className="flex items-center space-x-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                           <button
                             onClick={(e) => {
                               e.preventDefault()
                               e.stopPropagation()
                               startEdit(clip)
                             }}
                             className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                             title="重命名"
                           >
                 <Edit size={16} />
                           </button>
                           <button
                             onClick={(e) => {
                               e.preventDefault()
                               e.stopPropagation()
                               handleDownload(clip)
                             }}
                             className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                             title="下载"
                           >
                 <Download size={16} />
                           </button>
                           <button
                             onClick={(e) => {
                               e.preventDefault()
                               e.stopPropagation()
                               handleDelete(clip)
                             }}
                             className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                             title="删除"
                           >
                 <Trash size={16} />
                           </button>
                         </div>
                       </div>
                       
                       <p className="text-sm text-gray-500 mb-3 truncate font-mono">{clip.url}</p>
                       <div className="flex justify-between items-center">
                         <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md">{formatDate(clip.timestamp)}</span>
                         <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md">{formatFileSize(clip.size)}</span>
                       </div>
                     </div>
                   )
               })}
            </div>
          )}
        </div>
      </div>
      
      {/* PDF预览组件 */}
      {previewClip && (
        <PDFPreview
          clip={previewClip}
          onClose={() => setPreviewClip(null)}
        />
      )}
    </div>
  )
}

export default SidePanel
// 简单的 ArrayBuffer -> base64 转换（用于构造 data:application/pdf;base64,...）
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}