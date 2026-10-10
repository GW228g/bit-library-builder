/* Vendor tool-library converters -> normalized catalog -> MillMage .tools
 * Runs unchanged in Node (build step) and in the browser (user-supplied files).
 *
 * Normalized tool:
 *  { id, vendor, sku, name, type, cat, imperial, dia, flutes, angle, tipDia, radius,
 *    length, lenEst, url, notes, src, presets:[{mat, feed, plunge, ramp, rpm, down, over}] }
 *  lengths in mm, feeds in mm/min.
 */
const Conv = (() => {
  const IN = 25.4;
  const TYPES = ['End Mill', 'Ball Mill', 'V-Bit', 'Tapered Ball Mill', 'Tapered End Mill', 'Round-over'];

  const clean = s => (s || '').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').replace(/\s+-\s*$/, '').trim();
  const r4 = x => Math.round(x * 1e4) / 1e4;

  /* "1-1/4"" | "3/8" | ".023" | "0.5"  ->  number */
  function num(s) {
    s = String(s).trim();
    let m;
    if ((m = s.match(/^(\d+)-(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
    return parseFloat(s);
  }
  const NUM = String.raw`(\d*\.?\d+(?:-\d+\/\d+|\/\d+)?)`;

  /* "<len> Cutting Length" / "<len> CL" out of a vendor name -> mm, or null */
  function lengthFromName(name, imperial) {
    const m = name.match(new RegExp(NUM + String.raw`\s*(mm|"|in\b)?\s*(?:cutting\s*length|cut\s*length|CL\b|CH\b)`, 'i'));
    if (!m) return null;
    const v = num(m[1]);
    if (!(v > 0)) return null;
    const u = (m[2] || (imperial ? '"' : 'mm')).toLowerCase();
    return u === 'mm' ? v : v * IN;
  }

  /* "... x 1/4" Shank", "6mm Shank", "SD 1/4", "Shank 6mm" -> mm or null */
  function shankFromText(text, imperial) {
    const m = text.match(new RegExp(NUM + String.raw`\s*(mm|"|in\b)?\s*(?:shank|shk\b|SD\b)`, 'i')) || text.match(new RegExp(String.raw`shank\s*(?:dia\w*\s*)?` + NUM + String.raw`\s*(mm|"|in\b)?`, 'i'));
    if (!m) return null;
    const v = num(m[1]); if (!(v > 0)) return null;
    return (m[2] || (imperial ? '"' : 'mm')).toLowerCase() === 'mm' ? v : v * IN;
  }

  const MAT_RULES = [
    [/hard\s*w?ood|hardtwood/i, 'Hardwood'],
    [/soft\s*wood/i, 'Softwood'],
    [/wood.*plywood|plywood/i, 'Wood / Plywood'],
    [/mdf|laminate/i, 'MDF / Laminate'],
    [/alumin/i, 'Aluminum'],
    [/iron|stainless/i, 'Iron / Stainless'],
    [/steel/i, 'Steel'],
    [/plastic|acryl/i, 'Plastic / Acrylic'],
    [/^wood$/i, 'Wood / Plywood'],
    [/default|general|^$/i, 'General'],
  ];
  const KNOWN = new Set(MAT_RULES.map(r => r[1]));
  function material(s, fallback) {
    for (const cand of [s, fallback]) {
      const c = (cand || '').trim();
      if (!c) continue;
      for (const [re, label] of MAT_RULES) if (re.test(c)) return label;
    }
    return 'General';
  }

  const RATE = { 0: 1 * 60, 1: 1, 2: 1000, 3: IN * 60, 4: IN, 5: IN * 12 }; // -> mm/min
  const hash = str => {            // cheap deterministic 128-bit hash -> uuid-shaped string
    let h = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      for (let k = 0; k < 4; k++) { h[k] = Math.imul(h[k] ^ c, 2654435761 + k * 40503) >>> 0; h[k] = (h[k] << 13 | h[k] >>> 19) >>> 0; }
    }
    const hex = h.map(x => x.toString(16).padStart(8, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };

  function finish(t) {
    // V-bit style cutting height when no real flute length is known
    if (!t.length && t.angle && t.dia && (t.type === 'V-Bit' || t.type === 'Tapered End Mill')) {
      const h = (t.dia - (t.tipDia || 0)) / 2 / Math.tan(t.angle * Math.PI / 360);
      if (isFinite(h)) { t.length = r4(h); }
    }
    if (!t.length) { t.length = r4(Math.min(t.dia * 3, 50)); t.lenEst = true; }
    for (const k of ['dia', 'tipDia', 'radius', 'length']) t[k] = r4(t[k] || 0);
    t.shank = t.shank ? r4(t.shank) : 0;
    t.presets = t.presets.filter(p => p.feed > 0 && p.rpm > 0);
    return t;
  }

  /* ---------- Fusion 360 / Carbide Create JSON ---------- */
  function fromFusion(json, src) {
    const out = [];
    for (const t of json.data || []) {
      const g = t.geometry || {}, k = IN * (t.unit === 'millimeters' ? 1 / IN : 1);
      const D = (g.DC || 0) * k;
      const tool = {
        id: 'f:' + t.guid, vendor: src, sku: t['product-id'] || '',
        name: clean(t.description), url: /^https?:\/\//.test(t['product-link'] || '') ? t['product-link'] : '', src, imperial: t.unit !== 'millimeters',
        flutes: g.NOF || 2, length: (g.LCF || 0) * k, shank: (g.SFDM || 0) * k, notes: '', presets: [],
        dia: D, angle: 0, tipDia: 0, radius: 0,
      };
      switch (t.type) {
        case 'flat end mill': tool.type = 'End Mill'; break;
        case 'ball end mill': tool.type = 'Ball Mill'; break;
        case 'bull nose end mill': tool.type = 'End Mill'; tool.radius = (g.RE || 0) * k; break;
        case 'tapered mill': {
          tool.angle = 2 * (g.TA || 0);
          tool.dia = D + 2 * (g.LCF || 0) * k * Math.tan((g.TA || 0) * Math.PI / 180);
          if (g.RE > 0) { tool.type = 'Tapered Ball Mill'; tool.radius = g.RE * k; }
          else { tool.type = 'Tapered End Mill'; tool.tipDia = D; }
          break;
        }
        case 'chamfer mill':
          tool.angle = 2 * (g.TA || 0);
          if (g['tip-diameter'] > 0) { tool.type = 'Tapered End Mill'; tool.tipDia = g['tip-diameter'] * k; }
          else tool.type = 'V-Bit';
          break;
        default: continue;
      }
      tool.cat = ({ 'End Mill': 'End Mills', 'Ball Mill': 'Ball Nose', 'V-Bit': 'V-Bits' })[tool.type] || 'Tapered';
      if (/compression/i.test(tool.name)) tool.cat = 'Compression';
      for (const p of (t['start-values'] || {}).presets || []) {
        tool.presets.push({
          mat: material(p.name), feed: p.v_f * k, plunge: (p.v_f_plunge || p.v_f * .5) * k,
          ramp: (p.v_f_ramp || 0) * k || null, rpm: Math.round(p.n),
          down: p['use-stepdown'] && p.stepdown > 0 ? p.stepdown * k : null, over: p['use-stepover'] && p.stepover > 0 ? p.stepover * k : null,
        });
      }
      out.push(finish(tool));
    }
    return out;
  }

  /* ---------- Vectric .vtdb (SQLite) ----------  q(sql) -> array of row objects */
  const VT_CAT_SKIP = /\bset$|\bkit\b/i;
  function fromVectricDb(q, src, o = {}) {
    const tree = new Map(q('select * from tool_tree_entry').map(r => [r.id, r]));
    const mats = new Map(q('select * from material').map(r => [r.id, r.name]));
    const treeByGeom = new Map();
    for (const r of tree.values()) if (r.tool_geometry_id) treeByGeom.set(r.tool_geometry_id, r);
    const cut = new Map();
    for (const r of q(`select e.tool_geometry_id gid, e.material_id mid, c.* from tool_entity e
        join tool_cutting_data c on c.id = e.tool_cutting_data_id where c.feed_rate is not null and c.spindle_speed is not null`)) {
      if (!cut.has(r.gid)) cut.set(r.gid, []);
      cut.get(r.gid).push(r);
    }
    const pathOf = r => { const p = []; for (; r; r = tree.get(r.parent_group_id)) p.unshift(r.name); return p; };

    const byKey = new Map();
    for (const g of q('select * from tool_geometry')) {
      const rows = cut.get(g.id);
      if (!rows || ![0, 1, 2, 3, 4, 5, 8].includes(g.tool_type)) continue;
      const imperial = g.units === 1, k = imperial ? IN : 1;
      const name = clean(g.name_format);
      const skuM = name.match(/^#\s*([A-Za-z0-9-]+)/) || name.match(/\b[A-Z]{1,2}\d{4,6}\b/) || name.match(/ - ([\w.-]+)\s*$/);
      let sku = skuM ? (skuM[1] || skuM[0]) : '';
      const path = pathOf(treeByGeom.get(g.id)).slice(0, -1);
      let ci = path.findIndex(n => /imperial|metric/i.test(n)); ci = ci >= 0 ? ci + 1 : 1;
      let cat = path[ci] || 'Bits', treeMat = '';
      let rest = path.slice(ci + 1);
      if (rest[0] && !/shank/i.test(rest[0]) && material(rest[0]) === 'General' && !/general/i.test(rest[0])) { cat = rest[0]; rest = rest.slice(1); }   // sub-category folder (e.g. Endmill / Ballnose)
      treeMat = rest.find(n => !/shank/i.test(n) && material(n) !== 'General') || '';
      if (VT_CAT_SKIP.test(cat)) cat = '';
      if (/dovetail|t-slot|keyhole|mortis|sander|core box|countersink|rabbet/i.test(cat + ' ' + name)) continue;   // profile bits MillMage can't model
      const shanks = rest.map(n => /shank/i.test(n) && shankFromText(n, imperial)).filter(Boolean);
      const tool = {
        id: 'v:' + g.id, vendor: '', sku, name: name.replace(/^SpeTool\s+/i, '').replace(/^SPE\s*/i, '').replace(/^#\s*/, ''), url: '', src, imperial,
        flutes: g.num_flutes || 2, angle: 0, tipDia: 0, radius: 0, notes: '', presets: [],
        dia: g.diameter * k, length: lengthFromName(name, imperial) || (g.flute_length || 0) * k, cat,
        shank: shankFromText(name, imperial) || (shanks.length === 1 ? shanks[0] : 0),
      };
      switch (g.tool_type) {
        case 0: tool.type = 'Ball Mill'; break;
        case 1: tool.type = 'End Mill'; break;
        case 2: tool.type = 'End Mill'; tool.radius = (g.tip_radius || 0) * k; break;
        case 3: case 4:
          tool.angle = g.included_angle || 0;
          if (g.flat_diameter > 0) { tool.type = 'Tapered End Mill'; tool.tipDia = g.flat_diameter * k; }
          else tool.type = 'V-Bit';
          break;
        case 8: {   // form tools: keep only the V-groove / engraving ones, whose angle is in the name
          const am = name.match(/(\d+(?:\.\d+)?)\s*(?:°|deg)/i);
          if (!am || !/v[\s-]*groove|engrav|chamfer/i.test(name)) continue;
          tool.type = 'V-Bit'; tool.angle = +am[1]; break;
        }
        case 5: tool.type = 'Tapered Ball Mill'; tool.angle = g.included_angle || 0; tool.radius = (g.tip_radius || 0) * k; break;
      }
      if (/round\s*over|roundover/i.test(cat + ' ' + name)) { tool.type = 'Round-over'; tool.radius = tool.radius || 0; }
      if (!tool.cat) tool.cat = ({ 'End Mill': 'End Mills', 'Ball Mill': 'Ball Nose', 'V-Bit': 'V-Bits' })[tool.type] || 'Tapered';
      tool.cat = tool.cat.replace(/\s*\(End Mills\)/i, '').replace(/\b(\w)(\w*)/g, (m, a, b) => /^[A-Z&]+$/.test(m) && m.length > 3 ? a + b.toLowerCase() : m);
      for (const c of rows) {
        const f = RATE[c.rate_units] || 1, lk = c.length_units === 1 ? IN : 1;
        tool.presets.push({
          mat: material(treeMat, o.fileMaterial || mats.size > 1 ? mats.get(c.mid) : ''), feed: c.feed_rate * f, plunge: (c.plunge_rate || c.feed_rate * .5) * f,
          ramp: null, rpm: Math.round(c.spindle_speed), down: c.stepdown ? c.stepdown * lk : null, over: c.stepover ? c.stepover * lk : null,
        });
      }
      // same physical bit listed once per material in some vendor files -> one tool, many presets
      const key = (sku ? sku.toLowerCase() : tool.name.toLowerCase()) + '|' + r4(tool.dia) + '|' + tool.angle + '|' + tool.type;
      const ex = byKey.get(key);
      if (ex) { for (const p of tool.presets) if (!ex.presets.some(e => e.mat === p.mat)) ex.presets.push(p); }
      else byKey.set(key, tool);
    }
    return [...byKey.values()].map(t => { t.vendor = src; return finish(t); });
  }

  /* ---------- Vectric legacy binary .tool (MFC archive) ---------- */
  function fromVectricTool(buf, src) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const latin = new TextDecoder('latin1').decode(u8);
    const out = [], re = /[A-Za-z][A-Za-z0-9]*\s\(([A-Za-z0-9-]+)\)[ -~]{3,140}/g;
    let m;
    while ((m = re.exec(latin))) {
      const s = m.index, len = dv.getUint32(s - 4, true);
      if (len !== m[0].length && len !== m[0].length + 1) continue;
      const d = i => dv.getFloat64(s - 16 - 8 * (5 - i), true);       // d(0)=dia d(1)=stepdown d(2)=stepover d(3)=feed d(4)=plunge
      const rateUnits = dv.getUint32(s - 16, true), rpm = dv.getUint32(s - 12, true);
      const [dia, down, over, feed, plunge] = [0, 1, 2, 3, 4].map(d);
      if (!(dia > 0 && dia < 5 * 25 && feed > 0 && feed < 1e5 && rpm >= 1000 && rpm <= 60000)) continue;
      const name = clean(m[0]), nm = name.toLowerCase();
      const f = RATE[rateUnits] || IN;
      // diameter and cut values are stored in the file's native length unit; names tell us which
      const metric = /\d\s*mm\b/.test(nm);
      const k = metric ? 1 : IN;
      let type = 'End Mill', cat = 'Spirals', angle = 0, radius = 0, tipDia = 0;
      if (/cabinet|ogee|classical|bead\b/.test(nm)) continue;   // profile/form bits: no MillMage equivalent
      const am = nm.match(/(\d+(?:\.\d+)?)\s*(?:deg|°)/);
      if (am) angle = +am[1];
      if (/v-?bit|v-?groove/.test(nm)) { type = 'V-Bit'; cat = 'V-Bits'; }
      else if (/round\s*over|roundover/.test(nm)) { type = 'Round-over'; cat = 'Round-over'; const rm = nm.match(new RegExp(NUM + '"?\\s*r\\b')) || nm.match(new RegExp('radius\\s*' + NUM)); if (rm) radius = num(rm[1]) * k; }
      else if (/carving liner|engrav/.test(nm)) { type = 'V-Bit'; cat = 'Engraving'; }
      else if (/tapered ball/.test(nm)) {
        type = 'Tapered Ball Mill'; cat = 'Tapered'; angle *= 2;
        const tm = nm.match(/tip\s*(\d*\.\d+)/); if (tm) radius = (+tm[1] / 2) * k;
      }
      else if (/ball/.test(nm)) { type = 'Ball Mill'; cat = 'Ball Nose'; }
      else if (/compression/.test(nm)) cat = 'Compression';
      else if (/dado|straight|plywood/.test(nm)) cat = 'Straight / Dado';
      else if (/spiral|up|down/.test(nm)) cat = 'Spirals';
      const sku = m[1];
      out.push(finish({
        id: 'w:' + hash(src + sku + name), vendor: name.split(' ')[0], sku, name: name.replace(/^\w+\s*\([^)]*\)\s*/, `(${sku}) `),
        url: '', src, imperial: !metric, flutes: /compression|2\s*flute/.test(nm) ? 2 : 2, notes: '',
        type, cat, dia: dia * k, angle, tipDia: 0, radius, length: lengthFromName(name, !metric) || 0,
        presets: [{ mat: 'General', feed: feed * f, plunge: plunge * f, ramp: null, rpm, down: down * k || null, over: over * k || null }],
      }));
    }
    return out;
  }

  /* ---------- file sniffing / zip ---------- */
  function sniff(buf) {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u[0] === 0x50 && u[1] === 0x4b) return 'zip';
    if (String.fromCharCode(...u.slice(0, 15)) === 'SQLite format 3') return 'sqlite';
    const head = new TextDecoder().decode(u.slice(0, 64)).trim();
    return head[0] === '{' || head[0] === '[' ? 'json' : 'bin';
  }

  /* first entry matching `pick` in a .zip (stored or deflate) -> Uint8Array */
  async function unzip(buf, pick = /\.json$/i) {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let e = u.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Not a valid zip file');
    let off = dv.getUint32(e + 16, true);
    for (let n = dv.getUint16(e + 10, true); n > 0; n--) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true),
        xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lo = dv.getUint32(off + 42, true);
      const name = new TextDecoder().decode(u.slice(off + 46, off + 46 + nl));
      off += 46 + nl + xl + cl;
      if (!pick.test(name)) continue;
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u.slice(start, start + csize);
      if (method === 0) return data;
      if (method !== 8) throw new Error('Unsupported zip compression');
      const out = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(out).arrayBuffer());
    }
    throw new Error('No tool data found inside that zip');
  }

  /* ---------- merge / dedupe ---------- */
  function merge(lists) {
    const all = [].concat(...lists).filter(t => !(t.type === 'Round-over' && !t.radius)), bySku = new Map(), res = [];
    for (const t of all) {
      const key = t.sku ? t.vendor.toLowerCase().replace(/[^a-z]/g, '') + '|' + t.sku.toLowerCase() : null;
      const ex = key && bySku.get(key);
      if (!ex) { res.push(t); if (key) bySku.set(key, t); continue; }
      // same SKU from two sources (e.g. Bits&Bits Fusion + Vectric): keep geometry, fold in presets + real flute length
      if (!ex.shank && t.shank) ex.shank = t.shank;
      if (ex.lenEst && !t.lenEst) { ex.length = t.length; ex.lenEst = false; }
      if (!ex.url && t.url) ex.url = t.url;
      for (const p of t.presets) if (!ex.presets.some(e => e.mat === p.mat)) ex.presets.push(p);
      ex.src = [...new Set(ex.src.split(' + ').concat(t.src))].join(' + ');
    }
    return res;
  }

  /* ---------- MillMage export ---------- */
  function defaults(t) {
    const D = t.dia, L = t.length;
    switch (t.type) {
      case 'V-Bit': return { down: Math.min(2.5, L), over: 0.254 };
      case 'Ball Mill': return { down: Math.min(D * 0.5, L), over: Math.max(0.05, D * 0.1) };
      case 'Tapered Ball Mill': return { down: Math.min(1, L), over: Math.max(0.05, (t.radius * 2 || D / 4) * 0.1) };
      case 'Tapered End Mill': return { down: Math.min(1, L), over: Math.max(0.05, (t.tipDia || D / 4) * 0.1) };
      case 'Round-over': return { down: Math.min(D * 0.5, L), over: D * 0.2 };
      default: return { down: Math.min(D, L), over: D * 0.4 };
    }
  }
  const mm = x => Math.round(x * 1e6) / 1e6;

  /* opts: { maxRpm, category: 'material'|string } -> MillMage tool record */
  function toMillMage(t, p, opts = {}) {
    let { rpm, feed, plunge, ramp } = p;
    if (opts.maxRpm && rpm > opts.maxRpm) { const s = opts.maxRpm / rpm; rpm = opts.maxRpm; feed *= s; plunge *= s; ramp = ramp && ramp * s; }
    const d = defaults(t);
    const cat = opts.category && opts.category !== 'material' ? opts.category : p.mat === 'General' ? t.vendor : p.mat;   // no material given -> file under the vendor
    const sec = x => mm(x / 60);
    const shankNote = t.shank ? `Shank ${t.imperial ? t.shank / IN : t.shank}${t.imperial ? '"' : ' mm'}` : '';
    const notes = [t.sku && `SKU ${t.sku}`, shankNote, `${t.vendor} starting point${p.mat === 'General' ? '' : ' for ' + p.mat}`, p.custom ? 'custom speeds/feeds' : '', p.down == null || p.over == null ? 'step-down/step-over estimated' : '', t.lenEst ? 'flute length estimated' : '']
      .filter(Boolean).join('. ') + '. Verify before cutting.';
    return {
      Category: cat,
      Diameter: mm(t.dia),
      FeedRate: sec(feed),
      FluteCount: t.flutes || 2,
      IncludedAngle: mm(t.angle || 0),
      Index: 0,
      Length: mm(t.length),
      MetricTool: !t.imperial,
      Name: t.name.length > 80 ? t.name.slice(0, 79).replace(/\s+\S*$/, '') + '…' : t.name,
      Notes: notes,
      PassDepth: mm(p.down || d.down),
      PlungeRate: sec(plunge),
      Radius: mm(t.radius || 0),
      RampAngle: 22.5,
      RampRate: sec(ramp || feed * 0.8),
      SpindleSpeed: Math.round(rpm),
      StepOver: mm(p.over || d.over),
      TipDiameter: mm(t.tipDia || 0),
      TipLength: t.type === 'Round-over' ? mm(t.radius || 0) : 0,
      ToolSpecURL: t.url || '',
      Type: t.type,
      Vendor: t.vendor,
    };
  }

  /* picks: [{tool, mat}] ; existing: parsed .tools object or null -> new .tools object */
  function buildLibrary(picks, opts = {}, existing = null) {
    const lib = existing ? JSON.parse(JSON.stringify(existing)) : {};
    for (const { tool, mat, ov } of picks) {
      const base = tool.presets.find(x => x.mat === mat) || tool.presets[0];
      const p = ov && Object.keys(ov).length ? { ...base, ...ov, custom: true } : base;
      const rec = toMillMage(tool, p, opts);
      (lib[rec.Category] = lib[rec.Category] || {})['{' + hash(tool.id + '|' + p.mat + '|' + rec.Category) + '}'] = rec;
    }
    const sorted = {};
    for (const c of Object.keys(lib).sort((a, b) => a.localeCompare(b))) {
      sorted[c] = {};
      for (const g of Object.keys(lib[c]).sort()) sorted[c][g] = lib[c][g];
    }
    return sorted;
  }

  return { sniff, unzip, fromFusion, fromVectricDb, fromVectricTool, merge, buildLibrary, toMillMage, defaults, hash, TYPES };
})();
if (typeof module !== 'undefined') module.exports = Conv;
