// build-site: writes the public Brazos website (/, /support, /privacy, /terms, 404) as static HTML.
// The legal text has ONE source, lib/legal/*.ts: this script reads the two strings out of those files as
// text and never keeps a copy. No dependency, no framework, no script tag, no cookie, no external request.
// Run: node scripts/build-site.mjs            -> ./site (git-ignored; drag that folder into Cloudflare Pages)
//      node scripts/build-site.mjs --legal <dir> --out <dir>   (a preview from another folder)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : fallback;
};
const LEGAL = arg('--legal', path.join(ROOT, 'lib', 'legal'));
const OUT = arg('--out', path.join(ROOT, 'site'));
const LINKS = arg('--links', path.join(ROOT, 'lib', 'appLinks.ts'));

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (why) => { console.error(`build-site: ${why}`); process.exit(1); };
const pick = (text, re, what) => (text.match(re) || fail(`cannot find ${what}`))[1];

// ---- the source: the support address, the two documents, their versions ----
const EMAIL = pick(read(LINKS), /export const SUPPORT_EMAIL = '([^']+)';/, 'SUPPORT_EMAIL in appLinks.ts');
const index = read(path.join(LEGAL, 'index.ts'));
const VERSIONS = {
  terms: pick(index, /export const TERMS_VERSION = '([^']+)';/, 'TERMS_VERSION'),
  privacy: pick(index, /export const PRIVACY_VERSION = '([^']+)';/, 'PRIVACY_VERSION'),
};
function legalText(file, name) {
  const raw = pick(read(path.join(LEGAL, file)), new RegExp(`export const ${name} = \`([\\s\\S]*?)\`\\.trim\\(\\);`), name);
  const text = raw.split('${SUPPORT_EMAIL}').join(EMAIL).trim();
  if (text.includes('${') || text.includes('\\')) fail(`${name} holds a template or an escape this script does not read`);
  return text;
}

// ---- markdown (headings, paragraphs, bullets: what components/MarkdownText.tsx renders) to HTML ----
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).split(esc(EMAIL)).join(`<a href="mailto:${esc(EMAIL)}">${esc(EMAIL)}</a>`);
const two = (n) => String(n).padStart(2, '0');

function bullets(lines) {
  const items = []; // { level, text }
  for (const line of lines) {
    const m = line.match(/^(\s*)- (.*)$/);
    if (m) items.push({ level: Math.floor(m[1].length / 2), text: m[2].trim() });
    else if (items.length) items[items.length - 1].text += ' ' + line.trim();
  }
  let html = '', depth = -1;
  for (const it of items) {
    if (it.level > depth) { html += '<ul>'.repeat(it.level - depth); }
    else { html += '</li>' + '</ul></li>'.repeat(depth - it.level); }
    html += `<li>${inline(it.text)}`;
    depth = it.level;
  }
  return html + '</li>' + '</ul></li>'.repeat(Math.max(depth, 0)) + '</ul>';
}

/** One legal document -> { title, updated, toc, body }. */
function legalHtml(md) {
  const blocks = md.split(/\n\s*\n/).map((b) => b.split('\n')).filter((b) => b.join('').trim());
  let title = '', updated = '', body = '', open = false;
  const toc = [];
  const close = () => { if (open) body += '</div></section>'; open = false; };
  for (const lines of blocks) {
    const first = lines[0];
    if (first.startsWith('# ')) { title = first.slice(2).trim(); continue; }
    if (first.startsWith('## ')) {
      close();
      const head = first.slice(3).trim();
      const m = head.match(/^(\d+)\.\s+(.*)$/);
      const id = m ? `s${m[1]}` : 'summary';
      toc.push({ id, n: m ? two(m[1]) : '', text: m ? m[2] : head });
      body += `<section class="sec" id="${id}"><div class="n">${m ? two(m[1]) : '&mdash;'}</div><div class="b"><h2>${inline(m ? m[2] : head)}</h2>`;
      open = true;
      continue;
    }
    if (first.startsWith('### ')) { body += `<h3>${inline(first.slice(4).trim())}</h3>`; continue; }
    if (/^\s*- /.test(first)) { body += bullets(lines); continue; }
    const text = lines.map((l) => l.trim()).join(' ');
    if (!open && /^Last updated:/.test(text)) { updated = text; continue; }
    body += open ? `<p>${inline(text)}</p>` : `<p class="lead">${inline(text)}</p>`;
  }
  close();
  if (!title || !updated || !toc.length) fail('a legal document lost its title, its date or its sections');
  return { title, updated, toc, body };
}

