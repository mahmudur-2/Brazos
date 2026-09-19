// Generates map-explore-dark.html and map-explore-light.html: the worker Map
// screen ("Explore nearby jobs") as a 393x852 iPhone 15 Pro frame, one theme
// per file, everything embedded — the map tiles, the job photo, the glyphs.
//
//   node docs/mockups/html/map-explore.build.mjs
//
// THE MAP. The phone draws Apple Maps (components/HotspotMap.native.tsx,
// MapKit via react-native-maps, no Google provider on iOS — the Google key in
// app.config.ts is Android-only); Apple's tiles cannot be embedded without a
// developer token, so the mockup carries real tiles of Brooklyn from Esri's
// keyless Canvas services — the Dark Gray Base for dark, graded (brighten,
// then contrast) so the streets sit clearly lighter than the ground and
// colour-blended to Apple's slate; the Light Gray Base for light, warmed to
// cream — fetched ONCE into .shots/map-tiles/ and inlined as data URIs.
// (CARTO's basemaps watermark without a key now.) The bases carry no labels
// and no colour: the neighbourhood names, the road names and the green park
// glows are drawn by the page, in the reference concept's manner. Colours and
// label style on the phone will differ a little. Attribution: © Esri, HERE,
// Garmin, OpenStreetMap contributors.
//
// EVERYTHING ELSE is the operator's reference concept (2026-09-19): the glass
// search pill with the distance chip, one "Today" chip, briefcase pins with
// count badges, the gold selected pin, the user dot, a floating glass sheet
// with the job card — built from the app's own tokens (palettes, the real
// worker nav bar from ui/tokens.ts navBar / ui/primitives/BottomNav.tsx) so
// every value on screen is one the app can render.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const cacheDir = join(root, '.shots', 'map-tiles');
// --liquid: the exploratory iOS liquid-glass variant (2026-09-19) — the tab
// bar as a floating glass pill with a lens on the active tab; the search bar
// and chips lighter, sheened, brighter-rimmed. Written to .shots/mockups/ so
// the approved pages stay what they are.
const LIQUID = process.argv.includes('--liquid');

// ---------------------------------------------------------------------------
// The map: Flatbush, Brooklyn — the reference's centre — at zoom 14, shown at
// 0.78 so the frame spans about what the phone screenshot spans. A touch
// south of Flatbush so Esri's one baked-in regional label sits under the
// search bar's glass instead of mid-frame.
// ---------------------------------------------------------------------------
const CENTER = { lat: 40.6265, lng: -73.9465 };
const ZOOM = 14;
const TILE_CSS = 256 * 0.78;
const PHONE = { w: 393, h: 852 };
const MAP_MID_Y = 360;

const toTile = (lat, lng, z) => {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
};

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const STYLES = {
  dark: { name: 'esri-dark-base', url: (z, x, y) => `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}` },
  light: { name: 'esri-light-base', url: (z, x, y) => `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}` },
};

async function tileDataUri(style, z, x, y) {
  const dir = join(cacheDir, style.name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${z}-${x}-${y}.bin`);
  if (!existsSync(file)) {
    const res = await fetch(style.url(z, x, y), { headers: { 'User-Agent': 'brazos-mockup/1 (design mockup, ~20 tiles)' } });
    if (!res.ok) throw new Error(`${style.name} ${z}/${x}/${y}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  const mime = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** The tile grid that covers the phone, positioned so CENTER lands at MAP_MID_Y. */
async function mapLayer(style) {
  const c = toTile(CENTER.lat, CENTER.lng, ZOOM);
  const x0 = Math.floor(c.x) - 2, x1 = Math.floor(c.x) + 2;
  const y0 = Math.floor(c.y) - 2, y1 = Math.floor(c.y) + 2;
  const imgs = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const left = PHONE.w / 2 + (tx - c.x) * TILE_CSS;
      const top = MAP_MID_Y + (ty - c.y) * TILE_CSS;
      if (left + TILE_CSS < -1 || top + TILE_CSS < -1 || left > PHONE.w + 1 || top > PHONE.h + 1) continue;
      const src = await tileDataUri(style, ZOOM, tx, ty);
      imgs.push(`<img class="tile" src="${src}" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px" alt="">`);
    }
  }
  return imgs.join('\n');
}

