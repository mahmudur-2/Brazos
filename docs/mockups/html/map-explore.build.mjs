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
// --filters (2026-09-19): the Filters sheet up over this screen — the app's
// docked sheet carrying the one job-filter vocabulary (lib/jobFilters.ts) as
// tap chips: distance, minimum budget, when, categories, sort. Written as
// map-explore-filters-{theme}.html beside the map pages.
const FILTERS = process.argv.includes('--filters');
// --card (2026-09-20): the jobs sheet OPEN, three rows, the card spacing the
// operator asked to see before the app changes — the neighbourhood alone as
// the location, the day word with room before the pay column, EST. PAY
// top-aligned with the title.
const CARD = process.argv.includes('--card');

// 2026-09-19, third pass: the liquid-glass treatment IS the page — dark's
// panes are glass (blur, specular top edge, diagonal sheen, bright rim, the
// card as a lens); light is the same composition with FLAT, opaque panes
// (operator: "same way but flat"). The nav bar is the app's solid strip in
// both, as live.

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

/** The tile grid that covers the phone, positioned so CENTER lands at MAP_MID_Y.
 *  The bytes live ONCE per page as CSS classes (a gallery page draws the map
 *  a dozen times); each frame's tiles are divs wearing those classes. */
async function mapLayer(style) {
  const c = toTile(CENTER.lat, CENTER.lng, ZOOM);
  const x0 = Math.floor(c.x) - 2, x1 = Math.floor(c.x) + 2;
  const y0 = Math.floor(c.y) - 2, y1 = Math.floor(c.y) + 2;
  const css = [], html = [];
  let i = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const left = PHONE.w / 2 + (tx - c.x) * TILE_CSS;
      const top = MAP_MID_Y + (ty - c.y) * TILE_CSS;
      if (left + TILE_CSS < -1 || top + TILE_CSS < -1 || left > PHONE.w + 1 || top > PHONE.h + 1) continue;
      const src = await tileDataUri(style, ZOOM, tx, ty);
      css.push(`.t${i}{background-image:url("${src}")}`);
      html.push(`<div class="tile t${i}" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px"></div>`);
      i++;
    }
  }
  return { css: css.join('\n'), html: html.join('\n') };
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
    // the nav bar is the app's, as live: ui/tokens.ts chrome (GLASS_SCRIM at 1), the mint hairline at .2, navBar.activeColorDark
    navInactive: '#7C8A80', navActive: '#49C481', chrome: '#071B15', chromeLine: 'rgba(229,241,236,0.20)',
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
    cardFill: 'rgba(1,15,12,.50)', cardRim: 'rgba(183,203,186,.22)', photoBg: '#15362B', photoRing: '#edb65d', glyphInk: '#edb65d',
    viewList: '#edb65d', estLabel: '#a1aaa4', estPay: '#edb65d', catFill: 'rgba(132,223,170,.10)', catRim: 'rgba(183,203,186,.22)',
    // the liquid panes
    lqBlur: '30px',
    lqGlass: 'linear-gradient(125deg,rgba(3,24,16,.92),rgba(10,48,32,.84))', lqRim: 'rgba(170,235,200,.46)', lqRim2: 'rgba(255,255,255,.08)', lqSat: 2.1,
    lqSpec: 'transparent', lqInner: 'rgba(132,223,170,.12)', lqSheen: 'rgba(150,235,190,.10)', lqSheen2: 'rgba(150,235,190,.04)',
    lqSheetGlass: 'linear-gradient(125deg,rgba(3,24,16,.93),rgba(10,48,32,.86))', lqRow: 'rgba(1,15,12,.50)', lqRowRim: 'rgba(183,203,186,.22)',
    lqChipRim: 'rgba(171,189,157,.39)', lqChipInk: '#edb65d', lqChipWeight: 600,
    // the Filters sheet
    fScrim: 'rgba(2,17,13,.55)', fPane: 'linear-gradient(125deg,rgba(3,24,16,.95),rgba(10,48,32,.91))', fHair: 'rgba(183,203,186,.20)',
    fChip: 'rgba(255,255,255,.045)', fChipRim: 'rgba(183,203,186,.22)', fChipInk: '#e5e8e5',
    fSel: 'rgba(132,223,170,.16)', fSelRim: 'rgba(132,223,170,.48)', fSelInk: '#84dfaa',
    fDone: '#edb65d', fTrack: 'rgba(255,255,255,.05)', fPrimary: '#0D6B52', fPrimaryInk: '#F1EDE1', fPrimaryLift: 'rgba(95,174,129,.18)',
    // the popup: the app's menu material (ui/tokens.ts materials.menu: the scrim ink at .82, the mint hairline at .14, radius 16)
    pPane: 'rgba(7,27,21,.90)', pRim: 'rgba(229,241,236,.14)', pShadow: '0 14px 34px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.10)', pHair: 'rgba(183,203,186,.10)',
    pInk: '#e5e8e5', pOnInk: '#84dfaa', pCal: '#a1aaa4',
    lqShadow: '0 12px 30px rgba(0,0,0,.48)', lqChipFill: 'rgba(132,223,170,.10)',
    lqLens: 'linear-gradient(160deg,rgba(132,223,170,.22),rgba(132,223,170,.06))', lqLensRim: 'rgba(170,235,200,.38)', lqLensGlow: 'rgba(73,196,129,.22)',
  },
  light: {
    ink: '#13201B', muted: '#637569', emerald: '#238658', gold: '#a77824', mint: '#E5F1EC',
    // the nav bar is the app's, as live: the light surface, the line hairline, emerald active, navInactive
    navInactive: '#839087', navActive: '#0D6B52', chrome: '#FFFFFF', chromeLine: '#DDE2DD',
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
    cardFill: 'rgba(255,255,255,.59)', cardRim: 'rgba(56,97,65,.22)', photoBg: '#E5F1EC', photoRing: '#a77824', glyphInk: '#238658',
    viewList: '#13201B', estLabel: '#637569', estPay: '#C08F2E', catFill: 'rgba(35,134,88,.08)', catRim: 'rgba(56,97,65,.22)',
    // the flat panes (operator, 2026-09-19): plain white, the app's line
    // hairline, the app's card shadow - no gradient, no sheen, no edge, no blur
    lqBlur: null,
    lqGlass: '#FFFFFF', lqRim: '#DDE2DD', lqRim2: 'transparent',
    lqSpec: 'transparent', lqInner: 'transparent', lqSheen: 'transparent', lqSheen2: 'transparent',
    lqShadow: '0 6px 22px rgba(52,83,59,.14)', lqChipFill: '#F6F3EA', lqChipRim: 'transparent', lqChipInk: '#13201B', lqChipWeight: 500,
    lqSheetGlass: '#FFFFFF', lqRow: '#F9F3E7', lqRowRim: 'rgba(200,161,91,.26)',
    lqLens: 'none', lqLensRim: 'transparent', lqLensGlow: 'rgba(19,32,27,.05)',
    // the Filters sheet, flat
    fScrim: 'rgba(19,32,27,.35)', fPane: '#FFFFFF', fHair: '#DDE2DD',
    fChip: '#FFFFFF', fChipRim: '#DDE2DD', fChipInk: '#13201B',
    fSel: '#E5F1EC', fSelRim: '#CBE0D7', fSelInk: '#0D6B52',
    fDone: '#0D6B52', fTrack: '#F1F3F1', fPrimary: '#0D6B52', fPrimaryInk: '#FFFFFF', fPrimaryLift: 'transparent',
    // the popup, flat: the surface, the line hairline, the raised shadow
    pPane: '#FFFFFF', pRim: '#DDE2DD', pShadow: '0 14px 34px rgba(19,32,27,.18)', pHair: '#EEF1EC',
    pInk: '#13201B', pOnInk: '#0D6B52', pCal: '#6E7771',
  },
};

