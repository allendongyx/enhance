import React, { useState, useEffect } from 'react'
// 移除 storageManager 依赖，统一走数据库操作
import * as pdfjsLib from 'pdfjs-dist'
import { clipOperations, TableNames, pdfOperations } from '../lib/database'
import { formatFileSize, formatDate } from '../lib/utils'
import type { ClipItem } from '../lib/types'

// 设置 PDF.js worker为本地打包资源，支持离线
try {
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString()
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
} catch {
  // 回退：如果打包器不支持 import.meta.url，保持原逻辑，但推荐避免CDN
  // pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
}

interface PDFPreviewProps {
  clip: ClipItem
  onClose: () => void
}

// 使用全局工具函数处理文件大小显示与日期格式

// 将 ArrayBuffer 安全地转换为 base64 字符串（分块，避免调用栈溢出）
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000 // 32KB per chunk to avoid arg limit
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    // 使用 apply + 分块，避免 String.fromCharCode 对超长数组产生栈溢出
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ clip, onClose }) => {
  const [pdfData, setPdfData] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState<number>(1.2)
  const [inPanelFallback, setInPanelFallback] = useState<boolean>(false)

  useEffect(() => {
    loadPDFData()
  }, [clip.id])

  const loadPDFData = async () => {
    try {
      setLoading(true)
      setError(null)
      // 仅使用统一的 IndexedDB 存储读取剪藏记录与 PDF 数据
      const clipData = await clipOperations.getById<{ pdfId?: string }>(TableNames.CLIPS, clip.id)
      const pdfId = clipData?.pdfId

      if (!pdfId) {
        setError('PDF数据不存在')
        return
      }

      const pdfArrayBuffer = await pdfOperations.getPDFBinaryData(pdfId)
      if (pdfArrayBuffer) {
        const base64String = arrayBufferToBase64(pdfArrayBuffer)
        setPdfData(`data:application/pdf;base64,${base64String}`)
      } else {
        setError('PDF数据不存在')
      }
    } catch (err) {
      console.error('加载PDF数据失败:', err)
      setError('加载PDF失败')
    } finally {
      setLoading(false)
    }
  }

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF加载错误:', error)
    setError('PDF文件损坏或格式不支持')
  }

  const handleDownload = async () => {
    try {
      const dbClip = await clipOperations.getById<{ pdfId?: string }>(TableNames.CLIPS, clip.id)
      if (!dbClip) return
      const pdfId = dbClip.pdfId as string | undefined

      if (!pdfId) return
      const pdf = await pdfOperations.getPDF(pdfId)
      if (!pdf?.content) return
      const blob = new Blob([pdf.content], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdf?.fileName || `${clip.title}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('下载失败:', error)
    }
  }

  const handlePrint = () => {
    if (pdfData) {
      const printWindow = window.open(pdfData, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    }
  }

  // 侧栏兜底：当无法注入到活动标签页时，在侧栏内展示预览弹窗
  useEffect(() => {
    if (!inPanelFallback) return
    const href = chrome.runtime.getURL('styles/pdf-preview.css')
    const existing = document.getElementById('pdf-preview-styles') as HTMLLinkElement | null
    if (!existing) {
      const link = document.createElement('link')
      link.id = 'pdf-preview-styles'
      link.rel = 'stylesheet'
      link.href = href
      document.head.appendChild(link)
    }
  }, [inPanelFallback])

  // 通过chrome.tabs API在当前页面注入预览组件
   useEffect(() => {
     const injectPreview = async () => {
       try {
         // 预处理PDF数据，仅从IndexedDB转换为可用格式
         let pdfDataUrl = null
         const dbClip = await clipOperations.getById<{ pdfId?: string }>(TableNames.CLIPS, clip.id)
         if (dbClip?.pdfId) {
           const pdfArrayBuffer = await pdfOperations.getPDFBinaryData(dbClip.pdfId)
           if (pdfArrayBuffer) {
             const base64String = arrayBufferToBase64(pdfArrayBuffer)
             pdfDataUrl = `data:application/pdf;base64,${base64String}`
           }
         }
         
         console.log('PDFPreview: pdfDataUrl:', pdfDataUrl ? 'Generated' : 'null')
         // 更健壮的标签页检测
         const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
         const tab = tabs && tabs[0]
         if (!tab || !tab.id) {
           // 无法获取活动标签页，回退到侧栏内预览
           setInPanelFallback(true)
           return
         }
         if (tab.id) {
          // 内联注入样式，避免外链 CSS 资源加载失败
          const inlineCss = `
            .pdf-preview-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; animation: fadeIn 0.2s ease-out; }
            .pdf-preview-window { width:90vw; height:90vh; max-width:1200px; max-height:800px; background:#fff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); display:flex; flex-direction:column; overflow:hidden; animation: slideUp 0.3s ease-out; }
            .pdf-preview-toolbar { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; background:#fafafa; border-bottom:1px solid #e5e7eb; }
            .pdf-preview-title-section { display:flex; align-items:center; gap:12px; flex:1; }
            .pdf-preview-left-section { display:flex; align-items:center; gap:12px; }
            .pdf-preview-icon-container { width:40px; height:40px; background:#f3f4f6; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#6b7280; }
            .pdf-preview-title { font-size:16px; font-weight:600; color:#1f2937; margin:0; }
            .pdf-preview-right-section { display:flex; align-items:center; gap:8px; margin-left:16px; }
            .pdf-preview-source-link { color:#6b7280; text-decoration:none; font-size:13px; padding:4px 8px; border-radius:6px; transition:all 0.2s ease; }
            .pdf-preview-source-link:hover { color:#374151; background:#f3f4f6; }
            .pdf-preview-file-size-tag, .pdf-preview-size-tag { background:#f3f4f6; color:#6b7280; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; }
            .pdf-preview-time-tag { background:#dbeafe; color:#1e40af; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; }
            .pdf-preview-button-section { display:flex; align-items:center; gap:8px; }
            .pdf-preview-close-button { width:32px; height:32px; display:flex; align-items:center; justify-content:center; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; cursor:pointer; border-radius:8px; transition:all 0.2s ease; }
            .pdf-preview-close-button:hover { color:#1e293b; background:#f1f5f9; border-color:#cbd5e1; transform:scale(1.05); }
            .pdf-preview-content { flex:1; overflow:auto; background:#fefefe; padding:24px; }
            .pdf-preview-content-center { display:flex; justify-content:center; align-items:center; height:100%; }
            .pdf-preview-container { width:100%; height:100%; display:flex; flex-direction:column; background:#fff; border-radius:12px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border:1px solid #f1f5f9; }
            .pdf-preview-loading { display:flex; flex-direction:column; align-items:center; gap:16px; color:#64748b; font-size:14px; }
            .pdf-preview-spinner { width:32px; height:32px; border:3px solid #f1f5f9; border-top:3px solid #3b82f6; border-radius:50%; animation: spin 1s linear infinite; }
            .pdf-preview-error { display:flex; flex-direction:column; align-items:center; gap:12px; color:#dc2626; font-size:14px; text-align:center; }
            .pdf-preview-canvas { max-width:100%; max-height:100%; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); border-radius:8px; border:1px solid #e2e8f0; }
            @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
            @keyframes slideUp { from { opacity:0; transform: translateY(20px) scale(0.95); } to { opacity:1; transform: translateY(0) scale(1); } }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (cssText) => {
              if (!document.getElementById('pdf-preview-inline-styles')) {
                const style = document.createElement('style')
                style.id = 'pdf-preview-inline-styles'
                style.textContent = cssText
                document.head.appendChild(style)
              }
            },
            args: [inlineCss]
          })

          // 注入本地 pdf.js，并设置 workerSrc（无需联网）
          const pdfJsLibUrl = chrome.runtime.getURL('assets/pdfjs/pdf.min.js')
          const pdfJsWorkerUrl = chrome.runtime.getURL('assets/pdfjs/pdf.worker.min.js')
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (libUrl, workerUrl) => {
              let script = document.getElementById('pdfjs-lib') as HTMLScriptElement | null
              const onLoad = () => {
                const w: any = window as any
                if (w.pdfjsLib && w.pdfjsLib.GlobalWorkerOptions) {
                  try { w.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl } catch {}
                }
              }
              if (!script) {
                script = document.createElement('script')
                script.id = 'pdfjs-lib'
                script.src = libUrl
                script.addEventListener('load', onLoad, { once: true })
                document.head.appendChild(script)
              } else {
                script.addEventListener('load', onLoad, { once: true })
              }
            },
            args: [pdfJsLibUrl, pdfJsWorkerUrl]
          })

          // 使用 pdf.js 在页面内 Canvas 自渲染，完全离线
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (clip, pdfDataUrl, sizeText, timeText, workerUrl) => {
              // 移除已存在的预览
              const existing = document.getElementById('pdf-preview-overlay')
              if (existing) {
                existing.remove()
              }
              
              // 创建预览覆盖层
              const overlay = document.createElement('div')
              overlay.id = 'pdf-preview-overlay'
              overlay.className = 'pdf-preview-overlay'
              
              // 创建预览窗口
              const previewWindow = document.createElement('div')
              previewWindow.className = 'pdf-preview-window'
              
              // 创建顶部工具栏
              const toolbar = document.createElement('div')
              toolbar.className = 'pdf-preview-toolbar'
              
              const titleSection = document.createElement('div')
              titleSection.className = 'pdf-preview-title-section'
              
              const leftSection = document.createElement('div')
              leftSection.className = 'pdf-preview-left-section'
              
              const iconContainer = document.createElement('div')
              iconContainer.className = 'pdf-preview-icon-container'
              iconContainer.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10,9 9,9 8,9"/>
                </svg>
              `
              
              const title = document.createElement('h3')
              title.textContent = clip.title
              title.className = 'pdf-preview-title'
              
              leftSection.appendChild(iconContainer)
              leftSection.appendChild(title)
              
              const rightSection = document.createElement('div')
              rightSection.className = 'pdf-preview-right-section'
              
              // 来源链接
              const sourceLink = document.createElement('a')
              sourceLink.href = clip.url
              sourceLink.target = '_blank'
              sourceLink.textContent = '查看来源'
              sourceLink.className = 'pdf-preview-source-link'
              
              // 文件大小标签
              const sizeTag = document.createElement('span')
              sizeTag.textContent = sizeText
              sizeTag.className = 'pdf-preview-size-tag'
              
              // 时间标签
              const timeTag = document.createElement('span')
              timeTag.textContent = timeText
              timeTag.className = 'pdf-preview-time-tag'
              
              rightSection.appendChild(sourceLink)
              rightSection.appendChild(sizeTag)
              rightSection.appendChild(timeTag)
              
              titleSection.appendChild(leftSection)
              titleSection.appendChild(rightSection)
              
              const buttonSection = document.createElement('div')
              buttonSection.className = 'pdf-preview-button-section'
              
              const closeButton = document.createElement('button')
              closeButton.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m18 6-12 12"/>
                  <path d="m6 6 12 12"/>
                </svg>
              `
              closeButton.className = 'pdf-preview-close-button'
              closeButton.onclick = () => {
                 overlay.remove()
                 // 通知React组件预览已关闭
                 window.postMessage({ type: 'PDF_PREVIEW_CLOSED' }, '*')
               }
              closeButton.title = '关闭'
              
              buttonSection.appendChild(closeButton)
              
              toolbar.appendChild(titleSection)
              toolbar.appendChild(buttonSection)
              
              // 创建内容区域
              const content = document.createElement('div')
              content.className = 'pdf-preview-content'
              
              const contentCenter = document.createElement('div')
              contentCenter.className = 'pdf-preview-content-center'
              
              // 创建PDF渲染容器（Canvas）
              const pdfContainer = document.createElement('div')
              pdfContainer.className = 'pdf-preview-container'
              const canvas = document.createElement('canvas')
              canvas.className = 'pdf-preview-canvas'
              pdfContainer.appendChild(canvas)

              const renderWithPdfJs = async () => {
                try {
                  const w: any = window as any
                  if (!w.pdfjsLib || !pdfDataUrl) {
                    pdfContainer.innerHTML = `<div style="text-align: center; padding: 80px 48px; background: #fafbfc; border-radius: 16px; margin: 24px;">
                      <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">PDF库未加载或数据为空</h2>
                      <p style="color: #64748b;">请稍后重试</p>
                    </div>`
                    return
                  }
                  try { w.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl } catch {}
                  const loadingTask = w.pdfjsLib.getDocument({ url: pdfDataUrl })
                  const pdf = await loadingTask.promise
                  const page = await pdf.getPage(1)
                  const scale = 1.2
                  const viewport = page.getViewport({ scale })
                  const ctx = canvas.getContext('2d')!
                  canvas.width = viewport.width
                  canvas.height = viewport.height
                  await page.render({ canvasContext: ctx, viewport }).promise
                } catch (err) {
                  pdfContainer.innerHTML = `<div style="text-align: center; padding: 80px 48px; background: #fff1f2; border-radius: 16px; margin: 24px;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #881337;">PDF渲染失败</h2>
                    <p style="color: #be123c;">${(err && (err as any).message) || '未知错误'}</p>
                  </div>`
                }
              }

              // 若 pdfjs 尚未加载，等待脚本 load 后再渲染
              if ((window as any).pdfjsLib) {
                renderWithPdfJs()
              } else {
                const script = document.getElementById('pdfjs-lib')
                if (script) {
                  script.addEventListener('load', () => renderWithPdfJs(), { once: true })
                } else {
                  // 极端兜底：提示稍后重试
                  pdfContainer.innerHTML = `<div style="text-align: center; padding: 80px 48px; background: #fafbfc; border-radius: 16px; margin: 24px;">
                    <p style="color: #64748b;">正在加载 PDF 预览库…</p>
                  </div>`
                }
              }
              
              contentCenter.appendChild(pdfContainer)
              content.appendChild(contentCenter)
              
              previewWindow.appendChild(toolbar)
              previewWindow.appendChild(content)
              
              overlay.appendChild(previewWindow)
              
              // 点击背景关闭
               overlay.onclick = (e) => {
                 if (e.target === overlay) {
                   overlay.remove()
                   // 通知React组件预览已关闭
                   window.postMessage({ type: 'PDF_PREVIEW_CLOSED' }, '*')
                 }
               }
              
              // 阻止预览窗口点击事件冒泡
              previewWindow.onclick = (e) => {
                e.stopPropagation()
              }
              
              document.body.appendChild(overlay)
            },
            args: [clip, pdfDataUrl, formatFileSize(clip.size), formatDate(clip.timestamp), pdfJsWorkerUrl]
          })
        }
      } catch (error) {
        console.error('Failed to inject preview:', error)
        // 注入失败时兜底到侧栏预览
        setInPanelFallback(true)
      }
     }

     injectPreview()
     
     // 清理函数：当组件卸载时移除预览
     return () => {
       chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
         if (tab.id) {
           chrome.scripting.executeScript({
             target: { tabId: tab.id },
             func: () => {
               const existing = document.getElementById('pdf-preview-overlay')
               if (existing) {
                 existing.remove()
               }
             }
           }).catch(() => {}) // 忽略错误，可能页面已关闭
         }
       }).catch(() => {}) // 忽略错误
     }
   }, [clip])
   
   // 监听来自注入脚本的关闭消息
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'PDF_PREVIEW_CLOSED') {
          onClose()
        }
      }
      
      window.addEventListener('message', handleMessage)
      
      return () => {
        window.removeEventListener('message', handleMessage)
      }
    }, [onClose])
   
   // 兜底：在侧栏内渲染预览弹窗（当无法注入到活动页面时）
   if (inPanelFallback) {
     const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
       if (e.currentTarget === e.target) {
         onClose()
       }
     }
     return (
       <div id="pdf-preview-overlay" className="pdf-preview-overlay" onClick={handleOverlayClick}>
         <div className="pdf-preview-window" onClick={(e) => e.stopPropagation()}>
           <div className="pdf-preview-toolbar">
             <div className="pdf-preview-title-section">
               <div className="pdf-preview-left-section">
                 <div className="pdf-preview-icon-container">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                     <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
                     <polyline points="14,2 14,8 20,8"/>
                   </svg>
                 </div>
                 <h3 className="pdf-preview-title">{clip.title}</h3>
               </div>
             </div>
             <div className="pdf-preview-button-section">
               <button className="pdf-preview-close-button" onClick={onClose} title="关闭">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <path d="m18 6-12 12"/>
                   <path d="m6 6 12 12"/>
                 </svg>
               </button>
             </div>
           </div>
           <div className="pdf-preview-content">
             <div className="pdf-preview-content-center">
               <div className="pdf-preview-container">
                 {pdfData ? (
                    <iframe
                     src={pdfData}
                     allow="fullscreen"
                     allowFullScreen
                     style={{ width: '100%', height: '100%', border: 0, background: 'white' }}
                   />
                 ) : (
                   <div style={{ textAlign: 'center', padding: '80px 48px', background: '#fafbfc', borderRadius: 16, margin: 24 }}>
                     <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px' }}>
                       <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                         <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
                         <polyline points="14,2 14,8 20,8"/>
                       </svg>
                     </div>
                     <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16, color: '#1e293b', letterSpacing: '-0.025em' }}>PDF预览</h2>
                     <p style={{ color: '#64748b', fontSize: 18, lineHeight: 1.6 }}>PDF文档正在加载中，请稍候...</p>
                   </div>
                 )}
               </div>
             </div>
           </div>
         </div>
       </div>
     )
   }

   // 默认返回 null（成功注入到活动页面）
   return null
}

export default PDFPreview