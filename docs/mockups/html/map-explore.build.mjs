// Generates map-explore-dark.html and map-explore-light.html: the worker Map
// screen ("Explore nearby jobs") as a 393x852 iPhone 15 Pro frame, one theme
// per file, everything embedded — the map tiles, the job photo, the glyphs.
//
//   node docs/mockups/html/map-explore.build.mjs
//
// THE MAP. The phone draws Apple Maps (components/HotspotMap.native.tsx,
// MapKit via react-native-maps, no Google provider on iOS); Apple's tiles
// cannot be embedded without a developer token, so the mockup carries real
// tiles of Brooklyn from Esri's keyless services — the Dark Gray Canvas (base
// + its label layer) for dark, light streets on a dark ground like Apple's,
// tinted toward Apple's navy / purple-grey with a colour blend; the Light
// Gray Canvas for light, warmed to cream — fetched ONCE into .shots/map-tiles/ and inlined as
// data URIs. (CARTO's basemaps watermark without a key now.) Colours and
// label style on the phone will differ a little. Attribution:
// © Esri, HERE, Garmin, OpenStreetMap contributors.
//
// EVERYTHING ELSE is the operator's target (2026-09-19): the composition of
// the reference concept (glass search pill with the distance chip, one
// "Today" chip, briefcase pins with count badges, the gold selected pin, the
// user dot, a floating glass sheet with the job card) built from the app's
// own tokens — the `clear` material's glass, the palettes, the real worker
// nav bar (ui/tokens.ts navBar, ui/primitives/BottomNav.tsx) — so every
// value on screen is one the app can render.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const cacheDir = join(root, '.shots', 'map-tiles');

// ---------------------------------------------------------------------------
// The map: Flatbush, Brooklyn — the reference's centre — at zoom 14, shown at
// 0.85 so the frame spans Prospect Park to Kings Highway like the screenshot.
// ---------------------------------------------------------------------------
// A touch south of Flatbush: Esri's baked-in regional label then sits under
// the search bar's glass instead of mid-frame.
const CENTER = { lat: 40.6265, lng: -73.9465 };
const ZOOM = 14;
const TILE_CSS = 256 * 0.78; // one 256-tile drawn at this many CSS px (Esri serves 256 only)
const PHONE = { w: 393, h: 852 };

const toTile = (lat, lng, z) => {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
};

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
// Each theme is one or more tile layers drawn in order (Esri's dark canvas
// keeps its labels on a separate "Reference" layer).
const STYLES = {
  // The base only: Esri's label layer is sparse at this zoom (one regional
  // name dead centre), so the neighbourhood names are drawn by the page.
  dark: [
    { name: 'esri-dark-base', url: (z, x, y) => `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}` },
  ],
  // Light: the Light Gray Canvas base — white roads on pale grey, no labels,
  // Apple's own structure — warmed toward the app's cream by the tint.
  light: [
    { name: 'esri-light-base', url: (z, x, y) => `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}` },
  ],
};

async function tileDataUri(style, z, x, y) {
  const dir = join(cacheDir, style.name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${z}-${x}-${y}.png`);
  if (!existsSync(file)) {
    const res = await fetch(style.url(z, x, y), { headers: { 'User-Agent': 'brazos-mockup/1 (design mockup, ~20 tiles)' } });
    if (!res.ok) throw new Error(`${style.name} ${z}/${x}/${y}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
}

/** The tile grid that covers the phone, positioned so CENTER lands mid-map;
 *  one <img> per tile per layer, layers in order. */
async function mapLayer(layers) {
  const c = toTile(CENTER.lat, CENTER.lng, ZOOM);
  // The map's visual centre: between the search bar and the sheet, ~y 360.
  const centrePx = { x: PHONE.w / 2, y: 360 };
  const x0 = Math.floor(c.x) - 2, x1 = Math.floor(c.x) + 2;
  const y0 = Math.floor(c.y) - 2, y1 = Math.floor(c.y) + 2;
  const imgs = [];
  for (const style of layers) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const left = centrePx.x + (tx - c.x) * TILE_CSS;
        const top = centrePx.y + (ty - c.y) * TILE_CSS;
        if (left + TILE_CSS < -1 || top + TILE_CSS < -1 || left > PHONE.w + 1 || top > PHONE.h + 1) continue;
        const src = await tileDataUri(style, ZOOM, tx, ty);
        imgs.push(`<img class="tile" src="${src}" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px" alt="">`);
      }
    }
  }
  return imgs.join('\n');
}

