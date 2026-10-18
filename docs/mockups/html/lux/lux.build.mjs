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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
/** A brand PNG (assets/brand/) resampled to its slot at 2x through the repository's own codec, read once. */
const brandCache = new Map();
const brandSrc = (name, w, h) => {
  const key = `${name}:${w}x${h}`;
  if (!brandCache.has(key)) {
    const img = decode(join(root, 'assets', 'brand', name));
    const small = resample(img, w, h);
    brandCache.set(key, `data:image/png;base64,${encodePng({ width: small.width, height: small.height, pixels: small.pixels, bpp: small.bpp }).toString('base64')}`);
  }
  return brandCache.get(key);
};
const toolboxSrc = () => {
  if (!toolboxUri) {
    const img = decode(join(root, 'assets', 'prestige', 'hero_toolbox_worker.png'));
    const small = resample(img, 340, 226);
    toolboxUri = `data:image/png;base64,${encodePng({ width: small.width, height: small.height, pixels: small.pixels, bpp: small.bpp }).toString('base64')}`;
  }
  return toolboxUri;
};

// The map's tiles, exactly as the approved map mockup carries them
// (docs/mockups/html/map-explore.build.mjs): Esri's dark canvas over Flatbush
// at zoom 14, cached once under .shots/map-tiles/ and inlined. The app draws
// Apple's tiles, which cannot be embedded; this is the honest stand-in the
// operator already approved for the worker map.
const MAP = { center: { lat: 40.664, lng: -73.950 }, zoom: 14, tileCss: 256 * 0.78, midY: 400 };
const tileXY = (lat, lng, z) => {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n };
};
async function tileDataUri(z, x, y) {
  const dir = join(root, '.shots', 'map-tiles', 'esri-dark-base');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${z}-${x}-${y}.bin`);
  if (!existsSync(file)) {
    const res = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`, { headers: { 'User-Agent': 'brazos-mockup/1 (design mockup, ~20 tiles)' } });
    if (!res.ok) throw new Error(`tile ${z}/${x}/${y}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  return `data:${bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'};base64,${bytes.toString('base64')}`;
}
/** The tile grid covering the phone, the centre landing at MAP.midY; returns the tiles' CSS and divs. */
async function mapLayer() {
  const c = tileXY(MAP.center.lat, MAP.center.lng, MAP.zoom);
  const css = [], html = [];
  let i = 0;
  for (let ty = Math.floor(c.y) - 2; ty <= Math.floor(c.y) + 3; ty++) {
    for (let tx = Math.floor(c.x) - 2; tx <= Math.floor(c.x) + 2; tx++) {
      const left = 393 / 2 + (tx - c.x) * MAP.tileCss;
      const top = MAP.midY + (ty - c.y) * MAP.tileCss;
      if (left + MAP.tileCss < -1 || top + MAP.tileCss < -1 || left > 394 || top > 853) continue;
      css.push(`.t${i}{background-image:url("${await tileDataUri(MAP.zoom, tx, ty)}")}`);
      html.push(`<div class="tile t${i}" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px"></div>`);
      i++;
    }
  }
  return { css: css.join('\n'), html: html.join('') };
}
/** A cell's centre on the phone, from its coordinates. */
const mapPoint = (lat, lng) => {
  const c = tileXY(MAP.center.lat, MAP.center.lng, MAP.zoom);
  const p = tileXY(lat, lng, MAP.zoom);
  return { x: 393 / 2 + (p.x - c.x) * MAP.tileCss, y: MAP.midY + (p.y - c.y) * MAP.tileCss };
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
// Find help's ten service tiles — lib/skillCategories.ts SKILL_CATEGORIES, in order.
const SKILLS = [['Furniture Assembly', 'i-wrench'], ['Moving Help', 'i-cube'], ['House Cleaning', 'i-sparkles'], ['Handyman/Repairs', 'i-hammer'], ['Yard Work/Landscaping', 'i-leaf'], ['Dog Walking/Pet Care', 'i-paw'], ['Errands/Delivery', 'i-bag'], ['TV/Furniture Mounting', 'i-tv'], ['Painting', 'i-brush'], ['Packing/Unpacking', 'i-archive']];
// Home's "Other services" sheet — lib/skillCategories.ts MORE_SERVICES, in order.
const MORE = [['Handyman & General Repairs', 'i-hammer'], ['Electrical (light fixtures, outlets)', 'i-flash'], ['Interior Painting', 'i-brush'], ['Appliance Installation', 'i-wrench'], ['Junk Removal', 'i-trash'], ['Picture & Shelf Hanging', 'i-image'], ['Pressure Washing', 'i-drop'], ['Gutter Cleaning', 'i-rain'], ['Carpet & Upholstery Cleaning', 'i-bed'], ['Window Washing', 'i-window'], ['Pest Control', 'i-bug'], ['Home Organization', 'i-tray'], ['Landscaping & Gardening', 'i-flower'], ['Snow Removal', 'i-snow'], ['Pet Sitting & Dog Walking', 'i-paw'], ['Personal Assistant / Errands', 'i-bag'], ['Packing & Unpacking', 'i-archive'], ['Drywall Repair', 'i-square']];
// The posting wizard's category pills — lib/jobs.ts JOB_CATEGORIES with JOB_CATEGORY_LABELS / _ICONS, in order.
const POSTABLE = [['Dog walking', 'i-paw'], ['Cleaning', 'i-sparkles'], ['Moving', 'i-cube'], ['Yard work', 'i-leaf'], ['Handyman', 'i-hammer'], ['Errands', 'i-bag'], ['Furniture Assembly', 'i-wrench'], ['TV/Furniture Mounting', 'i-tv'], ['Painting', 'i-brush'], ['Packing/Unpacking', 'i-archive'], ['Other', 'i-dots']];
// The wizard's arrival windows (screens/PostJobScreen.tsx ARRIVAL_WINDOWS) and the
// day row as the app computes it from today, 2026-09-21.
const WINDOWS = ['Morning · 8–11 AM', 'Midday · 11 AM–2 PM', 'Afternoon · 2–5 PM', 'Evening · 5–8 PM'];
const DAYS = ['Flexible', 'Today', 'Tomorrow', 'Wed, Sep 23', 'Thu, Sep 24', 'Fri, Sep 25', 'Sat, Sep 26', 'Sun, Sep 27', 'Mon, Sep 28'];
// The sample detail job as the wizard writes it: the day the poster picked and the
// arrival window, in the shape lib/jobs.ts arrivalWindowLabel() renders.
const POST = { day: 'Sat, Sep 26', timing: 'Sat, Sep 26 · 8 AM–11 AM', pay: '$120', cat: 'Furniture Assembly' };
// The mockup's sample WORKER, for the one screen that is somebody else's profile.
// Invented as sparingly as the detail job: a name, a bio, the categories and the
// services they list — no rating, no reviews, no completed-job count and no photos,
// which is exactly what the app shows for a worker who has none ("New worker").
const WORKER = { name: 'Sam Okafor', first: 'Sam', initials: 'SO', bio: 'Flat-pack and wall-mounting work most evenings and weekends. I bring my own tools and clear the packaging away.',
  cats: ['Furniture Assembly', 'TV/Furniture Mounting', 'Handyman'], note: 'Evenings and weekends.',
  services: [{ title: 'Flat-pack furniture assembly', desc: 'Beds, wardrobes, desks and shelving, any brand.', price: '$60 flat' }, { title: 'TV mounting', desc: 'Bracket supplied on request; cables tidied.', price: '$45/hr' }] };
// Batch 2 — the sample job through its lifecycle: two bids on it (the sample
// worker's and a second sample bidder's, both "No reviews yet"), Sam's accepted
// and funded. The money figures are what the fee schedule quotes for $110 at
// the 7.5% customer fee the device walk paid (GATES Gate 1, $53.75 on $50).
const WORKER2 = { name: 'Priya Natarajan', first: 'Priya', initials: 'PN' };
const BIDS = [
  { w: WORKER, amount: '$110', pitch: 'I can do both pieces in one visit and take the boxes down with me — I have a van. Happy to start Saturday morning.', age: '2h ago' },
  { w: WORKER2, amount: '$120', pitch: 'Assembled dozens of these; I bring a second Allen set and a rubber mallet so nothing gets scratched.', age: '4h ago' },
];
const PAY = { agreed: '$110', fee: '$8.25', total: '$118.25', window: '47h' };


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
<symbol id="i-staro" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8z"/></symbol>
<symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></symbol>
<symbol id="i-images" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="14" height="12" rx="2.5"/><path d="M7.5 4.5H18a3 3 0 0 1 3 3V15"/><path d="m3 16 4-4 4 4 2-2 4 4"/><circle cx="12.5" cy="10.5" r="1.3" fill="currentColor"/></symbol>
<symbol id="i-image" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5" fill="currentColor"/></symbol>
<symbol id="i-eyeoff" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.3c.5-.1.9-.1 1.4-.1 5 0 9 3.8 10 6.8-.4 1.2-1.3 2.6-2.6 3.8M6.5 6.6C4.3 8 2.7 9.9 2 12c1 3 5 6.8 10 6.8 1.7 0 3.3-.4 4.7-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></symbol>
<symbol id="i-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/></symbol>
<symbol id="i-pencil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m13.5 8 3 3"/></symbol>
<symbol id="i-video" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="13" height="10" rx="2.5"/><path d="m16 11 5-3v8l-5-3z"/></symbol>
<symbol id="i-people" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M17.5 13.6a6.5 6.5 0 0 1 4 6.4"/></symbol>
<symbol id="i-bookmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/></symbol>
<symbol id="i-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3 10.5l7.5 2.5L13 20.5z"/><path d="m10.5 13 10.5-10"/></symbol>
<symbol id="i-hammer" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 17.5 12 9l3 3-8.5 8.5z"/><path d="m12 9 3-3 2-2 5 5-2 2-3 3"/></symbol>
<symbol id="i-flash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/></symbol>
<symbol id="i-rain" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15.5a4.5 4.5 0 0 1 .5-9 6 6 0 0 1 11.5 1.5 3.5 3.5 0 0 1-1 7"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></symbol>
<symbol id="i-bed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19V8.5"/><path d="M3 15h18v4"/><path d="M3 11h9v4"/><path d="M12 12h6a3 3 0 0 1 3 3"/></symbol>
<symbol id="i-window" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 9v11"/></symbol>
<symbol id="i-bug" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0z"/><path d="M12 9v11M4 12h4M16 12h4M5 7l3 2M19 7l-3 2M5 18l3-2M19 18l-3-2"/></symbol>
<symbol id="i-tray" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5.5h14M5 10h14"/><path d="M3.5 15h5l1.5 2h4l1.5-2h5v5h-17z"/></symbol>
<symbol id="i-flower" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="9.5" r="2.3"/><circle cx="12" cy="4" r="1.7"/><circle cx="12" cy="15" r="1.7"/><circle cx="6.5" cy="9.5" r="1.7"/><circle cx="17.5" cy="9.5" r="1.7"/><path d="M12 16.7V21M9 21h6"/></symbol>
<symbol id="i-snow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.8 2.5 1.7 2.5-1.7M9.5 19.2l2.5-1.7 2.5 1.7"/></symbol>
<symbol id="i-square" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="4" width="16" height="16" rx="2.5"/></symbol>
<symbol id="i-bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></symbol>
<symbol id="i-archive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9"/><path d="M10 13h4"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></symbol>
<symbol id="i-checkcircle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></symbol>
<symbol id="i-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16.5v.5"/></symbol>
</defs></svg>`;
const ic = (id, cls = '') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
/** A glyph sized and coloured inline, for the places no primitive sizes it. */
const icS = (id, size, color) => `<svg style="width:${size}px;height:${size}px;color:${color};flex:0 0 auto"><use href="#${id}"/></svg>`;
/** The armchair photo as a fill, so a page with several frames carries its bytes ONCE (the page adds the class's url). */
const photo = () => '<div class="pimg"></div>';

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
.pimg{width:100%;height:100%;background-size:cover;background-position:center}
.seg{display:flex;gap:8px}
.seg .p{height:36px;padding:0 14px;border-radius:18px;display:flex;align-items:center;font-size:14px;font-weight:600;color:var(--ink);background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.12)}
.seg .p.on{background:var(--acc);color:var(--accInk);border-color:transparent}
.circle{width:40px;height:40px;border-radius:20px;background:rgba(5,24,20,.6);border:1px solid rgba(200,255,230,.18);display:flex;align-items:center;justify-content:center;color:#fff;backdrop-filter:blur(10px)}
.circle svg{width:20px;height:20px}
.fact .k{font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
.fact .v{margin-top:4px;font-size:16px;font-weight:700;color:var(--ink)}
.fact.s .v{font-size:15px;font-weight:600;line-height:20px}
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
/* --- batch 1 additions: pushed-screen chrome, the wizard, forms, sheets --- */
.hdr{display:flex;align-items:center;gap:14px;min-height:40px}
.hdr .t{font-size:26px;line-height:30px;font-weight:700;color:var(--ink)}
.wiz{display:flex;align-items:center;justify-content:space-between;height:40px}
.wiz .lnk{display:flex;align-items:center;gap:1px;color:var(--acc);font-size:15px;font-weight:700;width:104px;white-space:nowrap}
.wiz .lnk.right{justify-content:flex-end}
.wiz .lnk svg{width:18px;height:18px;flex:0 0 auto}
.wiz .wizt{font-size:17px;font-weight:700;color:var(--ink)}
.steps{display:flex;gap:8px}
.st{flex:1;display:flex;flex-direction:column;gap:7px}
.st i{display:block;height:4px;border-radius:2px;background:rgba(255,255,255,.12)}
.st.done i{background:var(--acc)}
.st span{font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.2px}
.st.on span{color:var(--ink)}
.fld{display:flex;flex-direction:column;gap:8px;min-width:0}
.fld .lbl,.lbl{font-size:13px;font-weight:700;color:var(--ink);letter-spacing:.2px}
.fld .hint{font-size:12px;color:var(--muted)}
.in{min-height:50px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.10);padding:13px 16px;font-size:16px;line-height:22px;color:var(--ink);display:flex;align-items:center;gap:10px;box-sizing:border-box}
.in.multi{align-items:flex-start;min-height:96px;font-size:15px;line-height:21px}
.in.ph{color:var(--muted)}
.in:not(.multi) span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cap{font-size:13px;line-height:18px;color:var(--muted)}
.wrap{display:flex;flex-wrap:wrap;gap:8px}
.hrow{display:flex;gap:10px;overflow:hidden}
.chip.f{height:32px;border-radius:16px;padding:0 11px;gap:5px;font-size:12.5px;box-sizing:border-box;background:rgba(255,255,255,.06);color:var(--ink);border:1px solid rgba(200,255,230,.12);white-space:nowrap;flex:0 0 auto}
.chip.f svg{width:15px;height:15px;color:var(--acc)}
.chip.f.on{background:var(--acc);color:var(--accInk);border-color:transparent}
.chip.f.on svg{color:var(--accInk)}
.chip.lim{height:26px;padding:0 10px;gap:5px;font-size:12px;color:var(--acc)}
.chip.lim svg{width:13px;height:13px}
.tile2{flex:0 0 100px;width:100px;min-width:0;height:96px;border-radius:18px;background:var(--glass);border:1px solid var(--rim);box-shadow:inset 0 1px 0 var(--spec);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:0 8px;box-sizing:border-box;text-align:center;font-size:12px;line-height:15px;font-weight:600;color:var(--ink)}
.tile2 svg{width:24px;height:24px;color:var(--acc)}
.disc{width:38px;height:38px;border-radius:19px;background:linear-gradient(135deg,#8DF0C0,#4FC58C);display:flex;align-items:center;justify-content:center;flex:0 0 auto;box-shadow:0 6px 16px rgba(79,197,140,.30)}
.disc svg,.field .disc svg{width:18px;height:18px;color:var(--accInk)}
.well{width:56px;height:56px;border-radius:28px;background:rgba(126,226,180,.12);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.well svg{width:26px;height:26px;color:var(--acc)}
.well.sm{width:36px;height:36px;border-radius:18px}
.well.sm svg{width:18px;height:18px}
.state{padding:24px 20px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.frow{display:flex;gap:12px;align-items:flex-start;min-width:0}
.frow .k{font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
.frow .v{margin-top:3px;font-size:15px;font-weight:600;color:var(--ink);line-height:20px}
.divider{height:1px;background:rgba(200,255,230,.10)}
.add{border-radius:16px;background:rgba(255,255,255,.06);border:1px dashed rgba(126,226,180,.45);display:flex;align-items:center;justify-content:center;color:var(--acc);box-sizing:border-box}
.add svg{width:26px;height:26px}
.btn2{height:52px;border-radius:26px;border:1px solid rgba(200,255,230,.22);background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:700;color:var(--acc)}
.seg2{display:flex;padding:4px;border-radius:26px;background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.12)}
.seg2 .o{flex:1;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--muted)}
.seg2 .o.on{background:var(--acc);color:var(--accInk)}
.scrim{position:absolute;inset:0;background:rgba(3,14,12,.62)}
.sheet{position:absolute;left:0;right:0;bottom:0;border-radius:22px 22px 0 0;background:rgba(9,36,31,.90);border:1px solid var(--rim);border-bottom:0;box-shadow:inset 0 1px 0 var(--spec),0 -12px 36px rgba(0,0,0,.45);backdrop-filter:blur(18px);padding:10px 20px 34px;display:flex;flex-direction:column}
.grab{width:40px;height:5px;border-radius:3px;background:rgba(255,255,255,.22);margin:0 auto 14px;flex:0 0 auto}
.dialog{position:absolute;left:24px;right:24px;top:50%;transform:translateY(-50%);padding:22px 20px;display:flex;flex-direction:column;gap:16px;background:rgba(9,36,31,.92)}
.clip{position:absolute;left:0;right:0;overflow:hidden}
.col{display:flex;flex-direction:column;padding:0 20px}
.mark{width:88px;height:88px;border-radius:44px;background:rgba(126,226,180,.14);border:1px solid rgba(126,226,180,.35);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 10px rgba(126,226,180,.06),0 0 40px rgba(126,226,180,.25)}
.mark svg{width:44px;height:44px;color:var(--acc)}
.nudge{position:absolute;left:20px;right:20px;bottom:96px;padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:14px;color:var(--ink)}
.nudge svg{width:18px;height:18px;color:var(--acc);flex:0 0 auto}
.nudge svg.x{color:var(--muted)}
.sticky.abovenav{bottom:84px;padding:12px 20px 12px}
.pricepill{height:56px;border-radius:28px;background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.10);display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 20px}
.pricepill .pen{width:40px;height:40px;border-radius:20px;background:rgba(126,226,180,.14);display:flex;align-items:center;justify-content:center;color:var(--acc)}
.pricepill .pen svg{width:18px;height:18px}
/* --- batch 2 additions: the hub card, offers, the timeline, key-value rows, the map --- */
.hdr .sub{font-size:13px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sect{font-size:17px;font-weight:700;color:var(--ink)}
.seg3{display:flex;padding:4px;border-radius:24px;background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.12)}
.seg3 .o{flex:1;height:36px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--muted)}
.seg3 .o.on{background:var(--acc);color:var(--accInk)}
.badge{min-width:22px;height:22px;padding:0 7px;border-radius:11px;background:rgba(126,226,180,.14);color:var(--acc);font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.kv{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;font-size:15px}
.kv + .kv{border-top:1px solid rgba(200,255,230,.10)}
.kv .k{color:var(--muted)}
.kv .v{color:var(--ink);font-weight:600;text-align:right}
.kv.total .k,.kv.total .v{font-weight:800;color:var(--ink)}
.tl{display:flex;flex-direction:column}
.tl .row{display:flex;gap:14px;min-height:56px}
.tl .rail{width:28px;display:flex;flex-direction:column;align-items:center;flex:0 0 auto}
.tl .dot{width:26px;height:26px;border-radius:13px;border:1.5px solid rgba(200,255,230,.22);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.tl .dot svg{width:14px;height:14px;color:var(--accInk)}
.tl .dot.done{background:var(--acc);border-color:transparent}
.tl .dot.now{box-shadow:0 0 0 5px rgba(126,226,180,.18)}
.tl .line{flex:1;width:2px;background:rgba(200,255,230,.12);margin:4px 0}
.tl .line.done{background:var(--acc)}
.tl .lbl{font-size:16px;font-weight:700;color:var(--muted);line-height:20px}
.tl .lbl.done{color:var(--ink)}
.tl .cap{margin-top:2px;padding-bottom:12px}
.stars{display:flex;gap:6px}
.stars svg{width:34px;height:34px;color:rgba(200,255,230,.25)}
.stars svg.on{color:var(--gold)}
.map{position:absolute;inset:0;overflow:hidden;background:#101816}
.map .tile{position:absolute;width:${256 * 0.78}px;height:${256 * 0.78}px;background-size:100% 100%;filter:brightness(2.15) contrast(1.85) brightness(0.62)}
.heat{position:absolute;width:120px;height:120px;border-radius:60px;background:radial-gradient(circle,rgba(79,168,232,.55) 0%,rgba(79,168,232,.22) 42%,rgba(79,168,232,0) 70%);transform:translate(-50%,-50%);pointer-events:none}
.legal{position:absolute;left:12px;font-size:10px;color:rgba(255,255,255,.55)}
/* --- batch 3 additions: the Filters sheet, its popups, the checklist, the buckets --- */
.fillrow{display:flex;gap:6px}
.fillrow .chip.f{flex:1;justify-content:center;padding:0 4px;min-width:0}
.fillrow .chip.f.wide{flex:1.2}
.pop{position:absolute;width:168px;border-radius:18px;background:rgba(9,36,31,.94);border:1px solid var(--rim);box-shadow:inset 0 1px 0 var(--spec),0 16px 40px rgba(0,0,0,.5);backdrop-filter:blur(24px);overflow:hidden;padding:4px 0}
.pop .r{height:44px;display:flex;align-items:center;padding:0 12px;gap:8px;font-size:15px;color:var(--ink)}
.pop .r + .r{border-top:1px solid rgba(200,255,230,.10)}
.pop .r .tk{width:18px;height:18px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:var(--acc)}
.pop .r .tk svg{width:16px;height:16px}
.pop .r .c{flex:1;text-align:center;padding-right:26px}
.pop .r.on .c,.pop .r.on .l{color:var(--acc);font-weight:700}
.pop .r .cal{width:22px;height:24px;border-radius:5px;border:1.5px solid rgba(200,255,230,.35);border-top-width:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--ink);flex:0 0 auto}
.pop .r .h{font-size:12px;color:var(--muted)}
.pop .r.muted .l{color:var(--muted)}
.cb{width:24px;height:24px;border-radius:7px;border:1.5px solid rgba(200,255,230,.3);display:flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--accInk)}
.cb.on{background:var(--acc);border-color:transparent}
.cb svg{width:14px;height:14px}
.strike{text-decoration:line-through;color:var(--muted)}
.bucket{flex:1;padding:12px 10px;display:flex;flex-direction:column;gap:4px;border-radius:18px}
.bucket .amt{font-size:18px;font-weight:800;color:var(--gold);white-space:nowrap}
.bucket .k{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
.bucket .n{font-size:11px;color:var(--muted);line-height:14px}
.switch.on{background:var(--acc);border-color:transparent}
.switch.on i{left:auto;right:3px;background:var(--accInk)}
.btn2.off{color:var(--muted);border-color:rgba(200,255,230,.10)}
/* --- batch 4 additions: the inbox row, bubbles, the composer, menus, the report dialog --- */
.pillrow{display:flex;gap:8px}
.pillrow .p{height:32px;padding:0 14px;border-radius:16px;display:flex;align-items:center;font-size:13px;font-weight:700;color:var(--muted);background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.12)}
.pillrow .p.on{background:var(--acc);color:var(--accInk);border-color:transparent}
.msgs{display:flex;flex-direction:column;gap:10px}
.bub{max-width:78%;padding:10px 14px 8px;border-radius:20px;font-size:15px;line-height:20px;color:var(--ink);display:flex;flex-direction:column;gap:4px}
.bub.them{align-self:flex-start;background:rgba(12,44,38,.62);border:1px solid rgba(200,255,230,.16);border-bottom-left-radius:6px;backdrop-filter:blur(18px)}
.bub.me{align-self:flex-end;background:linear-gradient(135deg,rgba(141,240,192,.28),rgba(79,197,140,.22));border:1px solid rgba(126,226,180,.35);border-bottom-right-radius:6px}
.bub .ft{display:flex;align-items:center;justify-content:flex-end;gap:4px;font-size:11px;color:var(--muted)}
.bub .ft svg{width:14px;height:14px}
.bub .ft .tk{display:flex;margin-left:2px}
.bub .ft .tk svg + svg{margin-left:-8px}
.wave{display:flex;align-items:center;gap:2px;height:28px}
.wave i{display:block;width:3px;border-radius:2px;background:var(--acc)}
.play{width:32px;height:32px;border-radius:16px;background:var(--acc);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.play svg{width:16px;height:16px;color:var(--accInk)}
.doc{display:flex;align-items:center;gap:10px;padding:2px 0}
.doc .ico{width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.doc .ico svg{width:20px;height:20px;color:var(--acc)}
.composer{position:absolute;left:0;right:0;bottom:84px;padding:10px 16px 12px;display:flex;align-items:center;gap:12px;background:rgba(5,24,20,.72);border-top:1px solid rgba(200,255,230,.16);backdrop-filter:blur(24px)}
.composer svg{width:26px;height:26px;color:var(--acc);flex:0 0 auto}
.composer .in{flex:1;min-height:44px;padding:11px 16px;border-radius:22px;font-size:15px;line-height:20px}
.jobdiv{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;font-weight:600}
.jobdiv i{flex:1;height:1px;background:rgba(200,255,230,.12)}
.jobdiv span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%}
.menu{position:absolute;right:20px;top:106px;width:230px;padding:6px 0;border-radius:18px;background:rgba(9,36,31,.94);border:1px solid var(--rim);box-shadow:inset 0 1px 0 var(--spec),0 16px 40px rgba(0,0,0,.5);backdrop-filter:blur(24px)}
.menu .r{height:46px;display:flex;align-items:center;gap:12px;padding:0 16px;font-size:15px;color:var(--ink)}
.menu .r svg{width:20px;height:20px;color:var(--acc)}
.asheet{position:absolute;left:16px;right:16px;bottom:24px;padding:8px 0 0;border-radius:22px;background:rgba(9,36,31,.94);border:1px solid var(--rim);box-shadow:inset 0 1px 0 var(--spec),0 16px 40px rgba(0,0,0,.5);backdrop-filter:blur(24px)}
.asheet .hd{padding:10px 18px 12px;text-align:center;border-bottom:1px solid rgba(200,255,230,.10)}
.asheet .r{height:50px;display:flex;align-items:center;gap:12px;padding:0 18px;font-size:16px;color:var(--ink)}
.asheet .r svg{width:20px;height:20px;color:var(--acc)}
.asheet .r.bad{color:#F0A0A0}
.asheet .r.bad svg{color:#F0A0A0}
.asheet .cancel{height:52px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--acc);border-top:1px solid rgba(200,255,230,.10)}
.radio{width:22px;height:22px;border-radius:11px;border:1.5px solid rgba(200,255,230,.3);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.radio.on{border-color:var(--acc)}
.radio.on i{width:12px;height:12px;border-radius:6px;background:var(--acc);display:block}
.nrow{display:flex;gap:12px;align-items:flex-start;padding:12px 14px}
.nrow + .nrow{border-top:1px solid rgba(200,255,230,.10)}
.dot{width:9px;height:9px;border-radius:5px;background:var(--acc);flex:0 0 auto;margin-top:6px;box-shadow:0 0 10px rgba(126,226,180,.6)}
/* --- batch 6 additions: the launch glow, the wordmark, the auth form, the OTP boxes --- */
.glowbg{position:absolute;inset:0;background:radial-gradient(ellipse 70% 45% at 50% 42%,rgba(126,226,180,.16),rgba(126,226,180,0) 70%)}
.wordmark{font-size:34px;font-weight:800;letter-spacing:8px;color:var(--gold);text-indent:8px}
.mark{border-radius:28px;box-shadow:0 18px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.08)}
.ghost{height:52px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--acc)}
.otp{display:flex;gap:8px}
.otp i{flex:1;height:56px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.12);display:flex;align-items:center;justify-content:center;font-style:normal;font-size:24px;font-weight:700;color:var(--ink)}
.otp i.cur{border-color:var(--acc);box-shadow:0 0 0 3px rgba(126,226,180,.18)}
.choice{flex:1;padding:16px 14px;display:flex;flex-direction:column;gap:8px;border-radius:18px;border:1px solid var(--rim);background:var(--glass);box-shadow:inset 0 1px 0 var(--spec)}
.choice.on{border-color:var(--acc);background:rgba(126,226,180,.12)}
.choice svg{width:24px;height:24px;color:var(--acc)}
.overlayart{position:absolute;left:0;right:0;bottom:0;width:393px;display:block}
/* --- fable: Customer Home (home-fable) --- */
.herof{position:relative;display:flex;flex-direction:column;gap:8px;min-height:172px}
.herof .art{right:-33px;top:2px}
.greetf{display:flex;gap:5px;font-size:18px;line-height:22px;font-weight:500;color:var(--ink);white-space:nowrap}
.greetf b{color:var(--gold);font-weight:600}
.hubf{padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.hubf .hd{display:flex;gap:12px;align-items:center}
.hubf .hd .well{width:48px;height:48px;border-radius:24px}
.hubf .hd .well svg{width:22px;height:22px}
.hubf .amt{font-size:20px;line-height:24px}
.hubf .act{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:var(--acc);min-width:0}
.hubf .act svg{width:16px;height:16px;flex:0 0 auto}
.hubf .act span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hubf .vd{font-size:12px;color:var(--muted);white-space:nowrap;flex:0 0 auto}
.tilesf .tile{font-size:12px;line-height:14px;gap:7px}
.linkf svg{width:18px;height:18px;flex:0 0 auto}
/* --- fable: Post a job · Review and publish (post-review-fable) --- */
.noticef{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:19px;color:var(--ink)}
.noticef svg{width:20px;height:20px;color:var(--acc);flex:0 0 auto}
.sumf{padding:18px 16px;display:flex;flex-direction:column;gap:14px}
.sumf .t{font-size:22px;line-height:26px;font-weight:700;color:var(--ink)}
.sumf .d{font-size:15px;line-height:21px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
/* --- fable: Compare bids (compare-fable) --- */
.av44{width:44px;height:44px;border-radius:22px;background:rgba(255,255,255,.06);border:1.5px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:Georgia,"Times New Roman",serif;font-size:17px;font-weight:700;color:var(--gold);flex:0 0 auto}
.bidf{padding:16px;display:flex;flex-direction:column;gap:10px}
.bidf .hd{display:flex;align-items:center;gap:12px}
.bidf .nm{flex:1;min-width:0;font-size:17px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bidf .amt{font-size:22px;line-height:26px}
.bidf .ft{display:flex;align-items:center;gap:2px;font-size:13px;color:var(--muted)}
.bidf .ft b{color:var(--acc);font-weight:700}
.bidf .ft svg{width:12px;height:12px;color:var(--acc)}
.protf{padding:18px 16px;display:flex;flex-direction:column;gap:10px;position:relative}
.protf .shield{position:absolute;right:16px;top:16px;width:40px;height:40px;border-radius:20px;background:rgba(126,226,180,.12);display:flex;align-items:center;justify-content:center}
.protf .shield svg{width:22px;height:22px;color:var(--acc)}
.protf .tiles3{display:flex;gap:8px;margin-top:6px}
.protf .pt{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 6px;border-radius:16px;background:rgba(255,255,255,.06);text-align:center}
.protf .pt .g{width:34px;height:34px;border-radius:17px;background:rgba(126,226,180,.12);display:flex;align-items:center;justify-content:center}
.protf .pt .g svg{width:18px;height:18px;color:var(--acc)}
.protf .pt .t{font-size:13px;font-weight:700;color:var(--ink)}
.protf .pt .s{font-size:11px;color:var(--muted)}
/* --- fable: the client's job detail (cjob-fable) --- */
.pcard{padding:18px 16px;display:flex;flex-direction:column;gap:12px}
.pcard .sect{font-size:20px}
.btn2.danger{color:#F0A0A0;border-color:rgba(240,160,160,.35)}
.btn2.sm{height:44px;font-size:15px;flex:1}
.btn2 svg{width:20px;height:20px;flex:0 0 auto}
.av52{width:52px;height:52px;border-radius:26px;background:rgba(255,255,255,.06);border:1.5px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:Georgia,"Times New Roman",serif;font-size:20px;font-weight:700;color:var(--gold);flex:0 0 auto}
.wrow{display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:rgba(255,255,255,.06)}
.wrow .nm{font-size:16px;font-weight:700;color:var(--ink)}
.wrow .chevw{display:flex;color:var(--muted);flex:0 0 auto}
.wrow .chevw svg{width:18px;height:18px}
.moneylg{font-size:30px;line-height:34px;font-weight:800;color:var(--gold)}
.tagf{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:15px;background:rgba(126,226,180,.14);color:var(--acc);font-size:13px;font-weight:700;align-self:flex-start}
.tagf svg{width:15px;height:15px}
.thumb96{width:96px;height:96px;border-radius:16px;overflow:hidden;background:rgba(255,255,255,.06)}
.noticec{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;font-size:14px;line-height:19px;color:var(--muted)}
.noticec svg{width:20px;height:20px;color:var(--muted);flex:0 0 auto}
/* --- fable: Chat, Checkout, Welcome, Sign in --- */
.chathd{display:flex;align-items:center;gap:10px;min-height:44px}
.chathd .av34{width:34px;height:34px;border-radius:17px;background:rgba(255,255,255,.06);border:1.5px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:Georgia,"Times New Roman",serif;font-size:13px;font-weight:700;color:var(--gold);flex:0 0 auto}
.chathd .nm{font-size:17px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chathd .sub{font-size:13px;line-height:16px;color:var(--muted)}
.bub .img{width:200px;height:150px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.06)}
.bub .img .pimg{width:100%;height:100%}
.bub .vn{display:flex;align-items:center;gap:10px}
.bub .vn .dur{font-size:12px;color:var(--muted);flex:0 0 auto}
.bub .doc .nm{font-size:14px;font-weight:600;color:var(--ink);line-height:18px}
.bub .doc .sz{font-size:12px;color:var(--muted)}
.bub .ft svg.sent{color:var(--muted)}
.bub .ft svg.read{color:var(--gold)}
.livef{position:absolute;left:16px;right:16px;display:flex;align-items:center;gap:10px;padding:10px 12px}
.livef .pin{width:34px;height:34px;border-radius:17px;background:rgba(126,226,180,.14);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.livef .pin svg{width:18px;height:18px;color:var(--acc)}
.livef .t{font-size:14px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.livef .d{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.livef .rem{font-size:12px;font-weight:700;color:var(--acc);flex:0 0 auto}
.composer .plus svg{width:28px;height:28px;color:var(--ink)}
.explf{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:19px;color:var(--muted)}
.explf svg{width:18px;height:18px;color:var(--acc);flex:0 0 auto;margin-top:1px}
.explf b{color:var(--ink);font-weight:700}
.artf{position:relative;height:250px}
.artf .ring{position:absolute;left:50%;top:22px;width:206px;height:206px;margin-left:-103px;border-radius:50%;background:rgba(126,226,180,.10)}
.artf .ring i{position:absolute;inset:0;border-radius:50%;display:block}
.artf .ring i.b{left:6%;top:6%;right:-6%;bottom:-6%;background:rgba(126,226,180,.09)}
.artf .ring i.c{left:12%;top:12%;right:-12%;bottom:-12%;background:rgba(126,226,180,.08)}
.badgef{position:absolute;display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:20px;background:rgba(9,36,31,.90);border:1px solid var(--rim);box-shadow:inset 0 1px 0 var(--spec),0 10px 30px rgba(0,0,0,.35);font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap}
.badgef svg{width:16px;height:16px;color:var(--acc)}
.topbar{display:flex;align-items:center;justify-content:space-between;height:40px}
.topbar .t{font-size:15px;font-weight:700;color:var(--ink)}
.phonef{display:flex;gap:8px}
.phonef .cc{height:54px;padding:0 12px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.10);display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700;color:var(--ink);flex:0 0 auto}
.phonef .cc svg{width:14px;height:14px;color:var(--muted);transform:rotate(90deg)}
.phonef .in{flex:1;height:54px;padding:0 16px}
.phonef .in .dial{color:var(--muted);font-weight:600}
/* --- fable: Review & tip (review-tip-fable) --- */
.presetf{display:flex;gap:8px}
.presetf .p{flex:1;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--ink);background:rgba(255,255,255,.06);border:1px solid rgba(200,255,230,.12)}
.presetf .p.on{background:var(--acc);color:var(--accInk);border-color:transparent}
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
/** A pushed screen's header: the back disc and the serif title, an eyebrow above it when the screen has one. */
const header = (title, { eyebrow = '', right = '' } = {}) => `<div class="hdr"><div class="circle">${ic('i-back')}</div><div class="stack" style="gap:2px;flex:1;min-width:0">${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<div class="t serif">${title}</div></div>${right}</div>`;
/** The wizard's header (components/ScreenHeader.tsx with backLabel / rightLabel, centred): two mint links and the title between. */
const wizHeader = (backLabel, title, rightLabel) => `<div class="wiz"><span class="lnk">${ic('i-back')}${backLabel}</span><span class="wizt">${title}</span><span class="lnk right">${rightLabel ? `${rightLabel}${ic('i-chev')}` : ''}</span></div>`;
/** The step intro (eyebrow · title · subtitle) and the four-segment progress row. */
const stepIntro = (n, title, sub) => `<div class="stack" style="gap:6px"><span class="eyebrow">Step ${n} of 4</span><div class="h2 serif" style="font-size:28px;line-height:32px">${title}</div><span class="muted" style="font-size:14px;line-height:19px">${sub}</span></div>
    <div class="steps">${['Describe', 'Media', 'Location', 'Review'].map((l, i) => `<div class="st${i < n ? ' done' : ''}${i === n - 1 ? ' on' : ''}"><i></i><span>${l}</span></div>`).join('')}</div>`;
/** A labelled form field: the label row (hint at the right), then the well. */
const fld = (label, value, { hint = '', ph = false, multi = false, trailing = '' } = {}) => `<div class="fld"><div class="between"><span class="lbl">${label}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div><div class="in${multi ? ' multi' : ''}${ph ? ' ph' : ''}"><span style="flex:1">${value}</span>${trailing}</div></div>`;
/** A filter chip (components/Chip.tsx variant="filter"): glyph + label, mint with dark ink when chosen. */
const chipF = (label, icon, on = false) => `<span class="chip f${on ? ' on' : ''}">${icon ? ic(icon) : ''}${label}</span>`;
/** A summary row: the glyph in a small well, the label above the value. */
const frow = (icon, k, v, money = false) => `<div class="frow"><div class="well sm">${ic(icon)}</div><div style="min-width:0"><div class="k">${k}</div><div class="v${money ? ' money' : ''}">${v}</div></div></div>`;
/** A facts-panel cell: the label above the value, no glyph — three or six to a panel. */
const fact = (k, v, money = false) => `<div class="fact s"><div class="k">${k}</div><div class="v${money ? ' money' : ''}">${v}</div></div>`;
/** A break opportunity after every slash, so "Handyman/Repairs" can wrap inside a narrow tile. */
const wbr = (label) => label.split('/').join('/<wbr>');
/**
 * A screen that scrolls: the fixed chrome stays where it is and the content
 * column is clipped between `top` and `bottom` (the nav's or the sticky bar's
 * top). A second frame of the same page shifts the column up by `scroll`, so
 * the operator sees the rest exactly as a phone would show it.
 */
const scroller = (top, bottom, scroll, inner, gap = 20) => `<div class="clip" style="top:${top}px;bottom:${bottom}px"><div class="col" style="gap:${gap}px;transform:translateY(-${scroll}px)">${inner}</div></div>`;
/** The empty state, as a glass card: the glyph in a round well, the title, one line under it. */
const emptyCard = (icon, eyebrow, title, line, extra = '') => `<div class="card state"><div class="well">${ic(icon)}</div>${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<div class="h2 serif" style="font-size:22px;line-height:26px">${title}</div><p class="muted" style="font-size:14px;line-height:20px">${line}</p>${extra}</div>`;

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
  </div>${workerNav('Home')}`;

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
  </div>${workerNav('Home')}`;

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

// ---------------------------------------------------------------------------
// BATCH 1 — customer core (SCREENS.md). Every control from the screen's source.
// ---------------------------------------------------------------------------
/** Find help (screens/WorkerSearchScreen.tsx), the Discover tab root in its idle state — the harness's customer-discover. */
const discover = () => `
  <div class="body" style="gap:22px;bottom:100px">
    ${header('Find help', { eyebrow: 'Find trusted help, fast' })}
    <span class="muted" style="font-size:14px;line-height:19px;margin-top:-10px">Describe the task in your own words, or start with a service below.</span>
    <div class="field" style="padding-right:8px">${ic('i-search')}<span style="flex:1">What do you need help with?</span>${ic('i-mic')}<div class="disc">${ic('i-arrow')}</div></div>
    <div class="stack" style="gap:12px"><div class="between"><span class="eyebrow">Popular services</span><span class="muted" style="font-size:12px">Swipe to explore</span></div>
      <div class="hrow">${SKILLS.map(([l, i]) => `<div class="tile2">${ic(i)}<span>${wbr(l)}</span></div>`).join('')}</div></div>
    <div style="margin:auto 0">${emptyCard('i-people', 'Start with the task', 'Describe what you need', 'Try “move a queen mattress up three flights” — or choose a popular service above.')}</div>
  </div>${nav('Discover')}`;

/** Another person's profile (screens/WorkerProfileScreen.tsx): hero, availability, save, services, the offer card, Past Work. Scrolls: two frames. */
const wprofile = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Profile')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:14px;align-items:center"><div class="avatar" style="width:64px;height:64px;border-radius:32px;font-size:22px">${WORKER.initials}</div><div class="stack" style="gap:4px;flex:1;min-width:0"><div class="h2 serif" style="font-size:24px;line-height:28px">${WORKER.name}</div><span class="meta" style="color:var(--acc)">${ic('i-leaf')}New worker</span></div></div>
      <p style="font-size:14px;line-height:20px;color:var(--ink)">${WORKER.bio}</p>
      <div class="wrap">${WORKER.cats.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
    </div>
    <div class="card" style="padding:14px 18px;display:flex;align-items:center;gap:12px">${icS('i-sun', 20, 'var(--acc)')}<span style="font-size:14px;line-height:19px;color:var(--ink)">${WORKER.first} is taking new work. ${WORKER.note}</span></div>
    <div class="card" style="padding:16px 18px;display:flex;align-items:center;justify-content:space-between"><span class="title" style="font-weight:600">Save ${WORKER.first} for later</span>${icS('i-bookmark', 22, 'var(--muted)')}</div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:14px"><span class="eyebrow">Services &amp; pricing</span>
      ${WORKER.services.map((s, i) => `${i ? '<div class="divider"></div>' : ''}<div class="stack" style="gap:8px"><div class="between" style="align-items:flex-start;gap:12px"><div class="stack" style="gap:3px;flex:1;min-width:0"><span class="title" style="font-size:16px">${s.title}</span><span class="muted" style="font-size:13px;line-height:18px">${s.desc}</span></div><span class="money" style="font-size:17px;white-space:nowrap">${s.price}</span></div><span class="link">Request at listed price</span></div>`).join('')}
    </div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><div class="h2 serif" style="font-size:22px;line-height:26px">Send ${WORKER.first} a job offer</div><p class="muted" style="font-size:14px;line-height:20px">Send ${WORKER.first} a job with a price. It goes to them privately — nobody else sees it, and it never appears in open jobs. They can accept, decline, or suggest a different price before anything is booked.</p><div class="cta">${ic('i-send')}Send an offer</div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><span class="eyebrow">Past Work</span><span class="muted" style="font-size:14px">No completed jobs yet.</span><div class="card2" style="padding:22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;border-radius:16px">${icS('i-images', 26, 'var(--muted)')}<span class="muted" style="font-size:14px;line-height:19px">This worker hasn’t featured any photos yet.</span></div></div>
  `, 16)}${nav('Discover')}`;

/** Profile reviews (screens/ProfileReviewsScreen.tsx), the own-account entry: both reputations, the Work / Hiring toggle, no reviews yet. */
const reviews = () => `
  <div class="body" style="gap:20px;bottom:100px">
    ${header('Mahmudur’s reviews')}
    <div class="seg2"><div class="o on">Work</div><div class="o">Hiring</div></div>
    <div style="margin:auto 0">${emptyCard('i-staro', '', 'No reviews yet', 'Reviews appear here once Mahmudur has finished a job with someone.')}</div>
  </div>${nav('Profile')}`;

/** Post a job · step 1 (screens/PostJobScreen.tsx): Title, Description with their counters, the category pills. */
const postWhat = () => `
  <div class="body" style="gap:0">${wizHeader('Home', 'Post a Job', 'Media')}</div>
  ${scroller(112, 84, 0, `
    ${stepIntro(1, 'What needs doing?', 'A clear title and a few useful details help workers decide quickly.')}
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:12px">
      ${fld('Title', DETAIL.title, { hint: `${DETAIL.title.length}/80` })}
      ${fld('Description', DETAIL.body, { hint: `${DETAIL.body.length}/500`, multi: true })}
    </div>
    <div class="stack" style="gap:10px"><span class="lbl">Category</span><div class="wrap">${POSTABLE.map(([l, i]) => chipF(l, i, l === POST.cat)).join('')}</div></div>
  `, 16)}${nav('Home')}`;

/** Post a job · step 2: the privacy notice, the photo and video uploaders with their caps, the photo nudge pinned above the bar. */
const postMedia = () => `
  <div class="body" style="gap:0">${wizHeader('Describe', 'Post a Job', 'Location')}</div>
  ${scroller(112, 152, 0, `
    ${stepIntro(2, 'Show the task', 'Photos and short clips are optional, but they can make the task clearer.')}
    <div class="card" style="padding:14px 16px;display:flex;align-items:center;gap:12px"><div class="well sm">${ic('i-eyeoff')}</div><span style="font-size:14px;line-height:19px;color:var(--ink)">Avoid faces, documents, license plates, addresses, or any other personal information</span></div>
    <div class="stack" style="gap:10px"><div class="between"><span class="lbl">Photos (optional) · 0/10</span><span class="chip lim">${ic('i-image')}Up to 10 photos</span></div><div class="add" style="width:101px;height:101px">${ic('i-plus')}</div></div>
    <div class="stack" style="gap:10px"><div class="between"><span class="lbl">Video (optional) · 0/1</span><span class="chip lim">${ic('i-clock')}Up to 60 seconds</span></div><div class="add" style="width:202px;height:101px">${ic('i-video')}</div><span class="cap">A short clip explains an awkward job faster than a paragraph.</span></div>
  `, 18)}
  <div class="card nudge">${ic('i-image')}<span style="flex:1">Add photos so workers can see the work.</span>${ic('i-close', 'x')}</div>${nav('Home')}`;

/** Post a job · step 3: the area with the locate control, the private address and its caption, the day row (scrolled to the chosen day), the arrival windows. */
const postWhere = () => `
  <div class="body" style="gap:0">${wizHeader('Media', 'Post a Job', 'Review')}</div>
  ${scroller(112, 84, 0, `
    ${stepIntro(3, 'Where and when?', 'Workers browsing see only the area. The exact address stays private until you hire someone.')}
    <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;gap:10px;align-items:flex-end"><div style="flex:1;min-width:0">${fld('Area or neighborhood', 'Flatbush, Brooklyn')}</div><div class="disc" style="width:50px;height:50px;border-radius:16px">${ic('i-pin')}</div></div>
      <div class="stack" style="gap:8px">${fld('Service address (private, optional)', 'e.g. 2410 Emmons Ave, Apt 3B', { ph: true })}<span class="cap">Never shown until you hire — can see after job is accepted.</span></div>
    </div>
    <div class="stack" style="gap:10px"><span class="lbl">Which day?</span><div class="hrow" style="margin:0 -20px;padding:0 20px"><div style="display:flex;gap:8px;transform:translateX(-342px)">${DAYS.map((d) => chipF(d, '', d === POST.day)).join('')}</div></div></div>
    <div class="stack" style="gap:10px"><span class="lbl">Arrival window</span><div class="wrap">${chipF('Flexible', '')}${WINDOWS.map((w) => chipF(w, '', w === WINDOWS[0])).join('')}</div></div>
  `, 18)}${nav('Home')}`;

/** Post a job · step 4: the one budget pill with its pencil, the summary card, the publish notice, Publish pinned above the bar. Scrolls: two frames. */
const postReview = (scroll = 0) => `
  <div class="body" style="gap:0">${wizHeader('Location', 'Post a Job', '')}</div>
  ${scroller(112, 160, scroll, `
    ${stepIntro(4, 'Review and publish', 'Check the details below. You can still go back without losing your work.')}
    <div class="stack" style="gap:10px"><span class="lbl">Max budget</span><div class="pricepill"><span class="money" style="font-size:24px">${POST.pay}</span><div class="pen">${ic('i-pencil')}</div></div><span class="cap">Optional — leave blank if you want workers to propose a price.</span></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><span class="eyebrow">Job summary</span><div class="h2 serif" style="font-size:22px;line-height:26px">${DETAIL.title}</div><p class="muted" style="font-size:14px;line-height:20px">${DETAIL.body}</p><div class="divider"></div>
      <div class="grid2" style="row-gap:14px;column-gap:16px">${fact('Category', POST.cat)}${fact('Area', 'Flatbush, Brooklyn')}${fact('Media', 'None')}${fact('Timing', POST.timing)}${fact('Address (private)', 'Not added')}${fact('Budget', POST.pay, true)}</div></div>
    <div style="display:flex;align-items:center;gap:10px">${icS('i-checkcircle', 20, 'var(--acc)')}<span class="muted" style="font-size:14px;line-height:19px">Publishing makes this job visible to workers nearby.</span></div>
  `, 18)}
  <div class="sticky abovenav"><div class="cta">Publish</div></div>${nav('Home')}`;

/** The Edit Budget dialog (components/EditBudgetDialog.tsx) over the review step: the posting question, the one amount, Save beside Cancel. */
const postBudget = () => `${postReview(0)}<div class="scrim"></div>
  <div class="card dialog"><div class="h2 serif" style="font-size:24px;line-height:28px">Edit Budget</div><p class="muted" style="font-size:14px;line-height:20px;margin-top:-6px">Set the maximum amount workers can bid up to.</p>
    <div class="seg2"><div class="o on">Ask for bids</div><div class="o">Set a price</div></div>
    <div class="in" style="height:56px;gap:6px"><span class="money" style="font-size:22px">$</span><span class="money" style="font-size:22px">120</span></div>
    <div style="display:flex;gap:10px"><div class="cta" style="flex:1">Save</div><div class="btn2" style="flex:1">Cancel</div></div></div>`;

/** Your job is live (the SuccessScreen template inside PostJobScreen): the mark, the copy, the PUBLISHED card, the bids card, both actions in one row. */
const postLive = () => `
  <div class="body" style="gap:16px;align-items:center;text-align:center;top:72px">
    <div class="mark">${ic('i-check')}</div>
    <div class="stack" style="gap:8px;align-items:center"><div class="h1 serif" style="font-size:30px;line-height:34px">Your job is live.</div><p class="muted" style="font-size:15px;line-height:21px;max-width:320px">Workers can now see your job. Bids appear as workers respond, and you choose who gets it.</p></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px;text-align:left;align-self:stretch"><span class="eyebrow">Published</span><div class="h2 serif" style="font-size:22px;line-height:26px">${DETAIL.title}</div><div class="divider"></div>
      <div class="grid2" style="row-gap:14px;column-gap:16px"><div class="fact s"><div class="k">Category</div><div style="margin-top:6px"><span class="chip">${POST.cat}</span></div></div>${fact('Area', 'Flatbush, Brooklyn')}${fact('Timing', POST.timing)}${fact('Budget', POST.pay, true)}</div></div>
    <div class="card" style="padding:14px 16px;display:flex;align-items:center;gap:12px;text-align:left;align-self:stretch"><div class="well sm">${ic('i-bell')}</div><div class="stack" style="gap:2px"><span class="title" style="font-size:16px">Expect the first bids soon</span><span class="muted" style="font-size:13px;line-height:18px">You’ll be notified when a worker bids on this job.</span></div></div>
    <div style="display:flex;gap:10px;align-self:stretch"><div class="cta" style="flex:1;font-size:16px">View job and bids</div><div class="btn2" style="flex:1;font-size:16px">Back to Home</div></div>
  </div>${nav('Home')}`;

/** The [+] Create sheet (components/CreateSheet.tsx) over Home: Needs you, Post a job, Hire again, My jobs, Switch to Worker. */
const create = () => `${home()}<div class="scrim"></div>
  <div class="sheet"><div class="grab"></div><div class="h2 serif" style="font-size:24px;line-height:28px;margin-bottom:14px">What do you need?</div>
    <div class="card2" style="padding:12px 14px;display:flex;align-items:center;gap:12px;border-radius:18px;margin-bottom:10px"><div class="well sm">${ic('i-tv')}</div><div class="stack" style="gap:1px;flex:1;min-width:0"><span class="eyebrow" style="font-size:10.5px">Needs you</span><span class="title" style="font-size:15px">2 bids to review</span><span class="muted" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Mount a 55-inch TV in the living room</span></div>${icS('i-chev', 18, 'var(--muted)')}</div>
    <div class="list">
      <div class="row" style="padding:14px 4px"><div class="disc" style="width:40px;height:40px;border-radius:20px;box-shadow:none">${ic('i-plus')}</div><span style="flex:1;font-size:17px;font-weight:700;color:var(--ink)">Post a job</span>${ic('i-chev', 'chev')}</div>
      <div class="row" style="padding:14px 4px"><div class="well sm" style="width:40px;height:40px;border-radius:20px">${ic('i-people')}</div><span style="flex:1;font-size:16px;color:var(--ink)">Hire again</span>${ic('i-chev', 'chev')}</div>
      <div class="row" style="padding:14px 4px"><div class="well sm" style="width:40px;height:40px;border-radius:20px">${ic('i-briefcase')}</div><span style="flex:1;font-size:16px;color:var(--ink)">My jobs</span>${ic('i-chev', 'chev')}</div>
      <div class="row" style="padding:14px 4px"><div class="well sm" style="width:40px;height:40px;border-radius:20px;background:transparent;border:1px solid rgba(126,226,180,.45)">${ic('i-swap')}</div><span style="flex:1;font-size:16px;color:var(--ink)">Switch to Worker</span><span class="muted" style="font-size:12px">confirms first</span></div>
    </div></div><div class="home-bar"></div>`;

/** Home's "Other services" sheet (components/ServicePickerSheet.tsx): the eighteen search entry points, scrolling inside the sheet. */
const services = () => `${home()}<div class="scrim"></div>
  <div class="sheet" style="top:132px;padding-bottom:24px"><div class="grab"></div>
    <div class="between" style="align-items:flex-start;margin-bottom:6px"><div class="stack" style="gap:3px"><div class="h2 serif" style="font-size:24px;line-height:28px">All services</div><span class="muted" style="font-size:14px">Pick what you need help with</span></div><div class="circle" style="width:36px;height:36px">${ic('i-close')}</div></div>
    <div class="list" style="flex:1;overflow:hidden">${MORE.map(([l, i]) => `<div class="row" style="padding:12px 4px">${ic(i, 'lead')}<span style="flex:1;font-size:16px;color:var(--ink)">${l}</span>${ic('i-chev', 'chev')}</div>`).join('')}</div></div><div class="home-bar"></div>`;

// ---------------------------------------------------------------------------
// BATCH 2 — customer jobs (SCREENS.md). The sample job through its lifecycle.
// ---------------------------------------------------------------------------
/** A header with the screen's subtitle under its title (components/ScreenHeader.tsx `subtitle`). */
const header2 = (title, sub) => `<div class="hdr"><div class="circle">${ic('i-back')}</div><div class="stack" style="gap:0;flex:1;min-width:0"><div class="t serif" style="font-size:24px;line-height:28px">${title}</div><span class="sub">${sub}</span></div></div>`;
/** A hub card (components/HubCard.tsx): status and age, the thumb and the three lines, the money and the next action. */
const hubCard = (j, i, subtitle, next) => `<div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">
      <div class="between"><span class="chip">Open</span><span class="muted" style="font-size:12px">${j.age}</span></div>
      <div style="display:flex;gap:12px;align-items:center"><div class="thumb" style="width:56px;height:56px">${i === 2 ? `${photo()}` : ic(j.icon)}</div><div class="stack" style="gap:3px;flex:1;min-width:0"><span class="title lines2">${j.title}</span><span class="muted" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${j.cat} · ${j.hood}, Brooklyn, NY</span><span class="muted" style="font-size:13px">${subtitle}</span></div></div>
      <div class="between" style="align-items:flex-end"><span class="money" style="font-size:20px">${j.pay}</span><div class="stack" style="gap:2px;align-items:flex-end"><span class="link" style="font-size:13px;display:flex;align-items:center;gap:4px">${icS('i-arrow', 14, 'var(--acc)')}${next}</span><span class="muted" style="font-size:12px">View details</span></div></div></div>`;
/** An offer card (components/OfferCard.tsx, list variant): the bidder, OFFER pinned right in gold, the pitch, the two actions, the full-bid link. */
const offerCard = (b) => `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:12px;align-items:center"><div class="avatar" style="width:52px;height:52px;border-radius:26px;font-size:18px;border-width:1.5px">${b.w.initials}</div><div class="stack" style="gap:3px;flex:1;min-width:0"><span class="title" style="display:flex;align-items:center;gap:4px">${b.w.name}${icS('i-chev', 14, 'var(--muted)')}</span><span class="meta">${icS('i-star', 13, 'var(--gold)')}No reviews yet</span></div><div class="stack" style="gap:0;align-items:flex-end"><span class="eyebrow" style="font-size:9.5px">Offer</span><span class="money" style="font-size:22px;line-height:24px">${b.amount}</span></div></div>
      <p class="lines2" style="font-size:14px;line-height:20px;color:var(--ink);-webkit-line-clamp:3">“${b.pitch}”</p>
      <div style="display:flex;gap:10px"><div class="btn2" style="flex:1;height:46px;font-size:15px">View profile</div><div class="cta" style="flex:1;height:46px;font-size:15px;box-shadow:none">Accept offer</div></div>
      <span class="link" style="font-size:14px;display:flex;align-items:center;gap:2px">Full bid · counter or decline${icS('i-chev', 14, 'var(--acc)')}</span></div>`;
/** A key-value summary row (Checkout, Job confirmed). */
const kv = (k, v, cls = '') => `<div class="kv${cls ? ' ' + cls : ''}"><span class="k">${k}</span><span class="v${cls === 'money' ? ' money' : ''}">${v}</span></div>`;
/** The payment card the money screens share: eyebrow, the amount in gold, the machine's caption, a note. */
const payCard = (eyebrow, amount, note, extra = '') => `<div class="card" style="padding:18px;display:flex;flex-direction:column;gap:6px"><span class="eyebrow">${eyebrow}</span><span class="money" style="font-size:30px;line-height:34px">${amount}</span><span class="muted" style="font-size:13px">Funds held in protection</span>${extra}<p class="muted" style="font-size:14px;line-height:20px;margin-top:6px">${note}</p></div>`;

/** My Jobs (screens/MyJobsHubScreen.tsx), the customer's Active tab: the four seeded jobs as "You posted", Post another job. Scrolls: two frames. */
const myjobs = (scroll = 0) => `
  <div class="body" style="gap:0"><div style="display:flex;gap:14px;align-items:center"><div class="well" style="width:48px;height:48px;border-radius:16px">${ic('i-briefcase')}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="eyebrow">Your work</span><div class="h2 serif" style="font-size:26px;line-height:30px">My jobs</div><span class="muted" style="font-size:13px;line-height:17px">Jobs you posted, from first bid to final review.</span></div></div></div>
  ${scroller(150, 84, scroll, `
    <div class="seg3"><div class="o on">Active</div><div class="o">Review</div><div class="o">Closed</div></div>
    <div class="stack" style="gap:12px"><div style="display:flex;align-items:center;gap:8px"><span class="sect">You posted</span><span class="badge">4</span></div>
      ${JOBS.map((j, i) => hubCard(j, i, i === 0 ? 'Awaiting bids' : `${j.bids} received`, i === 0 ? 'Awaiting bids' : `${j.bids} to review`)).join('')}</div>
    <div class="card" style="padding:14px 16px;display:flex;align-items:center;gap:12px"><div class="well sm">${ic('i-plus')}</div><span class="title" style="flex:1;font-size:16px">Post another job</span>${icS('i-arrow', 18, 'var(--acc)')}</div>
  `, 16)}${nav('')}`;

/** The client's job detail (screens/ClientJobDetailScreen.tsx) with bids to compare: hero, scope, timing & address, media, the offers. Scrolls: two frames. */
const cjob = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Job &amp; bids')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
      <div class="between"><span class="chip">Bids Pending (2)</span><span class="muted" style="font-size:12px">Posted 2h ago</span></div>
      <div class="h2 serif" style="font-size:24px;line-height:28px">${DETAIL.title}</div>
      <span class="meta">${ic('i-wrench')}${POST.cat} · ${DETAIL.hood}</span>
      <div class="divider"></div>
      <div class="between"><div class="stack" style="gap:2px"><span class="eyebrow">Budget</span><span class="money" style="font-size:26px;line-height:28px">${DETAIL.pay}</span></div><span class="muted" style="font-size:14px">2 bids pending</span></div>
      <div style="display:flex;gap:10px"><div class="btn2" style="flex:1;height:44px;font-size:15px">Edit job</div><div class="btn2" style="flex:1;height:44px;font-size:15px;color:#F0A0A0;border-color:rgba(240,160,160,.35)">Delete job</div></div>
    </div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><span class="eyebrow">Job scope</span><p style="font-size:15px;line-height:22px;color:var(--ink)">${DETAIL.body}</p><div><span class="chip f">${ic('i-wrench')}${POST.cat}</span></div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><span class="eyebrow">Timing &amp; address</span>
      <div style="display:flex;gap:12px;align-items:center"><div class="well sm">${ic('i-clock')}</div><span style="font-size:15px;color:var(--ink)">${POST.timing}</span></div>
      <div style="display:flex;gap:12px;align-items:flex-start"><div class="well sm">${ic('i-lock')}</div><div class="stack" style="gap:2px"><span style="font-size:15px;color:var(--ink)">2410 Emmons Ave, Apt 3B</span><span class="muted" style="font-size:12px;line-height:16px">Private — only you and the worker you hire can see this address.</span></div></div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:6px"><span class="sect">Posting media</span><span class="muted" style="font-size:13px">What workers can review before bidding.</span><div style="display:flex;gap:10px;margin-top:6px"><div class="thumb" style="width:96px;height:96px">${photo()}</div></div></div>
    <div class="between"><div class="stack" style="gap:2px"><span class="eyebrow">Worker offers</span><span class="sect">2 bids to compare</span></div><div class="btn2" style="height:40px;padding:0 16px;font-size:14px">Compare</div></div>
    <div class="seg2"><div class="o on">Lowest price</div><div class="o">Highest rated</div></div>
    ${BIDS.map(offerCard).join('')}
  `, 16)}${nav('')}`;

/** Compare bids (screens/CompareBidsScreen.tsx): the framing card, the stated order, one row per bid, BRAZOS PROTECTS. */
const compare = () => `
  <div class="body" style="gap:0">${header('Compare bids')}</div>
  ${scroller(116, 84, 0, `
    <div class="stack" style="gap:8px"><div class="card" style="padding:18px;display:flex;flex-direction:column;gap:6px"><div class="between"><span class="eyebrow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">2 bids · ${DETAIL.title}</span><span class="chip" style="flex:0 0 auto">Protected job</span></div><div class="h2 serif" style="font-size:24px;line-height:28px">Compare the full offer.</div><span class="muted" style="font-size:14px;line-height:19px">Price matters, but fit, reliability and included work determine value.</span></div>
      <span class="muted" style="font-size:12px;padding:0 4px">Sorted by rating, then lowest price, then earliest bid.</span></div>
    ${BIDS.map((b) => `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:12px;align-items:center"><div class="avatar" style="width:44px;height:44px;border-radius:22px;font-size:16px;border-width:1.5px">${b.w.initials}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title">${b.w.name}</span><span class="meta" style="color:var(--acc)">${ic('i-leaf')}New worker</span></div><span class="money" style="font-size:22px">${b.amount}</span></div><span class="muted" style="font-size:12px;display:flex;align-items:center;gap:2px">Bid ${b.age} · full terms${icS('i-chev', 12, 'var(--acc)')}</span></div>`).join('')}
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:8px;position:relative"><div style="position:absolute;right:16px;top:16px" class="well sm">${ic('i-shield')}</div><span class="eyebrow">Brazos protects</span><div class="h2 serif" style="font-size:22px;line-height:26px;padding-right:48px">One job. One clear record.</div>
      <div style="display:flex;gap:8px;margin-top:6px">${[['i-images', 'Scope', 'Agreed work'], ['i-shield', 'Payment', 'Held safely'], ['i-image', 'Evidence', 'Before release']].map(([i, t, s]) => `<div class="card2" style="flex:1;padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;border-radius:16px"><div class="well sm">${ic(i)}</div><span style="font-size:13px;font-weight:700;color:var(--ink)">${t}</span><span class="muted" style="font-size:11px">${s}</span></div>`).join('')}</div></div>
  `, 14)}${nav('')}`;

/** Bid detail (screens/BidDetailScreen.tsx): the terms, who you'd be hiring, their pitch, the three consequences, Decline · Counter · Accept pinned. */
const bid = (scroll = 0) => `
  <div class="body" style="gap:0">${header2('Bid detail', DETAIL.title)}</div>
  ${scroller(116, 214, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:8px"><div class="between"><span class="chip">Pending</span><span class="muted" style="font-size:12px">Bid ${BIDS[0].age}</span></div><span class="money" style="font-size:32px;line-height:36px">${BIDS[0].amount}</span><span class="muted" style="font-size:13px">Open until Sep 28 — then it expires on its own.</span></div>
    <div class="stack" style="gap:10px"><span class="sect">Who you’d be hiring</span><div class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:center"><div class="avatar" style="width:52px;height:52px;border-radius:26px;font-size:18px;border-width:1.5px">${WORKER.initials}</div><div class="stack" style="gap:2px;flex:1"><span class="title">${WORKER.name}</span><span class="muted" style="font-size:13px">No reviews yet</span></div>${icS('i-chev', 18, 'var(--muted)')}</div></div>
    <div class="stack" style="gap:8px"><span class="sect">Their pitch</span><p style="font-size:15px;line-height:22px;color:var(--ink)">“${BIDS[0].pitch}”</p></div>
    <div class="card2" style="padding:12px 16px;display:flex;flex-direction:column;gap:6px;border-radius:16px"><p class="muted" style="font-size:13px;line-height:18px"><b style="color:var(--ink)">Accept</b> — selects ${WORKER.first} for the job; the other active bids close. You’ll protect the payment in checkout next.</p><p class="muted" style="font-size:13px;line-height:18px"><b style="color:var(--ink)">Counter</b> — proposes your price instead (3 left).</p><p class="muted" style="font-size:13px;line-height:18px"><b style="color:var(--ink)">Decline</b> — closes this bid; it can’t be accepted afterwards.</p></div>
  `, 14)}
  <div class="sticky abovenav" style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:10px"><div class="btn2" style="flex:1;height:46px;font-size:15px;color:#F0A0A0;border-color:rgba(240,160,160,.35)">Decline</div><div class="btn2" style="flex:1;height:46px;font-size:15px">Counter</div></div><div class="cta">Accept for ${BIDS[0].amount}</div></div>${nav('')}`;

/** Counter-offer (screens/CounterofferScreen.tsx over components/OfferComposer.tsx): their terms, your price, the exact consequence, Send. */
const counter = () => `
  <div class="body" style="gap:0">${header('Counter-offer')}</div>
  ${scroller(116, 84, 0, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><span class="eyebrow">Countering</span><div class="h2 serif" style="font-size:22px;line-height:26px">${DETAIL.title}</div><div class="card2" style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border-radius:16px"><span class="muted" style="font-size:14px">${WORKER.first}’s current terms</span><span class="money" style="font-size:20px">${BIDS[0].amount}</span></div><span class="muted" style="font-size:13px;line-height:19px">Your counter replaces those terms with your price below. Nothing is agreed until one side accepts.</span></div>
    <div class="card" style="padding:16px">${fld('Your counter-offer (USD)', 'e.g. 45', { ph: true })}</div>
    <div style="display:flex;gap:10px;align-items:flex-start">${icS('i-alert', 18, 'var(--muted)')}<span class="muted" style="font-size:13px;line-height:19px">Replaces their offer with yours — it’s then their turn. You have 3 counter-offers left; each expires after 7 days.</span></div>
    <div class="cta">Send counter-offer</div>
  `, 18)}${nav('')}`;

/** Protected checkout (screens/CheckoutScreen.tsx, the card path): what you're protecting, how protection works, the all-in CTA pinned. */
const checkout = (scroll = 0) => `
  <div class="body" style="gap:0">${header2('Protected checkout', DETAIL.title)}</div>
  ${scroller(116, 160, scroll, `
    <div class="stack" style="gap:10px"><span class="sect">What you’re protecting</span><div class="card" style="padding:6px 18px">${kv('Accepted offer', WORKER.name)}${kv('Agreed price', PAY.agreed)}${kv('Scheduled', POST.timing)}${kv('Protection fee', PAY.fee)}${kv('Total charged to your card', PAY.total, 'total money')}${kv('Funding window', `closes in ${PAY.window}`)}</div></div>
    <div class="stack" style="gap:10px"><span class="sect">How protection works</span><div class="card" style="padding:14px 18px;display:flex;flex-direction:column;gap:12px">
      ${[['i-card', 'Pay by card', 'charges the all-in total shown above through the secure payment sheet. Nothing is charged until you confirm in the sheet.'], ['i-lock', 'Hold in protection', `keeps the funds set aside while ${WORKER.name} does the job. They can see the funds are protected, and can’t be paid early.`], ['i-checkcircle', 'Release', 'happens only after you approve the completed work — or automatically 72 hours after completion if you don’t respond. Reporting an issue holds the funds instead.']].map(([i, s, t]) => `<div style="display:flex;gap:12px;align-items:flex-start">${icS(i, 20, 'var(--acc)')}<p class="muted" style="font-size:13px;line-height:18px"><b style="color:var(--ink)">${s}</b> ${t}</p></div>`).join('')}</div></div>
  `, 16)}
  <div class="sticky abovenav"><div class="cta">Protect ${PAY.total} by card</div></div>${nav('')}`;

/** Job confirmed (screens/JobConfirmedScreen.tsx on the SuccessScreen template): the mark, the hired worker, the schedule, the held payment, the two actions. */
const confirmed = () => `
  <div class="body" style="gap:16px;align-items:center;text-align:center;top:72px">
    <div class="mark">${ic('i-shield')}</div>
    <div class="stack" style="gap:8px;align-items:center"><div class="h1 serif" style="font-size:30px;line-height:34px">Job confirmed</div><p class="muted" style="font-size:15px;line-height:21px;max-width:330px">${WORKER.name} is hired and your payment is protected. Funds stay held until the work is done and approved — nothing has been released.</p></div>
    <div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;text-align:left;align-self:stretch">
      <div style="display:flex;gap:12px;align-items:center"><div class="avatar" style="width:48px;height:48px;border-radius:24px;font-size:17px;border-width:1.5px">${WORKER.initials}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title">${WORKER.name}</span><span class="muted lines2" style="font-size:13px;line-height:17px">${DETAIL.title}</span></div></div>
      <div class="kv" style="padding:10px 0 4px;border-top:1px solid rgba(200,255,230,.10)"><span class="k">Scheduled</span><span class="v">${POST.timing}</span></div>
      <div class="card2" style="padding:14px;display:flex;flex-direction:column;gap:4px;border-radius:16px"><div class="between"><span class="money" style="font-size:26px;line-height:30px">${PAY.total}</span><span class="chip">Held</span></div><span class="muted" style="font-size:13px">Funds held in protection</span><p class="muted" style="font-size:13px;line-height:18px;margin-top:4px">Your card was charged and the funds are held in protection until you approve the finished work.</p></div>
    </div>
    <div class="stack" style="gap:10px;align-self:stretch"><div class="cta">View job</div><div class="btn2">Message ${WORKER.name}</div></div>
  </div>${nav('')}`;

/** Track worker (screens/TrackWorkerScreen.tsx): the honesty notice, the five-step timeline, the window, the payment, Message pinned. */
const track = (scroll = 0) => `
  <div class="body" style="gap:0">${header2('Track worker', DETAIL.title)}</div>
  ${scroller(116, 160, scroll, `
    <div class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:flex-start"><div class="well sm">${ic('i-send')}</div><span class="muted" style="font-size:13px;line-height:18px">Status comes from ${WORKER.name}’s own updates — this build has no live location tracking, so what you see here is exactly what they declared.</span></div>
    <div class="stack" style="gap:10px"><span class="sect">Where things stand</span><div class="card tl" style="padding:18px 18px 6px">
      ${[['Hired', 'You accepted their offer', 'done', ''], ['On the way', 'Declared by the worker', 'done', '1h ago'], ['Arrived', 'Declared by the worker', 'now', '20m ago'], ['Working', 'Not yet', '', ''], ['Done', 'Not yet', '', '']].map(([l, c, s, t], i, a) => `<div class="row"><div class="rail"><div class="dot${s ? ' done' : ''}${s === 'now' ? ' now' : ''}">${s ? ic('i-check') : ''}</div>${i < a.length - 1 ? `<div class="line${s === 'done' ? ' done' : ''}"></div>` : ''}</div><div class="stack" style="gap:0;flex:1"><span class="lbl${s ? ' done' : ''}">${l}${t ? `<span class="muted" style="font-weight:500;font-size:13px">  ·  ${t}</span>` : ''}</span><span class="cap">${c}</span></div></div>`).join('')}</div></div>
    <div class="stack" style="gap:10px"><span class="sect">Scheduled window</span><div class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:center"><div class="well sm">${ic('i-clock')}</div><span style="font-size:15px;color:var(--ink)">${POST.timing}</span></div></div>
    <div class="stack" style="gap:10px"><span class="sect">Payment</span><div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:4px"><span class="eyebrow">Protected payment</span><span class="money" style="font-size:24px;line-height:28px">${PAY.agreed}</span><span class="muted" style="font-size:13px">Funds held in protection</span></div></div>
  `, 16)}
  <div class="sticky abovenav"><div class="btn2">Message ${WORKER.name}</div></div>${nav('')}`;

/** Finished work (screens/ApproveOrDisputeScreen.tsx on the FormScreen template): the held payment, what the worker submitted, Approve & release with Report an issue beside it. */
const approve = () => `
  <div class="body" style="gap:0">${header2('Finished work', DETAIL.title)}</div>
  ${scroller(116, 214, 0, `
    ${payCard('Held payment', PAY.total, 'Approving sends this payment on its way to the worker. If something isn’t right, report the issue instead — release waits while a report is open.')}
    <div class="stack" style="gap:10px"><span class="sect">What the worker submitted</span><div style="display:flex;gap:10px"><div class="thumb" style="width:118px;height:118px">${photo()}</div></div></div>
  `, 18)}
  <div class="sticky abovenav" style="display:flex;flex-direction:column;gap:10px"><div class="cta">Approve &amp; release ${PAY.total}</div><div class="btn2" style="height:46px;font-size:15px">Report an issue</div></div>${nav('')}`;

/** Review & tip (screens/ReviewAndTipScreen.tsx): the released payment, the review form (components/ReviewSection.tsx), the tip presets. Scrolls: two frames. */
const reviewTip = (scroll = 0) => `
  <div class="body" style="gap:0">${header2('Review &amp; tip', DETAIL.title)}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:4px"><span class="eyebrow">Payment released</span><span class="money" style="font-size:26px;line-height:30px">${PAY.agreed}</span><span class="muted" style="font-size:13px">Released to the worker</span><p class="muted" style="font-size:13px;line-height:18px;margin-top:4px">Released on your approval.</p></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:14px"><div class="h2 serif" style="font-size:22px;line-height:26px">How was ${WORKER.first}’s work?</div>
      <div class="stars">${[1, 2, 3, 4, 5].map(() => ic('i-star')).join('')}</div>
      <span class="lbl" style="font-size:15px">Would you hire ${WORKER.first} again?</span><div style="display:flex;gap:8px"><span class="chip f" style="height:38px;border-radius:19px;padding:0 22px;font-size:14px">Yes</span><span class="chip f" style="height:38px;border-radius:19px;padding:0 22px;font-size:14px">No</span></div>
      ${fld('Comment (optional)', `Share how it went with ${WORKER.name}…`, { hint: '0/500', ph: true, multi: true })}
      <div class="btn2" style="height:46px;font-size:15px">${ic('i-images')}Add photos</div><div class="cta">Submit review</div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><span class="sect">Add a tip?</span><span class="muted" style="font-size:14px;line-height:20px">Entirely optional — every cent of the tip goes to ${WORKER.name}.</span><div style="display:flex;gap:8px">${['$5', '$10', '$20', 'Other'].map((t) => `<span class="chip f" style="flex:1;justify-content:center;height:40px;border-radius:20px;font-size:15px">${t}</span>`).join('')}</div></div>
  `, 16)}${nav('')}`;

