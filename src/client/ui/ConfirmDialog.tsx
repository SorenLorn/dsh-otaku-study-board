/**
 * ConfirmDialog + useConfirm — 二次确认，统一一处实现。
 *
 * V2 里所有破坏性操作（删任务、删日志、重置今日、清空数据、导入覆盖）都必须
 * 先过一次确认。为了避免每张卡各写一个弹窗，`useConfirm()` 直接返回「问一句」
 * 函数和要渲染的元素：
 *
 *     const confirm = useConfirm()
 *     <button onClick={() => confirm.ask({ title: '删除这个任务？' }, () => remove(id))}>
 *
 * 行为约定：
 *   • Esc / 点遮罩 / 取消按钮 → 什么都不做；
 *   • 打开时焦点落在「取消」上（破坏性操作不该默认吃 Enter）；
 *   • 同一时刻只保留一个待确认项，重复 ask 会替换掉前一个。
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { overlayHost } from './overlay'

export interface ConfirmOptions {
  title: string
  /** One or two sentences explaining exactly what will be lost. */
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` paints the confirm button with the error colour. */
  tone?: 'default' | 'danger'
}

export interface ConfirmApi {
  /** Ask, then run `onConfirm` if the user agrees. */
  ask: (options: ConfirmOptions, onConfirm: () => void) => void
  /** Render this next to the card's content. `null` when nothing is pending. */
  dialog: ReactElement | null
}

interface PendingConfirm {
  options: ConfirmOptions
  onConfirm: () => void
}

export function useConfirm(): ConfirmApi {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  const ask = useCallback((options: ConfirmOptions, onConfirm: () => void) => {
    setPending({ options, onConfirm })
  }, [])

  const close = useCallback(() => setPending(null), [])

  const accept = useCallback(() => {
    const current = pending
    setPending(null)
    if (current !== null) {
      try {
        current.onConfirm()
      } catch {
        /* a failing action must not leave the dialog stuck open */
      }
    }
  }, [pending])

  // Esc closes; focus starts on the safe button.
  useEffect(() => {
    if (pending === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    cancelRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [pending, close])

  // 挂到卡片外：卡片 hover 的位移会让卡片变成 fixed 的包含块，遮罩缩回卡片后
  // 鼠标立刻离开，形成「遮罩一开一合」的闪烁循环。详见 ui/overlay.ts。
  const dialog =
    pending === null ? null : createPortal(
      <div className="osb-modal-backdrop" onClick={close}>
        <div
          className="osb-modal"
          role="dialog"
          aria-modal="true"
          aria-label={pending.options.title}
          onClick={event => event.stopPropagation()}
        >
          <h3 className="osb-modal-title">{pending.options.title}</h3>
          {pending.options.description === undefined ? null : (
            <p className="osb-modal-desc">{pending.options.description}</p>
          )}
          <div className="osb-modal-actions">
            <button ref={cancelRef} type="button" className="osb-btn" onClick={close}>
              {pending.options.cancelLabel ?? '取消'}
            </button>
            <button
              type="button"
              className={
                pending.options.tone === 'danger' ? 'osb-btn osb-btn-danger' : 'osb-btn osb-btn-primary'
              }
              onClick={accept}
            >
              {pending.options.confirmLabel ?? '确认'}
            </button>
          </div>
        </div>
      </div>,
      overlayHost(),
    )

  return { ask, dialog }
}
