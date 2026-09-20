// Available Jobs (WorkerResultsScreen), the list as it is and as the NEXT RUN
// makes it — the operator's approved reference (2026-09-20, sitting 2, after
// the OTA of db3a47c):
//   node docs/mockups/html/worker-results-screen.build.mjs
//   → worker-results-screen.html: NOW (dark), FIXED dark top + end, FIXED light top
//
// WHAT "FIXED" CHANGES, and nothing else:
//   1. ONE CARD SIZE. The picture tile is a constant 118 square and the text
//      block is at least 118 tall, so a four-line card (a job with a bid has no
//      "Break the ice") is the same height as a five-line one — the operator:
//      "the entire section one size, maximize the room for the picture".
//   2. THE TITLE AND THE CHIP CLEAR THE PAY BLOCK BY ITS MEASURED WIDTH + 8,
//      not a fixed 96 (the block is ~66 wide) — here the pay is a grid column,
//      which is exactly what the app's onLayout measure yields. The chip keeps
//      its full label when it fits and falls back to the short name only when
//      it would not — measured by a probe, never estimated (the page's script
//      below does what the app will do).
//   3. THE LIST ENDS 16pt ABOVE THE BAR, not the bar's 104pt footprint: the bar
//      sits IN the layout on every screen but the two Homes, so the old padding
//      counted it twice (the operator's "a lot of room at the bottom").
// The cards are layout a1's numbers (worker-results-card.build.mjs). The
// glyph in a no-photo tile is centred, as the app draws it.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const THEMES = {
  dark: {
    bg: '#02110D', surface: '#0A1813', rim: 'rgba(183,203,186,.22)', ink: '#F1EDE1', muted: '#93A096', emerald: '#5FAE81', gold: '#D4A24C',
    glyph: '#D4A24C', thumb: '#0E1F18', thumbRim: '#254539', chipFill: 'rgba(95,174,129,.12)', payCap: '#D4A24C', pay: '#5FAE81',
    chip: '#0E1F18', chipRim: '#0E1F18', chipInk: '#F1EDE1', chipOn: 'transparent', chipOnRim: '#D4A24C', chipOnInk: '#D4A24C',
    nav: '#061410', navLine: 'rgba(229,241,236,.14)', navInactive: '#7C8A80', navOn: '#5FAE81', headIcon: '#D4A24C',
  },
  light: {
    bg: '#F6F3EA', surface: '#FFFFFF', rim: '#DDE2DD', ink: '#13201B', muted: '#637569', emerald: '#0D6B52', gold: '#C8A15B',
    glyph: '#0D6B52', thumb: '#E5F1EC', thumbRim: '#D3E8DF', chipFill: 'rgba(13,107,82,.10)', payCap: '#637569', pay: '#1B3527',
    chip: '#E5F1EC', chipRim: '#E5F1EC', chipInk: '#13201B', chipOn: '#064C3B', chipOnRim: '#064C3B', chipOnInk: '#FFFFFF',
    nav: '#FFFFFF', navLine: '#DDE2DD', navInactive: '#839087', navOn: '#0D6B52', headIcon: '#13201B',
  },
};

const I = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 2 2 .7-2 .7L5 20l-.7-2-2-.7 2-.7z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v4H3zM4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9zm8 2v4.6l-1.8-1.8-1.4 1.4L12 19.4l3.2-3.2-1.4-1.4-1.8 1.8V12z"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  case: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4z"/><circle cx="9" cy="10.5" r=".8" fill="currentColor"/><circle cx="12" cy="10.5" r=".8" fill="currentColor"/><circle cx="15" cy="10.5" r=".8" fill="currentColor"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
};

/** The operator's own four rows from the 2026-09-20 walk. */
const JOBS = [
  { title: 'E2E 1788397497221', cat: 'Cleaning', catShort: 'Cleaning', loc: 'Brighton Beach, Brooklyn, NY', facts: ['Wed, Sep 2', '1 bid', '2w ago'], ice: false, pay: '$50', glyph: 'spark' },
  { title: 'E2E 1788638058681', cat: 'Cleaning', catShort: 'Cleaning', loc: 'Kings County, Brooklyn, NY', facts: ['Sat, Sep 5', 'No bids', '2w ago'], ice: true, pay: '$50', glyph: 'spark' },
  { title: 'E2E 1788607494700', cat: 'Cleaning', catShort: 'Cleaning', loc: 'Kings County, Brooklyn, NY', facts: ['Sat, Sep 5', 'No bids', '2w ago'], ice: true, pay: '$50', glyph: 'spark' },
  { title: 'Hhhhhg', cat: 'Packing/Unpacking', catShort: 'Packing', loc: 'Kings County, Brooklyn, NY', facts: ['No bids', '1w ago'], ice: true, pay: '$60', glyph: 'box' },
];

