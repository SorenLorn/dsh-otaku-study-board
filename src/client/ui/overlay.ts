/**
 * 弹窗挂载点。
 *
 * 为什么不能留在卡片里：
 *   `.osb-card:hover` 曾经用 `translateY(-1px)` 做悬停位移。**只要祖先元素有
 *   transform，它就会成为 `position: fixed` 子元素的包含块** —— 于是
 *   `.osb-modal-backdrop` 从「铺满视口」变成「只有卡片那么大」。
 *
 *   接下来就是死循环：鼠标在卡片外 → 遮罩铺满 → 鼠标落在遮罩上（遮罩是卡片的
 *   后代）→ 卡片进入 hover → 遮罩缩进卡片 → 鼠标不在遮罩上了 → 卡片退出 hover
 *   → 遮罩又铺满 …… 每帧来回一次，表现为鼠标下面的整页遮罩 / 光标不停闪。
 *
 * 现在卡片位移已经去掉，但弹窗仍然挂到页面根节点：以后任何卡片只要加了
 * transform / filter / backdrop-filter，都不会再把弹窗关进卡片。
 *
 * 挂到 `.osb-page` 而不是 `document.body`：`--osb-*` 调色板变量定义在
 * `.osb-page` 上，挂到 body 会丢变量、弹窗变透明。
 */
export function overlayHost(): HTMLElement {
  const pages = Array.from(document.querySelectorAll<HTMLElement>('.osb-page'))
  // 宿主切换面板时可能把旧页面留在 DOM 里（display:none）。优先挂到仍然可见的那一个，
  // 否则弹窗会出现在一个看不见的旧页面上。
  const visible = pages.find(page => page.getClientRects().length > 0)
  return visible ?? pages[0] ?? document.body
}