/** Jobs in this zone (screens/CellJobsScreen.tsx): the cell's open jobs as the browse card (components/BrowseJobCard.tsx). Scrolls: two frames. */
const cell = (scroll = 0) => `
  <div class="body" style="gap:0">${header2('Jobs in this zone', '4 open jobs nearby')}</div>
  ${scroller(116, 84, scroll, JOBS.map((j, i) => `<div class="card jobrow"><div class="thumb">${i === 2 ? `${photo()}` : ic(j.icon)}</div><div class="stack" style="flex:1;gap:6px;min-width:0"><div class="between" style="align-items:flex-start"><span class="chip">${j.cat}</span><div class="stack" style="gap:0;align-items:flex-end"><span class="eyebrow" style="font-size:9.5px">Est. pay</span><span class="money" style="font-size:22px;line-height:24px">${j.pay}</span></div></div><span class="title lines2">${j.title}</span><span class="meta">${ic('i-pin')}${j.hood} · ${j.when} · ${j.bids}</span></div></div>`).join(''), 14)}${nav('')}`;

/** The customer's map (screens/MapScreen.tsx, customer mode): the tiles, the search pill, the locate control, the hotspot glows, the tapped cell's card. */
const cmap = async () => {
  const tiles = await mapLayer();
  const cells = [[40.6415, -73.9330, 'East Flatbush'], [40.6860, -73.9440, 'Bed-Stuy'], [40.6690, -73.9440, 'Crown Heights'], [40.6770, -73.9670, 'Prospect Heights']].map(([lat, lng]) => mapPoint(lat, lng));
  return `<style>${tiles.css}</style><div class="map">${tiles.html}${cells.map((p) => `<div class="heat" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px"></div>`).join('')}<div style="position:absolute;left:0;right:0;top:0;height:120px;background:linear-gradient(180deg,rgba(6,36,33,.75),rgba(6,36,33,0))"></div></div>
  <div style="position:absolute;left:20px;right:20px;top:64px" class="field">${ic('i-search')}<span style="flex:1;color:var(--ink)">Explore nearby jobs</span>${ic('i-mic')}</div>
  <div class="circle" style="position:absolute;right:20px;top:134px">${ic('i-send')}</div>
  <span class="legal" style="bottom:${84 + 20 + 150 + 8}px">Legal</span>
  <div class="card" style="position:absolute;left:20px;right:20px;bottom:${84 + 20}px;padding:18px;display:flex;flex-direction:column;gap:8px"><div class="between"><span class="title" style="display:flex;align-items:center;gap:8px"><i style="width:10px;height:10px;border-radius:5px;background:#4FA8E8;display:inline-block"></i>1 open job</span>${icS('i-close', 20, 'var(--muted)')}</div><span class="muted" style="font-size:14px">Dog walking</span><div class="cta" style="margin-top:4px">View 1 job</div></div>
  ${nav('')}`;
};

// ---------------------------------------------------------------------------
// BATCH 3 — worker (SCREENS.md). The worker's side of the same sample job.
// ---------------------------------------------------------------------------
const CLIENT = 'Mahmudur Rahman';
/** The Filters sheet (components/JobFilterSheet.tsx) over Available Jobs; `pop` names the popup open over it, if any. */
const filters = (pop = '') => {
  const section = (label, pills, note = '', scroll = false) => `<div class="stack" style="gap:8px"><span class="eyebrow" style="color:var(--muted)">${label}</span>${scroll ? `<div class="hrow" style="gap:6px;margin:0 -20px;padding:0 20px">${pills}</div>` : `<div class="fillrow">${pills}</div>`}${note ? `<span class="muted" style="font-size:12px;line-height:16px">${note}</span>` : ''}</div>`;
  const pill = (l, on = false, cls = '') => `<span class="chip f${on ? ' on' : ''}${cls ? ' ' + cls : ''}">${l}</span>`;
  const popup = pop === 'distance'
    ? `<div class="pop" style="right:20px;top:411px">${['4 mi', '5 mi', '6 mi', '7 mi', '8 mi'].map((v, i) => `<div class="r${i === 1 ? ' on' : ''}"><span class="tk">${i === 1 ? ic('i-check') : ''}</span><span class="c">${v}</span></div>`).join('')}</div>`
    : pop === 'budget'
      ? `<div class="pop" style="right:20px;top:482px">${['$40', '$45', '$50', '$60', '$70'].map((v, i) => `<div class="r${i === 2 ? ' on' : ''}"><span class="tk">${i === 2 ? ic('i-check') : ''}</span><span class="c">${v}</span></div>`).join('')}</div>`
      : pop === 'date'
        ? `<div class="pop" style="right:20px;top:299px;width:192px">${[['Wed, Sep 23', 23], ['Thu, Sep 24', 24], ['Fri, Sep 25', 25], ['Sat, Sep 26', 26], ['Sun, Sep 27', 27]].map(([v, d], i) => `<div class="r${i === 3 ? ' on' : ''}"><span class="tk">${i === 3 ? ic('i-check') : ''}</span><span class="cal">${d}</span><span class="c" style="padding-right:0;text-align:left">${v}</span></div>`).join('')}</div>`
        : pop === 'sort'
          ? `<div class="pop" style="left:20px;bottom:153px;width:262px">${[['Smart Match', 'Matches based on your skills', true], ['Newest', 'Earliest jobs first'], ['Highest budget', 'Best pay first'], ['Distance', 'Least travel first'], ['Fewest bids', 'Least competition, then closest'], ['Reset', 'Latest added first', false, true]].map(([l, h, on, muted]) => `<div class="r${on ? ' on' : ''}${muted ? ' muted' : ''}" style="height:52px"><span class="tk">${on ? ic('i-check') : ''}</span><div class="stack" style="gap:1px"><span class="l" style="font-size:15px">${l}</span><span class="h">${h}</span></div></div>`).join('')}</div>`
          : '';
  return `${jobs()}<div class="scrim"></div>
  <div class="sheet" style="padding:10px 20px 0;gap:0"><div class="grab"></div><div class="h2 serif" style="font-size:24px;line-height:28px;margin-bottom:16px">Filters</div>
    <div class="stack" style="gap:16px;flex:1;min-height:0">
      ${section('Distance', pill('Any', true, 'wide') + ['2 mi', '5 mi', '10 mi', '25 mi'].map((l) => pill(l)).join('') + pill(pop === 'distance' ? '5 mi' : 'Custom', pop === 'distance'))}
      ${section('Minimum budget', pill('Any', pop !== 'budget', 'wide') + ['$25', '$50', '$100', '$250'].map((l) => pill(l)).join('') + pill(pop === 'budget' ? '$50' : 'Custom', pop === 'budget'), 'Jobs with no budget set are always shown.')}
      ${section('When', pill('Any', pop !== 'date', 'wide') + ['Today', 'Tomorrow', 'This week'].map((l) => pill(l)).join('') + pill(pop === 'date' ? 'Sep 26' : 'Custom', pop === 'date'))}
      ${section('Categories', pill(`${icS('i-check', 15, 'var(--acc)')}Best Match`) + ['Assembly', 'Moving', 'Cleaning', 'TV mounting', 'Handyman / Repairs', 'Yard work', 'Painting', 'Packing', 'Pet care', 'Errands', 'Other'].map((l) => pill(l)).join(''), 'Nothing selected means every category.', true)}
      <div class="stack" style="gap:8px"><span class="eyebrow" style="color:var(--muted)">Sort</span><div><span class="chip f on" style="background:rgba(126,226,180,.14);color:var(--acc);border-color:rgba(126,226,180,.45)"><span style="color:var(--muted);font-weight:600">Sort by</span>&nbsp;Smart Match${icS('i-chev', 14, 'var(--acc)')}</span></div></div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;padding:14px 0 34px;border-top:1px solid rgba(200,255,230,.10);margin-top:14px"><span class="muted" style="font-size:15px;font-weight:600;width:64px">Reset</span><div class="cta" style="flex:1">Show 4 jobs</div></div></div>${popup}<div class="home-bar"></div>`;
};

