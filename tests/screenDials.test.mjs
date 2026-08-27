import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * RUN T2 — THE SCREEN-LOCAL DIALS.
 *
 * Twelve screens carry furniture no shared dial can reach, because the number
 * is spelled in that screen's own `StyleSheet.create` and nowhere else. T2
 * gives the operator that reach without moving a pixel, and this file is what
 * proves the second half of that sentence.
 *
 * WHAT IT ASSERTS, per screen:
 *
 *   1. EVERY KEY THE SCREEN DECLARES IS READ BY THAT SCREEN. A registry row
 *      whose wearer never calls `useDialNumber`/`useDialString` on it is a
 *      dead control — it renders in the panel, moves nothing, and is worse
 *      than an absent dial because it lies.
 *   2. EVERY DEFAULT IS THE VALUE THE FILE DREW BEFORE T2. The expected
 *      number is QUOTED in the table below, and it is checked twice: against
 *      the registry's declared `defaultValue`, and against the `?? …` the
 *      screen falls back to. For an inheriting dial the quoted number is
 *      checked against the SHIPPED token table in ui/tokens.ts as well, so
 *      "inherits theme.spacing.md" cannot quietly become a different 12.
 *   3. THE PARENT COMES FROM THE SCALE THE FILE ITSELF IMPORTS. lib/theme's
 *      `theme.spacing.xl` is 24 and ui/tokens' `spacing.xl` is 20; the two are
 *      deliberately not aliased, so a child pointed at the wrong scale sits
 *      right until the operator turns the parent and then jumps by the
 *      difference. The table records which module each screen imports from and
 *      this fence re-reads the screen to confirm it.
 *   4. NO TYPOGRAPHIC KEY EXISTS. The type is the operator's; T2 does not
 *      tokenise, dial or touch a size, weight, leading, tracking or family.
 *   5. THE CEILING HOLDS — at most twelve dials per screen. The panel is
 *      browsed by a human on a phone.
 *
 * WHY IT IS NOT VACUOUS: every number is read out of two files that do not
 * import each other (the registry and the screen), and compared against a
 * third (the shipped token table). Any one of them moving alone goes red.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const SCHEMA_SOURCE = await read('ui/designStudioSchema.ts');

/** At most this many dials per screen — S1's ceiling, not a target. */
const CEILING = 12;

/**
 * The dials each screen declares, with the value that screen DREW before T2
 * quoted beside it. `parent` is the registry's `inheritsFrom`, or null for a
 * value that corresponds to no token in its own file's scale.
 */
