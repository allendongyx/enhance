/**
 * PDF存储管理模块（使用OPFS存储PDF二进制数据）
 * 元数据仍使用IndexedDB存储，二进制数据使用OPFS存储
 */

import { clipOperations, TableNames } from './database/index'
import { opfsStorage, isOPFSSupported, type OPFSStorageInfo } from './opfsStorage'

export interface PDFMetadata {
  id: string
  title: string
  fileName?: string
  url: string
  size: number
  createdAt: number
  updatedAt: number
  tags?: string[]
}

class PDFStorageManager {
  async init(): Promise<void> {
    // 初始化OPFS存储
    if (isOPFSSupported()) {
      await opfsStorage.init()
    } else {
      console.warn('[PDFStorage] OPFS不支持，将无法存储PDF文件')
    }
  }

  /**
   * 存储PDF文件（仅存储二进制数据到OPFS）
   * @param pdfId PDF唯一标识符
   * @param arrayBuffer PDF二进制数据
   */
  async storePDF(pdfId: string, arrayBuffer: ArrayBuffer): Promise<void> {
    if (!isOPFSSupported()) {
      throw new Error('OPFS不支持，无法存储PDF文件')
    }
    
    await opfsStorage.storePDF(pdfId, arrayBuffer)
  }

  /**
   * 获取PDF二进制数据
   * @param pdfId PDF唯一标识符
   */
  async getPDFBinaryData(pdfId: string): Promise<ArrayBuffer | null> {
    if (!isOPFSSupported()) {
      console.warn('[PDFStorage] OPFS不支持，无法读取PDF文件')
      return null
    }
    
    return await opfsStorage.getPDF(pdfId)
  }

  /**
   * 删除PDF文件
   * @param pdfId PDF唯一标识符
   */
  async deletePDF(pdfId: string): Promise<void> {
    if (isOPFSSupported()) {
      await opfsStorage.deletePDF(pdfId)
    }
  }

  /**
   * 检查PDF文件是否存在
   * @param pdfId PDF唯一标识符
   */
  async exists(pdfId: string): Promise<boolean> {
    if (!isOPFSSupported()) {
      return false
    }
    
    return await opfsStorage.exists(pdfId)
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<{ totalSize: number; itemCount: number }> {
    if (!isOPFSSupported()) {
      return { totalSize: 0, itemCount: 0 }
    }
    
    const info = await opfsStorage.getStorageInfo()
    return {
      totalSize: info.totalSize,
      itemCount: info.fileCount
    }
  }

  /**
   * 创建临时下载URL
   * @param pdfId PDF唯一标识符
   */
  async createTempDownloadURL(pdfId: string): Promise<string> {
    if (!isOPFSSupported()) {
      throw new Error('OPFS不支持，无法创建下载URL')
    }
    
    return await opfsStorage.createTempDownloadURL(pdfId)
  }

  /**
   * 清空所有PDF文件
   */
  async clearAll(): Promise<void> {
    if (isOPFSSupported()) {
      await opfsStorage.clearAll()
    }
  }
}

export const pdfStorage = new PDFStorageManager()

export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}