// ---------------------------------------------------------------------------
// The two palettes — ui/tokens.ts values, named after their keys — plus the
// mockup-only grading of the map and the concept's glass.
// ---------------------------------------------------------------------------
// 2026-09-19 (second pass): every colour below is the operator's reference
// sheet's (nearby-jobs-dark.html, its :root and [data-theme=light] blocks),
// named after that sheet's own variables where it has one.
const THEMES = {
  dark: {
    ink: '#e5e8e5', muted: '#a1aaa4', emerald: '#84dfaa', gold: '#edb65d', mint: '#0E1F18',
    navInactive: '#7C8A80', navActive: '#49C481', chrome: '#061b13', chromeLine: 'rgba(229,241,236,0.20)',
    statusInk: '#fff', battInk: '#1f2a26',
    // --glass-bottom → --panel (55%) → --glass-top at 125deg, --edge rim, the sheet's insets and --shadow
    glass: 'linear-gradient(125deg,rgba(2,16,13,.96),rgba(2,20,14,.91) 55%,rgba(9,37,25,.94))', glassBlur: '14px',
    glassRim: 'rgba(133,214,158,.8)', glassEdge: '#ffffff13', glassInsetLow: '#65b9810d', glassShadow: '0 6px 22px rgba(0,13,8,.35)',
    chipGrad: 'linear-gradient(125deg,rgba(9,37,25,.94),rgba(2,16,13,.96))', chipRim: 'rgba(186,193,153,.43)',
    distRim: 'rgba(171,189,157,.39)', distFill: 'rgba(0,7,5,.12)',
    // the map: Apple's dark slate, streets lifted, no purple
    mapGround: '#1C2029', tileFilter: 'brightness(2.15) contrast(1.85) brightness(0.62)',
    mapTint: '#46506B', mapTintBlend: 'color', mapTintOpacity: 0.85,
    label: 'rgba(196,204,201,0.72)', labelShadow: 'rgba(10,14,20,0.9)', road: 'rgba(196,204,201,0.50)', big: 'rgba(225,230,226,0.85)',
    park: 'rgba(58,132,88,0.38)', poi: '#E8ECF0', poiPark: '#5FAE81', poiHosp: '#E0594F', poiEdu: '#C7A26A',
    pinTop: '#224634', pinBottom: '#06180f', pinEnd: '#0a2418', pinGlyph: '#eee4c4', pinGlow: '#0004',
    selGlow: '#eac36d', groundDot: '#ebc675', groundRing: '#f8de99', groundGlow: '0 0 9px 6px #55db9059,0 0 17px 10px #61ea7f20',
    badgeGrad: 'linear-gradient(135deg,#247344,#0c281b)', badgeInk: '#d6f5dd', badgeRing: '#77bc8b',
    userDot: '#0b9eff', userDotRing: '#d6dce0', userHalo: 'radial-gradient(circle,rgba(5,128,241,.20),rgba(26,128,211,.06) 63%,rgba(58,168,255,.07))', userHaloRim: '#54b7ed28', userRing: '#2ba6f02b',
    cardFill: 'rgba(1,15,12,.50)', cardRim: 'rgba(183,203,186,.22)', photoBg: '#15362B', photoRing: '#edb65d',
    viewList: '#edb65d', estLabel: '#a1aaa4', estPay: '#edb65d', catFill: 'rgba(132,223,170,.10)', catRim: 'rgba(183,203,186,.22)',
    // --liquid
    lqGlass: 'linear-gradient(125deg,rgba(2,16,13,.52),rgba(9,37,25,.44))', lqRim: 'rgba(170,235,200,.42)', lqRim2: 'rgba(255,255,255,.10)',
    lqSpec: 'rgba(255,255,255,.36)', lqInner: 'rgba(132,223,170,.08)', lqSheen: 'rgba(255,255,255,.13)', lqSheen2: 'rgba(255,255,255,.05)',
    lqShadow: '0 12px 30px rgba(0,0,0,.48)', lqChipFill: 'rgba(132,223,170,.10)',
    lqLens: 'linear-gradient(160deg,rgba(132,223,170,.22),rgba(132,223,170,.06))', lqLensRim: 'rgba(170,235,200,.38)', lqLensGlow: 'rgba(73,196,129,.22)',
  },
  light: {
    ink: '#173429', muted: '#637569', emerald: '#238658', gold: '#a77824', mint: '#E5F1EC',
    navInactive: '#637569', navActive: '#238658', chrome: '#e2f8ef', chromeLine: 'rgba(56,97,65,.22)',
    statusInk: '#21392d', battInk: '#f8fcf5',
    glass: 'linear-gradient(125deg,rgba(230,241,231,.9),rgba(248,252,244,.87) 55%,rgba(255,255,252,.86))', glassBlur: '14px',
    glassRim: 'rgba(101,153,113,.61)', glassEdge: '#ffffff13', glassInsetLow: '#65b9810d', glassShadow: '0 6px 22px rgba(52,83,59,.17)',
    chipGrad: 'linear-gradient(125deg,rgba(255,255,252,.86),rgba(230,241,231,.9))', chipRim: 'rgba(186,193,153,.43)',
    distRim: 'rgba(171,189,157,.39)', distFill: 'rgba(0,7,5,.12)',
    mapGround: '#F1EEE6', tileFilter: 'brightness(1.02)',
    mapTint: '#DCD1B2', mapTintBlend: 'multiply', mapTintOpacity: 0.8,
    label: 'rgba(70,78,74,0.78)', labelShadow: 'rgba(255,255,255,0.9)', road: 'rgba(70,78,74,0.55)', big: 'rgba(40,48,44,0.9)',
    park: 'rgba(96,176,126,0.32)', poi: '#2F3A34', poiPark: '#2E7D4F', poiHosp: '#D9463B', poiEdu: '#8B6A3E',
    pinTop: '#f9fdf4', pinBottom: '#e4f2df', pinEnd: '#c6dfc5', pinGlyph: '#426d48', pinGlow: '#0004',
    selGlow: '#eac36d', groundDot: '#ebc675', groundRing: '#f8de99', groundGlow: '0 0 9px 6px #5cbb6a37',
    badgeGrad: 'linear-gradient(140deg,#dcecd9,#a0c4a6)', badgeInk: '#254f30', badgeRing: '#77bc8b',
    userDot: '#0b9eff', userDotRing: '#d6dce0', userHalo: 'radial-gradient(circle,rgba(5,128,241,.20),rgba(26,128,211,.06) 63%,rgba(58,168,255,.07))', userHaloRim: '#54b7ed28', userRing: '#2ba6f02b',
    cardFill: 'rgba(255,255,255,.59)', cardRim: 'rgba(56,97,65,.22)', photoBg: '#E5F1EC', photoRing: '#a77824',
    viewList: '#a77824', estLabel: '#637569', estPay: '#a77824', catFill: 'rgba(35,134,88,.08)', catRim: 'rgba(56,97,65,.22)',
    // --liquid
    lqGlass: 'linear-gradient(125deg,rgba(255,255,255,.58),rgba(236,246,238,.50))', lqRim: 'rgba(255,255,255,.92)', lqRim2: 'rgba(35,134,88,.14)',
    lqSpec: 'rgba(255,255,255,.95)', lqInner: 'rgba(35,134,88,.06)', lqSheen: 'rgba(255,255,255,.55)', lqSheen2: 'rgba(255,255,255,.18)',
    lqShadow: '0 12px 30px rgba(52,83,59,.18)', lqChipFill: 'rgba(35,134,88,.07)',
    lqLens: 'linear-gradient(160deg,rgba(35,134,88,.16),rgba(35,134,88,.05))', lqLensRim: 'rgba(35,134,88,.28)', lqLensGlow: 'rgba(35,134,88,.16)',
  },
};

