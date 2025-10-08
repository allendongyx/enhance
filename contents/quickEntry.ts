// 在所有网页右侧垂直居中显示一个常驻浮标，点击打开/关闭侧边栏，右键弹菜单

function createFloatButton() {
  const btn = document.createElement("div")
  btn.id = "kaka-quick-entry"
  btn.style.cssText = `
    position: fixed;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: linear-gradient(180deg, #111827 0%, #1f2937 100%);
    border: 1px solid rgba(255,255,255,0.7);
    box-shadow: 0 10px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2147483647;
    color: white;
    user-select: none;
    backdrop-filter: saturate(1.2);
  `
  btn.title = "打开剪藏侧边栏 (右键菜单)"

  // 内联灯泡图标，增强在黑白页面的可见性（亮黄色发光）
  const svgNS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(svgNS, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", "26")
  svg.setAttribute("height", "26")
  svg.style.cssText = "filter: drop-shadow(0 0 6px rgba(245,158,11,0.8));"
  const path = document.createElementNS(svgNS, "path")
  path.setAttribute("fill", "#fbbf24")
  path.setAttribute("d", "M9 21h6v-1H9v1zm3-19a7 7 0 00-4 12.732V17h8v-2.268A7 7 0 0012 2zm0 2a5 5 0 014.472 7.244c-.31.532-.472.92-.472 1.756v.5H8v-.5c0-.836-.162-1.224-.472-1.756A5 5 0 0112 4z")
  svg.appendChild(path)
  btn.appendChild(svg)

  // 点击发送消息给后台脚本切换侧边栏
  btn.addEventListener("click", async (e) => {
    e.preventDefault()
    console.log('[QuickEntry] 浮窗按钮被点击')
    try {
      console.log('[QuickEntry] 准备发送toggleSidePanel消息')
      const response = await chrome.runtime.sendMessage({ action: "toggleSidePanel" })
      console.log('[QuickEntry] 收到响应:', response)
    } catch (err) {
      console.error('[QuickEntry] 发送消息失败:', err)
    }
  })

  // 右键弹出菜单（隐藏/打开设置）
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY)
  })

  return btn
}

function removeFloatButton() {
  const el = document.getElementById("kaka-quick-entry")
  if (el && el.parentElement) {
    el.parentElement.removeChild(el)
  }
}

async function ensureButton() {
  try {
    // 统一从后台读取 IndexedDB 设置
    const resp = await chrome.runtime.sendMessage({ action: 'getSettings' })
    const enabled = resp?.data?.quickEntry?.enabled ?? true
    if (enabled === false) {
      removeFloatButton()
      return
    }
    if (!document.getElementById("kaka-quick-entry")) {
      const btn = createFloatButton()
      document.documentElement.appendChild(btn)
    }
  } catch {
    // 默认显示
    if (!document.getElementById("kaka-quick-entry")) {
      const btn = createFloatButton()
      document.documentElement.appendChild(btn)
    }
  }
}

// 初始执行一次
ensureButton()

// 监听来自后台的设置更新
chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === 'settingsUpdated') {
    ensureButton()
  }
})

function showContextMenu(x: number, y: number) {
  // 清理原菜单
  const old = document.getElementById('kaka-quick-entry-menu')
  if (old) old.remove()
  const menu = document.createElement('div')
  menu.id = 'kaka-quick-entry-menu'
  menu.style.cssText = `
    position: fixed;
    top: ${y + 8}px;
    left: ${x - 160}px;
    width: 180px;
    background: #111827;
    color: #fff;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 10px;
    box-shadow: 0 10px 20px rgba(0,0,0,0.35);
    z-index: 2147483647;
    overflow: hidden;
  `
  const item = (text: string, handler: () => void) => {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = `padding: 10px 12px; font-size: 13px; cursor: pointer;`
    el.addEventListener('mouseenter', () => { el.style.background = '#1f2937' })
    el.addEventListener('mouseleave', () => { el.style.background = 'transparent' })
    el.addEventListener('click', () => { handler(); closeMenu() })
    return el
  }
  const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeOnOutside) }
  const closeOnOutside = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) closeMenu() }
  menu.appendChild(item('隐藏浮标', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'setQuickEntryEnabled', data: { enabled: false } })
      removeFloatButton()
    } catch {}
  }))
  menu.appendChild(item('打开设置', async () => { 
    try { 
      console.log('[QuickEntry] 打开设置页面')
      // 发送消息给后台脚本打开设置页面
      await chrome.runtime.sendMessage({ action: 'openSettings' })
    } catch (err) {
      console.error('[QuickEntry] 打开设置失败:', err)
    } 
  }))
  document.documentElement.appendChild(menu)
  setTimeout(() => document.addEventListener('click', closeOnOutside), 0)
}

export {}

// Plasmo 配置：匹配所有页面，文档结束时注入
export const config = {
  matches: ["<all_urls>"],
  run_at: "document_end"
}