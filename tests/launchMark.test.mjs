import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
/** JSX wraps freely; the assertions below are about tokens, not line breaks. */
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// ===========================================================================
// REGRESSION FENCES for the launch mark's corners (RUN N2).
//
// b3adab3 repointed LAUNCH_MARK at the shipped app icon — PNG colour type 2,
// no alpha channel — so the squircle that used to arrive baked into the
// asset's alpha stopped existing, and the mark drew as a hard square on the
// launch layer. The fix is a RENDER-TIME radius: LaunchScreen derives it from
// the mark's rendered size and BrandLogo clips the Image with it. These
// fences pin that mechanism. What the asset IS stays fenced elsewhere
// (tests/pwa.test.mjs measures the file; the BAKED_ART roster in
// tests/themeResolution.test.mjs records its bake) — nothing here opens a
// PNG.
// ===========================================================================

// ---------------------------------------------------------------------------
// L1 — the launch mark's radius is a PROPORTION of its rendered size.
//
// CATCHES: the radius being dropped (square corners again), hardcoded as a
// bare number or spacing token that stops scaling with the mark, or "fixed"
// by repointing LAUNCH_MARK at a baked-alpha asset — which would move the
// BAKED_ART roster and re-split the icon from the launch mark.
//
// WHY NOT VACUOUS: the size expression is parsed OUT of the call site and the
// radius expression must be exactly that expression times the named ratio.
// Renaming the constant, inlining 0.187 at the call site, or sizing the mark
// by a new expression without re-deriving the radius all fail the parse or
// the equality, not pass it.
// ---------------------------------------------------------------------------
test('the launch mark is rounded at render time, as a proportion of its rendered size', () => {
  const launch = flatten(read('screens/LaunchScreen.tsx'));

  // The one-asset unification stands: the mark IS the shipped app icon.
  assert.match(
    launch,
    /const LAUNCH_MARK = require\('\.\.\/assets\/brand\/app-icon-b-leaf\.png'\);/,
    'LAUNCH_MARK must keep pointing at the shipped app icon — the corner fix is a render-time mask, never a repoint'
  );

  // The ratio is one named module constant the operator can change alone. Its
  // value is a COPY of app-icon-v2.png's baked alpha radius (~18.7% of
  // width), recorded as text in components/BrandLogo.tsx's SOURCE comment.
  const ratio = launch.match(/const LAUNCH_MARK_RADIUS_RATIO = ([0-9.]+);/);
  assert.ok(ratio, 'LAUNCH_MARK_RADIUS_RATIO is gone from screens/LaunchScreen.tsx');
  assert.equal(
    Number(ratio[1]),
    0.187,
    'the launch mark radius ratio is a copy of app-icon-v2.png’s baked ~18.7%, not a free choice'
  );

  const call = launch.match(
    /<BrandLogo size=\{([^{}]+)\} elevated source=\{LAUNCH_MARK\} radius=\{([^{}]+)\}/
  );
  assert.ok(call, 'the LAUNCH_MARK BrandLogo call site no longer passes a radius — the mark renders square');
  const [, sizeExpr, radiusExpr] = call;
  assert.equal(
    radiusExpr.trim(),
    `${sizeExpr.trim()} * LAUNCH_MARK_RADIUS_RATIO`,
    'the radius must be derived from the same expression that sizes the mark, times the named ratio'
  );
});

// ---------------------------------------------------------------------------
// L2 — BrandLogo clips the radius on the Image; the shadow node stays
// unclipped.
//
// CATCHES: the clip migrating onto the outer View as overflow: 'hidden' —
// which on iOS sets masksToBounds on the SAME node that carries
// authShadows.logo when `elevated`, silently deleting the launch mark's drop
// shadow — and the prop becoming required, which would change the three
// baked-alpha callers (Sign In, Email Sign In, Create Account) that today
// pass nothing and render exactly as before the prop existed.
//
// WHY NOT VACUOUS: each shape is matched in the component's flattened source;
// removing the conditional, unhooking it from the Image's style, making the
// prop required, or adding any overflow to BrandLogo turns one of these red.
// ---------------------------------------------------------------------------
test('BrandLogo applies an optional radius to the Image itself, never as overflow on the shadow node', () => {
  const logo = flatten(read('components/BrandLogo.tsx'));

  assert.match(logo, /radius\?: number/, 'radius must stay optional so pre-existing callers are untouched');
  assert.match(
    logo,
    /<Image source=\{source \?\? SOURCE\} style=\{\[styles\.image, radius != null && \{ borderRadius: radius \}\]\}/,
    'the radius must clip the Image bitmap, and only when a caller provides one'
  );
  assert.doesNotMatch(
    logo,
    /overflow/,
    'no overflow in BrandLogo: masksToBounds on the outer View would clip the elevated drop shadow on iOS'
  );
});