/** Submit a bid (screens/SubmitBidScreen.tsx over components/OfferComposer.tsx, bid mode): the context, the amount, the take, the pitch, the availability chips, the consequence, Send. Scrolls: two frames. */
const submit = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Submit a bid')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:6px"><span class="eyebrow">You’re bidding on</span><div class="h2 serif" style="font-size:22px;line-height:26px">${DETAIL.title}</div><span class="muted" style="font-size:13px">${POST.cat} · ${DETAIL.hood}</span><span style="font-size:14px;font-weight:700;color:var(--ink);margin-top:4px">Customer’s budget: <span class="money">${DETAIL.pay}</span></span></div>
    <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">${fld('Your bid (USD)', '110')}<span class="muted" style="font-size:13px;margin-top:-4px">You receive <span class="money">$101.75</span> after the fee</span>${fld('Pitch', BIDS[0].pitch, { multi: true })}</div>
    <div class="stack" style="gap:10px"><span class="lbl">When can you start</span><div class="wrap">${chipF('Today', '')}${chipF('Tomorrow', '')}${chipF('Pick a day', '')}</div></div>
    <div class="stack" style="gap:10px"><span class="lbl">How long</span><div class="wrap">${['Under 1h', '1-2h', '2-4h', '4h+'].map((l) => chipF(l, '', l === '2-4h')).join('')}</div></div>
    <div style="display:flex;gap:10px;align-items:flex-start">${icS('i-alert', 18, 'var(--muted)')}<span class="muted" style="font-size:13px;line-height:19px">Sends your bid to the customer. You can withdraw it any time before it’s accepted, and it expires on its own after 7 days.</span></div>
    <div class="cta">Send bid</div>
  `, 16)}${workerNav('Home')}`;