// ---- the look: direction C "Ledger" (the owner's pick), light and dark from the device setting ----
const CSS = `
:root{color-scheme:light dark;--bg:#F4F1E8;--ink:#13201B;--muted:#56605A;--line:#D5DAD3;--forest:#064C3B;--accent:#0D6B52;--gold:#86621C}
@media (prefers-color-scheme:dark){:root{--bg:#0A1A17;--ink:#F1EDE1;--muted:#A9B8B1;--line:#325047;--forest:#4FC58C;--accent:#4FC58C;--gold:#D4A24C}}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font:17px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:3px}
.wrap{max-width:680px;margin:0 auto;padding:0 26px 56px}
.top{display:flex;align-items:center;gap:10px;padding:26px 0 16px;border-bottom:1px solid var(--line)}
.top .brand{font-size:15px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;color:var(--ink);text-decoration:none}
.top nav{margin-left:auto;display:flex;gap:16px;font-size:14px;font-weight:600}
.top nav a{color:var(--muted);text-decoration:none;padding:6px 0}
.top nav a[aria-current]{color:var(--ink)}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:var(--gold);margin-top:30px}
h1,h2{font-family:ui-serif,"New York","Iowan Old Style",Georgia,"Times New Roman",serif;font-weight:700}
h1{font-size:44px;line-height:1.04;letter-spacing:-1px;margin-top:12px}
h1 em{font-style:italic;color:var(--accent)}
.lead{color:var(--muted);margin-top:14px}
.meta{font-size:14px;color:var(--muted);margin-top:10px}
.rows{margin-top:30px}
.row{display:flex;align-items:baseline;gap:16px;padding:18px 0;border-top:1px solid var(--line);color:inherit;text-decoration:none}
.row:last-child{border-bottom:1px solid var(--line)}
.row .n,.sec .n{font-size:13px;font-weight:700;letter-spacing:1.5px;color:var(--gold);width:24px;flex:none}
.row b{display:block;font-family:ui-serif,"New York","Iowan Old Style",Georgia,serif;font-size:22px;letter-spacing:-.3px}
.row span span{display:block;font-size:14px;color:var(--muted);margin-top:2px;line-height:1.35}
.row i{margin-left:auto;font-style:normal;color:var(--accent);font-size:18px}
.pill{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 28px;border-radius:999px;border:1.5px solid var(--forest);color:var(--forest);font-weight:700;text-decoration:none;margin-top:22px}
.sec{display:flex;gap:14px;border-top:1px solid var(--line);padding-top:20px;margin-top:26px;scroll-margin-top:12px}
.sec .n{padding-top:7px}
.sec .b{min-width:0;flex:1}
.sec h2{font-size:23px;line-height:1.2;letter-spacing:-.4px}
.sec h3{font-size:16px;font-weight:700;margin-top:18px}
.sec p,.sec ul{margin-top:10px}
.sec ul{padding-left:20px}
.sec li{margin-top:6px}
.sec li ul{margin-top:4px}
.sec p,.sec li{overflow-wrap:anywhere}
details{margin-top:24px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
summary{cursor:pointer;padding:14px 0;font-weight:700;font-size:15px}
details ol{list-style:none;padding:0 0 14px;columns:2;column-gap:24px;font-size:15px}
details li{padding:4px 0;break-inside:avoid}
details li a{text-decoration:none}
details li span{color:var(--gold);font-size:12px;font-weight:700;letter-spacing:1px;margin-right:8px}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 16px}
footer a{color:var(--muted)}
@media (max-width:420px){h1{font-size:38px}details ol{columns:1}}
`.replace(/\n/g, '');

const NAV = [['support', 'Support'], ['privacy', 'Privacy'], ['terms', 'Terms']];
/** `base` is "" on a page that sits at the site root and "/" on the 404 page, which can be served at any depth. */
function page({ file, title, description, base = '', current = '', main }) {
  const href = (slug) => (base ? `/${slug}` : slug || './');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#F4F1E8" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#0A1A17" media="(prefers-color-scheme:dark)">
<link rel="icon" href="data:,">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top"><a class="brand" href="${href('')}">Brazos</a><nav aria-label="Pages">${NAV.map(
    ([slug, label]) => `<a href="${href(slug)}"${slug === current ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('')}</nav></header>
<main>${main}</main>
<footer><span>&copy; ${new Date().getFullYear()} Brazos</span>${NAV.map(([slug, label]) => `<a href="${href(slug)}">${label}</a>`).join('')}</footer>
</div>
</body>
</html>
`;
}

const row = (n, slug, name, hint) =>
  `<a class="row" href="${slug}"><span class="n">${n}</span><span><b>${name}</b><span>${hint}</span></span><i aria-hidden="true">&rarr;</i></a>`;
const step = (n, id, head, html) =>
  `<section class="sec" id="${id}"><div class="n">${n}</div><div class="b"><h2>${head}</h2>${html}</div></section>`;

