/**
 * theme-runtime-diagnostic.js — DSH 主题运行时诊断（只读）。
 *
 * 用法：整段复制到 DSH DevTools Console 回车。不依赖本插件任何模块，
 * 不写 DOM / CSS / localStorage / sessionStorage，只读 getComputedStyle。
 *
 * 返回一个分组 JSON；同时在 Console 打印一份格式化结果。
 */
(() => {
  const readVar = (el, name) => {
    if (!el) return null;
    const value = getComputedStyle(el).getPropertyValue(name);
    return value === '' ? null : value.trim();
  };

  const readGroup = (el, names) => {
    if (!el) return null;
    const out = {};
    for (const name of names) out[name.replace(/^--/, '')] = readVar(el, name);
    return out;
  };

  const describe = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className : '',
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderColor,
      backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || null,
      opacity: cs.opacity,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    };
  };

  const HOST_TOKENS = [
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-border-l2',
    '--dsw-alias-brand-primary',
  ];

  const V4_TOKENS = [
    '--v4-bg',
    '--v4-surface-solid',
    '--v4-surface-1',
    '--v4-surface-2',
    '--v4-text',
    '--v4-text-2',
    '--v4-text-3',
    '--v4-border',
    '--v4-accent',
    '--v4-violet',
    '--v4-rose',
  ];

  const body = document.body;
  const osbPage = document.querySelector('.osb-page');
  const v4Page = document.querySelector('.v4-page');

  // 只要第一个命中的卡片，找不到就是 null，不猜别的选择器。
  const l1 = document.querySelector('.v4-glass-1');
  const l2 = document.querySelector('.v4-glass-2');

  const label = readVar(body, '--dsw-alias-label-primary');
  const bodyBg = body ? getComputedStyle(body).backgroundColor : null;

  const result = {
    environment: {
      url: location.href,
      title: document.title,
      view: v4Page ? 'v4' : 'classic',
      // 宿主不一定设置 data-theme，这只是“如果设置了”的线索，不能当结论。
      dataTheme: document.documentElement.getAttribute('data-theme'),
      rootClass: document.documentElement.className || '',
      bodyClass: body ? body.className : '',
      bodyBackground: bodyBg,
      labelPrimary: label,
      // 粗略判断：label 比背景亮 → 深色。仅作提示，最终以宿主主题设置和截图为准。
      likelyDark: (() => {
        const parse = (value) => {
          const match = /rgba?\(([^)]+)\)/.exec(value || '');
          if (!match) return null;
          const parts = match[1].split(',').map(Number);
          if (parts.length < 3) return null;
          return (parts[0] * 299 + parts[1] * 587 + parts[2] * 114) / 1000;
        };
        const a = parse(bodyBg);
        const b = parse(label);
        return a === null || b === null ? null : b > a;
      })(),
      timestamp: new Date().toISOString(),
    },

    hostTokens: {
      body: readGroup(body, HOST_TOKENS),
      osbPage: readGroup(osbPage, HOST_TOKENS),
      v4Page: readGroup(v4Page, HOST_TOKENS),
    },

    inheritedTokens: {
      osbPageFound: osbPage !== null,
      v4PageFound: v4Page !== null,
      // 如果 v4Page 上读到的值与 body 相同，说明是继承而非本地覆盖。
      v4PageInheritsBody: (() => {
        if (!body || !v4Page) return null;
        const keys = HOST_TOKENS.filter((name) => readVar(body, name) !== null);
        if (keys.length === 0) return null;
        return keys.every((name) => readVar(body, name) === readVar(v4Page, name));
      })(),
    },

    v4Tokens: {
      source: v4Page || osbPage || body,
      values: readGroup(v4Page || osbPage || body, V4_TOKENS),
    },

    glassSurfaces: {
      l1: describe(l1),
      l2: describe(l2),
      l1Found: l1 !== null,
      l2Found: l2 !== null,
    },

    browserSupport: {
      colorMix: typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports('color', 'color-mix(in srgb, red, transparent)')
        : null,
      backdropFilter: typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports('backdrop-filter', 'blur(10px)')
        : null,
      webkitBackdropFilter: typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports('-webkit-backdrop-filter', 'blur(10px)')
        : null,
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    },

    overflow: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    },
  };

  console.log('[Sorchron theme diagnostic]', result);
  console.log(JSON.stringify(result, null, 2));
  return result;
})();
