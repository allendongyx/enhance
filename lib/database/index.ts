// Unified IndexedDB database layer for GPT-Enhance
// Provides typed schema, initialization, and common CRUD operations

// Types
export type UserSettings = {
  id: string
  autoClip?: boolean
  shortcuts?: { clip: string; manager: string }
  storage?: { maxClips: number }
  export?: { autoExport: boolean; defaultPath: string }
  appearance?: { theme: 'light' | 'dark' | 'auto'; language: string }
  notifications?: { enabled: boolean }
  contextMenu?: { enabled: boolean }
  quickEntry?: { enabled: boolean }
  createdAt: number
  updatedAt: number
}

// Align ClipItem type with shared definitions
import type { ClipItem } from '../types'
export type { ClipItem } from '../types'

export enum TableNames {
  SETTINGS = 'settings',
  CLIPS = 'clips'
  // 移除 PDF_FILES 表，PDF二进制数据现在使用OPFS存储
}

export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  autoClip: false,
  shortcuts: {
    clip: 'Command+Shift+C',
    manager: 'Command+Shift+M'
  },
  storage: {
    maxClips: 100
  },
  export: {
    autoExport: false,
    defaultPath: ''
  },
  appearance: {
    theme: 'auto',
    language: 'zh-CN'
  },
  notifications: { enabled: true },
  contextMenu: { enabled: true },
  quickEntry: { enabled: true }
}

import Dexie, { type Table } from 'dexie'

class AppDB extends Dexie {
  settings!: Table<UserSettings, string>
  clips!: Table<ClipItem, string>
  // 移除 pdfs 表定义

  constructor() {
    super('gpt-enhance-db')
    // v1: 初始 settings 与 clips
    this.version(1).stores({
      [TableNames.SETTINGS]: '&id,updatedAt',
      [TableNames.CLIPS]: '&id,url,createdAt,title,pdfId,tags',
    })
    // v2: 移除 pdfs 表，PDF数据现在使用OPFS存储
    // 保持版本号以避免升级问题，但不再创建pdfs表
    this.version(2).stores({
      // 空的升级，保持兼容性
    })
  }
}

export const appDB = new AppDB()

// Handle upgrade coordination across multiple extension contexts
// When a new version is opening, older connections will receive 'versionchange'.
// Close the old connection to allow the upgrade to proceed.
appDB.on('versionchange', () => {
  try {
    console.warn('Dexie: versionchange detected for gpt-enhance-db, closing old connection to allow upgrade.')
    appDB.close()
  } catch (e) {
    console.warn('Dexie: failed to close on versionchange', e)
  }
})

// Log when upgrade is blocked by another connection (for diagnostics)
appDB.on('blocked', () => {
  console.warn('Dexie: upgrade of gpt-enhance-db is blocked by another open connection. Please close other extension pages/tabs.')
})

export async function initializeDatabase(): Promise<void> {
  await appDB.open()
}

export async function getDatabaseStatus(): Promise<{ storageQuota: { used: number, available: number } }> {
  try {
    // MV3 supports navigator.storage.estimate in most contexts
    const estimate = await (navigator as any).storage?.estimate?.()
    if (estimate) {
      const used = Number(estimate.usage || 0)
      const available = Number(estimate.quota || 0)
      return { storageQuota: { used, available } }
    }
  } catch {}
  return { storageQuota: { used: 0, available: Number.MAX_SAFE_INTEGER } }
}

// Settings operations
export const settingsOperations = {
  async getCurrent(): Promise<UserSettings | null> {
    return appDB.settings.get('default')
  },
  async saveUserSettings(partial: Partial<UserSettings>): Promise<void> {
    const existing = await settingsOperations.getCurrent()
    const now = Date.now()
    const base: UserSettings = existing || {
      id: 'default',
      ...DEFAULT_USER_SETTINGS,
      createdAt: now,
      updatedAt: now
    }
    const record: UserSettings = {
      ...base,
      autoClip: partial.autoClip ?? base.autoClip,
      shortcuts: { ...(base.shortcuts || {}), ...(partial.shortcuts || {}) },
      storage: { ...(base.storage || {}), ...(partial.storage || {}) },
      export: { ...(base.export || {}), ...(partial.export || {}) },
      appearance: { ...(base.appearance || {}), ...(partial.appearance || {}) },
      notifications: { ...(base.notifications || {}), ...(partial.notifications || {}) },
      contextMenu: { ...(base.contextMenu || {}), ...(partial.contextMenu || {}) },
      quickEntry: { ...(base.quickEntry || {}), ...(partial.quickEntry || {}) },
      updatedAt: now
    }
    await appDB.settings.put(record)
    try {
      const all = await appDB.settings.toArray()
      console.groupCollapsed('[IndexedDB] settings 表 — 全量数据（保存后）', all.length)
      console.table(all)
      console.groupEnd()
    } catch (e) {
      console.warn('[IndexedDB] settings 表 全量数据打印失败', e)
    }
  },
  async ensureDefault(): Promise<UserSettings> {
    const existing = await settingsOperations.getCurrent()
    if (existing) return existing
    const now = Date.now()
    const record: UserSettings = {
      id: 'default',
      ...DEFAULT_USER_SETTINGS,
      createdAt: now,
      updatedAt: now
    }
    await appDB.settings.put(record)
    try {
      const all = await appDB.settings.toArray()
      console.groupCollapsed('[IndexedDB] settings 表 — 全量数据（初始化后）', all.length)
      console.table(all)
      console.groupEnd()
    } catch (e) {
      console.warn('[IndexedDB] settings 表 全量数据打印失败', e)
    }
    return record
  }
}

