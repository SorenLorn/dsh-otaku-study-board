/**
 * useSettlementRecovery — 挂载时收敛「重复结算」（Phase 5.5.1）。
 *
 * 为什么需要：localStorage 没有锁也没有 CAS。两个标签页同时结束同一轮时，即使
 * `settleFocus` 在写之前重新读了一次存储，也仍有一个「读与写之间」的窗口 ——
 * 两边都读到「还没写过」，于是都写，结果是两条同 id 的日志、Daily 加两次。
 *
 * 这个钩子不装作能阻止并发，只做**确定性收敛**：同一个 roundId 出现两次，只可能是
 * 同一轮被应用了两次；把多出来的那一份按同一口径扣回（日志、Daily、任务副本、
 * 时间轴各回退一份），并在界面上如实说明「发现并修正了重复记录」。
 *
 * 只在工作台根节点挂一次（`BoardPage`），每次会话跑一次。
 */
import { useEffect, useRef } from 'react'
import { pushNotice } from '../lib/bus'
import { info, warn } from '../lib/debug'
import { repairSettlementStore } from '../lib/settlement'
import { createBrowserStore } from '../lib/tx'

export function useSettlementRecovery(): void {
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    const store = createBrowserStore()
    if (store === undefined) return
    try {
      const result = repairSettlementStore(store)
      if (!result.changed) return
      if (!result.ok) {
        warn('storage', 'duplicate settlement repair failed to persist — data left untouched', result)
        pushNotice('发现重复的专注记录，但修正未能写入（存储可能已满），请导出备份后重试', 'error')
        return
      }
      info('storage', 'duplicate settlements repaired', result)
      pushNotice(
        `发现 ${result.removedLogs} 条重复的专注记录，已合并并回退 ${result.rolledBackMinutes} 分钟`,
        'warn',
      )
    } catch (error) {
      // 修复失败不影响正常使用：下一次挂载会再试。
      warn('storage', 'duplicate settlement repair threw — skipped', error)
    }
  }, [])
}
