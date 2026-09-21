// THE DARK REBUILD'S DIRECTIONS (2026-09-21) — candidate dark token tables,
// each a lib/designOverrides.ts DesignOverrides object, rendered as REAL app
// screens by `node scripts/shots.mjs --design docs/mockups/directions/<x>.json
// --suffix .<x>`. The operator picks from renders, not from prose; this file
// is where each direction's numbers live and what each one varies.
//
//   node docs/mockups/directions/build.mjs      writes a.json … e.json beside it
//
// TODAY (the baseline every direction is measured against — ui/tokens.ts
// `dark`, lib/theme.ts `darkColors`, "Emerald Prestige v2", derived from the
// numbered PNG masters): ground #02110D, surface #0A1813, the hairline a WARM
// GOLD #55482E on `border` / `line` / `homeHairline` (what the operator calls
// "faded gold"), pill rims mint2 #254539, sage secondaryBorder #2F5140, ink
// #F1EDE1, muted #93A096, emerald #5FAE81, gold #D4A24C, the chosen state a
// gold outline (lib/theme.ts selectedInDark).
//
// WHAT AN OVERRIDE CAN AND CANNOT SHOW. `palette.dark['app.<role>']` replaces
// a lib/theme role, `['emerald.<token>']` a ui/tokens §I token; `materials`
// re-mixes the glass. Three things are NOT dialable and render as today in
// every direction: the Home atmosphere raster (a file), the Filters sheet's
// own gradient (paneFills, approved 2026-09-21) and the panes' own rims
// (paneEdges). The chosen state's colour follows `gold` — so a direction
// that wants emerald chosen outlines with gold prices is a CODE decision
// (selectedInDark) the render cannot separate; direction e shows the
// no-gold extreme instead.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** One value for every hairline role, in both namespaces — the roles that
 *  draw lines: card edges, dividers, the Home hairline, the §I `line`. */
const hairlines = (hex) => ({
  'app.border': hex,
  'app.homeHairline': hex,
  'emerald.line': hex,
});

