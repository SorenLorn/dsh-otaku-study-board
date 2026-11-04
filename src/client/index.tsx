/**
 * Sorchron Study Board（溯时学习工作台）— CLIENT entry.
 *
 * The only file that touches the DOM. It registers **one left-nav entry** plus
 * the **standalone page** it opens, then composes the five V1 cards.
 *
 *   ┌ DSH left navigation ────────────────────────────────────────────────┐
 *   │  ◆ Plugins            (host, order 0)                               │
 *   │  ◆ Automation tasks   (host, order 10)                              │
 *   │  ◇ 溯时学习工作台      ← THIS plugin (order 20)                      │
 *   └─────────────────────────────────────────────────────────────────────┘
 *              click  →  a full page in the main column
 *
 * ── 关于 `ctx.slots.sidebarGuide.register`（重要，请先读这段）──────────────
 * 需求里指定用 `ctx.slots.sidebarGuide.register` 注册这张侧边导航卡片。实测结论：
 *
 *   · 在本机 DSH profile 的整个 node_modules 里（dsh-context / dshmarket /
 *     dsh-better-sidebar / 所有 @deepseek-ai 客户端包）grep 不到 `sidebarGuide`
 *     这个标识符，**当前发布版并没有这个 API**；
 *   · dsh-context 的「上下文洞察」页面、dshmarket 的「插件市场」页面，用的都是
 *     下面这两条 slot 组合，这也是目前唯一能真正渲染出一级入口 + 独立页面的写法：
 *
 *       1) ctx.slots.register({ name: 'main', key: PANEL_ID }, Page)
 *          —— keyed 主面板页面：被选中时占据主区（独立页面，不是 tab）；
 *       2) ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID,
 *                               order: 20, label }, Icon)
 *          —— 左侧导航栏的一级行；order 0 = 插件，10 = 自动化任务，20 = 上下文洞察。
 *          两条注册共用同一个 id，宿主据此知道「点这一行 → 打开哪个 main 面板」。
 *
 * 所以这里保留了一个 `registerSidebarGuide()` 适配层：调用点对外只有
 * 「注册一张 sidebarGuide 卡片」这一个形状 —— 宿主若真的提供了
 * `ctx.slots.sidebarGuide.register`，就直接走它；没有就走上面那两条已验证的
 * slot。改一个分支就能切换，不会出现「代码写着 sidebarGuide、界面却什么都不显示」。
 */
import { useState } from 'react'
import type { ClientCtx, SidebarGuideEntry, SlotComponent } from './types'
import { NoticeHost } from './ui/NoticeHost'
import { ConflictHost } from './ui/ConflictHost'
import { V4Shell, type V4Page } from './v4/Shell'
import { CaptureBridge } from './v4/CaptureBridge'
import { useSettlementRecovery } from './hooks/useSettlementRecovery'
import { Dashboard } from './v4/Dashboard'
import { Tasks } from './v4/Tasks'
import { Settings } from './v4/Settings'
import { History } from './v4/History'

/** Inlined by scripts/build.mjs from src/client/style/board.css. */
declare const __OSB_CSS_TEXT__: string

export const PACKAGE_ID = 'dsh-otaku-study-board'

/** The join key shared by the `main` page and the `sidebar.panellist` row. */
export const PANEL_ID = 'dsh-otaku-study-board'

/**
 * Row position in the left nav.
 * Host rows: Plugins = 0, Automation tasks = 10. dsh-context sits at 20; the
 * board slots in right after it so plugin-owned pages stay grouped.
 */
export const PANEL_ORDER = 20

/** Nav row + page title (Chinese, as requested). */
const PANEL_TITLE = '溯时学习工作台'
/** Formal one-liner: nav card second line, page lead. */
const PANEL_DESCRIPTION =
  'A local-first study workbench for DSH: project grouping, subtasks, pomodoro with breaks, Harness session capture, context insight, slash commands, friction log and project snapshots. All data stays on your device.'

