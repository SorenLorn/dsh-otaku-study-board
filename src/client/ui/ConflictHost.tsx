/**
 * ConflictHost — 跨标签页冲突提示条（B2 策略 A 的界面）。
 *
 * 只做三件事：列出冲突、给两个选择、派发决议。真正的读写由对应 key 的
 * `useLocalStore` 实例完成（它监听 `CONFLICT_EVENT`）。
 */
import { useEffect, useState } from 'react'
import { listConflicts, requestResolution, subscribeConflicts, type ConflictEntry } from '../lib/conflict'

const KEY_LABELS: Record<string, string> = {
  'dsh-otaku-study-board:tasks': '任务',
  'dsh-otaku-study-board:logs': '会话日志',
  'dsh-otaku-study-board:settings': '设置',
  'dsh-otaku-study-board:projects': '项目',
  'dsh-otaku-study-board:friction': '阻碍记录',
  'dsh-otaku-study-board:memory': '项目记忆',
  'dsh-otaku-study-board:knowledge': '知识图谱',
}

export function ConflictHost() {
  const [items, setItems] = useState<ConflictEntry[]>(() => listConflicts())

  useEffect(() => subscribeConflicts(() => setItems(listConflicts())), [])

  if (items.length === 0) return null

  // 导入会一次写多个键：合并成一条提示，避免 12 个弹窗。
  const labels = items.map(item => KEY_LABELS[item.key] ?? item.key)
  const summary =
    items.length === 1
      ? `另一标签页修改了「${labels[0]}」`
      : `另一标签页修改了 ${items.length} 项数据（${labels.slice(0, 3).join('、')}${items.length > 3 ? '…' : ''}）`

  return (
    <div
      role="alertdialog"
      aria-label="跨标签页冲突"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 60,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--osb-border-strong)',
        background: 'var(--osb-surface)',
        boxShadow: '0 10px 30px -18px rgba(0,0,0,0.5)',
        fontSize: 12,
      }}
    >
      <span style={{ flex: 1, minWidth: 220 }}>
        {summary}，与当前页未保存的修改冲突。
        <span style={{ color: 'var(--osb-text-3)' }}> 选择前不会覆盖任何一方。</span>
      </span>
      <button
        type="button"
        className="osb-btn osb-btn-sm"
        onClick={() => items.forEach(item => requestResolution(item.key, 'reload'))}
      >
        重新载入（用远端）
      </button>
      <button
        type="button"
        className="osb-btn osb-btn-sm osb-btn-primary"
        onClick={() => items.forEach(item => requestResolution(item.key, 'keep'))}
      >
        保留本页
      </button>
    </div>
  )
}
