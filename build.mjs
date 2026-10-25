import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const Conv = createRequire(import.meta.url)('./src/convert.js');
const vt = (file, src, o) => {
  const db = new DatabaseSync(file, { readOnly: true });
  return Conv.fromVectricDb(sql => db.prepare(sql).all().map(r => ({ ...r })), src, o);
};
const zipJson = async f => JSON.parse(new TextDecoder().decode(await Conv.unzip(fs.readFileSync(f))));
const lists = [
  vt('vendor-files/bitsbits-vectric.vtdb', 'Bits&Bits', { fileMaterial: true }),
  Conv.fromFusion(JSON.parse(fs.readFileSync('vendor-files/bitsbits-fusion.json')), 'Bits&Bits'),
  vt('vendor-files/spetool-vectric.vtdb', 'SpeTool'),
  vt('vendor-files/amana-vectric.vtdb', 'Amana Tool'),
  Conv.fromFusion(await zipJson('vendor-files/cadence-fusion.tools'), 'Cadence'),
  Conv.fromVectricTool(fs.readFileSync('vendor-files/whiteside.tool'), 'Whiteside'),
];
lists.forEach(l => console.log(l.length, l[0]?.src));
// hand-curated bits that are newer than the vendors' downloadable libraries
const added = JSON.parse(fs.readFileSync('vendor-files/additions.json', 'utf8')).map(a => {
  const base = lists.flat().find(t => t.sku === a.speedsFrom && t.vendor === a.vendor);
  if (!base) throw new Error('No basis bit for ' + a.sku + ': ' + a.speedsFrom);
  const k = 25.4, g = a.inches;
  return { id: 'x:' + a.vendor + ':' + a.sku, vendor: a.vendor, sku: a.sku, name: a.name, url: a.url, src: a.vendor, type: a.type, cat: a.cat, imperial: true,
    dia: g.dia * k, angle: g.angle, flutes: g.flutes, length: g.length * k, shank: g.shank * k, tipDia: 0, radius: 0, notes: a.source, estBasis: a.speedsFrom,
    // same RPM and flute count as the basis bit => same chip load => same feed
    presets: base.presets.map(p => ({ ...p })) };
});
const tools = Conv.merge([...lists, added]);
for (const f of JSON.parse(fs.readFileSync('vendor-files/name-fixes.json', 'utf8'))) {
  const t = tools.find(x => x.vendor === f.vendor && x.name === f.name);
  if (!t) throw new Error('name fix target not found: ' + f.name);
  t.name = f.newName;
}
console.log('merged', tools.length);

const tpl = fs.readFileSync('src/template.html', 'utf8');
if (tpl) {
  const html = tpl.replace('/*FONTS*/', () => fs.readFileSync('src/fonts.css', 'utf8'))
                  .replace('/*CONVERT*/', () => fs.readFileSync('src/convert.js', 'utf8'))
                  .replace('/*CATALOG*/[]', () => JSON.stringify(tools).replace(/</g, '\\u003c'));
  fs.writeFileSync('public/index.html', html);
  console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
}
