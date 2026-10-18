// Lux modes — the text transform that writes any Lux page (lux-<key>.html, from lux.build.mjs,
// which stays the DARK source and is not edited) in either mode. It changes ONLY what it names:
// the page's own markup and CSS text pass through byte for byte otherwise, so nothing else can
// move (2026-09-26, the operator: "as little errors as possible and as accurate as possible").
//
//   toMode(html, 'dark')    the 2026-09-26 fixes, both modes (and no B mark — see toMode):
//     · ONE FONT — the phone's own system font everywhere; the serif (Georgia) the pages drew for
//       display type is gone ("change any font from everywhere to this — the default one I already
//       have on the app");
//     · EVERY ICON SIZED — an <svg> inside `.btn2` had no size, so the browser drew it at its
//       300x150 default (Delete account, Review and tip, Account and safety, the worker's job):
//       now 20, the CTA's own glyph size.
//   toMode(html, 'light')   the same fixes, and every colour value mapped to the app's LIGHT
//     tokens (ui/tokens.ts `colors`: ink #13201B, muted #6E7771, emerald #0D6B52, forest #064C3B,
//     gold #C8A15B, bg #F6F3EA, surface #FFFFFF, danger #9C3F35; `amountGold` #C08F2E), property by
//     property, so the same screen reads as the same screen when the phone switches modes:
//     · text — the cream ink → ink, the grey-green → muted, mint → emerald, gold → the amount
//       gold, the dark ink on a lit fill → white;
//     · fills — the dark glass → white glass (alpha raised, never below .72), the ground → the
//       ivory, white washes → ink washes at three quarters, mint tints → emerald tints, a lit mint
//       fill (the CTA) → the forest, flat (gradients are flat in light by construction, DECISIONS 18);
//     · lines — mint rims → emerald rims, white hairlines → ink hairlines;
//     · shadows — black → the light card shadow at three tenths, glows → faint, text shadows off;
//     · named: the eyebrow emerald (the eyebrow law: gold in dark, emerald in light), the home bar
//       ink, the CTA without a drop shadow (DECISIONS 19), the map's dark tiles inverted into a
//       light map (a stand-in either way — the phone draws Apple's own tiles);
//     · the customer hero art → the app's own light file (the caller supplies its path).
//   Masks, url(…) payloads and the page chrome outside the phones are never touched.

export const SYSTEM_FONT = '-apple-system,"SF Pro Text","SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const FIX_CSS = '.btn2 svg{width:20px;height:20px;flex:0 0 auto}';
const LIGHT_CSS = [
  '.phone .home-bar{background:rgba(19,32,27,.85)}',
  '.phone .eyebrow{color:#0D6B52}',
  '.phone .cta{box-shadow:none}',
  '.phone .map .tile{filter:invert(1) hue-rotate(180deg) saturate(.75) brightness(1.03)}',
].join('\n');
const CHROME = /^(html|body|\.stage|\.slot|\.toolbar|\.note|\.pagehead)\b/;

const L = {
  ink: [19, 32, 27], muted: [110, 119, 113], emerald: [13, 107, 82], forest: [6, 76, 59],
  gold: [200, 161, 91], goldText: [192, 143, 46], ivory: [246, 243, 234], white: [255, 255, 255],
  danger: [156, 63, 53], shade: [16, 38, 29],
};
const VARS = {
  '--ink': '#13201B', '--muted': '#6E7771', '--acc': '#0D6B52', '--accInk': '#FFFFFF',
  '--gold': '#C08F2E', '--goldHi': '#FFF1CF', '--glass': 'rgba(255,255,255,.80)',
  '--rim': 'rgba(13,107,82,.14)', '--spec': 'rgba(255,255,255,.9)',
};

export function family(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (r >= 235 && g >= 235 && b >= 225) return 'white';
  if (r === 200 && g === 255 && b === 230) return 'mint';
  if (r >= 240 && g >= 200 && b < 200 && r > b + 50) return 'gold';
  if (r >= 170 && g >= 130 && b <= 150 && r > g && g > b && r - b > 60) return 'gold';
  if (r > 200 && r > g + 40 && r > b + 40) return 'red';
  if (b > r + 60 && b > g) return 'blue';
  if (lum < 70) return 'dark';
  if (max - min < 30) return 'grey';
  if (g >= r && g >= b && lum >= 110) return 'acc';
  return 'other';
}

