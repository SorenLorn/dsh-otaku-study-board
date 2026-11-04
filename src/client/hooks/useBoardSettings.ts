/**
 * useBoardSettings — 一份设置对象，仍然建立在原有 `useLocalStore` 之上。
 *
 * 没有新增存储方案：这就是 `STORAGE_KEYS.settings`，走同一个泛型 Hook，所以某张卡
 * 改了开关，其它卡通过同页广播立刻看到。
 *
 * 加固点：读回来的对象一律再过一次 `coerceSettings`。旧版本没有 `monthlyGoal`、
 * 手改 JSON 把 `projectRules` 写成字符串、`lastDurationMinutes` 被改成 0 —— 这些
 * 都会在进入组件之前被抹平，组件里可以放心 `settings.projectRules.map(...)`。
 */
import { useCallback, useMemo } from 'react'
import type { BoardSettings, MonthlyGoal, ProjectRule } from '../types'
import { STORAGE_KEYS } from '../types'
import { createDefaultSettings } from '../lib/defaults'
import { coerceSettings } from '../lib/schema'
import { useLocalStore } from './useLocalStore'

export { createDefaultSettings }

export type SettingsPatch = Partial<Omit<BoardSettings, 'projectRules' | 'monthlyGoal'>> & {
  projectRules?: ProjectRule[]
  monthlyGoal?: Partial<MonthlyGoal>
}

export interface BoardSettingsApi {
  settings: BoardSettings
  /** Shallow merge; `monthlyGoal` merges one level deeper. */
  patch: (next: SettingsPatch) => void
  reset: () => void
}

export function useBoardSettings(): BoardSettingsApi {
  const defaults = useMemo(() => createDefaultSettings(), [])

  const [stored, setStored, resetStored] = useLocalStore<BoardSettings>(
    STORAGE_KEYS.settings,
    defaults,
    { coerce: data => coerceSettings(data) },
  )

  // 即使 Hook 已经兜过一次，这里再兜一层：patch 写入的对象也可能来自旧 UI 状态。
  const settings = useMemo(() => coerceSettings(stored), [stored])

  const patch = useCallback(
    (next: SettingsPatch) => {
      setStored(previous => {
        const base = coerceSettings(previous)
        const merged: BoardSettings = { ...base, ...next, monthlyGoal: base.monthlyGoal }
        if (next.monthlyGoal !== undefined) {
          merged.monthlyGoal = { ...base.monthlyGoal, ...next.monthlyGoal }
        }
        return coerceSettings(merged)
      })
    },
    [setStored],
  )

  return { settings, patch, reset: resetStored }
}
