import { Readability } from "@mozilla/readability"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"
// 注意：内容脚本不直接写入 IndexedDB（会写到页面域下），改为通过后台脚本持久化到扩展域
import JSZip from "jszip"
import { Check, X } from "lucide-react"
import "../style.css"

// 消息类型定义
interface ClipMessage {
  action: "clipPage"
  mode: 'smart' | 'fullpage' | 'manual'
}

interface ClipResponse {
  success: boolean
  message: string
  data?: {
    title: string
    url: string
    content: string
    timestamp: number
    id: string
  }
}

interface SelectionState {
  isSelecting: boolean
  startX: number
  startY: number
  endX: number
  endY: number
  overlay?: HTMLElement
  selectionBox?: HTMLElement
}

// 内容提取和PDF生成类
class ContentClipper {
  private selectionState: SelectionState = {
    isSelecting: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0
  }
  private async extractContent(): Promise<{
    title: string
    content: string
    textContent: string
  }> {
    // 克隆文档以避免修改原始页面
    const documentClone = document.cloneNode(true) as Document
    
    // 使用 Readability 提取主要内容
    const reader = new Readability(documentClone)
    const article = reader.parse()
    
    if (!article) {
      throw new Error("无法提取页面内容")
    }
    
    return {
      title: article.title || document.title || "未命名页面",
      content: article.content,
      textContent: article.textContent
    }
  }
  