export function mapColor(group, c) {
  const [r, g, b, a] = c;
  const f = family(r, g, b);
  const out = (rgb, alpha) => [rgb[0], rgb[1], rgb[2], Math.max(0, Math.min(1, alpha))];
  switch (group) {
    case 'text':
      if (f === 'white') return out(L.ink, a);
      if (f === 'grey') return out(L.muted, a);
      if (f === 'acc' || f === 'mint') return out(L.emerald, a);
      if (f === 'gold') return out(L.goldText, a);
      if (f === 'dark') return out(L.white, a);
      if (f === 'red') return out(L.danger, a);
      return c;
    case 'bg':
      if (f === 'white') return a >= 0.85 ? c : out(L.ink, a * 0.75);
      if (f === 'mint') return out(L.emerald, a * 0.55);
      if (f === 'acc') return a >= 0.5 ? out(L.forest, 1) : out(L.emerald, a * 0.7);
      if (f === 'gold') return out(L.gold, Math.min(1, a * 1.1));
      if (f === 'dark') return a >= 0.99 ? out(L.ivory, 1) : out(L.white, Math.min(0.96, Math.max(0.72, a + 0.3)));
      if (f === 'red') return out(L.danger, a >= 0.5 ? a : a * 0.8);
      if (f === 'grey') return out(L.muted, a);
      return c;
    case 'line':
      if (f === 'white') return out(L.ink, a * 0.9);
      if (f === 'mint') return out(L.emerald, a * 0.7);
      if (f === 'acc') return out(L.emerald, a >= 0.5 ? a : a * 0.8);
      if (f === 'gold') return out(L.gold, Math.min(1, a * 1.1));
      if (f === 'dark') return out(L.ink, 0.1);
      if (f === 'red') return out(L.danger, a);
      if (f === 'grey') return out(L.muted, a * 0.8);
      return c;
    case 'shadow':
      if (f === 'dark') return out(L.shade, a * 0.3);
      if (f === 'acc' || f === 'mint') return out(L.emerald, a * 0.35);
      if (f === 'gold') return out(L.gold, a * 0.6);
      return c;
    case 'tshadow':
      return out(L.shade, 0);
    case 'filter':
      if (f === 'dark') return out(L.shade, a * 0.3);
      if (f === 'acc' || f === 'mint') return out(L.emerald, a * 0.35);
      return c;
    default:
      return c;
  }
}

const COLOR_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])|rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)(%?)\s*)?\)|(?<![\w-])(white|black)(?![\w-])/g;
function parse(m) {
  if (m[1]) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((x) => x + x).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  if (m[7]) return m[7] === 'white' ? [255, 255, 255, 1] : [0, 0, 0, 1];
  const a = m[5] === undefined ? 1 : m[6] ? parseFloat(m[5]) / 100 : parseFloat(m[5]);
  return [Math.round(+m[2]), Math.round(+m[3]), Math.round(+m[4]), a];
}
const hex2 = (v) => v.toString(16).padStart(2, '0').toUpperCase();
const fmt = (c) => (c[3] >= 1 ? `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}` : `rgba(${c[0]},${c[1]},${c[2]},${+c[3].toFixed(3)})`);
const URL_RE = /(url\((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\))/;
export function remapValue(group, value) {
  if (group === 'skip' || !value) return value;
  return value
    .split(URL_RE)
    .map((part, i) => (i % 2 ? part : part.replace(COLOR_RE, (...m) => fmt(mapColor(group, parse(m))))))
    .join('');
}
function groupOf(prop) {
  if (/mask/.test(prop)) return 'skip';
  if (/^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color|column-rule-color|text-emphasis-color|stop-color)$/.test(prop)) return 'text';
  if (/^background/.test(prop)) return 'bg';
  if (/^(border|outline)/.test(prop)) return 'line';
  if (prop === 'box-shadow') return 'shadow';
  if (prop === 'text-shadow') return 'tshadow';
  if (prop === 'filter' || prop === '-webkit-filter') return 'filter';
  return 'skip';
}
function groupOfVar(name) {
  if (/rim|line|border|stroke|hair/i.test(name)) return 'line';
  if (/glass|bg|surface|fill|scrim|pane|ground|wash/i.test(name)) return 'bg';
  if (/shadow|glow/i.test(name)) return 'shadow';
  return 'text';
}

