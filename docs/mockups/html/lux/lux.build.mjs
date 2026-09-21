// EMERALD LUX GLASS — the dark redesign's reference pages (direction B,
// chosen by the operator 2026-09-21 from three rendered systems). One HTML
// per screen, each a 393x852 phone with a single .phone[data-shot], shot by
// docs/mockups/html/shoot.mjs into .shots/mockups/lux-<screen>.png.
//
//   node docs/mockups/html/lux/lux.build.mjs            every screen
//   node docs/mockups/html/lux/lux.build.mjs home,jobs  a subset
//
// THE SYSTEM is README.md beside this file; the checklist of screens still
// to draw is SCREENS.md. A new screen is a render function in SCREENS below,
// built from the primitives here (glass card, field, cta, chips, rows, nav,
// sticky bar) and the app's OWN copy and data shapes — every control the
// live screen has, laid out the Lux way. Honest to the phone: flat fills and
// CSS gradients the app draws with experimental_backgroundImage, blur only
// where the app has a material, the app's own art as the only photo, no
// invented marketplace data beyond the harness's seeded jobs. Nothing here
// is applied to the app until the operator says so.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '../../../../tests/pngGeometry.mjs';
import { encodePng } from '../../../../scripts/atmosphere-tune.mjs';
import { resample } from '../../../../scripts/home-ground-blend.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const asset = (name) => `data:image/png;base64,${readFileSync(join(root, 'assets', 'prestige', name)).toString('base64')}`;
// The two pieces of art the app owns, read only by the screens that draw
// them. The toolbox (1329x885, 1.3 MB) is resampled to its slot at 2x through
// the repository's own codec, so the page that carries it stays small.
let photoUri, toolboxUri;
const photoSrc = () => (photoUri ??= asset('hero_armchair_customer.png'));
const toolboxSrc = () => {
  if (!toolboxUri) {
    const img = decode(join(root, 'assets', 'prestige', 'hero_toolbox_worker.png'));
    const small = resample(img, 340, 226);
    toolboxUri = `data:image/png;base64,${encodePng({ width: small.width, height: small.height, pixels: small.pixels, bpp: small.bpp }).toString('base64')}`;
  }
  return toolboxUri;
};

// ---------------------------------------------------------------------------
// CONTENT — the app's own words and the harness's seeded jobs (scripts/shots.mjs)
// ---------------------------------------------------------------------------
const JOBS = [
  { title: 'Dog walking — twice this week', cat: 'Pet care', icon: 'i-paw', hood: 'East Flatbush', pay: '$75', when: 'Tue, Sep 23', bids: 'No bids', age: '2h ago', ice: true },
  { title: 'Mount a 55-inch TV in the living room', cat: 'TV mounting', icon: 'i-tv', hood: 'Bed-Stuy', pay: '$90–120', when: 'Sat, Sep 27', bids: '2 bids', age: '6h ago' },
  { title: 'Help moving boxes into a third-floor walk-up', cat: 'Moving', icon: 'i-cube', hood: 'Crown Heights', pay: '$140–180', when: 'Sun, Sep 28', bids: '5 bids', age: '1d ago' },
  { title: 'Paint one bedroom, walls only', cat: 'Painting', icon: 'i-brush', hood: 'Prospect Heights', pay: '$200–260', when: 'Wed, Oct 1', bids: '1 bid', age: '3d ago' },
];
const DETAIL = { title: 'Assemble a three-seat sofa and an armchair', cat: 'Assembly', hood: 'Flatbush, Brooklyn', pay: '$120', when: 'Sat, Sep 27', slot: 'Morning · 9 to 12', bids: '2 bids', age: 'Posted 2h ago',
  body: 'Both pieces are boxed in the living room. Tools on hand: an Allen key set and a drill. Please take the packaging with you if you can — the building has no big-item pickup this week.' };
const SERVICES = [['Assembly', 'i-wrench'], ['Moving', 'i-cube'], ['Cleaning', 'i-sparkles'], ['TV mounting', 'i-tv'], ['Plumbing', 'i-drop'], ['Yard work', 'i-leaf'], ['Painting', 'i-brush'], ['More', 'i-dots']];
const PROFILE_ROWS = [['Profile details', 'i-person'], ['Payment methods', 'i-card'], ['Notifications', 'i-bell'], ['Account and safety', 'i-shield'], ['Appearance', 'i-moon']];