  private async generatePDF(title: string, content: string): Promise<Blob> {
    // 创建临时容器用于渲染内容
    const container = document.createElement('div')
    container.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: 800px;
      padding: 40px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      background: white;
    `
    
    // 添加标题和内容
    container.innerHTML = `
      <div style="margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px;">
        <h1 style="font-size: 24px; font-weight: bold; margin: 0; color: #1a1a1a;">${title}</h1>
        <div style="margin-top: 10px; font-size: 12px; color: #666;">
          <div>来源: ${window.location.href}</div>
          <div>剪藏时间: ${new Date().toLocaleString('zh-CN')}</div>
        </div>
      </div>
      <div style="font-size: 14px; line-height: 1.8;">${content}</div>
    `
    
    document.body.appendChild(container)
    
    try {
      // 使用 html2canvas 将内容转换为图片
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: false, // 禁用CORS以避免跨域图片问题
        allowTaint: true,
        ignoreElements: (el) => {
          // 忽略可能导致问题的元素
          const tagName = el.tagName?.toLowerCase()
          return tagName === 'script' || tagName === 'noscript'
        },
        onclone: (clonedDoc) => {
          // 移除所有外部图片以避免CORS问题
          const images = clonedDoc.querySelectorAll('img')
          images.forEach(img => {
            const src = img.getAttribute('src')
            if (src && (src.startsWith('http') && !src.includes(window.location.hostname))) {
              img.style.display = 'none'
            }
          })
        },
        backgroundColor: '#ffffff',
        width: 800,
        windowWidth: 800
      })
      
      // 创建 PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })
      
      const imgWidth = 210 // A4 宽度 (mm)
      const pageHeight = 295 // A4 高度 (mm)
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      
      // 添加第一页
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.8),
        'JPEG',
        0,
        position,
        imgWidth,
        imgHeight
      )
      heightLeft -= pageHeight
      
      // 如果内容超过一页，添加更多页面
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(
          canvas.toDataURL('image/jpeg', 0.8),
          'JPEG',
          0,
          position,
          imgWidth,
          imgHeight
        )
        heightLeft -= pageHeight
      }
      
      // 转换为 Blob
      const pdfBlob = pdf.output('blob')
      return pdfBlob
      
    } finally {
      // 清理临时容器
      document.body.removeChild(container)
    }
  }
  
  private async generateFullPagePDF(): Promise<Blob> {
    // 截取整个页面
    const canvas = await html2canvas(document.body, {
      scale: 1,
      useCORS: false, // 禁用CORS以避免跨域图片问题
      allowTaint: true,
      ignoreElements: (element) => {
        // 忽略可能导致问题的元素
        const tagName = element.tagName?.toLowerCase()
        return tagName === 'script' || tagName === 'noscript' || tagName === 'style'
      },
      onclone: (clonedDoc) => {
         // 完全移除所有样式表以避免CSS解析问题
         const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]')
         styles.forEach(style => style.remove())
         
         // 移除所有内联样式属性中的现代CSS函数
         const elementsWithStyle = clonedDoc.querySelectorAll('[style]')
         elementsWithStyle.forEach(el => {
           const style = el.getAttribute('style') || ''
           if (style.includes('lab(') || style.includes('lch(') || style.includes('oklab(') || style.includes('oklch(')) {
             el.removeAttribute('style')
           }
         })
         
         // 移除所有外部图片以避免CORS问题
         const images = clonedDoc.querySelectorAll('img')
         images.forEach(img => {
           const src = img.getAttribute('src')
           if (src && (src.startsWith('http') && !src.includes(window.location.hostname))) {
             img.style.display = 'none'
           }
         })
       },
      height: document.body.scrollHeight,
      width: document.body.scrollWidth,
      backgroundColor: '#ffffff'
    })
    
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4'
    })
    
    const imgWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.8),
      'JPEG',
      0,
      0,
      imgWidth,
      imgHeight
    )
    
    return pdf.output('blob')
  }
  
  private async generateElementPDF(element: Element): Promise<Blob> {
    // 截取选中的元素
    const canvas = await html2canvas(element as HTMLElement, {
      scale: 2,
      useCORS: false, // 禁用CORS以避免跨域图片问题
      allowTaint: true,
      ignoreElements: (el) => {
        // 忽略可能导致问题的元素
        const tagName = el.tagName?.toLowerCase()
        return tagName === 'script' || tagName === 'noscript' || tagName === 'style'
      },
      onclone: (clonedDoc) => {
         // 完全移除所有样式表以避免CSS解析问题
         const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]')
         styles.forEach(style => style.remove())
         
         // 移除所有内联样式属性中的现代CSS函数
         const elementsWithStyle = clonedDoc.querySelectorAll('[style]')
         elementsWithStyle.forEach(el => {
           const style = el.getAttribute('style') || ''
           if (style.includes('lab(') || style.includes('lch(') || style.includes('oklab(') || style.includes('oklch(')) {
             el.removeAttribute('style')
           }
         })
         
         // 移除所有外部图片以避免CORS问题
         const images = clonedDoc.querySelectorAll('img')
         images.forEach(img => {
           const src = img.getAttribute('src')
           if (src && (src.startsWith('http') && !src.includes(window.location.hostname))) {
             img.style.display = 'none'
           }
         })
       },
      backgroundColor: '#ffffff'
    })
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })
    
    const imgWidth = 210 // A4宽度
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.8),
      'JPEG',
      0,
      0,
      imgWidth,
      imgHeight
    )
    
    return pdf.output('blob')
  }
  
  private async startManualSelection(): Promise<Element | null> {
    return new Promise((resolve) => {
      this.selectionState.isSelecting = true
      
      // 创建半透明遮罩层
      const overlay = document.createElement('div')
      overlay.className = 'fixed inset-0 bg-black/30 z-[1000001] cursor-crosshair pointer-events-none'
      
      // 创建高亮选择框
      const highlightBox = document.createElement('div')
      highlightBox.className = 'absolute border-4 border-blue-500 bg-blue-500/10 z-[1000002] hidden pointer-events-none shadow-[0_0_10px_rgba(0,123,255,0.5)] transition-all'
      
      // 创建信息提示框
      const infoBox = document.createElement('div')
      infoBox.className = 'fixed top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-md border-2 border-blue-700 text-sm z-[1000003] shadow'
      infoBox.textContent = '点击鼠标左键确认剪藏内容，按ESC键退出'
      
      // 创建控制按钮容器
      const controls = document.createElement('div')
      controls.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[1000003] hidden gap-3 bg-white/95 p-3 rounded-lg shadow pointer-events-auto flex'
      
      // 创建确认剪藏按钮（初始隐藏）
      const confirmBtn = document.createElement('button')
      confirmBtn.className = 'hidden inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-700'
      confirmBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><polyline points="20,6 9,17 4,12"></polyline></svg><span>确认剪藏</span>`
      
      // 创建取消按钮（初始状态下隐藏）
      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'hidden inline-flex items-center px-4 py-2 bg-slate-600 text-white rounded-md text-sm font-medium transition hover:bg-slate-700'
      cancelBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>取消</span>`
      
      controls.appendChild(confirmBtn)
      controls.appendChild(cancelBtn)
      
      // 添加到页面
      document.body.appendChild(overlay)
      document.body.appendChild(highlightBox)
      document.body.appendChild(infoBox)
      document.body.appendChild(controls)
      
      let selectedElement: Element | null = null
      let currentHighlightedElement: Element | null = null
      let selectionState: 'selecting' | 'selected' | 'processing' = 'selecting'
      
      // 获取合适的选择元素（避免选择过小的元素）
      const getSelectableElement = (element: Element): Element => {
        const rect = element.getBoundingClientRect()
        if (rect.width < 50 || rect.height < 20) {
          const parent = element.parentElement
          if (parent && parent !== document.body && parent !== document.documentElement) {
            return getSelectableElement(parent)
          }
        }
        
        const tagName = element.tagName.toLowerCase()
        if (['html', 'body', 'head', 'script', 'style', 'meta', 'link'].includes(tagName)) {
          const parent = element.parentElement
          if (parent && parent !== document.body && parent !== document.documentElement) {
            return getSelectableElement(parent)
          }
        }
        
        return element
      }
      
      // 鼠标移动事件处理
      const handleMouseMove = (e: MouseEvent) => {
        if (selectionState !== 'selecting') return
        
        highlightBox.classList.add('hidden')
        const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY)
        highlightBox.classList.remove('hidden')
        
        if (elementUnderMouse && 
            elementUnderMouse !== overlay && 
            elementUnderMouse !== highlightBox &&
            elementUnderMouse !== infoBox &&
            elementUnderMouse !== controls &&
            !controls.contains(elementUnderMouse) &&
            !infoBox.contains(elementUnderMouse)) {
          
          const targetElement = getSelectableElement(elementUnderMouse)
          
          if (targetElement !== currentHighlightedElement) {
            currentHighlightedElement = targetElement
            selectedElement = targetElement
            
            const rect = targetElement.getBoundingClientRect()
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft
            
            highlightBox.classList.remove('hidden')
            highlightBox.style.left = (rect.left + scrollLeft) + 'px'
            highlightBox.style.top = (rect.top + scrollTop) + 'px'
            highlightBox.style.width = rect.width + 'px'
            highlightBox.style.height = rect.height + 'px'
          }
        }
      }
      
      // 点击事件处理（确认选择）
      const handleClick = (e: MouseEvent) => {
        if (selectionState !== 'selecting') return
        
        e.preventDefault()
        e.stopPropagation()
        
        if (selectedElement) {
          selectionState = 'selected'
          
          // 固化高亮边框（改用类名切换）
          highlightBox.classList.remove('border-blue-500', 'bg-blue-500/10')
          highlightBox.classList.add('border-emerald-600', 'bg-emerald-500/10')
          
          // 更新信息提示
           infoBox.textContent = '已选中元素，点击"确认剪藏"按钮开始剪藏'
           infoBox.classList.remove('bg-blue-600', 'border-blue-700')
           infoBox.classList.add('bg-emerald-600', 'border-emerald-700')
          
          // 显示控制按钮容器和按钮
          controls.classList.remove('hidden')
          confirmBtn.classList.remove('hidden')
          cancelBtn.classList.remove('hidden')
          
          // 移除鼠标移动监听
          document.removeEventListener('mousemove', handleMouseMove)
        }
      }
      
      // 显示成功提示
      const showSuccessMessage = () => {
        const successMsg = document.createElement('div')
        successMsg.className = 'fixed top-5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium z-[1000003] shadow'
        successMsg.textContent = '剪藏成功'
        document.body.appendChild(successMsg)
        
        setTimeout(() => {
          if (document.body.contains(successMsg)) {
            document.body.removeChild(successMsg)
          }
        }, 3000)
      }
      
      // 清理函数
      const cleanup = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('click', handleClick, true)
        document.removeEventListener('keydown', handleKeyDown)
        
        if (document.body.contains(overlay)) document.body.removeChild(overlay)
        if (document.body.contains(highlightBox)) document.body.removeChild(highlightBox)
        if (document.body.contains(infoBox)) document.body.removeChild(infoBox)
        if (document.body.contains(controls)) document.body.removeChild(controls)
        
        this.selectionState.isSelecting = false
      }
      
      // 重置到初始状态
      const resetToInitialState = () => {
        selectionState = 'selecting'
        selectedElement = null
        currentHighlightedElement = null
        
        // 重置UI（类名切换恢复初始样式）
        highlightBox.classList.add('hidden')
        highlightBox.classList.remove('border-emerald-600', 'bg-emerald-500/10')
        highlightBox.classList.add('border-blue-500', 'bg-blue-500/10')
        
        infoBox.textContent = '点击鼠标左键确认剪藏内容，按ESC键退出'
        infoBox.classList.remove('bg-emerald-600', 'border-emerald-700')
        infoBox.classList.add('bg-blue-600', 'border-blue-700')
        
        // 隐藏整个控制按钮容器
        controls.classList.add('hidden')
        confirmBtn.classList.add('hidden')
        confirmBtn.disabled = false
        confirmBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><polyline points="20,6 9,17 4,12"></polyline></svg><span>确认剪藏</span>`
        cancelBtn.classList.add('hidden')
        
        // 重新绑定鼠标移动事件
        document.addEventListener('mousemove', handleMouseMove)
      }
      