/** Screen position of a lat/lng, for pins placed on real streets. */
function project(lat, lng) {
  const c = toTile(CENTER.lat, CENTER.lng, ZOOM);
  const p = toTile(lat, lng, ZOOM);
  return { x: PHONE.w / 2 + (p.x - c.x) * TILE_CSS, y: 360 + (p.y - c.y) * TILE_CSS };
}

// ---------------------------------------------------------------------------
// The two palettes — ui/tokens.ts values, named after their keys.
// ---------------------------------------------------------------------------
const THEMES = {
  dark: {
    ink: '#F1EDE1', muted: '#93A096', emerald: '#5FAE81', gold: '#D4A24C', mint: '#0E1F18',
    surface: '#0A1813', bg: '#02110D', line: '#55482E', secondaryBorder: '#2F5140',
    navInactive: '#7C8A80', navActive: '#49C481', chrome: '#071B15', chromeLine: 'rgba(229,241,236,0.20)',
    // the clear material, dark
    glass: 'rgba(7,27,21,0.40)', glassBlur: '30px', glassRim: 'rgba(255,255,255,0.14)', glassEdge: 'rgba(255,255,255,0.22)',
    glassShadow: 'none',
    chipInk: '#F1EDE1', statusInk: '#FFFFFF', badge: '#49C481', badgeInk: '#FFFFFF',
    pinFill: '#0E1F18', pinStroke: '#5FAE81', pinGlyph: '#F1EDE1',
    userDot: '#2F7BF6', userHalo: 'rgba(47,123,246,0.28)',
    // the map tint: Apple's dark navy under CARTO's black, streets lifted purple-grey
    mapGround: '#1F2334', mapTint: '#3D4468', mapTintBlend: 'color', mapTintOpacity: 0.85, tileFilter: 'brightness(0.82) contrast(1.45)', tileBlend: 'normal',
    label: 'rgba(214,218,232,0.62)', poi: '#E8ECF5', park: '#7FD39A', poiPark: '#3E8E5A', poiHosp: '#E0594F', poiEdu: '#B98A5C',
    photoBg: '#15362B', cardFill: 'rgba(255,255,255,0.06)', cardRim: 'rgba(255,255,255,0.10)',
    estLabel: '#93A096', estPay: '#5FAE81',
  },
  light: {
    ink: '#13201B', muted: '#6E7771', emerald: '#0D6B52', gold: '#C8A15B', mint: '#E5F1EC',
    surface: '#FFFFFF', bg: '#F6F3EA', line: '#DDE2DD', secondaryBorder: '#CBE0D7',
    navInactive: '#839087', navActive: '#0D6B52', chrome: '#FFFFFF', chromeLine: '#DDE2DD',
    // the clear material's light recipe, "L2 Frost"
    glass: 'rgba(255,255,255,0.72)', glassBlur: '25px', glassRim: 'rgba(255,255,255,0.85)', glassEdge: 'rgba(255,255,255,0.95)',
    glassShadow: '0 8px 30px rgba(19,32,27,0.10)',
    chipInk: '#13201B', statusInk: '#13201B', badge: '#0D6B52', badgeInk: '#FFFFFF',
    pinFill: '#FFFFFF', pinStroke: '#0D6B52', pinGlyph: '#0D6B52',
    userDot: '#2F7BF6', userHalo: 'rgba(47,123,246,0.22)',
    mapGround: '#F3F0E8', mapTint: '#E9DFC6', mapTintBlend: 'multiply', mapTintOpacity: 0.32, tileFilter: 'contrast(1.4) brightness(1.02)', tileBlend: 'normal',
    label: 'rgba(70,78,74,0.75)', poi: '#2F3A34', park: '#2E7D4F', poiPark: '#2E7D4F', poiHosp: '#D9463B', poiEdu: '#8B6A3E',
    photoBg: '#E5F1EC', cardFill: 'rgba(255,255,255,0.60)', cardRim: 'rgba(19,32,27,0.08)',
    estLabel: '#6E7771', estPay: '#0D6B52',
  },
};