// The job photo: the app's own armchair art (assets/prestige), never stock —
// one CSS class per page, worn by every frame's card.
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
<symbol id="i-sparkles" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6-5.6-1.9 5.6-1.9z"/><path d="M5 15l.9 2.6 2.6.9-2.6.9L5 22l-.9-2.6-2.6-.9 2.6-.9z"/><path d="M19 3l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></symbol>
<symbol id="i-mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21M9 21h6"/></symbol>
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
  .map .tile{position:absolute;width:${TILE_CSS}px;height:${TILE_CSS}px;display:block;background-size:100% 100%;filter:${t.tileFilter}}
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
  .search{position:absolute;left:17px;right:17px;top:62px;height:62px;border-radius:31px;display:flex;align-items:center;padding:0 8px 0 20px;gap:10px}
  .search .mic{width:23px;height:23px;color:var(--ink);opacity:.85;flex:0 0 auto;margin-right:2px}
  .search .mag{width:25px;height:25px;color:var(--ink);opacity:.92;flex:0 0 auto}
  .search .ph{flex:1;font-size:18px;color:var(--ink);opacity:.94;letter-spacing:-.1px}
  .search .dist{display:flex;align-items:center;gap:6px;height:34px;padding:0 11px 0 10px;border-radius:17px;border:1px solid ${t.distRim};background:${t.distFill};color:var(--gold);font-size:16px;font-weight:600}
  .search .dist svg{width:18px;height:18px}
  /* chips */
  .chips{position:absolute;left:17px;top:138px;display:flex;gap:10px}
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
  .sheet{position:absolute;left:16px;right:16px;bottom:93px;border-radius:30px;padding:12px 22px 22px;display:flex;flex-direction:column;gap:14px}
  .grab{width:44px;height:4px;border-radius:2px;background:var(--muted);opacity:.45;margin:0 auto}
  .head{display:flex;align-items:flex-start;justify-content:space-between}
  .head h2{margin:0;font-size:30px;line-height:34px;font-weight:700;letter-spacing:-.5px;color:var(--ink)}
  .head .sub{display:flex;align-items:center;gap:9px;margin-top:5px;font-size:16px;color:var(--muted)}
  .head .sub i{display:block;width:7px;height:7px;border-radius:4px;background:var(--emerald)}
  .view{display:flex;align-items:center;gap:3px;margin-top:8px;color:${t.viewList};font-size:18px;font-weight:600}
  .view svg{width:20px;height:20px;position:relative;top:1.5px}
  /* 2026-09-20 — the row's spacing, revised on the phone walk: the pay column
     keeps its own 6px of air after the body (the day word never touches the
     figure), EST. PAY top-aligns with the title, the photo and chevron stay
     centred, and the location is the neighbourhood alone. */
  .card{display:flex;align-items:center;gap:12px;padding:11px 12px 11px 11px;border-radius:20px;background:${t.cardFill};border:1px solid ${t.cardRim};box-shadow:inset 0 1px 1px #fff03}
  .card .photo.glyph{display:flex;align-items:center;justify-content:center}
  .card .photo.glyph svg{width:22px;height:22px;color:${t.glyphInk}}
  /* the day word never overlaps the pay column, and never costs a line:
     it sits beside the chip when the two fit the body's width, and moves to
     the end of the location line when the chip alone fills the row (the
     widest chips: "TV mounting", "Handyman / Repairs"). "Tomorrow" is
     "Tmrw". The body clips as a last guarantee. */
  .card .body{overflow:hidden}
  .card .meta>*{white-space:nowrap}
  .card .loc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .card .loc .day{color:var(--emerald);margin-left:6px}
  /* the pay column lives INSIDE the body, over its top two lines: the title
     and the category line keep 62px clear of it (its 56 plus 6 of air), the
     location line runs the full width beneath. The label pins to the top,
     the amount centres on the body. */
  .card .body{position:relative}
  .card .title,.card .meta{padding-right:62px}
  .card .est{position:absolute;top:0;bottom:0;right:0;width:56px;display:flex;flex-direction:column;justify-content:center}
  .card .est .lbl{position:absolute;top:1px;right:0}
  /* the open sheet takes the height its rows need, up to the line under the
     search pill (the operator's red line): 3 rows stop short, 5 rows cap and
     the list scrolls. bottom:100 is the nav bar plus the inset. */
  .sheet.open{box-sizing:border-box;top:auto;bottom:93px;max-height:calc(${PHONE.h}px - 130px - 93px);overflow:hidden}
  /* the MINI stop (2026-09-20, sitting 2): tucked under the nav, the handle and the top half of the count line showing */
  .sheet.mini{top:${PHONE.h - 93 - 48}px;bottom:auto;height:260px;overflow:hidden}
  .sheet.mini ~ .nav{z-index:20}
  .sheet.open .list{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:hidden}
  .view svg.down{transform:rotate(90deg)}
  .card .photo{width:52px;height:52px;border-radius:26px;background:${t.photoBg};overflow:hidden;flex:0 0 auto;border:1px solid ${t.photoRing};box-shadow:inset 0 1px 4px #ffffff13}
  .card .photo i{display:block;width:100%;height:100%;background-size:cover;background-position:60% 55%;transform:scale(1.4)}
  .card .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
  .card .title{font-size:16px;font-weight:600;letter-spacing:-.3px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .meta{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--emerald)}
  .card .cat{display:inline-flex;align-items:center;height:23px;padding:0 10px;border-radius:12px;background:${t.catFill};color:var(--emerald);font-size:12.5px;font-weight:600;border:1px solid ${t.catRim}}
  .card .loc{display:flex;align-items:center;gap:5px;font-size:13.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .loc svg{width:16px;height:16px;color:var(--emerald);flex:0 0 auto;margin-left:-1px;position:relative;top:-.5px}
  .card .est{text-align:right;flex:0 0 auto}
  .card .est .lbl{font-size:10px;font-weight:700;letter-spacing:.7px;color:${t.estLabel}}
  .card .est .amt{font-size:26px;line-height:30px;font-weight:700;letter-spacing:-.5px;color:${t.estPay}}
  .card .chev{width:16px;height:16px;color:var(--muted);flex:0 0 auto;margin-left:-4px}
  /* the nav bar — the app's: 70 of content + 12 of home-indicator pad */
  .nav{position:absolute;left:0;right:0;bottom:0;height:82px;background:var(--chrome);border-top:1px solid var(--chromeLine);display:flex;align-items:flex-start;padding:10px 6px 0}
  .nav .item{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--navInactive);font-size:12px;font-weight:500}
  .nav .item svg{width:30px;height:30px}
  .nav .item.active{color:var(--navActive)}
  .nav .item.active svg{filter:drop-shadow(0 0 8px rgba(73,196,129,.55))}
  .nav .item.active span{color:var(--navActive)}
  .nav .item.active span{font-weight:600}
${panes(t)}
${FILTERS ? filtersCss(t) : ''}
`;

const filtersCss = (t) => `
  .fscrim{position:absolute;inset:0;background:${t.fScrim};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .fsheet{position:absolute;left:0;right:0;bottom:0;border-radius:28px 28px 0 0;background:${t.fPane};${t.lqBlur ? `backdrop-filter:blur(30px) saturate(${t.lqSat ?? 1.9});-webkit-backdrop-filter:blur(30px) saturate(${t.lqSat ?? 1.9});` : ''}border-top:1px solid ${t.lqRim};box-shadow:0 -10px 40px rgba(0,0,0,.35);padding:10px 0 0;display:flex;flex-direction:column;overflow:hidden}
  .fsheet .grab{margin:0 auto 10px}
  .fhead{display:flex;align-items:center;justify-content:space-between;padding:0 20px 14px;border-bottom:1px solid ${t.fHair}}
  .fhead h2{margin:0;font-size:24px;line-height:28px;font-weight:700;letter-spacing:-.4px;color:var(--ink)}
  .fhead .done{font-size:17px;font-weight:600;color:${t.fDone}}
  .fbody{padding:8px 20px 4px;display:flex;flex-direction:column;gap:16px}
  .chips-row.scroll{flex-wrap:nowrap;overflow:hidden;margin:0 -20px;padding:0 20px;mask-image:linear-gradient(90deg,#000 88%,transparent);-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent)}
  .fsec{display:flex;flex-direction:column;gap:10px}
  .fsec .lbl{font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
  .fsec .note{font-size:12.5px;color:var(--muted);margin-top:-2px}
  .chips-row{display:flex;flex-wrap:wrap;gap:5px}
  /* 2026-09-20 (sitting 2): Distance, Minimum budget and When FILL their row — one rule */
  .chips-row.fill{flex-wrap:nowrap}
  .chips-row.fill .fchip{flex:1 1 auto;justify-content:center}
  .fchip{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 10px;border-radius:17px;background:${t.fChip};border:1px solid ${t.fChipRim};color:${t.fChipInk};font-size:12.5px;font-weight:500;white-space:nowrap;letter-spacing:-.1px}
  .fchip.on{background:${t.fSel};border-color:${t.fSelRim};color:${t.fSelInk};font-weight:600}
  .fchip.skills{padding-left:11px}
  .fchip.any{box-sizing:border-box;min-width:55px;justify-content:center}
  .fchip svg{width:15px;height:15px}
  .fchip.sortpill{padding-right:9px;gap:5px}
  .fchip.sortpill .dim{color:var(--muted);font-weight:500;margin-right:1px}
  .fchip.sortpill .caret{width:14px;height:14px;color:${t.fSelInk};opacity:.85}
  .popup.sort{width:262px;mask-image:none;-webkit-mask-image:none}
  .popup.sort .prow{height:52px;padding:0 14px 0 10px}
  .prow .two{display:flex;flex-direction:column;gap:1px;line-height:1.15}
  .prow .two b{font-weight:600;font-size:15px}
  .prow.on .two b{color:${t.pOnInk}}
  .prow .two small{font-size:11.5px;font-weight:400;color:var(--muted);letter-spacing:0}
  .ffoot{display:flex;align-items:center;gap:14px;padding:14px 20px 34px;border-top:1px solid ${t.fHair}}
  .ffoot .reset{font-size:16px;font-weight:600;color:var(--muted);padding:0 6px}
  .fchip{position:relative}
  .fchip.open{z-index:6}
  .popup{position:absolute;top:calc(100% + 6px);width:168px;padding:5px 0;border-radius:16px;background:${t.pPane};${t.lqBlur ? 'backdrop-filter:blur(25px) saturate(1.6);-webkit-backdrop-filter:blur(25px) saturate(1.6);' : ''}border:1px solid ${t.pRim};box-shadow:${t.pShadow};overflow:hidden;height:${POP_ROWS * ROW_H + 10}px;mask-image:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent);-webkit-mask-image:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent)}
  .fchip.right .popup{right:0}
  .fchip.left .popup{left:0}
  .fchip.up .popup{top:auto;bottom:calc(100% + 6px)}
  .plist{display:flex;flex-direction:column}
  .prow{display:flex;align-items:center;gap:8px;height:${ROW_H}px;padding:0 14px 0 10px;font-size:15px;font-weight:500;color:${t.pInk};border-top:1px solid ${t.pHair};white-space:nowrap}
  .prow:first-child{border-top:0}
  .prow.on{color:${t.pOnInk};font-weight:600}
  .prow .tick{width:18px;height:18px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:${t.pOnInk}}
  .prow .tick svg{width:16px;height:16px}
  .prow .cal{display:inline-flex;align-items:flex-end;justify-content:center;width:20px;height:20px;border-radius:5px;border:1.4px solid ${t.pCal};position:relative;margin-right:2px;flex:0 0 auto}
  .prow .cal::before{content:'';position:absolute;left:-1.4px;right:-1.4px;top:-1.4px;height:5px;border-radius:5px 5px 0 0;background:${t.pCal}}
  .prow .cal i{font-style:normal;font-size:9.5px;font-weight:700;line-height:14px;color:${t.pCal}}
  .ffoot .show{flex:1;height:50px;border-radius:25px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,${t.fPrimaryLift},transparent 60%),${t.fPrimary};color:${t.fPrimaryInk};font-size:17px;font-weight:700;letter-spacing:-.2px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
`;

// THE CUSTOM LISTS, from the operator's rules (2026-09-19).
// Distance: 1..10 by 1, 15..50 by 5, 60..100 by 10, 200..1000 by 100, 2000..3000 by 1000.
const DISTANCE_VALUES = (() => { const v = []; for (let m = 1; m <= 10; m++) v.push(m); for (let m = 15; m <= 50; m += 5) v.push(m); for (let m = 60; m <= 100; m += 10) v.push(m); for (let m = 200; m <= 1000; m += 100) v.push(m); for (let m = 2000; m <= 3000; m += 1000) v.push(m); return v; })();
// Budget: $5..$50 by 5, $60..$100 by 10, $125..$500 by 25, $600..$10,000 by 100.
const BUDGET_VALUES = (() => { const v = []; for (let d = 5; d <= 50; d += 5) v.push(d); for (let d = 60; d <= 100; d += 10) v.push(d); for (let d = 125; d <= 500; d += 25) v.push(d); for (let d = 600; d <= 10000; d += 100) v.push(d); return v; })();
// Dates: the 30 days after today (2026-09-19 in the mockup), no increments.
const DATE_VALUES = (() => { const out = []; const base = new Date(2026, 8, 19); for (let i = 1; i <= 30; i++) { const d = new Date(base); d.setDate(base.getDate() + i); out.push(d); } return out; })();
const fmtMiles = (m) => `${m.toLocaleString('en-US')} mi`;
const fmtDollars = (d) => `$${d.toLocaleString('en-US')}`;
const fmtDate = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const ROW_H = 44, POP_ROWS = 6;
// THE SORTS (operator, 2026-09-19), each with the rule the app will implement.
const SORTS = [
  { key: 'smart', label: 'Smart Match', hint: 'Matches based on your skills' },
  { key: 'newest', label: 'Newest', hint: 'Soonest job date first, then newest posted' },
  { key: 'pay', label: 'Highest budget', hint: 'Best pay first' },
  { key: 'distance', label: 'Distance', hint: 'Least travel first' },
  { key: 'bids', label: 'Fewest bids', hint: 'Least competition, then closest' },
];

// THE MOMENTS: what each frame of the gallery shows.
const STATES = [
  { id: 'closed', label: '1 · the Custom pills' },
  { id: 'dist-start', label: '2 · Distance custom — 1 to 10', open: 'distance', at: 0 },
  { id: 'dist-mid', label: '3 · Distance custom — 50s to 100s', open: 'distance', at: DISTANCE_VALUES.indexOf(50) - 1 },
  { id: 'dist-end', label: '4 · Distance custom — 1,000 to 3,000', open: 'distance', at: DISTANCE_VALUES.length - POP_ROWS },
  { id: 'dist-picked', label: '5 · Distance picked — 35 mi', picked: { distance: 35 } },
  { id: 'budget-start', label: '6 · Budget custom — $5 to $50', open: 'budget', at: 0 },
  { id: 'budget-mid', label: '7 · Budget custom — $125 to $250', open: 'budget', at: BUDGET_VALUES.indexOf(125) },
  { id: 'budget-end', label: '8 · Budget custom — $800 and up', open: 'budget', at: BUDGET_VALUES.indexOf(800) },
  { id: 'budget-picked', label: '9 · Budget picked — $175', picked: { budget: 175 } },
  { id: 'date-start', label: '10 · Date custom — from tomorrow', open: 'date', at: 0 },
  { id: 'date-mid', label: '11 · Date custom — into October', open: 'date', at: 13 },
  { id: 'date-picked', label: '12 · Date picked — Sep 27', picked: { date: 7 } },
  { id: 'sort-open', label: '13 · Sort by — the five options', open: 'sort', at: 0 },
  { id: 'sort-newest', label: '14 · Sort picked — Newest', picked: { sort: 'newest' } },
  { id: 'sort-bids', label: '15 · Sort picked — Fewest bids', picked: { sort: 'bids' } },
];

// The categories (operator, 2026-09-19): the app's ELEVEN real job
// categories - the ones jobs are posted under - with friendly names. The
// "All services" entries are search shortcuts onto these (Electrical,
// Plumbing, Appliances, Pest Control and Drywall are all handyman; Junk
// Removal is moving; and so on), so a chip per shortcut would promise a
// precision the data does not have. Each chip here filters exactly what it says.
const CATEGORIES = ['Assembly', 'Moving', 'Cleaning', 'TV mounting', 'Handyman / Repairs', 'Yard work', 'Painting', 'Packing', 'Pet care', 'Errands', 'Other'];
const MY_SKILLS = new Set(['Assembly', 'Moving', 'TV mounting']);

const filtersSheet = (st = {}) => {
  const picked = st.picked ?? {};
  const open = st.open ?? null;
  const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  /** The popup under a Custom pill: POP_ROWS rows visible, scrolled to `at`,
   *  the current value ticked; `kind` picks the list and the row shape. */
  const popup = (kind, at, current) => {
    let rows;
    if (kind === 'distance') rows = DISTANCE_VALUES.map((m) => ({ key: m, html: fmtMiles(m) }));
    else if (kind === 'budget') rows = BUDGET_VALUES.map((d) => ({ key: d, html: fmtDollars(d) }));
    else if (kind === 'sort') rows = SORTS.map((o) => ({ key: o.key, html: `<span class="two"><b>${o.label}</b><small>${o.hint}</small></span>` }));
    else rows = DATE_VALUES.map((d, i) => ({ key: i, html: `<span class="cal"><i>${d.getDate()}</i></span>${fmtDate(d)}` }));
    const visible = kind === 'sort' ? SORTS.length : kind === 'date' ? POP_ROWS - 1 : POP_ROWS;
    const start = Math.max(0, Math.min(at, rows.length - visible));
    const list = rows.map((r) => `<div class="prow${r.key === current ? ' on' : ''}"><span class="tick">${r.key === current ? checkSvg : ''}</span>${r.html}</div>`).join('');
    const rowH = kind === 'sort' ? 52 : ROW_H;
    return `<div class="popup ${kind}" style="height:${visible * rowH + 10}px"><div class="plist" style="margin-top:-${start * rowH}px">${list}</div></div>`;
  };
  /** A Custom pill: its label is the picked value when there is one. */
  const customPill = (kind, label, current, anchor) => {
    const isOpen = open === kind;
    const has = label != null;
    return `<div class="fchip custom${has || isOpen ? ' on' : ''}${isOpen ? ' open' : ''} ${anchor}">${has ? label : 'Custom'}${isOpen ? popup(kind, st.at ?? 0, current) : ''}</div>`;
  };
  const distanceCurrent = picked.distance ?? 5;
  const budgetCurrent = picked.budget ?? null;
  const dateCurrent = picked.date ?? null;
  const on = (cond) => (cond ? ' on' : '');
  return `
    <div class="fscrim"></div>
    <div class="fsheet">
      <div class="grab"></div>
      <div class="fhead"><h2>Filters</h2><div class="done">Done</div></div>
      <div class="fbody">
        <div class="fsec"><div class="lbl">Distance</div>
          <div class="chips-row fill"><div class="fchip any">Any</div><div class="fchip">2 mi</div><div class="fchip${on(picked.distance == null)}">5 mi</div><div class="fchip">10 mi</div><div class="fchip">25 mi</div>${customPill('distance', picked.distance != null ? fmtMiles(picked.distance) : null, distanceCurrent, 'right')}</div></div>
        <div class="fsec"><div class="lbl">Minimum budget</div>
          <div class="chips-row fill"><div class="fchip any${on(picked.budget == null)}">Any</div><div class="fchip">$25</div><div class="fchip">$50</div><div class="fchip">$100</div><div class="fchip">$250</div>${customPill('budget', picked.budget != null ? fmtDollars(picked.budget) : null, budgetCurrent, 'right')}</div>
          <div class="note">Jobs with no budget set are always shown.</div></div>
        <div class="fsec"><div class="lbl">When</div>
          <div class="chips-row fill"><div class="fchip any">Any</div><div class="fchip today${on(picked.date == null)}">Today</div><div class="fchip">Tomorrow</div><div class="fchip">This week</div>${customPill('date', picked.date != null ? fmtShort(DATE_VALUES[picked.date]) : null, dateCurrent, 'right up')}</div></div>
        <div class="fsec"><div class="lbl">Categories</div>
          <div class="chips-row scroll"><div class="fchip on skills"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>Best Match</div>${CATEGORIES.map((c) => `<div class="fchip${MY_SKILLS.has(c) ? ' on' : ''}">${c}</div>`).join('')}</div>
          <div class="note">Nothing selected means every category.</div></div>
        <div class="fsec"><div class="lbl">Sort</div>
          <div class="chips-row">${(() => { const cur = SORTS.find((o) => o.key === (picked.sort ?? 'smart')); const isOpen = open === 'sort'; return `<div class="fchip sortpill on${isOpen ? ' open' : ''} left up"><span class="dim">Sort by</span>${cur.label}<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>${isOpen ? popup('sort', 0, cur.key) : ''}</div>`; })()}</div></div>
      </div>
      <div class="ffoot"><div class="reset">Reset</div><div class="show">Show 6 jobs</div></div>
    </div>`;
};

/** The panes: the search bar, the chips, the sheet and the card. Dark is
 *  liquid glass — blur, a specular top edge, a diagonal sheen, a bright rim,
 *  the card as a lens; light is the same composition FLAT: opaque fills, no
 *  blur, the same edges. The nav bar is not a pane: it is the app's strip. */
const panes = (t) => {
  const blur = t.lqBlur ? `backdrop-filter:blur(${t.lqBlur}) saturate(${t.lqSat ?? 1.9});-webkit-backdrop-filter:blur(${t.lqBlur}) saturate(${t.lqSat ?? 1.9});` : '';
  return `
  .search,.chip{background:${t.lqGlass};${blur}border:1px solid ${t.lqRim};box-shadow:inset 0 1px 0 ${t.lqSpec},inset 0 -6px 14px ${t.lqInner},inset 0 0 0 .5px ${t.lqRim2},${t.lqShadow};overflow:hidden}
  .search::before,.chip::before,.search .dist::before{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(115deg,${t.lqSheen} 0%,transparent 38%,transparent 68%,${t.lqSheen2} 100%);pointer-events:none}
  .chip{position:relative}
  .search>*,.chip>*{position:relative}
  .search .dist{position:relative;overflow:hidden;background:${t.lqChipFill};border:1px solid ${t.lqChipRim};color:${t.lqChipInk};font-weight:${t.lqChipWeight};box-shadow:inset 0 1px 0 ${t.lqSpec},inset 0 0 0 .5px ${t.lqRim2}}
  .search .dist>*{position:relative}
  .sheet{background:${t.lqSheetGlass};${blur}border:1px solid ${t.lqRim};box-shadow:inset 0 1px 0 ${t.lqSpec},inset 0 -8px 18px ${t.lqInner},inset 0 0 0 .5px ${t.lqRim2},${t.lqShadow};overflow:hidden}
  .sheet::before{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(115deg,${t.lqSheen} 0%,transparent 34%,transparent 70%,${t.lqSheen2} 100%);pointer-events:none}
  .sheet>*{position:relative}
  .card{background:${t.lqRow};border:1px solid ${t.lqRowRim};box-shadow:inset 0 1px 1px #fff03}
`;
};

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
  const tiles = await mapLayer(STYLES[theme]);
  const map = tiles.html;
  const sharedCss = `${tiles.css}\n.photoimg{background-image:url("${photo(theme)}")}`;
  const states = FILTERS ? STATES : CARD ? CARD_STATES : [null];
  const frames = states.map((st) => frame(theme, t, map, st)).join('\n');
  return shell(theme, t, sharedCss, frames);
}

/** The rows the --card gallery lists: the phone walk's E2E fixture (no photo,
 *  a dated job), the concept's photo row (Today), and a long neighbourhood.
 *  The day word is Today / Tomorrow / "Sep 2" - month and day, no weekday,
 *  so the row keeps its air before the pay column on a 393pt phone. */
const CARDS = [
  { title: 'E2E 1788397497221', cat: 'Cleaning', day: 'Sep 2', loc: 'Brighton Beach', pay: '$50', photo: false },
  { title: 'Furniture Assembly', cat: 'Assembly', day: 'Today', loc: 'Flatbush', pay: '$60', photo: true },
  { title: 'Deep clean before a move-out', cat: 'Cleaning', day: 'Sep 26', loc: 'Bedford-Stuyvesant', pay: '$120', photo: false },
  { title: 'Mount a 65" TV above the fireplace', cat: 'TV mounting', day: 'Tmrw', loc: 'Park Slope', pay: '$95', photo: false },
  { title: 'Fix a leaking kitchen tap', cat: 'Handyman / Repairs', day: 'Sep 22', loc: 'Sunset Park', pay: '$70', photo: false },
  { title: 'Help carry a couch down three flights', cat: 'Moving', day: 'Sep 24', loc: 'Crown Heights', pay: '$80', photo: false },
];
/** The two moments the --card gallery shows: three rows (the sheet stops
 *  where its rows do) and five (capped under the search pill, the list scrolls). */
const CARD_STATES = [
  { id: 'open3', label: '3 jobs — the sheet is as tall as its rows', rows: CARDS.slice(0, 3) },
  { id: 'open5', label: '6 jobs — capped under the search bar, the list scrolls', rows: CARDS },
  { id: 'mini', label: 'MINI — swiped down: the handle and the top half of the count line above the bar', rows: CARDS.slice(0, 3), mini: true },
];
/** Whether the chip and the day fit side by side in the body (about 138px at
 *  393pt with the 26px amount): the widths the fonts draw, estimated the way
 *  the app will measure them. */
const dayBesideChip = (c) => 12.5 * 0.56 * c.cat.length + 22 + 9 + 14 * 0.56 * c.day.length <= 138;
const cardRow = (c) => `<div class="card">
        <div class="photo${c.photo ? '' : ' glyph'}">${c.photo ? '<i class="photoimg"></i>' : '<svg><use href="#i-sparkles"/></svg>'}</div>
        <div class="body">
          <div class="title">${c.title}</div>
          <div class="meta"><span class="cat">${c.cat}</span>${dayBesideChip(c) ? `<span>${c.day}</span>` : ''}</div>
          <div class="loc"><svg><use href="#i-loc"/></svg>${c.loc}${dayBesideChip(c) ? '' : `<span class="day">· ${c.day}</span>`}</div>
          <div class="est"><div class="lbl">EST. PAY</div><div class="amt">${c.pay}</div></div>
        </div>
        <svg class="chev"><use href="#i-chev"/></svg>
      </div>`;

/** One phone. `st` null = the map screen; a state = the Filters sheet at that moment. */
function frame(theme, t, map, st) {
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

  const shot = st ? `${CARD ? 'card' : 'filters'}-${st.id}-${theme}` : `map-${theme}`;
  return `${st ? `<div class="slot"><div class="slot-label">${st.label}</div>` : ''}
  <div class="phone" data-shot="${shot}">
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
      <svg class="mic"><use href="#i-mic"/></svg>
      <div class="dist"><svg><use href="#i-sliders"/></svg>5 mi</div>
    </div>
    <div class="chips">
      <div class="chip glass"><svg><use href="#i-calendar"/></svg>Today</div>
    </div>

    <div class="attrib">© Esri, HERE, Garmin, OpenStreetMap contributors</div>

    <div class="sheet glass${CARD ? (st.mini ? ' mini' : ' open') : ''}">
      <div class="grab"></div>
      <div class="head">
        <div>
          <h2>${CARD ? st.rows.length : '6'} open jobs</h2>
          <div class="sub">Near you <i></i> ${CARD ? 'Any distance' : 'Within 5 miles'}</div>
        </div>
        <div class="view">${CARD ? 'Hide <svg class="down"><use href="#i-chev"/></svg>' : 'View <svg><use href="#i-chev"/></svg>'}</div>
      </div>
      ${CARD ? `<div class="list">${st.rows.map(cardRow).join('')}</div>` : cardRow(CARDS[1])}
    </div>

    <div class="nav">
      <div class="item"><svg><use href="#i-home"/></svg><span>Home</span></div>
      <div class="item active"><svg><use href="#i-pin"/></svg><span>Map</span></div>
      <div class="item"><svg><use href="#i-briefcase"/></svg><span>My Jobs</span></div>
      <div class="item"><svg><use href="#i-chat"/></svg><span>Inbox</span></div>
      <div class="item"><svg><use href="#i-person"/></svg><span>Profile</span></div>
    </div>
${st && !CARD ? filtersSheet(st) : ''}
  </div>${st ? '</div>' : ''}`;
}

function shell(theme, t, sharedCss, frames) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BRAZOS — ${FILTERS ? 'Filters, moment by moment' : 'Explore nearby jobs'} (${theme})</title>
<!-- Generated by map-explore.build.mjs. Map tiles © Esri, HERE, Garmin, OpenStreetMap
     contributors; the phone draws Apple Maps (see the generator's header). -->
<style>${css(t)}
${sharedCss}
  .stage{flex-wrap:wrap;gap:28px;align-items:flex-start}
  .slot{display:flex;flex-direction:column;align-items:center;gap:10px}
  .slot-label{font-size:13px;font-weight:600;letter-spacing:.03em;color:#9aa39e}
</style>
</head>
<body>
${sprite}
<div class="stage">
${frames}
</div>
</body>
</html>
`;
}

for (const theme of ['dark', 'light']) {
  const html = await page(theme);
  const name = CARD ? `peek-card-${theme}.html` : `map-explore${FILTERS ? '-filters' : ''}-${theme}.html`;
  writeFileSync(join(here, name), html);
  console.log(`wrote ${name} (${(html.length / 1024).toFixed(0)} KB)`);
}
