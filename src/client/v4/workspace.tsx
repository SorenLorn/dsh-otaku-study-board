/**
 * v4/workspace.tsx — 统一工作台的**唯一**交互状态。
 *
 * 一个工作台里同时可能存在四种「展开」：卡片内展开、右侧抽屉、居中弹层、
 * 以及被选中的任务。如果每个组件各写一套 useState，就会出现：
 *   • 两个抽屉同时开着，Esc 不知道该关哪个；
 *   • 打开弹层后背景还能滚；
 *   • 关闭后不知道回到哪里、焦点丢到 body；
 *   • 卡片展开状态与抽屉详情对不上。
 *
 * 所以全部收在这里，并且**同一时刻只允许一个浮层**（抽屉或弹层）：
 * `openDetail` 会先收起弹层，`openModal` 会先收起抽屉。卡片内展开可以同时
 * 存在（它是工作台的一部分，不遮挡内容），但同组只保留一个，避免整页摊开。
 *
 * 另外两个容易被忽略的状态：
 *   • `returnFocus` —— 打开浮层前的焦点元素，关闭后还给它；
 *   • `scrollTop`   —— 打开前的工作台位置，关闭后恢复，保证「返回原处」。
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/** 抽屉正文的种类。`unavailable` 用于明确说明「尚未开放」。 */
export type DetailKind = 'task' | 'stat' | 'project' | 'activity' | 'day' | 'knowledge' | 'roadmap' | 'unavailable'

export interface DetailRef {
  kind: DetailKind
  /** 任务 / 项目 / 事件 / 统计 / 知识点 / 日期的标识。 */
  id?: string
  title: string
  /** 副标题，例如「统计 · 今天」。 */
  note?: string
}

export type ModalKind = 'create-task' | 'edit-task'

export interface ModalRef {
  kind: ModalKind
  taskId?: string
  title: string
}

interface WorkspaceApi {
  /** 当前展开的卡片内面板 id（同组唯一）。 */
  expandedId: string | null
  /** 当前抽屉。 */
  detail: DetailRef | null
  /** 当前弹层。 */
  modal: ModalRef | null
  /** 当前选中的任务行。 */
  selectedTaskId: string | null
  toggleExpanded: (id: string) => void
  collapseAll: () => void
  openDetail: (ref: DetailRef) => void
  openModal: (ref: ModalRef) => void
  closeOverlay: () => void
  selectTask: (id: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null)

export function useWorkspace(): WorkspaceApi {
  const api = useContext(WorkspaceContext)
  if (api === null) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return api
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailRef | null>(null)
  const [modal, setModal] = useState<ModalRef | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  /** 打开浮层前的焦点与滚动位置；不参与渲染，所以放 ref。 */
  const returnFocus = useRef<HTMLElement | null>(null)
  const scrollTop = useRef(0)

  const remember = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement
    scrollTop.current = window.scrollY || document.documentElement.scrollTop || 0
  }, [])

  const openDetail = useCallback(
    (ref: DetailRef) => {
      remember()
      setModal(null)
      setDetail(ref)
    },
    [remember],
  )

  const openModal = useCallback(
    (ref: ModalRef) => {
      remember()
      setDetail(null)
      setModal(ref)
    },
    [remember],
  )

  const closeOverlay = useCallback(() => {
    setDetail(null)
    setModal(null)
    const target = returnFocus.current
    returnFocus.current = null
    const y = scrollTop.current
    // 等浮层卸载、锁定解除后再恢复位置，否则滚动会被裁掉。
    window.setTimeout(() => {
      if (y > 0) window.scrollTo({ top: y })
      if (target !== null && document.contains(target)) target.focus({ preventScroll: true })
    }, 0)
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        expandedId,
        detail,
        modal,
        selectedTaskId,
        toggleExpanded: id => setExpandedId(current => (current === id ? null : id)),
        collapseAll: () => setExpandedId(null),
        openDetail,
        openModal,
        closeOverlay,
        selectTask: setSelectedTaskId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

/**
 * 浮层打开期间锁滚动。
 *
 * 两层都要锁：宿主页面的滚动容器是 `.osb-page`，但独立页面测试里滚动发生在
 * body / documentElement。只锁一层会出现「抽屉后面还能滚」。
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const page = document.querySelector<HTMLElement>('.osb-page')
    const pageOverflow = page?.style.overflow ?? ''
    const bodyOverflow = document.body.style.overflow
    if (page !== null) page.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      if (page !== null) page.style.overflow = pageOverflow
      document.body.style.overflow = bodyOverflow
    }
  }, [active])
}