const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><path d="m20 20-4.2-4.2"/></symbol>
<symbol id="i-mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21M9 21h6"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/></symbol>
<symbol id="i-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/></symbol>
<symbol id="i-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c-5 0-9 3.4-9 7.6 0 2.4 1.3 4.5 3.4 5.9L5.5 20.5l4-1.7c.8.2 1.6.3 2.5.3 5 0 9-3.4 9-7.6s-4-8-9-8z"/></symbol>
<symbol id="i-person" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.7-6-11a6 6 0 0 1 12 0c0 5.3-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></symbol>
<symbol id="i-map" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z"/><path d="M9 4v13M15 6.5v13"/></symbol>
<symbol id="i-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-sliders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.1" fill="currentColor"/><circle cx="15" cy="12" r="2.1" fill="currentColor"/><circle cx="8" cy="17" r="2.1" fill="currentColor"/></symbol>
<symbol id="i-sparkles" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></symbol>
<symbol id="i-tv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="13" rx="2"/><path d="M8 21h8"/></symbol>
<symbol id="i-cube" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></symbol>
<symbol id="i-wrench" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-7 7a2.1 2.1 0 0 1-3-3l7-7a6 6 0 0 1 7.9-7.9z"/></symbol>
<symbol id="i-drop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></symbol>
<symbol id="i-leaf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c0-9 6-15 16-16-1 10-7 16-16 16z"/><path d="M4 20c4-4 7-7 11-11"/></symbol>
<symbol id="i-brush" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3.5" width="14" height="6" rx="1.5"/><path d="M17 6.5h2.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H12v2"/><rect x="10" y="14.5" width="4" height="6" rx="1"/></symbol>
<symbol id="i-paw" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="9" r="2"/><circle cx="17" cy="9" r="2"/><circle cx="10" cy="5.5" r="2"/><circle cx="14" cy="5.5" r="2"/><path d="M12 11c-3 0-6 3-6 6 0 1.5 1 2.5 2.5 2.5 1.2 0 2-.6 3.5-.6s2.3.6 3.5.6c1.5 0 2.5-1 2.5-2.5 0-3-3-6-6-6z"/></symbol>
<symbol id="i-dots" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></symbol>
<symbol id="i-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/></symbol>
<symbol id="i-card" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18M7 14.5h4"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></symbol>
<symbol id="i-swap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13m0 0-3-3m3 3-3 3"/><path d="M20 17H7m0 0 3 3m-3-3 3-3"/></symbol>
<symbol id="i-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
<symbol id="i-star" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></symbol>
</defs></svg>`;
const ic = (id, cls = '') => `<svg class="${cls}"><use href="#${id}"/></svg>`;

// ---------------------------------------------------------------------------
// THE SYSTEM — README.md is the prose; these are the numbers
// ---------------------------------------------------------------------------
const SYSTEM_CSS = `
:root{--ink:#F3F1E8;--muted:#A9B8B1;--acc:#7EE2B4;--accInk:#062018;--gold:#E9C170;--r:22px;--glass:rgba(12,44,38,.52);--rim:rgba(200,255,230,.20);--spec:rgba(255,255,255,.16)}
.phone{background:linear-gradient(165deg,#062421 0%,#0A1A17 55%,#07110F 100%)}
.card{background:var(--glass);border:1px solid var(--rim);border-radius:var(--r);box-shadow:inset 0 1px 0 var(--spec),0 10px 30px rgba(0,0,0,.35);backdrop-filter:blur(18px)}
.card2{background:rgba(255,255,255,.06);border-radius:var(--r)}
.serif{font-family:Georgia,"Times New Roman",serif;letter-spacing:-.4px}
.field{height:54px;border-radius:27px;background:rgba(3,20,16,.55);border:1px solid rgba(200,255,230,.14);display:flex;align-items:center;gap:12px;padding:0 18px;color:var(--muted);font-size:16px}
.field svg{width:22px;height:22px;flex:0 0 auto;color:var(--acc)}
.cta{height:52px;border-radius:26px;background:linear-gradient(135deg,#8DF0C0,#4FC58C);color:var(--accInk);display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:800;box-shadow:0 10px 24px rgba(79,197,140,.30)}
.cta svg{width:20px;height:20px}
.eyebrow{font-size:11.5px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--gold)}
.h1{font-size:34px;line-height:38px;font-weight:700;color:var(--ink)}
.h2{font-size:24px;line-height:28px;font-weight:700;color:var(--ink)}
.tiles{display:flex;gap:12px}
.tile{flex:1;aspect-ratio:1;border-radius:18px;background:var(--glass);border:1px solid var(--rim);box-shadow:inset 0 1px 0 var(--spec);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--ink);font-size:12px;font-weight:600}
.tile svg{width:26px;height:26px;color:var(--acc)}
.money{color:var(--gold);font-weight:800}
.nav{position:absolute;left:0;right:0;bottom:0;height:84px;background:rgba(5,24,20,.72);border-top:1px solid rgba(200,255,230,.16);backdrop-filter:blur(24px);display:flex;align-items:flex-start;justify-content:space-around;padding:10px 6px 0}
.nav .it{width:64px;display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--muted);font-size:11px;font-weight:600}
.nav .it svg{width:26px;height:26px}
.nav .it.on{color:var(--acc)}
.nav .it.on .glow{width:46px;height:30px;border-radius:15px;background:rgba(126,226,180,.16);display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(126,226,180,.35)}
.nav .it .glow{width:46px;height:30px;display:flex;align-items:center;justify-content:center}
.chip{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:13px;background:rgba(126,226,180,.14);color:var(--acc);font-size:12px;font-weight:700}
.jobrow{display:flex;gap:14px;padding:14px}
.thumb{width:96px;height:96px;border-radius:16px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;color:var(--acc);flex:0 0 auto;overflow:hidden}
.thumb svg{width:34px;height:34px}
.thumb img{width:100%;height:100%;object-fit:cover}
.seg{display:flex;gap:8px}
.seg .p{height:36px;padding:0 14px;border-radius:18px;display:flex;align-items:center;font-size:14px;font-weight:600;color:var(--ink);background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.12)}
.seg .p.on{background:var(--acc);color:var(--accInk);border-color:transparent}
.circle{width:40px;height:40px;border-radius:20px;background:rgba(5,24,20,.6);border:1px solid rgba(200,255,230,.18);display:flex;align-items:center;justify-content:center;color:#fff;backdrop-filter:blur(10px)}
.circle svg{width:20px;height:20px}
.fact .k{font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
.fact .v{margin-top:4px;font-size:16px;font-weight:700;color:var(--ink)}
.sticky{position:absolute;left:0;right:0;bottom:0;padding:14px 20px 34px;background:rgba(5,24,20,.72);border-top:1px solid rgba(200,255,230,.16);backdrop-filter:blur(24px)}
.avatar{width:76px;height:76px;border-radius:38px;background:rgba(255,255,255,.06);border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:var(--ink)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hub{padding:16px;border-radius:18px;background:var(--glass);border:1px solid var(--rim);box-shadow:inset 0 1px 0 var(--spec)}
.hub svg{width:24px;height:24px;color:var(--acc)}
.hub .lbl{margin-top:14px;font-size:15px;font-weight:600;color:var(--ink)}
.list .row{display:flex;align-items:center;gap:14px;padding:14px 16px}
.list .row + .row{border-top:1px solid rgba(200,255,230,.10)}
.list .row svg.lead{width:22px;height:22px;color:var(--acc)}
.list .row .lbl{flex:1;font-size:16px;color:var(--ink)}
.list .row svg.chev{width:18px;height:18px;color:var(--muted)}
.switch{width:52px;height:30px;border-radius:15px;background:rgba(255,255,255,.08);position:relative;border:1px solid rgba(200,255,230,.14)}
.switch i{position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:11px;background:var(--muted)}
.art{position:absolute;right:-26px;top:104px;width:184px;height:162px;object-fit:cover;-webkit-mask-image:radial-gradient(ellipse 80% 86% at 60% 48%,#000 45%,transparent 100%);mask-image:radial-gradient(ellipse 80% 86% at 60% 48%,#000 45%,transparent 100%)}
`;

const base = `
  html,body{margin:0;background:#0d0d0d;font-family:-apple-system,"SF Pro Text","SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .stage{display:flex;flex-wrap:wrap;gap:28px;justify-content:center;padding:28px 16px}
  .slot{display:flex;flex-direction:column;align-items:center;gap:10px}
  .slot-label{font-size:13px;font-weight:600;color:#9aa39e}
  .phone{position:relative;width:393px;height:852px;overflow:hidden;border-radius:44px;color:var(--ink);box-shadow:0 0 0 1px rgba(255,255,255,.08)}
  .status{position:absolute;left:0;right:0;top:0;height:54px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 28px 8px 34px;color:var(--ink);font-weight:600;font-size:17px}
  .status .r{display:flex;gap:6px;align-items:center;font-size:12px}
  .status .r i{display:inline-block;width:22px;height:11px;border:1.5px solid currentColor;border-radius:3px}
  .body{position:absolute;left:20px;right:20px;top:64px;display:flex;flex-direction:column;gap:24px}
  .bleed{position:absolute;left:0;right:0;top:0}
  .home-bar{position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:rgba(255,255,255,.9)}
  .muted{color:var(--muted)}
  .stack{display:flex;flex-direction:column;gap:6px}
  .between{display:flex;align-items:center;justify-content:space-between}
  .meta{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px}
  .meta svg{width:15px;height:15px}
  .title{font-size:17px;font-weight:700;color:var(--ink);line-height:22px}
  .lines2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .link{font-size:15px;font-weight:700;color:var(--acc)}
  p{margin:0}
`;

// ---------------------------------------------------------------------------
// PRIMITIVES
// ---------------------------------------------------------------------------
const status = () => `<div class="status"><span>9:41</span><span class="r">●●● <i></i></span></div>`;
/** The glass nav bar: five slots, the centre one the mint [+] tile, the active tab glowing. */
const nav = (active) => {
  const items = [['i-home', 'Home'], ['i-search', 'Discover'], ['i-plus', ''], ['i-chat', 'Inbox'], ['i-person', 'Profile']];
  return `<div class="nav">${items.map(([i, l]) => l === '' ? `<div class="it"><div class="glow" style="background:var(--acc);color:var(--accInk);width:52px;height:36px;border-radius:18px">${ic(i)}</div></div>` : `<div class="it${l === active ? ' on' : ''}"><div class="glow">${ic(i)}</div><span>${l}</span></div>`).join('')}</div><div class="home-bar"></div>`;
};
/** The worker tree's bar: Home · Map · My Jobs · Inbox · Profile, no centre tile. */
const workerNav = (active) => {
  const items = [['i-home', 'Home'], ['i-map', 'Map'], ['i-briefcase', 'My Jobs'], ['i-chat', 'Inbox'], ['i-person', 'Profile']];
  return `<div class="nav">${items.map(([i, l]) => `<div class="it${l === active ? ' on' : ''}"><div class="glow">${ic(i)}</div><span>${l}</span></div>`).join('')}</div><div class="home-bar"></div>`;
};

// ---------------------------------------------------------------------------
// THE SCREENS — each returns the phone's inner markup (after the status bar)
// ---------------------------------------------------------------------------
const home = () => `
  <img class="art" src="${photoSrc()}" alt="">
  <div class="body" style="gap:16px">
    <div class="stack"><span class="muted" style="font-size:17px">Good evening,</span><span style="font-size:17px;color:var(--gold);font-weight:600">Mahmudur</span></div>
    <div class="stack" style="gap:8px"><div class="h1 serif" style="max-width:220px">Take a task<br>off your plate</div><span class="muted" style="font-size:14px">Describe it. Hire help. Get it handled.</span></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:14px"><div class="h2">What do you need done?</div>
      <div class="field">${ic('i-search')}<span style="flex:1">Describe your task…</span>${ic('i-mic')}</div>
      <div class="cta">Post a job ${ic('i-arrow')}</div></div>
    <div class="stack" style="gap:12px"><span class="eyebrow">Popular services</span>
      <div class="tiles">${SERVICES.slice(0, 4).map(([l, i]) => `<div class="tile">${ic(i)}<span>${l}</span></div>`).join('')}</div></div>
    <div class="stack" style="gap:12px"><div class="between"><span class="eyebrow">Your jobs</span><span class="link">View all</span></div>
      <div class="card" style="padding:14px 16px;display:flex;gap:14px;align-items:center"><div class="thumb" style="width:48px;height:48px;border-radius:24px">${ic('i-briefcase')}</div><div><div class="title">You haven't posted any jobs yet</div><span class="muted" style="font-size:13px">Your requests will appear here.</span></div></div></div>
  </div>${nav('Home')}`;

const homeC = () => `
  <div class="body" style="gap:22px">
    <div class="stack"><div class="h1 serif">Hi Mahmudur</div><span class="muted" style="font-size:16px">What needs doing today?</span></div>
    <div class="field">${ic('i-search')}<span style="flex:1">Search or describe a task</span>${ic('i-mic')}</div>
    <div class="grid4">${SERVICES.map(([l, i]) => `<div class="sq">${ic(i)}<span>${l}</span></div>`).join('')}</div>
    <div class="card" style="padding:20px;display:flex;flex-direction:column;gap:14px"><div class="between"><span class="h2">Your jobs</span><span class="link">See all</span></div>
      <p class="muted" style="font-size:14px;line-height:19px">Nothing yet. Post your first job and the bids land here.</p>
      <div class="cta">Post a job ${ic('i-arrow')}</div></div>
  </div>${nav('C', 'Home')}`;

const whomeA = () => `
  <div class="body">
    <div class="stack"><span class="muted" style="font-size:15px">Good evening, Mahmudur</span><div class="h1 serif">Get hired.<br><span style="color:var(--acc)">Get paid.</span></div></div>
    <div class="card row" style="justify-content:space-between"><div class="stack" style="gap:2px"><span class="title">Offline</span><span class="muted" style="font-size:13px">Not visible to customers</span></div><div class="switch"><i></i></div></div>
    <div class="field">${ic('i-search')}<span style="flex:1">Find jobs</span>${ic('i-sliders')}</div>
    <div class="stack" style="gap:10px"><div class="between"><span class="eyebrow">Near you</span><span class="link">All open jobs</span></div>
      ${JOBS.slice(0, 2).map((j) => `<div class="jobrow"><div class="stack" style="flex:1;gap:4px"><span class="money" style="font-size:22px">${j.pay}</span><span class="title lines2">${j.title}</span><span class="meta">${j.hood} · ${j.when} · ${j.bids}</span></div>${ic('i-chev', 'chev')}</div>`).join('')}</div>
  </div>${nav('A', 'Home')}`;

const whome = () => `
  <img class="art" src="${toolboxSrc()}" alt="" style="right:-10px;top:88px;width:170px;height:150px;object-fit:contain">
  <div class="body">
    <div class="stack"><span class="muted" style="font-size:17px">Good evening,</span><span style="font-size:17px;color:var(--gold);font-weight:600">Mahmudur</span></div>
    <div class="stack" style="gap:8px"><div class="h1 serif" style="max-width:200px">Get hired.<br><span style="color:var(--acc)">Get paid.</span></div><span class="muted" style="font-size:14px">Grow your reputation.</span></div>
    <div class="card" style="padding:16px 18px;display:flex;align-items:center;justify-content:space-between"><div class="stack" style="gap:2px"><span class="title">Offline</span><span class="muted" style="font-size:13px">Not visible to customers</span></div><div class="switch"><i></i></div></div>
    <div class="field">${ic('i-search')}<span style="flex:1">Find jobs near you</span>${ic('i-sliders')}</div>
    <div class="stack" style="gap:10px"><div class="between"><span class="eyebrow">Jobs near you</span><span class="link">View all</span></div>
      ${JOBS.slice(0, 2).map((j) => `<div class="card jobrow" style="align-items:center"><div class="thumb" style="width:64px;height:64px">${ic(j.icon)}</div><div class="stack" style="flex:1;gap:4px"><span class="title lines2">${j.title}</span><span class="meta">${ic('i-pin')}${j.hood} · ${j.when}</span></div><span class="money" style="font-size:20px">${j.pay}</span></div>`).join('')}</div>
  </div>${nav('Home')}`;

const whomeC = () => `
  <div class="body" style="gap:20px">
    <div class="stack"><div class="h1 serif">Hi Mahmudur</div><span class="muted" style="font-size:16px">Ready to pick up work?</span></div>
    <div class="card" style="padding:18px 20px;display:flex;align-items:center;justify-content:space-between"><div class="stack" style="gap:2px"><span class="title">You're offline</span><span class="muted" style="font-size:13px">Customers can't see you</span></div><div class="cta" style="height:40px;padding:0 16px;font-size:14px;border-radius:20px;box-shadow:none">Go online</div></div>
    <div class="field">${ic('i-search')}<span style="flex:1">Search jobs</span>${ic('i-sliders')}</div>
    <div class="stack" style="gap:12px"><div class="between"><span class="h2">Jobs near you</span><span class="link">See all</span></div>
      <div style="display:flex;gap:12px;overflow:hidden">${JOBS.slice(0, 2).map((j, i) => `<div class="tall" style="flex:0 0 236px"><div class="pic">${i === 0 ? ic(j.icon) : `<img src="${photoSrc()}">`}</div><div style="padding:14px;display:flex;flex-direction:column;gap:6px"><span class="title lines2">${j.title}</span><div class="between"><span class="money" style="font-size:20px">${j.pay}</span><span class="meta">${j.hood}</span></div></div></div>`).join('')}</div></div>
  </div>${nav('C', 'Home')}`;

const jobsA = () => `
  <div class="body" style="gap:18px">
    <div class="between"><div class="stack"><span class="eyebrow">Brooklyn · any distance</span><div class="h2 serif" style="font-size:32px;line-height:36px">Available jobs</div></div><div class="circle" style="background:var(--s1)">${ic('i-sliders')}</div></div>
    <div class="seg"><div class="p on">Any</div><div class="p">2 mi</div><div class="p">5 mi</div><div class="p">10 mi</div><div class="p">25 mi</div></div>
    ${JOBS.map((j, i) => `<div class="jobrow"><div class="thumb">${i === 2 ? `<img src="${photoSrc()}">` : ic(j.icon)}</div><div class="stack" style="flex:1;gap:5px"><div class="between"><span class="money" style="font-size:22px">${j.pay}</span>${j.ice ? `<span class="tag">${ic('i-sparkles')}Break the ice</span>` : `<span class="meta">${j.bids}</span>`}</div><span class="title lines2">${j.title}</span><span class="meta">${j.hood} · ${j.when} · ${j.age}</span></div></div>`).join('')}
  </div>${nav('A', 'Home')}`;

const jobs = () => `
  <div class="body" style="gap:18px">
    <div class="between"><div class="stack"><span class="eyebrow">Near you</span><div class="h2 serif" style="font-size:30px;line-height:34px">Available jobs</div></div><div class="circle">${ic('i-sliders')}</div></div>
    <div class="seg"><div class="p on">Any</div><div class="p">2 mi</div><div class="p">5 mi</div><div class="p">10 mi</div><div class="p">25 mi</div></div>
    ${JOBS.slice(0, 3).map((j, i) => `<div class="card jobrow"><div class="thumb">${i === 2 ? `<img src="${photoSrc()}">` : ic(j.icon)}</div><div class="stack" style="flex:1;gap:6px;min-width:0"><div class="between" style="align-items:flex-start"><span class="chip">${j.cat}</span><div class="stack" style="gap:0;align-items:flex-end"><span class="eyebrow" style="font-size:9.5px">Est. pay</span><span class="money" style="font-size:22px;line-height:24px">${j.pay}</span></div></div><span class="title lines2">${j.title}</span><span class="meta">${ic('i-pin')}${j.hood} · ${j.when} · ${j.bids}</span></div></div>`).join('')}
  </div>${nav('Home')}`;

const jobsC = () => `
  <div class="body" style="gap:16px">
    <div class="between"><div class="stack"><div class="h2 serif" style="font-size:28px;line-height:32px">Jobs near you</div><span class="muted" style="font-size:14px">4 open · Brooklyn</span></div><div class="chip" style="height:40px;border-radius:20px;padding:0 14px;font-size:14px">${ic('i-sliders')}Filters</div></div>
    <div class="seg"><div class="p on">Any</div><div class="p">2 mi</div><div class="p">5 mi</div><div class="p">10 mi</div></div>
    ${JOBS.slice(0, 3).map((j, i) => `<div class="tall"><div style="display:flex"><div class="pic" style="width:118px;height:118px;flex:0 0 auto">${i === 1 ? `<img src="${photoSrc()}">` : ic(j.icon)}</div><div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px;flex:1;min-width:0"><span class="title lines2">${j.title}</span><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip">${ic('i-calendar')}${j.when}</span>${j.ice ? `<span class="chip sage">${ic('i-sparkles')}Be first</span>` : `<span class="chip">${j.bids}</span>`}</div><div class="between"><span class="money" style="font-size:22px">${j.pay}</span><span class="meta">${ic('i-pin')}${j.hood}</span></div></div></div></div>`).join('')}
  </div>${nav('C', 'Home')}`;

const detailA = () => `
  <div class="bleed"><img src="${photoSrc()}" style="width:393px;height:320px;object-fit:cover;display:block"><div style="position:absolute;left:0;right:0;top:0;height:320px;background:linear-gradient(180deg,rgba(10,11,10,.15),rgba(10,11,10,0) 40%,rgba(10,11,10,1) 100%)"></div></div>
  <div style="position:absolute;left:20px;right:20px;top:62px;display:flex;justify-content:space-between"><div class="circle">${ic('i-back')}</div><div class="circle">${ic('i-share')}</div></div>
  <div class="body" style="top:262px;gap:20px">
    <div class="stack" style="gap:10px"><span class="tag">${ic('i-wrench')}${DETAIL.cat}</span><div class="h1 serif" style="font-size:32px;line-height:36px">${DETAIL.title}</div><span class="meta">${DETAIL.age} · ${DETAIL.bids}</span></div>
    <div class="facts"><div class="fact"><div class="k">Pay</div><div class="v money">${DETAIL.pay}</div></div><div class="fact"><div class="k">When</div><div class="v">${DETAIL.when}</div></div><div class="fact"><div class="k">Where</div><div class="v">Flatbush</div></div></div>
    <div class="stack" style="gap:8px"><span class="eyebrow">The job</span><p style="font-size:15px;line-height:22px;color:var(--ink)">${DETAIL.body}</p></div>
  </div>
  <div class="sticky"><div class="cta">Send a bid ${ic('i-arrow')}</div></div>`;

const detail = () => `
  <div class="bleed"><img src="${photoSrc()}" style="width:393px;height:340px;object-fit:cover;display:block"><div style="position:absolute;left:0;right:0;top:0;height:340px;background:linear-gradient(180deg,rgba(6,36,33,.2),rgba(6,36,33,0) 40%,rgba(8,26,23,.9) 100%)"></div></div>
  <div style="position:absolute;left:20px;right:20px;top:62px;display:flex;justify-content:space-between"><div class="circle">${ic('i-back')}</div><div class="circle">${ic('i-share')}</div></div>
  <div class="body" style="top:250px;gap:16px">
    <div class="card" style="padding:16px 18px;display:flex;gap:12px;align-items:center"><div class="stack" style="flex:1;gap:2px"><span class="eyebrow">Est. pay</span><span class="money" style="font-size:30px;line-height:32px">${DETAIL.pay}</span></div><div class="stack" style="gap:8px;align-items:flex-end"><span class="meta">${ic('i-calendar')}${DETAIL.when}</span><span class="meta">${ic('i-clock')}${DETAIL.slot}</span><span class="meta">${ic('i-pin')}${DETAIL.hood}</span></div></div>
    <div class="stack" style="gap:8px"><span class="chip">${DETAIL.cat}</span><div class="h2 serif" style="font-size:26px;line-height:30px">${DETAIL.title}</div><span class="meta">${DETAIL.age} · ${DETAIL.bids}</span></div>
    <div class="card" style="padding:16px 18px"><span class="eyebrow">About the job</span><p style="margin-top:8px;font-size:15px;line-height:22px;color:var(--ink)">${DETAIL.body}</p></div>
  </div>
  <div class="sticky"><div class="cta">Send a bid ${ic('i-arrow')}</div></div>`;

const detailC = () => `
  <div style="position:absolute;left:16px;right:16px;top:60px;height:250px;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,.4)"><img src="${photoSrc()}" style="width:100%;height:100%;object-fit:cover;display:block"><div style="position:absolute;left:12px;top:12px" class="circle">${ic('i-back')}</div><div style="position:absolute;right:12px;top:12px" class="circle">${ic('i-share')}</div></div>
  <div class="body" style="top:330px;gap:18px">
    <div class="stack" style="gap:8px"><div class="h2 serif" style="font-size:26px;line-height:30px">${DETAIL.title}</div><span class="muted" style="font-size:14px">${DETAIL.age} · ${DETAIL.bids}</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="chip" style="background:rgba(240,169,78,.16);color:var(--acc)">${ic('i-wrench')}${DETAIL.cat}</span><span class="chip">${ic('i-calendar')}${DETAIL.when}</span><span class="chip">${ic('i-clock')}Morning</span><span class="chip">${ic('i-pin')}Flatbush</span></div>
    <div class="card" style="padding:18px"><span class="eyebrow">Details</span><p style="margin-top:8px;font-size:15px;line-height:22px;color:var(--ink)">${DETAIL.body}</p></div>
  </div>
  <div class="sticky"><div class="cta">Send a bid · ${DETAIL.pay} ${ic('i-arrow')}</div></div>`;

const profileA = () => `
  <div class="body" style="gap:22px;align-items:stretch">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:6px"><div class="avatar">MR</div><div class="h2 serif" style="font-size:28px">Mahmudur Rahman</div><span class="muted" style="font-size:14px">Customer · Brooklyn · No reviews yet</span><div class="pill-outline">${ic('i-swap')}Switch to Worker</div></div>
    <div class="card list">${PROFILE_ROWS.slice(0, 3).map(([l, i]) => `<div class="row">${ic(i, 'lead')}<span class="lbl">${l}</span>${ic('i-chev', 'chev')}</div>`).join('')}</div>
    <div class="card list">${PROFILE_ROWS.slice(3).map(([l, i]) => `<div class="row">${ic(i, 'lead')}<span class="lbl">${l}</span>${ic('i-chev', 'chev')}</div>`).join('')}</div>
    <div style="text-align:center" class="muted">Log out</div>
  </div>${nav('A', 'Profile')}`;

const profile = () => `
  <div class="body" style="gap:18px">
    <div class="card" style="padding:20px;display:flex;gap:16px;align-items:center"><div class="avatar">MR</div><div class="stack" style="gap:4px;flex:1"><div class="h2 serif">Mahmudur Rahman</div><span class="muted" style="font-size:13px">Customer · Brooklyn</span><span class="meta">${ic('i-star')}No reviews yet</span></div></div>
    <div class="grid2">${PROFILE_ROWS.slice(0, 4).map(([l, i]) => `<div class="hub">${ic(i)}<div class="lbl">${l}</div></div>`).join('')}</div>
    <div class="card list"><div class="row">${ic('i-moon', 'lead')}<span class="lbl">Appearance</span>${ic('i-chev', 'chev')}</div><div class="row">${ic('i-swap', 'lead')}<span class="lbl">Switch to Worker</span>${ic('i-chev', 'chev')}</div></div>
    <div style="text-align:center" class="muted">Log out</div>
  </div>${nav('Profile')}`;

const profileC = () => `
  <div class="body" style="gap:20px">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px"><div class="avatar">MR</div><div class="h2 serif" style="font-size:26px">Mahmudur Rahman</div><span class="muted" style="font-size:14px">Brooklyn · No reviews yet</span></div>
    <div class="segment"><div class="o on">Customer</div><div class="o">Worker</div></div>
    <div class="card list" style="padding:6px 0">${PROFILE_ROWS.map(([l, i]) => `<div class="row"><div class="lead">${ic(i)}</div><span class="lbl">${l}</span>${ic('i-chev', 'chev')}</div>`).join('')}</div>
    <div style="text-align:center" class="muted">Log out</div>
  </div>${nav('C', 'Profile')}`;

const SCREENS = {
  home: { label: 'Customer Home', render: home },
  whome: { label: 'Worker Home', render: whome },
  jobs: { label: 'Available Jobs', render: jobs },
  detail: { label: 'Job detail (worker)', render: detail },
  profile: { label: 'Profile', render: profile },
};

// ---------------------------------------------------------------------------
// THE PAGES
// ---------------------------------------------------------------------------
const wanted = process.argv[2] ? process.argv[2].split(',') : Object.keys(SCREENS);
for (const key of wanted) {
  const s = SCREENS[key];
  if (!s) throw new Error(`no screen "${key}" — see SCREENS.md`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BRAZOS — Emerald Lux Glass — ${s.label}</title>
<!-- Generated by docs/mockups/html/lux/lux.build.mjs. The system is README.md beside it. -->
<style>${base}${SYSTEM_CSS}</style></head><body>${sprite}<div class="stage"><div class="slot"><div class="slot-label">Emerald Lux Glass — ${s.label}</div><div class="phone" data-shot="lux-${key}">${status()}${s.render()}</div></div></div></body></html>`;
  const file = join(here, `lux-${key}.html`);
  writeFileSync(file, html);
  console.log(`wrote lux-${key}.html (${Math.round(html.length / 1024)} KB)`);
}