const DIRECTIONS = {
  // a — DEEP EMERALD. The ground as today; the surfaces one step lighter and
  // greener; every hairline a MINT-GREY (the brand mint at .14 over the
  // surface, flattened: #2C3C36) instead of the warm gold; the pill rims and
  // the sage rim untouched; gold stays for accents. Glass as today.
  a: {
    palette: {
      dark: {
        ...hairlines('#2C3C36'),
        'app.surface': '#0E2119',
        'emerald.surface': '#0E2119',
        'app.taskCardEdge': '#2C3C36',
        'emerald.taskCardEdge': '#2C3C36',
        'app.neutralBg': '#1A2A24',
      },
    },
  },
  // b — CHARCOAL FOREST. The ground lifted a step off black-green and
  // desaturated (#0A1411), surfaces #12201B, NEUTRAL grey hairlines
  // (#2A3430) and rims, the muted inks a touch brighter for the lifted
  // ground, emerald and gold a touch brighter; calmer glass (deeper scrims,
  // a neutral pale rim).
  b: {
    palette: {
      dark: {
        ...hairlines('#2A3430'),
        'app.background': '#0A1411',
        'app.homeBackground': '#0A1411',
        'emerald.bg': '#0A1411',
        'app.surface': '#12201B',
        'emerald.surface': '#12201B',
        'app.primarySoft': '#15241E',
        'app.mint': '#15241E',
        'emerald.mint': '#15241E',
        'app.mint2': '#2E3F38',
        'emerald.mint2': '#2E3F38',
        'app.secondaryBorder': '#324740',
        'emerald.secondaryBorder': '#324740',
        'app.taskCardEdge': '#2A3430',
        'emerald.taskCardEdge': '#2A3430',
        'app.neutralBg': '#1C2622',
        'app.textMuted': '#9AA5A0',
        'app.homeSlate': '#9AA5A0',
        'emerald.muted': '#9AA5A0',
        'app.navInactive': '#7F8A85',
        'emerald.navInactive': '#7F8A85',
        'app.emerald': '#6BBF8E',
        'emerald.emerald': '#6BBF8E',
        'app.success': '#6BBF8E',
        'app.gold': '#D9AE5C',
        'emerald.gold': '#D9AE5C',
      },
    },
    materials: {
      pane: { scrimAlpha: 0.92, borderColor: '#C9D3CE', borderAlpha: 0.3 },
      sheet: { scrimAlpha: 0.8, borderColor: '#C9D3CE', borderAlpha: 0.2 },
      menu: { scrimAlpha: 0.88, borderColor: '#C9D3CE', borderAlpha: 0.2 },
    },
  },
  // c — LIGHT, INVERTED. Light's own logic flipped: the ground a dark
  // green-grey (#0E1A15, where light is ivory), the surface the ground
  // lifted by light's own step (#15241E, where light lifts ivory to white),
  // the hairline the surface pushed by the step light uses (#2A3D35, as
  // #DDE2DD sits off white), the sage fills a deep sage (#16302A / #1F3E34 /
  // #26473C for mint / mint2 / secondaryBorder), the muted ink brighter, the
  // accents brightened for the darker field. The glass takes the surface as
  // its ink so every pane is the same material as a card.
  c: {
    palette: {
      dark: {
        ...hairlines('#2A3D35'),
        'app.background': '#0E1A15',
        'app.homeBackground': '#0E1A15',
        'emerald.bg': '#0E1A15',
        'app.surface': '#15241E',
        'emerald.surface': '#15241E',
        'app.primarySoft': '#16302A',
        'app.mint': '#16302A',
        'emerald.mint': '#16302A',
        'app.mint2': '#1F3E34',
        'emerald.mint2': '#1F3E34',
        'app.secondaryBorder': '#26473C',
        'emerald.secondaryBorder': '#26473C',
        'app.taskCardEdge': '#2A3D35',
        'emerald.taskCardEdge': '#2A3D35',
        'app.taskCardLitTop': '#1B3028',
        'emerald.taskCardLitTop': '#1B3028',
        'app.taskCardLitBottom': '#15241E',
        'emerald.taskCardLitBottom': '#15241E',
        'app.neutralBg': '#1C2A25',
        'app.textMuted': '#A3AEA8',
        'app.homeSlate': '#A3AEA8',
        'emerald.muted': '#A3AEA8',
        'app.textSubtle': '#8A958F',
        'app.emerald': '#6FCB96',
        'emerald.emerald': '#6FCB96',
        'app.success': '#6FCB96',
        'app.gold': '#E0B45C',
        'emerald.gold': '#E0B45C',
      },
    },
    materials: {
      pane: { scrimColor: '#15241E', scrimAlpha: 0.9 },
      sheet: { scrimColor: '#15241E', scrimAlpha: 0.8 },
      menu: { scrimColor: '#15241E', scrimAlpha: 0.88 },
    },
  },
  // d — PRESTIGE, BALANCED (the control). Everything as today except the
  // gold hairline, toned: the same warm hue with its chroma pulled toward
  // the ground (#3F3A2D) on every line role, so lines stop competing with
  // the gold accents they sit beside.
  d: {
    palette: {
      dark: {
        ...hairlines('#3F3A2D'),
      },
    },
  },
  // e — EMERALD ONLY. Direction a with the gold RETIRED: every gold role —
  // prices' eyebrows, the greeting's name, Done, the chosen outlines, the
  // [+] tile — becomes a pale mint (#9BD4B3), so the whole app reads in one
  // green family. The extreme, to see whether gold is wanted at all.
  e: {
    palette: {
      dark: {
        ...hairlines('#2C3C36'),
        'app.surface': '#0E2119',
        'emerald.surface': '#0E2119',
        'app.taskCardEdge': '#2C3C36',
        'emerald.taskCardEdge': '#2C3C36',
        'app.neutralBg': '#1A2A24',
        'app.gold': '#9BD4B3',
        'emerald.gold': '#9BD4B3',
        'app.goldSoft': '#14271F',
        'emerald.goldSoft': '#14271F',
      },
    },
  },
};

for (const [name, overrides] of Object.entries(DIRECTIONS)) {
  const file = join(here, `${name}.json`);
  writeFileSync(file, JSON.stringify({ materials: {}, ...overrides }, null, 2) + '\n');
  console.log('wrote', file);
}
