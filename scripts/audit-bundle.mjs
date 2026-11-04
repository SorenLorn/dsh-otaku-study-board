/** 一次性审计脚本：算出 bundle 实际包含哪些源文件，哪些只是保留。 */
import { readFile } from 'node:fs/promises'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'

const root = process.cwd()
const metaPath = join(tmpdir(), 'meta.json')
const meta = JSON.parse(await readFile(metaPath, 'utf8'))
const bundled = new Set(
  Object.keys(meta.inputs).map((p) => p.replace(/\\/g, '/')).filter((p) => !p.startsWith('node_modules')),
)

const walk = (dir) => {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(relative(root, full).replace(/\\/g, '/'))
  }
  return out
}

const all = walk(join(root, 'src'))
const isBundled = (file) => [...bundled].some((p) => p.endsWith(file))

const shipped = all.filter(isBundled)
const kept = all.filter((f) => !isBundled(f))

console.log(`bundle 内含源文件：${shipped.length} / ${all.length}`)
console.log('\n--- 未进入 bundle（保留、不参与发布渲染）---')
for (const f of kept) console.log('  ' + f)
