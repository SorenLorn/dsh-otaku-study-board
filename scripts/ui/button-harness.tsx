/** Button 状态测试页：真实 Button + 真实 board.css + 代表性宿主 token（浅/深）。 */
import cssText from '../../src/client/style/board.css'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { Button } from '../../src/client/v4/ui'

const host = document.createElement('style')
host.textContent = `
body{--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#fff;--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#61666b;--dsw-alias-label-tertiary:#81858c;--dsw-alias-border-l2:rgba(0,0,0,.10);--dsw-alias-border-l3:rgba(0,0,0,.16);--dsw-alias-label-primary-inverted:#fff;--dsw-alias-brand-primary:#0f1115}
body[data-ds-dark-theme]{--dsw-alias-bg-layer-1:#232324;--dsw-alias-bg-layer-2:#1b1b1c;--dsw-alias-label-primary:#ebeef2;--dsw-alias-label-secondary:#adb2b8;--dsw-alias-label-tertiary:#81858c;--dsw-alias-border-l2:rgba(255,255,255,.12);--dsw-alias-border-l3:rgba(255,255,255,.20);--dsw-alias-label-primary-inverted:#353638;--dsw-alias-brand-primary:#ebeef2}
`
const style = document.createElement('style')
style.textContent = cssText
document.head.append(host, style)

declare global {
  interface Window {
    __clicks: number
    __setLoading: (value: boolean) => void
  }
}
window.__clicks = 0

function App(): unknown {
  const [loading, setLoading] = useState(false)
  window.__setLoading = setLoading
  return (
    <div className="osb-page v4-page" data-view="v4" data-osb-page="" style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button id="b-primary" variant="primary" onClick={() => { window.__clicks += 1 }}>主操作</Button>
        <Button id="b-secondary" onClick={() => { window.__clicks += 1 }}>次操作</Button>
        <Button id="b-ghost" variant="ghost" onClick={() => { window.__clicks += 1 }}>轻操作</Button>
        <Button id="b-danger" variant="danger" onClick={() => { window.__clicks += 1 }}>删除</Button>
        <Button id="b-icon" variant="icon" ariaLabel="更多操作" onClick={() => { window.__clicks += 1 }}>⋯</Button>
        <Button id="b-loading" loading={loading} onClick={() => { window.__clicks += 1 }}>保存</Button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
;(window as unknown as { __ready: boolean }).__ready = true
