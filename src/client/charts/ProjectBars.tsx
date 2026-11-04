/**
 * ProjectBars — 项目投入汇总，HTML 横向条。
 *
 * 横向比纵向适合「名字长度不一」的数据：项目名写在左边固定列，条形从同一
 * 基线往右长，扫一眼就能比出长短，不需要读刻度。
 */

export interface ProjectRow {
  project: string
  minutes: number
  count: number
}

export interface ProjectBarsProps {
  rows: ProjectRow[]
  /** Message shown when there is nothing to plot. */
  emptyHint?: string
  /** Rows beyond this are folded into "其余 N 个项目". */
  limit?: number
}

export function ProjectBars({ rows, emptyHint = '还没有项目投入记录', limit = 6 }: ProjectBarsProps) {
  if (rows.length === 0) {
    return <p className="osb-empty">{emptyHint}</p>
  }

  const shown = rows.slice(0, limit)
  const rest = rows.slice(limit)
  const max = Math.max(1, ...shown.map(row => row.minutes))

  return (
    <ul className="osb-project-list">
      {shown.map(row => (
        <li className="osb-project-row" key={row.project}>
          <span className="osb-project-name" title={row.project}>
            {row.project}
          </span>
          <span className="osb-project-track">
            <span
              className="osb-project-fill"
              style={{ width: `${Math.max(2, Math.round((row.minutes / max) * 100))}%` }}
            />
          </span>
          <span className="osb-project-value">{row.minutes}m</span>
          <span className="osb-project-count">{row.count} 条</span>
        </li>
      ))}
      {rest.length > 0 ? (
        <li className="osb-project-row osb-project-rest">
          <span className="osb-project-name">其余 {rest.length} 个项目</span>
          <span className="osb-project-track" aria-hidden="true" />
          <span className="osb-project-value">
            {rest.reduce((sum, row) => sum + row.minutes, 0)}m
          </span>
          <span className="osb-project-count">{rest.reduce((sum, row) => sum + row.count, 0)} 条</span>
        </li>
      ) : null}
    </ul>
  )
}
