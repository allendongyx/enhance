import React, { useState, useEffect } from 'react'
import { clipOperations, TableNames, pdfOperations } from '../lib/database'
import type { ClipItem } from '../lib/types'

interface DragDropPDFProps {
  clip: ClipItem
  onDragStart?: () => void
  onDragEnd?: () => void
  children?: React.ReactNode
  className?: string
  onClick?: () => void
  title?: string
}

const DragDropPDF: React.FC<DragDropPDFProps> = ({ 
  clip, 
  onDragStart, 
  onDragEnd, 
  children, 
  className, 
  onClick, 
  title 
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  // 创建临时下载URL
  const createDownloadUrl = async () => {
    try {
      let pdfId = clip.pdfId
      if (!pdfId) {
        const dbClip = await clipOperations.getById<any>(TableNames.CLIPS, clip.id)
        pdfId = dbClip?.pdfId
      }
      if (!pdfId) return null
      const tempUrl = await pdfOperations.createTempDownloadURL(pdfId)
      return tempUrl
    } catch (error) {
      console.error('Failed to create download URL:', error)
      return null
    }
  }

  // 处理拖拽开始
  const handleDragStart = async (e: React.DragEvent) => {
    setIsDragging(true)
    onDragStart?.()

    try {
      // 创建临时下载URL
      const url = await createDownloadUrl()
      if (url) {
        setDownloadUrl(url)
        
        // 设置拖拽数据
        // 优先使用 pdf 元数据中的文件名，其次回退为标题.pdf
        let fileName = `${clip.title}.pdf`
        try {
          let pdfId = clip.pdfId
          if (!pdfId) {
            const dbClip = await clipOperations.getById<any>(TableNames.CLIPS, clip.id)
            pdfId = dbClip?.pdfId
          }
          if (pdfId) {
            const meta = await pdfOperations.getPDF(pdfId)
            if (meta?.fileName) fileName = meta.fileName
          }
        } catch {}
        
        // 设置下载URL和文件名
        e.dataTransfer.setData('DownloadURL', `application/pdf:${fileName}:${url}`)
        e.dataTransfer.setData('text/uri-list', url)
        e.dataTransfer.setData('text/plain', url)
        
        // 设置拖拽效果
        e.dataTransfer.effectAllowed = 'copy'
        
        // 创建拖拽预览图像
        const dragImage = document.createElement('div')
        dragImage.style.cssText = `
          position: absolute;
          top: -1000px;
          left: -1000px;
          width: 200px;
          height: 60px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
        `
        
        dragImage.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          <div>
            <div style="font-weight: 600; margin-bottom: 2px;">${clip.title}</div>
            <div style="opacity: 0.8; font-size: 12px;">${Math.round(clip.size / 1024)} KB</div>
          </div>
        `
        
        document.body.appendChild(dragImage)
        e.dataTransfer.setDragImage(dragImage, 100, 30)
        
        // 清理拖拽图像
        setTimeout(() => {
          document.body.removeChild(dragImage)
        }, 0)
      }
    } catch (error) {
      console.error('Failed to setup drag data:', error)
    }
  }

  // 处理拖拽结束
  const handleDragEnd = () => {
    setIsDragging(false)
    onDragEnd?.()
    
    // 清理临时URL
    if (downloadUrl) {
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl)
        setDownloadUrl(null)
      }, 1000) // 延迟清理，确保拖拽完成
    }
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      className={`cursor-grab active:cursor-grabbing select-none ${className || ''}`}
      title={title}
    >
      {children}
    </div>
  )
}

export default DragDropPDF