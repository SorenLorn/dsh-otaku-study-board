/**
 * v4/Detail.tsx — 统一浮层宿主（抽屉 L3 + 居中弹层 L3）。
 *
 * 工作台里所有「展开成一块更大内容」的东西都从这里出：
 *   • 任务 / 统计 / 项目 / 活动 / 某一天 / 知识点 / 迁移计划 → 右侧抽屉；
 *   • 新建任务 / 编辑任务 → 居中弹层。
 *
 * 一次只允许一个浮层（状态在 workspace.tsx 里保证），因此关闭、Esc、
 * 焦点陷阱、滚动锁都只有一份实现：
 *   • Esc 关闭；
 *   • 点遮罩关闭（破坏性确认不放在遮罩里，删除确认走行内两步）；
 *   • Tab 在浮层内循环，关闭后焦点回到触发元素；
 *   • 背景滚动锁在 body 与 .osb-page 两层；
 *   • 关闭后恢复打开前的工作台滚动位置。
 *
 * 浮层挂到 `overlayHost()`：卡片上的 backdrop-filter / transform 不会把
 * position:fixed 关进卡片里。
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { overlayHost } from '../ui/overlay'
import { DetailContent } from './DetailContent'
import { TaskComposer } from './TaskComposer'
import { useWorkspace, useScrollLock, type DetailKind } from './workspace'
import { useBoardData } from '../hooks/useBoardData'

const KIND_LABEL: Record<DetailKind, string> = {
  task: '任务',
  stat: '统计',
  project: '项目',
  activity: '活动',
  day: '某一天',
  knowledge: '知识与记忆',
  roadmap: '迁移计划',
  unavailable: '尚未开放',
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 初始焦点优先给「第一个可输入的字段」。
 *
 * 为什么不是「第一个可聚焦元素」：浮层的第一个可聚焦元素通常是右上角的 ✕，
 * 打开「新建任务」就把焦点放在关闭按钮上，用户要先 Tab 一次才能打字 ——
 * 这是能测出来的体验缺陷，不是审美问题。
 */
const PREFERRED_FOCUS = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])'

/** Esc + Tab 环 + 初始焦点。只作用于当前浮层。 */
function useDialogKeys(panelRef: RefObject<HTMLElement>, active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(PREFERRED_FOCUS) ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || panel === null) return
      const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(node => node.getClientRects().length > 0)
      if (nodes.length === 0) {
        event.preventDefault()
        return
      }
      const head = nodes[0]!
      const tail = nodes[nodes.length - 1]!
      if (event.shiftKey && (document.activeElement === head || document.activeElement === panel)) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose, panelRef])
}

export function OverlayHost() {
  const { detail, modal, closeOverlay } = useWorkspace()
  const panelRef = useRef<HTMLDivElement>(null)
  const active = detail !== null || modal !== null
  useScrollLock(active)
  useDialogKeys(panelRef, active, closeOverlay)

  if (!active) return null

  return createPortal(
    <div
      className="v4-overlay"
      data-overlay={detail === null ? 'modal' : 'drawer'}
      onMouseDown={event => {
        if (event.target === event.currentTarget) closeOverlay()
      }}
    >
      {detail !== null ? (
        <div
          className="v4-drawer v4-glass-3"
          role="dialog"
          aria-modal="true"
          aria-label={detail.title}
          ref={panelRef}
        >
          <header className="v4-drawer-head">
            <div className="v4-drawer-title">
              <h2>{detail.title}</h2>
              <span className="v4-drawer-kind">{KIND_LABEL[detail.kind]}</span>
              {detail.note === undefined ? null : <span className="v4-drawer-note">{detail.note}</span>}
            </div>
            <button type="button" className="v4-close" aria-label="关闭" onClick={closeOverlay}>
              ✕
            </button>
          </header>
          <div className="v4-drawer-body">
            <DetailContent detail={detail} />
          </div>
        </div>
      ) : null}

      {modal !== null ? <TaskModal panelRef={panelRef} title={modal.title} kind={modal.kind} taskId={modal.taskId} /> : null}
    </div>,
    overlayHost(),
  )
}

/**
 * 弹层外壳。
 *
 * `panelRef` 用普通 prop 传进来，不用 `ref`：React 18 里函数组件收不到 ref
 * （会打 "Function components cannot be given refs" 警告，且 `panelRef.current` 为 null
 * → 弹层的 Tab 焦点环与初始焦点全靠运气）。传 prop 是这里最小且正确的做法。
 */
function TaskModal({
  panelRef,
  title,
  kind,
  taskId,
}: {
  panelRef: RefObject<HTMLDivElement>
  title: string
  kind: 'create-task' | 'edit-task'
  taskId?: string
}) {
  const { closeOverlay } = useWorkspace()
  const board = useBoardData()
  const task = taskId === undefined ? undefined : board.allTasks.find(item => item.id === taskId)

  return (
    <div className="v4-modal v4-glass-3" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
      <header className="v4-modal-head">
        <h2>{title}</h2>
        <button type="button" className="v4-close" aria-label="关闭" onClick={closeOverlay}>
          ✕
        </button>
      </header>
      <div className="v4-modal-body">
        <TaskComposer
          mode={kind === 'edit-task' ? 'edit' : 'create'}
          {...(task === undefined ? {} : { task })}
          defaultProjectId={board.activeProjectId}
          onDone={closeOverlay}
          onCancel={closeOverlay}
        />
      </div>
    </div>
  )
}

/** 供页面内联使用的小标题（不参与浮层）。 */
export function SectionLead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="v4-section-lead">
      <h3>{title}</h3>
      {children === undefined ? null : <p>{children}</p>}
    </div>
  )
}