// The job photo: the app's own armchair art (assets/prestige), never stock.
const photo = (theme) =>
  `data:image/png;base64,${readFileSync(join(root, 'assets', 'prestige', theme === 'dark' ? 'hero_armchair_customer.png' : 'hero_armchair_customer_light.png')).toString('base64')}`;

// ---------------------------------------------------------------------------
// Glyphs — inline SVG symbols in the Ionicons outline manner the app draws.
// ---------------------------------------------------------------------------
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><path d="m20 20-4.2-4.2"/></symbol>
<symbol id="i-sliders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.1" fill="var(--sliderKnob)"/><circle cx="15" cy="12" r="2.1" fill="var(--sliderKnob)"/><circle cx="8" cy="17" r="2.1" fill="var(--sliderKnob)"/></symbol>
<symbol id="i-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
<symbol id="i-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/></symbol>
<symbol id="i-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c-5 0-9 3.4-9 7.6 0 2.4 1.3 4.5 3.4 5.9L5.5 20.5l4-1.7c.8.2 1.6.3 2.5.3 5 0 9-3.4 9-7.6s-4-8-9-8z"/><circle cx="8.5" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="11" r=".9" fill="currentColor" stroke="none"/></symbol>
<symbol id="i-person" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></symbol>
<symbol id="i-loc" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.7-6-11a6 6 0 0 1 12 0c0 5.3-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3 3 10.5l8.5 2 2 8.5z"/></symbol>
<symbol id="i-tree" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 5.5 11h3L5 16.5h5.5V22h3v-5.5H19L15.5 11h3z"/></symbol>
<symbol id="i-cross" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></symbol>
<symbol id="i-cap" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4 1.5 9.5 12 15l8.5-4.4V17h2V9.5zM5 12.7v4.3c0 1.7 3.1 3.5 7 3.5s7-1.8 7-3.5v-4.3l-7 3.6z"/></symbol>
</defs></svg>`;

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
const css = (t) => `
  :root{--ink:${t.ink};--muted:${t.muted};--emerald:${t.emerald};--gold:${t.gold};--navInactive:${t.navInactive};--navActive:${t.navActive};--chrome:${t.chrome};--chromeLine:${t.chromeLine};--glass:${t.glass};--glassRim:${t.glassRim};--glassEdge:${t.glassEdge};--sliderKnob:${t.mapGround}}
  html,body{margin:0;background:#0d0d0d;font-family:-apple-system,"SF Pro Text","SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
  .stage{display:flex;justify-content:center;padding:28px 16px}
  .phone{position:relative;width:${PHONE.w}px;height:${PHONE.h}px;overflow:hidden;border-radius:55px;background:${t.mapGround};box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px rgba(0,0,0,.6)}
  /* the map */
  .map{position:absolute;inset:0;overflow:hidden;background:${t.mapGround}}
  .map .tile{position:absolute;width:${TILE_CSS}px;height:${TILE_CSS}px;display:block;filter:${t.tileFilter}}
  .map .tint{position:absolute;inset:0;background:${t.mapTint};mix-blend-mode:${t.mapTintBlend};opacity:${t.mapTintOpacity};pointer-events:none}
  .map .topfade{position:absolute;left:0;right:0;top:0;height:170px;background:linear-gradient(180deg,${t.mapGround} 0%,transparent 100%);opacity:.7}
  .park{position:absolute;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(closest-side,${t.park},transparent 78%);pointer-events:none}
  .nlabel{position:absolute;transform:translate(-50%,-50%);font-size:13.5px;line-height:15px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;text-align:center;color:${t.label};text-shadow:0 0 8px ${t.labelShadow},0 0 2px ${t.labelShadow};pointer-events:none;white-space:nowrap}
  .nlabel.big{font-size:17px;letter-spacing:2.4px;color:${t.big}}
  .road{position:absolute;transform:translate(-50%,-50%) rotate(var(--r,0deg));font-size:10.5px;font-weight:600;letter-spacing:1.3px;text-transform:uppercase;color:${t.road};text-shadow:0 0 6px ${t.labelShadow};white-space:nowrap;pointer-events:none}
  .poi{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${t.poi};text-shadow:0 0 6px ${t.labelShadow},0 0 2px ${t.labelShadow};white-space:nowrap;pointer-events:none}
  .poi i{display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:8px;flex:0 0 auto;box-shadow:0 0 0 1.5px rgba(255,255,255,.8)}
  .poi i svg{width:10px;height:10px;color:#fff}
  .poi.park i{background:${t.poiPark}}.poi.park span{color:${t.poiPark}}
  .poi.hosp i{background:${t.poiHosp}}.poi.hosp span{color:${t.poiHosp}}
  .poi.edu i{background:${t.poiEdu}}
  .attrib{position:absolute;left:18px;bottom:306px;font-size:8.5px;color:${t.muted};opacity:.65;letter-spacing:.1px}
  /* status bar */
  .status{position:absolute;left:0;right:0;top:0;height:54px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 26px 8px 34px;color:${t.statusInk};font-weight:600;font-size:17px;letter-spacing:-.2px}
  .status .time{display:flex;align-items:center;gap:5px}
  .status .time svg{width:14px;height:14px}
  .status .right{display:flex;align-items:center;gap:7px}
  .bars{display:flex;align-items:flex-end;gap:1.5px;height:11px}.bars i{display:block;width:3px;background:${t.statusInk};border-radius:1px}
  .bars i:nth-child(1){height:4px}.bars i:nth-child(2){height:6px}.bars i:nth-child(3){height:8.5px}.bars i:nth-child(4){height:11px}
  .wifi{width:16px;height:12px}
  .batt{height:15px;padding:0 5px;border-radius:5px;background:${t.statusInk};color:${t.battInk};font-size:11px;font-weight:700;display:flex;align-items:center}
  /* glass — the concept's: deep green pane, mint rim, a lift */
  .glass{background:var(--glass);backdrop-filter:blur(${t.glassBlur}) saturate(1.25);-webkit-backdrop-filter:blur(${t.glassBlur}) saturate(1.25);border:1px solid var(--glassRim);box-shadow:inset 0 1px 1px var(--glassEdge),inset 0 -1px 3px ${t.glassInsetLow},${t.glassShadow}}
  /* search */
  .search{position:absolute;left:17px;right:17px;top:62px;height:56px;border-radius:28px;display:flex;align-items:center;padding:0 8px 0 20px;gap:13px}
  .search .mag{width:24px;height:24px;color:var(--ink);opacity:.92;flex:0 0 auto}
  .search .ph{flex:1;font-size:18px;color:var(--ink);opacity:.94;letter-spacing:-.1px}
  .search .dist{display:flex;align-items:center;gap:8px;height:32px;padding:0 15px 0 13px;border-radius:21px;border:1px solid ${t.distRim};background:${t.distFill};color:var(--gold);font-size:17px;font-weight:600}
  .search .dist svg{width:21px;height:21px}
  /* chips */
  .chips{position:absolute;left:17px;top:132px;display:flex;gap:10px}
  .chip{display:flex;align-items:center;gap:9px;height:42px;padding:0 17px 0 14px;border-radius:21px;font-size:16px;font-weight:500;color:var(--ink);background:${t.chipGrad};border-color:${t.chipRim}}
  .chip svg{width:19px;height:19px;color:var(--emerald)}
  /* pins */
  .pin{position:absolute;width:46px;height:60px;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px ${t.pinGlow})}
  .pin svg.body{position:absolute;inset:0;width:46px;height:60px}
  .pin .glyph{position:absolute;left:13px;top:11px;width:20px;height:20px;color:${t.pinGlyph}}
  .pin .count{position:absolute;right:-5px;top:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:${t.badgeGrad};color:${t.badgeInk};font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;border:1px solid ${t.badgeRing};box-shadow:0 1px 3px #0008}
  .pin.sel{width:60px;height:78px;filter:drop-shadow(0 0 6px ${t.selGlow}) drop-shadow(0 3px 6px #10221460)}
  .pin.sel svg.body{width:60px;height:78px}
  .pin.sel .glyph{left:17px;top:15px;width:26px;height:26px}
  .seldot{position:absolute;width:9px;height:9px;border-radius:5px;background:${t.groundDot};border:.5px solid ${t.groundRing};transform:translate(-50%,-50%);box-shadow:${t.groundGlow}}
  .selglow{position:absolute;width:150px;height:76px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(closest-side,#55db9030,#61ea7f00);pointer-events:none}
  .you{position:absolute;width:24px;height:24px;border-radius:12px;background:${t.userDot};border:3px solid ${t.userDotRing};box-shadow:0 0 0 .5px #70b6d8,0 1px 3px #00467b8c;transform:translate(-50%,-50%)}
  .youhalo{position:absolute;width:72px;height:72px;border-radius:36px;background:${t.userHalo};border:.65px solid ${t.userHaloRim};box-shadow:inset 0 0 9px #18b1ff0b;transform:translate(-50%,-50%)}
  .youring{position:absolute;width:50px;height:50px;border-radius:25px;border:1px solid ${t.userRing};transform:translate(-50%,-50%)}
  /* the sheet */
  .sheet{position:absolute;left:16px;right:16px;bottom:100px;border-radius:30px;padding:12px 22px 22px;display:flex;flex-direction:column;gap:14px}
  .grab{width:44px;height:4px;border-radius:2px;background:var(--muted);opacity:.45;margin:0 auto}
  .head{display:flex;align-items:flex-start;justify-content:space-between}
  .head h2{margin:0;font-size:30px;line-height:34px;font-weight:700;letter-spacing:-.5px;color:var(--ink)}
  .head .sub{display:flex;align-items:center;gap:9px;margin-top:5px;font-size:16px;color:var(--muted)}
  .head .sub i{display:block;width:7px;height:7px;border-radius:4px;background:var(--emerald)}
  .view{display:flex;align-items:center;gap:3px;margin-top:8px;color:${t.viewList};font-size:18px;font-weight:600}
  .view svg{width:22px;height:22px}
  .card{display:flex;align-items:center;gap:11px;padding:11px 12px 11px 11px;border-radius:20px;background:${t.cardFill};border:1px solid ${t.cardRim};box-shadow:inset 0 1px 1px #fff03}
  .card .photo{width:52px;height:52px;border-radius:26px;background:${t.photoBg};overflow:hidden;flex:0 0 auto;border:1px solid ${t.photoRing};box-shadow:inset 0 1px 4px #ffffff13}
  .card .photo img{width:100%;height:100%;object-fit:cover;object-position:60% 55%;transform:scale(1.4)}
  .card .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
  .card .title{font-size:16px;font-weight:600;letter-spacing:-.3px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .meta{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--emerald)}
  .card .cat{display:inline-flex;align-items:center;height:23px;padding:0 10px;border-radius:12px;background:${t.catFill};color:var(--emerald);font-size:12.5px;font-weight:600;border:1px solid ${t.catRim}}
  .card .loc{display:flex;align-items:center;gap:5px;font-size:13.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .loc svg{width:13px;height:13px;color:var(--emerald);flex:0 0 auto}
  .card .est{text-align:right;flex:0 0 auto}
  .card .est .lbl{font-size:10px;font-weight:700;letter-spacing:.7px;color:${t.estLabel}}
  .card .est .amt{font-size:22px;line-height:26px;font-weight:700;letter-spacing:-.5px;color:${t.estPay}}
  .card .chev{width:16px;height:16px;color:var(--muted);flex:0 0 auto;margin-left:-4px}
  /* the nav bar — the app's: 70 of content + 12 of home-indicator pad */
  .nav{position:absolute;left:0;right:0;bottom:0;height:82px;background:var(--chrome);border-top:1px solid var(--chromeLine);display:flex;align-items:flex-start;padding:10px 6px 0}
  .nav .item{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--navInactive);font-size:12px;font-weight:500}
  .nav .item svg{width:30px;height:30px}
  .nav .item.active{color:var(--navActive)}
  .nav .item.active svg{filter:drop-shadow(0 0 8px rgba(73,196,129,.55))}
  .nav .item.active span{color:var(--navActive)}
  .nav .item.active span{font-weight:600}
${LIQUID ? liquid(t) : ''}
`;

/** The liquid-glass overrides: the bar floats, every glass recipe gets a
 *  specular top edge, a diagonal sheen, a brighter rim and heavier blur, and
 *  the active tab sits in a lens. */
const liquid = (t) => `
  .search,.chip{background:${t.lqGlass};backdrop-filter:blur(30px) saturate(1.9);-webkit-backdrop-filter:blur(30px) saturate(1.9);border:1px solid ${t.lqRim};box-shadow:inset 0 1px 0 ${t.lqSpec},inset 0 -6px 14px ${t.lqInner},inset 0 0 0 .5px ${t.lqRim2},${t.lqShadow};overflow:hidden}
  .search::before,.chip::before,.nav::before,.search .dist::before{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(115deg,${t.lqSheen} 0%,transparent 38%,transparent 68%,${t.lqSheen2} 100%);pointer-events:none}
  .chip{position:relative}
  .search>*,.chip>*{position:relative}
  .search .dist{position:relative;overflow:hidden;background:${t.lqChipFill};border:1px solid ${t.lqRim};box-shadow:inset 0 1px 0 ${t.lqSpec},inset 0 0 0 .5px ${t.lqRim2}}
  .search .dist>*{position:relative}
  .nav{left:16px;right:16px;bottom:22px;height:66px;border-radius:33px;border:1px solid ${t.lqRim};background:${t.lqGlass};backdrop-filter:blur(30px) saturate(1.9);-webkit-backdrop-filter:blur(30px) saturate(1.9);box-shadow:inset 0 1px 0 ${t.lqSpec},inset 0 -1px 0 ${t.lqInner},inset 0 0 0 .5px ${t.lqRim2},${t.lqShadow};padding:0 8px;align-items:center;overflow:hidden}
  .nav .item{position:relative;height:54px;justify-content:center;border-radius:27px;gap:1px}
  .nav .item.active{background:${t.lqLens};box-shadow:inset 0 1px 0 ${t.lqSpec},inset 0 0 0 .5px ${t.lqLensRim},0 2px 10px ${t.lqLensGlow}}
  .sheet{bottom:104px}
`;

// The reference's pin: a --pin-top → --pin-bottom → --pin-end fill and a
// three-stop green stroke, both gradients; the selected pin differs by its
// gold glow (drawn on the wrapper), not by its stroke.
let pinSeq = 0;
const pinSvg = (sel, t) => {
  const id = `p${pinSeq++}`;
  return `<svg class="body" viewBox="0 0 46 60"><defs><linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${t.pinTop}"/><stop offset=".52" stop-color="${t.pinBottom}"/><stop offset="1" stop-color="${t.pinEnd}"/></linearGradient><linearGradient id="${id}s" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#a0dba5"/><stop offset=".6" stop-color="#53a969"/><stop offset="1" stop-color="#478a56"/></linearGradient></defs><path d="M23 2.5C12.2 2.5 3.5 11 3.5 21.6c0 14 19.5 35.9 19.5 35.9s19.5-21.9 19.5-35.9C42.5 11 33.8 2.5 23 2.5z" fill="url(#${id}f)" stroke="url(#${id}s)" stroke-width="${sel ? 2.6 : 2}"/></svg>`;
};

// The six pins, the user, the labels: frame px — the concept's composition.
const PINS = [
  { x: 169, y: 216 },
  { x: 308, y: 254, count: 2 },
  { x: 273, y: 350 },
  { x: 243, y: 448, sel: true },
  { x: 275, y: 516 },
  { x: 90, y: 530, count: 3 },
];
const YOU = { x: 204, y: 394 };
const LABELS = [
  { x: 296, y: 168, text: 'CROWN\nHEIGHTS' },
  { x: 62, y: 206, text: 'PROSPECT\nHEIGHTS' },
  { x: 348, y: 322, text: 'REMSEN\nVILLAGE' },
  { x: 84, y: 336, text: 'FLATBUSH' },
  { x: 186, y: 354, text: 'BROOKLYN', big: true },
  { x: 342, y: 468, text: 'FARRAGUT' },
  { x: 60, y: 444, text: 'KENSINGTON' },
  { x: 330, y: 582, text: 'FLATLANDS' },
  { x: 92, y: 592, text: 'MIDWOOD' },
];
const ROADS = [
  { x: 250, y: 200, r: 0, text: 'Church Ave' },
  { x: 130, y: 392, r: -74, text: 'Flatbush Ave' },
  { x: 238, y: 236, r: 0, text: 'Linden Blvd' },
  { x: 318, y: 408, r: -90, text: 'Nostrand Ave' },
  { x: 126, y: 480, r: -90, text: 'Ocean Ave' },
  { x: 300, y: 548, r: -32, text: 'Kings Hwy' },
];
const PARKS = [
  { x: 40, y: 296, w: 170, h: 130 },
  { x: 118, y: 250, w: 96, h: 70 },
  { x: 176, y: 560, w: 120, h: 86 },
  { x: 360, y: 600, w: 130, h: 90 },
];
const POIS = [
  { x: 100, y: 238, text: 'Brooklyn Botanic Garden', kind: 'park', icon: 'i-tree' },
  { x: 70, y: 296, text: 'Prospect Park', kind: 'park', icon: 'i-tree' },
  { x: 196, y: 268, text: 'Kings County Hospital Center', kind: 'hosp', icon: 'i-cross' },
  { x: 176, y: 562, text: 'Brooklyn College CUNY', kind: 'edu', icon: 'i-cap' },
];

async function page(theme) {
  const t = THEMES[theme];
  const map = await mapLayer(STYLES[theme]);
  const parks = PARKS.map((p) => `<div class="park" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px"></div>`).join('\n');
  const labels = LABELS.map((l) => `<div class="nlabel${l.big ? ' big' : ''}" style="left:${l.x}px;top:${l.y}px">${l.text.replace('\n', '<br>')}</div>`).join('\n');
  const roads = ROADS.map((r) => `<div class="road" style="left:${r.x}px;top:${r.y}px;--r:${r.r}deg">${r.text}</div>`).join('\n');
  const pois = POIS.map((o) => `<div class="poi ${o.kind}" style="left:${o.x}px;top:${o.y}px"><i><svg><use href="#${o.icon}"/></svg></i><span>${o.text}</span></div>`).join('\n');
  const pins = PINS.map((p) => {
    const sel = p.sel === true;
    return [
      sel ? `<div class="selglow" style="left:${p.x}px;top:${p.y + 18}px"></div>` : '',
      `<div class="pin${sel ? ' sel' : ''}" style="left:${p.x}px;top:${p.y}px">${pinSvg(sel, t)}<svg class="glyph"><use href="#i-briefcase"/></svg>${p.count ? `<div class="count">${p.count}</div>` : ''}</div>`,
      sel ? `<div class="seldot" style="left:${p.x}px;top:${p.y + 16}px"></div>` : '',
    ].join('');
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BRAZOS — Explore nearby jobs (${theme})</title>
<!-- Generated by map-explore.build.mjs. Map tiles © Esri, HERE, Garmin, OpenStreetMap
     contributors; the phone draws Apple Maps (see the generator's header). -->
<style>${css(t)}</style>
</head>
<body>
${sprite}
<div class="stage">
  <div class="phone">
    <div class="map">
${map}
      <div class="tint"></div>
${parks}
      <div class="topfade"></div>
    </div>
${roads}
${labels}
${pois}

    <div class="youhalo" style="left:${YOU.x}px;top:${YOU.y}px"></div>
    <div class="youring" style="left:${YOU.x}px;top:${YOU.y}px"></div>
${pins}
    <div class="you" style="left:${YOU.x}px;top:${YOU.y}px"></div>

    <div class="status">
      <div class="time">9:41 <svg viewBox="0 0 24 24"><use href="#i-arrow"/></svg></div>
      <div class="right">
        <div class="bars"><i></i><i></i><i></i><i></i></div>
        <svg class="wifi" viewBox="0 0 16 12" fill="none" stroke="${t.statusInk}" stroke-width="1.8" stroke-linecap="round"><path d="M1.5 4.2a10 10 0 0 1 13 0"/><path d="M4 6.9a6.2 6.2 0 0 1 8 0"/><path d="M6.4 9.4a2.6 2.6 0 0 1 3.2 0"/></svg>
        <div class="batt">36</div>
      </div>
    </div>

    <div class="search glass">
      <svg class="mag"><use href="#i-search"/></svg>
      <div class="ph">Explore nearby jobs</div>
      <div class="dist"><svg><use href="#i-sliders"/></svg>5 mi</div>
    </div>
    <div class="chips">
      <div class="chip glass"><svg><use href="#i-calendar"/></svg>Today</div>
    </div>

    <div class="attrib">© Esri, HERE, Garmin, OpenStreetMap contributors</div>

    <div class="sheet glass">
      <div class="grab"></div>
      <div class="head">
        <div>
          <h2>6 open jobs</h2>
          <div class="sub">Near you <i></i> Within 5 miles</div>
        </div>
        <div class="view">View list <svg><use href="#i-chev"/></svg></div>
      </div>
      <div class="card">
        <div class="photo"><img src="${photo(theme)}" alt=""></div>
        <div class="body">
          <div class="title">Furniture Assembly</div>
          <div class="meta"><span class="cat">Assembly</span><span>Today</span></div>
          <div class="loc"><svg><use href="#i-loc"/></svg>Flatbush, Brooklyn</div>
        </div>
        <div class="est"><div class="lbl">EST. PAY</div><div class="amt">$60</div></div>
        <svg class="chev"><use href="#i-chev"/></svg>
      </div>
    </div>

    <div class="nav">
      <div class="item"><svg><use href="#i-home"/></svg><span>Home</span></div>
      <div class="item active"><svg><use href="#i-pin"/></svg><span>Map</span></div>
      <div class="item"><svg><use href="#i-briefcase"/></svg><span>My Jobs</span></div>
      <div class="item"><svg><use href="#i-chat"/></svg><span>Inbox</span></div>
      <div class="item"><svg><use href="#i-person"/></svg><span>Profile</span></div>
    </div>
  </div>
</div>
</body>
</html>
`;
}

for (const theme of ['dark', 'light']) {
  const html = await page(theme);
  const name = `map-explore${LIQUID ? '-liquid' : ''}-${theme}.html`;
  const dir = LIQUID ? join(root, '.shots', 'mockups') : here;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), html);
  console.log(`wrote ${name} (${(html.length / 1024).toFixed(0)} KB)${LIQUID ? ' to .shots/mockups/' : ''}`);
}
