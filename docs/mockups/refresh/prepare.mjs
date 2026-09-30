// Makes the two exports open from a double-click (2026-09-26): each export is copied to
// .shots/refresh/<which>/, its absolute paths made relative, the PWA service worker left out, the
// viewer's bootstrap and sample world loaded first, and the text set in Inter — the closest free
// match to the iPhone's own font (the operator: "Like my iPhone"), which the phone keeps. Then the
// shared folder: bootstrap.js, mock.js, the legal versions the app itself considers current, and
// the app's own pictures that stand in for photos. Only the copies change; nothing in the app does.
//   node docs/mockups/refresh/prepare.mjs [before] [after]      (no argument: both)
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const base = join(repo, '.shots', 'refresh');
const which = process.argv.slice(2).length ? process.argv.slice(2) : ['before', 'after'];
const SYSTEM_STACK = `'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'`;
const INTER_STACK = `'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'`;

// ---- shared ------------------------------------------------------------------------------------
const shared = join(base, 'shared');
mkdirSync(join(shared, 'sample'), { recursive: true });
copyFileSync(join(here, 'bootstrap.js'), join(shared, 'bootstrap.js'));
copyFileSync(join(here, 'mock.js'), join(shared, 'mock.js'));
copyFileSync(join(here, 'screens.js'), join(shared, 'screens.js'));
copyFileSync(join(here, 'viewer.html'), join(base, 'index.html'));
const legalSource = readFileSync(join(repo, 'lib', 'legal', 'index.ts'), 'utf8');
const pick = (name) => legalSource.match(new RegExp(`export const ${name} = '([^']+)'`))[1];
writeFileSync(join(shared, 'legal.js'), `window.__REFRESH_LEGAL__ = ${JSON.stringify({ terms: pick('TERMS_VERSION'), privacy: pick('PRIVACY_VERSION') })};\n`);
for (const [from, to] of [
  ['assets/prestige/hero_armchair_customer_lamp_dark.webp', 'armchair.webp'],
  ['assets/prestige/hero_toolbox_worker.webp', 'toolbox.webp'],
  ['assets/prestige/home-atmosphere-dark.webp', 'room.webp'],
]) copyFileSync(join(repo, from), join(shared, 'sample', to));

// ---- each app ------------------------------------------------------------------------------------
for (const name of which) {
  const src = join(base, `${name}-export`);
  const out = join(base, name);
  if (!existsSync(join(src, 'index.html'))) throw new Error(`no export at ${src} — run export.mjs ${name}`);
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true });

  let html = readFileSync(join(out, 'index.html'), 'utf8');
  html = html.replace(/<script>\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>/, '');
  html = html.replace(/(src|href)="\/(?!\/)/g, '$1="./');
  const inject = [
    // the phone's own safe area: react-native-safe-area-context measures a hidden element padded
    // with env(safe-area-inset-*); a browser reports zero, the iPhone 54 and 34 — so this reports
    // the iPhone's, and every screen lays out, and draws under the status bar, as it does there.
    // 2026-09-28: and no BROWSER focus ring on anything — iOS draws none; a field's own focus
    // glow (LUX-LIST-64 #8, components/FocusRing.tsx) is the one the phone shows
    '<style id="refresh-safe-area">div[style*="safe-area-inset-top"]{padding:54px 0 34px 0 !important}html,body{scrollbar-width:none}::-webkit-scrollbar{width:0;height:0}*:focus{outline:none}</style>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap">',
    '<script src="../shared/legal.js"></script>',
    '<script src="../shared/bootstrap.js"></script>',
    '<script src="../shared/mock.js"></script>',
  ].join('\n    ');
  html = html.replace(/(<script src="\.\/config\.js)/, `${inject}\n    $1`);
  if (!html.includes('shared/bootstrap.js')) throw new Error(`${name}: could not place the bootstrap`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>BRAZOS — ${name === 'before' ? 'Before' : 'After'}</title>`);
  writeFileSync(join(out, 'index.html'), html);

  const jsDir = join(out, '_expo', 'static', 'js', 'web');
  let edgeFixes = 0;
  for (const file of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
    let js = readFileSync(join(jsDir, file), 'utf8');
    const assets = (js.match(/"\/assets\//g) || []).length;
    js = js.split('"/assets/').join('"./assets/');
    if (!js.includes(SYSTEM_STACK)) throw new Error(`${name}: the system font stack moved — update prepare.mjs`);
    js = js.split(SYSTEM_STACK).join(INTER_STACK);
    // The phone's own safe-area edges. On iOS a SafeAreaView pads only the edges it lists;
    // react-native-safe-area-context's WEB SafeAreaView (5.x) pads an unlisted edge too, so
    // every edges={['top']} screen grew a 34px band above the tab bar that the phone never
    // draws. Unlisted edges start 'off' here, exactly as they behave natively.
    const edgeReduce = /(\.reduce\(\((\w),(\w)\)=>\(\2\[\3\]='additive',\2\),)\{\}\)/g;
    edgeFixes += (js.match(edgeReduce) || []).length;
    js = js.replace(edgeReduce, "$1{top:'off',right:'off',bottom:'off',left:'off'})");
    writeFileSync(join(jsDir, file), js);
    console.log(`[refresh] ${name}: ${file} — ${assets} asset paths made relative, text in Inter, safe-area edges as on iOS`);
  }
  if (edgeFixes !== 1) throw new Error(`${name}: the SafeAreaView edge reduce moved (${edgeFixes} matches) — update prepare.mjs`);
}
console.log('[refresh] prepared', which.join(' + '));