// The job photo: the app's own armchair art (assets/prestige), never stock.
const photo = (theme) =>
  `data:image/png;base64,${readFileSync(join(root, 'assets', 'prestige', theme === 'dark' ? 'hero_armchair_customer.png' : 'hero_armchair_customer_light.png')).toString('base64')}`;

// ---------------------------------------------------------------------------
// Glyphs — inline SVG symbols in the Ionicons outline manner the app draws.
// ---------------------------------------------------------------------------
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></symbol>
<symbol id="i-sliders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--glassFill,#000)"/><circle cx="15" cy="12" r="2" fill="var(--glassFill,#000)"/><circle cx="8" cy="17" r="2" fill="var(--glassFill,#000)"/></symbol>
<symbol id="i-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
<symbol id="i-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/></symbol>
<symbol id="i-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c-5 0-9 3.4-9 7.6 0 2.4 1.3 4.5 3.4 5.9L5.5 20.5l4-1.7c.8.2 1.6.3 2.5.3 5 0 9-3.4 9-7.6s-4-8-9-8z"/><circle cx="8.5" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="11" r=".9" fill="currentColor" stroke="none"/></symbol>
<symbol id="i-person" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></symbol>
<symbol id="i-loc" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.7-6-11a6 6 0 0 1 12 0c0 5.3-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3 3 10.5l8.5 2 2 8.5z"/></symbol>
</defs></svg>`;

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
const css = (t) => `
  :root{--ink:${t.ink};--muted:${t.muted};--emerald:${t.emerald};--gold:${t.gold};--mint:${t.mint};--surface:${t.surface};--bg:${t.bg};--line:${t.line};--secondaryBorder:${t.secondaryBorder};--navInactive:${t.navInactive};--navActive:${t.navActive};--chrome:${t.chrome};--chromeLine:${t.chromeLine};--glass:${t.glass};--glassRim:${t.glassRim};--glassEdge:${t.glassEdge};--glassFill:${t.glass}}
  html,body{margin:0;background:#101010;font-family:-apple-system,"SF Pro Text","SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
  .stage{display:flex;justify-content:center;padding:28px 16px}
  .phone{position:relative;width:${PHONE.w}px;height:${PHONE.h}px;overflow:hidden;border-radius:55px;background:${t.mapGround};box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px rgba(0,0,0,.6)}
  /* the map */
  .map{position:absolute;inset:0;overflow:hidden;background:${t.mapGround}}
  .map .tile{position:absolute;width:${TILE_CSS}px;height:${TILE_CSS}px;display:block;filter:${t.tileFilter};mix-blend-mode:${t.tileBlend};image-rendering:auto}
  .map .tint{position:absolute;inset:0;background:${t.mapTint};mix-blend-mode:${t.mapTintBlend};opacity:${t.mapTintOpacity};pointer-events:none}
  .map .topfade{position:absolute;left:0;right:0;top:0;height:150px;background:linear-gradient(180deg,${t.mapGround} 0%,transparent 100%);opacity:.65}
  .nlabel{position:absolute;transform:translate(-50%,-50%);font-size:11.5px;line-height:13px;font-weight:600;letter-spacing:1.1px;text-transform:uppercase;text-align:center;color:${t.label};text-shadow:0 0 6px ${t.mapGround};pointer-events:none;white-space:nowrap}
  .nlabel.big{font-size:14px;letter-spacing:1.6px;color:${t.poi};opacity:.85}
  .poi{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:${t.poi};text-shadow:0 0 5px ${t.mapGround},0 0 2px ${t.mapGround};white-space:nowrap;pointer-events:none}
  .poi i{display:block;width:13px;height:13px;border-radius:7px;flex:0 0 auto;box-shadow:0 0 0 1.5px rgba(255,255,255,.75)}
  .poi.park i{background:${t.poiPark}}.poi.park span{color:${t.park}}
  .poi.hosp i{background:${t.poiHosp}}.poi.hosp span{color:${t.poiHosp}}
  .poi.edu i{background:${t.poiEdu}}
  .attrib{position:absolute;left:14px;bottom:268px;font-size:9px;color:var(--muted);opacity:.7;letter-spacing:.1px}
  /* status bar */
  .status{position:absolute;left:0;right:0;top:0;height:54px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 26px 8px 34px;color:${t.statusInk};font-weight:600;font-size:17px;letter-spacing:-.2px}
  .status .time{display:flex;align-items:center;gap:5px}
  .status .time svg{width:14px;height:14px}
  .status .right{display:flex;align-items:center;gap:7px}
  .bars{display:flex;align-items:flex-end;gap:1.5px;height:11px}.bars i{display:block;width:3px;background:${t.statusInk};border-radius:1px}
  .bars i:nth-child(1){height:4px}.bars i:nth-child(2){height:6px}.bars i:nth-child(3){height:8.5px}.bars i:nth-child(4){height:11px}
  .wifi{width:16px;height:12px}
  .batt{height:15px;padding:0 5px;border-radius:5px;background:${t.statusInk};color:${t.mapGround};font-size:11px;font-weight:700;display:flex;align-items:center}
  /* glass */
  .glass{background:var(--glass);backdrop-filter:blur(${t.glassBlur}) saturate(150%);-webkit-backdrop-filter:blur(${t.glassBlur}) saturate(150%);border:1px solid var(--glassRim);box-shadow:inset 0 1px 0 var(--glassEdge)${t.glassShadow === 'none' ? '' : ',' + t.glassShadow}}
  /* search */
  .search{position:absolute;left:18px;right:18px;top:64px;height:52px;border-radius:26px;display:flex;align-items:center;padding:0 6px 0 18px;gap:12px}
  .search .mag{width:22px;height:22px;color:var(--ink);opacity:.9;flex:0 0 auto}
  .search .ph{flex:1;font-size:17px;color:var(--ink);opacity:.92;letter-spacing:-.1px}
  .search .dist{display:flex;align-items:center;gap:7px;height:40px;padding:0 14px 0 12px;border-radius:20px;border:1px solid var(--glassRim);background:rgba(127,127,127,.08);color:var(--gold);font-size:16px;font-weight:600}
  .search .dist svg{width:20px;height:20px}
  /* chips */
  .chips{position:absolute;left:18px;top:128px;display:flex;gap:10px}
  .chip{display:flex;align-items:center;gap:8px;height:40px;padding:0 16px 0 13px;border-radius:20px;font-size:15px;font-weight:500;color:var(--ink)}
  .chip svg{width:18px;height:18px;color:var(--emerald)}
  /* pins */
  .pin{position:absolute;width:40px;height:52px;transform:translate(-50%,-100%)}
  .pin svg.body{position:absolute;inset:0;width:40px;height:52px}
  .pin .glyph{position:absolute;left:11px;top:9px;width:18px;height:18px;color:${t.pinGlyph}}
  .pin .count{position:absolute;right:-4px;top:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:${t.badge};color:${t.badgeInk};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px ${t.mapGround}}
  .pin.sel{width:52px;height:68px;filter:drop-shadow(0 0 14px rgba(212,162,76,.55)) drop-shadow(0 0 4px rgba(212,162,76,.6))}
  .pin.sel svg.body{width:52px;height:68px}
  .pin.sel .glyph{left:15px;top:13px;width:22px;height:22px}
  .seldot{position:absolute;width:8px;height:8px;border-radius:4px;background:var(--gold);transform:translate(-50%,-50%);box-shadow:0 0 10px rgba(212,162,76,.8)}
  .selglow{position:absolute;width:120px;height:60px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(95,174,129,.28),rgba(95,174,129,0));pointer-events:none}
  .you{position:absolute;width:22px;height:22px;border-radius:11px;background:${t.userDot};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15),0 2px 6px rgba(0,0,0,.35);transform:translate(-50%,-50%)}
  .youhalo{position:absolute;width:64px;height:64px;border-radius:32px;background:${t.userHalo};transform:translate(-50%,-50%)}
  /* the sheet */
  .sheet{position:absolute;left:16px;right:16px;bottom:98px;border-radius:28px;padding:10px 20px 18px;display:flex;flex-direction:column;gap:12px}
  .grab{width:40px;height:4px;border-radius:2px;background:var(--muted);opacity:.45;margin:0 auto}
  .head{display:flex;align-items:flex-start;justify-content:space-between}
  .head h2{margin:0;font-size:27px;line-height:32px;font-weight:700;letter-spacing:-.4px;color:var(--ink)}
  .head .sub{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:15px;color:var(--muted)}
  .head .sub i{display:block;width:6px;height:6px;border-radius:3px;background:var(--emerald)}
  .view{display:flex;align-items:center;gap:2px;margin-top:6px;color:var(--emerald);font-size:17px;font-weight:600}
  .view svg{width:20px;height:20px}
  .card{display:flex;align-items:center;gap:12px;padding:10px 12px 10px 10px;border-radius:20px;background:${t.cardFill};border:1px solid ${t.cardRim};box-shadow:inset 0 1px 0 rgba(255,255,255,.10)}
  .card .photo{width:58px;height:58px;border-radius:14px;background:${t.photoBg};overflow:hidden;flex:0 0 auto;border:1px solid ${t.cardRim}}
  .card .photo img{width:100%;height:100%;object-fit:cover;object-position:60% 55%;transform:scale(1.35)}
  .card .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
  .card .title{font-size:16px;font-weight:600;letter-spacing:-.2px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .meta{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
  .card .cat{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:11px;background:${t.mint};color:var(--emerald);font-size:12px;font-weight:600;border:1px solid ${t.secondaryBorder}}
  .card .loc{display:flex;align-items:center;gap:4px;font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .loc svg{width:13px;height:13px;color:var(--gold);flex:0 0 auto}
  .card .est{text-align:right;flex:0 0 auto;padding-left:2px}
  .card .est .lbl{font-size:10px;font-weight:700;letter-spacing:.6px;color:${t.estLabel}}
  .card .est .amt{font-size:22px;line-height:26px;font-weight:700;letter-spacing:-.5px;color:${t.estPay}}
  .card .chev{width:18px;height:18px;color:var(--muted);flex:0 0 auto;margin-left:-4px}
  /* the nav bar — the app's: 70 of content + 12 of home-indicator pad */
  .nav{position:absolute;left:0;right:0;bottom:0;height:82px;background:var(--chrome);border-top:1px solid var(--chromeLine);display:flex;align-items:flex-start;padding:10px 6px 0}
  .nav .item{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--navInactive);font-size:12px;font-weight:500}
  .nav .item svg{width:30px;height:30px}
  .nav .item.active{color:var(--navActive)}
  .nav .item.active svg{filter:drop-shadow(0 0 8px rgba(73,196,129,.55))}
  .nav .item.active span{font-weight:600}
  .homebar{position:absolute;left:50%;bottom:8px;width:134px;height:5px;border-radius:3px;background:var(--ink);opacity:.9;transform:translateX(-50%)}
`;

const pinSvg = (sel, t) => `<svg class="body" viewBox="0 0 40 52"><path d="M20 2C10.6 2 3 9.4 3 18.6c0 12.2 17 31.4 17 31.4s17-19.2 17-31.4C37 9.4 29.4 2 20 2z" fill="${t.pinFill}" stroke="${sel ? t.gold : t.pinStroke}" stroke-width="${sel ? 2.4 : 1.8}"/></svg>`;

// The six pins and the user, in frame px — the reference's composition
// (measured off the concept at 393x852), which is what the map is under.
const PINS = [
  { x: 169, y: 214 },
  { x: 306, y: 250, count: 2 },
  { x: 273, y: 348 },
  { x: 243, y: 446, sel: true },
  { x: 273, y: 512 },
  { x: 92, y: 528, count: 3 },
];
const YOU = { x: 220, y: 406 };
// Neighbourhood labels and the reference's POIs, placed as the two
// references place them (frame px), Apple-style small caps.
const LABELS = [
  { x: 282, y: 170, text: 'CROWN\nHEIGHTS' },
  { x: 60, y: 226, text: 'PROSPECT\nHEIGHTS' },
  { x: 350, y: 322, text: 'REMSEN\nVILLAGE' },
  { x: 84, y: 330, text: 'FLATBUSH' },
  { x: 196, y: 372, text: 'BROOKLYN', big: true },
  { x: 338, y: 468, text: 'FARRAGUT' },
  { x: 62, y: 448, text: 'KENSINGTON' },
  { x: 330, y: 580, text: 'FLATLANDS' },
  { x: 96, y: 590, text: 'MIDWOOD' },
];
const POIS = [
  { x: 96, y: 262, text: 'Brooklyn Botanic Garden', kind: 'park' },
  { x: 68, y: 298, text: 'Prospect Park', kind: 'park' },
  { x: 200, y: 280, text: 'Kings County Hospital Center', kind: 'hosp' },
  { x: 168, y: 560, text: 'Brooklyn College CUNY', kind: 'edu' },
];

async function page(theme) {
  const t = THEMES[theme];
  const map = await mapLayer(STYLES[theme]);
  const you = YOU;
  const labels = LABELS.map((l) => {
    const at = l;
    return `<div class="nlabel${l.big ? ' big' : ''}" style="left:${at.x.toFixed(1)}px;top:${at.y.toFixed(1)}px">${l.text.replace('\n', '<br>')}</div>`;
  }).join('\n');
  const pois = POIS.map((o) => {
    const at = o;
    return `<div class="poi ${o.kind}" style="left:${at.x.toFixed(1)}px;top:${at.y.toFixed(1)}px"><i></i><span>${o.text}</span></div>`;
  }).join('\n');
  const pins = PINS.map((p) => {
    const at = p;
    const sel = p.sel === true;
    return [
      sel ? `<div class="selglow" style="left:${at.x.toFixed(1)}px;top:${(at.y + 16).toFixed(1)}px"></div>` : '',
      `<div class="pin${sel ? ' sel' : ''}" style="left:${at.x.toFixed(1)}px;top:${at.y.toFixed(1)}px">${pinSvg(sel, t)}<svg class="glyph"><use href="#i-briefcase"/></svg>${p.count ? `<div class="count">${p.count}</div>` : ''}</div>`,
      sel ? `<div class="seldot" style="left:${at.x.toFixed(1)}px;top:${(at.y + 14).toFixed(1)}px"></div>` : '',
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
      <div class="topfade"></div>
    </div>
${labels}
${pois}

    <div class="youhalo" style="left:${you.x.toFixed(1)}px;top:${you.y.toFixed(1)}px"></div>
${pins}
    <div class="you" style="left:${you.x.toFixed(1)}px;top:${you.y.toFixed(1)}px"></div>

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
