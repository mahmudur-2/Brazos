// Generates glass-sheet.html: the [+] popup as a green liquid-glass sheet, in
// eight treatments over the real dark Home render. One template, eight material
// recipes, so a variant is a few CSS lines and not a copy of the markup.
//
//   node docs/mockups/html/glass-sheet.build.mjs   (then embed-backdrop-glass)

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const variants = [
  {
    id: 'g1', name: 'Clear', blurb: 'the most see-through: 40% fill, heavy blur, a white rim, nothing else',
    css: `.g1 .sheet{background:rgba(7,27,21,0.40);backdrop-filter:blur(34px) saturate(160%);-webkit-backdrop-filter:blur(34px) saturate(160%);border:1px solid rgba(255,255,255,0.14);border-bottom:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.22)}
.g1 .scrim{background:rgba(2,17,13,0.30)}`,
  },
  {
    id: 'g2', name: 'Frosted emerald', blurb: 'emerald-tinted frost: the green reads through the glass, emerald rim',
    css: `.g2 .sheet{background:linear-gradient(180deg,rgba(13,107,82,0.34),rgba(7,27,21,0.72));backdrop-filter:blur(30px) saturate(170%);-webkit-backdrop-filter:blur(30px) saturate(170%);border:1px solid rgba(95,174,129,0.35);border-bottom:0;box-shadow:inset 0 1px 0 rgba(160,230,190,0.30)}
.g2 .scrim{background:rgba(2,17,13,0.38)}
.g2 .needs{background:rgba(255,255,255,0.07);border-color:rgba(95,174,129,0.30)}`,
  },
  {
    id: 'g3', name: 'Deep glass, gold accents', blurb: 'darker slab, a faint top light, the gold used for the paw and the hint',
    css: `.g3 .sheet{background:linear-gradient(180deg,rgba(10,32,25,0.80),rgba(5,20,15,0.90));backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.08);border-bottom:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.16)}
.g3 .scrim{background:rgba(2,17,13,0.50)}
.g3 .eyebrow{color:#D4A24C}.g3 .switch .hint{color:rgba(212,162,76,0.75)}.g3 .row .sq.primary{background:rgba(212,162,76,0.18);border-color:rgba(212,162,76,0.45);color:#F1EDE1}`,
  },
  {
    id: 'g4', name: 'Glass pills', blurb: 'the sheet almost disappears; every row is its own floating glass pill',
    css: `.g4 .sheet{background:rgba(7,27,21,0.22);backdrop-filter:blur(26px) saturate(150%);-webkit-backdrop-filter:blur(26px) saturate(150%);border:1px solid rgba(255,255,255,0.08);border-bottom:0;gap:8px}
.g4 .scrim{background:rgba(2,17,13,0.34)}
.g4 .row{border:1px solid rgba(255,255,255,0.10);border-radius:16px;background:rgba(255,255,255,0.05);padding:12px 14px;margin-top:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.14)}
.g4 .row.heavy{background:rgba(46,158,107,0.22);border-color:rgba(95,174,129,0.40)}
.g4 .rows{gap:8px}.g4 .switch{border-top:0;padding-top:4px}`,
  },
  {
    id: 'g5', name: 'Specular', blurb: 'a lit slab: strong top-left highlight, bright edge, inner shadow at the bottom',
    css: `.g5 .sheet{background:radial-gradient(120% 60% at 15% 0%,rgba(255,255,255,0.14),rgba(255,255,255,0) 60%),linear-gradient(180deg,rgba(12,40,31,0.62),rgba(6,22,17,0.82));backdrop-filter:blur(30px) saturate(160%);-webkit-backdrop-filter:blur(30px) saturate(160%);border:1px solid rgba(255,255,255,0.18);border-bottom:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.35),inset 0 -30px 40px -30px rgba(0,0,0,0.45)}
.g5 .scrim{background:rgba(2,17,13,0.40)}
.g5 .row .sq.primary{box-shadow:inset 0 1px 0 rgba(255,255,255,0.40),0 0 0 1px rgba(255,255,255,0.06)}`,
  },
  {
    id: 'g6', name: 'Floating card', blurb: 'not edge-to-edge: a glass card floating 14pt in from the sides and bottom',
    css: `.g6 .sheet{left:14px;right:14px;bottom:14px;border-radius:30px;background:linear-gradient(180deg,rgba(12,40,31,0.66),rgba(7,27,21,0.84));backdrop-filter:blur(30px) saturate(160%);-webkit-backdrop-filter:blur(30px) saturate(160%);border:1px solid rgba(255,255,255,0.14);box-shadow:inset 0 1px 0 rgba(255,255,255,0.26),0 20px 50px rgba(0,0,0,0.45);padding-bottom:18px}
.g6 .scrim{background:rgba(2,17,13,0.46)}`,
  },
  {
    id: 'g7', name: 'Green glow', blurb: 'emerald rim light, an emerald glow under the sheet, Post a job as a full glass pill',
    css: `.g7 .sheet{background:linear-gradient(180deg,rgba(10,36,28,0.60),rgba(7,27,21,0.80));backdrop-filter:blur(30px) saturate(170%);-webkit-backdrop-filter:blur(30px) saturate(170%);border:1px solid rgba(95,174,129,0.42);border-bottom:0;box-shadow:inset 0 1px 0 rgba(160,230,190,0.35),0 -12px 60px rgba(46,158,107,0.28)}
.g7 .scrim{background:rgba(2,17,13,0.36)}
.g7 .row.heavy{background:rgba(46,158,107,0.26);border:1px solid rgba(95,174,129,0.50);border-radius:999px;padding:12px 16px;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.30)}
.g7 .row.heavy .chev{display:none}.g7 .row.heavy .sq{width:26px;height:26px;background:transparent;border:0;box-shadow:none}
.g7 .rows{gap:6px}.g7 .row{border-top:0}.g7 .row:not(.heavy){border-top:1px solid rgba(255,255,255,0.06)}`,
  },
  {
    id: 'g8', name: 'Monochrome minimal', blurb: 'as little as possible: no circles, 18pt glyphs, hairlines, the tint is only the screen behind',
    css: `.g8 .sheet{background:rgba(5,20,15,0.58);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,0.10);border-bottom:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.18);gap:2px}
.g8 .scrim{background:rgba(2,17,13,0.38)}
.g8 .title{font-size:15px;font-weight:600;color:rgba(241,237,225,0.75);letter-spacing:.2px;text-transform:none;margin-bottom:4px}
.g8 .needs{padding:10px 4px;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,0.08);border-radius:0;box-shadow:none;margin-bottom:0}
.g8 .needs .circ{display:none}
.g8 .row{padding:13px 4px;font-weight:500}.g8 .row .sq,.g8 .switch .circ{width:22px;height:22px;background:transparent;border:0;box-shadow:none;border-radius:0}
.g8 .row .sq.primary{background:transparent;color:#5FAE81}.g8 .row .sq svg,.g8 .switch .circ svg{width:18px;height:18px}
.g8 .row.heavy{font-weight:600}`,
  },
];