/** Bid sent (screens/BidSentScreen.tsx on the SuccessScreen template): the mark, the receipt, the two actions. */
const bidSent = () => `
  <div class="body" style="gap:18px;align-items:center;text-align:center;top:84px">
    <div class="mark">${ic('i-check')}</div>
    <div class="stack" style="gap:8px;align-items:center"><div class="h1 serif" style="font-size:30px;line-height:34px">Bid sent</div><p class="muted" style="font-size:15px;line-height:21px;max-width:330px">The customer can now compare your bid with others and open your profile from it. You’ll hear the moment they respond.</p></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:6px;align-self:stretch"><span class="muted lines2" style="font-size:14px;line-height:19px">${DETAIL.title}</span><span class="money" style="font-size:34px;line-height:38px">${BIDS[0].amount}</span><p class="muted" style="font-size:13px;line-height:18px;margin-top:4px">You can withdraw this bid from the job screen any time before it’s accepted. If the customer doesn’t respond within 7 days it expires on its own.</p></div>
    <div class="stack" style="gap:10px;align-self:stretch"><div class="cta">View in My Jobs</div><div class="btn2">Keep browsing</div></div>
  </div>${workerNav('Home')}`;

/** Your Job (screens/WorkerJobScreen.tsx), assigned: the job, the progress, the protected payment with its breakdown, Message, the arrival card, Start job. Scrolls: three frames. */
const wjob = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Your Job')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><div style="display:flex;gap:12px;align-items:flex-start"><div class="well sm" style="width:44px;height:44px;border-radius:22px">${ic('i-wrench')}</div><div class="stack" style="gap:3px;flex:1;min-width:0"><span class="title lines2">${DETAIL.title}</span><span class="muted" style="font-size:13px">${POST.cat} · ${DETAIL.hood}</span></div><span class="chip">Assigned</span></div><div class="divider"></div><div class="between"><span class="money" style="font-size:26px">${PAY.agreed}</span><span class="muted" style="font-size:14px">for ${CLIENT}</span></div></div>
    <div class="card" style="padding:18px 18px 14px"><div class="steps" style="gap:10px">${[['Assigned', 'done on'], ['In progress', ''], ['Completed', '']].map(([l, s]) => `<div class="st ${s}"><i></i><span style="font-size:12px">${l}</span></div>`).join('')}</div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:6px;position:relative"><div style="position:absolute;right:16px;top:16px" class="well">${ic('i-shield')}</div><span class="eyebrow">Payment protected</span><span class="money" style="font-size:28px;line-height:32px">$101.75</span><span class="muted" style="font-size:13px">Funds held in protection</span><p class="muted" style="font-size:14px;line-height:20px;margin-top:6px">${CLIENT} placed the funds in protection. They’re released only after the finished work is approved.</p><div class="card2" style="padding:4px 14px;margin-top:8px;border-radius:16px">${kv('Customer paid', PAY.total)}${kv('Brazos Protection', '$16.50')}${kv('You receive', '$101.75', 'total money')}</div></div>
    <div class="btn2">${ic('i-chat')}Message ${CLIENT}</div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><div class="h2 serif" style="font-size:22px;line-height:26px">Confirmed</div><p class="muted" style="font-size:14px;line-height:20px">Let ${CLIENT} know you’re on the way and when you arrive — two simple status taps, no location tracking.</p><div class="btn2" style="height:46px;font-size:15px">Route &amp; arrival</div><div class="btn2" style="height:46px;font-size:15px">Work checklist</div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><div class="h2 serif" style="font-size:22px;line-height:26px">Ready to start?</div><p class="muted" style="font-size:14px;line-height:20px">Mark the job in progress when you begin the work.</p><div class="cta">Start job</div></div>
  `, 16)}${workerNav('My Jobs')}`;

