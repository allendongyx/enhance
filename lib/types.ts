// Shared types for GPT-Enhance

export interface ClipItem {
  id: string
  title: string
  url: string
  content: string
  timestamp: number
  size: number
  tags?: string[]
  summary?: string
  pdfId?: string
}

export interface Settings {
  autoClip: boolean
  clipShortcut: string
  managerShortcut: string
  maxClips: number
  autoExport: boolean
  exportPath: string
  theme: 'light' | 'dark' | 'auto'
  language: string
  notifications: boolean
  contextMenu: boolean
}

export interface StorageInfo {
  clipCount: number
  totalSize: number
  usedSpace: number
  maxSpace: number
}