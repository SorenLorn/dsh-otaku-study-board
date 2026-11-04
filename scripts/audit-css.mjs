/**
 * 一次性审计：找出 board.css 里「选择器对应的 class 在打包后的 TSX 里已经不存在」的规则。
 * 只做只读统计，不修改任何文件。
 */
import { readFile } from 'node:fs/promises'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const css = await readFile(join(root, 'src/client/style/board.css'), 'utf8')

const walk = dir => {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(relative(root, full).replace(/\\/g, '/'))
  }
  return out
}

/** 进了 bundle 的源文件（用 esbuild metafile 的输入列表）。 */
const meta = JSON.parse(await readFile(join(process.env.TEMP ?? '', 'meta.json'), 'utf8'))
const bundled = Object.keys(meta.inputs)
  .map(p => p.replace(/\\/g, '/'))
  .filter(p => p.startsWith('src/'))

const tsxText = (
  await Promise.all(bundled.filter(f => /\.tsx?$/.test(f)).map(f => readFile(join(root, f), 'utf8')))
).join('\n')

/** 从 CSS 里抽出所有 class 选择器（含 .osb- / .v4-）。 */
const classNames = new Set()
for (const match of css.matchAll(/\.((?:osb|v4)-[a-z0-9-]+)/g)) classNames.add(match[1])

const used = []
const unused = []
for (const name of [...classNames].sort()) {
  // 组件里可能用模板拼接（`v4-x ${cond}`），所以按子串判断，宁可保守。
  if (tsxText.includes(name)) used.push(name)
  else unused.push(name)
}

console.log(`CSS 里出现的类名：${classNames.size} 个（用到 ${used.length} / 未用到 ${unused.length}）`)
console.log('\n--- 打包代码里找不到的类（只可能来自未上线的 V3 组件）---')
for (const name of unused) console.log('  .' + name)

// 粗算未用类占据的 CSS 体积：按「规则块」累加，块内只要只含未用类就算整块。
const unusedSet = new Set(unused)
const blocks = css.split(/\n(?=[^\s@}][^{}]*\{)/)
let deadBytes = 0
const deadSamples = []
for (const block of blocks) {
  const names = [...block.matchAll(/\.((?:osb|v4)-[a-z0-9-]+)/g)].map(m => m[1])
  if (names.length === 0) continue
  if (names.every(n => unusedSet.has(n))) {
    deadBytes += Buffer.byteLength(block, 'utf8')
    if (deadSamples.length < 6) deadSamples.push(block.split('\n')[0].slice(0, 70))
  }
}
console.log(`\n只含未用类的规则块合计约 ${deadBytes} B（CSS 总量 ${Buffer.byteLength(css, 'utf8')} B）`)
console.log('样例：')
for (const s of deadSamples) console.log('  ' + s)
