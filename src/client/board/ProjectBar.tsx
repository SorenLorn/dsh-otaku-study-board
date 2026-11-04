/**
 * ProjectBar — 项目切换条（需求 3.3 + 3.5 的快照入口）。
 *
 * 放在页头下面、卡片上面，一行搞定四件事：
 *   1. 切项目（`全部` + 每个未归档项目）；
 *   2. 新建 / 按模板新建；
 *   3. 归档 / 解封 / 删除（都在「管理」折叠里，避免日常误触）；
 *   4. 当前项目的记忆快照导出 / 导入。
 *
 * 全部使用已有按钮与 chip 样式，不新增视觉语言（约束 §一.3）。
 */
import { useRef, useState } from 'react'
import { useBoardData } from '../hooks/useBoardData'
import { useProject, PROJECT_TEMPLATE_OPTIONS } from '../hooks/useProject'
import { useConfirm } from '../ui/ConfirmDialog'
import { pushNotice } from '../lib/bus'
import { info, warn } from '../lib/debug'
import { downloadText, readFileAsText } from '../lib/backup'
import {
  buildSnapshot,
  importSnapshot,
  parseSnapshot,
  serializeSnapshot,
  snapshotFileName,
} from '../lib/snapshot'
import { BOARD_CONFIG } from '../lib/config'
import { formatMinutes } from '../lib/time'
import { taskFocusMinutes } from '../lib/stats'
import { sanitizeTitle } from '../lib/validate'

