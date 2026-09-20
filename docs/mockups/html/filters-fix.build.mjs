// Generates filters-fix-dark.html: the dark Filters sheet as the app draws it
// TODAY beside the approved reference (2026-09-20, sitting 3) — the picture
// the operator approved the colour fix on. Derived from the built gallery
// (map-explore-filters-dark.html, moment 1 — build that first), so the FIXED
// phone IS the reference and NOW differs from it only where the app's own
// numbers differ:
//
//   node docs/mockups/html/map-explore.build.mjs --filters
//   node docs/mockups/html/filters-fix.build.mjs
//
// NOW, honest to ui/tokens.ts and components/JobFilterSheet.tsx at c59d2aa:
// the pane's flat ink #062418 at .88 under the brand-mint sheen (.10 → .04 at
// 115°, the near-white that lifts the green into grey-olive); the chosen pill
// dark.emerald #5FAE81 at .16 / .48 and as its ink; the unchosen rim mint2
// #254539; Done in dark.gold #D4A24C; the Filters rim brand.mint at .46.
// FIXED: the gallery's own sheet — the mockup gradient rgba(3,24,16,.95) →
// rgba(10,48,32,.91) at 125° drawn as the tint itself, the chosen green
// #84dfaa at the same alphas. Both phones blur without saturate(), which the
// phone cannot draw, and wear the same rim, so only the tint and the chosen
// green differ. Labels sit inside the frames (the shots are the phones).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'map-explore-filters-dark.html'), 'utf8');

const stageAt = src.indexOf('<div class="stage">');
const head = src.slice(0, stageAt);
const rest = src.slice(stageAt + '<div class="stage">'.length);
const first = rest.indexOf('<div class="slot">');
const second = rest.indexOf('<div class="slot">', first + 1);
const slot = rest.slice(first, second);
if (!slot.includes('data-shot="filters-closed-dark"')) throw new Error('the first gallery slot is not the closed sheet');

const NOW_CSS = `
  .v-now .fsheet{background:linear-gradient(115deg,rgba(229,241,236,.10) 0%,rgba(229,241,236,0) 34%,rgba(229,241,236,0) 70%,rgba(229,241,236,.04) 100%),rgba(6,36,24,.88)}
  .v-now .fchip{border-color:#254539}
  .v-now .fchip.on{background:rgba(95,174,129,.16);border-color:rgba(95,174,129,.48);color:#5FAE81}
  .v-now .fchip.sortpill .caret{color:#5FAE81}`;
const SHARED_CSS = `
  .fsheet{border-top:.5px solid rgba(229,241,236,.46)}
  .fhead .done{color:#D4A24C}
  .tag{position:absolute;left:50%;top:72px;transform:translateX(-50%);z-index:30;padding:6px 12px;border-radius:12px;background:rgba(0,0,0,.72);color:#fff;font-size:14px;font-weight:700;letter-spacing:.03em;white-space:nowrap}
  .slot-label{max-width:393px;text-align:center;line-height:1.35}`;

const frame = (id, label, cls) =>
  slot
    .replace(/<div class="slot-label">[^<]*<\/div>/, `<div class="slot-label">${label}</div>`)
    .replace('<div class="phone" data-shot="filters-closed-dark">', `<div class="phone ${cls}" data-shot="${id}"><div class="tag">${label}</div>`);

const frames = [
  frame('filters-now-dark', 'NOW · the app today', 'v-now'),
  frame('filters-fixed-dark', 'FIXED · the reference', 'v-fix'),
].join('\n');

const html = `${head.replace('</head>', `<style>${NOW_CSS}${SHARED_CSS}\n</style>\n</head>`)}<div class="stage">\n${frames}\n</div>\n</body>\n</html>\n`;
const out = join(here, 'filters-fix-dark.html');
writeFileSync(out, html);
console.log(`wrote filters-fix-dark.html (${(html.length / 1024).toFixed(0)} KB), phones: ${(html.match(/class="phone /g) || []).length}`);
