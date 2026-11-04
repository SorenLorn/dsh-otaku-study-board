/**
 * FrictionLog — 【开发阻碍记录】折叠面板（需求 3.4）。
 *
 * 一条记录的价值不在「又报错了」，而在**解决方案**。所以这里的主交互是：
 * 点「补充方案」→ 写两句 → 自动标记已解决，并算进「平均定位耗时」。
 *
 * 列表按「未解决优先 + 复发次数降序」排：最该看的在最上面。
 */
import { useMemo, useState } from 'react'
import type { FrictionRecord } from '../types'
import { useFrictionLog } from '../hooks/useFrictionLog'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardActions } from '../hooks/useBoardActions'
import { useConfirm } from '../ui/ConfirmDialog'
import { formatDuration, frictionStats } from '../lib/friction'
import { formatRelative } from '../lib/time'
import { pushNotice } from '../lib/bus'

type Filter = 'open' | 'resolved' | 'all'

export function FrictionLog() {
  const board = useBoardData()
  const friction = useFrictionLog()
  const actions = useBoardActions()
  const confirm = useConfirm()

  const [filter, setFilter] = useState<Filter>('open')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [solutionDraft, setSolutionDraft] = useState('')

  /** 只用当前项目作用域内的记录。 */
  const scoped = board.friction

  const visible = useMemo(() => {
    const list = scoped.filter(record => {
      if (filter === 'open') return !record.resolved
      if (filter === 'resolved') return record.resolved
      return true
    })
    return list.slice().sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
      if (b.hits !== a.hits) return b.hits - a.hits
      return b.updatedAt - a.updatedAt
    })
  }, [scoped, filter])

  const stats = useMemo(() => frictionStats(scoped), [scoped])
  const openCount = scoped.filter(record => !record.resolved).length

  function beginEdit(record: FrictionRecord): void {
    setEditingId(record.id)
    setSolutionDraft(record.solution ?? '')
  }

  function save(record: FrictionRecord): void {
    actions.resolveFriction(record.id, solutionDraft)
    setEditingId(null)
    setSolutionDraft('')
    pushNotice(solutionDraft.trim() === '' ? '已标记为未解决' : '方案已保存，这条阻碍已归档为已解决', 'success')
  }

  function remove(record: FrictionRecord): void {
    confirm.ask(
      {
        title: '删除这条阻碍记录？',
        description: `「${record.summary.slice(0, 40)}」及其解决方案会被永久删除，统计里的次数也会减少。`,
        confirmLabel: '删除',
        tone: 'danger',
      },
      () => friction.remove(record.id),
    )
  }

  return (
    <details className="osb-collapse">
      <summary className="osb-collapse-head">
        开发阻碍记录
        <span className="osb-collapse-meta">
          本周 {stats.weekHits} 次 · 未解决 {openCount}
        </span>
      </summary>

      <div className="osb-collapse-body">
        <div className="osb-log-toolbar" style={{ marginBottom: 6 }}>
          <button
            type="button"
            className="osb-chip"
            aria-pressed={filter === 'open'}
            onClick={() => setFilter('open')}
          >
            未解决 {openCount}
          </button>
          <button
            type="button"
            className="osb-chip"
            aria-pressed={filter === 'resolved'}
            onClick={() => setFilter('resolved')}
          >
            已解决 {scoped.length - openCount}
          </button>
          <button
            type="button"
            className="osb-chip"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            全部 {scoped.length}
          </button>
          <span style={{ flex: 1 }} />
          <span className="osb-hint">
            反复踩坑 {stats.repeated} 条 · 平均定位 {formatDuration(stats.avgResolveMs)}
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="osb-empty">
            {scoped.length === 0
              ? '还没有阻碍记录。排错类会话会被自动沉淀到这里（同一类坑只留一条，次数累加）。'
              : filter === 'open'
                ? '没有未解决的阻碍，都清完了。'
                : '这个筛选下没有记录。'}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {visible.map(record => (
              <li
                key={record.id}
                style={{
                  padding: '6px 0',
                  borderTop: '1px solid var(--osb-border)',
                  opacity: record.resolved ? 0.72 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 500, flex: 1, wordBreak: 'break-word' }}>{record.summary}</span>
                  {record.hits > 1 ? (
                    <span className="osb-log-hits" title="重复出现次数">
                      ×{record.hits}
                    </span>
                  ) : null}
                  <span style={{ color: 'var(--osb-text-3)', whiteSpace: 'nowrap' }}>
                    {formatRelative(record.at)}
                  </span>
                </div>

                {record.detail === undefined ? null : (
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--osb-text-3)' }}>
                    {record.detail}
                  </p>
                )}

                {editingId === record.id ? (
                  <div style={{ marginTop: 4 }}>
                    <textarea
                      className="osb-textarea"
                      rows={2}
                      value={solutionDraft}
                      placeholder="解决方案：根因是什么、怎么修的、下次怎么避免…"
                      onChange={event => setSolutionDraft(event.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        type="button"
                        className="osb-btn osb-btn-primary osb-btn-sm"
                        onClick={() => save(record)}
                      >
                        保存方案
                      </button>
                      <button
                        type="button"
                        className="osb-btn osb-btn-sm"
                        onClick={() => {
                          setEditingId(null)
                          setSolutionDraft('')
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span
                      style={{
                        fontSize: 11,
                        flex: 1,
                        color: record.resolved ? 'var(--osb-ok)' : 'var(--osb-text-3)',
                      }}
                    >
                      {record.solution === undefined || record.solution === ''
                        ? '还没有解决方案'
                        : `✓ ${record.solution}`}
                    </span>
                    <button
                      type="button"
                      className="osb-btn osb-btn-sm"
                      onClick={() => beginEdit(record)}
                    >
                      {record.resolved ? '改方案' : '补充方案'}
                    </button>
                    <button
                      type="button"
                      className="osb-btn osb-btn-sm osb-btn-danger"
                      onClick={() => remove(record)}
                    >
                      删除
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {stats.worst !== undefined && stats.worst.hits > 1 ? (
          <p className="osb-hint" style={{ marginBottom: 0 }}>
            最常复发：{stats.worst.summary.slice(0, 60)}（{stats.worst.hits} 次）
          </p>
        ) : null}
      </div>

      {confirm.dialog}
    </details>
  )
}
