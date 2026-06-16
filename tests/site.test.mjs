// RevForgeHQ site smoke tests — run on every deploy (CI + `npm run build`).
// Dependency-free: Node's built-in test runner. `node --test tests/`.
// Catches the breakage classes we've actually hit: missing favicon block,
// nav drift between pages, broken asset links, brand/lockup regressions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler', 'revforge-scan', '1password']);

function walkHtml(dir = ROOT, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, acc);
    else if (name.endsWith('.html')) acc.push(p);
  }
  return acc;
}
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const rel = (p) => p.slice(ROOT.length + 1);

// Extract the labels of the primary nav links (strips nested spans like the New badge).
function navLinkLabels(html) {
  const ul = html.match(/<ul class="nav-links"[\s\S]*?<\/ul>/);
  if (!ul) return null;
  return [...ul[0].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
// The nav CTA button text (the .btn-sm directly inside .nav-inner).
function navCta(html) {
  const m = html.match(/<\/ul>\s*<a [^>]*class="btn[^"]*btn-sm"[^>]*>([\s\S]*?)<\/a>/);
  return m ? m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : null;
}

const HTML_FILES = walkHtml();

test('every page declares the standard favicon block', () => {
  const required = [
    'rel="icon" href="/favicon.svg"',
    'rel="icon" href="/favicon.ico"',
    'rel="apple-touch-icon" href="/apple-touch-icon.png"',
    'rel="manifest" href="/site.webmanifest"',
  ];
  const missing = [];
  for (const f of HTML_FILES) {
    const html = readFileSync(f, 'utf8');
    if (!required.every((r) => html.includes(r))) missing.push(rel(f));
  }
  assert.deepEqual(missing, [], `pages missing the favicon block:\n${missing.join('\n')}`);
});

test('Radar nav matches the home nav (same links + CTA)', () => {
  const home = read('index.html');
  const radar = read('radar/index.html');
  const homeLinks = navLinkLabels(home);
  const radarLinks = navLinkLabels(radar);
  assert.ok(homeLinks && homeLinks.length, 'home nav links not found');
  assert.ok(radarLinks && radarLinks.length, 'radar nav links not found');
  assert.deepEqual(
    radarLinks, homeLinks,
    `Radar nav links drifted from home.\n home: ${JSON.stringify(homeLinks)}\nradar: ${JSON.stringify(radarLinks)}`,
  );
  assert.equal(navCta(radar), navCta(home), 'Radar nav CTA differs from home');
});

test('nav cannot wrap to a second row (nowrap + early hamburger)', () => {
  const css = read('styles.css');
  assert.match(css, /\.nav-links a\s*{[^}]*white-space:\s*nowrap/, 'styles.css .nav-links a missing white-space:nowrap');
  assert.match(css, /@media\s*\(max-width:\s*1150px\)\s*{[^}]*\.nav-links/, 'styles.css missing the 1150px nav breakpoint');
  const radar = read('radar/index.html');
  assert.match(radar, /\.nav-links a{[^}]*white-space:nowrap/, 'radar nav .nav-links a missing white-space:nowrap');
  assert.match(radar, /@media\(max-width:1150px\)/, 'radar nav missing the 1150px breakpoint');
});

test('Settings page wires the prompt + competitor managers', () => {
  const html = read('radar/settings/index.html');
  for (const hook of ['id="cardPrompts"', 'id="cardComps"', '/api/radar/prompts', '/api/radar/competitors', 'id="pcount"', 'id="ccount"']) {
    assert.ok(html.includes(hook), `settings page missing prompt/competitor manager hook: ${hook}`);
  }
});

test('brand single source of truth is present and canonical', () => {
  assert.ok(existsSync(join(ROOT, 'brand/brand.css')), 'brand/brand.css missing');
  assert.ok(existsSync(join(ROOT, 'docs/BRAND.md')), 'docs/BRAND.md missing');
  const bcss = read('brand/brand.css');
  assert.match(bcss, /#d4b878/, 'brand.css missing the gold token');
  assert.match(bcss, /\.rfhq-lockup/, 'brand.css missing the .rfhq-lockup component');
});

test('required root assets exist', () => {
  for (const a of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest', 'styles.css', 'script.js']) {
    assert.ok(existsSync(join(ROOT, a)), `missing required asset: ${a}`);
  }
});

test('referenced static assets are not broken links', () => {
  const exts = new Set(['.css', '.js', '.svg', '.png', '.ico', '.webmanifest', '.jpg', '.jpeg', '.webp']);
  const broken = new Set();
  for (const f of HTML_FILES) {
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) {
      const url = m[1];
      if (!exts.has(extname(url).toLowerCase())) continue; // only check static assets
      if (!existsSync(join(ROOT, url.replace(/^\//, '')))) broken.add(`${url}  (in ${rel(f)})`);
    }
  }
  assert.deepEqual([...broken], [], `broken static asset links:\n${[...broken].join('\n')}`);
});