variants.push({
    id: 'g1l', name: 'G1 in light', blurb: 'the chosen layout on the light sheet the app already has: flat white with a hairline (glass is dark-only in this app)',
    light: true,
    css: `.g1l .theme{--emerald:#0D6B52;--gold:#C8A15B;--mint:#E5F1EC;--ink:#13201B;--muted:#6E7771;--navInactive:#839087}
.g1l .sheet{background:#FFFFFF;border:1px solid #DDE2DD;border-bottom:0;box-shadow:0 -8px 30px rgba(19,32,27,0.10)}
.g1l .scrim{background:rgba(19,32,27,0.35)}
.g1l .grab{background:rgba(19,32,27,0.18)}
.g1l .needs{background:#F6F3EA;border:1px solid #DDE2DD;box-shadow:none}
.g1l .needs .circ{background:#E5F1EC;border-color:#CBE0D7}
.g1l .row{border-top-color:#EEF1EC}.g1l .row .sq.primary{background:#0D6B52;border-color:#0D6B52;box-shadow:none;color:#FFFFFF}
.g1l .needs .chev,.g1l .row .chev{color:#839087}
.g1l .switch{border-top-color:#DDE2DD}.g1l .switch .circ{border-color:#CBE0D7}.g1l .switch .hint{color:#6E7771}`,
  });

