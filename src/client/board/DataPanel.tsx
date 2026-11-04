/**
 * DataPanel — 【数据备份】折叠面板（V3）。
 *
 * 三件事，都围绕「别把数据弄丢」：
 *   1. **增量导出**：全量 / 近 7 天 / 当月，文件名带范围与到秒的时间戳；
 *   2. **导入保护**：先解析 → 算冲突预览 → 二次确认（可选合并 / 覆盖）→ 才写库；
 *   3. **容量监控**：显示本插件占用的字节数与占比，到 80% 就提醒清理。
 *
 * 覆盖导入是唯一会「变少」的操作，所以预览里把「会被覆盖多少条」说清楚，
 * 默认选项也是合并。
 */
import { useMemo, useRef, useState } from 'react'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { useConfirm } from '../ui/ConfirmDialog'
import { useStorageQuota, formatBytes } from '../hooks/useStorageQuota'
import { createDefaultSettings } from '../lib/defaults'
import {
  applyImport,
  backupFileName,
  buildBackup,
  describePreview,
  downloadText,
  filterByScope,
  parseBackup,
  previewImport,
  readFileAsText,
  serializeBackup,
  type LocalSnapshot,
} from '../lib/backup'
import { BACKUP_SCOPE_LABELS } from '../lib/config'
import { info, warn } from '../lib/debug'
import { pushNotice } from '../lib/bus'
import { getRepo } from '../lib/repo'
import { buildImportSnapshot } from '../lib/actions'
import { pruneSnapshots } from '../lib/history'
import { useLocalStore } from '../hooks/useLocalStore'
import type { HistorySnapshot } from '../types'
import { createBrowserStore, writeTransaction } from '../lib/tx'
import { STORAGE_KEYS, type BackupScope, type ImportMode, type ImportPreview, type BoardSettings } from '../types'

