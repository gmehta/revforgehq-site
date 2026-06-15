// Generates the RevForgeHQ favicon set (cube on brand-indigo, app-style) and
// injects the favicon <link> block into every HTML page. Run: node scripts/gen-favicons.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Brand cube (identical geometry to the original favicon) on a dark indigo->navy
// gradient. `round` = rounded app tile (browser tab); full-bleed for Apple/PWA
// so the OS applies its own mask. `tx/ty/scale` place the cube within 512.
function buildSVG({ round = true, scale = 3.6585, tx = 73, ty = 69, shadow = true, glow = true, strokes = true }) {
  const rx = round ? 115 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="RevForgeHQ">
<title>RevForgeHQ</title>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#3e3d80"/>
<stop offset=".55" stop-color="#20203f"/>
<stop offset="1" stop-color="#121029"/>
</linearGradient>
<radialGradient id="glow" cx=".3" cy=".24" r=".85">
<stop offset="0" stop-color="#615fae" stop-opacity=".55"/>
<stop offset=".6" stop-color="#615fae" stop-opacity="0"/>
</radialGradient>
<radialGradient id="shadow" cx=".5" cy=".5" r=".5">
<stop offset="0" stop-color="#000" stop-opacity=".4"/>
<stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
${glow ? `<rect width="512" height="512" rx="${rx}" fill="url(#glow)"/>` : ''}
${shadow ? `<ellipse cx="256" cy="402" rx="148" ry="30" fill="url(#shadow)"/>` : ''}
<g transform="translate(${tx},${ty}) scale(${scale})"${strokes ? ' stroke="rgba(10,9,20,.35)" stroke-width=".8" stroke-linejoin="round"' : ''}>
<polygon points="14.5,29.5 50,9 85.5,29.5 50,50" fill="#f4ede0"/>
<polygon points="85.5,29.5 85.5,70.5 50,91 50,50" fill="#d4b878"/>
<polygon points="14.5,29.5 50,50 50,91 14.5,70.5" fill="#8a7444"/>
</g>
</svg>`;
}

// Centre the cube for a given scale: native cube centre is (50,50).
const centre = (scale, yNudge = -4) => ({ tx: 256 - 50 * scale, ty: 256 + yNudge - 50 * scale, scale });

const masterSVG    = buildSVG({ round: true,  ...centre(3.6585) });                       // browser tab master
const smallSVG     = buildSVG({ round: true,  ...centre(3.85), shadow: false, strokes: false }); // crisp 16/32/48
const appleSVG     = buildSVG({ round: false, ...centre(3.4) });                          // apple-touch (OS rounds)
const maskableSVG  = buildSVG({ round: false, ...centre(2.85) });                         // PWA maskable safe-zone

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// Minimal PNG-embedded .ico (browsers accept PNG entries).
function buildIco(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += e.buf.length;
  });
  return Buffer.concat([head, dir, ...entries.map(e => e.buf)]);
}

const out = (name, buf) => { writeFileSync(join(ROOT, name), buf); console.log('wrote', name, buf.length, 'bytes'); };

// ---- generate assets ----
out('favicon.svg', Buffer.from(masterSVG));
out('apple-touch-icon.png', await png(appleSVG, 180));
out('icon-192.png', await png(maskableSVG, 192));
out('icon-512.png', await png(maskableSVG, 512));
const icoSizes = await Promise.all([16, 32, 48].map(async s => ({ size: s, buf: await png(smallSVG, s) })));
out('favicon.ico', buildIco(icoSizes));
out('site.webmanifest', Buffer.from(JSON.stringify({
  name: 'RevForgeHQ', short_name: 'RevForgeHQ',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
  theme_color: '#121029', background_color: '#121029', display: 'standalone',
}, null, 2)));

// ---- inject <link> block into every HTML page ----
const BLOCK = [
  '  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
  '  <link rel="icon" href="/favicon.ico" sizes="any" />',
  '  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '  <link rel="manifest" href="/site.webmanifest" />',
].join('\n');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

let replaced = 0, inserted = 0, skipped = 0;
for (const file of walk(ROOT)) {
  let html = readFileSync(file, 'utf8');
  if (html.includes('/site.webmanifest')) { skipped++; continue; }
  // Remove any existing favicon/icon links (handles /, relative, ../ variants).
  const before = html;
  html = html.replace(/[ \t]*<link[^>]*rel="(?:shortcut )?icon"[^>]*>\r?\n?/gi, '');
  if (html !== before) {
    // Re-insert the block where the first icon link used to be: after <head>'s charset/viewport.
    html = injectBlock(html);
    replaced++;
  } else {
    html = injectBlock(html);
    inserted++;
  }
  writeFileSync(file, html);
}

function injectBlock(html) {
  // Prefer right after viewport meta, then charset, then <head>, then before </title>.
  const anchors = [
    /(<meta[^>]*name=["']viewport["'][^>]*>\r?\n?)/i,
    /(<meta[^>]*charset[^>]*>\r?\n?)/i,
    /(<head[^>]*>\r?\n?)/i,
  ];
  for (const re of anchors) {
    if (re.test(html)) return html.replace(re, `$1${BLOCK}\n`);
  }
  return html.replace(/(<title>)/i, `${BLOCK}\n$1`);
}

console.log(`\nHTML: replaced=${replaced} inserted=${inserted} skipped(already)=${skipped}`);