/** Work checklist (screens/WorkChecklistScreen.tsx on the FormScreen template): the count, the steps with their boxes and removes, the new-step field and Add step pinned. */
const checklist = () => `
  <div class="body" style="gap:0">${header2('Work checklist', DETAIL.title)}</div>
  ${scroller(116, 214, 0, `
    <span class="sect">2 of 4 done</span>
    <div class="card list">${[['Unbox both pieces and check the parts list', true], ['Assemble the sofa frame', true], ['Fit the cushions and level the feet', false], ['Take the packaging down to the van', false]].map(([l, d]) => `<div class="row" style="padding:14px 16px;gap:12px"><div class="cb${d ? ' on' : ''}">${d ? ic('i-check') : ''}</div><span style="flex:1;font-size:15px;line-height:20px;color:var(--ink)" class="${d ? 'strike' : ''}">${l}</span>${icS('i-close', 18, 'var(--muted)')}</div>`).join('')}</div>
  `, 14)}
  <div class="sticky abovenav" style="display:flex;flex-direction:column;gap:10px"><div class="in ph" style="min-height:48px;padding:12px 16px"><span>e.g. Mow the back yard</span></div><div class="cta" style="opacity:.55;box-shadow:none">Add step</div></div>${workerNav('My Jobs')}`;

/** Route & arrival (screens/RouteArrivalScreen.tsx): where things stand, getting there, the two declarations, I’m on my way pinned. */
const route = () => `
  <div class="body" style="gap:0">${header2('Route &amp; arrival', DETAIL.title)}</div>
  ${scroller(116, 160, 0, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:6px"><span class="eyebrow">Where things stand</span><div class="h2 serif" style="font-size:24px;line-height:28px">Confirmed</div><p class="muted" style="font-size:14px;line-height:20px">Your status updates are simple declarations — nothing tracks your location. The customer sees exactly the two taps below, nothing more.</p></div>
    <div class="stack" style="gap:10px"><span class="sect">Getting there</span><div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:14px"><div style="display:flex;gap:12px;align-items:flex-start">${icS('i-pin', 20, 'var(--acc)')}<div class="stack" style="gap:2px"><span style="font-size:15px;color:var(--ink)">2410 Emmons Ave, Apt 3B</span><span class="muted" style="font-size:12px;line-height:16px">Exact address — shared with you because you were hired.</span></div></div><div style="display:flex;gap:12px;align-items:flex-start">${icS('i-clock', 20, 'var(--acc)')}<div class="stack" style="gap:2px"><span style="font-size:15px;color:var(--ink)">${POST.timing}</span><span class="muted" style="font-size:12px;line-height:16px">The arrival window the customer asked for.</span></div></div></div></div>
    <div class="stack" style="gap:10px"><span class="sect">Your status</span><div class="card list">${['On my way', 'Arrived'].map((l) => `<div class="row" style="padding:14px 16px;gap:12px"><div class="cb"></div><span style="flex:1;font-size:16px;font-weight:600;color:var(--ink)">${l}</span></div>`).join('')}</div></div>
  `, 16)}
  <div class="sticky abovenav"><div class="cta">I’m on my way</div></div>${workerNav('My Jobs')}`;

/** The worker's map (screens/MapScreen.tsx, worker mode, over the approved map design): the pill with its distance control, the Today chip, the jobs sheet peeking on the bar. */
const wmap = async () => {
  const tiles = await mapLayer();
  const cells = [[40.6415, -73.9330], [40.6860, -73.9440], [40.6690, -73.9440], [40.6770, -73.9670]].map(([lat, lng]) => mapPoint(lat, lng));
  const j = JOBS[0];
  return `<style>${tiles.css}</style><div class="map">${tiles.html}${cells.map((p) => `<div class="heat" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px"></div>`).join('')}<div style="position:absolute;left:0;right:0;top:0;height:120px;background:linear-gradient(180deg,rgba(6,36,33,.75),rgba(6,36,33,0))"></div></div>
  <div style="position:absolute;left:20px;right:20px;top:64px;padding-right:8px" class="field">${ic('i-search')}<span style="flex:1;color:var(--ink)">Explore nearby jobs</span>${ic('i-mic')}<span class="chip f" style="height:36px;border-radius:18px">${ic('i-sliders')}Any</span></div>
  <div style="position:absolute;left:20px;top:130px"><span class="chip f" style="height:36px;border-radius:18px;background:rgba(9,36,31,.8);backdrop-filter:blur(12px)">${ic('i-calendar')}Today</span></div>
  <span class="legal" style="bottom:${84 + 174 + 8}px">Legal</span>
  <div class="card" style="position:absolute;left:12px;right:12px;bottom:84px;border-radius:22px 22px 0 0;border-bottom:0;padding:8px 16px 12px;display:flex;flex-direction:column;gap:10px"><div class="grab" style="margin-bottom:2px"></div><div class="between"><div class="stack" style="gap:2px"><span class="h2 serif" style="font-size:22px;line-height:26px">4 open jobs</span><span class="muted" style="font-size:13px">Near you · Any distance</span></div><span class="link" style="display:flex;align-items:center;gap:2px">View${icS('i-chev', 18, 'var(--acc)')}</span></div>
    <div class="card2 jobrow" style="padding:10px;gap:12px;border-radius:16px"><div class="thumb" style="width:64px;height:64px">${ic(j.icon)}</div><div class="stack" style="flex:1;gap:4px;min-width:0"><span class="title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${j.title}</span><span class="meta"><span class="chip" style="height:22px;font-size:11px">${j.cat}</span>${j.when}</span><span class="meta">${ic('i-pin')}${j.hood}</span></div><div class="stack" style="gap:0;align-items:flex-end"><span class="eyebrow" style="font-size:9.5px">Est. pay</span><span class="money" style="font-size:20px;line-height:22px">${j.pay}</span></div></div></div>
  ${workerNav('Map')}`;
};

/** My Jobs (screens/MyJobsHubScreen.tsx), the worker's Active tab: the job you're working and your pending bid. */
const wmyjobs = () => `
  <div class="body" style="gap:0"><div style="display:flex;gap:14px;align-items:center"><div class="well" style="width:48px;height:48px;border-radius:16px">${ic('i-briefcase')}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="eyebrow">Your work</span><div class="h2 serif" style="font-size:26px;line-height:30px">My jobs</div><span class="muted" style="font-size:13px;line-height:17px">Work you accepted and bids awaiting a response.</span></div></div></div>
  ${scroller(150, 84, 0, `
    <div class="seg3"><div class="o on">Active</div><div class="o">Review</div><div class="o">Closed</div></div>
    <div class="stack" style="gap:12px"><div style="display:flex;align-items:center;gap:8px"><span class="sect">You’re working</span><span class="badge">1</span></div>
      <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><div class="between"><span class="chip">Assigned</span><span class="muted" style="font-size:12px">2h ago</span></div><div style="display:flex;gap:12px;align-items:center"><div class="thumb" style="width:56px;height:56px">${photo()}</div><div class="stack" style="gap:3px;flex:1;min-width:0"><span class="title lines2">${DETAIL.title}</span><span class="muted" style="font-size:13px">${POST.cat} · ${DETAIL.hood}</span><span class="muted" style="font-size:13px">Client · ${CLIENT}</span></div></div><div class="between" style="align-items:flex-end"><span class="money" style="font-size:20px">${PAY.agreed}</span><div class="stack" style="gap:2px;align-items:flex-end"><span class="link" style="font-size:13px;display:flex;align-items:center;gap:4px">${icS('i-arrow', 14, 'var(--acc)')}Mark en route when you head out</span><span class="muted" style="font-size:12px">View details</span></div></div></div></div>
    <div class="stack" style="gap:12px"><div style="display:flex;align-items:center;gap:8px"><span class="sect">Pending bids</span><span class="badge">1</span></div>
      <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><div class="between"><span class="chip">Pending</span><span class="muted" style="font-size:12px">${JOBS[1].age}</span></div><div style="display:flex;gap:12px;align-items:center"><div class="thumb" style="width:56px;height:56px">${ic(JOBS[1].icon)}</div><div class="stack" style="gap:3px;flex:1;min-width:0"><span class="title lines2">${JOBS[1].title}</span><span class="muted" style="font-size:13px">${JOBS[1].cat} · ${JOBS[1].hood}, Brooklyn, NY</span><span class="muted" style="font-size:13px">Client · ${CLIENT}</span></div></div><div class="between" style="align-items:flex-end"><div class="stack" style="gap:0"><span class="muted" style="font-size:11px">Your bid:</span><span class="money" style="font-size:20px">$95</span></div><div class="stack" style="gap:2px;align-items:flex-end"><span class="link" style="font-size:13px;display:flex;align-items:center;gap:4px">${icS('i-arrow', 14, 'var(--acc)')}Awaiting response</span><span class="muted" style="font-size:12px">View details</span></div></div></div></div>
  `, 16)}${workerNav('My Jobs')}`;

/** Earnings (screens/EarningsScreen.tsx): the three buckets, the fee line, the ledger, the payouts CTA pinned — every figure a sum over the one sample row. */
const earnings = () => `
  <div class="body" style="gap:0">${header2('Earnings', 'Every figure is a sum over your ledger rows')}</div>
  ${scroller(116, 160, 0, `
    <div style="display:flex;gap:8px">${[['i-shield', 'Pending', '$101.75', 'Held in protection'], ['i-card', 'Available', '$0.00', 'Released to you'], ['i-share', 'Transferred', '$0.00', 'Transferred to you']].map(([i, k, a, n]) => `<div class="card bucket"><div class="well sm" style="width:28px;height:28px;border-radius:14px">${icS(i, 14, 'var(--acc)')}</div><span class="k">${k}</span><span class="amt">${a}</span><span class="n">${n}</span></div>`).join('')}</div>
    <div style="display:flex;gap:10px;align-items:flex-start">${icS('i-images', 16, 'var(--muted)')}<span class="muted" style="font-size:13px;line-height:18px">Platform fees on these rows: $8.25. Every figure here is a sum over the ledger rows below, nothing else.</span></div>
    <div class="stack" style="gap:10px"><span class="sect">Ledger</span><div class="card" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div class="stack" style="gap:3px;flex:1;min-width:0"><span class="title" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${DETAIL.title}</span><span class="muted" style="font-size:12px">Approved — payout on its way</span></div><span class="money" style="font-size:18px;white-space:nowrap">$101.75</span></div></div>
  `, 16)}
  <div class="sticky abovenav"><div class="cta">Set up payouts${icS('i-chev', 18, 'var(--accInk)')}</div></div>${workerNav('Profile')}`;

/** Payouts (screens/PayoutsScreen.tsx), status none: the state, the waiting notice, how payouts work, Set up payouts pinned; Refresh in the header. */
const payouts = () => `
  <div class="body" style="gap:0"><div class="hdr"><div class="circle">${ic('i-back')}</div><div class="stack" style="gap:0;flex:1;min-width:0"><div class="t serif" style="font-size:24px;line-height:28px">Payouts</div><span class="sub">Where approved payments land</span></div><div class="circle">${ic('i-swap')}</div></div></div>
  ${scroller(116, 160, 0, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:12px;align-items:center"><div class="well sm">${ic('i-card')}</div><div class="stack" style="gap:2px"><span class="eyebrow">Payout status</span><span class="title">Payouts aren’t set up yet</span></div></div><p class="muted" style="font-size:14px;line-height:20px">Set up payouts to receive what you earn. It’s a short setup in your browser, and you’re brought back here when it’s done.</p></div>
    <div class="card" style="padding:14px 16px;display:flex;gap:10px;align-items:flex-start">${icS('i-alert', 18, 'var(--muted)')}<span class="muted" style="font-size:13px;line-height:18px">An approved payment is waiting on your payout setup before it can be sent to you.</span></div>
    <div class="stack" style="gap:10px"><span class="sect">How payouts work</span><div class="card" style="padding:14px 18px;display:flex;flex-direction:column;gap:12px">${[['i-share', 'Set up once', 'a short setup with the payment provider, in your browser. You come straight back here when it’s done.'], ['i-checkcircle', 'Approved payments transfer on their own', 'when a customer approves your finished work, the payment is released and transferred to you on the provider’s schedule.'], ['i-card', 'No cash-out step', 'there is nothing to trigger. Earnings shows each payment as held, released and transferred as it happens.']].map(([i, s, t]) => `<div style="display:flex;gap:12px;align-items:flex-start">${icS(i, 20, 'var(--acc)')}<p class="muted" style="font-size:13px;line-height:18px"><b style="color:var(--ink)">${s}</b> — ${t}</p></div>`).join('')}</div></div>
  `, 16)}
  <div class="sticky abovenav"><div class="cta">Set up payouts</div></div>${workerNav('Profile')}`;

/** Services & availability (screens/ServicesPricingScreen.tsx): the toggle and its note, your services, Add a service with its price mode and category pills. Scrolls: two frames. */
const pricing = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Services &amp; availability')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><div style="display:flex;gap:12px;align-items:flex-start"><div class="stack" style="gap:4px;flex:1"><div class="h2 serif" style="font-size:22px;line-height:26px">Taking new work</div><span class="muted" style="font-size:13px;line-height:18px">Shown on your public profile. Turning it off doesn’t block offers — it just tells customers what to expect.</span></div><div class="switch on"><i></i></div></div><div class="in" style="min-height:48px;padding:12px 16px;font-size:15px"><span style="flex:1">${WORKER.note}</span></div></div>
    <div class="stack" style="gap:10px"><span class="sect">Your services</span><div class="card list">${[['Flat-pack furniture assembly', 'Furniture Assembly · $60 flat'], ['TV mounting', 'TV/Furniture Mounting · $45/hr']].map(([t, m]) => `<div class="row" style="padding:12px 16px;gap:12px"><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t}</span><span class="muted" style="font-size:12px">${m}</span></div>${icS('i-eyeoff', 20, 'var(--acc)')}${icS('i-close', 20, 'var(--muted)')}</div>`).join('')}</div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><div class="h2 serif" style="font-size:22px;line-height:26px">Add a service</div><div class="in ph" style="min-height:48px;padding:12px 16px;font-size:15px"><span>e.g. Standard lawn mow &amp; edge</span></div><div class="seg2"><div class="o on">Flat price</div><div class="o">Ask me</div></div><div style="display:flex;gap:8px"><div class="in ph" style="flex:1;min-height:48px;padding:12px 16px;font-size:15px"><span>Price in dollars</span></div><span class="chip f" style="height:48px;border-radius:16px;padding:0 16px;font-size:14px">flat</span></div>
      <div class="wrap">${POSTABLE.map(([l]) => chipF(l, '', l === POST.cat)).join('')}</div>
      <div class="btn2 off">Add service</div></div>
  `, 16)}${workerNav('Profile')}`;

// ---------------------------------------------------------------------------
// BATCH 4 — messaging (SCREENS.md). The one conversation the sample job opened.
// ---------------------------------------------------------------------------
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ticks = (read) => `<span class="tk">${icS('i-check', 14, read ? 'var(--gold)' : 'var(--muted)')}${read ? icS('i-check', 14, 'var(--gold)') : ''}</span>`;
/** One conversation row (components/ConversationRow.tsx): the face, the job line, the name, the preview, the age, the unread dot. */
const convoRow = (unread = true) => `<div class="card" style="padding:12px 14px;display:flex;gap:12px;align-items:center"><div class="avatar" style="width:52px;height:52px;border-radius:26px;font-size:18px;border-width:1.5px">${WORKER.initials}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${DETAIL.title}</span><span class="title" style="font-size:16px">${WORKER.name}</span><span style="font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">On my way — 15 minutes out.</span></div><div class="stack" style="gap:6px;align-items:flex-end"><span class="muted" style="font-size:12px">20m</span>${unread ? '<div class="dot" style="margin-top:0"></div>' : ''}</div></div>`;
/** Messages (screens/MessagesInboxScreen.tsx): the filter pills, the one conversation, the Hidden Chats row. */
const inbox = () => `
  <div class="body" style="gap:16px">
    <div class="h2 serif" style="font-size:30px;line-height:34px">Messages</div>
    <div class="pillrow hrow" style="margin:0 -20px;padding:0 20px;gap:8px">${['All', 'Unread', 'Archived', 'Requests', 'Support'].map((l, i) => `<span class="p${i === 0 ? ' on' : ''}">${l}</span>`).join('')}</div>
    ${convoRow()}
    <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:8px">${icS('i-lock', 16, 'var(--muted)')}<span class="muted" style="font-size:14px;font-weight:600">Hidden Chats</span></div>
  </div>${nav('Inbox')}`;

/** The chat's header: the face, the serif name, the job under it, the overflow dots. */
const chatHeader = () => `<div class="hdr"><div class="circle">${ic('i-back')}</div><div class="avatar" style="width:34px;height:34px;border-radius:17px;font-size:13px;border-width:1.5px">${WORKER.initials}</div><div class="stack" style="gap:0;flex:1;min-width:0"><div class="t serif" style="font-size:22px;line-height:26px">${WORKER.name}</div><span class="sub">${DETAIL.title}</span></div>${icS('i-dots', 22, 'var(--acc)')}</div>`;
/** The thread: the accepted offer's event card, then text, a photo, a voice note, a document, a live location, each in its bubble. */
const thread = () => `
    <div class="jobdiv"><i></i><span>${DETAIL.title}</span><i></i></div>
    <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:6px;align-self:stretch"><span class="eyebrow">Offer accepted</span><div class="between"><span class="title" style="font-size:15px">${DETAIL.title}</span><span class="money" style="font-size:20px">${PAY.agreed}</span></div><span class="muted" style="font-size:12px">2h ago</span><span class="muted" style="font-size:13px;line-height:18px">This job is now assigned and has moved into your job timeline.</span><span class="link" style="font-size:13px">Tap to view the job</span></div>
    <div class="bub them">Hi Mahmudur — confirming Saturday morning. I’ll bring a second Allen set.<div class="ft">9:12 AM</div></div>
    <div class="bub me">Perfect. The boxes are in the living room, buzzer is 3B.<div class="ft">9:14 AM ${ticks(true)}</div></div>
    <div class="bub them" style="padding:6px 6px 8px"><div class="thumb" style="width:200px;height:150px;border-radius:14px">${photo()}</div><div class="ft" style="padding-right:8px">9:20 AM</div></div>
    <div class="bub me" style="min-width:200px"><div style="display:flex;align-items:center;gap:10px"><div class="play">${PLAY}</div><div class="wave">${[6, 12, 18, 10, 22, 14, 8, 20, 16, 10, 24, 12, 6, 18, 10].map((h) => `<i style="height:${h}px"></i>`).join('')}</div><span class="muted" style="font-size:12px">0:12</span></div><div class="ft">9:21 AM ${ticks(false)}</div></div>
    <div class="bub them"><div class="doc"><div class="ico">${ic('i-images')}</div><div class="stack" style="gap:1px"><span style="font-size:14px;font-weight:600">parts-list.pdf</span><span class="muted" style="font-size:12px">240 KB</span></div></div><div class="ft">9:24 AM</div></div>
    <div class="card" style="padding:12px 14px;display:flex;gap:12px;align-items:center;align-self:flex-start;max-width:86%"><div class="well sm">${ic('i-send')}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title" style="font-size:15px">${WORKER.first}’s live location</span><span class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Flatbush · 40.6412, -73.9578</span></div><span class="chip">14m</span></div>`;
/** Chat (screens/ChatScreen.tsx with components/ChatComposer.tsx): scrolled to its end, the composer's three zones above the bar. */
const chat = (scroll = 0) => `
  <div class="body" style="gap:0">${chatHeader()}</div>
  ${scroller(116, 152, scroll, thread(), 10)}
  <div class="composer">${ic('i-plus')}<div class="in ph"><span>Message…</span></div>${ic('i-mic')}</div>${nav('Inbox')}`;

/** The three menus: the chat's overflow (components/DropMenu.tsx), the message long-press sheet, the inbox row's long-press sheet (components/ActionSheet.tsx). */
const chatMenu = (which = 'overflow') => which === 'overflow'
  ? `${chat(CHAT_END)}<div class="scrim" style="background:rgba(3,14,12,.35)"></div><div class="menu">${[['i-people', 'Hire Again'], ['i-staro', 'Rating / Reviews'], ['i-bookmark', 'Save Worker'], ['i-bell', 'Mute'], ['i-share', 'Share Profile'], ['i-person', 'View Profile']].map(([i, l]) => `<div class="r">${ic(i)}${l}</div>`).join('')}</div>`
  : which === 'message'
    ? `${chat(CHAT_END)}<div class="scrim"></div><div class="asheet"><div class="hd"><span class="title" style="font-size:15px">Message</span></div>${[['i-sparkles', 'React'], ['i-back', 'Reply'], ['i-images', 'Copy']].map(([i, l]) => `<div class="r">${ic(i)}${l}</div>`).join('')}<div class="r bad">${ic('i-close')}Unsend</div><div class="cancel">Cancel</div></div><div class="home-bar"></div>`
    : `${inbox()}<div class="scrim"></div><div class="asheet"><div class="hd"><div class="stack" style="gap:2px;align-items:center"><span class="title" style="font-size:16px">${WORKER.name}</span><span class="muted" style="font-size:13px">Manage this conversation</span></div></div>${[['i-bell', 'Mute'], ['i-alert', 'Block'], ['i-flash', 'Report'], ['i-dots', 'More']].map(([i, l]) => `<div class="r">${ic(i)}${l}</div>`).join('')}<div class="cancel">Cancel</div></div><div class="home-bar"></div>`;

/** Hidden Chats (screens/HiddenChatsScreen.tsx): unlocked for this visit, nothing hidden. */
const hidden = () => `
  <div class="body" style="gap:20px;bottom:100px">
    ${header2('Hidden Chats', 'Unlocked for this visit')}
    <div style="margin:auto 0">${emptyCard('i-lock', '', 'Nothing hidden', 'Conversations you mark as hidden appear here.')}</div>
  </div>${nav('Inbox')}`;

/** Notifications (screens/NotificationsScreen.tsx): the unread count, Mark all read, one row per real event. */
const feed = () => `
  <div class="body" style="gap:0"><div class="hdr"><div class="circle">${ic('i-back')}</div><div class="stack" style="gap:0;flex:1;min-width:0"><div class="t serif" style="font-size:24px;line-height:28px">Notifications</div><span class="sub">2 unread</span></div><span class="link">Mark all read</span></div></div>
  ${scroller(116, 84, 0, `<div class="card" style="padding:4px 0">${[['i-briefcase', `New bid on ${DETAIL.title}`, 'Sam Okafor bid $110.00', '2h ago', true], ['i-briefcase', `New bid on ${DETAIL.title}`, 'Priya Natarajan bid $120.00', '4h ago', true], ['i-chat', 'Sam Okafor', 'On my way — 15 minutes out.', '20m ago', false], ['i-checkcircle', 'Job marked complete', `Sam Okafor finished ${DETAIL.title}.`, '1d ago', false]].map(([i, t, b, m, u]) => `<div class="nrow"><div class="well sm">${ic(i)}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${u ? '' : 'font-weight:600'}">${t}</span><span class="muted lines2" style="font-size:13px;line-height:18px">${b}</span><span class="muted" style="font-size:12px">${m}</span></div>${u ? '<div class="dot"></div>' : ''}</div>`).join('')}</div>`, 14)}${nav('Profile')}`;

/** The Report dialog (components/ReportDialog.tsx) over Messages: the reasons, the detail, the block toggle, Send report beside Cancel. */
const report = () => `${inbox()}<div class="scrim"></div>
  <div class="card dialog" style="gap:12px;padding:20px"><div class="h2 serif" style="font-size:24px;line-height:28px">Report ${WORKER.name}</div><p class="muted" style="font-size:13px;line-height:18px;margin-top:-6px">This goes to the Brazos team. They won't be told who reported them.</p>
    <div class="stack" style="gap:2px">${['No-show', 'Unsafe', 'Harassment', 'Scam / non-payment', 'Other'].map((l, i) => `<div style="display:flex;align-items:center;gap:12px;height:38px"><div class="radio${i === 3 ? ' on' : ''}">${i === 3 ? '<i></i>' : ''}</div><span style="font-size:15px;color:var(--ink)">${l}</span></div>`).join('')}</div>
    ${fld('What happened? (optional)', 'Add any detail that would help us review this…', { ph: true, multi: true })}
    <div style="display:flex;gap:12px;align-items:flex-start"><div class="stack" style="gap:2px;flex:1"><span style="font-size:15px;font-weight:700;color:var(--ink)">Also block this person</span><span class="muted" style="font-size:12px;line-height:16px">They won't be able to message you. You can undo this later from the conversation.</span></div><div class="switch"><i></i></div></div>
    <div style="display:flex;gap:10px"><div class="cta" style="flex:1;height:48px;font-size:16px">Send report</div><div class="btn2" style="flex:1;height:48px;font-size:16px">Cancel</div></div></div>`;
const CHAT_END = 273;

// ---------------------------------------------------------------------------
// BATCH 5 — profile and settings (SCREENS.md). The operator's own account.
// ---------------------------------------------------------------------------
/** A settings row: the glyph in a well, the label and its sub-line, the chevron. */
const setRow = (icon, label, sub = '', trailing = '') => `<div class="row" style="padding:14px 16px;gap:12px"><div class="well sm">${ic(icon)}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title" style="font-size:16px">${label}</span>${sub ? `<span class="muted" style="font-size:13px;line-height:17px">${sub}</span>` : ''}</div>${trailing || icS('i-chev', 18, 'var(--muted)')}</div>`;
/** A checked line in a card (Payment methods, Delete account). */
const line = (t) => `<div style="display:flex;gap:10px;align-items:flex-start">${icS('i-checkcircle', 18, 'var(--acc)')}<span class="muted" style="font-size:14px;line-height:20px">${t}</span></div>`;

/** Profile details (screens/ProfileDetailsScreen.tsx): the identity, the shared-identity card with Edit profile, the categories, PROOF OF WORK. Scrolls: two frames. */
const details = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Profile')}</div>
  ${scroller(116, 84, scroll, `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center"><div class="avatar" style="width:96px;height:96px;border-radius:48px;font-size:32px">MR</div><div class="h2 serif" style="font-size:26px;line-height:30px">Mahmudur Rahman</div><span class="muted" style="font-size:14px">mdmahmudurrahman2@gmail.com</span><span class="muted" style="font-size:13px">Member since August 2026</span></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:14px"><div style="display:flex;gap:12px;align-items:center"><div class="well sm">${ic('i-person')}</div><div class="stack" style="gap:2px;flex:1"><span class="eyebrow">Shared identity</span><span class="title">Profile details</span></div><span class="chip f" style="height:32px">${ic('i-pencil')}Edit profile</span></div>
      <div class="list" style="margin:0 -18px">${[['i-person', 'Full name', 'Mahmudur Rahman'], ['i-chat', 'Phone number', 'Not set', true], ['i-window', 'Language', 'English'], ['i-images', 'Bio', 'No bio yet', true]].map(([i, k, v, m]) => `<div class="row" style="padding:10px 18px;gap:12px"><div class="well sm" style="width:30px;height:30px;border-radius:15px">${icS(i, 15, 'var(--acc)')}</div><span class="muted" style="font-size:14px;width:110px">${k}</span><span style="flex:1;text-align:right;font-size:14px;color:${m ? 'var(--muted)' : 'var(--ink)'};font-weight:600">${v}</span></div>`).join('')}</div>
      <div class="stack" style="gap:8px"><span class="eyebrow">Job categories</span><div class="wrap"><span class="chip">Furniture Assembly</span><span class="chip">TV/Furniture Mounting</span></div></div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:14px"><div style="display:flex;gap:12px;align-items:center"><div class="well sm">${ic('i-briefcase')}</div><div class="stack" style="gap:2px;flex:1"><span class="eyebrow">Proof of work</span><span class="title">Past work</span></div></div><div class="add" style="padding:16px;display:flex;gap:12px;align-items:center;justify-content:flex-start;text-align:left"><div class="well sm">${ic('i-image')}</div><span class="muted" style="font-size:14px;line-height:19px">Feature photos from jobs you’ve finished to show clients your work.</span></div></div>
  `, 16)}${nav('Profile')}`;

/** Account and safety (screens/AccountSafetyScreen.tsx): the hero, four rows, the safety principle, Log out, Delete account, the note. Scrolls: two frames. */
const safety = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Profile')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:8px;position:relative"><div style="position:absolute;right:18px;top:18px" class="well">${ic('i-shield')}</div><span class="eyebrow">Account &amp; safety</span><div class="h2 serif" style="font-size:26px;line-height:30px;padding-right:64px">Private by default.</div><span class="muted" style="font-size:14px;line-height:20px">Control payment, legal and account actions from one protected place.</span></div>
    <div class="card list">${setRow('i-card', 'Payment methods', 'No stored cards · entered at checkout.')}${setRow('i-moon', 'Appearance', 'Light, dark, or follow the system.')}${setRow('i-images', 'Terms of Service', 'Read the current agreement.')}${setRow('i-lock', 'Privacy Policy', 'How your data is protected.')}</div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:8px"><div class="well sm">${ic('i-shield')}</div><span class="eyebrow">Safety principle</span><div class="h2 serif" style="font-size:22px;line-height:26px">One identity, two modes.</div><span class="muted" style="font-size:14px;line-height:20px">Switching between customer and worker changes the dashboard — not your account, reviews or protected job history.</span></div>
    <div class="btn2">${ic('i-share')}Log out</div>
    <div class="btn2" style="color:#F0A0A0;border-color:rgba(240,160,160,.35)">${ic('i-trash')}Delete account</div>
    <div style="display:flex;gap:10px;align-items:flex-start">${icS('i-alert', 18, 'var(--muted)')}<span class="muted" style="font-size:13px;line-height:18px">Deletion is permanent. Active jobs and unsettled payments must be resolved first.</span></div>
  `, 16)}${nav('Profile')}`;

/** Notification settings (screens/NotificationSettingsScreen.tsx): the five switches, how far is nearby, the categories note, the footnote. Scrolls: two frames. */
const notif = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Notifications')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card list">${[['Messages', 'New messages in any conversation.'], ['Bids on my jobs', 'When someone bids on a job you posted, and when a rival bid lands on a job you bid on.'], ['Job updates', 'Assignments, completed work, and reviews you receive.'], ['Hire Again requests', 'Direct hire offers, counter-offers, and their outcomes.'], ['New jobs nearby', 'New jobs posted near you in the categories on your profile.']].map(([l, h]) => `<div class="row" style="padding:14px 16px;gap:12px;align-items:flex-start"><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title" style="font-size:16px">${l}</span><span class="muted" style="font-size:13px;line-height:17px">${h}</span></div><div class="switch on"><i></i></div></div>`).join('')}</div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><span class="sect">How far is “nearby”?</span><div class="seg3">${['1 mi', '3 mi', '5 mi', '10 mi'].map((l, i) => `<div class="o${i === 2 ? ' on' : ''}">${l}</div>`).join('')}</div><span class="muted" style="font-size:13px;line-height:18px">Measured from the location you last set here (not set yet).</span><span class="link" style="font-size:14px">Update my location</span><div class="stack" style="gap:6px;margin-top:4px"><span class="sect">Categories</span><span class="muted" style="font-size:13px;line-height:18px">You'll only be told about: Furniture Assembly, TV/Furniture Mounting. Change these under Job categories on your profile.</span></div></div>
    <span class="muted" style="font-size:12px;line-height:17px;padding:0 4px">Muted conversations and blocked users never send notifications, whatever these switches say.</span>
  `, 16)}${nav('Profile')}`;

