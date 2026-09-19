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
const THEMES = {
  dark: {
    ink: '#F1EDE1', muted: '#93A096', emerald: '#5FAE81', gold: '#D4A24C', mint: '#0E1F18',
    navInactive: '#7C8A80', navActive: '#49C481', chrome: '#071B15', chromeLine: 'rgba(229,241,236,0.20)',
    statusInk: '#FFFFFF',
    // the concept's glass: a deep green pane, a bright mint rim, a soft lift
    glass: 'rgba(6,24,18,0.60)', glassBlur: '22px', glassRim: 'rgba(120,205,150,0.34)', glassEdge: 'rgba(229,241,236,0.16)',
    glassShadow: '0 12px 34px rgba(0,0,0,0.45)', chipFill: 'rgba(95,174,129,0.10)',
    // the map: Apple's dark slate, streets lifted, no purple
    mapGround: '#1C2029', tileFilter: 'brightness(2.15) contrast(1.85) brightness(0.62)',
    mapTint: '#46506B', mapTintBlend: 'color', mapTintOpacity: 0.85,
    label: 'rgba(196,204,201,0.72)', labelShadow: 'rgba(10,14,20,0.9)', road: 'rgba(196,204,201,0.50)', big: 'rgba(225,230,226,0.85)',
    park: 'rgba(58,132,88,0.38)', poi: '#E8ECF0', poiPark: '#5FAE81', poiHosp: '#E0594F', poiEdu: '#C7A26A',
    pinFill: '#0F2119', pinStroke: '#5FAE81', pinGlyph: '#F1EDE1', pinGlow: 'rgba(95,174,129,0.45)',
    badge: '#49C481', badgeInk: '#FFFFFF', badgeRing: '#0B1512',
    userDot: '#2F7BF6', userHalo: 'rgba(47,123,246,0.26)',
    cardFill: 'rgba(255,255,255,0.05)', cardRim: 'rgba(120,205,150,0.22)', photoBg: '#15362B',
    estLabel: '#D4A24C', estPay: '#5FAE81', catFill: 'rgba(95,174,129,0.14)', catRim: 'rgba(95,174,129,0.35)',
  },
  light: {
    ink: '#13201B', muted: '#6E7771', emerald: '#0D6B52', gold: '#C8A15B', mint: '#E5F1EC',
    navInactive: '#839087', navActive: '#0D6B52', chrome: '#FFFFFF', chromeLine: '#DDE2DD',
    statusInk: '#13201B',
    glass: 'rgba(255,255,255,0.74)', glassBlur: '22px', glassRim: 'rgba(13,107,82,0.22)', glassEdge: 'rgba(255,255,255,0.95)',
    glassShadow: '0 10px 30px rgba(19,32,27,0.12)', chipFill: 'rgba(13,107,82,0.08)',
    mapGround: '#F1EEE6', tileFilter: 'brightness(1.02)',
    mapTint: '#DCD1B2', mapTintBlend: 'multiply', mapTintOpacity: 0.8,
    label: 'rgba(70,78,74,0.78)', labelShadow: 'rgba(255,255,255,0.9)', road: 'rgba(70,78,74,0.55)', big: 'rgba(40,48,44,0.9)',
    park: 'rgba(96,176,126,0.32)', poi: '#2F3A34', poiPark: '#2E7D4F', poiHosp: '#D9463B', poiEdu: '#8B6A3E',
    pinFill: '#FFFFFF', pinStroke: '#0D6B52', pinGlyph: '#0D6B52', pinGlow: 'rgba(13,107,82,0.25)',
    badge: '#0D6B52', badgeInk: '#FFFFFF', badgeRing: '#FFFFFF',
    userDot: '#2F7BF6', userHalo: 'rgba(47,123,246,0.20)',
    cardFill: 'rgba(255,255,255,0.65)', cardRim: 'rgba(13,107,82,0.16)', photoBg: '#E5F1EC',
    estLabel: '#C8A15B', estPay: '#0D6B52', catFill: 'rgba(13,107,82,0.08)', catRim: 'rgba(13,107,82,0.22)',
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
  .batt{height:15px;padding:0 5px;border-radius:5px;background:${t.statusInk};color:${t.mapGround};font-size:11px;font-weight:700;display:flex;align-items:center}
  /* glass — the concept's: deep green pane, mint rim, a lift */
  .glass{background:var(--glass);backdrop-filter:blur(${t.glassBlur}) saturate(140%);-webkit-backdrop-filter:blur(${t.glassBlur}) saturate(140%);border:1px solid var(--glassRim);box-shadow:inset 0 1px 0 var(--glassEdge),${t.glassShadow}}
  /* search */
  .search{position:absolute;left:17px;right:17px;top:62px;height:56px;border-radius:28px;display:flex;align-items:center;padding:0 8px 0 20px;gap:13px}
  .search .mag{width:24px;height:24px;color:var(--ink);opacity:.92;flex:0 0 auto}
  .search .ph{flex:1;font-size:18px;color:var(--ink);opacity:.94;letter-spacing:-.1px}
  .search .dist{display:flex;align-items:center;gap:8px;height:42px;padding:0 15px 0 13px;border-radius:21px;border:1px solid var(--glassRim);background:${t.chipFill};color:var(--gold);font-size:17px;font-weight:600;box-shadow:inset 0 1px 0 var(--glassEdge)}
  .search .dist svg{width:21px;height:21px}
  /* chips */
  .chips{position:absolute;left:17px;top:132px;display:flex;gap:10px}
  .chip{display:flex;align-items:center;gap:9px;height:42px;padding:0 17px 0 14px;border-radius:21px;font-size:16px;font-weight:500;color:var(--ink)}
  .chip svg{width:19px;height:19px;color:var(--emerald)}
  /* pins */
  .pin{position:absolute;width:46px;height:60px;transform:translate(-50%,-100%);filter:drop-shadow(0 0 9px ${t.pinGlow}) drop-shadow(0 4px 6px rgba(0,0,0,.35))}
  .pin svg.body{position:absolute;inset:0;width:46px;height:60px}
  .pin .glyph{position:absolute;left:13px;top:11px;width:20px;height:20px;color:${t.pinGlyph}}
  .pin .count{position:absolute;right:-5px;top:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:${t.badge};color:${t.badgeInk};font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px ${t.badgeRing}}
  .pin.sel{width:60px;height:78px;filter:drop-shadow(0 0 16px rgba(212,162,76,.6)) drop-shadow(0 0 5px rgba(212,162,76,.7))}
  .pin.sel svg.body{width:60px;height:78px}
  .pin.sel .glyph{left:17px;top:15px;width:26px;height:26px}
  .seldot{position:absolute;width:9px;height:9px;border-radius:5px;background:var(--gold);transform:translate(-50%,-50%);box-shadow:0 0 12px rgba(212,162,76,.85)}
  .selglow{position:absolute;width:150px;height:76px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(95,174,129,.34),rgba(95,174,129,0));pointer-events:none}
  .you{position:absolute;width:24px;height:24px;border-radius:12px;background:${t.userDot};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15),0 2px 8px rgba(0,0,0,.4);transform:translate(-50%,-50%)}
  .youhalo{position:absolute;width:72px;height:72px;border-radius:36px;background:${t.userHalo};transform:translate(-50%,-50%)}
  /* the sheet */
  .sheet{position:absolute;left:16px;right:16px;bottom:100px;border-radius:30px;padding:12px 22px 22px;display:flex;flex-direction:column;gap:14px}
  .grab{width:44px;height:4px;border-radius:2px;background:var(--muted);opacity:.45;margin:0 auto}
  .head{display:flex;align-items:flex-start;justify-content:space-between}
  .head h2{margin:0;font-size:30px;line-height:34px;font-weight:700;letter-spacing:-.5px;color:var(--ink)}
  .head .sub{display:flex;align-items:center;gap:9px;margin-top:5px;font-size:16px;color:var(--muted)}
  .head .sub i{display:block;width:7px;height:7px;border-radius:4px;background:var(--emerald);box-shadow:0 0 8px rgba(95,174,129,.6)}
  .view{display:flex;align-items:center;gap:3px;margin-top:8px;color:var(--emerald);font-size:18px;font-weight:600}
  .view svg{width:22px;height:22px}
  .card{display:flex;align-items:center;gap:11px;padding:11px 12px 11px 11px;border-radius:20px;background:${t.cardFill};border:1px solid ${t.cardRim};box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
  .card .photo{width:52px;height:52px;border-radius:26px;background:${t.photoBg};overflow:hidden;flex:0 0 auto;border:2px solid rgba(212,162,76,.75);box-shadow:0 0 12px rgba(212,162,76,.25)}
  .card .photo img{width:100%;height:100%;object-fit:cover;object-position:60% 55%;transform:scale(1.4)}
  .card .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
  .card .title{font-size:16px;font-weight:600;letter-spacing:-.3px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .meta{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--muted)}
  .card .cat{display:inline-flex;align-items:center;height:23px;padding:0 10px;border-radius:12px;background:${t.catFill};color:var(--emerald);font-size:12.5px;font-weight:600;border:1px solid ${t.catRim}}
  .card .loc{display:flex;align-items:center;gap:5px;font-size:13.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .loc svg{width:13px;height:13px;color:var(--gold);flex:0 0 auto}
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
  .nav .item.active span{font-weight:600}
`;

const pinSvg = (sel, t) => `<svg class="body" viewBox="0 0 46 60"><path d="M23 2.5C12.2 2.5 3.5 11 3.5 21.6c0 14 19.5 35.9 19.5 35.9s19.5-21.9 19.5-35.9C42.5 11 33.8 2.5 23 2.5z" fill="${t.pinFill}" stroke="${sel ? t.gold : t.pinStroke}" stroke-width="${sel ? 2.6 : 2}"/></svg>`;

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
  writeFileSync(join(here, `map-explore-${theme}.html`), html);
  console.log(`wrote map-explore-${theme}.html (${(html.length / 1024).toFixed(0)} KB)`);
}