/** `<style>` tag identity, so a reload reuses instead of duplicating. */
const STYLE_TAG_ID = `${PACKAGE_ID}/board.css`

/** Never let a plugin diagnostic break the host console contract. */
function warn(message: string, error?: unknown): void {
  try {
    console.warn(`[${PACKAGE_ID}] ${message}`, error ?? '')
  } catch {
    /* console unavailable — stay silent */
  }
}

/**
 * The nav glyph: a clock face with a check, for "time + study".
 * Drawn with `currentColor` so it inherits the host's nav item colour (and
 * therefore every skin) with no extra CSS.
 */
function BoardIcon(props: { size?: number }) {
  const size = props.size ?? 16
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="11" cy="12" r="7.4" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
      <path d="M11 8.2V12l2.6 1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.6 4.4l1.9 1.9 3.1-3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
    </svg>
  )
}

interface BoardPageProps {
  sessionId?: string
  ctx?: ClientCtx
}

/**
 * 统一工作台页面。
 *
 * Phase 5.2 起这里**只有一个**面向用户的界面：Dashboard / 任务页 + 统一浮层。
 * V3 的卡片组件（Overview / ProjectBar / TaskList / FocusTimer / SessionLog /
 * Stats）仍然完整保留在 `board/` 下，数据与兼容逻辑一行未改，但不再作为
 * 第二套工作台被渲染 —— 它们的能力会按阶段迁移进这个工作台。
 */
export function BoardPage({ sessionId, ctx }: BoardPageProps) {
  const [v4Page, setV4Page] = useState<V4Page>('dashboard')
  // 挂载时收敛「重复结算」（多标签页竞争的后手）；只跑一次，不占布局。
  useSettlementRecovery()
  const [createSignal, setCreateSignal] = useState(0)

  /** 从任意位置新建任务：切到任务页并打开表单。 */
  const openCreateTask = (): void => {
    setV4Page('tasks')
    setCreateSignal(value => value + 1)
  }

  return (
    <div className="osb-page v4-page" data-view="v4" data-osb-page="" data-session={sessionId ?? ''}>
      {/*
        自动采集的根级挂载点（Phase 5.5）。
        必须在页面根、且**只渲染一次**：`useHarnessEvent` 用模块级单例保证
        「同一时刻只有一组监听器」，多挂一处会互相踢掉。
      */}
      <CaptureBridge {...(ctx === undefined ? {} : { ctx })} {...(sessionId === undefined ? {} : { sessionId })} />
      <V4Shell page={v4Page} onPageChange={setV4Page}>
        {v4Page === 'tasks' ? (
          <Tasks createSignal={createSignal} />
        ) : v4Page === 'settings' ? (
          <Settings />
        ) : v4Page === 'history' ? (
          <History />
        ) : (
          <Dashboard onNavigate={() => setV4Page('tasks')} onCreateTask={openCreateTask} />
        )}
      </V4Shell>

      {/* 全局提示：存储损坏、写入超限、导入被拒等，浮层不影响布局 */}
      <div className="v4-scope v4-overlays">
        <NoticeHost />
        {/* 跨标签页冲突：不静默覆盖，交给用户决定（B2） */}
        <ConflictHost />
      </div>
    </div>
  )
}

/** How the entry was actually registered — useful in the console when debugging. */
export type SidebarGuideChannel = 'sidebarGuide' | 'main+panellist' | 'none'

export interface SidebarGuideRegistration {
  channel: SidebarGuideChannel
  /** Releases every seat this call took. */
  dispose: () => void
}

/**
 * Register the left-nav card **and** the standalone page it opens.
 *
 * 1. Preferred (as specified in the task): `ctx.slots.sidebarGuide.register(entry)`.
 *    Guarded, because current hosts do not serve that face.
 * 2. Fallback (what dsh-context's 「上下文洞察」 actually does):
 *      • `main`            → the keyed page;
 *      • `sidebar.panellist` → the first-level row.
 *    Both are `ctx.slots.inject(...)`-wrapped, so the registrations land whenever
 *    the host declares the slots instead of throwing when it has not yet.
 *
 * @param ctx - client cordis context
 * @param entry - id / order / title / description / icon of the nav card
 * @param page - the component the row opens
 */