/** Appearance (screens/AppearanceScreen.tsx): the theme choice, the design studio switch. */
const appearance = () => `
  <div class="body" style="gap:16px">
    ${header('Appearance')}
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px"><span class="eyebrow">Theme</span><div class="list" style="margin:0 -18px">${['System', 'Light', 'Dark'].map((l, i) => `<div class="row" style="padding:12px 18px;gap:12px"><div class="radio${i === 2 ? ' on' : ''}">${i === 2 ? '<i></i>' : ''}</div><span style="flex:1;font-size:16px;color:var(--ink)">${l}</span></div>`).join('')}</div></div>
    <div class="card" style="padding:16px 18px;display:flex;align-items:center;gap:12px"><div class="well sm">${ic('i-sliders')}</div><span class="title" style="flex:1;font-size:16px">Design studio</span><span class="muted" style="font-size:14px;font-weight:600">Off</span><div class="switch"><i></i></div></div>
  </div>${nav('Profile')}`;

/** Payment methods (screens/PaymentMethodsScreen.tsx, the card path): protection, the mode, the funding source. */
const payment = () => `
  <div class="body" style="gap:0">${header('Payment methods')}</div>
  ${scroller(116, 84, 0, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Payment protection</span><div class="h2 serif" style="font-size:26px;line-height:30px">Honest by design.</div><span class="muted" style="font-size:14px;line-height:20px">Your card is charged only when you protect a payment, and the funds stay held until you approve the finished work.</span></div>
    <div class="card" style="padding:16px 18px;display:flex;gap:12px;align-items:flex-start"><div class="well sm">${ic('i-card')}</div><div class="stack" style="gap:4px;flex:1"><span class="title">Card payments</span><span class="muted" style="font-size:13px;line-height:18px">Cards are taken through the provider’s secure payment sheet at checkout. Brazos never sees your card number.</span></div></div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Funding source</span><div class="h2 serif" style="font-size:22px;line-height:26px">No stored payment methods</div><span class="muted" style="font-size:14px;line-height:20px">Brazos doesn’t store your card. You enter it in the provider’s secure payment sheet at checkout, and any saved card lives with the provider, not in this app.</span></div>
  `, 16)}${nav('Profile')}`;

/** Saved & past workers (screens/SavedWorkersScreen.tsx): the leaf divider, the saved worker, the one who worked for you before. */
const saved = () => `
  <div class="body" style="gap:0">${header('Saved &amp; past workers')}</div>
  ${scroller(116, 84, 0, `
    <div style="display:flex;align-items:center;gap:12px;padding:0 20px"><i style="flex:1;height:1px;background:rgba(200,255,230,.12)"></i>${icS('i-leaf', 18, 'var(--acc)')}<i style="flex:1;height:1px;background:rgba(200,255,230,.12)"></i></div>
    <div class="stack" style="gap:10px"><span class="sect">Saved</span><div class="card" style="padding:12px 14px;display:flex;gap:12px;align-items:center"><div class="avatar" style="width:44px;height:44px;border-radius:22px;font-size:16px;border-width:1.5px">${WORKER2.initials}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title" style="font-size:16px">${WORKER2.name}</span><span class="muted" style="font-size:13px">No reviews yet</span></div><span class="chip f" style="height:34px;padding:0 16px">Hire</span>${icS('i-bookmark', 20, 'var(--acc)')}</div></div>
    <div class="stack" style="gap:10px"><span class="sect">Worked for you before</span><div class="card" style="padding:12px 14px;display:flex;gap:12px;align-items:center"><div class="avatar" style="width:44px;height:44px;border-radius:22px;font-size:16px;border-width:1.5px">${WORKER.initials}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="title" style="font-size:16px">${WORKER.name}</span><span class="muted" style="font-size:13px">No reviews yet</span></div><span class="chip f" style="height:34px;padding:0 16px">Hire</span></div></div>
  `, 16)}${nav('Profile')}`;

/** Delete account (screens/DeleteAccountScreen.tsx on the FormScreen template): what is removed, what is kept, the DELETE confirmation, the disabled destructive button. Scrolls: two frames. */
const del = (scroll = 0) => `
  <div class="body" style="gap:0">${header2('Delete account', 'Permanent. Please read this first.')}</div>
  ${scroller(116, 84, scroll, `
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><div class="h2 serif" style="font-size:22px;line-height:26px">What is removed</div>${['Your name, phone number, photo, bio and categories.', 'Your services, availability and portfolio.', 'Your saved workers, notification settings and this device’s push registration.', 'Your open job postings. Any job still taking offers is cancelled when the account is deleted — it does not stay on the marketplace without you.', 'Your sign-in. You will not be able to sign back in with this account.'].map(line).join('')}</div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><div class="h2 serif" style="font-size:22px;line-height:26px">What is kept, and why</div>${['Reviews you wrote and reviews you received stay on the marketplace. They are attributed to “Deleted user” — removing them would rewrite other people’s reputation.', 'Payment records are kept for tax and legal reasons, but they no longer identify you.', 'Messages and jobs stay in the other person’s history, under “Deleted user”.'].map(line).join('')}</div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><div class="h2 serif" style="font-size:22px;line-height:26px">Confirm</div><span class="muted" style="font-size:14px;line-height:20px">Type DELETE to enable the button below.</span>${fld('Type DELETE', 'DELETE', { ph: true })}</div>
    <div class="btn2 off" style="border-color:rgba(240,160,160,.2);color:rgba(240,160,160,.5)">${ic('i-trash')}Delete my account</div>
  `, 16)}${nav('Profile')}`;

/** A legal document (screens/LegalDocumentScreen.tsx): the Terms, read as Markdown, the version at the end. Scrolls: two frames. */
const legal = (scroll = 0) => `
  <div class="body" style="gap:0">${header('Terms of Service')}</div>
  ${scroller(116, 84, scroll, `
    <div class="h1 serif" style="font-size:28px;line-height:32px">Brazos Terms of Service</div>
    <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:6px;border-color:rgba(233,193,112,.35)"><span class="title" style="font-size:16px">⚠️ Working draft — pending legal review</span><span class="muted" style="font-size:13px;line-height:18px">This document is an unreviewed first draft written to get the product's obligations on paper. It is NOT final legal text, it has NOT been reviewed by a licensed attorney, and it should NOT be relied on as legal advice or as an enforceable agreement in its current form. It must be reviewed and revised by qualified counsel before Brazos is offered to the public.</span></div>
    <span class="muted" style="font-size:13px">Last updated: 26 July 2026</span>
    <div class="h2 serif" style="font-size:22px;line-height:26px">1. What Brazos is</div>
    <p style="font-size:15px;line-height:22px;color:var(--ink)">Brazos is a listing and communication platform. It lets people who need short-term local work done ("Clients") post jobs, and lets people willing to do that work ("Workers") find those jobs, bid on them, and message the Client about them. Many users are both at different times.</p>
    <p style="font-size:15px;line-height:22px;color:var(--ink)">Brazos provides the software. Brazos does not provide the services listed on it. Every job is an agreement between a Client and a Worker directly.</p>
    <div class="h2 serif" style="font-size:22px;line-height:26px">2. Who may use Brazos</div>
    <p style="font-size:15px;line-height:22px;color:var(--ink)">You must be at least 18 years old and legally able to enter into contracts where you live. You must provide accurate registration details, including a real name and a working phone number, and keep them accurate.</p>
    <p style="font-size:15px;line-height:22px;color:var(--ink)">One account per person. You are responsible for everything done through your account, and for keeping your password secure.</p>
    <span class="muted" style="font-size:12px">Version 2026-07-26-draft1</span>
  `, 14)}${nav('Profile')}`;

/** Admin reports (screens/AdminReportsScreen.tsx), the moderator's queue: one open report with its three actions. */
const admin = () => `
  <div class="body" style="gap:0">${header2('Reports', 'Moderation queue')}</div>
  ${scroller(116, 84, 0, `
    <div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px"><div class="between"><span class="title">${WORKER2.name}</span><span class="chip">Open</span></div><span class="muted" style="font-size:13px">Reported by ${CLIENT} · Scam / non-payment · 3h ago</span><span class="muted" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${JOBS[1].title}</span><p style="font-size:14px;line-height:20px;color:var(--ink)">“Asked to be paid outside the app before starting.”</p><div style="display:flex;gap:8px"><div class="btn2" style="flex:1;height:42px;font-size:14px;color:#F0A0A0;border-color:rgba(240,160,160,.35)">Ban user</div><div class="btn2" style="flex:1;height:42px;font-size:14px">Dismiss</div></div></div>
    ${emptyCard('i-shield', '', 'Nothing to review', 'New reports from users will show up here.')}
  `, 16)}${nav('Profile')}`;

/** Feature past work (components/PortfolioPicker.tsx): the grid of completion photos, then the detail step over it. */
const portfolio = (step = 'grid') => `
  <div class="body" style="gap:14px">
    <div class="between"><div class="h2 serif" style="font-size:26px;line-height:30px">Feature past work</div><div class="circle" style="width:36px;height:36px">${ic('i-close')}</div></div>
    <span class="muted" style="font-size:13px;line-height:18px"><b style="color:var(--ink)">0/20</b> featured · tap a photo to add it, tap a featured one (checkmark) to edit or remove it</span>
    <div style="display:flex;flex-wrap:wrap;gap:12px"><div class="stack" style="gap:4px;width:166px"><div class="thumb" style="width:166px;height:124px">${photo()}</div><span class="eyebrow" style="font-size:10px">Furniture Assembly</span><span class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${DETAIL.title}</span></div></div>
  </div>${step === 'detail' ? `<div class="scrim"></div><div class="sheet" style="padding:16px 20px 34px;gap:12px"><div class="between"><div class="h2 serif" style="font-size:22px;line-height:26px">Feature this photo</div>${icS('i-close', 22, 'var(--muted)')}</div><div class="thumb" style="width:100%;height:150px;border-radius:16px">${photo()}</div><span class="lbl">Category</span><div class="wrap">${POSTABLE.map(([l, i]) => chipF(l, i, l === POST.cat)).join('')}</div><span class="lbl">What did this job involve?</span><span class="muted" style="font-size:13px;line-height:18px;margin-top:-6px">A real sentence or two — this is what clients read to judge your work.</span><div class="in ph multi" style="min-height:72px"><span>e.g. Rebuilt a 20ft cedar fence panel by panel after storm damage, including new posts set in concrete.</span></div><span class="muted" style="font-size:12px;margin-top:-6px">10 more characters needed</span><div style="display:flex;gap:10px"><div class="btn2" style="flex:1;height:48px;font-size:15px">Cancel</div><div class="btn2 off" style="flex:1;height:48px;font-size:15px">Add to portfolio</div></div></div><div class="home-bar"></div>` : `<div class="home-bar"></div>`}`;

// ---------------------------------------------------------------------------
// BATCH 6 — auth and launch (SCREENS.md). Drawn in Lux; whether the auth flow
// keeps its own emerald/ivory palette is the operator's ruling.
// ---------------------------------------------------------------------------
const logo = (size) => `<img class="mark" src="${brandSrc('brazos-b-leaf.png', size * 2, size * 2)}" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.26)}px" alt="">`;
/** The auth scaffold: the back disc and the small title, then the mark, the eyebrow, the serif title and the subtitle. */
const authTop = (title, eyebrow, h, sub, back = true) => `<div class="hdr" style="min-height:36px">${back ? `<div class="circle" style="width:36px;height:36px">${ic('i-back')}</div>` : ''}<span class="title" style="font-size:15px">${title}</span></div>
    <div class="stack" style="gap:8px;margin-top:2px">${logo(56)}<span class="eyebrow" style="margin-top:6px">${eyebrow}</span><div class="h1 serif" style="font-size:30px;line-height:34px">${h}</div><span class="muted" style="font-size:15px;line-height:21px">${sub}</span></div>`;
const phoneField = () => `<div class="fld"><span class="lbl">Phone number</span><div class="in ph" style="padding:0 16px;gap:10px"><span style="color:var(--ink);flex:0 0 auto;display:flex;align-items:center;gap:6px;font-weight:600">🇺🇸 +1${icS('i-chev', 14, 'var(--muted)')}</span><i style="width:1px;height:24px;background:rgba(200,255,230,.14)"></i><span style="flex:1">347 320 0610</span></div></div>`;
const privacyRow = () => `<div class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:center">${icS('i-shield', 20, 'var(--acc)')}<span class="muted" style="font-size:14px;line-height:19px">Your number stays private until a job is confirmed.</span></div>`;

/** Launch (screens/LaunchScreen.tsx): the mark, the gold wordmark, the tagline, on the ground with its glow. */
const launch = () => `<div class="glowbg"></div>
  <div style="position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px"><img class="mark" src="${brandSrc('app-icon-b-leaf.png', 208, 208)}" style="width:104px;height:104px;border-radius:24px" alt=""><span class="wordmark">BRAZOS</span><span class="muted" style="font-size:16px;margin-top:-10px">Any Task, Handled.</span></div>`;

