/**
 * NoticeHost — 角落里的小提示条（存储损坏、写入超限、导入被拒…）。
 *
 * 为什么单独做一个"宿主"：存储错误发生在 `useLocalStore` 这种最底层的模块里，
 * 它没有也不该有 UI。所以底层只往 `lib/bus` push 一条文本，由页面顶部挂一个
 * NoticeHost 统一渲染。
 *
 * 样式全部用行内 style —— 本轮不改 board.css，也不新增选择器；它是浮层，不参与
 * 页面布局，所以不会影响任何卡片的排版。
 */
import { useEffect, useState } from 'react'
import { dismissNotice, getNotices, subscribeNotices, type Notice } from '../lib/bus'

/** 自动消失时间：错误留久一点，方便看清。 */
const LIFETIME_MS = 9000

const LEVEL_COLORS: Record<Notice['level'], { fg: string; bg: string; border: string }> = {
  info: { fg: 'var(--osb-accent-text)', bg: 'var(--osb-surface)', border: 'var(--osb-border)' },
  success: { fg: 'var(--osb-ok)', bg: 'var(--osb-surface)', border: 'var(--osb-ok)' },
  warn: { fg: 'var(--osb-warn)', bg: 'var(--osb-surface)', border: 'var(--osb-warn)' },
  error: { fg: 'var(--osb-danger)', bg: 'var(--osb-surface)', border: 'var(--osb-danger)' },
}

export function NoticeHost() {
  const [notices, setNotices] = useState<readonly Notice[]>(() => getNotices())

  useEffect(() => {
    return subscribeNotices(() => setNotices([...getNotices()]))
  }, [])

  // 到点自动收起；用 2s 的巡检而不是每条一个 setTimeout，卸载时只需清一个定时器。
  useEffect(() => {
    if (notices.length === 0) return
    const id = window.setInterval(() => {
      const now = Date.now()
      for (const notice of getNotices()) {
        if (now - notice.at > LIFETIME_MS) dismissNotice(notice.id)
      }
    }, 2000)
    return () => {
      window.clearInterval(id)
    }
  }, [notices.length])

  if (notices.length === 0) return null

  return (
    <div
      data-osb-notices=""
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 70,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {notices.map(notice => {
        const tone = LEVEL_COLORS[notice.level] ?? LEVEL_COLORS.info
        return (
          <div
            key={notice.id}
            role="status"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '9px 11px',
              border: `1px solid ${tone.border}`,
              borderRadius: 8,
              background: tone.bg,
              boxShadow: '0 8px 24px -18px rgba(20, 12, 30, 0.6)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 auto',
                width: 6,
                height: 6,
                marginTop: 6,
                borderRadius: '50%',
                background: tone.fg,
              }}
            />
            <span style={{ flex: '1 1 auto', fontSize: 12, lineHeight: 1.6, color: tone.fg }}>
              {notice.text}
            </span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => dismissNotice(notice.id)}
              style={{
                flex: '0 0 auto',
                border: 'none',
                background: 'transparent',
                color: 'var(--osb-text-3)',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