export function ProjectBar() {
  const board = useBoardData()
  const project = useProject()
  const confirm = useConfirm()

  const [creating, setCreating] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [managing, setManaging] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const activeId = board.activeProjectId
  const activeName = board.activeProject?.name

  /** 当前项目的任务/日志/阻碍（用于快照）。 */
  function currentProjectBundle() {
    if (board.activeProject === undefined) return undefined
    const id = board.activeProject.id
    return {
      project: board.activeProject,
      tasks: board.allTasks.filter(task => task.projectId === id),
      friction: board.allFriction.filter(item => item.projectId === id),
      logs: board.allLogs.filter(log => log.projectId === id),
    }
  }

  function exportSnapshot(): void {
    const bundle = currentProjectBundle()
    if (bundle === undefined) {
      pushNotice('先切到一个具体项目再导出快照', 'warn')
      return
    }
    try {
      const snapshot = buildSnapshot(bundle)
      const text = serializeSnapshot(snapshot)
      const ok = downloadText(snapshotFileName(bundle.project.name), text)
      pushNotice(
        ok
          ? `快照已导出：${snapshot.totals.tasks} 个任务 / ${snapshot.totals.friction} 条阻碍`
          : '快照导出失败：浏览器拒绝了下载',
        ok ? 'success' : 'error',
      )
    } catch (error) {
      warn('snapshot', 'export failed', error)
      pushNotice('快照导出失败，详见控制台', 'error')
    }
  }

  async function handleSnapshotFile(file: File | undefined): Promise<void> {
    if (file === undefined) return
    try {
      const text = await readFileAsText(file)
      const parsed = parseSnapshot(text)
      if (!parsed.ok) {
        pushNotice(`快照导入失败：${parsed.error}`, 'error')
        return
      }
      const imported = importSnapshot(parsed.snapshot, {
        projectNames: board.projects.map(item => item.name),
      })
      board.setProjects(previous => [...previous, imported.project])
      board.setTasks(previous => [...imported.tasks, ...previous])
      board.setFriction(previous => [...imported.friction, ...previous])
      if (imported.highlights.length > 0) {
        board.setLogs(previous => [...imported.highlights, ...previous].slice(0, BOARD_CONFIG.storage.logSoftLimit))
      }
      board.setActiveProject(imported.project.id)
      info('snapshot', `imported ${imported.project.name}: ${imported.tasks.length} tasks`)
      pushNotice(
        `已从快照创建「${imported.project.name}」：${imported.tasks.length} 个任务 / ${imported.friction.length} 条阻碍`,
        'success',
      )
    } catch (error) {
      warn('snapshot', 'import failed', error)
      pushNotice('快照导入失败，详见控制台', 'error')
    } finally {
      if (fileRef.current !== null) fileRef.current.value = ''
    }
  }

  function handleCreate(): void {
    const clean = sanitizeTitle(nameDraft, BOARD_CONFIG.projects.maxNameLength)
    if (clean === '') {
      pushNotice('项目名不能为空', 'warn')
      return
    }
    const created = project.create(clean)
    if (created === undefined) {
      pushNotice('创建失败：可能重名或已达到项目数量上限', 'warn')
      return
    }
    setNameDraft('')
    setCreating(false)
  }

  function handleTemplate(templateId: string): void {
    if (templateId === '') return
    const created = project.createFromTemplate(templateId)
    if (created === undefined) {
      pushNotice('模板创建失败', 'error')
      return
    }
    board.setTasks(previous => [...created.tasks, ...previous])
    pushNotice(`已创建「${created.project.name}」，附带 ${created.tasks.length} 个任务`, 'success')
  }

  function handleArchive(id: string, archived: boolean): void {
    const target = board.projects.find(item => item.id === id)
    if (target === undefined) return
    if (!archived) {
      project.setArchived(id, false)
      pushNotice(`已解封「${target.name}」`, 'info')
      return
    }
    confirm.ask(
      {
        title: `归档「${target.name}」？`,
        description: '归档后它的任务、日志、阻碍记录都会退出日常统计，但数据保留，随时可以解封。',
        confirmLabel: '归档',
        tone: 'default',
      },
      () => {
        project.setArchived(id, true)
        pushNotice(`已归档「${target.name}」`, 'info')
      },
    )
  }

  function handleRemove(id: string): void {
    const target = board.projects.find(item => item.id === id)
    if (target === undefined) return
    const taskCount = board.allTasks.filter(task => task.projectId === id).length
    const logCount = board.allLogs.filter(log => log.projectId === id).length
    confirm.ask(
      {
        title: `删除项目「${target.name}」？`,
        description: `项目本身会被删除；${taskCount} 个任务与 ${logCount} 条日志会保留，但变成「未归属项目」。此操作不可撤销。`,
        confirmLabel: '删除项目',
        tone: 'danger',
      },
      () => {
        project.remove(id)
        pushNotice(`已删除项目「${target.name}」（数据保留）`, 'warn')
      },
    )
  }

  const archived = board.projects.filter(item => item.archived)
  const digest = currentProjectBundle()
  const focusMinutes = digest === undefined ? 0 : digest.tasks.reduce((sum, task) => sum + taskFocusMinutes(task), 0)

  return (
    <section className="osb-projectbar" aria-label="项目切换">
      <div className="osb-projectbar-row">
        <button
          type="button"
          className="osb-chip"
          aria-pressed={activeId === ''}
          onClick={() => board.setActiveProject('')}
        >
          全部项目
        </button>

        {board.activeProjects.map(item => (
          <button
            key={item.id}
            type="button"
            className="osb-chip"
            aria-pressed={activeId === item.id}
            onClick={() => board.setActiveProject(item.id)}
            title={item.note ?? item.name}
          >
            {item.color === undefined ? null : (
              <i
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  marginRight: 6,
                  background: item.color,
                  verticalAlign: 'middle',
                }}
              />
            )}
            {item.name}
          </button>
        ))}

        {creating ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              className="osb-input"
              style={{ width: 180 }}
              value={nameDraft}
              autoFocus
              placeholder="项目名"
              aria-label="新项目名称"
              onChange={event => setNameDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleCreate()
                if (event.key === 'Escape') setCreating(false)
              }}
            />
            <button type="button" className="osb-btn osb-btn-sm osb-btn-primary" onClick={handleCreate}>
              建
            </button>
            <button type="button" className="osb-btn osb-btn-sm" onClick={() => setCreating(false)}>
              取消
            </button>
          </span>
        ) : (
          <button type="button" className="osb-btn osb-btn-ghost osb-btn-sm" onClick={() => setCreating(true)}>
            ＋ 新建项目
          </button>
        )}

        <select
          className="osb-select"
          style={{ maxWidth: 160 }}
          value=""
          aria-label="按模板新建项目"
          onChange={event => handleTemplate(event.target.value)}
        >
          <option value="">模板…</option>
          {PROJECT_TEMPLATE_OPTIONS.map(template => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="osb-btn osb-btn-ghost osb-btn-sm"
          aria-pressed={managing}
          onClick={() => setManaging(value => !value)}
        >
          项目管理{archived.length > 0 ? ` · 归档 ${archived.length}` : ''}
        </button>
      </div>

      <div className="osb-projectbar-row">
        <span className="osb-hint">
          {activeName === undefined
            ? `全部项目 · ${board.activeProjects.length} 个进行中${archived.length > 0 ? ` · ${archived.length} 个已归档` : ''}`
            : `${activeName}${digest === undefined ? '' : ` · ${digest.tasks.length} 个任务 · 已专注 ${formatMinutes(focusMinutes)}`}`}
        </span>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <button
            type="button"
            className="osb-btn osb-btn-ghost osb-btn-sm"
            onClick={exportSnapshot}
            disabled={board.activeProject === undefined}
            title="把当前项目的任务、阻碍与重点会话摘要导出为快照"
          >
            导出项目快照
          </button>
          <button
            type="button"
            className="osb-btn osb-btn-ghost osb-btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={!BOARD_CONFIG.features.snapshot}
          >
            导入快照
          </button>
          <input
            ref={fileRef}
            className="osb-file-input"
            type="file"
            accept="application/json,.json"
            aria-hidden="true"
            tabIndex={-1}
            onChange={event => {
              void handleSnapshotFile(event.target.files?.[0])
            }}
          />
        </span>
      </div>

      {managing ? (
        <div className="osb-project-manage">
          {board.projects.length === 0 ? (
            <p className="osb-hint">还没有项目。用「新建项目」或选一个模板开始。</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {board.projects.map(item => {
                const taskCount = board.allTasks.filter(task => task.projectId === item.id).length
                return (
                  <li
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 0',
                      fontSize: 12,
                      opacity: item.archived ? 0.6 : 1,
                    }}
                  >
                    <span style={{ minWidth: 140, fontWeight: 500 }}>
                      {item.name}
                      {item.archived ? ' · 已归档' : ''}
                    </span>
                    <span style={{ color: 'var(--osb-text-3)' }}>{taskCount} 个任务</span>
                    <span style={{ flex: 1 }} />
                    {item.archived ? (
                      <button
                        type="button"
                        className="osb-btn osb-btn-sm"
                        onClick={() => handleArchive(item.id, false)}
                      >
                        解封
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="osb-btn osb-btn-sm"
                        onClick={() => handleArchive(item.id, true)}
                      >
                        归档
                      </button>
                    )}
                    <button
                      type="button"
                      className="osb-btn osb-btn-sm osb-btn-danger"
                      onClick={() => handleRemove(item.id)}
                    >
                      删除
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {confirm.dialog}
    </section>
  )
}