const facts = (j) => j.facts.map((p, i) => (i ? `<i>·</i>${p}` : p)).join('');
const cardNow = (j) => `<div class="card now ${j.ice ? 'five' : 'four'}">
  <div class="thumb">${I[j.glyph]}</div>
  <div class="info">
    <div class="title">${j.title}</div>
    <div class="chiprow"><span class="chip">${j.cat}</span></div>
    <div class="m">${I.pin}<span>${j.loc}</span></div>
    <div class="m">${I.cal}<span>${facts(j)}</span></div>
    ${j.ice ? `<div class="m ice">${I.spark}<span>Break the ice</span></div>` : ''}
  </div>
  <div class="pay"><div class="cap">EST. PAY</div><div class="amt">${j.pay}</div></div>
</div>`;
const cardFixed = (j) => `<div class="card fixed">
  <div class="thumb">${I[j.glyph]}</div>
  <div class="grid">
    <div class="title">${j.title}</div>
    <div class="pay"><div class="cap">EST. PAY</div><div class="amt">${j.pay}</div></div>
    <div class="chiprow"><span class="chip" data-full="${j.cat}" data-short="${j.catShort}">${j.cat}</span></div>
    <div class="m wide">${I.pin}<span>${j.loc}</span></div>
    <div class="m wide">${I.cal}<span>${facts(j)}</span></div>
    ${j.ice ? `<div class="m ice wide">${I.spark}<span>Break the ice</span></div>` : ''}
  </div>
</div>`;

const NAV_H = 82;
const NAV_PAD = 12; // the flush pad on a 34pt-inset phone: max(34 − 22, 6); the old clearance was 70 + 12 + 22 = 104
const phone = (theme, shot, label, scrollEnd, listBottomPad, cards) => `
<div class="slot"><div class="slot-label">${label}</div>
<div class="phone ${theme}" data-shot="${shot}">
  <div class="status"><span>9:41</span><span class="r">▮▮▮ ◠ 65</span></div>
  <div class="head"><span class="back">${I.chev}</span><h1>Available Jobs</h1><span class="sl">${I.sliders}</span></div>
  <div class="chips"><span class="dc on">Any distance</span><span class="dc">2 mi</span><span class="dc">5 mi</span><span class="dc">10 mi</span><span class="dc">25 mi</span></div>
  <div class="list ${scrollEnd ? 'end' : ''}" style="--pad:${listBottomPad}px"><div class="content">${cards}</div></div>
  <div class="nav">
    <div class="it on">${I.home}<span>Home</span></div><div class="it">${I.map}<span>Map</span></div><div class="it">${I.case}<span>My Jobs</span></div><div class="it">${I.chat}<span>Inbox</span></div><div class="it">${I.person}<span>Profile</span></div>
  </div>
</div></div>`;

