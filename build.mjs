import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const Conv = createRequire(import.meta.url)('./src/convert.js');
const vt = (file, src) => {
  const db = new DatabaseSync(file, { readOnly: true });
  return Conv.fromVectricDb(sql => db.prepare(sql).all().map(r => ({ ...r })), src);
};
const lists = [
  vt('vendor-files/bitsbits-vectric.vtdb', 'Bits&Bits'),
  Conv.fromFusion(JSON.parse(fs.readFileSync('vendor-files/bitsbits-fusion.json')), 'Bits&Bits'),
  vt('vendor-files/spetool-vectric.vtdb', 'SpeTool'),
  Conv.fromVectricTool(fs.readFileSync('vendor-files/whiteside.tool'), 'Whiteside'),
];
lists.forEach(l => console.log(l.length, l[0]?.src));
const tools = Conv.merge(lists);
console.log('merged', tools.length);

const tpl = fs.readFileSync('src/template.html', 'utf8');
if (tpl) {
  const html = tpl.replace('/*CONVERT*/', () => fs.readFileSync('src/convert.js', 'utf8'))
                  .replace('/*CATALOG*/[]', () => JSON.stringify(tools).replace(/</g, '\\u003c'));
  fs.writeFileSync('public/index.html', html);
  console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
}
