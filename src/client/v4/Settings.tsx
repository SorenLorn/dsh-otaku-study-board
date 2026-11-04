/**
 * v4/Settings.tsx — 统一工作台内的「设置 · 数据」页面。
 *
 * 只做数据管理，不掺 Focus / History：
 *   • 数据概览：各类实体真实条数；
 *   • 存储：插件实测字节 + 估算占比 + 浏览器站点级用量（分别标注口径）、可写性探测；
 *   • 导出：全量 / 近 7 天 / 当月，显示真实字节数、文件名与导出时间；
 *   • 导入：选文件 → 预览（不写） → 合并 / 覆盖（危险确认） → 事务写入 → 真实结果；
 *   • 危险区：两步确认清空 14 个键（事务，失败回滚）；
 *   • 边界说明：哪些能力其实不存在（增量恢复、自动快照、跨标签锁、精确剩余空间）。
 *
 * 约束：
 *   - 不新写备份格式 / 合并逻辑，全部走 lib/backup + lib/tx；
 *   - 不在组件里直接碰 localStorage（探测走 lib/storage）；
 *   - 不新写 Modal / Drawer；危险确认是页面内的两步操作。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  BackupScope,
  DailyAggregate,
  HistorySnapshot,
  KnowledgeGraph,
  ProjectMemory,
  ReviewRecord,
  TimelineEvent,
} from '../types'
import { STORAGE_KEYS } from '../types'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardSettings } from '../hooks/useBoardSettings'
import { useCaptureState } from '../hooks/useCaptureState'
import { useBackup } from '../hooks/useBackup'
import { useLocalStore } from '../hooks/useLocalStore'
import { useStorageQuota, formatBytes } from '../hooks/useStorageQuota'
import { BACKUP_SCOPE_LABELS } from '../lib/config'
import { downloadText } from '../lib/backup'
import { formatRelative, formatTime } from '../lib/time'
import { probeWritable, readOriginEstimate, storageStatus, type OriginEstimate } from '../lib/storage'
import { Button, Card, ProgressBar } from './ui'
import { useDataTransfer } from './useDataTransfer'

type ExportPhase = 'idle' | 'preparing' | 'ready' | 'error'

interface ExportState {
  phase: ExportPhase
  message?: string
  fileName?: string
  bytes?: number
  at?: number
  counts?: string
}

export function Settings() {
  const board = useBoardData()
  const { settings, patch } = useBoardSettings()
  const capture = useCaptureState()
  const backup = useBackup()
  const [memory] = useLocalStore<ProjectMemory[]>(STORAGE_KEYS.memory, [])
  const [graph] = useLocalStore<KnowledgeGraph>(STORAGE_KEYS.knowledge, { nodes: [], edges: [] })
  const [reviews] = useLocalStore<ReviewRecord[]>(STORAGE_KEYS.reviews, [])
  const [timeline] = useLocalStore<TimelineEvent[]>(STORAGE_KEYS.timeline, [])
  const [history] = useLocalStore<HistorySnapshot[]>(STORAGE_KEYS.history, [])
  const [daily] = useLocalStore<DailyAggregate[]>(STORAGE_KEYS.daily, [])
  const quota = useStorageQuota(
    `${board.allTasks.length}:${board.allLogs.length}:${board.allFriction.length}:${daily.length}`,
  )

  const status = useMemo(() => storageStatus(), [])
  const [probe, setProbe] = useState<{ ok: boolean; at: number } | null>(null)
  const [origin, setOrigin] = useState<OriginEstimate | null | undefined>(undefined)

  const [scope, setScope] = useState<BackupScope>('all')
  const [exportState, setExportState] = useState<ExportState>({ phase: 'idle' })

  const transfer = useDataTransfer()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [overwriteAck, setOverwriteAck] = useState(false)

  const [clearStep, setClearStep] = useState(0)
  const [clearAck, setClearAck] = useState(false)
  const [clearResult, setClearResult] = useState<{ ok: boolean; message: string } | null>(null)

  // 站点级用量：只有浏览器提供时才显示，且单独标注「整个站点」。
  useEffect(() => {
    let alive = true
    void readOriginEstimate().then(value => {
      if (alive) setOrigin(value)
    })
    return () => {
      alive = false
    }
  }, [quota.bytes])

  // 导入 / 清空后重算容量。
  useEffect(() => {
    if (transfer.result !== null) quota.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer.result])
  useEffect(() => {
    if (clearResult !== null) quota.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearResult])

  // 覆盖模式切换时，必须重新确认。
  useEffect(() => {
    setOverwriteAck(false)
  }, [transfer.mode, transfer.source])

  const counts = [
    { label: '任务', value: board.allTasks.length },
    { label: '会话日志', value: board.allLogs.length },
    { label: '项目', value: board.projects.length },
    { label: '阻碍记录', value: board.allFriction.length },
    { label: '日聚合', value: daily.length },
    { label: '时间轴', value: timeline.length },
    { label: '项目记忆', value: memory.length },
    { label: '知识节点', value: graph.nodes.length },
    { label: '复习记录', value: reviews.length },
    { label: '历史快照', value: history.length },
  ]

  async function handleExport(target: BackupScope = scope): Promise<void> {
    setExportState({ phase: 'preparing' })
    // 让浏览器先画一帧「正在准备」，再同步组装（大文件时有可感知的停顿）。
    await new Promise(resolve => setTimeout(resolve, 0))
    const prepared = backup.prepareExport(target)
    if (!prepared.ok) {
      setExportState({ phase: 'error', message: prepared.message })
      return
    }
    const ok = downloadText(prepared.fileName, prepared.text)
    if (!ok) {
      setExportState({ phase: 'error', message: '导出失败：浏览器拒绝了下载（检查下载权限或弹窗拦截）' })
      return
    }
    setExportState({
      phase: 'ready',
      fileName: prepared.fileName,
      bytes: prepared.bytes,
      at: prepared.generatedAt,
      counts: `${prepared.counts.tasks} 任务 / ${prepared.counts.logs} 日志 / ${prepared.counts.projects} 项目 / ${prepared.counts.memory} 记忆 / ${prepared.counts.knowledge} 知识点`,
    })
  }

  function handleClear(): void {
    const outcome = backup.clearAll()
    setClearResult(outcome)
    if (outcome.ok) {
      setClearStep(0)
      setClearAck(false)
    }
  }

  const busy = transfer.phase === 'reading' || transfer.phase === 'importing'

  return (
    <div className="v4-settings">
      <div className="v4-settings-head">
        <h2 className="v4-task-page-title">设置 · 数据</h2>
        <p className="v4-task-counts">导出 / 导入 / 容量 / 清空都在这里；数据只存在本机。</p>
      </div>

      <Card title="数据概览" meta={`${board.allTasks.length + board.allLogs.length} 条核心记录`}>
        <dl className="v4-data-counts">
          {counts.map(row => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="v4-panel-hint">统计的是存储里的真实条数，不是估算；归档项目也计入。</p>
      </Card>

      <Card title="会话采集" meta={capture.status === 'on' ? '监听中' : capture.status === 'error' ? '异常' : '已关闭'}>
        <div className="v4-capture">
          <label className="v4-capture-toggle">
            <input
              type="checkbox"
              checked={settings.autoCapture}
              onChange={event => patch({ autoCapture: event.target.checked })}
            />
            <span>
              <strong>自动记录 DSH 会话</strong>
              <span className="v4-capture-note">
                只记「发生了什么」（类型、标题、行数、文件名的摘要），不保存代码原文、图片和二进制。
              </span>
            </span>
          </label>
          <dl className="v4-data-facts">
            <div>
              <dt>监听状态</dt>
              <dd data-capture-status={capture.status}>{capture.detail}</dd>
            </div>
            <div>
              <dt>事件通道</dt>
              <dd>{capture.status === 'on' ? '已绑定（详见控制台）' : '未绑定'}</dd>
            </div>
            <div>
              <dt>与专注的关系</dt>
              <dd>自动记录只计入「会话数」，不计入专注分钟</dd>
            </div>
          </dl>
          <p className="v4-panel-hint">
            采集在工作台根节点监听，切换页面不会中断；关闭后立刻摘掉监听器。
            斜杠命令（/board-*）本阶段只拦截、不执行。
          </p>
        </div>
      </Card>

      <Card title="存储" meta={status.label}>
        <div className="v4-data-storage">
          <div className="v4-data-storage-head">
            <div>
              <p className="v4-data-big">{formatBytes(quota.bytes)}</p>
              <p className="v4-data-label">本插件已用（按 UTF-16 字符估算）</p>
            </div>
            <div className="v4-data-storage-side">
              <p className="v4-data-label">估算占比</p>
              <p className="v4-data-value">
                {quota.bytes > 0 && Math.round(quota.ratio * 100) === 0 ? '<1%' : `${Math.round(quota.ratio * 100)}%`}
              </p>
              <p className="v4-data-label">按 5 MB 假定配额</p>
            </div>
          </div>
          <ProgressBar value={quota.ratio} showValue />
          <p className="v4-data-note">{status.detail}</p>

          <div className="v4-data-facts">
            <div>
              <dt>存储状态</dt>
              <dd>{status.label}</dd>
            </div>
            <div>
              <dt>可写性</dt>
              <dd>
                {probe === null ? '未测试' : probe.ok ? '写入成功' : '写入失败'}
                {probe === null ? null : <span className="v4-data-faint"> · {formatTime(probe.at)}</span>}
              </dd>
            </div>
            <div>
              <dt>浏览器站点用量</dt>
              <dd>
                {origin === undefined
                  ? '读取中…'
                  : origin === null
                    ? '浏览器不提供'
                    : `${formatBytes(origin.usage)} / ${formatBytes(origin.quota)}`}
              </dd>
            </div>
            <div>
              <dt>站点剩余（含宿主）</dt>
              <dd>{origin === undefined ? '读取中…' : origin === null ? '不可用' : formatBytes(Math.max(0, origin.quota - origin.usage))}</dd>
            </div>
            <div>
              <dt>本次会话最近导出</dt>
              <dd>{exportState.phase === 'ready' && exportState.at !== undefined ? formatRelative(exportState.at) : '尚未导出'}</dd>
            </div>
          </div>
          <p className="v4-panel-hint">
            站点用量包含 DSH 宿主与其它插件，不是本插件的剩余空间；本插件配额无法从浏览器精确读取。
            没有持久化的备份历史，导出时间只在本次会话内可见。
          </p>

          <div className="v4-panel-actions">
            <Button
              size="sm"
              onClick={() => setProbe({ ok: probeWritable(), at: Date.now() })}
              title="写入 1 字节再删除，验证当前是否真的可写"
            >
              测试写入
            </Button>
            {probe === null ? null : (
              <span className={probe.ok ? 'v4-data-ok' : 'v4-data-bad'} role="status">
                {probe.ok ? '可写' : '不可写：存储已满或被禁用'}
              </span>
            )}
          </div>

          <details className="v4-data-details">
            <summary>各键占用明细（{quota.breakdown.length} 项）</summary>
            <ul className="v4-data-keys">
              {quota.breakdown.map(item => (
                <li key={item.key}>
                  <span className="v4-data-key">{item.label}</span>
                  <span className="v4-data-keyval">{formatBytes(item.bytes)}</span>
                  <span className="v4-data-keyshare">{Math.round(item.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </Card>

      <Card title="导出" meta={`${BACKUP_SCOPE_LABELS[scope]} · 明文 JSON`}>
        <div className="v4-data-row">
          <div className="v4-task-segments" role="group" aria-label="导出范围">
            {(['all', 'week', 'month'] as const).map(key => (
              <button
                key={key}
                type="button"
                className={scope === key ? 'v4-segment is-active' : 'v4-segment'}
                aria-pressed={scope === key}
                onClick={() => setScope(key)}
              >
                {BACKUP_SCOPE_LABELS[key]}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => void handleExport()} loading={exportState.phase === 'preparing'}>
            生成并下载
          </Button>
        </div>

        <p className="v4-data-note">
          {scope === 'all'
            ? '全量包含所有项目（含已归档）、任务、日志、阻碍、记忆、知识、复习、时间轴、历史快照与日聚合。'
            : `${BACKUP_SCOPE_LABELS[scope]}导出按时间窗筛选任务 / 日志 / 阻碍 / 复习 / 事件 / 日聚合；记忆与知识是活文档，整体带出。`}
        </p>

        {exportState.phase === 'preparing' ? (
          <p className="v4-data-status" role="status">
            正在准备导出…
          </p>
        ) : null}
        {exportState.phase === 'ready' ? (
          <div className="v4-data-result" data-ok="true" role="status">
            <p className="v4-data-result-title">已生成并开始下载</p>
            <p className="v4-data-result-body">
              {exportState.fileName} · {formatBytes(exportState.bytes ?? 0)} · {formatTime(exportState.at ?? Date.now())}
            </p>
            <p className="v4-data-faint">{exportState.counts}</p>
          </div>
        ) : null}
        {exportState.phase === 'error' ? (
          <div className="v4-data-result" data-ok="false" role="alert">
            <p className="v4-data-result-title">导出失败</p>
            <p className="v4-data-result-body">{exportState.message}</p>
          </div>
        ) : null}

        <p className="v4-panel-hint">
          现有系统没有真正的增量恢复语义：近 7 天 / 当月只是时间窗导出，
          导入仍然只有「按 id 合并」与「整体覆盖」两种。不要把时间窗当成可回滚的增量链。
        </p>
      </Card>

      <Card title="导入" meta="先预览，再写入">
        <div className="v4-data-import">
          <div className="v4-data-row">
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              选择备份文件…
            </Button>
            <span className="v4-data-faint">仅接受 .json，单文件上限约 8 MB 文本</span>
            <input
              ref={fileRef}
              className="v4-data-file"
              type="file"
              accept="application/json,.json"
              aria-label="选择备份文件"
              onChange={event => {
                void transfer.pick(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          {transfer.phase === 'idle' ? (
            <p className="v4-data-note">选择文件后会先解析并列出条数与冲突，确认前不会写入任何数据。</p>
          ) : null}

          {transfer.phase === 'reading' ? (
            <p className="v4-data-status" role="status">
              正在读取并校验文件…
            </p>
          ) : null}

          {transfer.phase === 'error' ? (
            <div className="v4-data-result" data-ok="false" role="alert">
              <p className="v4-data-result-title">导入未执行</p>
              <p className="v4-data-result-body">{transfer.error}</p>
              <div className="v4-panel-actions">
                <Button size="sm" variant="ghost" onClick={transfer.reset}>
                  知道了
                </Button>
              </div>
            </div>
          ) : null}

          {transfer.phase === 'done' && transfer.result !== null ? (
            <div className="v4-data-result" data-ok={transfer.result.ok ? 'true' : 'false'} role="status">
              <p className="v4-data-result-title">{transfer.result.title}</p>
              <p className="v4-data-result-body">{transfer.result.detail}</p>
              <p className="v4-data-faint">{formatRelative(transfer.result.at)} · 已写入本机</p>
              <div className="v4-panel-actions">
                <Button size="sm" variant="ghost" onClick={transfer.reset}>
                  完成
                </Button>
              </div>
            </div>
          ) : null}

          {transfer.source !== null && transfer.phase !== 'done' ? (
            <div className="v4-data-source">
              <div className="v4-data-source-head">
                <span className="v4-data-source-name">{transfer.source.fileName}</span>
                <span className="v4-data-faint">{formatBytes(transfer.source.sizeBytes)}</span>
              </div>
              <dl className="v4-data-facts">
                <div>
                  <dt>Schema 版本</dt>
                  <dd>{transfer.source.version === 0 ? '未标注' : `v${transfer.source.version}`}</dd>
                </div>
                <div>
                  <dt>导出时间</dt>
                  <dd>{formatRelative(transfer.source.exportedAt)}</dd>
                </div>
                <div>
                  <dt>导出范围</dt>
                  <dd>{transfer.source.scope === undefined ? '未标注' : BACKUP_SCOPE_LABELS[transfer.source.scope]}</dd>
                </div>
                <div>
                  <dt>记忆草稿</dt>
                  <dd>{transfer.source.draftCount} 条</dd>
                </div>
              </dl>
              <dl className="v4-data-counts is-compact">
                {(
                  [
                    ['任务', transfer.source.counts.tasks],
                    ['日志', transfer.source.counts.logs],
                    ['项目', transfer.source.counts.projects],
                    ['阻碍', transfer.source.counts.friction],
                    ['日聚合', transfer.source.counts.daily],
                    ['时间轴', transfer.source.counts.timeline],
                    ['记忆', transfer.source.counts.memory],
                    ['知识点', transfer.source.counts.knowledge],
                    ['复习', transfer.source.counts.reviews],
                    ['快照', transfer.source.counts.history],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              {transfer.source.droppedTotal > 0 ? (
                <p className="v4-data-warn" role="alert">
                  文件里有 {transfer.source.droppedTotal} 条记录无法识别，导入时会跳过：
                  任务 {transfer.source.dropped.tasks} · 日志 {transfer.source.dropped.logs} · 项目{' '}
                  {transfer.source.dropped.projects} · 阻碍 {transfer.source.dropped.friction}
                </p>
              ) : null}
              {transfer.source.version !== 0 && transfer.source.version < 4 ? (
                <p className="v4-data-note">这是 v{transfer.source.version} 备份，会按当前 schema 兼容读取（缺失字段走默认值）。</p>
              ) : null}
            </div>
          ) : null}

          {transfer.preview !== null && transfer.phase === 'preview' ? (
            <>
              <div className="v4-data-preview">
                <table>
                  <caption className="v4-visually-hidden">本地与备份条数对比</caption>
                  <thead>
                    <tr>
                      <th scope="col">实体</th>
                      <th scope="col">本地</th>
                      <th scope="col">备份</th>
                      <th scope="col">同 id 冲突</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['任务', 'tasks'],
                        ['日志', 'logs'],
                        ['项目', 'projects'],
                        ['阻碍', 'friction'],
                      ] as const
                    ).map(([label, key]) => (
                      <tr key={key}>
                        <th scope="row">{label}</th>
                        <td>{transfer.preview!.local[key]}</td>
                        <td>{transfer.preview!.incoming[key]}</td>
                        <td className={transfer.preview!.conflicts[key] > 0 ? 'v4-data-bad' : undefined}>
                          {transfer.preview!.conflicts[key]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="v4-data-faint">
                  另外：记忆 {transfer.preview.extra?.memory ?? 0} · 知识 {transfer.preview.extra?.knowledge ?? 0} · 复习{' '}
                  {transfer.preview.extra?.reviews ?? 0} · 事件 {transfer.preview.extra?.timeline ?? 0} · 快照{' '}
                  {transfer.preview.extra?.history ?? 0} · 日聚合 {transfer.preview.extra?.daily ?? 0}
                </p>
              </div>

              <div className="v4-data-row">
                <div className="v4-task-segments" role="group" aria-label="导入模式">
                  <button
                    type="button"
                    className={transfer.mode === 'merge' ? 'v4-segment is-active' : 'v4-segment'}
                    aria-pressed={transfer.mode === 'merge'}
                    onClick={() => transfer.setMode('merge')}
                  >
                    合并
                  </button>
                  <button
                    type="button"
                    className={transfer.mode === 'overwrite' ? 'v4-segment is-active is-danger' : 'v4-segment'}
                    aria-pressed={transfer.mode === 'overwrite'}
                    onClick={() => transfer.setMode('overwrite')}
                  >
                    覆盖
                  </button>
                </div>
                <span className="v4-data-faint">
                  {transfer.mode === 'merge' ? '同 id 以备份为准，本地独有记录保留' : '用备份整体替换，本地独有记录会丢失'}
                </span>
              </div>

              {transfer.mode === 'merge' ? (
                <div className="v4-data-confirm">
                  <p className="v4-data-note">合并只影响同 id 记录；不会删除本地独有的任务 / 日志。</p>
                  <div className="v4-panel-actions">
                    <Button variant="primary" size="sm" onClick={() => void transfer.commit()}>
                      合并导入
                    </Button>
                    <Button variant="ghost" size="sm" onClick={transfer.discard}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="v4-data-danger">
                  <p className="v4-data-danger-title">覆盖会替换本地数据</p>
                  <p className="v4-data-danger-body">
                    任务、日志、项目、阻碍、记忆、知识、复习、时间轴、历史快照与日聚合都会被备份替换；
                    本地独有的记录会消失，且无法在这个页面直接撤销。
                  </p>
                  <label className="v4-data-ack">
                    <input type="checkbox" checked={overwriteAck} onChange={event => setOverwriteAck(event.target.checked)} />
                    <span>我了解本地数据将被替换，并且已经（或准备）先导出一份当前数据。</span>
                  </label>
                  <div className="v4-panel-actions">
                    <Button variant="danger" size="sm" disabled={!overwriteAck} onClick={() => void transfer.commit()}>
                      覆盖并替换
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleExport('all')}>
                      先导出当前数据
                    </Button>
                    <Button variant="ghost" size="sm" onClick={transfer.discard}>
                      取消
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {transfer.phase === 'importing' ? (
            <p className="v4-data-status" role="status">
              正在写入 12 个键（全写或回滚）…
            </p>
          ) : null}
        </div>
      </Card>

      <Card title="危险区" meta="不可撤销" variant="quiet">
        {clearStep === 0 ? (
          <div>
            <p className="v4-data-note">
              清空会删除本机所有看板数据（14 个键）。没有回收站，只能靠之前导出的 JSON 恢复。
            </p>
            <Button variant="danger" size="sm" onClick={() => { setClearStep(1); setClearAck(false) }}>
              清空全部数据…
            </Button>
          </div>
        ) : (
          <div className="v4-data-danger">
            <p className="v4-data-danger-title">确认清空本机全部数据？</p>
            <p className="v4-data-danger-body">
              将删除：任务、日志、项目、阻碍、设置、计时状态、记忆、知识、复习、时间轴、历史快照、日聚合、AI 审计。
              此操作不可撤销。
            </p>
            <label className="v4-data-ack">
              <input type="checkbox" checked={clearAck} onChange={event => setClearAck(event.target.checked)} />
              <span>我已导出需要保留的数据，确认清空。</span>
            </label>
            <div className="v4-panel-actions">
              <Button variant="danger" size="sm" disabled={!clearAck} onClick={handleClear}>
                确认清空
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setClearStep(0); setClearAck(false) }}>
                取消
              </Button>
            </div>
          </div>
        )}
        {clearResult === null ? null : (
          <div className="v4-data-result" data-ok={clearResult.ok ? 'true' : 'false'} role={clearResult.ok ? 'status' : 'alert'}>
            <p className="v4-data-result-title">{clearResult.ok ? '已清空' : '清空未完成'}</p>
            <p className="v4-data-result-body">{clearResult.message}</p>
          </div>
        )}
      </Card>

      <Card title="能力边界" variant="quiet">
        <ul className="v4-data-limits">
          <li>没有真正的「增量恢复」：近 7 天 / 当月只是导出时间窗，导入仍只有合并与覆盖。</li>
          <li>导入前不会自动创建恢复快照；需要的话请先手动「生成并下载」一份全量备份。</li>
          <li>没有跨标签页的导入互斥锁：两个标签同时导入时，后写入的会覆盖先写入的。</li>
          <li>浏览器不提供 localStorage 的精确剩余空间；页面上的占比是按 5 MB 估算。</li>
          <li>回滚依赖 localStorage 逐键恢复：空间真满时回滚也可能失败，此时会明确提示「数据可能不一致」。</li>
        </ul>
      </Card>
    </div>
  )
}