/** Welcome (screens/WelcomeScreen.tsx): the three badges, the eyebrow, the headline, the three ways in. */
const welcome = () => `<div class="glowbg"></div>
  <div class="body" style="gap:22px;top:80px;bottom:34px">
    <div style="display:flex;justify-content:center">${logo(72)}</div>
    <div class="wrap" style="justify-content:center">${['Local workers', 'Protected payment', 'Local jobs'].map((l) => `<span class="chip">${l}</span>`).join('')}</div>
    <div class="stack" style="gap:10px"><span class="eyebrow">Brazos marketplace</span><div class="h1 serif" style="font-size:38px;line-height:42px">Get it done.<br>Work with<br>confidence.</div><span class="muted" style="font-size:16px;line-height:22px">Hire trusted local help or find nearby work from one account.</span></div>
    <div class="stack" style="gap:10px;margin-top:auto"><div class="cta">Continue with email</div><div class="btn2">Continue with phone</div><div class="ghost">I already have an account</div></div>
  </div>`;

/** Sign in with a phone (screens/SignInScreen.tsx). */
const signin = () => `<div class="body" style="gap:22px;bottom:34px">
    ${authTop('Sign in', 'Welcome back', 'Sign in to BRAZOS', 'Use the phone number connected to your account.')}
    <div class="card" style="padding:16px">${phoneField()}</div>
    <div class="stack" style="gap:8px;margin-top:auto"><div class="cta">Continue</div><div class="ghost">Use Email Instead</div></div>
  </div>`;

/** Sign in with an email (screens/EmailSignInScreen.tsx). */
const emailSignin = () => `<div class="body" style="gap:22px;bottom:34px">
    ${authTop('Sign in', 'Welcome back', 'Sign in to BRAZOS', 'Use the email and password connected to your account.')}
    <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">${fld('Email', 'you@example.com', { ph: true })}${fld('Password', '••••••••', { ph: true })}</div>
    <div class="stack" style="gap:8px;margin-top:auto"><div class="cta">Continue</div><div class="ghost">Use Phone Number Instead</div></div>
  </div>`;

/** Create an account with a phone (screens/CreateAccountScreen.tsx). */
const createAccount = () => `<div class="body" style="gap:18px;bottom:34px">
    ${authTop('Create account', 'Create account', 'One account. Two ways to use it.', 'You can hire help and accept work. Your home screens change with your current mode.')}
    <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">${fld('Full name', 'Carlos Reyes', { ph: true })}${phoneField()}</div>
    ${privacyRow()}
    <div class="stack" style="gap:8px;margin-top:auto"><div class="cta">Create account</div><div class="ghost">Use Email Instead</div></div>
  </div>`;

/** Create an account with an email (screens/EmailCreateAccountScreen.tsx). */
const emailCreate = () => `<div class="body" style="gap:12px;bottom:34px">
    ${authTop('Create account', 'Create account', 'Sign up with your email', 'One account. You can hire help and accept work from the same profile.')}
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">${fld('Full name', 'Carlos Reyes', { ph: true })}${fld('Email', 'you@example.com', { ph: true })}${fld('Password', '••••••••', { ph: true })}</div>
    ${privacyRow()}
    <div class="stack" style="gap:8px;margin-top:auto"><div class="cta">Create account</div><div class="ghost">Use Phone Number Instead</div></div>
  </div>`;

/** Verify phone (screens/VerifyPhoneScreen.tsx): the six boxes, Verify and continue, the resend countdown. */
const verify = () => `<div class="body" style="gap:22px;bottom:34px">
    ${authTop('Verify phone', 'Verify your number', 'Enter the 6-digit code', 'Sent to +1 ••• ••• 0610')}
    <div class="otp"><i>4</i><i>8</i><i>2</i><i class="cur"></i><i></i><i></i></div>
    <div class="stack" style="gap:12px;margin-top:auto;align-items:center"><div class="cta" style="align-self:stretch">Verify and continue</div><span class="muted" style="font-size:14px;font-weight:600">Resend code in 0:42</span></div>
  </div>`;

/** Setup (screens/SetupScreen.tsx): Terms & Privacy, the starting mode, Finish setup, Sign out. */
const setup = () => `<div class="body" style="gap:18px;bottom:34px">
    <div class="stack" style="gap:8px"><span class="title" style="font-size:15px">Setup</span><span class="eyebrow" style="margin-top:10px">Final setup</span><div class="h1 serif" style="font-size:30px;line-height:34px">Set up your experience</div><span class="muted" style="font-size:15px">These choices can be changed later.</span></div>
    <div class="card list">${setRow('i-images', 'Terms &amp; Privacy', 'Review both documents to continue')}</div>
    <div class="stack" style="gap:10px"><span class="sect">Start in</span><div style="display:flex;gap:10px"><div class="choice on">${ic('i-search')}<div class="stack" style="gap:2px"><span class="title" style="font-size:16px">Hire help</span><span class="muted" style="font-size:13px">Customer mode</span></div></div><div class="choice">${ic('i-briefcase')}<div class="stack" style="gap:2px"><span class="title" style="font-size:16px">Find work</span><span class="muted" style="font-size:13px">Worker mode</span></div></div></div></div>
    <span class="muted" style="font-size:13px;text-align:center">Review Terms &amp; Privacy to finish setup.</span>
    <div class="stack" style="gap:8px;margin-top:auto"><div class="cta" style="opacity:.55;box-shadow:none">Finish setup</div><div class="ghost" style="color:var(--muted)">Sign out</div></div>
  </div>`;

/** The legal gate (screens/LegalGateScreen.tsx): the two documents' status, the open document, the agreement, Agree and continue. */
const legalGate = () => `<div class="body" style="gap:14px;bottom:34px">
    <div class="stack" style="gap:6px"><span class="eyebrow">Before you start</span><div class="h1 serif" style="font-size:30px;line-height:34px">Terms &amp; Privacy</div><span class="muted" style="font-size:14px;line-height:19px">Read both documents to the end, then confirm below.</span></div>
    <div class="card list">${setRow('i-images', 'Terms of Service', 'Reviewed', icS('i-checkcircle', 24, 'var(--acc)'))}${setRow('i-lock', 'Privacy Policy', 'Scroll to the end to continue')}</div>
    <div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow:hidden"><div class="h2 serif" style="font-size:22px;line-height:26px">Brazos Privacy Policy</div><span class="title" style="font-size:14px">⚠️ Working draft — pending legal review</span><p class="muted" style="font-size:13px;line-height:18px">This document is an unreviewed first draft written to describe accurately what the app does with your data. It is NOT final legal text and has NOT been reviewed by a licensed attorney. It must be reviewed and revised by qualified counsel before Brazos is offered to the public.</p><span class="muted" style="font-size:12px">Last updated: 26 July 2026</span><span class="title" style="font-size:15px">1. Who this covers</span><p class="muted" style="font-size:13px;line-height:18px">This policy covers the Brazos mobile app. Brazos is operated from the United States and intended for use there.</p><span class="title" style="font-size:15px">2. What we collect</span><span class="muted" style="font-size:12px;text-align:center;margin-top:auto">Scroll to the end to continue</span></div>
    <span class="muted" style="font-size:13px;text-align:center">Review both documents to enable agreement.</span>
    <div style="display:flex;gap:12px;align-items:flex-start"><div class="cb"></div><span class="muted" style="font-size:14px;line-height:19px">I have read and agree to the Terms of Service and Privacy Policy.</span></div>
    <div class="stack" style="gap:8px"><div class="cta" style="opacity:.55;box-shadow:none">Agree and continue</div><div class="ghost" style="color:var(--muted)">Sign out</div></div>
  </div>`;

/** The mode-switch overlay (components/ModeTransitionOverlay.tsx): the app's own transition artwork rising over the dimmed screen. */
const modeSwitch = () => `${home()}<div class="scrim" style="background:rgba(3,14,12,.55)"></div><img class="overlayart" src="${brandSrc('transition-worker.png', 786, 870)}" alt="">`;

/** The amount prompt (components/AmountPrompt.tsx) and the confirm dialog (components/ConfirmDialog.tsx), one frame each over the chat and over Home. */
const amount = (which = 'amount') => which === 'amount'
  ? `${chat(CHAT_END)}<div class="scrim"></div><div class="card dialog"><div class="h2 serif" style="font-size:24px;line-height:28px">Counter offer</div><p class="muted" style="font-size:14px;line-height:20px;margin-top:-6px">Currently ${BIDS[0].amount}. Propose a different amount.</p><div class="in" style="height:56px;gap:6px"><span class="money" style="font-size:22px">$</span><span class="money" style="font-size:22px">100</span></div><div style="display:flex;gap:10px"><div class="btn2" style="flex:1">Cancel</div><div class="cta" style="flex:1">Send counter</div></div></div>`
  : `${home()}<div class="scrim"></div><div class="card dialog"><div class="h2 serif" style="font-size:24px;line-height:28px">Switch to Worker Mode?</div><p class="muted" style="font-size:14px;line-height:20px;margin-top:-6px">You’ll see the jobs you can bid on. The jobs you’ve posted stay exactly where they are — switch back any time.</p><div class="stack" style="gap:10px"><div class="cta">Switch</div><div class="btn2">Stay in Customer</div></div></div>`;


/**
 * Customer Home (screens/HomeScreen.tsx) — the Fable comparison page. Every
 * control the live screen draws, in its order: the hero (greeting + first name
 * in gold, the two-line headline, the three-line subtitle, the armchair art),
 * the task card (its title, the search field with the voice mic while empty,
 * the "Post a job ›" pill), "Popular services" with the sliding tile row (four
 * whole tiles fill the row, nothing peeks), "Needs your attention" (the posted
 * jobs waiting on the customer, most urgent first, each hub card carrying its
 * next-action line; "See all" only past the cap of three, so not here), and
 * "Your jobs" (the three most recent postings with "View all"). Data: the
 * harness's four seeded jobs (JOBS) — the hub card shows formatBudget() of the
 * row's budget_cents, which is the range's upper bound, and the long time-ago
 * form the card draws ("2 h ago"). The All services sheet is its own page.
 */
const home_fable = (scroll = 0) => {
  const first = CLIENT.split(' ')[0];
  const bidsOf = (j) => (j.bids === 'No bids' ? 0 : Number(j.bids.split(' ')[0]));
  const price = (j) => (j.pay.includes('–') ? '$' + j.pay.split('–')[1] : j.pay);
  const ageLong = (j) => j.age.replace(/^([0-9]+)([a-z])/, '$1 $2');
  const subtitle = (j) => { const n = bidsOf(j); return n ? `${n} ${n === 1 ? 'bid' : 'bids'} received` : 'Awaiting bids'; };
  const nextAction = (j) => { const n = bidsOf(j); return `${n} ${n === 1 ? 'bid' : 'bids'} to review`; };
  const hub = (j, action) => `<div class="card hubf">
      <div class="between"><div style="display:flex;align-items:center;gap:10px"><span class="chip">Open</span><span class="meta">${ageLong(j)}</span></div><span class="money amt">${price(j)}</span></div>
      <div class="hd"><div class="well">${ic(j.icon)}</div><div class="stack" style="gap:3px;min-width:0;flex:1"><div class="title lines2">${j.title}</div><span class="muted" style="font-size:13px">${subtitle(j)}</span></div></div>
      ${action
        ? `<div class="between" style="gap:12px"><div class="act">${ic('i-arrow')}<span>${action}</span></div><span class="vd">View details</span></div>`
        : `<div class="act" style="justify-content:flex-end">View details${ic('i-arrow')}</div>`}
    </div>`;
  const sectionHead = (title, link) => `<div class="between"><span class="sect serif" style="font-size:22px">${title}</span>${link ? `<span class="link linkf" style="display:flex;align-items:center;gap:4px;font-size:14px">${link}${ic('i-arrow')}</span>` : ''}</div>`;
  // Needs your attention: open jobs with bids, most recent first (lib/homeAttention.ts rank 2 for all of them).
  const attention = JOBS.filter((j) => bidsOf(j) > 0);
  const yours = JOBS.slice(0, 3);
  const inner = `
    <div class="herof">
      <img class="art" src="${photoSrc()}" alt="">
      <div class="greetf"><span>Good morning,</span><b>${first}</b></div>
      <div class="h1 serif" style="font-size:33px;line-height:40px;max-width:235px">Take a task<br>off your plate</div>
      <p class="muted" style="font-size:14px;line-height:19px;max-width:235px">Describe it.<br>Hire help.<br>Get it handled.</p>
    </div>
    <div class="card" style="padding:17px;display:flex;flex-direction:column;gap:14px">
      <div style="font-size:20px;line-height:24px;font-weight:700">What do you need done?</div>
      <div class="field"><span style="flex:1">Describe your task...</span>${ic('i-mic')}</div>
      <div class="cta">Post a job ›</div>
    </div>
    <div class="stack" style="gap:12px">
      ${sectionHead('Popular services')}
      <div class="tiles tilesf">${[['Assembly', 'i-wrench'], ['Moving', 'i-cube'], ['Cleaning', 'i-sparkles'], ['TV mounting', 'i-tv']].map(([l, i]) => `<div class="tile">${ic(i)}<span>${l}</span></div>`).join('')}</div>
    </div>
    <div class="stack" style="gap:12px">
      ${sectionHead('Needs your attention')}
      ${attention.map((j) => hub(j, nextAction(j))).join('')}
    </div>
    <div class="stack" style="gap:12px">
      ${sectionHead('Your jobs', 'View all')}
      ${yours.map((j) => hub(j)).join('')}
    </div>`;
  return scroller(64, 84, scroll, inner, 24) + nav('Home');
};


/**
 * Post a job · 4 Review and publish (screens/PostJobScreen.tsx, step 3 of
 * POST_STEPS, a fresh post in the default open-bids pricing mode) — the Fable
 * comparison page. Every control the step draws, in its order: the wizard
 * header (back link "Location", the centred "Post a Job", no right link on the
 * last step — its forward action is the footer), the step intro ("STEP 4 OF
 * 4", "Review and publish", its subtitle) and the four-segment progress row,
 * the "Max budget" display pill with its pencil (the only pressable — it opens
 * the Edit Budget dialog, its own page) and the optional hint, the JOB SUMMARY
 * card (title, description clamped to four lines, then Category · Area ·
 * Media · Timing · Address (private) · Budget), the publish notice, and the
 * one pinned footer button, "Publish". Data: the sample detail job as the
 * wizard writes it (DETAIL, POST) — one photo, no private address given, so
 * the row reads the app's own "Not added".
 */
const postReview_fable = (scroll = 0) => {
  const rows = [
    ['i-grid', 'Category', POST.cat],
    ['i-pin', 'Area', DETAIL.hood],
    ['i-images', 'Media', '1 photo'],
    ['i-clock', 'Timing', POST.timing],
    ['i-lock', 'Address (private)', 'Not added'],
  ];
  const inner = `
    ${wizHeader('Location', 'Post a Job', '')}
    ${stepIntro(4, 'Review and publish', 'Check the details below. You can still go back without losing your work.')}
    <div class="fld"><span class="lbl">Max budget</span><div class="pricepill"><span class="money" style="font-size:20px">${POST.pay}</span><div class="pen">${ic('i-pencil')}</div></div><span class="cap">Optional — leave blank if you want workers to propose a price.</span></div>
    <div class="card sumf">
      <span class="eyebrow">Job summary</span>
      <div class="t serif">${DETAIL.title}</div>
      <div class="d">${DETAIL.body}</div>
      <div class="divider"></div>
      ${rows.map(([i, k, v]) => frow(i, k, v)).join('')}
      ${frow('i-card', 'Budget', POST.pay, true)}
    </div>
    <div class="noticef">${ic('i-checkcircle')}<span>Publishing makes this job visible to workers nearby.</span></div>`;
  return scroller(64, 100, scroll, inner, 20) + `<div class="sticky"><div class="cta">Publish</div></div><div class="home-bar"></div>`;
};


/**
 * Compare bids (screens/CompareBidsScreen.tsx) — the Fable comparison page.
 * Every control the screen draws, in its order: the pushed header ("Compare
 * bids", back), the header card (the count-and-title eyebrow on one line, the
 * "Protected job" pill, "Compare the full offer.", the framing line), the
 * stated order rule, one row per pending bid in the deterministic order
 * (rating, then lowest price, then earliest — both samples unrated, so Sam's
 * $110 leads), each with the avatar, the name, the amount, the trust line and
 * "Bid N h ago · full terms ›", then the BRAZOS PROTECTS card with its three
 * tiles. Honest to the sample data: both bidders are new workers, so the
 * rating row and the "Highest rated" tag do not render, the trust line reads
 * the app's own "New worker", and that branch hides the pitch. The dark
 * monogram behind the header copy is dropped (light never had it). Empty,
 * loading and error states are the template's.
 */
const compare_fable = (scroll = 0) => {
  const sorted = [...BIDS].sort((a, b) => Number(a.amount.slice(1)) - Number(b.amount.slice(1)));
  const row = (b) => `<div class="card bidf">
      <div class="hd"><div class="av44">${b.w.initials}</div><span class="nm">${b.w.name}</span><span class="money amt">${b.amount}</span></div>
      <span class="muted" style="font-size:13px">New worker</span>
      <div class="ft">Bid ${b.age.replace(/^([0-9]+)([a-z])/, '$1 $2')} · <b>full terms</b>${ic('i-chev')}</div>
    </div>`;
  const tiles = [['i-grid', 'Scope', 'Agreed work'], ['i-shield', 'Payment', 'Held safely'], ['i-images', 'Evidence', 'Before release']];
  const inner = `
    ${header('Compare bids')}
    <div class="stack" style="gap:10px">
      <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:8px">
        <div class="between" style="gap:10px;align-items:flex-start"><span class="eyebrow" style="min-width:0;line-height:16px">${BIDS.length} bids · ${DETAIL.title}</span><span class="chip" style="flex:0 0 auto">Protected job</span></div>
        <div class="h2 serif">Compare the full offer.</div>
        <p class="muted" style="font-size:14px;line-height:19px">Price matters, but fit, reliability and included work determine value.</p>
      </div>
      <span class="cap">Sorted by rating, then lowest price, then earliest bid.</span>
    </div>
    <div class="stack" style="gap:12px">${sorted.map(row).join('')}</div>
    <div class="card protf">
      <div class="shield">${ic('i-shield')}</div>
      <span class="eyebrow">Brazos protects</span>
      <div class="h2 serif" style="font-size:22px;line-height:26px;padding-right:56px">One job. One clear record.</div>
      <div class="tiles3">${tiles.map(([i, t, s]) => `<div class="pt"><div class="g">${ic(i)}</div><div><div class="t">${t}</div><div class="s">${s}</div></div></div>`).join('')}</div>
    </div>
`;
  return scroller(64, 95, scroll, inner, 20) + nav('');
};


/**
 * The client's job detail (screens/ClientJobDetailScreen.tsx) — the Fable
 * comparison page, in the state the sample job's lifecycle constants describe:
 * Sam's bid accepted and the payment funded (status assigned, payment held —
 * PAY's figures are the fee schedule's, so the card reads the Stripe-mode copy). Every control that state
 * draws, in its order: the pushed header ("Job detail" — "Job & bids" belongs
 * to the open state), the job hero (the Assigned badge, "Posted N h ago", the
 * title, the category glyph and area line, AGREED PRICE, and the owner's two
 * actions, Edit job · Delete job), JOB SCOPE (the description and the category
 * tag), TIMING & ADDRESS (the arrival window; no private address was given so
 * that row does not render), JOB PROGRESS ("Where things stand", Assigned ·
 * In progress · Completed), ASSIGNED WORKER (the worker row, "$110 agreed",
 * the chevron to their profile), the "Message Sam" and "Track worker" buttons,
 * PROTECTED PAYMENT (what the card was charged, MoneyText's own held caption,
 * the held note), WORK EVIDENCE ("Your original media" — the one
 * posting photo), and the waiting notice. Pull-to-refresh, the photo viewer,
 * the error banners and the accept dialog are states the page does not show.
 */
const cjob_fable = (scroll = 0) => {
  const inner = `
    ${header('Job detail')}
    <div class="card pcard">
      <div class="between"><span class="chip">Assigned</span><span class="meta">Posted 2 h ago</span></div>
      <div class="h2 serif">${DETAIL.title}</div>
      <div style="display:flex;align-items:center;gap:10px"><div class="well sm">${ic('i-wrench')}</div><span class="muted" style="font-size:14px">${POST.cat} · ${DETAIL.hood}</span></div>
      <div class="divider"></div>
      <div class="stack" style="gap:2px"><span class="eyebrow">Agreed price</span><span class="money" style="font-size:24px;line-height:28px">${PAY.agreed}</span></div>
      <div class="divider"></div>
      <div style="display:flex;gap:10px"><div class="btn2 sm">Edit job</div><div class="btn2 sm danger">Delete job</div></div>
    </div>
    <div class="card pcard">
      <span class="eyebrow">Job scope</span>
      <p style="font-size:15px;line-height:21px;color:var(--ink)">${DETAIL.body}</p>
      <span class="tagf">${ic('i-wrench')}${POST.cat}</span>
    </div>
    <div class="card pcard">
      <span class="eyebrow">Timing &amp; address</span>
      <div style="display:flex;align-items:center;gap:10px"><div class="well sm">${ic('i-clock')}</div><span style="font-size:15px;font-weight:600">${POST.timing}</span></div>
    </div>
    <div class="card pcard">
      <span class="eyebrow">Job progress</span>
      <div class="sect">Where things stand</div>
      <div class="steps">${['Assigned', 'In progress', 'Completed'].map((l, i) => `<div class="st${i === 0 ? ' done on' : ''}"><i></i><span>${l}</span></div>`).join('')}</div>
    </div>
    <div class="card pcard">
      <span class="eyebrow">Assigned worker</span>
      <div class="sect">${WORKER.name}</div>
      <div class="wrow"><div class="av52">${WORKER.initials}</div><div class="stack" style="gap:2px;flex:1;min-width:0"><span class="nm">${WORKER.name}</span><span class="muted" style="font-size:13px">${PAY.agreed} agreed</span></div><span class="chevw">${ic('i-chev')}</span></div>
    </div>
    <div class="btn2">${ic('i-chat')}Message ${WORKER.first}</div>
    <div class="btn2">${ic('i-pin')}Track worker</div>
    <div class="card pcard" style="position:relative">
      <div class="well sm" style="position:absolute;right:16px;top:16px">${ic('i-shield')}</div>
      <span class="eyebrow" style="padding-right:48px">Protected payment</span>
      <div class="stack" style="gap:2px"><span class="moneylg">${PAY.total}</span><span class="muted" style="font-size:13px">Funds held in protection</span></div>
      <p class="muted" style="font-size:14px;line-height:19px">Funds stay held until you approve the finished work.</p>
    </div>
    <div class="card pcard">
      <span class="eyebrow">Work evidence</span>
      <div class="sect">Your original media</div>
      <span class="muted" style="font-size:13px;font-weight:600">Your job photos</span>
      <div style="display:flex;gap:10px"><div class="thumb96"><div class="pimg"></div></div></div>
    </div>
    <div class="card noticec">${ic('i-clock')}<span>Waiting for the worker to finish. You can leave a review once the job is completed.</span></div>`;
  return scroller(64, 95, scroll, inner, 16) + nav('');
};