      // 键盘事件处理
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cleanup()
          resolve(null)
        }
      }
      
      // 确认剪藏按钮点击事件
      confirmBtn.addEventListener('click', async (e: MouseEvent) => {
        // 阻止事件冒泡和默认行为
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        
        if (selectionState !== 'selected' || !selectedElement) return
        
        selectionState = 'processing'
        
        // 显示loading状态
        confirmBtn.disabled = true
        confirmBtn.innerHTML = `<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span><span>剪藏中...</span>`
        confirmBtn.classList.add('bg-slate-600')
        
        try {
          // 执行剪藏操作
          cleanup()
          showSuccessMessage()
          resolve(selectedElement)
        } catch (error) {
          // 如果剪藏失败，重置状态
          resetToInitialState()
        }
      })
      
      // 取消按钮点击事件
      cancelBtn.addEventListener('click', (e: MouseEvent) => {
        // 阻止事件冒泡和默认行为，防止触发全局点击事件
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        
        if (selectionState === 'selected') {
          // 如果已选中，回到初始状态
          resetToInitialState()
        } else {
          // 如果未选中，直接取消
          cleanup()
          resolve(null)
        }
      })
      
      // 绑定事件
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('click', handleClick, true)
      document.addEventListener('keydown', handleKeyDown)
    })
  }
  
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
  
  public async clipPage(mode: 'smart' | 'fullpage' | 'manual' = 'smart'): Promise<ClipResponse> {
    try {
      console.log('[ContentClipper] 开始剪藏，mode=', mode, 'url=', window.location.href)
      let title: string
      let content: string
      let textContent: string
      let pdfBlob: Blob
      
      switch (mode) {
        case 'smart':
          console.log('[ContentClipper] 使用智能提取模式')
          const extracted = await this.extractContent()
          title = extracted.title
          content = extracted.content
          textContent = extracted.textContent
          pdfBlob = await this.generatePDF(title, content)
          console.log('[ContentClipper] 智能提取完成，titleLen=', title?.length || 0, 'textLen=', textContent?.length || 0)
          break
          
        case 'fullpage':
          console.log('[ContentClipper] 使用整页模式')
          title = document.title
          content = document.documentElement.outerHTML
          textContent = document.body.textContent || ''
          pdfBlob = await this.generateFullPagePDF()
          console.log('[ContentClipper] 整页生成完成，titleLen=', title?.length || 0, 'textLen=', textContent?.length || 0)
          break
          
        case 'manual':
          console.log('[ContentClipper] 使用手动选择模式，等待用户选择')
          const selectedElement = await this.startManualSelection()
          if (!selectedElement) {
            return { success: false, message: '未选择任何区域' }
          }
          title = document.title
          content = selectedElement.outerHTML
          textContent = selectedElement.textContent || ''
          pdfBlob = await this.generateElementPDF(selectedElement)
          console.log('[ContentClipper] 手动选择完成，titleLen=', title?.length || 0, 'textLen=', textContent?.length || 0)
          break
          
        default:
          throw new Error('不支持的提取模式')
      }
      
      // 生成唯一ID和文件名
      const clipId = this.generateId()
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '').substring(0, 50)
      const fileName = `${sanitizedTitle}_${clipId}.pdf`
      console.log('[ContentClipper] 生成文件名：', fileName)
      
      // 将PDF保存到本地文件系统
      const arrayBuffer = await pdfBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      console.log('[ContentClipper] PDF生成完成，大小(bytes)=', arrayBuffer.byteLength)
      
      // 通过 background script 保存文件
      const downloadResult = await new Promise<{ success: boolean, pdfId?: string, fileName?: string, error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'downloadPDF',
          data: {
            pdfData: Array.from(uint8Array),
            fileName: fileName
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[ContentClipper] downloadPDF 消息错误：', chrome.runtime.lastError.message)
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            console.log('[ContentClipper] downloadPDF 返回：', response)
            resolve(response)
          }
        })
      })
      
      if (!downloadResult.success) {
        console.error('[ContentClipper] PDF下载/保存失败：', downloadResult.error)
        throw new Error(downloadResult.error || '文件下载失败')
      }
      
      const pdfId = downloadResult.pdfId
      console.log('[ContentClipper] PDF 保存成功，pdfId=', pdfId)
      
      // 组装剪藏数据
      const clipData = {
        id: clipId,
        title,
        url: window.location.href,
        content: textContent.substring(0, 500),
        size: pdfBlob.size,
        pdfId
      }
      console.log('[ContentClipper] 准备保存剪藏：', { id: clipData.id, title: clipData.title, url: clipData.url, size: clipData.size, pdfId: clipData.pdfId, contentPreviewLen: clipData.content.length })

      // 通过后台脚本写入统一的 IndexedDB（扩展域）
      const saveResult = await new Promise<{ success: boolean; id?: string; error?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveClip', data: clipData }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[ContentClipper] saveClip 消息错误：', chrome.runtime.lastError.message)
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            console.log('[ContentClipper] saveClip 返回：', response)
            resolve(response)
          }
        })
      })

      if (!saveResult.success) {
        console.error('[ContentClipper] 写入数据库失败：', saveResult.error)
        throw new Error(saveResult.error || '写入数据库失败')
      }
      
      console.log('[ContentClipper] 剪藏完成，clipId=', clipData.id)
      return {
        success: true,
        message: "页面剪藏成功！",
        data: {
          id: clipData.id,
          title: clipData.title,
          url: clipData.url,
          content: clipData.content,
          timestamp: Date.now()
        }
      }
      
    } catch (error) {
      console.error('剪藏失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : "剪藏失败，请重试"
      }
    }
  }
}

// 创建剪藏器实例
const clipper = new ContentClipper()

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(
  (message: ClipMessage, sender, sendResponse) => {
    if (message.action === "clipPage") {
      clipper.clipPage(message.mode).then(sendResponse)
      return true // 保持消息通道开放以支持异步响应
    }
  }
)

// 导出供其他模块使用
export { ContentClipper }
export type { ClipMessage, ClipResponse }