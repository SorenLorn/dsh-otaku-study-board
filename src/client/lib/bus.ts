/**
 * bus.ts — 两个进程内的轻量通道，不引入任何状态库。
 *
 *   1. 通知通道：存储损坏、写入超限、导入被拒这类「用户必须看见但不该打断操作」
 *      的消息，由任意模块 push，由 `ui/NoticeHost` 统一渲染成角落提示。
 *   2. 采集状态通道：日志卡掌握真实的监听结果，调试面板需要显示同一份状态，
 *      所以状态放在模块里广播，而不是层层传 props。
 *
 * 刻意不依赖 React：这样 `lib/*` 与 `hooks/useLocalStore` 都能安全地 push 通知，
 * 不会因为 import 顺序把 React 拖进纯逻辑层。
 */

/** 通知等级 → 颜色由 NoticeHost 决定。 */
export type NoticeLevel = 'info' | 'success' | 'warn' | 'error'

export interface Notice {
  id: string
  level: NoticeLevel
  text: string
  at: number
}

/** 同时最多显示三条，旧的自动顶掉，避免刷屏遮挡界面。 */
const MAX_NOTICES = 3

let sequence = 0
let notices: Notice[] = []
const noticeListeners = new Set<() => void>()

/** 推送一条提示。同样的文字在 5 秒内只显示一次，防止循环里刷屏。 */
export function pushNotice(text: string, level: NoticeLevel = 'info'): void {
  try {
    const now = Date.now()
    if (notices.some(item => item.text === text && now - item.at < 5000)) return
    sequence += 1
    const notice: Notice = { id: `notice-${sequence}`, level, text, at: now }
    notices = [...notices, notice].slice(-MAX_NOTICES)
    for (const listener of noticeListeners) listener()
  } catch {
    /* 通知本身失败不能再抛错 —— 那会变成二次故障 */
  }
}

export function dismissNotice(id: string): void {
  notices = notices.filter(item => item.id !== id)
  for (const listener of noticeListeners) listener()
}

export function getNotices(): readonly Notice[] {
  return notices
}

export function subscribeNotices(listener: () => void): () => void {
  noticeListeners.add(listener)
  return () => {
    noticeListeners.delete(listener)
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 存储广播事件名（V4：从 useLocalStore 提到 lib，让 repo 也能复用）
 * ──────────────────────────────────────────────────────────────────────────── */

/** 同页写入广播：`{ key, raw }`。所有仓储实现共用这一个事件名，不能改。 */
export const STORE_EVENT = 'dsh-otaku-study-board:store'

/* ────────────────────────────────────────────────────────────────────────────
 * 采集状态
 * ──────────────────────────────────────────────────────────────────────────── */

/** `on` 监听正常 · `off` 已关闭 · `error` 监听异常（通道未接上 / 回调连续失败）。 */
export type CaptureStatus = 'on' | 'off' | 'error'

export interface CaptureState {
  status: CaptureStatus
  /** 人话说明，显示在调试面板的指示灯旁。 */
  detail: string
}

let captureState: CaptureState = { status: 'off', detail: '未开始监听' }
const captureListeners = new Set<() => void>()

export function setCaptureStatus(status: CaptureStatus, detail: string): void {
  if (captureState.status === status && captureState.detail === detail) return
  captureState = { status, detail }
  for (const listener of captureListeners) listener()
}

export function getCaptureState(): CaptureState {
  return captureState
}

export function subscribeCapture(listener: () => void): () => void {
  captureListeners.add(listener)
  return () => {
    captureListeners.delete(listener)
  }
}
