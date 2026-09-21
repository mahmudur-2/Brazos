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
  const slots = frames.map((scroll, i) => `<div class="slot"><div class="slot-label">Emerald Lux Glass — ${s.label}${i ? ' (scrolled)' : ''}</div><div class="phone" data-shot="lux-${key}${i ? `-${i + 1}` : ''}">${status()}${s.render(scroll)}</div></div>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BRAZOS — Emerald Lux Glass — ${s.label}</title>
<!-- Generated by docs/mockups/html/lux/lux.build.mjs. The system is README.md beside it. -->
<style>${base}${SYSTEM_CSS}</style></head><body>${sprite}<div class="stage">${slots}</div></body></html>`;
  const file = join(here, `lux-${key}.html`);
  writeFileSync(file, html);
  console.log(`wrote lux-${key}.html (${Math.round(html.length / 1024)} KB)`);
}
