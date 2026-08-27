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
      { key: 'home.modeSwitch.paddingX', drew: 10, parent: null, fallback: '10' },
      { key: 'home.jobCard.padding', drew: 14, parent: null, fallback: '14' },
      { key: 'home.jobCard.gap', drew: 12, parent: 'theme.spacing.md', fallback: 'spacing.md' },
      { key: 'home.jobCard.thumbSize', drew: 104, parent: null, fallback: '104' },
      { key: 'home.jobCard.metaPaddingY', drew: 10, parent: null, fallback: '10' },
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

      // 7. THE WEARER READS IT, and falls back to the literal it drew — which
      //    is spelled in the screen exactly once, right here.
      const readsIt = `useDialNumber('${row.key}') ?? ${dial.fallback}`;
      assert.ok(
        source.includes(readsIt),
        `${screen.file} must read its own dial: ${readsIt}`,
      );
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