const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></symbol>
<symbol id="i-people" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 4.5"/></symbol>
<symbol id="i-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></symbol>
<symbol id="i-swap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13m0 0-3-3m3 3-3 3"/><path d="M20 17H7m0 0 3-3m-3 3 3 3"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></symbol>
<symbol id="i-paw" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="6" cy="9" r="2"/><circle cx="10" cy="5.5" r="2"/><circle cx="14" cy="5.5" r="2"/><circle cx="18" cy="9" r="2"/><path d="M12 10c-3.5 0-6.5 3-6.5 6 0 2 1.5 3 3 3 1.2 0 2-.6 3.5-.6s2.3.6 3.5.6c1.5 0 3-1 3-3 0-3-3-6-6.5-6z"/></symbol>
</defs></svg>`;

const base = `
  .theme-light{--bg:#F6F3EA}
  .theme-dark{--emerald:#5FAE81;--gold:#D4A24C;--mint:#0E1F18;--ink:#F1EDE1;--bg:#02110D;--muted:#93A096;--navInactive:#7C8A80;--postPillGreen:#0D6B52}
  html,body{margin:0;background:#E6E6E2;font-family:-apple-system,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;color:#222}
  .stage{display:flex;gap:28px;justify-content:center;align-items:flex-start;padding:28px 18px;flex-wrap:wrap}
  .slot{display:flex;flex-direction:column;align-items:center;gap:8px;width:393px}
  .slot-label{font-size:14px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#444}
  .slot-blurb{font-size:12px;color:#666;text-align:center;line-height:1.4;min-height:34px}
  .phone{position:relative;width:393px;height:852px;overflow:hidden;border-radius:44px;background:var(--bg);color:var(--ink);font-family:-apple-system,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;box-shadow:0 0 0 1px rgba(0,0,0,.12)}
  .backdrop{position:absolute;inset:0;width:393px;height:852px;display:block}
  .scrim{position:absolute;inset:0;background:rgba(2,17,13,0.4)}
  .sheet{position:absolute;left:0;right:0;bottom:0;border-radius:28px 28px 0 0;padding:10px 22px 30px;display:flex;flex-direction:column;gap:6px}
  .grab{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.28);margin:0 auto 8px}
  .title{font-size:17px;line-height:22px;font-weight:600;letter-spacing:-.2px;color:var(--ink);margin:0 0 8px}
  .needs{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);box-shadow:inset 0 1px 0 rgba(255,255,255,0.14);margin-bottom:6px}
  .needs .circ{width:36px;height:36px;border-radius:18px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.10);display:flex;align-items:center;justify-content:center;color:var(--gold);flex:0 0 auto}
  .needs .circ svg{width:18px;height:18px}
  .eyebrow{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--emerald)}
  .needs .what{font-size:15px;line-height:19px;font-weight:700;color:var(--ink)}
  .needs .job{font-size:12px;line-height:16px;color:var(--muted);margin-top:1px}
  .needs .chev,.row .chev{margin-left:auto;color:rgba(241,237,225,0.35)}
  .needs .chev svg,.row .chev svg{width:18px;height:18px}
  .rows{display:flex;flex-direction:column;margin-top:2px}
  .row{display:flex;align-items:center;gap:14px;padding:12px 2px;border-top:1px solid rgba(255,255,255,0.06);color:var(--ink);font-size:16px;font-weight:500}
  .row:first-child{border-top:0}
  .row .sq{width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;color:var(--emerald);flex:0 0 auto}
  .row .sq svg{width:20px;height:20px}
  .row .sq.primary{background:rgba(46,158,107,0.28);border:1px solid rgba(95,174,129,0.45);box-shadow:inset 0 1px 0 rgba(255,255,255,0.25);color:#FFFFFF}
  .row.heavy{font-weight:600}
  .switch{display:flex;align-items:center;gap:14px;padding:12px 2px 0;margin-top:4px;border-top:1px solid rgba(255,255,255,0.10);color:var(--ink);font-size:16px;font-weight:500}
  .switch .circ{width:34px;height:34px;border-radius:17px;border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;color:var(--emerald);flex:0 0 auto}
  .switch .circ svg{width:18px;height:18px}
  .switch .hint{margin-left:auto;font-size:13px;color:rgba(241,237,225,0.45)}
`;

const frame = (v) => `
  <div class="slot ${v.id}">
    <div class="slot-label">${v.id.toUpperCase()} · ${v.name}</div>
    <div class="slot-blurb">${v.blurb}</div>
    <div class="phone theme ${v.light ? 'theme-light' : 'theme-dark'}">
      <img class="backdrop" src="${v.light ? '__HOME_LIGHT__' : '__HOME_DARK__'}" alt="">
      <div class="scrim"></div>
      <div class="sheet">
        <div class="grab"></div>
        <p class="title">What do you need?</p>
        <div class="needs">
          <div class="circ"><svg><use href="#i-paw"/></svg></div>
          <div><div class="eyebrow">Needs you</div><div class="what">Review 2 bids</div><div class="job">Dog walking — twice this week</div></div>
          <div class="chev"><svg><use href="#i-chev"/></svg></div>
        </div>
        <div class="rows">
          <div class="row heavy"><div class="sq primary"><svg><use href="#i-plus"/></svg></div><span>Post a job</span><span class="chev"><svg><use href="#i-chev"/></svg></span></div>
          <div class="row"><div class="sq"><svg><use href="#i-people"/></svg></div><span>Hire again</span><span class="chev"><svg><use href="#i-chev"/></svg></span></div>
          <div class="row"><div class="sq"><svg><use href="#i-briefcase"/></svg></div><span>My jobs</span><span class="chev"><svg><use href="#i-chev"/></svg></span></div>
        </div>
        <div class="switch"><div class="circ"><svg><use href="#i-swap"/></svg></div><span>Switch to Worker</span><span class="hint">confirms first</span></div>
      </div>
    </div>
  </div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BRAZOS — the [+] popup as green glass, eight ways</title>
<!-- Generated by glass-sheet.build.mjs. The rows are fixed (operator, 2026-09-18):
     Needs you · Post a job · Hire again · My jobs · Switch to Worker. Only the glass differs.
     The sheet on the device is expo-blur over a scrim (materials.sheet); refraction is not drawable. -->
<style>${base}
${variants.map((v) => v.css).join('\n')}
</style>
</head>
<body>
${sprite}
<div class="stage">
${variants.map(frame).join('\n')}
</div>
</body>
</html>
`;

writeFileSync(join(here, 'glass-sheet.html'), html);
console.log(`wrote glass-sheet.html with ${variants.length} variants`);