function legalPage(key, slug, md, description) {
  const doc = legalHtml(md);
  const toc = `<details><summary>Contents</summary><ol>${doc.toc
    .map((t) => `<li><a href="#${t.id}">${t.n ? `<span>${t.n}</span>` : ''}${esc(t.text)}</a></li>`).join('')}</ol></details>`;
  return page({
    file: `${slug}.html`, title: doc.title, description, current: slug,
    main: `<p class="eyebrow">Legal</p><h1>${esc(doc.title.replace(/^Brazos /, ''))}</h1>` +
      `<p class="meta">${esc(doc.updated)} &middot; Version ${esc(VERSIONS[key])}</p>${toc}${doc.body}`,
  });
}

const mail = `<a href="mailto:${esc(EMAIL)}">${esc(EMAIL)}</a>`;
const pages = {
  'index.html': page({
    title: 'Brazos: local help, protected payment',
    description: 'Brazos is an iPhone app for short-term local work. Support, Privacy Policy and Terms of Service.',
    main: `<p class="eyebrow">Brazos Marketplace</p><h1>Get it done.<br><em>Work with confidence.</em></h1>` +
      `<p class="lead">Hire local help or find nearby work. Brazos is an iPhone app for short-term local jobs: a Customer posts a job, Workers bid, and the payment is held until the work is approved.</p>` +
      `<div class="rows">${row('01', 'support', 'Support', 'Get help, cancel a job, report a problem')}` +
      `${row('02', 'privacy', 'Privacy Policy', 'What we collect and how to delete it')}` +
      `${row('03', 'terms', 'Terms of Service', 'Payments, cancelling, and the rules')}</div>`,
  }),
  'support.html': page({
    title: 'Brazos Support',
    description: 'Get help with Brazos: contact support, cancel a job, report or block someone, delete your account.',
    current: 'support',
    main: `<p class="eyebrow">Support</p><h1>How can we <em>help?</em></h1>` +
      `<p class="lead">Email us and a person replies within 2 business days.</p>` +
      `<a class="pill" href="mailto:${esc(EMAIL)}">Email support</a><p class="meta">${mail}</p>` +
      step('01', 'cancel', 'Cancel a job',
        `<p>Open the job in My Jobs and tap <b>Cancel job</b>. The app shows the fee, if any, before you confirm.</p>` +
        `<p>Cancelling is free more than 24 hours before the arrival window starts, within 15 minutes of hiring, or when the job has no scheduled date. After that, a cancellation fee may go to the Worker and the rest is refunded. The full rules are in the <a href="terms#s4">Terms of Service, section 4</a>.</p>`) +
      step('02', 'report', 'Report or block someone',
        `<p>In a conversation, open the menu and choose <b>Report</b> or <b>Block</b>. On a Worker's profile, tap <b>Report this profile</b>. Reports are reviewed by Brazos.</p>` +
        `<p>When you block someone, their posts, profile and reviews no longer appear to you, and they cannot message you or bid on your jobs.</p>`) +
      step('03', 'payments', 'Payments and refunds',
        `<p>Your payment is held until you approve the finished work. It is not insurance. If something is wrong, tap <b>Report an issue</b> on the job instead of approving: the payment stays held while Brazos reviews it.</p>` +
        `<p>Refunds go back to the card that paid, usually within 5 to 10 business days.</p>`) +
      step('04', 'delete', 'Delete your account',
        `<p>In the app: <b>Profile &rarr; Account &amp; safety &rarr; Delete account</b>. You cannot delete it while a job or a payment is still in progress; the app lists what is outstanding.</p>` +
        `<p>What is deleted and what is kept is set out in the <a href="privacy#s7">Privacy Policy, section 7</a>. If you cannot get into the app, email us from the address on your account.</p>`) +
      step('05', 'safety', 'Safety',
        `<p>If you are in immediate danger, call 911. Brazos is not an emergency service. Brazos does not run background checks: take the same care you would with anyone you met outside the app.</p>`),
  }),
  'privacy.html': legalPage('privacy', 'privacy', legalText('privacyPolicy.ts', 'PRIVACY_POLICY'),
    'What Brazos collects, why, who receives it, how long it is kept, and how to delete your account.'),
  'terms.html': legalPage('terms', 'terms', legalText('termsOfService.ts', 'TERMS_OF_SERVICE'),
    'The agreement between you and Brazos: payments, cancelling, safety, and the rules of the marketplace.'),
  '404.html': page({
    title: 'Page not found: Brazos', description: 'This page does not exist.', base: '/',
    main: `<p class="eyebrow">404</p><h1>Nothing <em>here.</em></h1><p class="lead">That page does not exist.</p><a class="pill" href="/">Back to Brazos</a>`,
  }),
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [file, html] of Object.entries(pages)) {
  if (/<script|https?:\/\//i.test(html)) fail(`${file} holds a script or an absolute web address`);
  fs.writeFileSync(path.join(OUT, file), html);
}
// Cloudflare Pages reads this file: no page may be framed or sniffed, and nothing may load from elsewhere.
fs.writeFileSync(path.join(OUT, '_headers'),
  `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'\n`);
console.log(`build-site: ${Object.keys(pages).length} pages + _headers -> ${OUT}`);