// ---- the mockup's sample thread (chat-fable): four short messages between the
// client and Sam about the sample job — the only text this page invents — plus
// the app's own art as the one photo, a voice note, a document and Sam's live
// share. Clock times as formatClockTime() writes them.
const THREAD = [
  { who: 'them', t: '9:12 AM', text: 'Hi! Confirming Saturday at 9 — I’ll bring the drill and a second Allen set.' },
  { who: 'me', t: '9:15 AM', tick: 'read', text: 'Perfect. Both boxes are in the living room — here’s the armchair one.' },
  { who: 'me', t: '9:15 AM', tick: 'read', photo: true },
  { who: 'them', t: '9:20 AM', voice: '0:12' },
  { who: 'me', t: '9:24 AM', tick: 'sent', doc: ['Armchair assembly guide.pdf', '1.2 MB'] },
];
/**
 * Chat (screens/ChatScreen.tsx, components/ChatComposer.tsx) — the Fable
 * comparison page, the thread scrolled to its end. Every control the unlocked
 * thread draws, in its order: the header (back, the counterparty's avatar, the
 * name that opens their profile, the job title under it, the "More" menu —
 * its own page), the job divider, the bubbles (text, a photo, a voice note, a
 * document, each with its clock time and, on your own, the tick — one muted
 * tick sent, the gold double tick read), the persistent live-location card the
 * other person is sharing (area · coordinates, the time remaining), and the
 * composer (attach [+] — Camera · Photos · Voice Message · Live location ·
 * Document — the "Message…" field, the dictation mic that becomes Send once
 * there is text). The long-press sheet, the reply bar, reactions, the photo
 * viewer and the dialogs are states the page does not show.
 */
const chat_fable = () => {
  const tick = (k) => k === 'read' ? `<span class="tk">${ic('i-check', 'read')}${ic('i-check', 'read')}</span>` : `<span class="tk">${ic('i-check', 'sent')}</span>`;
  const bars = [6, 12, 18, 10, 22, 14, 8, 16, 20, 9, 13, 7, 17, 11, 6].map((h) => `<i style="height:${h}px"></i>`).join('');
  const bub = (m) => `<div class="bub ${m.who}">${m.text ? m.text : ''}${m.photo ? '<div class="img"><div class="pimg"></div></div>' : ''}${m.voice ? `<div class="vn"><div class="play">${ic('i-arrow')}</div><div class="wave">${bars}</div><span class="dur">${m.voice}</span></div>` : ''}${m.doc ? `<div class="doc"><div class="ico">${ic('i-archive')}</div><div class="stack" style="gap:1px;min-width:0"><span class="nm">${m.doc[0]}</span><span class="sz">${m.doc[1]}</span></div></div>` : ''}<div class="ft"><span>${m.t}</span>${m.who === 'me' ? tick(m.tick) : ''}</div></div>`;
  return `<div class="body" style="gap:0">
    <div class="chathd"><div class="circle">${ic('i-back')}</div><div class="av34">${WORKER.initials}</div><div class="stack" style="gap:1px;flex:1;min-width:0"><span class="nm">${WORKER.name}</span><span class="sub">${DETAIL.title}</span></div><div class="circle">${ic('i-dots')}</div></div>
  </div>
  <div class="clip" style="top:140px;bottom:230px"><div class="col msgs" style="padding:0 16px;justify-content:flex-end;height:100%">
    <div class="jobdiv"><i></i><span>${DETAIL.title}</span><i></i></div>
    ${THREAD.map(bub).join('')}
  </div></div>
  <div class="card livef" style="bottom:160px"><div class="pin">${ic('i-pin')}</div><div class="stack" style="gap:1px;flex:1;min-width:0"><span class="t">${WORKER.name}’s live location</span><span class="d">Flatbush · 40.6501, -73.9496</span></div><span class="rem">12m</span></div>
  <div class="composer"><span class="plus">${ic('i-plus')}</span><div class="in ph"><span style="flex:1">Message…</span></div>${ic('i-mic')}</div>
  ` + nav('Inbox');
};

/**
 * Checkout (screens/CheckoutScreen.tsx, the DetailScreen template) — the Fable
 * comparison page, in card mode before the payment exists (the PAY figures
 * are the fee schedule's quote for the accepted $110 at the 7.5% customer
 * fee). Every control that state draws, in its order: the header ("Protected
 * checkout", the job title under it, back), "What you’re protecting" (Accepted
 * offer · Agreed price · Scheduled · Protection fee · Total charged to your
 * card · Funding window — tax renders only when non-zero), "How protection
 * works" (Pay by card · Hold in protection · Release), and the action bar's
 * one button, "Protect $118.25 by card". The sandbox banner, the gone /
 * timeout / window-closed sections, "Current payment state" and the confirm
 * dialog are other states of the same screen.
 */
const checkout_fable = () => {
  const kv = (k, v, money = false, total = false) => `<div class="kv${total ? ' total' : ''}"><span class="k">${k}</span><span class="v${money ? ' money' : ''}">${v}</span></div>`;
  const ex = (i, s, t) => `<div class="explf">${ic(i)}<span><b>${s}</b> ${t}</span></div>`;
  return `<div class="body" style="gap:16px">
    ${header('Protected checkout')}
    <span class="cap" style="margin-top:-14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:54px">${DETAIL.title}</span>
    <div class="stack" style="gap:10px"><span class="sect">What you’re protecting</span>
      <div class="card" style="padding:8px 16px">
        ${kv('Accepted offer', WORKER.name)}${kv('Agreed price', PAY.agreed, true)}${kv('Scheduled', POST.timing)}${kv('Protection fee', PAY.fee, true)}${kv('Total charged to your card', PAY.total, true, true)}${kv('Funding window', 'closes in ' + PAY.window)}
      </div></div>
    <div class="stack" style="gap:10px"><span class="sect">How protection works</span>
      <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">
        ${ex('i-card', 'Pay by card', 'charges the all-in total shown above through the secure payment sheet. Nothing is charged until you confirm in the sheet.')}
        ${ex('i-lock', 'Hold in protection', `keeps the funds set aside while ${WORKER.name} does the job. They can see the funds are protected, and can’t be paid early.`)}
        ${ex('i-checkcircle', 'Release', 'happens only after you approve the completed work — or automatically 72 hours after completion if you don’t respond. Reporting an issue holds the funds instead.')}
      </div></div>
  </div><div class="sticky"><div class="cta">Protect ${PAY.total} by card</div></div><div class="home-bar"></div>`;
};

/**
 * Welcome (screens/WelcomeScreen.tsx) — the Fable comparison page, drawn in Lux
 * (whether the auth flow keeps its own emerald/ivory palette is the operator's
 * ruling). Every control, in its order: the art (the layered ring and the
 * three badges — Local workers · Protected payment · Local jobs), the eyebrow
 * "BRAZOS MARKETPLACE", the three-line headline, the body line, and the three
 * actions — Continue with email, Continue with phone, and the ghost "I already
 * have an account". No top bar: Welcome has no back.
 */
const welcome_fable = () => `<div class="glowbg"></div><div class="body" style="gap:18px;top:70px;bottom:34px">
    <div class="artf"><div class="ring"><i class="b"></i><i class="c"></i></div>
      <div class="badgef" style="left:8px;top:58px;transform:rotate(-7deg)">${ic('i-shield')}Local workers</div>
      <div class="badgef" style="right:4px;top:118px;transform:rotate(8deg)">${ic('i-lock')}Protected payment</div>
      <div class="badgef" style="left:34px;top:188px">${ic('i-pin')}Local jobs</div>
    </div>
    <div class="stack" style="gap:10px"><span class="eyebrow">Brazos marketplace</span><div class="h1 serif" style="font-size:36px;line-height:40px">Get it done.<br>Work with<br>confidence.</div><p class="muted" style="font-size:15px;line-height:21px">Hire trusted local help or find nearby work from one account.</p></div>
    <div class="stack" style="gap:10px;margin-top:auto"><div class="cta">Continue with email</div><div class="btn2">Continue with phone</div><div class="ghost">I already have an account</div></div>
  </div><div class="home-bar"></div>`;

/**
 * Sign in (screens/SignInScreen.tsx) — the Fable comparison page, in Lux. Every
 * control, in its order: the top bar (back, the small centred "Sign in"), the
 * brand mark, the eyebrow "WELCOME BACK", "Sign in to BRAZOS", the one-line
 * subtitle, the phone number field (the country pill — flag, ISO code, its
 * menu — the +1 dial and the national number, with the NANP placeholder the
 * app shows), and the two actions — Continue and the ghost "Use Email Instead".
 * The suspended-account notice and the info notice are states not shown.
 */
const signin_fable = () => `<div class="glowbg"></div><div class="body" style="gap:22px">
    <div class="topbar"><div class="circle">${ic('i-back')}</div><span class="t">Sign in</span><div style="width:40px"></div></div>
    <div class="stack" style="gap:12px;margin-top:8px"><img src="${brandSrc('brazos-b-leaf.png', 112, 112)}" width="56" height="56" style="border-radius:14px;display:block" alt=""><span class="eyebrow">Welcome back</span><div class="h1 serif" style="font-size:32px;line-height:36px">Sign in to BRAZOS</div><p class="muted" style="font-size:15px;line-height:21px">Use the phone number connected to your account.</p></div>
    <div class="fld"><span class="lbl">Phone number</span><div class="phonef"><div class="cc"><span>🇺🇸</span>US${ic('i-chev')}</div><div class="in ph"><span class="dial">+1</span><span style="flex:1">347 320 0610</span></div></div></div>
    <div class="stack" style="gap:10px"><div class="cta">Continue</div><div class="ghost">Use Email Instead</div></div>
  </div><div class="home-bar"></div>`;


/**
 * Review & tip (screens/ReviewAndTipScreen.tsx, components/ReviewSection.tsx)
 * — the Fable comparison page, in card mode with the payment released on the
 * customer's approval (PAY's agreed $110 is the row's amount). Every control,
 * in its order: the header ("Review & tip", the job title under it, back), the
 * PAYMENT RELEASED card (MoneyText with its own released caption, the
 * approval note), the review card ("How was Sam’s work?", the five stars, "Would
 * you hire Sam again?" with Yes · No, the optional comment field with its
 * placeholder, "Add photos", "Submit review"), and the tip card ("Add a tip?",
 * the optional line, the $5 · $10 · $20 · Other presets — the custom amount
 * field opens under Other — and "Send $10 tip by card" once an amount is
 * chosen). No stars are lit and no answer is chosen: the page invents no
 * opinion about a real person. The confirm dialog is a state not shown.
 */
const reviewTip_fable = (scroll = 0) => {
  const inner = `
    ${header('Review &amp; tip')}
    <span class="cap" style="margin-top:-6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:54px">${DETAIL.title}</span>
    <div class="card pcard">
      <span class="eyebrow">Payment released</span>
      <div class="stack" style="gap:2px"><span class="money" style="font-size:24px;line-height:28px">${PAY.agreed}</span><span class="muted" style="font-size:13px">Released to worker</span></div>
      <p class="muted" style="font-size:14px;line-height:19px">Released on your approval.</p>
    </div>
    <div class="card pcard">
      <div class="sect">How was ${WORKER.first}’s work?</div>
      <div class="stars">${[1, 2, 3, 4, 5].map(() => ic('i-staro')).join('')}</div>
      <span class="lbl" style="font-size:15px">Would you hire ${WORKER.first} again?</span>
      <div class="presetf"><div class="p">Yes</div><div class="p">No</div></div>
      ${fld('Comment (optional)', `Share how it went with ${WORKER.name}…`, { ph: true, multi: true })}
      <div class="btn2">${ic('i-images')}Add photos</div>
      <div class="cta">Submit review</div>
    </div>
    <div class="card pcard">
      <div class="sect">Add a tip?</div>
      <p class="muted" style="font-size:14px;line-height:19px">Entirely optional — every cent of the tip goes to ${WORKER.name}.</p>
      <div class="presetf"><div class="p">$5</div><div class="p on">$10</div><div class="p">$20</div><div class="p">Other</div></div>
      <div class="cta">Send $10 tip by card</div>
    </div>`;
  return scroller(64, 95, scroll, inner, 16) + nav('');
};

const SCREENS = {
  home: { label: 'Customer Home', render: home },
  whome: { label: 'Worker Home', render: whome },
  jobs: { label: 'Available Jobs', render: jobs },
  detail: { label: 'Job detail (worker)', render: detail },
  profile: { label: 'Profile', render: profile },
  // batch 1 — customer core
  discover: { label: 'Find help (Discover)', render: discover },
  wprofile: { label: 'A worker’s public profile', render: wprofile, frames: [0, 493] },
  reviews: { label: 'Profile reviews', render: reviews },
  'post-what': { label: 'Post a job · 1 What needs doing', render: postWhat },
  'post-media': { label: 'Post a job · 2 Media', render: postMedia },
  'post-where': { label: 'Post a job · 3 Where and when', render: postWhere },
  'post-review': { label: 'Post a job · 4 Review and publish', render: postReview, frames: [0, 165] },
  'post-budget': { label: 'The Edit Budget dialog', render: postBudget },
  'post-live': { label: 'Your job is live', render: postLive },
  create: { label: 'The [+] Create sheet', render: create },
  services: { label: 'The All services sheet', render: services },
  // batch 2 — customer jobs
  myjobs: { label: 'My Jobs (customer)', render: myjobs, frames: [0, 348] },
  cjob: { label: 'The client’s job detail', render: cjob, frames: [0, 437, 874] },
  compare: { label: 'Compare bids', render: compare },
  bid: { label: 'Bid detail', render: bid },
  counter: { label: 'Counter-offer', render: counter },
  checkout: { label: 'Protected checkout', render: checkout },
  confirmed: { label: 'Job confirmed', render: confirmed },
  track: { label: 'Track worker', render: track, frames: [0, 144] },
  approve: { label: 'Finished work (approve or dispute)', render: approve },
  'review-tip': { label: 'Review & tip', render: reviewTip, frames: [0, 135] },
  cell: { label: 'Jobs in this zone', render: cell },
  cmap: { label: 'Map (customer)', render: cmap },
  // batch 3 — worker
  filters: { label: 'The Filters sheet', render: filters },
  'filters-pop': { label: 'The Filters popups', render: filters, frames: ['distance', 'budget', 'date', 'sort'], frameLabels: [' (distance)', ' (budget)', ' (date)', ' (sort)'] },
  submit: { label: 'Submit a bid', render: submit, frames: [0, 85] },
  'bid-sent': { label: 'Bid sent', render: bidSent },
  wjob: { label: 'Your Job (worker, assigned)', render: wjob, frames: [0, 466] },
  checklist: { label: 'Work checklist', render: checklist },
  route: { label: 'Route & arrival', render: route },
  wmap: { label: 'Map (worker) + the jobs sheet', render: wmap },
  wmyjobs: { label: 'My Jobs (worker)', render: wmyjobs },
  earnings: { label: 'Earnings', render: earnings },
  payouts: { label: 'Payouts', render: payouts },
  pricing: { label: 'Services & availability', render: pricing, frames: [0, 201] },
  // batch 4 — messaging
  inbox: { label: 'Messages (Inbox)', render: inbox },
  chat: { label: 'Chat', render: chat, frames: [CHAT_END] },
  'chat-menu': { label: 'The chat menus', render: chatMenu, frames: ['overflow', 'message', 'inbox'], frameLabels: [' (the overflow menu)', ' (a message held)', ' (a conversation held)'] },
  hidden: { label: 'Hidden Chats', render: hidden },
  feed: { label: 'Notifications', render: feed },
  report: { label: 'The Report dialog', render: report },
  // batch 5 — profile and settings
  details: { label: 'Profile details', render: details, frames: [0, 90] },
  safety: { label: 'Account and safety', render: safety, frames: [0, 191] },
  notif: { label: 'Notification settings', render: notif, frames: [0, 145] },
  appearance: { label: 'Appearance', render: appearance },
  payment: { label: 'Payment methods', render: payment },
  saved: { label: 'Saved & past workers', render: saved },
  delete: { label: 'Delete account', render: del, frames: [0, 217] },
  legal: { label: 'Legal document (Terms)', render: legal, frames: [0, 149] },
  admin: { label: 'Admin reports', render: admin },
  portfolio: { label: 'Feature past work', render: portfolio, frames: ['grid', 'detail'], frameLabels: ['', ' (a photo picked)'] },
  // batch 6 — auth and launch
  launch: { label: 'Launch', render: launch },
  welcome: { label: 'Welcome', render: welcome },
  signin: { label: 'Sign in (phone)', render: signin },
  'email-signin': { label: 'Sign in (email)', render: emailSignin },
  'create-account': { label: 'Create account (phone)', render: createAccount },
  'email-create': { label: 'Create account (email)', render: emailCreate },
  verify: { label: 'Verify phone', render: verify },
  setup: { label: 'Setup', render: setup },
  'legal-gate': { label: 'The legal gate', render: legalGate },
  'mode-switch': { label: 'The mode-switch overlay', render: modeSwitch },
  amount: { label: 'Amount prompt · Confirm dialog', render: amount, frames: ['amount', 'confirm'], frameLabels: [' (the amount prompt)', ' (the confirm dialog)'] },
  'home-fable': { label: 'Customer Home (Fable)', render: home_fable, frames: [0, 474, 947] },
  'post-review-fable': { label: 'Post a job · 4 Review and publish (Fable)', render: postReview_fable, frames: [0, 266] },
  'compare-fable': { label: 'Compare bids (Fable)', render: compare_fable, frames: [0, 110] },
  'cjob-fable': { label: 'The client’s job detail (Fable)', render: cjob_fable, frames: [0, 504, 1007] },
  'chat-fable': { label: 'Chat (Fable)', render: chat_fable },
  'checkout-fable': { label: 'Protected checkout (Fable)', render: checkout_fable },
  'welcome-fable': { label: 'Welcome (Fable)', render: welcome_fable },
  'signin-fable': { label: 'Sign in (phone) (Fable)', render: signin_fable },
  'review-tip-fable': { label: 'Review & tip (Fable)', render: reviewTip_fable, frames: [0, 269] },
};

// ---------------------------------------------------------------------------
// THE PAGES — one HTML per screen; a screen that scrolls carries a second
// frame (`lux-<key>-2`, the column shifted up by its `frames[1]`) so the whole
// screen is seen, and the sheet captions it "(scrolled)".
// ---------------------------------------------------------------------------
const wanted = process.argv[2] ? process.argv[2].split(',') : Object.keys(SCREENS);
for (const key of wanted) {
  const s = SCREENS[key];
  if (!s) throw new Error(`no screen "${key}" — see SCREENS.md`);
  const frames = s.frames ?? [0];
  const slots = [];
  for (const [i, scroll] of frames.entries()) {
    slots.push(`<div class="slot"><div class="slot-label">Emerald Lux Glass — ${s.label}${s.frameLabels?.[i] ?? (i ? ' (scrolled)' : '')}</div><div class="phone" data-shot="lux-${key}${i ? `-${i + 1}` : ''}">${status()}${await s.render(scroll)}</div></div>`);
  }
  const body = slots.join('');
  const photoCss = body.includes('class="pimg"') ? `.pimg{background-image:url("${photoSrc()}")}` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BRAZOS — Emerald Lux Glass — ${s.label}</title>
<!-- Generated by docs/mockups/html/lux/lux.build.mjs. The system is README.md beside it. -->
<style>${base}${SYSTEM_CSS}${photoCss}</style></head><body>${sprite}<div class="stage">${body}</div></body></html>`;
  const file = join(here, `lux-${key}.html`);
  writeFileSync(file, html);
  console.log(`wrote lux-${key}.html (${Math.round(html.length / 1024)} KB)`);
}

// The index: one link per screen, in SCREENS.md's batches, so the whole set
// opens from one file. Rewritten on every run, whatever subset was built.
const BATCHES = [
  ['Batch 1 — customer core', ['home', 'discover', 'wprofile', 'reviews', 'post-what', 'post-media', 'post-where', 'post-review', 'post-budget', 'post-live', 'create', 'services']],
  ['Batch 2 — customer jobs', ['myjobs', 'cjob', 'compare', 'bid', 'counter', 'checkout', 'confirmed', 'track', 'approve', 'review-tip', 'cell', 'cmap']],
  ['Batch 3 — worker', ['whome', 'jobs', 'filters', 'filters-pop', 'detail', 'submit', 'bid-sent', 'wjob', 'checklist', 'route', 'wmap', 'wmyjobs', 'earnings', 'payouts', 'pricing']],
  ['Batch 4 — messaging', ['inbox', 'chat', 'chat-menu', 'hidden', 'feed', 'report']],
  ['Batch 5 — profile and settings', ['profile', 'details', 'safety', 'notif', 'appearance', 'payment', 'saved', 'delete', 'legal', 'admin', 'portfolio']],
  ['Batch 6 — auth and launch', ['launch', 'welcome', 'signin', 'email-signin', 'create-account', 'email-create', 'verify', 'setup', 'legal-gate', 'mode-switch', 'amount']],
];
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BRAZOS — Emerald Lux Glass — every screen</title>
<!-- Generated by docs/mockups/html/lux/lux.build.mjs. The system is README.md beside it; the checklist is SCREENS.md. -->
<style>body{margin:0;background:#0d0d0d;color:#ddd;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:28px 32px}h1{font-size:24px;margin:0 0 6px}p{color:#9aa39e;margin:0 0 24px;font-size:14px}h2{font-size:15px;color:#E9C170;letter-spacing:1.4px;text-transform:uppercase;margin:26px 0 10px}ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}a{display:inline-block;padding:8px 14px;border-radius:18px;background:rgba(12,44,38,.6);border:1px solid rgba(200,255,230,.2);color:#F3F1E8;text-decoration:none;font-size:14px}a:hover{background:rgba(126,226,180,.16)}a span{color:#9aa39e;font-size:12px;margin-left:6px}</style></head>
<body><h1>Emerald Lux Glass — every screen</h1><p>${Object.keys(SCREENS).length} screens, one page each, from lux.build.mjs. Nothing here is applied to the app.</p>
${BATCHES.map(([title, keys]) => `<h2>${title}</h2><ul>${keys.map((k) => `<li><a href="lux-${k}.html">${SCREENS[k].label}<span>${k}${(SCREENS[k].frames?.length ?? 1) > 1 ? ` · ${SCREENS[k].frames.length} frames` : ''}</span></a></li>`).join('')}</ul>`).join('')}
</body></html>`;
writeFileSync(join(here, 'index.html'), index);
console.log(`wrote index.html (${Object.keys(SCREENS).length} screens)`);
