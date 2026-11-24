/* Prep Generator: question generators and maths typesetting.
   Each generator takes a seeded random source r and returns
   { marks, parts:[{label, prompt, promptAns, space, work}] }.
   Works in the browser (window.PrepGen) and in Node (module.exports) for testing. */
(function (root) {
'use strict';

/* ---------------------------------------------------------- seeded random */
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}
function rng(seedText) {
  let [a, b, c, d] = cyrb128(String(seedText));
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const r = {
    random: next,
    randint: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    choice: arr => arr[Math.floor(next() * arr.length)],
    sample(arr, k) { const a2 = arr.slice(), out = []; for (let i = 0; i < k; i++) out.push(a2.splice(Math.floor(next() * a2.length), 1)[0]); return out; },
  };
  return r;
}

/* ---------------------------------------------------------- number helpers */
const M = '&minus;';
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => a * b / gcd(a, b);
const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };
function assert(c, msg) { if (!c) throw new Error('Check failed: ' + (msg || '')); }

/* fixed-point decimals: value = int / 10^dp */
function fmtDec(int, dp) {
  const neg = int < 0; int = Math.abs(int);
  let s = String(int);
  if (dp === 0) return (neg ? '-' : '') + s;
  s = s.padStart(dp + 1, '0');
  return (neg ? '-' : '') + s.slice(0, -dp) + '.' + s.slice(-dp);
}
function tidy(int, dp) {               // 2340, 2 → "23.4"
  let s = fmtDec(int, dp);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
const negTxt = n => String(n).replace('-', M);
const pounds = p => `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`;
const money = p => (p < 0 ? M : '') + '£' + pounds(Math.abs(p));
const priceText = p => p < 100 ? `${p}p` : money(p);

/* fractions */
class Fr {
  constructor(n, d = 1) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; this.n = n / g; this.d = d / g; }
  add(o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { if (typeof o === 'number') o = new Fr(o); return new Fr(this.n * o.n, this.d * o.d); }
  div(o) { return new Fr(this.n * o.d, this.d * o.n); }
  cmp(o) { return this.n * o.d - o.n * this.d; }
  eq(o) { return this.cmp(o) === 0; }
}
const F = (n, d) => `<span class="frac"><span>${n}</span><span class="den">${d}</span></span>`;
const Ff = f => F(f.n, f.d);
const MX = (w, n, d) => `<span class="mixed">${w}${F(n, d)}</span>`;
function show(f) {
  if (f.d === 1) return String(f.n);
  const w = Math.floor(f.n / f.d), r = f.n % f.d;
  return w ? MX(w, r, f.d) : F(r, f.d);
}
function tidySteps(n, d) {           // 18/8 → steps [2 2/8, 2 1/4]
  const steps = []; const g = gcd(n, d);
  if (n >= d && n % d) {
    const w = Math.floor(n / d), r = n % d;
    steps.push(MX(w, r, d));
    if (gcd(r, d) > 1) steps.push(MX(w, r / gcd(r, d), d / gcd(r, d)));
  } else if (n % d === 0) steps.push(String(n / d));
  else if (g > 1) steps.push(F(n / g, d / g));
  return { steps, final: steps.length ? steps[steps.length - 1] : F(n, d) };
}
const proper = (r, d) => r.choice(range(1, d - 1).filter(n => gcd(n, d) === 1));

/* ---------------------------------------------------------- working lines */
const L = (html, tag = '') => `<div class="wl"><span>${html}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</div>`;
const ANS = (html, tag = '') => L(`<span class="final">${html}</span>`, tag);
const W = (...lines) => lines.filter(Boolean).join('');
const TAGS = t => `<div class="tags"><span class="tag">${t}</span></div>`;

/* column subtraction with exchanges; a and b strings with the same number of dp */
function colSub(a, b, dp) {
  const ai = Math.round(parseFloat(a) * 10 ** dp), bi = Math.round(parseFloat(b) * 10 ** dp);
  let sa = fmtDec(ai, dp), sb = fmtDec(bi, dp), sr = fmtDec(ai - bi, dp);
  const w = Math.max(sa.length, sb.length);
  sa = sa.padStart(w); sb = sb.padStart(w); sr = sr.padStart(w);
  const isD = c => c >= '0' && c <= '9';
  const digs = [...sa].map(c => isD(c) ? +c : null), orig = digs.slice(), exch = Array(w).fill(false);
  const bd = [...sb].map(c => isD(c) ? +c : 0);
  for (let i = w - 1; i >= 0; i--) {
    if (digs[i] === null) continue;
    if (digs[i] < bd[i]) { let j = i - 1; while (digs[j] === null) j--; digs[j]--; digs[i] += 10; exch[i] = true; }
  }
  const top = [], ra = [], rb = [], rr = [];
  for (let i = 0; i < w; i++) {
    if (sa[i] === '.') { top.push('<td></td>'); ra.push('<td class="pt">.</td>'); rb.push('<td class="pt">.</td>'); rr.push('<td class="pt">.</td>'); continue; }
    const nw = digs[i] - (exch[i] ? 10 : 0), changed = orig[i] !== null && nw !== orig[i];
    top.push(`<td class="new">${changed ? nw : ''}</td>`);
    ra.push(`<td>${exch[i] ? '<span class="one">1</span>' : ''}<span class="${changed ? 'x' : ''}">${sa[i].trim()}</span></td>`);
    rb.push(`<td>${sb[i].trim()}</td>`); rr.push(`<td>${sr[i].trim()}</td>`);
  }
  return '<table class="colsum">' +
    `<tr><td></td>${top.join('')}</tr><tr><td></td>${ra.join('')}</tr>` +
    `<tr class="bot"><td class="op">&minus;</td>${rb.join('')}</tr><tr class="res"><td></td>${rr.join('')}</tr></table>`;
}

/* short division (bus stop) of a decimal string by an integer, with carries */
function busStop(dividend, divisor) {
  const digits = [...dividend], q = [], carries = [];
  let r = 0, started = false;
  for (const ch of digits) {
    if (ch === '.') { q.push('.'); carries.push(0); started = true; continue; }
    const val = r * 10 + +ch, qd = Math.floor(val / divisor); r = val % divisor;
    carries.push(r);
    if (qd === 0 && !started) q.push(''); else { q.push(String(qd)); started = true; }
  }
  const cq = [], cd = []; let prev = 0;
  digits.forEach((ch, i) => {
    const first = i === 0 ? ' first' : '';
    if (ch === '.') { cq.push('<td class="pt">.</td>'); cd.push(`<td class="pt in${first}">.</td>`); return; }
    cq.push(`<td>${q[i]}</td>`);
    cd.push(`<td class="in${first}">${prev ? `<span class="one">${prev}</span>` : ''}${ch}</td>`);
    prev = carries[i];
  });
  return `<table class="bus"><tr><td></td>${cq.join('')}</tr><tr><td class="dv">${divisor}</td>${cd.join('')}</tr></table>`;
}

/* roman numerals */
const RN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function roman(n) { let o = ''; for (const [v, s] of RN) while (n >= v) { o += s; n -= v; } return o; }
function romanParts(n) { const o = []; for (const p of [1000, 100, 10, 1]) { const d = Math.floor(n / p) % 10 * p; if (d) o.push([d, roman(d)]); } return o; }

/* vertical scale; lo/hi/gap in tenths */
function scaleSvg(lo10, gap10, ticks, target, answer) {
  const h = 150, top = 14, bot = h - 14, step = (bot - top) / (ticks - 1);
  const p = [`<svg viewBox="0 0 130 ${h}" width="130" height="${h}" class="scale">`,
    `<line x1="40" y1="${top}" x2="40" y2="${bot}" stroke="#000237" stroke-width="1.6"/>`];
  for (let i = 0; i < ticks; i++) {
    const y = (bot - i * step).toFixed(1);
    p.push(`<line x1="32" y1="${y}" x2="48" y2="${y}" stroke="#000237" stroke-width="1.6"/>`);
    const v = tidy(lo10 + i * gap10, 1);
    if (i === 0 || i === ticks - 1) p.push(`<text x="56" y="${+y + 5}" font-size="14" font-family="Literata" fill="#000237">${v}</text>`);
    else if (answer) p.push(`<text x="56" y="${+y + 6}" font-size="17" font-family="Kalam" fill="#dc143c">${v}</text>`);
    if (i === target) p.push(`<path d="M8 ${y} h17" stroke="#000237" stroke-width="2"/><path d="M29 ${y} l-8 -5 v10z" fill="#000237"/>`);
  }
  p.push('</svg>');
  return p.join('');
}

/* ---------------------------------------------------------- building blocks */
const part = (prompt, space = 0, work = '', label = null, promptAns = null) => ({ label, prompt, promptAns, space, work });
const calc = h => `<div class='calc'>${h}</div>`;
const inl = h => `<span class='calc in'>${h}</span>`;
const NAMES = ['Sam', 'Mia', 'Raj', 'Ella', 'Tom', 'Amara', 'Leo', 'Isla', 'Noah', 'Zara', 'Jack', 'Priya',
  'Ollie', 'Freya', 'Kian', 'Ruby', 'Arjun', 'Hattie', 'Max', 'Lily'];

/* ================================================================ decimals */
function decSub(r) {
  const style = r.choice(['1dp-2dp', '1dp-2dp', 'whole-2dp', '2dp-1dp']);
  let a, b;                                  // hundredths
  const no0 = (lo, hi) => range(lo, hi).filter(x => x % 10);
  if (style === '1dp-2dp') { a = r.randint(105, 499) * 10; b = r.choice(no0(101, 998)); }
  else if (style === 'whole-2dp') { a = r.randint(11, 30) * 100; b = r.choice(no0(201, 998)); }
  else {
    for (;;) { a = r.choice(no0(1005, 4998)); const bt = r.randint(21, 99); b = bt * 10; if (bt % 10 > Math.floor(a / 10) % 10) break; }
  }
  assert(a > b);
  const work = W(colSub(fmtDec(a, 2), fmtDec(b, 2), 2), TAGS('M1 A1'));
  return { marks: 2, parts: [part(`Work out${calc(`${tidy(a, 2)} ${M} ${tidy(b, 2)}`)}`, 40, work)] };
}

function decMul(r) {
  const a = r.choice(range(105, 998).filter(x => x % 10)), n = r.randint(3, 9);
  const pa = part(inl(`${tidy(a, 2)} × ${n}`), 30, W(L(`${a} × ${n} = ${a * n}`, 'M1'), ANS(tidy(a * n, 2), 'A1')), 'a');
  const [x, y] = r.choice([[r.randint(2, 9), r.randint(2, 9)], [r.randint(11, 25), r.randint(2, 9)]]);
  const [dx, dy] = r.choice([[1, 1], [1, 2], [2, 1]]);
  const padded = fmtDec(x * y, dx + dy), t = tidy(x * y, dx + dy);
  const fin = padded === t ? padded : `${padded} = ${t}`;
  const pb = part(inl(`${tidy(x, dx)} × ${tidy(y, dy)}`), 30,
    W(L(`${x} × ${y} = ${x * y}`, 'M1'), L(`${dx + dy} decimal places`), ANS(fin, 'A1')), 'b');
  return { marks: 4, parts: [part('Work out'), pa, pb] };
}

function decDiv(r) {
  const n = r.randint(3, 9);
  let q, shown, written;
  if (r.random() < 0.6) { q = r.randint(105, 999); shown = fmtDec(q * n, 2); written = shown; }
  else { q = r.choice(range(105, 995).filter(x => x % 5 === 0 && x % 10)); shown = tidy(q * n, 2); written = fmtDec(q * n, 2); }
  assert((q * n) % n === 0);
  const work = W(busStop(written, n), TAGS('M1 A1'));
  return { marks: 2, parts: [part(`Work out${calc(`${shown} ÷ ${n}`)}`, 34, work)] };
}

/* ================================================================ fractions */
function fracPair(r, kind) {
  let d1, d2;
  if (kind === 'coprime') {
    for (;;) { [d1, d2] = r.sample(range(2, 9), 2); if (gcd(d1, d2) === 1 && d1 * d2 <= 63) break; }
  } else {
    for (;;) { d1 = r.randint(2, 6); d2 = d1 * r.randint(d1 === 2 ? 3 : 2, 4); if (d2 <= 24) break; }
    if (r.random() < 0.5) [d1, d2] = [d2, d1];
  }
  return [new Fr(proper(r, d1), d1), new Fr(proper(r, d2), d2)];
}

function fracAddSub(r, opts) {
  const kind = (opts && opts.kind) || 'coprime';
  let f1, f2, op;
  for (;;) {
    [f1, f2] = fracPair(r, kind); op = r.choice(['+', '-']);
    if (op === '-' && f1.cmp(f2) < 0) [f1, f2] = [f2, f1];
    if (op === '-' && f1.eq(f2)) continue;
    if (op === '+' && f1.add(f2).cmp(new Fr(3, 2)) > 0) continue;
    break;
  }
  const D = lcm(f1.d, f2.d), n1 = f1.n * D / f1.d, n2 = f2.n * D / f2.d, n = op === '+' ? n1 + n2 : n1 - n2;
  assert(new Fr(n, D).eq(op === '+' ? f1.add(f2) : f1.sub(f2)));
  const sym = op === '+' ? '+' : M;
  const { steps } = tidySteps(n, D);
  const work = steps.length
    ? W(L(`${F(n1, D)} ${sym} ${F(n2, D)} = ${F(n, D)}`, 'M1'), ANS(steps.length === 1 ? steps[0] : `${steps[0]} = ${steps[steps.length - 1]}`, 'A1'))
    : W(L(`${F(n1, D)} ${sym} ${F(n2, D)}`, 'M1'), ANS(F(n, D), 'A1'));
  return { marks: 2, parts: [part(`Work out${calc(`${Ff(f1)} ${sym} ${Ff(f2)}`)}`, 24, work)] };
}

function mixedSub(r) {
  let f1, f2;
  for (;;) { [f1, f2] = fracPair(r, r.choice(['coprime', 'multiple'])); if (f1.cmp(f2) < 0) [f1, f2] = [f2, f1]; if (!f1.eq(f2)) break; }
  const w1 = r.randint(11, 29), w2 = r.randint(3, w1 - 3);
  const D = lcm(f1.d, f2.d), n1 = f1.n * D / f1.d, n2 = f2.n * D / f2.d, fr = new Fr(n1 - n2, D);
  const ans = fr.add(new Fr(w1 - w2));
  assert(ans.eq(new Fr(w1).add(f1).sub(new Fr(w2).add(f2))));
  let fline = `${Ff(f1)} ${M} ${Ff(f2)} = ${F(n1, D)} ${M} ${F(n2, D)} = ${F(n1 - n2, D)}`;
  if (gcd(n1 - n2, D) > 1) fline += ` = ${show(fr)}`;
  const work = W(L(`${w1} ${M} ${w2} = ${w1 - w2}`, 'M1'), L(fline, 'M1'), ANS(show(ans), 'A1'));
  return { marks: 3, parts: [part(`Work out${calc(`${MX(w1, f1.n, f1.d)} ${M} ${MX(w2, f2.n, f2.d)}`)}`, 47, work)] };
}

function fracXInt(r) {
  let d, n, k;
  for (;;) { d = r.randint(3, 9); n = proper(r, d); k = r.randint(2, 9); if ((n * k) % d && n * k > d) break; }
  const { steps, final } = tidySteps(n * k, d);
  const aWork = steps.length > 1 ? W(L(`${F(n * k, d)} = ${steps[0]}`, 'M1'), ANS(final, 'A1')) : W(L(F(n * k, d), 'M1'), ANS(final, 'A1'));
  const pa = part(inl(`${F(n, d)} × ${k}`), 30, aWork, 'a');
  let d2, n2, w, k2;
  for (;;) { d2 = r.randint(3, 8); n2 = proper(r, d2); w = r.randint(1, 4); k2 = r.randint(2, 6); if ((n2 * k2) % d2) break; }
  const fpart = new Fr(n2 * k2, d2), ans = fpart.add(new Fr(w * k2));
  assert(ans.eq(new Fr(w).add(new Fr(n2, d2)).mul(k2)));
  let fl = `${F(n2, d2)} × ${k2} = ${F(n2 * k2, d2)}`;
  if (show(fpart) !== F(n2 * k2, d2)) fl += ` = ${show(fpart)}`;
  const pb = part(inl(`${MX(w, n2, d2)} × ${k2}`), 38,
    W(L(`${w} × ${k2} = ${w * k2}`), L(fl, 'M1'), ANS(`${w * k2} + ${show(fpart)} = ${show(ans)}`, 'A1')), 'b');
  return { marks: 4, parts: [part('Work out, giving your answers as mixed numbers'), pa, pb] };
}

function fracXFrac(r) {
  const parts = [part('Work out')];
  for (const [lab, cancel] of [['a', false], ['b', true]]) {
    let f1, f2;
    for (;;) {
      const d = r.randint(2, 9), e = r.randint(2, 9);
      f1 = new Fr(proper(r, d), d); f2 = new Fr(proper(r, e), e);
      const g = gcd(f1.n * f2.n, f1.d * f2.d);
      if ((g > 1) === cancel && !f1.eq(f2)) break;
    }
    const n = f1.n * f2.n, dd = f1.d * f2.d, { steps, final } = tidySteps(n, dd);
    const top = F(`${f1.n} × ${f2.n}`, `${f1.d} × ${f2.d}`);
    const work = steps.length ? W(L(`${top} = ${F(n, dd)}`, 'M1'), ANS(final, 'A1')) : W(L(top, 'M1'), ANS(F(n, dd), 'A1'));
    parts.push(part(inl(`${Ff(f1)} × ${Ff(f2)}`), 30, work, lab));
  }
  return { marks: 4, parts };
}

function fracDiv(r) {
  const parts = [part('Work out')];
  for (const lab of ['a', 'b']) {
    let f1, f2;
    for (;;) {
      const d = r.randint(2, 9), e = r.randint(2, 9);
      f1 = new Fr(proper(r, d), d); f2 = new Fr(proper(r, e), e);
      if (!f1.eq(f2) && f1.div(f2).d !== 1) break;
    }
    const n = f1.n * f2.d, dd = f1.d * f2.n, { steps, final } = tidySteps(n, dd);
    assert(new Fr(n, dd).eq(f1.div(f2)));
    const flip = `${Ff(f1)} × ${F(f2.d, f2.n)}`;
    const work = steps.length ? W(L(`${flip} = ${F(n, dd)}`, 'M1'), ANS(final, 'A1')) : W(L(flip, 'M1'), ANS(F(n, dd), 'A1'));
    parts.push(part(inl(`${Ff(f1)} ÷ ${Ff(f2)}`), 30, work, lab));
  }
  return { marks: 4, parts };
}

function mixedMulDiv(r) {
  const parts = [part('Work out, giving your answers as mixed numbers')];
  for (const [lab, op] of [['a', '×'], ['b', '÷']]) {
    let a, b, res;
    for (;;) {
      const d = r.randint(2, 5), e = r.randint(2, 5);
      a = new Fr(r.randint(1, 3)).add(new Fr(proper(r, d), d));
      b = new Fr(r.randint(1, 3)).add(new Fr(proper(r, e), e));
      res = op === '×' ? a.mul(b) : a.div(b);
      if (res.d !== 1 && res.cmp(new Fr(1)) > 0 && res.cmp(new Fr(15)) < 0 && !a.eq(b)) break;
    }
    const wa = Math.floor(a.n / a.d), ra = a.n % a.d, wb = Math.floor(b.n / b.d), rb = b.n % b.d;
    let n, dd, mid;
    if (op === '×') { n = a.n * b.n; dd = a.d * b.d; mid = F(n, dd); }
    else { n = a.n * b.d; dd = a.d * b.n; mid = `${Ff(a)} × ${F(b.d, b.n)} = ${F(n, dd)}`; }
    const { final } = tidySteps(n, dd);
    assert(new Fr(n, dd).eq(res));
    parts.push(part(inl(`${MX(wa, ra, a.d)} ${op} ${MX(wb, rb, b.d)}`), 40,
      W(L(`${Ff(a)} ${op} ${Ff(b)}`, 'M1'), L(mid, 'M1'), ANS(final, 'A1')), lab));
  }
  return { marks: 6, parts };
}

/* ================================================================ amounts */
const amt = (v, u) => u === null ? String(v) : u === '£' ? `£${v}` : `${v} ${u}`;

function fracOfAmount(r) {
  const d = r.randint(3, 9), n = r.choice(range(2, d - 1).filter(x => gcd(x, d) === 1));
  const k = r.randint(3, d <= 6 ? 15 : 11), total = d * k;
  const unit = r.choice(['£', '£', '£', 'kg', 'cm', 'm', null]);
  const q = r.choice([`Find ${F(n, d)} of ${amt(total, unit)}`, `What is ${F(n, d)} of ${amt(total, unit)}?`]);
  const lines = [L(`${total} ÷ ${d} = ${k}`, 'M1')];
  let marks = 2;
  if (unit !== null) { lines.push(L(`${k} × ${n} = ${k * n}`, 'A1'), ANS(amt(k * n, unit), 'U1')); marks = 3; }
  else lines.push(ANS(`${k} × ${n} = ${k * n}`, 'A1'));
  return { marks, parts: [part(q, 34, W(...lines))] };
}

function percentOfAmount(r) {
  const p = r.choice([10, 20, 25, 50, 75, 5]);
  const base = { 10: 10, 20: 5, 25: 4, 50: 2, 75: 4, 5: 20 }[p];
  const v = base * r.randint(3, 30), ans = v * p / 100;
  const wa = {
    25: W(L(`25% → ${F(1, 4)}`), ANS(`${v} ÷ 4 = ${ans}`, 'A1')),
    50: W(L(`50% → ${F(1, 2)}`), ANS(`${v} ÷ 2 = ${ans}`, 'A1')),
    75: W(L(`25% → ${v} ÷ 4 = ${v / 4}`), ANS(`75% → ${v / 4} × 3 = ${ans}`, 'A1')),
    10: W(ANS(`${v} ÷ 10 = ${ans}`, 'A1')),
    20: W(L(`10% → ${v / 10}`), ANS(`20% → ${v / 10} × 2 = ${ans}`, 'A1')),
    5: W(L(`10% → ${v / 10}`), ANS(`5% → ${v / 10} ÷ 2 = ${ans}`, 'A1')),
  }[p];
  const pa = part(`${p}% of ${v}`, 20, wa, 'a');
  const p2 = r.choice([30, 40, 60, 70, 80, 90, 30, 60, 15, 35]);
  const v2 = (p2 % 10 ? 20 : 10) * r.randint(3, 15), ten = v2 / 10, a2 = v2 * p2 / 100;
  assert(Number.isInteger(a2));
  const wb = p2 % 10
    ? W(L(`10% → ${v2} ÷ 10 = ${ten}, &nbsp;5% → ${ten / 2}`, 'M1'), L(`${p2}% → ${ten} × ${Math.floor(p2 / 10)} + ${ten / 2} = ${a2}`, 'A1'), ANS(`£${a2}`, 'U1'))
    : W(L(`10% → ${v2} ÷ 10 = ${ten}`, 'M1'), L(`${p2}% → ${ten} × ${p2 / 10} = ${a2}`, 'A1'), ANS(`£${a2}`, 'U1'));
  const pb = part(`${p2}% of £${v2}`, 30, wb, 'b');
  return { marks: 4, parts: [part('Find'), pa, pb] };
}

/* ================================================================ number line */
function scale(r, opts) {
  const ticks = (opts && opts.ticks) || 5, gaps = ticks - 1;
  const gap10 = r.choice([20, 25, 30, 40, 45, 50, 15, 60, 75, 100, 250, 5]);
  let lo10 = r.randint(0, 12) * (gap10 >= 50 ? 5 : 2) * 10;
  if (gap10 >= 100) lo10 = r.randint(0, 10) * 100;
  const hi10 = lo10 + gaps * gap10, target = r.randint(1, gaps - 1), ans10 = lo10 + target * gap10;
  const work = W(L(`${tidy(hi10, 1)} ${M} ${tidy(lo10, 1)} = ${tidy(hi10 - lo10, 1)}`),
    L(`${tidy(hi10 - lo10, 1)} ÷ ${gaps} = ${tidy(gap10, 1)}`, 'M1'), ANS(tidy(ans10, 1), 'A1'));
  const p = `<div class="withscale"><div>What number is the arrow pointing to?</div>${scaleSvg(lo10, gap10, ticks, target, false)}</div>`;
  const pa = `<div class="withscale"><div>What number is the arrow pointing to?<div class="work side">${work}</div></div>${scaleSvg(lo10, gap10, ticks, target, true)}</div>`;
  return { marks: 2, parts: [part(p, 0, '', null, pa)] };
}

/* ================================================================ time */
const hm = t => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
const twelve = t => { const h = Math.floor(t / 60) % 24, m = t % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

function timeDuration(r) {
  let start, dur;
  for (;;) { start = r.randint(7 * 12, 15 * 12) * 5; dur = r.randint(10, 34) * 5;
    if (start % 60 && Math.floor((start + dur) / 60) > Math.floor(start / 60) && (start + dur) % 60) break; }
  const end = start + dur, lines = [];
  let nh = (Math.floor(start / 60) + 1) * 60;
  lines.push(L(`${hm(start)} → ${hm(nh)} = ${nh - start} min`));
  const eh = Math.floor(end / 60) * 60;
  if (eh > nh) { lines.push(L(`${hm(nh)} → ${hm(eh)} = ${eh - nh} min`)); nh = eh; }
  lines.push(L(`${hm(nh)} → ${hm(end)} = ${end - nh} min`, 'M1'));
  let q;
  if (r.choice(['minutes', 'minutes', 'hm']) === 'minutes') {
    q = `How many minutes is it from ${hm(start)} to ${hm(end)}?`; lines.push(ANS(`${dur} minutes`, 'A1'));
  } else {
    q = `How long is it from ${hm(start)} to ${hm(end)}? Give your answer in hours and minutes.`;
    lines.push(ANS(`${dur} min = ${Math.floor(dur / 60)} h ${dur % 60} min`, 'A1'));
  }
  return { marks: 2, parts: [part(q, 32, W(...lines))] };
}

function timeEnd(r) {
  const what = r.choice(['A film', 'A football match', 'A school trip', 'A play', 'A train journey', 'A concert']);
  let q, work;
  if (r.random() < 0.5) {
    const start = r.randint(12 * 12 + 1, 19 * 12) * 5, h = r.randint(1, 2);
    let m = r.randint(2, 11) * 5;
    if ((start % 60) + m < 60) m = Math.min(60 - start % 60 + r.randint(1, 6) * 5, 55);
    const end = start + 60 * h + m;
    q = `${what} starts at ${hm(start)} and lasts ${h} hour${h > 1 ? 's' : ''} ${m} minutes. What time does it finish? Give your answer using the 12-hour clock.`;
    work = W(L(`${hm(start)} + ${h} h = ${hm(start + 60 * h)}`), L(`${hm(start + 60 * h)} + ${m} min = ${hm(end)}`, 'M1'), ANS(twelve(end), 'A1'));
  } else {
    const start = r.randint(8 * 12 + 1, 11 * 12 + 6) * 5;
    const dur = r.choice(range(13, 28).filter(x => x % 12).map(x => x * 5)), end = start + dur;
    q = `${what} starts at ${twelve(start)} and lasts ${dur} minutes. What time does it finish? Give your answer using the 24-hour clock.`;
    work = W(L(`${dur} min = ${Math.floor(dur / 60)} h ${dur % 60} min`), L(`${twelve(start)} = ${hm(start)}`),
      L(`${hm(start)} + ${Math.floor(dur / 60)} h ${dur % 60} min = ${hm(end)}`, 'M1'), ANS(hm(end), 'A1'));
  }
  return { marks: 2, parts: [part(q, 28, work)] };
}

/* ================================================================ money */
const ITEMS = [['notebook', 'notebooks'], ['sandwich', 'sandwiches'], ['ticket', 'tickets'], ['comic', 'comics'],
  ['drink', 'drinks'], ['bag of crisps', 'bags of crisps'], ['cupcake', 'cupcakes'], ['ruler', 'rulers'],
  ['sticker book', 'sticker books'], ['ice cream', 'ice creams']];
const SMALL = ['a pen', 'a rubber', 'a lolly', 'an apple', 'a bookmark', 'a pencil', 'a badge', 'a postcard'];

function moneyQ(r) {
  const name = r.choice(NAMES);
  let q, work;
  if (r.random() < 0.6) {
    const [, many] = r.choice(ITEMS), n = r.randint(2, 5);
    let p = r.random() < 0.5 ? r.randint(21, 99) * 5 : r.randint(105, 495);
    while (p % 100 === 0 || p < 105) p = r.randint(105, 495);
    const small = r.choice(SMALL), sp = r.randint(25, 95), total = n * p + sp, note = total < 1000 ? 1000 : 2000;
    q = `${name} buys ${n} ${many} costing ${money(p)} each and ${small} costing ${sp}p. ${name} pays with a £${note / 100} note. How much change does ${name} get?`;
    work = W(L(`${pounds(p)} × ${n} = ${pounds(n * p)}`, 'M1'), L(`${pounds(n * p)} + 0.${String(sp).padStart(2, '0')} = ${pounds(total)}`, 'M1'),
      L(`${pounds(note)} ${M} ${pounds(total)} = ${pounds(note - total)}`, 'A1'), ANS(money(note - total), 'U1'));
  } else {
    const [[, m1], [, m2]] = r.sample(ITEMS, 2);
    const p1 = r.randint(7, 19) * 5, p2 = r.randint(105, 395), n1 = r.randint(3, 6), n2 = r.randint(2, 4);
    q = `${m1[0].toUpperCase() + m1.slice(1)} cost ${priceText(p1)} each and ${m2} cost ${priceText(p2)} each. ${name} buys ${n1} ${m1} and ${n2} ${m2}. How much does ${name} spend altogether?`;
    work = W(L(`${n1} × ${pounds(p1)} = ${pounds(n1 * p1)}`, 'M1'), L(`${n2} × ${pounds(p2)} = ${pounds(n2 * p2)}`, 'M1'),
      L(`${pounds(n1 * p1)} + ${pounds(n2 * p2)} = ${pounds(n1 * p1 + n2 * p2)}`, 'A1'), ANS(money(n1 * p1 + n2 * p2), 'U1'));
  }
  return { marks: 4, parts: [part(q, 46, work)] };
}

/* ================================================================ roman numerals */
function romanQ(r) {
  const tricky = () => { for (;;) { const n = r.randint(14, 399); if (/[49]/.test(String(n))) return n; } };
  const a = tricky(), b = tricky(), pa = romanParts(a), pb = romanParts(b);
  const wa = W(L(pa.map(x => x[0]).join(' + ') + ' = ' + pa.map(x => x[1]).join(' ')), ANS(roman(a), 'A1'));
  const wb = W(L(pb.map(x => x[1]).join(' + ') + ' = ' + pb.map(x => x[0]).join(' + ')), ANS(String(b), 'A1'));
  return { marks: 2, parts: [part(`Write ${a} in Roman numerals.`, 16, wa, 'a'), part(`What number is ${roman(b)}?`, 18, wb, 'b')] };
}

/* ================================================================ negatives */
function negItem(r, kind) {
  let a = r.randint(2, 25), b = r.randint(2, 25);
  const lohi = () => { if (a > b) [a, b] = [b, a]; if (a === b) b++; };
  switch (kind) {
    case '-a+b_pos': lohi(); return [`${M}${a} + ${b}`, b - a];
    case 'a-b_neg': lohi(); return [`${a} ${M} ${b}`, a - b];
    case '-a-b': return [`${M}${a} ${M} ${b}`, -a - b];
    case '-a+b_neg': lohi(); return [`${M}${b} + ${a}`, a - b];
    case 'three': { const c = r.randint(5, 30); return [`${M}${a} ${M} ${b} + ${c}`, -a - b + c]; }
    case 'a--b': return [`${a} ${M} ${M}${b}`, a + b];
    case '-a--b': return [`${M}${a} ${M} ${M}${b}`, b - a];
    case 'a+-b': return [`${a} + ${M}${b}`, a - b];
    case '-a+-b': return [`${M}${a} + ${M}${b}`, -a - b];
  }
  const x = r.randint(2, 12), y = r.randint(2, 12);
  switch (kind) {
    case '-axb': return [`${M}${x} × ${y}`, -x * y];
    case '-ax-b': return [`${M}${x} × ${M}${y}`, x * y];
    case '-a/b': return [`${M}${x * y} ÷ ${y}`, -x];
    case 'a/-b': return [`${x * y} ÷ ${M}${y}`, -x];
    case '-a/-b': return [`${M}${x * y} ÷ ${M}${y}`, x];
  }
  throw new Error(kind);
}
const NL1 = ['-a+b_pos', 'a-b_neg', '-a-b', '-a+b_neg', 'a-b_neg', 'three'];
const NL2 = ['a--b', '-a--b', 'a+-b', '-a+-b'];
const NL3 = ['-axb', '-ax-b', '-a/b', 'a/-b', '-a/-b'];

function negatives(r, opts) {
  const level = +((opts && opts.level) || 1);
  const kinds = level === 1 ? NL1.slice() : level === 2 ? r.sample(NL1.slice(0, 4), 3).concat(r.sample(NL2, 3))
    : r.sample(NL1.slice(0, 4), 2).concat(r.sample(NL2, 2), r.sample(NL3, 2));
  const rows = kinds.map(k => negItem(r, k));
  const table = answer => `Work out<div class='neg'>${rows.map(([q, v], i) =>
    `<div class="negrow"><b>${'abcdef'[i]}</b><span class="calc in">${q} =</span><span class="blank">${answer ? `<span class="w">${negTxt(v)}</span>` : ''}</span></div>`).join('')}</div>` +
    (answer ? '<span class="tag negtag">A1 each</span>' : '');
  return { marks: 6, parts: [part(table(false), 0, '', null, table(true))], check: rows };
}

/* ================================================================ problem solving */
function problem(r) {
  const t = r.choice(['spend', 'sale', 'class', 'recipe']), name = r.choice(NAMES);
  if (t === 'spend') {
    const d = r.choice([3, 4, 5, 8, 10]), n = proper(r, d), total = d * r.randint(4, 10), spent = total / d * n;
    let lunch = r.randint(3, 9) * 50 + r.choice([0, 25]);
    while (spent * 100 + lunch >= total * 100) lunch -= 100;
    const left = total * 100 - spent * 100 - lunch;
    const q = `${name} has £${total}. ${name} spends ${F(n, d)} of it on a book and ${money(lunch)} on lunch. How much money does ${name} have left?`;
    return { marks: 4, parts: [part(q, 50, W(L(`${total} ÷ ${d} = ${total / d}, &nbsp;${total / d} × ${n} = ${spent}`, 'M1'),
      L(`${total} ${M} ${spent} = ${total - spent}`), L(`${total - spent} ${M} ${pounds(lunch)} = ${pounds(left)}`, 'M1 A1'), ANS(money(left), 'U1')))] };
  }
  if (t === 'sale') {
    const thing = r.choice(['jacket', 'pair of trainers', 'bike helmet', 'board game', 'football']);
    const price = r.random() < 0.6 ? r.randint(3, 9) * 10 : r.randint(5, 18) * 4;
    let p = price % 4 === 0 ? r.choice([10, 20, 25, 50]) : r.choice([10, 20, 30]);
    let off = price * p / 100;
    if (!Number.isInteger(off)) { p = 10; off = price / 10; }
    if (!Number.isInteger(off)) { p = 50; off = price / 2; }
    const sale = price - off, note = [10, 20, 50, 100].find(x => x > sale);
    const q = `A ${thing} costs £${price}. In a sale, the price is reduced by ${p}%. ${name} buys it with a £${note} note. How much change does ${name} get?`;
    return { marks: 4, parts: [part(q, 50, W(L(`${p}% of ${price} = ${off}`, 'M1'), L(`${price} ${M} ${off} = ${sale}`, 'M1'),
      L(`${note} ${M} ${sale} = ${note - sale}`, 'A1'), ANS(`£${note - sale}`, 'U1')))] };
  }
  if (t === 'class') {
    let d1, d2, tot, n1, n2, a, b;
    for (;;) {
      [d1, d2] = r.sample([2, 3, 4, 5, 6, 8], 2); tot = lcm(d1, d2) * r.randint(1, 4);
      if (tot < 20 || tot > 36) continue;
      n1 = proper(r, d1); n2 = proper(r, d2); a = tot / d1 * n1; b = tot / d2 * n2;
      if (a + b < tot) break;
    }
    const q = `There are ${tot} pupils in a class. ${F(n1, d1)} of them walk to school and ${F(n2, d2)} of them come by bus. The rest come by car. How many pupils come by car?`;
    return { marks: 3, parts: [part(q, 46, W(L(`${tot} ÷ ${d1} × ${n1} = ${a}`, 'M1'), L(`${tot} ÷ ${d2} × ${n2} = ${b}`, 'M1'),
      L(`${tot} ${M} ${a} ${M} ${b} = ${tot - a - b}`, 'A1'), ANS(`${tot - a - b} pupils`)))] };
  }
  const people = r.choice([2, 4, 4, 6]), k = r.randint(2, 4), d = r.choice([2, 3, 4, 5, 8]), n = proper(r, d);
  const am = new Fr(r.choice([0, 0, 1])).add(new Fr(n, d)), res = am.mul(k);
  const [unit, ing] = r.choice([['kg', 'flour'], ['kg', 'potatoes'], ['litres', 'milk'], ['kg', 'rice']]);
  const q = `A recipe for ${people} people uses ${show(am)} ${unit} of ${ing}. How much ${ing} is needed for ${people * k} people?`;
  return { marks: 3, parts: [part(q, 46, W(L(`${people * k} ÷ ${people} = ${k}`), L(`${show(am)} × ${k} = ${show(res)}`, 'M1 A1'), ANS(`${show(res)} ${unit}`, 'U1')))] };
}

/* ================================================================ catalogue */
const TOPICS = {
  dec_sub:           { name: 'Decimal subtraction', fn: decSub },
  frac_addsub:       { name: 'Fraction + / −', fn: fracAddSub, opt: { key: 'kind', label: 'Denominators', values: [['coprime', 'Coprime'], ['multiple', 'One goes into the other']] } },
  mixed_sub:         { name: 'Mixed number subtraction', fn: mixedSub },
  frac_x_int:        { name: 'Fraction × integer', fn: fracXInt },
  frac_of_amount:    { name: 'Fraction of an amount', fn: fracOfAmount },
  percent_of_amount: { name: 'Percentage of an amount', fn: percentOfAmount },
  scale:             { name: 'Number line (what’s at the arrow)', fn: scale },
  time_duration:     { name: 'Time: how long', fn: timeDuration },
  money:             { name: 'Money', fn: moneyQ },
  time_end:          { name: 'Time: finishing time', fn: timeEnd },
  roman:             { name: 'Roman numerals', fn: romanQ },
  negatives:         { name: 'Negative numbers', fn: negatives, opt: { key: 'level', label: 'Level', values: [['1', '1: + and −'], ['2', '2: adjacent signs'], ['3', '3: × and ÷ too']] } },
  problem:           { name: 'Problem solving', fn: problem },
  frac_x_frac:       { name: 'Fraction × fraction', fn: fracXFrac },
  frac_div:          { name: 'Fraction ÷ fraction', fn: fracDiv },
  dec_mul:           { name: 'Multiplying decimals', fn: decMul },
  dec_div:           { name: 'Decimal ÷ integer', fn: decDiv },
  mixed_muldiv:      { name: 'Mixed number × and ÷', fn: mixedMulDiv },
};

const api = { TOPICS, rng, roman, gcd, Fr };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PrepGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
