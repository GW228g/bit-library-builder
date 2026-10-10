// Generates favicon + share image into public/. Run: node scripts/make-assets.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const ICON = (id = 'a') => `
  <defs>
    <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d52a0"/><stop offset="1" stop-color="#4a78c4"/></linearGradient>
    <pattern id="p${id}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#fff" stroke-opacity=".16"/></pattern>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#g${id})"/>
  <rect width="64" height="64" rx="15" fill="url(#p${id})"/>
  <rect x="7.5" y="7.5" width="49" height="49" rx="10" fill="none" stroke="#fff" stroke-opacity=".2"/>
  <rect x="26" y="9" width="12" height="17" rx="2.5" fill="#fff"/>
  <path d="M24 26h16v16H24z" fill="#f6c33a"/>
  <path d="M24 31l16-5M24 37l16-5M24 43l16-5" stroke="#b8890f" stroke-width="2" stroke-linecap="round" opacity=".75"/>
  <path d="M24 42h16l-8 13z" fill="#f6c33a"/>
  <path d="M28 47.5l4 7.5" stroke="#b8890f" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${ICON()}</svg>`;
fs.writeFileSync('public/favicon.svg', svg);
for (const [name, size] of [['favicon-32.png', 32], ['favicon-192.png', 192], ['apple-touch-icon.png', 180]])
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile('public/' + name);

const F = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;
const chip = (x, t, w) => `<g><rect x="${x}" y="492" width="${w}" height="52" rx="26" fill="#efeded"/><text x="${x + w / 2}" y="527" text-anchor="middle" font-size="24" font-weight="700" fill="#1b1c1c" ${F}>${t}</text></g>`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="85%" cy="5%" r="70%"><stop offset="0" stop-color="#1469d5" stop-opacity=".16"/><stop offset="1" stop-color="#1469d5" stop-opacity="0"/></radialGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d52a0"/><stop offset="1" stop-color="#4a78c4"/></linearGradient>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="1200" height="630" fill="#fbf9f8"/><rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(80 70)">
    <rect width="214" height="64" rx="18" fill="url(#brand)"/>
    <text x="18" y="46" font-size="36" font-weight="800" fill="#fff" letter-spacing="-1.5" ${F}>Maker<tspan fill="#f6c33a">4</tspan>0<tspan fill="none" stroke="#fff" stroke-width="1.6">4</tspan></text>
  </g>
  <text x="80" y="260" font-size="96" font-weight="800" fill="#1b1c1c" letter-spacing="-3" ${F}>Bit Library</text>
  <text x="80" y="360" font-size="96" font-weight="800" fill="#0051ac" letter-spacing="-3" ${F}>Builder</text>
  <text x="80" y="415" font-size="31" fill="#575d66" ${F}>Pick CNC bits or convert your own</text>
  <text x="80" y="454" font-size="31" fill="#575d66" ${F}>tool library for MillMage.</text>
  ${chip(80, 'Fusion 360', 190)}${chip(284, 'Vectric', 140)}${chip(438, 'Carbide Create', 220)}
  <text x="80" y="596" font-size="28" font-weight="700" fill="#0051ac" ${F}>bits.maker404.com</text>
  <text x="440" y="596" font-size="24" fill="#737883" ${F}>Free · Private · Runs in your browser</text>
  <rect x="832" y="190" width="324" height="324" rx="75" fill="#1b1c1c" opacity=".2" filter="url(#blur)"/>
  <g transform="translate(820 150) scale(5.4)">${ICON('o')}</g>
</svg>`;
await sharp(Buffer.from(og)).png().toFile('public/og-image.png');
console.log('done');
