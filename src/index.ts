/**
 * dsh-otaku-study-board — HOST entry (Node side).
 *
 * Runs inside the cordis plugin tree that `cordis.patch.yml` mounts. This file
 * is deliberately metadata + lifecycle only:
 *
 *   • no React, no JSX, no DOM — the client half (`./client`) owns every pixel;
 *   • no `import` of the browser bundle, so a headless / acp profile still loads
 *     the row without touching `window`;
 *   • `apply()` mounts nothing on purpose: the board is a local-only page and
 *     talks to nothing but `localStorage`, so there is no route, no config and
 *     no data for the host to hold.
 *
 * Splitting the two halves is what makes the package installable everywhere:
 * `package.json` → `main` points here, `exports["./client"]` points at the
 * browser bundle, and `dsh.client.platform: "web"` is what makes the web UI
 * load the second one.
 */

/** Package id; must match `package.json` `name` and the client half. */
export const name = 'dsh-otaku-study-board'

/**
 * Host services required by this plugin.
 *
 * Empty on purpose: a service nobody provides would leave the fiber `pending`
 * and stall the whole plugin tree, and V1's host half needs nothing at all.
 */
export const inject: string[] = []

/**
 * Cordis lifecycle entry.
 *
 * Kept fail-open by construction: with no work to do there is no path that can
 * throw into the loader and fail the profile.
 *
 * TODO: V2 — only if an export endpoint becomes necessary (e.g. a weekly digest
 * download), mount it here:
 *
 *     ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/sorchron-board', handler }), 'sorchron: route')
 *
 * and then declare `inject = ['webServer']` so non-web profiles stay unloaded
 * instead of waiting for a service that never appears.
 *
 * @param _ctx - host cordis context (unused in V1)
 */
export function apply(_ctx?: unknown): void {
  /* no-op by design — see the file header */
}

export default { name, inject, apply }
