/**
 * Build script for dsh-otaku-study-board.
 *
 * Two artifacts, because a DSH plugin has two halves:
 *
 *   lib/index.js   Host half — a Node ESM module. The `cordis.patch.yml` row
 *                  mounts it into the plugin tree; cordis imports it and calls
 *                  `apply(ctx)`. The board draws nothing on this side, so the
 *                  module is a deliberate no-op (it still has to exist, or the
 *                  row has nothing to import).
 *
 *   lib/client.js  Client half — a browser CJS bundle wrapped in the
 *                  `window.__ModuleLoader__.load({ id, factory })` factory the
 *                  DSH web shell requires (this is the same handoff shape
 *                  `dsh-context` and `dsh-better-sidebar` publish):
 *
 *                      window.__ModuleLoader__.load({ id, factory: (require) => {
 *                        var module = { exports: {} }; var exports = module.exports;
 *                        ... bundle ...
 *                        return module.exports;   // { name, inject, apply }
 *                      } });
 *
 *                  `require` is answered from the shell's frozen module table,
 *                  so react / react-dom / jsx-runtime stay external and the
 *                  bundle never ships its own React copy.
 *
 * The stylesheet is a real, readable `src/board.css`. It is inlined as a string
 * at build time (`__OSB_CSS_TEXT__`) instead of going through a CSS pipeline:
 * one less loader, one less emitted asset, and the panel injects a single
 * `<style data-plugin-css>` tag it also removes on unload.
 */
import { readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const boardCss = await readFile(join(root, 'src', 'client', 'style', 'board.css'), 'utf8')

/** Modules the DSH web shell answers from its own module table. */
const CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
]

await rm(join(root, 'lib'), { recursive: true, force: true })

// ── 1. Host half (Node) ──────────────────────────────────────────────────────
await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
})

// ── 2. Client half (browser) ─────────────────────────────────────────────────
await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'chrome111',
  jsx: 'automatic',
  external: CLIENT_EXTERNALS,
  define: { __OSB_CSS_TEXT__: JSON.stringify(boardCss) },
  // The factory handoff every `dsh.client` bundle must publish. esbuild has no
  // `intro` option in its JS API, so the `module`/`exports` shim rides along in
  // the banner — it still lands before any bundled code.
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      `  id: ${JSON.stringify(pkg.name)},`,
      '  factory: (require) => {',
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: { js: 'return module.exports; } });' },
  legalComments: 'none',
  // Keep Chinese/Japanese UI strings readable in the artifact: no \uXXXX soup.
  charset: 'utf8',
  logLevel: 'info',
})

console.log(`[${pkg.name}] built lib/index.js + lib/client.js`)