export function DataPanel() {
  const board = useBoardData()
  const { settings } = useBoardSettings()
  const confirm = useConfirm()
  const [, setHistory] = useLocalStore<HistorySnapshot[]>(STORAGE_KEYS.history, [])
  const quota = useStorageQuota(
    `${board.allTasks.length}:${board.allLogs.length}:${board.allFriction.length}`,
  )

  const [scope, setScope] = useState<BackupScope>('all')
  const [mode, setMode] = useState<ImportMode>('merge')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const pendingRef = useRef<ReturnType<typeof parseBackup> | null>(null)

  const localSnapshot: LocalSnapshot = useMemo(
    () => ({
      tasks: board.allTasks,
      logs: board.allLogs,
      projects: board.projects,
      friction: board.allFriction,
    }),
    [board.allTasks, board.allLogs, board.projects, board.allFriction],
  )

  /** settings 的写入口（整体替换，所以不走 patch）。 */
  function writeSettings(next: BoardSettings): void {
    try {
      const raw = JSON.stringify({ schemaVersion: 3, data: next })
      window.localStorage.setItem(STORAGE_KEYS.settings, raw)
      window.dispatchEvent(
        new CustomEvent('dsh-otaku-study-board:store', { detail: { key: STORAGE_KEYS.settings, raw } }),
      )
    } catch (error) {
      warn('backup', 'settings write failed', error)
    }
  }

  /** 导出（可增量）。 */
  function handleExport(): void {
    try {
      const repo = getRepo()
      const filtered = filterByScope(
        {
          tasks: board.allTasks,
          logs: board.allLogs,
          friction: board.allFriction,
          projects: board.projects,
          memory: repo.readMemory(),
          knowledge: repo.readGraph(),
          reviews: repo.readReviews(),
          timeline: repo.readTimeline(),
          history: repo.readHistory(),
          daily: repo.readDaily(),
        },
        scope,
      )
      const payload = buildBackup({
        tasks: filtered.tasks,
        logs: filtered.logs,
        projects: board.projects.filter(item => !item.archived),
        settings,
        friction: filtered.friction,
        meta: board.meta,
        scope,
        memory: filtered.memory ?? [],
        knowledge: filtered.knowledge ?? { nodes: [], edges: [] },
        reviews: filtered.reviews ?? [],
        timeline: filtered.timeline ?? [],
        history: filtered.history ?? [],
        daily: filtered.daily ?? [],
      })
      const text = serializeBackup(payload)
      const ok = downloadText(backupFileName(scope), text)
      setNotice({
        ok,
        text: ok
          ? `已导出 ${BACKUP_SCOPE_LABELS[scope]}：${filtered.tasks.length} 个任务 / ${filtered.logs.length} 条日志 / ${filtered.friction.length} 条阻碍`
          : '导出失败：浏览器拒绝了下载',
      })
      if (ok) info('backup', `export ${scope}: ${filtered.tasks.length} tasks / ${filtered.logs.length} logs`)
    } catch (error) {
      warn('backup', 'export failed', error)
      setNotice({ ok: false, text: '导出失败，详见控制台' })
    }
  }

  /** 选择文件 → 解析 → 冲突预览（还不写）。 */
  async function handleFile(file: File | undefined): Promise<void> {
    if (file === undefined) return
    try {
      const text = await readFileAsText(file)
      const parsed = parseBackup(text)
      if (!parsed.ok) {
        setNotice({ ok: false, text: `导入失败：${parsed.error}` })
        pushNotice(`导入失败：${parsed.error}`, 'error')
        return
      }
      const nextPreview = previewImport(localSnapshot, parsed.payload, mode)
      pendingRef.current = parsed
      setPreview(nextPreview)
      confirm.ask(
        {
          title: mode === 'overwrite' ? '覆盖导入？' : '合并导入？',
          description: describePreview(nextPreview),
          confirmLabel: mode === 'overwrite' ? '覆盖导入' : '合并导入',
          tone: mode === 'overwrite' ? 'danger' : 'default',
        },
        () => commitImport(),
      )
    } catch (error) {
      warn('backup', 'import crashed', error)
      setNotice({ ok: false, text: '导入过程出现意外错误，详见控制台' })
    } finally {
      if (fileRef.current !== null) fileRef.current.value = ''
    }
  }

  /** 真正写库。 */
  function commitImport(): void {
    const parsed = pendingRef.current
    if (parsed === null || !parsed.ok) return
    try {
      const repo = getRepo()
      const merged = applyImport(
        {
          ...localSnapshot,
          settings,
          meta: board.meta,
          memory: repo.readMemory(),
          knowledge: repo.readGraph(),
          reviews: repo.readReviews(),
          timeline: repo.readTimeline(),
          history: repo.readHistory(),
          daily: repo.readDaily(),
        },
        parsed.payload,
        mode,
      )
      /**
       * 全写或回滚：12 个键一次性写。
       *
       * 之前逐个 setter 写，中途配额失败会留下「半新半旧」且原数据已被覆盖
       * （第二轮审计 NEW-05）。这里失败会把已写的键恢复原值。
       */
      const store = createBrowserStore()
      if (store === undefined) {
        // 无 window（测试 / 特殊环境）：退回内存写入路径。
        board.setTasks(merged.tasks)
        board.setLogs(merged.logs)
        board.setProjects(merged.projects)
        board.setFriction(merged.friction)
        board.setMeta(merged.meta)
        writeSettings(merged.settings)
        repo.writeMemory(merged.memory ?? [])
        repo.writeGraph(merged.knowledge ?? { nodes: [], edges: [] })
        repo.writeReviews(merged.reviews ?? [])
        repo.writeTimeline(merged.timeline ?? [])
        repo.writeHistory(merged.history ?? [])
        repo.writeDaily(merged.daily ?? [])
      } else {
        const result = writeTransaction(store, [
          { key: STORAGE_KEYS.tasks, value: merged.tasks },
          { key: STORAGE_KEYS.logs, value: merged.logs },
          { key: STORAGE_KEYS.projects, value: merged.projects },
          { key: STORAGE_KEYS.friction, value: merged.friction },
          { key: STORAGE_KEYS.meta, value: merged.meta },
          { key: STORAGE_KEYS.settings, value: merged.settings },
          { key: STORAGE_KEYS.memory, value: merged.memory ?? [] },
          { key: STORAGE_KEYS.knowledge, value: merged.knowledge ?? { nodes: [], edges: [] } },
          { key: STORAGE_KEYS.reviews, value: merged.reviews ?? [] },
          { key: STORAGE_KEYS.timeline, value: merged.timeline ?? [] },
          { key: STORAGE_KEYS.history, value: merged.history ?? [] },
          { key: STORAGE_KEYS.daily, value: merged.daily ?? [] },
        ])
        if (!result.ok) {
          const why = result.error === 'serialize' ? '数据无法序列化' : `写入「${result.failedKey ?? '未知键'}」失败`
          const text = result.restored
            ? `导入已中止（${why}），原有数据已回滚`
            : `导入中止且回滚失败（${why}），数据可能不一致：请立刻导出备份`
          setNotice({ ok: false, text })
          pushNotice(text, 'error')
          warn('backup', text)
          return
        }
      }
      // 只有成功分支才追加历史快照；失败分支在前面已经 return。
      const project = board.activeProject
      if (project !== undefined) {
        const snapshot = buildImportSnapshot({
          project,
          tasks: merged.tasks,
          friction: merged.friction,
          ...(merged.memory?.[0] === undefined ? {} : { memory: merged.memory[0] }),
        })
        setHistory(previous => pruneSnapshots([...previous, snapshot]))
      }

      quota.refresh()
      const text = `已${mode === 'overwrite' ? '覆盖' : '合并'}导入：${merged.tasks.length} 个任务 / ${merged.logs.length} 条日志 / ${merged.friction.length} 条阻碍`
      setNotice({ ok: true, text })
      pushNotice(text, 'success')
      info('backup', text)
    } catch (error) {
      warn('backup', 'commit failed', error)
      setNotice({ ok: false, text: '写入失败：存储可能已满，先导出备份再清理' })
    } finally {
      pendingRef.current = null
      setPreview(null)
    }
  }

  function handleClear(): void {
    confirm.ask(
      {
        title: '清空本机所有看板数据？',
        description:
          '任务、会话日志、项目、阻碍记录、设置与计时状态会全部删除。这一步没有回收站，只能靠之前导出的备份恢复。',
        confirmLabel: '全部清空',
        tone: 'danger',
      },
      () => {
        board.setTasks([])
        board.setLogs([])
        board.setProjects([])
        board.setFriction([])
        board.setMeta({ sessionTaskMap: {} })
        const repo = getRepo()
        repo.writeMemory([])
        repo.writeGraph({ nodes: [], edges: [] })
        repo.writeReviews([])
        repo.writeTimeline([])
        repo.writeHistory([])
        repo.writeDaily([])
        writeSettings(createDefaultSettings())
        setNotice({ ok: true, text: '已清空本机所有看板数据' })
        info('backup', 'all board data cleared')
        quota.refresh()
      },
    )
  }

  return (
    <details className="osb-collapse">
      <summary className="osb-collapse-head">
        数据备份
        <span className="osb-collapse-meta">
          本地 JSON · 已用 {formatBytes(quota.bytes)}
          {quota.level === 'danger' ? ' · 空间告急' : quota.level === 'warn' ? ' · 接近上限' : ''}
        </span>
      </summary>

      <div className="osb-collapse-body">
        <div className="osb-data-actions">
          <select
            className="osb-select"
            value={scope}
            aria-label="导出范围"
            onChange={event => setScope(event.target.value as BackupScope)}
          >
            <option value="all">全量</option>
            <option value="week">近 7 天</option>
            <option value="month">当月</option>
          </select>
          <button type="button" className="osb-btn" onClick={handleExport}>
            导出 JSON
          </button>
          <select
            className="osb-select"
            value={mode}
            aria-label="导入模式"
            onChange={event => setMode(event.target.value as ImportMode)}
          >
            <option value="merge">合并导入</option>
            <option value="overwrite">覆盖导入</option>
          </select>
          <button type="button" className="osb-btn" onClick={() => fileRef.current?.click()}>
            导入 JSON
          </button>
          <button type="button" className="osb-btn osb-btn-danger" onClick={handleClear}>
            清空全部数据
          </button>
          <input
            ref={fileRef}
            className="osb-file-input"
            type="file"
            accept="application/json,.json"
            aria-hidden="true"
            tabIndex={-1}
            onChange={event => {
              void handleFile(event.target.files?.[0])
            }}
          />
        </div>

        {/* 容量条：到 80% 黄、92% 红 */}
        <div style={{ margin: '8px 0 4px' }}>
          <div className="osb-track" style={{ height: 4 }} data-level={quota.level}>
            <span
              className="osb-track-fill"
              style={{
                width: `${Math.min(100, Math.round(quota.ratio * 100))}%`,
                background:
                  quota.level === 'danger'
                    ? 'var(--osb-danger)'
                    : quota.level === 'warn'
                      ? 'var(--osb-warn)'
                      : undefined,
              }}
            />
          </div>
          <p className="osb-hint" style={{ margin: '4px 0 0' }}>
            {quota.detail}
            {quota.breakdown[0] === undefined
              ? ''
              : ` · 最大项：${quota.breakdown[0].label}（${formatBytes(quota.breakdown[0].bytes)}）`}
          </p>
        </div>

        <p className="osb-hint">
          导出文件名形如 <code>sorchron-board-backup-all-YYYYMMDD-HHMMSS.json</code>，是可读明文。
          导入默认按 id 合并；覆盖导入会丢弃本地独有记录，确认框里会写明。
        </p>

        {preview === null ? null : (
          <p className="osb-hint" style={{ color: 'var(--osb-text-2)' }}>
            上次预览：备份 {preview.incoming.logs} 条日志 · 本地 {preview.local.logs} 条 · 冲突{' '}
            {preview.conflicts.logs + preview.conflicts.tasks + preview.conflicts.friction} 条
          </p>
        )}

        {notice === null ? null : (
          <p className="osb-notice" data-ok={notice.ok ? 'true' : 'false'}>
            {notice.text}
          </p>
        )}

        <details style={{ marginTop: 6 }}>
          <summary className="osb-hint" style={{ cursor: 'pointer' }}>
            各键占用明细
          </summary>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, fontSize: 12 }}>
            {quota.breakdown.map(item => (
              <li key={item.key} style={{ display: 'flex', gap: 8, padding: '1px 0' }}>
                <span style={{ minWidth: 72 }}>{item.label}</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: 'var(--osb-text-3)' }}>{formatBytes(item.bytes)}</span>
                <span style={{ color: 'var(--osb-text-3)', minWidth: 36, textAlign: 'right' }}>
                  {Math.round(item.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {confirm.dialog}
    </details>
  )
}
