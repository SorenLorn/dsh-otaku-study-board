/**
 * hooks/useCaptureState.ts — 订阅采集状态（`lib/bus` 的广播，不引入状态库）。
 *
 * 用 `useSyncExternalStore` 而不是 useState + useEffect：状态在模块里，多个读取点
 * （设置页、专注面板）必须看到同一份，不能在各自的 effect 里复制一份快照。
 */
import { useSyncExternalStore } from 'react'
import { getCaptureState, subscribeCapture, type CaptureState } from '../lib/bus'

export function useCaptureState(): CaptureState {
  return useSyncExternalStore(subscribeCapture, getCaptureState, getCaptureState)
}
