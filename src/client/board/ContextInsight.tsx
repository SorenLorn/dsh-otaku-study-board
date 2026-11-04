/**
 * ContextInsight — 【会话上下文观测】折叠面板（需求 3.1）。
 *
 * 只展示统计，不展示原文：
 *   • 消息条数、估算 token、代码块数、报错数；
 *   • 构成占比（我的提问 / 模型回复 / 工具调用 / 代码块 / 报错）；
 *   • 膨胀预警（黄 / 红）与建议；
 *   • 「生成精简摘要」：生成一份可粘贴的摘要 + 一次性操作日志，**不改 DSH 会话**。
 *
 * 数据来自 `useContextStats`，输入是已落库的日志摘要。
 */
import { useState } from 'react'
import type { ContextStats } from '../types'
import { pushNotice } from '../lib/bus'
import { formatTokens } from '../hooks/useSlashCommand'
import { formatRelative } from '../lib/time'

const SLICE_COLORS: Record<string, string> = {
  user: 'var(--osb-accent)',
  assistant: 'var(--osb-ok)',
  tool: 'var(--osb-warn)',
  code: 'var(--osb-text-2)',
  error: 'var(--osb-danger)',
}

const LEVEL_TEXT = {
  ok: '上下文健康',
  warn: '注意膨胀',
  danger: '接近溢出',
} as const

export interface ContextInsightProps {
  stats: ContextStats
  sessionLabel: string
  plan: { keep: number; fold: number; summary: string; logDetail: string }
  lastPrunedAt?: number
  onAdoptPlan: () => void
}

export function ContextInsight({ stats, sessionLabel, plan, lastPrunedAt, onAdoptPlan }: ContextInsightProps) {
  const [copied, setCopied] = useState(false)

  const totalTokens = stats.slices.reduce((sum, slice) => sum + slice.tokens, 0)

  function copySummary(): void {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
        void navigator.clipboard
          .writeText(plan.summary)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => pushNotice('复制失败：浏览器拒绝了剪贴板权限', 'warn'))
        return
      }
      pushNotice('当前环境没有剪贴板，请手动选中摘要复制', 'warn')
    } catch {
      pushNotice('复制失败，详见控制台', 'warn')
    }
  }

  function adopt(): void {
    onAdoptPlan()
    pushNotice(`已记录：建议保留 ${plan.keep} 条、折叠 ${plan.fold} 条（未修改 DSH 会话）`, 'success')
  }

  return (
    <details className="osb-collapse" open={stats.level === 'danger'}>
      <summary className="osb-collapse-head">
        会话上下文观测
        <span className="osb-collapse-meta" data-level={stats.level}>
          {LEVEL_TEXT[stats.level]} · {stats.messages} 条 · {formatTokens(stats.tokens)}
        </span>
      </summary>

      <div className="osb-collapse-body">
        <p className="osb-hint" style={{ marginTop: 0 }}>
          {sessionLabel} · 只统计摘要，不读取完整原文 · {stats.codeBlocks} 个代码块 · {stats.errorMessages} 条报错
        </p>

        <div
          style={{
            display: 'flex',
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            background: 'var(--osb-border)',
            margin: '6px 0 8px',
          }}
          aria-hidden="true"
        >
          {stats.slices.map(slice => (
            <span
              key={slice.key}
              title={`${slice.label} ${slice.count} 条`}
              style={{
                width: `${totalTokens === 0 ? 0 : (slice.tokens / totalTokens) * 100}%`,
                background: SLICE_COLORS[slice.key] ?? 'var(--osb-text-3)',
              }}
            />
          ))}
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 12 }}>
          {stats.slices.map(slice => (
            <li
              key={slice.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}
            >
              <i
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: SLICE_COLORS[slice.key] ?? 'var(--osb-text-3)',
                }}
              />
              <span style={{ minWidth: 64 }}>{slice.label}</span>
              <span style={{ color: 'var(--osb-text-3)' }}>{slice.count} 条</span>
              <span style={{ flex: 1 }} />
              <span>{formatTokens(slice.tokens)}</span>
              <span style={{ color: 'var(--osb-text-3)', minWidth: 36, textAlign: 'right' }}>
                {totalTokens === 0 ? 0 : Math.round((slice.tokens / totalTokens) * 100)}%
              </span>
            </li>
          ))}
        </ul>

        <p
          className="osb-notice"
          data-ok={stats.level === 'ok' ? 'true' : 'false'}
          style={{ marginTop: 8 }}
        >
          {stats.verdict}
          {stats.level === 'ok' ? '' : ' —— 建议先看一眼下面的精简建议。'}
        </p>

        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--osb-text-2)' }}>
          {stats.suggestions.map(text => (
            <li key={text} style={{ marginBottom: 2 }}>
              {text}
            </li>
          ))}
        </ul>

        <div className="osb-data-actions" style={{ marginTop: 8 }}>
          <button type="button" className="osb-btn" onClick={copySummary}>
            {copied ? '已复制摘要' : `生成精简摘要（保留 ${plan.keep} 条）`}
          </button>
          <button type="button" className="osb-btn" onClick={adopt} disabled={plan.fold === 0}>
            采纳建议（写操作日志）
          </button>
        </div>

        <pre
          style={{
            margin: '8px 0 0',
            padding: 8,
            fontSize: 11,
            lineHeight: 1.5,
            background: 'var(--osb-surface-2, rgba(127,127,127,0.06))',
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            maxHeight: 180,
            overflow: 'auto',
          }}
        >
          {plan.summary}
        </pre>

        <p className="osb-hint" style={{ marginBottom: 0 }}>
          精简只生成摘要与操作日志，**不会修改 DSH 原生会话内容**。
          {lastPrunedAt === undefined ? '' : ` 上次采纳：${formatRelative(lastPrunedAt)}。`}
        </p>
      </div>
    </details>
  )
}
