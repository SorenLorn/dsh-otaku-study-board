/**
 * Time helpers — every date in this plugin is a local wall-clock date.
 *
 * The board is a *local* notebook: "today" means the user's today, not UTC's.
 * So every bucket key is built from `Date` locals (`getFullYear` / `getMonth` /
 * `getDate`), never from `toISOString()`, which would shift the day boundary for
 * anyone east of Greenwich. The only place UTC appears is nothing — there is no
 * place.
 */

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/** Two-digit zero pad. */
export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local `YYYY-MM-DD`; the day bucket every aggregate uses. */
export function dayKey(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Local `YYYY-MM`. */
export function monthKey(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/** Midnight of the given day, local time. */
export function startOfDay(at: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Midnight of the Monday in the given week (the Chinese week starts Monday). */
export function startOfWeek(at: number): number {
  const date = new Date(startOfDay(at))
  const weekday = date.getDay()
  const offset = weekday === 0 ? 6 : weekday - 1
  date.setDate(date.getDate() - offset)
  return date.getTime()
}

/** Midnight of the first day of the given month. */
export function startOfMonth(at: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  date.setDate(1)
  return date.getTime()
}

/** The last `count` day keys, oldest first, ending today. */
export function recentDayKeys(count: number, now = Date.now()): string[] {
  const keys: string[] = []
  const cursor = new Date(startOfDay(now))
  for (let index = count - 1; index >= 0; index -= 1) {
    const day = new Date(cursor)
    day.setDate(day.getDate() - index)
    keys.push(dayKey(day.getTime()))
  }
  return keys
}

/** `1500` → `25:00`. Used by the countdown face. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`
}

/** `95` → `1h 35m`, `40` → `40m`, `0` → `0m`. */
export function formatMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes))
  if (safe === 0) return '0m'
  const hours = Math.floor(safe / 60)
  const minutes = safe % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/** `14:07`. */
export function formatTime(at: number): string {
  const date = new Date(at)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** `10 月 26 日`. */
export function formatMonthDay(at: number): string {
  const date = new Date(at)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

/** `10 月 26 日 · 周一`. */
export function formatMonthDayWeek(at: number): string {
  return `${formatMonthDay(at)} · ${WEEKDAY_ZH[new Date(at).getDay()]}`
}

/** `2026 年 10 月 26 日 · 周一`. */
export function formatFullDate(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${WEEKDAY_ZH[date.getDay()]}`
}

/** `YYYY-MM-DD` for a `<time datetime>` attribute. */
export function isoDate(at: number): string {
  return dayKey(at)
}

/** Short weekday label (`周一`) for a day key. */
export function weekdayOfDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  return WEEKDAY_ZH[date.getDay()]
}

/* ────────────────────────────────────────────────────────────────────────────
 * V3 新增：日期输入 / 范围 / 相对时间
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `<input type="date">` 的 `YYYY-MM-DD` → 当天 **23:59:59.999** 的本地时间戳。
 *
 * 为什么取当天末尾而不是 00:00：截止日期是「这天结束前做完」，用 00:00 会让当天
 * 一早显示逾期，用户会以为坏了。
 *
 * @returns 合法时间戳，或 `null`（格式错 / 日期不存在，如 2026-02-31）
 */
export function parseDateInput(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 23, 59, 59, 999)
  // 反向校验：2026-02-31 会被 Date 静默滚到 3 月，这里要挡住。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date.getTime()
}

/** 时间戳 → `YYYY-MM-DD`（给 date input 用）。 */
export function formatDateInput(at: number): string {
  return dayKey(at)
}

/** 相对时间：`刚刚` / `12 分钟前` / `3 小时前` / `2 天前` / 具体日期。 */
export function formatRelative(at: number, now = Date.now()): string {
  const diff = now - at
  if (!Number.isFinite(diff)) return '—'
  if (diff < 0) {
    // 未来：用于截止时间倒计时。
    return `${formatMinutesAway(-diff)}后`
  }
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return dayKey(at)
}

function formatMinutesAway(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} 小时`
  return `${Math.round(hours / 24)} 天`
}

/** 某个时间戳所在月的起始（本地）。 */
export function monthStartOf(at: number): number {
  return startOfMonth(at)
}