const SCREENS = [
  {
    subcategory: 'Customer Home',
    file: 'screens/HomeScreen.tsx',
    prefix: 'home',
    // Imports `spacing`/`radius` from '../lib/theme', so its parents are the
    // `theme.*` scale — never ui/tokens' bare `spacing.*`.
    scale: 'theme',
    dials: [
      { key: 'home.promoCard.radius', drew: 22, parent: null, fallback: '22' },
      // The one CONDITIONAL wearer in the run. See `applied` below.
      {
        key: 'home.modeSwitch.paddingX',
        drew: 10,
        parent: null,
        applied: 'conditional',
        varName: 'modeSwitchPaddingX',
        property: 'paddingHorizontal',
        style: 'modeSwitch',
      },
      { key: 'home.jobCard.padding', drew: 14, parent: null, fallback: '14' },
      { key: 'home.jobCard.gap', drew: 12, parent: 'theme.spacing.md', fallback: 'spacing.md' },
      { key: 'home.jobCard.thumbSize', drew: 104, parent: null, fallback: '104' },
      { key: 'home.jobCard.metaPaddingY', drew: 10, parent: null, fallback: '10' },
    ],
  },
  {
    subcategory: 'Worker Home',
    file: 'screens/WorkerHomeScreen.tsx',
    prefix: 'workerHome',
    scale: 'theme',
    dials: [
      { key: 'workerHome.summaryCard.radius', drew: 16, parent: 'theme.radius.lg', fallback: 'radius.lg' },
      { key: 'workerHome.summaryCard.gap', drew: 14, parent: null, fallback: '14' },
      { key: 'workerHome.content.paddingX', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'workerHome.content.gap', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'workerHome.modeSwitch.paddingX', drew: 13, parent: null, fallback: '13' },
    ],
  },
  {
    subcategory: 'Post a Job',
    file: 'screens/PostJobScreen.tsx',
    prefix: 'postJob',
    scale: 'theme',
    dials: [
      { key: 'postJob.progress.height', drew: 4, parent: null, fallback: '4' },
      { key: 'postJob.content.paddingX', drew: 24, parent: 'theme.spacing.xl', fallback: 'spacing.xl' },
      { key: 'postJob.content.gap', drew: 24, parent: 'theme.spacing.xl', fallback: 'spacing.xl' },
      { key: 'postJob.stepFields.gap', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'postJob.description.height', drew: 110, parent: null, fallback: '110' },
      { key: 'postJob.reviewCard.radius', drew: 24, parent: 'theme.radius.xl', fallback: 'radius.xl' },
    ],
  },
  {
    subcategory: 'My Jobs',
    file: 'screens/MyJobsHubScreen.tsx',
    prefix: 'myJobs',
    scale: 'theme',
    dials: [
      { key: 'myJobs.tabs.height', drew: 50, parent: null, fallback: '50' },
      { key: 'myJobs.tabs.radius', drew: 16, parent: 'theme.radius.lg', fallback: 'radius.lg' },
      { key: 'myJobs.content.gap', drew: 24, parent: 'theme.spacing.xl', fallback: 'spacing.xl' },
      { key: 'myJobs.empty.paddingY', drew: 32, parent: 'theme.spacing.xxl', fallback: 'spacing.xxl' },
      { key: 'myJobs.headerMark.size', drew: 48, parent: null, fallback: '48' },
    ],
  },
  {
    subcategory: 'Profile',
    file: 'screens/ProfileScreen.tsx',
    prefix: 'profile',
    scale: 'theme',
    dials: [
      { key: 'profile.settingsRow.height', drew: 64, parent: null, fallback: '64' },
      { key: 'profile.hubCard.radius', drew: 24, parent: 'theme.radius.xl', fallback: 'radius.xl' },
      { key: 'profile.hubCard.padding', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'profile.settingsGlyph.size', drew: 44, parent: null, fallback: '44' },
      { key: 'profile.content.gap', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
    ],
  },
  {
    subcategory: 'Inbox',
    file: 'screens/MessagesInboxScreen.tsx',
    prefix: 'messages',
    scale: 'theme',
    dials: [
      { key: 'messages.filterPill.height', drew: 34, parent: null, fallback: 'FILTER_PILL_HEIGHT' },
      { key: 'messages.list.gap', drew: 12, parent: 'theme.spacing.md', fallback: 'spacing.md' },
      { key: 'messages.list.paddingX', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'messages.filterRow.gap', drew: 8, parent: 'theme.spacing.sm', fallback: 'spacing.sm' },
    ],
  },
  {
    subcategory: 'Job & Bids',
    file: 'screens/ClientJobDetailScreen.tsx',
    prefix: 'clientJobDetail',
    scale: 'theme',
    dials: [
      { key: 'clientJobDetail.jobHero.radius', drew: 24, parent: 'theme.radius.xl', fallback: 'radius.xl' },
      { key: 'clientJobDetail.jobHero.padding', drew: 24, parent: 'theme.spacing.xl', fallback: 'spacing.xl' },
      { key: 'clientJobDetail.content.paddingX', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'clientJobDetail.content.gap', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'clientJobDetail.iconCircle.size', drew: 36, parent: null, fallback: '36' },
    ],
  },
  {
    subcategory: 'Job Details',
    file: 'screens/JobDetailScreen.tsx',
    prefix: 'jobDetail',
    scale: 'theme',
    dials: [
      { key: 'jobDetail.detailSurface.paddingX', drew: 24, parent: 'theme.spacing.xl', fallback: 'spacing.xl' },
      { key: 'jobDetail.detailContent.gap', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'jobDetail.detailSurface.paddingY', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'jobDetail.iconCircle.size', drew: 54, parent: null, fallback: '54' },
    ],
  },
  {
    subcategory: 'Compare Bids',
    file: 'screens/CompareBidsScreen.tsx',
    prefix: 'compareBids',
    scale: 'theme',
    dials: [
      { key: 'compareBids.row.radius', drew: 24, parent: 'theme.radius.xl', fallback: 'radius.xl' },
      { key: 'compareBids.rowHighest.borderWidth', drew: 2, parent: null, fallback: '2' },
      { key: 'compareBids.row.padding', drew: 16, parent: 'theme.spacing.lg', fallback: 'spacing.lg' },
      { key: 'compareBids.list.gap', drew: 12, parent: 'theme.spacing.md', fallback: 'spacing.md' },
      { key: 'compareBids.protectsGlyph.size', drew: 34, parent: null, fallback: '34' },
    ],
  },
  {
    subcategory: 'Discover',
    file: 'screens/WorkerSearchScreen.tsx',
    prefix: 'workerSearch',
    scale: 'theme',
    dials: [
      { key: 'workerSearch.serviceTile.width', drew: 108, parent: null, fallback: '108' },
      { key: 'workerSearch.serviceTile.height', drew: 96, parent: null, fallback: '96' },
      { key: 'workerSearch.serviceTile.radius', drew: 16, parent: 'theme.radius.lg', fallback: 'radius.lg' },
      { key: 'workerSearch.chipRow.gap', drew: 8, parent: 'theme.spacing.sm', fallback: 'spacing.sm' },
    ],
  },
];

// ---------------------------------------------------------------------------
// The registry's own screen rows, parsed out of the source rather than
// executed — the executed-module path already has a fence
// (tests/designStudio.test.mjs); what this file needs is the TEXT, so that
// the row and the screen can be compared without either one being trusted.
// ---------------------------------------------------------------------------

const screensBlock = (() => {
  const hit = /function screenDialEntries\(\): StudioEntry\[\] \{\n([\s\S]*?)\n\}\n/.exec(
    SCHEMA_SOURCE,
  );
  assert.ok(hit, 'ui/designStudioSchema.ts must keep screenDialEntries() a plain function');
  return hit[1];
})();

/** One `dialEntries('screens', '<subcategory>', [...])` group's row text. */
function groupFor(subcategory) {
  const start = screensBlock.indexOf(`...dialEntries('screens', '${subcategory}', [`);
  if (start < 0) return null;
  const rest = screensBlock.slice(start);
  const end = rest.indexOf('\n    ]),');
  assert.ok(end > 0, `${subcategory}: the group must close with the standard "]),"`);
  return rest.slice(0, end);
}

/**
 * Every row in a group, in the fixed field order the category is written in:
 * key, label, description, tier, scope, min, max, step, [inheritsFrom],
 * defaultValue. The order is part of the contract — it is what lets this
 * fence read the rows without executing them.
 */
function rowsOf(groupText) {
  const ROW =
    /\{\s*key: '([A-Za-z][\w.]*)',\s*label: '([^']+)',\s*description: '([^']+)',\s*tier: '(basic|advanced)',\s*scope: '(local|token)',\s*min: (-?\d+(?:\.\d+)?),\s*max: (-?\d+(?:\.\d+)?),\s*step: (\d+(?:\.\d+)?),\s*(?:inheritsFrom: '([\w.]+)',\s*)?defaultValue: ([\w.]+),\s*\}/g;
  const rows = [];
  for (const m of groupText.matchAll(ROW)) {
    rows.push({
      key: m[1],
      label: m[2],
      description: m[3],
      tier: m[4],
      scope: m[5],
      min: Number(m[6]),
      max: Number(m[7]),
      step: Number(m[8]),
      inheritsFrom: m[9] ?? null,
      defaultValue: m[10],
    });
  }
  return rows;
}

/**
 * A metric key's SHIPPED value, read out of ui/tokens.ts's default tables —
 * the same tables the registry's metric dials mirror. This is what makes
 * "inherits theme.spacing.md" checkable against a quoted 12.
 */
const TOKENS_SOURCE = await read('ui/tokens.ts');
const TABLE_FOR = {
  'theme.spacing': 'THEME_SPACING_DEFAULTS',
  'theme.radius': 'THEME_RADIUS_DEFAULTS',
  spacing: 'SPACING_DEFAULTS',
  radius: 'RADIUS_DEFAULTS',
};
function shippedMetric(metricKey) {
  const cut = metricKey.lastIndexOf('.');
  const table = TABLE_FOR[metricKey.slice(0, cut)];
  assert.ok(table, `${metricKey}: not a key on either shipped scale`);
  const block = new RegExp(`export const ${table} = \\{([\\s\\S]*?)\\}`).exec(TOKENS_SOURCE);
  assert.ok(block, `ui/tokens.ts must keep ${table} a plain object literal`);
  const hit = new RegExp(`\\b${metricKey.slice(cut + 1)}: (\\d+)`).exec(block[1]);
  assert.ok(hit, `${table} must carry ${metricKey}`);
  return Number(hit[1]);
}

/** The default-value expression a row declares, resolved to a number. */
function declaredDefault(row) {
  if (/^\d+(\.\d+)?$/.test(row.defaultValue)) return Number(row.defaultValue);
  const named = /^(THEME_SPACING_DEFAULTS|THEME_RADIUS_DEFAULTS|SPACING_DEFAULTS|RADIUS_DEFAULTS)\.(\w+)$/.exec(
    row.defaultValue,
  );
  assert.ok(named, `${row.key}: defaultValue must be a literal or a shipped defaults entry`);
  const scale = { THEME_SPACING_DEFAULTS: 'theme.spacing', THEME_RADIUS_DEFAULTS: 'theme.radius', SPACING_DEFAULTS: 'spacing', RADIUS_DEFAULTS: 'radius' }[named[1]];
  return shippedMetric(`${scale}.${named[2]}`);
}

/** Property words a screen dial may reach, and the ones it may never. */
const VISUAL_WORDS = [
  'radius',
  'padding',
  'gap',
  'size',
  'height',
  'width',
  'opacity',
  'border',
  'fill',
  'color',
  'inset',
  'offset',
  'margin',
];
const TYPOGRAPHIC_WORDS = ['font', 'line', 'letter', 'track', 'weight', 'leading', 'family', 'text'];

// ---------------------------------------------------------------------------
// The category itself
// ---------------------------------------------------------------------------

test('T2: the Screens category exists, and it is one category with per-screen subcategories', () => {
  const flat = stripComments(SCHEMA_SOURCE).replace(/\s+/g, ' ');
  assert.match(
    flat,
    /\{ key: 'screens', label: 'Screens', icon: '[a-z-]+' \}/,
    'the roster must carry exactly one Screens category',
  );
  assert.match(flat, /\.\.\.screenDialEntries\(\),/, 'the registry must spread the screen dials');
  assert.match(flat, /\| 'screens'/, "'screens' must be a StudioCategoryKey");
  // Every screen group names the SAME category, so the panel groups them under
  // one heading rather than scattering twelve of them through the tree.
  for (const group of screensBlock.matchAll(/\.\.\.dialEntries\('([a-z]+)', '/g)) {
    assert.equal(group[1], 'screens', 'a screen group may only join the Screens category');
  }
});

test('T2: no screen dial reaches the type', () => {
  for (const screen of SCREENS) {
    for (const dial of screen.dials) {
      const property = dial.key.slice(dial.key.lastIndexOf('.') + 1).toLowerCase();
      assert.ok(
        VISUAL_WORDS.some((word) => property.includes(word)),
        `${dial.key}: '${property}' is not a value anyone SEES at a glance`,
      );
      for (const banned of TYPOGRAPHIC_WORDS) {
        assert.ok(
          !property.includes(banned),
          `${dial.key}: '${banned}' is typography, and the type is the operator's own`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Per screen
// ---------------------------------------------------------------------------

for (const screen of SCREENS) {
  test(`T2: ${screen.file} — its dials are declared, read, and launch at what it drew`, async () => {
    const source = stripComments(await read(screen.file));

    // 1. THE CEILING.
    assert.ok(
      screen.dials.length <= CEILING,
      `${screen.file}: ${screen.dials.length} dials is over the ${CEILING} ceiling`,
    );

    // 2. THE REGISTRY ROWS ARE EXACTLY THIS SCREEN'S DIALS, in order.
    const group = groupFor(screen.subcategory);
    assert.ok(group, `the registry must carry a '${screen.subcategory}' group`);
    const rows = rowsOf(group);
    assert.deepEqual(
      rows.map((row) => row.key),
      screen.dials.map((dial) => dial.key),
      `${screen.file}: the registry rows and this fence's table must agree, in order`,
    );

    for (const [index, row] of rows.entries()) {
      const dial = screen.dials[index];

      // 3. NAMING: <screen>.<element>.<property>, and the screen's own prefix.
      assert.match(
        row.key,
        /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/,
        `${row.key}: keys are <screen>.<element>.<property>`,
      );
      assert.ok(
        row.key.startsWith(`${screen.prefix}.`),
        `${row.key}: must live under this screen's own namespace`,
      );

      // 4. A SCREEN DIAL IS LOCAL BY DEFINITION — nothing else reads it.
      assert.equal(row.scope, 'local', `${row.key}: a screen's own value is local`);
      assert.ok(row.label.trim().length > 0 && row.description.trim().length > 0);

      // 5. THE DEFAULT IS WHAT THE FILE DREW. Quoted here, checked against the
      //    registry's declaration and against the screen's own fallback.
      assert.equal(
        declaredDefault(row),
        dial.drew,
        `${row.key}: the registry must launch at the ${dial.drew} this screen drew`,
      );
      assert.ok(
        row.min <= dial.drew && dial.drew <= row.max,
        `${row.key}: ${dial.drew} sits outside its own ${row.min}..${row.max} range`,
      );

      // 6. THE PARENT IS ON THE SCALE THIS FILE IMPORTS FROM.
      assert.equal(row.inheritsFrom, dial.parent, `${row.key}: unexpected parent`);
      if (dial.parent) {
        const onThemeScale = dial.parent.startsWith('theme.');
        assert.equal(
          onThemeScale,
          screen.scale === 'theme',
          `${row.key}: ${dial.parent} is not the scale ${screen.file} imports from`,
        );
        assert.equal(
          shippedMetric(dial.parent),
          dial.drew,
          `${row.key}: ${dial.parent} ships at a different number than the ${dial.drew} quoted here`,
        );
      }

      // 7. THE WEARER READS IT, and falls back to the value it drew — which is
      //    spelled in the screen exactly once.
      //
      //    TWO SHAPES, and the second exists for a measured reason. The normal
      //    shape resolves the fallback in the read (`?? literal`) and applies
      //    the result unconditionally. The CONDITIONAL shape leaves the shipped
      //    value in the stylesheet and applies the dial only once the operator
      //    has turned it, because on that one control the mere PRESENCE of an
      //    inline style — an inline attribute rather than an atomic class, on
      //    React Native Web — moved 26 pixels by one unit on one channel where
      //    the pill is composited under the services sheet's scrim. An
      //    `undefined` member is dropped from a style array: no key, no node,
      //    no pixel. Either shape keeps the number spelled exactly once.
      if (dial.applied === 'conditional') {
        assert.ok(
          source.includes(`const ${dial.varName} = useDialNumber('${row.key}');`),
          `${screen.file}: a conditional wearer reads the dial raw, with no ?? fallback`,
        );
        assert.ok(
          source.includes(
            `${dial.varName} !== undefined && { ${dial.property}: ${dial.varName} }`,
          ),
          `${screen.file}: an untouched conditional dial must add no style member at all`,
        );
        const block = new RegExp(`\\n  ${dial.style}: \\{([^}]*)\\}`).exec(source);
        assert.ok(block, `${screen.file}: ${dial.style} must stay a plain style object`);
        assert.match(
          block[1],
          new RegExp(`${dial.property}: ${dial.drew},`),
          `${screen.file}: ${dial.style} keeps the ${dial.drew} the dial launches at`,
        );
        continue;
      }

      const readsIt = `useDialNumber('${row.key}') ?? ${dial.fallback}`;
      assert.ok(
        source.includes(readsIt),
        `${screen.file} must read its own dial: ${readsIt}`,
      );

      // 7b. A SCREEN THAT ALREADY OWNED ITS NUMBER AS A NAMED CONSTANT keeps
      //     it there, and the constant must still be the value quoted above —
      //     otherwise the fallback is a name pointing at something else.
      if (/^[A-Z][A-Z0-9_]*$/.test(dial.fallback)) {
        assert.match(
          source,
          new RegExp(`const ${dial.fallback} = ${dial.drew};`),
          `${screen.file}: ${dial.fallback} must still be the ${dial.drew} this dial launches at`,
        );
      }
    }

    // 8. THE SCALE THE FILE ACTUALLY IMPORTS, re-read rather than trusted.
    if (screen.scale === 'theme') {
      assert.match(
        source,
        /import \{[\s\S]*?\} from '\.\.\/lib\/theme';/,
        `${screen.file}: the table says it takes the theme scale`,
      );
    } else {
      assert.match(
        source,
        /from '\.\.\/ui\/tokens'/,
        `${screen.file}: the table says it takes the Emerald scale`,
      );
    }
    assert.match(
      source,
      /import \{ useDialNumber(?:, useDialString)? \} from '\.\.\/lib\/designOverrides';/,
      `${screen.file}: the dial read comes from the store, not a local copy`,
    );
  });
}
