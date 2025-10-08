/**
 * PDF存储管理模块（委托到统一 Dexie 数据库）
 * 依赖 lib/database/index.ts 的 pdfOperations，以保证插件只访问一个 DB。
 */

// 显式到目录的 index，避免某些打包器对目录解析异常
import { pdfOperations, type PDFDoc, type PDFFile } from './database/index'

export interface PDFStorageItem extends PDFDoc {}
export interface PDFMetadata extends PDFFile {}

class PDFStorageManager {
  async init(): Promise<void> {
  }

  async storePDF(item: Omit<PDFStorageItem, 'createdAt' | 'updatedAt'>): Promise<string> {
    return pdfOperations.storePDF(item)
  }

  async getPDF(id: string): Promise<PDFStorageItem | null> {
    return pdfOperations.getPDF(id)
  }

  async getPDFMetadata(id: string): Promise<PDFMetadata | null> {
    const item = await pdfOperations.getPDF(id)
    if (!item) return null
    const { content, ...meta } = item
    return meta
  }

  async getAllPDFMetadata(): Promise<PDFMetadata[]> {
    return pdfOperations.getAllPDFMetadata()
  }

  async deletePDF(id: string): Promise<void> {
    return pdfOperations.delete('pdfs' as any, id)
  }

  async updatePDFMetadata(id: string, updates: Partial<Pick<PDFStorageItem, 'title' | 'tags'>>): Promise<void> {
    return pdfOperations.updateMetadata(id, updates)
  }

  async getStorageUsage(): Promise<{ totalSize: number; itemCount: number }> {
    const list = await pdfOperations.getAllPDFMetadata()
    const totalSize = list.reduce((sum, i) => sum + (i.size || 0), 0)
    return { totalSize, itemCount: list.length }
  }

  async createTempDownloadURL(id: string): Promise<string> {
    return pdfOperations.createTempDownloadURL(id)
  }

  async clearAll(): Promise<void> {
    return pdfOperations.clearAllPDFs()
  }
}

export const pdfStorage = new PDFStorageManager()

export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}