// split a declaration list at the semicolons that are outside quotes and brackets
function splitDecls(text) {
  const parts = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; parts.push(';'); }
  }
  parts.push(text.slice(start));
  return parts;
}

export const unknownVars = new Set();
function transformDecls(text, mode, skipColour) {
  return splitDecls(text).map((d) => {
    if (d === ';') return d;
    const colon = d.indexOf(':');
    if (colon < 0) return d;
    const lead = d.slice(0, colon), value = d.slice(colon + 1);
    const prop = lead.trim().toLowerCase();
    // one font, both modes
    if (prop === 'font-family' && /georgia|times|serif/i.test(value) && !/^\s*-apple-system/i.test(value)) {
      const important = /!important\s*$/i.test(value) ? ' !important' : '';
      return `${lead}:${SYSTEM_FONT}${important}`;
    }
    if (mode !== 'light' || skipColour) return d;
    if (prop.startsWith('--')) {
      const name = lead.trim();
      if (VARS[name] !== undefined) return `${lead}:${VARS[name]}`;
      COLOR_RE.lastIndex = 0;
      if (COLOR_RE.test(value)) { unknownVars.add(name); COLOR_RE.lastIndex = 0; return `${lead}:${remapValue(groupOfVar(name), value)}`; }
      COLOR_RE.lastIndex = 0;
      return d;
    }
    const g = groupOf(prop);
    return g === 'skip' ? d : `${lead}:${remapValue(g, value)}`;
  }).join('');
}

// every innermost {…} block of a stylesheet, with the selector in front of it
function transformCss(css, mode) {
  let out = '', i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const close = css.indexOf('}', open);
    const nextOpen = css.indexOf('{', open + 1);
    if (close < 0) { out += css.slice(i); break; }
    if (nextOpen >= 0 && nextOpen < close) { out += css.slice(i, open + 1); i = open + 1; continue; } // an at-rule's wrapper
    const head = css.slice(i, open);
    const selector = head.slice(Math.max(head.lastIndexOf('}'), head.lastIndexOf(';')) + 1).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    out += head + '{' + transformDecls(css.slice(open + 1, close), mode, CHROME.test(selector)) + '}';
    i = close + 1;
  }
  return out;
}

const HERO_DARK_LEN = [215000, 235000]; // the dark armchair embedded (hero_armchair_customer.png → ~225 KB of base64)

export function toMode(html, mode, { heroLightSrc } = {}) {
  unknownVars.clear();
  // NO B MARK, both modes (2026-09-26, the operator: "anywhere there is this Icon... please get rid
  // of it.... from the html"): the brand B tile the pages drew as <img class="mark"> on Launch,
  // Welcome, both Sign-in screens, both Create-account screens and Verify phone — with Welcome's
  // wrapper that held only it, so no empty row keeps its gap. The 88 success badges (<div class="mark">
  // on Bid sent, Job confirmed, Your job is live) are a different thing and stay.
  let out = html
    .replace(/<div style="display:flex;justify-content:center"><img class="mark"[^>]*><\/div>/g, '')
    .replace(/<img\b[^>]*\bclass="mark"[^>]*>/g, '');
  out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, css, b) => a + transformCss(css, mode) + b);
  out = out.replace(/(\sstyle=")([^"]*)(")/g, (_, a, decls, b) => a + transformDecls(decls, mode, false) + b);
  if (mode === 'light') {
    out = out.replace(/(\s(?:fill|stroke|stop-color)=")([^"]+)(")/g, (m, a, v, b) => (v === 'none' || v === 'currentColor' ? m : a + remapValue('text', v) + b));
    if (heroLightSrc) {
      out = out.replace(/(<img\b[^>]*\bclass="art"[^>]*\bsrc=")(data:image\/png;base64,[A-Za-z0-9+/=]+)(")/g, (m, a, src, b) =>
        (src.length >= HERO_DARK_LEN[0] && src.length <= HERO_DARK_LEN[1] ? a + heroLightSrc + b : m));
    }
  }
  const added = `<style id="lux-modes-fix">${FIX_CSS}</style>` + (mode === 'light' ? `\n<style id="lux-modes-light">\n${LIGHT_CSS}\n</style>` : '');
  out = out.replace(/<\/head>/i, `${added}\n</head>`);
  return out;
}