export function registerSidebarGuide(
  ctx: ClientCtx,
  entry: SidebarGuideEntry,
  page: SlotComponent,
): SidebarGuideRegistration {
  const disposers: Array<() => void> = []
  const track = (disposer: unknown): void => {
    if (typeof disposer === 'function') disposers.push(disposer as () => void)
  }

  // ── 通道 A：宿主提供 ctx.slots.sidebarGuide（需求指定的形状）─────────────
  const guide = ctx.slots.sidebarGuide
  if (guide !== undefined && typeof guide.register === 'function') {
    try {
      track(guide.register(entry))
      return { channel: 'sidebarGuide', dispose: () => runAll(disposers) }
    } catch (error) {
      warn('ctx.slots.sidebarGuide.register threw — falling back to main + panellist', error)
    }
  }

  // ── 通道 B：当前发布版的真实写法（与 dsh-context 完全一致）───────────────
  try {
    // B1. 独立页面：keyed `main` 面板。点击导航行时宿主按同一个 id 选中它。
    track(
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: entry.id }, page),
      ),
    )

    // B2. 左侧导航一级行：`sidebar.panellist`，用 `id`（不是 `key`）与上面的
    //     面板对齐；宿主调用第二个组件参数渲染图标，只传 `size`。
    track(
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: entry.id,
            order: entry.order,
            label: entry.title,
          },
          props => entry.icon?.({ size: typeof props.size === 'number' ? props.size : undefined }) ?? null,
        ),
      ),
    )
  } catch (error) {
    warn('sidebar guide registration failed — releasing partial registrations', error)
    runAll(disposers)
    return { channel: 'none', dispose: () => undefined }
  }

  return { channel: 'main+panellist', dispose: () => runAll(disposers) }
}

/** Pop every disposer, ignoring the ones the host already released. */
function runAll(disposers: Array<() => void>): void {
  while (disposers.length > 0) {
    const dispose = disposers.pop()
    try {
      dispose?.()
    } catch {
      /* already released with the plugin tree */
    }
  }
}

/**
 * Inject the page stylesheet once.
 * @returns disposer that removes the tag, or undefined when nothing was added
 */
function installBoardStyles(): void | (() => void) {
  if (typeof document === 'undefined') return
  const cssText = typeof __OSB_CSS_TEXT__ === 'string' ? __OSB_CSS_TEXT__ : ''
  if (cssText === '') return
  try {
    if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) !== null) return
    const tag = document.createElement('style')
    tag.dataset.plugin = PACKAGE_ID
    tag.dataset.pluginCss = STYLE_TAG_ID
    tag.textContent = cssText
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  } catch (error) {
    warn('style injection failed — the page will render unstyled', error)
    return
  }
}

/**
 * Client entry (called by the DSH web shell once `slots` is served).
 * @param ctx - client cordis context
 */
export function apply(ctx: ClientCtx): void {
  try {
    ctx.effect(installBoardStyles, `${PACKAGE_ID}: board.css`)

    /**
     * The nav card descriptor. `id` doubles as the `main` panel key — that is
     * what makes "click the row → open the page" work without any navigation
     * code of our own.
     */
    const entry: SidebarGuideEntry = {
      id: PANEL_ID,
      order: PANEL_ORDER,
      title: () => PANEL_TITLE,
      description: () => PANEL_DESCRIPTION,
      icon: BoardIcon,
    }

    const page: SlotComponent = props => <BoardPage sessionId={props.sessionId} ctx={ctx} />

    ctx.effect(() => registerSidebarGuide(ctx, entry, page).dispose, `${PACKAGE_ID}: sidebar guide`)
  } catch (error) {
    warn('client apply failed — the page stays unmounted', error)
  }
}

export const name = PACKAGE_ID

/** Declared service: the slot registry (the only client service we need). */
export const inject = ['slots']

export default { name, inject, apply }
