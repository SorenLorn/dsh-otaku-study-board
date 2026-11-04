/**
 * call-sites.mjs — 阶段 2 前置门禁：检查「关键函数是否真的被业务代码调用」。
 *
 * 判定规则（不靠函数名猜）：
 *   • 只在 `src/**` 里数调用点；
 *   • 排除定义所在文件的定义行；
 *   • 排除注释（粗略剥离行注释与块注释）；
 *   • `scripts/**` 与测试不算业务调用。
 *
 * 退出码：任何 REQUIRED 项为零调用则返回 1。
 *
 * 跑法：node scripts/audit2/call-sites.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(dirname(HERE))
const SRC = join(ROOT, 'src')

/** 关注清单：name → 用途说明。`required` 为 true 表示「阶段 2 之前必须有业务调用」。 */
const TARGETS = [
  { name: 'syncDailyTasks', required: true, note: '任务完成数写日聚合（绝对值）' },
  { name: 'applyDailyDelta', required: true, note: '专注/会话/阻碍的增量聚合' },
  { name: 'rebuildDay', required: false, note: '幂等修复单日（重试路径）' },
  { name: 'rebuildDaily', required: false, note: '全量重建（修复入口）' },
  { name: 'pruneReviews', required: true, note: '删除知识节点后清理复习记录' },
  { name: 'pruneSnapshots', required: false, note: '历史快照按项目裁剪' },
  { name: 'appendEvent', required: true, note: '写时间轴事件' },
  { name: 'buildHistorySnapshot', required: true, note: '生成历史快照' },
  { name: 'writeTransaction', required: true, note: '导入事务' },
  { name: 'acceptDraft', required: true, note: '采纳记忆草稿' },
  { name: 'applyMemoryPatch', required: true, note: '写项目记忆' },
]

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(full)))
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** 粗略去注释，避免把文档里的提及当成调用。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const files = await walk(SRC)
const sources = new Map()
for (const file of files) {
  sources.set(file, stripComments(await readFile(file, 'utf8')))
}

let failed = 0
console.log('关键函数调用点检查（仅统计 src/** 的业务代码）\n')

for (const target of TARGETS) {
  const definitionFile = [...sources.entries()].find(([, text]) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${target.name}\\b`).test(text),
  )?.[0]

  const hits = []
  for (const [file, text] of sources) {
    if (file === definitionFile) continue
    const matches = text.match(new RegExp(`\\b${target.name}\\s*(?:<[^>]*>)?\\s*\\(`, 'g'))
    if (matches !== null && matches.length > 0) {
      hits.push(`${relative(ROOT, file)} ×${matches.length}`)
    }
  }

  const ok = hits.length > 0
  const status = ok ? '有调用' : target.required ? '缺失' : '暂无（允许）'
  if (target.required && !ok) failed += 1
  console.log(
    `${target.required ? '[必需]' : '[可选]'} ${target.name.padEnd(20)} ${status.padEnd(12)} ${target.note}`,
  )
  if (ok) console.log(`         调用点：${hits.join('，')}`)
  else if (definitionFile !== undefined) console.log(`         仅有定义：${relative(ROOT, definitionFile)}`)
}

console.log(`\n结论：${failed === 0 ? '所有必需项都有业务调用' : `${failed} 个必需项没有业务调用`}`)
if (failed > 0) process.exitCode = 1