const themeCss = (name, t) => `
  .phone.${name}{background:${t.bg};color:${t.ink}}
  .phone.${name} .head .back svg,.phone.${name} .head .sl svg{color:${t.headIcon}}
  .phone.${name} .dc{background:${t.chip};border-color:${t.chipRim};color:${t.chipInk}}
  .phone.${name} .dc.on{background:${t.chipOn};border-color:${t.chipOnRim};color:${t.chipOnInk}}
  .phone.${name} .card{border-color:${t.rim};background:${t.surface}}
  .phone.${name} .thumb{background:${t.thumb};border-color:${t.thumbRim};color:${t.glyph}}
  .phone.${name} .chip{background:${t.chipFill};color:${t.emerald}}
  .phone.${name} .m{color:${t.ink}}
  .phone.${name} .m svg{color:${t.gold}}
  .phone.${name} .m i{color:${t.muted}}
  .phone.${name} .m.ice span{color:${t.gold}}
  .phone.${name} .pay .cap{color:${t.payCap}}
  .phone.${name} .pay .amt{color:${t.pay}}
  .phone.${name} .nav{background:${t.nav};border-top-color:${t.navLine}}
  .phone.${name} .nav .it{color:${t.navInactive}}
  .phone.${name} .nav .it.on{color:${t.navOn}}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BRAZOS — Available Jobs, now and fixed (one card size, measured clearance, the list's end)</title>
<!-- Generated by worker-results-screen.build.mjs. -->
<style>
  body{margin:0;background:#1c1c1c;font-family:-apple-system,"SF Pro Text","Segoe UI",Inter,sans-serif;display:flex;gap:22px;padding:22px;align-items:flex-start;flex-wrap:wrap}
  .slot{display:flex;flex-direction:column;align-items:center;gap:10px}
  .slot-label{font-size:13px;font-weight:600;letter-spacing:.03em;color:#9aa39e;max-width:393px;text-align:center;line-height:1.35}
  .phone{position:relative;width:393px;height:852px;overflow:hidden;border-radius:44px;display:flex;flex-direction:column}
  .status{height:54px;display:flex;justify-content:space-between;align-items:flex-end;padding:0 34px 6px;font-weight:600;font-size:16px}
  .status .r{font-size:12px;letter-spacing:1px}
  .head{display:flex;align-items:center;gap:10px;padding:30px 16px 22px}
  .head h1{flex:1;margin:0;font-size:30px;font-weight:700;letter-spacing:-.4px}
  .head .back svg,.head .sl svg{width:26px;height:26px}
  .chips{display:flex;gap:8px;padding:8px 16px;overflow:hidden;white-space:nowrap}
  .dc{flex:0 0 auto;height:44px;line-height:42px;padding:0 20px;border-radius:22px;border:1px solid;font-size:14px;font-weight:600;box-sizing:border-box}
  .list{flex:1;min-height:0;overflow:hidden;position:relative}
  .list .content{padding:8px 16px var(--pad);display:flex;flex-direction:column;gap:12px}
  .list.end .content{position:absolute;left:0;right:0;bottom:0}
  .nav{height:${NAV_H + NAV_PAD}px;padding:8px 6px ${NAV_PAD}px;box-sizing:border-box;border-top:1px solid;display:flex}
  .nav .it{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:12px;font-weight:500}
  .nav .it svg{width:30px;height:30px}
  /* the card: layout a1's numbers */
  .card{display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:16px;border:1px solid;position:relative}
  .thumb{flex:0 0 auto;display:flex;align-items:center;justify-content:center;border:1px solid;border-radius:10px;width:118px;height:118px}
  .thumb svg{width:38%;height:38%}
  .title{font-size:18px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chiprow{display:flex;min-width:0}
  .chip{display:inline-block;max-width:100%;box-sizing:border-box;height:26px;line-height:26px;padding:0 10px;border-radius:13px;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m{display:flex;align-items:center;gap:5px;font-size:13px;min-width:0}
  .m span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m svg{width:16px;height:16px;flex:0 0 auto}
  .m i{font-style:normal;margin:0 5px}
  .m.ice span{font-size:12px;font-weight:700}
  .pay{text-align:right}
  .pay .cap{font-size:10px;font-weight:700;letter-spacing:.6px}
  .pay .amt{margin-top:3px;font-size:26px;line-height:30px;font-weight:800}
  /* NOW: the tile as tall as the text (a four-line card is shorter), the pay absolute, a fixed 96 clearance */
  .card.now .info{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
  .card.now .title,.card.now .chiprow{padding-right:96px}
  .card.now .pay{position:absolute;right:12px;top:12px}
  .card.now.four .thumb{width:96px;height:96px}
  /* FIXED: one tile, one height; the pay is a grid column the title and chip clear by its real width + 8 */
  .card.fixed .grid{flex:1;min-width:0;min-height:118px;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto auto auto auto;column-gap:8px;row-gap:4px;align-content:start}
  .card.fixed .title{grid-column:1;grid-row:1}
  .card.fixed .pay{grid-column:2;grid-row:1 / span 2;align-self:start}
  .card.fixed .chiprow{grid-column:1;grid-row:2}
  .card.fixed .wide{grid-column:1 / -1}
${Object.entries(THEMES).map(([k, t]) => themeCss(k, t)).join('\n')}
</style>
</head>
<body>
${phone('dark', 'results-now-dark', 'NOW (dark) — a four-line card is shorter, the chip truncates, the list ends 104pt above the bar', false, 104, JOBS.map(cardNow).join(''))}
${phone('dark', 'results-fixed-dark', 'FIXED (dark) — one card size (tile 118), the title and chip clear the real pay block + 8', false, 16, JOBS.map(cardFixed).join(''))}
${phone('dark', 'results-fixed-end-dark', 'FIXED (dark), the end of the list — the last card 16pt above the bar', true, 16, JOBS.map(cardFixed).join(''))}
${phone('light', 'results-fixed-light', 'FIXED (light) — the same numbers, the light palette', false, 16, JOBS.map(cardFixed).join(''))}
<script>
  // The chip's rule, as the app measures it: the full label when it fits its
  // column, else the short name — measured, never estimated.
  for (const chip of document.querySelectorAll('.card.fixed .chip')) {
    const probe = chip.cloneNode(true);
    probe.style.cssText = 'position:absolute;visibility:hidden;max-width:none;overflow:visible';
    probe.textContent = chip.dataset.full;
    document.body.appendChild(probe);
    const need = probe.getBoundingClientRect().width;
    probe.remove();
    const room = chip.parentElement.getBoundingClientRect().width;
    chip.textContent = need <= room + 0.5 ? chip.dataset.full : chip.dataset.short;
  }
</script>
</body>
</html>
`;
writeFileSync(join(here, 'worker-results-screen.html'), html);
console.log('wrote worker-results-screen.html');