// Clip operations
export const clipOperations = {
  async create<T = ClipItem>(table: TableNames, data: Omit<T & { id?: string }, 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Date.now()
    const id = (data as any).id || `clip_${now}_${Math.random().toString(36).slice(2, 9)}`
    const record: any = { ...data, id, createdAt: now, updatedAt: now }
    await appDB.clips.put(record as any)
    try {
      const all = await appDB.clips.toArray()
      console.groupCollapsed('[IndexedDB] clips 表 — 全量数据（新增后）', all.length)
      console.table(all)
      console.groupEnd()
    } catch (e) {
      console.warn('[IndexedDB] clips 表 全量数据打印失败', e)
    }
    return id
  },
  async update<T = ClipItem>(table: TableNames, id: string, updates: Partial<T>): Promise<void> {
    const existing = await clipOperations.getById<T>(table, id)
    if (!existing) throw new Error('Record not found')
    const now = Date.now()
    const record: any = { ...(existing as any), ...updates, updatedAt: now }
    await appDB.clips.put(record)
    try {
      const all = await appDB.clips.toArray()
      console.groupCollapsed('[IndexedDB] clips 表 — 全量数据（更新后）', all.length)
      console.table(all)
      console.groupEnd()
    } catch (e) {
      console.warn('[IndexedDB] clips 表 全量数据打印失败', e)
    }
  },
  async getAll<T = ClipItem>(table: TableNames = TableNames.CLIPS): Promise<T[]> {
    return (await appDB.clips.toArray()) as unknown as T[]
  },
  async getById<T = ClipItem>(table: TableNames, id: string): Promise<T | null> {
    const item = await appDB.clips.get(id)
    return (item as unknown as T) || null
  },
  async delete(table: TableNames, id: string): Promise<void> {
    await appDB.clips.delete(id)
    try {
      const all = await appDB.clips.toArray()
      console.groupCollapsed('[IndexedDB] clips 表 — 全量数据（删除后）', all.length)
      console.table(all)
      console.groupEnd()
    } catch (e) {
      console.warn('[IndexedDB] clips 表 全量数据打印失败', e)
    }
  },
  async clear(table: TableNames): Promise<void> {
    await appDB.clips.clear()
    try {
      const all = await appDB.clips.toArray()
      console.groupCollapsed('[IndexedDB] clips 表 — 全量数据（清空后）', all.length)
      console.table(all)
      console.groupEnd()
    } catch (e) {
      console.warn('[IndexedDB] clips 表 全量数据打印失败', e)
    }
  },
  async searchClips(query: string): Promise<{ data: ClipItem[] }> {
    const all = await clipOperations.getAll<ClipItem>(TableNames.CLIPS)
    const lower = query.toLowerCase()
    const filtered = all.filter((item) =>
      item.title.toLowerCase().includes(lower) ||
      item.url.toLowerCase().includes(lower) ||
      item.content.toLowerCase().includes(lower) ||
      (item.tags && item.tags.some((t) => t.toLowerCase().includes(lower)))
    )
    return { data: filtered }
  }
}

// PDF 存储相关代码已移除，现在使用OPFS存储
// 所有PDF操作请使用 lib/pdfStorage.ts

// Helpers for bridging with chrome.storage (for UI compatibility)
export async function getCurrentUserSettings(): Promise<UserSettings> {
  // 依赖后台统一初始化；此处不再显式调用 initializeDatabase
  const existing = await settingsOperations.getCurrent()
  if (existing) return existing
  return await settingsOperations.ensureDefault()
}

export async function saveUserSettingsToLocal(settings: UserSettings | Partial<UserSettings>): Promise<void> {
  try {
    await chrome.storage.local.set({ settings })
  } catch {}
}