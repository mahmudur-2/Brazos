import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fix run D7 (2026-10-03) — ONE SECTION-LABEL STYLE.
 *
 * Twenty-odd files hand-rolled their tracked caps labels at 9–14 pt with 0.5–1.4
 * tracking and 600–800 weights, so three measures disagreed on one screen. There
 * is one measure now, ui/tokens.ts `type.eyebrow` (12 / 700 / 1.5, uppercase),
 * which lib/theme.ts re-exports as EYEBROW_TYPE; a label picks only its colour.
 *
 * CATCHES: a section label that sets its own size, weight or tracking, or that
 * stops spreading EYEBROW_TYPE. A label is any style whose key names it one
 * (eyebrow / sectionLabel / sectionTitle / …Eyebrow) and that is tracked caps
 * (positive tracking, uppercase, or the eyebrow spread), plus the labels the
 * fix-run spec named under other keys. Headings that happen to be called
 * `sectionTitle` (20 pt display, no tracking) are not labels and are not read.
 *
 * NOT READ, on purpose: the auth flow's labels (they spread lib/authTheme's
 * `authType`, the sanctioned auth-surface exception), TextField / AuthField
 * field labels, PublicProfile's wordmark and the design studio's own panel.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');

const files = ['screens', 'components'].flatMap((dir) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.tsx') && !f.includes('.web.') && !f.includes('DesignStudio'))
    .map((f) => `${dir}/${f}`),
);

/** Labels the spec named whose keys the name rule does not catch. */
const NAMED = {
  'screens/ClientJobDetailScreen.tsx': ['valueLabel'],
  'screens/DeleteAccountScreen.tsx': ['blockerGroup'],
  'screens/EarningsScreen.tsx': ['bucketLabel'],
  'screens/JobDetailScreen.tsx': ['similarTitle'],
  'screens/ProfileScreen.tsx': ['fieldLabel'],
  'components/JobLivePage.tsx': ['label'],
  'components/JobSummaryCard.tsx': ['label'],
};
const LABEL_KEY = /(eyebrow|sectionLabel|sectionTitle|Eyebrow)/;

/** Every `key: { …flat body… }` style block in a file. */
function styleBlocks(source) {
  const out = [];
  const re = /^[ \t]+([A-Za-z]\w*): \{([^{}]*)\}/gm;
  let m;
  while ((m = re.exec(source))) out.push({ key: m[1], body: m[2].replace(/\/\/[^\n]*/g, '') });
  return out;
}

const isTrackedCaps = (body) =>
  /letterSpacing: (0\.[5-9]|[1-9])/.test(body) || /uppercase/.test(body) || /\.\.\.EYEBROW_TYPE\b/.test(body);

test('[static] D7: there is one eyebrow measure, and lib/theme re-exports it', () => {
  const tokens = read('ui/tokens.ts');
  const eyebrow = /\n  eyebrow: \{([^}]*)\}/.exec(tokens.slice(tokens.indexOf('export const type = {')));
  assert.ok(eyebrow, 'ui/tokens.ts type.eyebrow must stay a plain object');
  assert.match(eyebrow[1], /fontSize: 12,\s*fontWeight: '700',\s*letterSpacing: 1\.5,\s*textTransform: 'uppercase',/);
  assert.match(read('lib/theme.ts'), /export const EYEBROW_TYPE = tokenType\.eyebrow satisfies TextStyle;/);
});

test('[static] D7: every section label spreads EYEBROW_TYPE and sets no size, weight or tracking', () => {
  let labels = 0;
  for (const file of files) {
    const source = read(file);
    const named = NAMED[file] ?? [];
    for (const { key, body } of styleBlocks(source)) {
      const isLabel = named.includes(key) || (LABEL_KEY.test(key) && isTrackedCaps(body));
      if (!isLabel || /\.\.\.authType\./.test(body)) continue;
      labels += 1;
      assert.match(body, /^\s*\.\.\.EYEBROW_TYPE,/, `${file} ${key}: a section label spreads EYEBROW_TYPE first`);
      for (const prop of ['fontSize', 'fontWeight', 'letterSpacing', 'textTransform']) {
        assert.doesNotMatch(body, new RegExp(`\\b${prop}:`), `${file} ${key}: ${prop} is the eyebrow's, not the label's`);
      }
    }
  }
  assert.ok(labels >= 35, `the census must actually find the labels (found ${labels})`);
});

test('[static] D7 review: a label in a third-of-the-phone tile shrinks to one line rather than breaking mid-word', () => {
  // Earnings' three buckets: "TRANSFERRED" at the one measure is wider than its tile.
  assert.match(
    read('screens/EarningsScreen.tsx'),
    /<Text style=\{styles\.bucketLabel\} numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.75\}>/,
  );
});

test('[static] D7: the Filters section label is the eyebrow colour, not the muted grey', () => {
  assert.match(read('components/JobFilterSheet.tsx'), /sectionLabel: \{\s*\.\.\.EYEBROW_TYPE,\s*color: colors\.eyebrow,\s*\}/);
});
