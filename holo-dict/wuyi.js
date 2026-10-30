// 烏衣行代號 v2 原型：query → 比對函式。語法規則見「烏衣行代號_規格v2.md」
//   compile(query) 回傳比對函式 fn(row)；fn.warnings 是警告訊息陣列（空陣列＝寫法沒問題）。
//   不合法的寫法不會丟錯，而是「查無結果」＋ fn.warnings 說明原因。
'use strict';
const INIT = ['tsh','ts','ph','th','kh','ng','p','b','m','t','n','l','k','g','h','s','j'];
const EXCL = { p:'(?!h)', t:'(?![hs])', k:'(?!h)', ts:'(?!h)', n:'(?!g)' };      // 聲母要整個比對：t 不含 th／ts，p 不含 ph…
const GROUP = { p:['ph','p','m','b'], t:['th','t','n','l'], k:['kh','k','ng','h','g'], ts:['tsh','ts','s','j'],
                ph:['ph','th','kh','tsh'], m:['m','n','ng'], b:['b','g'], j:['j','l'] };
const initRe = x => x + (EXCL[x] || '');
const INITANY = '(?:' + INIT.map(initRe).join('|') + ')';
const VOW = '(?:ee|oo|ir|[aeiou])';                       // 一個母音單位：ee、oo、ir 各算 1 個（資料中只出現這幾種雙字母母音）
const ZEROI = '(?=[aeiou]|m(?:h)?[1-9]|ng(?:h)?[1-9])';   // 無聲母：元音開頭，或成音節的 m／ng
const HANU = '(?:\\p{Script=Han}|[\\uE815-\\uE864])';
const esc = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');   // [修改] 不再跳脫 -（u 旗標的正則裡 \- 是錯的，漢字條件含 - 會丟錯）
const NEVER = /(?!)/;                                      // [新增] 永遠不成立：不合法的寫法用

// [新增] 警告收集：compile() 執行期間，各處用 warn() 記下「不合法或沒意義的寫法」
let WARN = null;
const warn = msg => { if (WARN && !WARN.includes(msg)) WARN.push(msg); };

// [新增] 疊字代號：連續兩個以上大寫字母，必須從 A 開頭，新字母依 B、C… 順序出現（AA、ABA、ABAC 是；BA、AC、PYI 不是）
const isDupRun = r => {
  if (r.length < 2) return false;
  let n = 0;
  for (const ch of r) { const x = ch.charCodeAt(0) - 65; if (x > n) return false; if (x === n) n++; }
  return true;
};
const hasDup = s => (s.match(/[A-Z]{2,}/g) || []).some(isDupRun);

// ---------- 音節 token → 正則（整個音節字串，如 tsit8） ----------
function longestInit(run) { for (const i of INIT) if (run.startsWith(i)) return i; return ''; }

function litRe(run, atStart) {            // 一段字母；開頭時先剝聲母（整個聲母）
  let out = '';
  if (atStart) { const ini = longestInit(run); if (ini) { out += initRe(ini); run = run.slice(ini.length); } }
  return out + run;
}

function tokenize(t) {                    // 把 token 本體切成項目
  const it = []; let j = 0;
  while (j < t.length) {
    const c = t[j];
    // [刪除] 原本的 \ 跳脫（c === '\\'）：規格不採用
    if (c === 'y') {
      const x = { k:'y' }; j++;
      if ('?*+'.includes(t[j]) && t[j] !== undefined) { x.q = t[j]; j++; }
      it.push(x); continue;
    }
    if (c === '.') { it.push({ k:'dot' }); j++; continue; }
    if (/[a-xz]/.test(c)) {
      let k = j; while (k < t.length && /[a-xz]/.test(t[k])) k++;
      let run = t.slice(j, k); j = k;
      if (t[j] === ';') {                 // 或：p;kh、i;u、a;ah；結尾的 ; ＝ 組（p; b; ts;…）
        const list = [run];
        while (t[j] === ';') { j++; let m = j; while (m < t.length && /[a-xz]/.test(t[m])) m++; list.push(t.slice(j, m)); j = m; }
        if (list[list.length-1] === '') {
          list.pop();
          if (list.length === 1 && GROUP[list[0]]) it.push({ k:'group', name:list[0] });
          else it.push({ k:'alt', list });
        } else it.push({ k:'alt', list });
        const last = it[it.length-1];
        if ('?*+'.includes(t[j]) && t[j] !== undefined) { last.q = t[j]; j++; }
        continue;
      }
      if ('?*+'.includes(t[j]) && t[j] !== undefined) {   // 字母後的 ? * +：只管最後一個字母
        if (run.length > 1) it.push({ k:'lit', s: run.slice(0, -1) });
        it.push({ k:'lit', s: run.slice(-1), q: t[j] }); j++;
      } else it.push({ k:'lit', s: run });
      continue;
    }
    it.push({ k:'lit', s: esc(c) }); j++;
  }
  return it;
}

function sylRe(tok) {
  let t = tok.toLowerCase();
  // [新增] 一般 token 後面直接加量詞（pa1+、pa0*）：沒有意義，提示改用 ( )。（pa0+ 的 0+ 是聲調符號，不在此列）
  if (/[1-9][*+?]$|0[*?]$|%[*+?]$/.test(t)) {
    warn('「' + tok + '」：一般音節不能直接加量詞（* + ?），要重複請用括號，如 (pa0)+');
    return NEVER;
  }
  let zero = false, trail = false, any = false;
  if (t[0] === '-' && t.length > 1) { zero = true; t = t.slice(1); }
  if (t.length > 1 && t.endsWith('-')) { trail = true; t = t.slice(0, -1); }
  let tone = null;
  const tm = /(0\+|%|[0-9](?:;[0-9])*)$/.exec(t);
  if (tm) { tone = tm[1]; t = t.slice(0, tm.index); }
  if (t === '') t = 'y';                                   // 純聲調 token（1、0、0+）＝ 任一音節加聲調
  // [新增] 聲母記號（- ? +）之後，聲母位置已被占用：不可單獨出現，也不可再寫聲母
  const mark = zero ? '-' : (t[0] === '?' || t[0] === '+') ? t[0] : '';
  if (mark) {
    const rest = zero ? t : t.slice(1);
    if (rest === '') {
      warn('「' + tok + '」：單獨的 ? 或 + 沒有意義，請寫 ?y（任一聲母或零聲母）或 +y（必須有聲母）');
      return NEVER;
    }
    if (longestInit(rest) && !/^(?:m|ng)/.test(rest)) {    // m、ng 在這裡是韻母（?ng0、+m0），其餘聲母字母不行
      warn('「' + tok + '」：' + mark + ' 之後聲母位置已被占用，不可再寫聲母，後面請寫韻母（如 ' + mark + 'a、' + mark + 'y）');
      return NEVER;
    }
  }
  let out = '';
  if (zero) out += ZEROI;
  if (t[0] === '?') { any = true; out += INITANY + '?'; t = t.slice(1); }                              // ? ＝ 任一聲母或零聲母
  else if (t[0] === '+') { any = true; out += '(?!(?:m|ng)h?[1-9])' + INITANY; t = t.slice(1); }          // + ＝ 必須有聲母（聲化韻 m、ng 不算）
  const it = tokenize(t);
  const endY = it.length > 0 && it[it.length - 1].k === 'y';   // 結尾是 y：y 帶聲調
  // 結尾連續的 y，遇到 trail（-）時當元音單位
  let trailStart = it.length;
  if (trail) { while (trailStart > 0 && it[trailStart-1].k === 'y') trailStart--; }
  const isLit = x => x && (x.k === 'lit' || x.k === 'alt' || x.k === 'group');
  it.forEach((x, n) => {
    const atStart = n === 0 && !zero && !any;
    if (x.k === 'lit') {
      let s = x.s;
      let r = litRe(s, atStart);                                               // [修改] 拿掉「不是 \ 開頭」的判斷
      if (x.q) r = '(?:' + r + ')' + x.q;
      if (!x.q && n === it.length - 1 && /(^|[^n])n$/.test(s)) r = r.replace(/n$/, '(?<!n)n');   // yn 的 n 不含 nn
      out += r;
    } else if (x.k === 'group') {
      out += '(?:' + GROUP[x.name].map(initRe).join('|') + ')' + (x.q || '');
    } else if (x.k === 'alt') {
      out += '(?:' + x.list.filter(Boolean).map(s => litRe(s, atStart)).join('|') + ')' + (x.q || '');
    } else if (x.k === 'dot') out += '[a-z]';
    else if (x.k === 'y') {
      if (zero && n === 0 && (x.q === '?' || x.q === '*') && it.length === 1) out += '(?:' + VOW + x.q + '|(?:m|ng)h?)';   // 零個元音：成音節的 m、ng
      else if (x.q || n >= trailStart) out += VOW + (x.q || '');                      // 元音單位（有量詞，或被結尾的 - 夾定）
      else {
        const inner = isLit(it[n-1]) && isLit(it[n+1]);                          // 兩側都是字母：至少 1 個；在邊緣：可為 0
        out += inner ? '[a-z]+' : '[a-z]*';
      }
    }
  });
  let tr;
  if (tone === null) tr = endY ? '[1-9]' : '(?:(?<=[ptkh])4|(?<![ptkh])1)';   // 沒寫調：結尾是 y 任一調；否則本調（臺羅不標調者：舒聲第 1 調、入聲第 4 調）
  else if (tone === '0') tr = '[1-9]';
  else if (tone === '0+' || tone === '%') tr = '[ptkh]?[1-9]';
  else tr = '[' + tone.replace(/;/g, '') + ']';
  return new RegExp('^' + out + tr + '$');
}

// ---------- 音節序列：token、( )、|、量詞、1y 標籤 ----------
function splitTokens(s) {
  const out = []; let cur = '';
  const flush = () => { if (cur) { out.push(cur); cur = ''; } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // [刪除] 原本的 \ 跳脫（c === '\\'）
    if (/\s/.test(c)) { flush(); continue; }
    if (c === '(' && cur === '') { out.push('('); continue; }
    if (c === ')') { flush(); let q = ''; if ('*+?'.includes(s[i+1]) && s[i+1] !== undefined) { q = s[i+1]; i++; } out.push(')' + q); continue; }
    if (c === '|' ) { flush(); out.push('|'); continue; }
    if (c === '-' && cur && i + 1 < s.length && !/[\s)|]/.test(s[i+1]) && !/^-+$/.test(cur)) { flush(); continue; }   // 音節間的連字號＝空格（[修改] 拿掉恆為真的 if (… || true)）
    cur += c;
  }
  flush();
  const res = [];
  for (const t of out) { if (/^y{2,}$/.test(t)) for (const _ of t) res.push('y'); else res.push(t); }   // yyy → y y y
  return res;
}

function parseSeq(toks, pos) {            // → { alts:[ [node…] … ], pos }
  const alts = [[]];
  while (pos.i < toks.length) {
    const t = toks[pos.i];
    if (t === '|') { alts.push([]); pos.i++; continue; }
    if (t[0] === ')') return { alts, close: t.slice(1) };
    if (t === '(') { pos.i++; const r = parseSeq(toks, pos); const q = r.close || ''; pos.i++; alts[alts.length-1].push({ k:'grp', alts:r.alts, q }); continue; }
    pos.i++;
    let m;
    if ((m = /^y([*+?])$/.exec(t))) { alts[alts.length-1].push({ k:'tok', re:/^[a-z]+[1-9]$/, q:m[1] }); continue; }
    if ((m = /^([1-9])y$/.exec(t))) { alts[alts.length-1].push({ k:'lab', n:m[1] }); continue; }
    alts[alts.length-1].push({ k:'tok', re: sylRe(t), q:'' });
  }
  return { alts, close: null };
}
const qr = q => q === '*' ? [0, 1e9] : q === '+' ? [1, 1e9] : q === '?' ? [0, 1] : [1, 1];

function matchNodes(nodes, ni, syl, p, caps, endOk, k) {   // 回溯比對；k＝後續
  if (ni === nodes.length) return k(p, caps);
  const nd = nodes[ni], [lo, hi] = qr(nd.q || '');
  const one = (pp, cc, cont) => {
    if (nd.k === 'tok') return pp < syl.length && nd.re.test(syl[pp]) ? cont(pp + 1, cc) : false;
    if (nd.k === 'lab') {
      if (pp >= syl.length) return false;
      if (cc[nd.n] === undefined) { const c2 = Object.assign({}, cc); c2[nd.n] = syl[pp]; return cont(pp + 1, c2); }
      return cc[nd.n] === syl[pp] ? cont(pp + 1, cc) : false;
    }
    for (const a of nd.alts) if (matchNodes(a, 0, syl, pp, cc, endOk, cont)) return true;
    return false;
  };
  const rep = (cnt, pp, cc) => {
    if (cnt < hi && one(pp, cc, (p2, c2) => (p2 === pp && cnt >= lo) ? false : rep(cnt + 1, p2, c2))) return true;
    return cnt >= lo && matchNodes(nodes, ni + 1, syl, pp, cc, endOk, k);
  };
  return rep(0, p, caps);
}

function compileSyl(seg, anchorS, anchorE) {
  const toks = splitTokens(seg);
  const { alts } = parseSeq(toks, { i: 0 });
  return syls => {
    const n = syls.length;
    for (let s = 0; s <= (anchorS ? 0 : n); s++)           // [修改] 拿掉無意義的 anchorS ? 0 : 0
      for (const a of alts)
        if (matchNodes(a, 0, syls, s, {}, null, (p) => !anchorE || p === n)) return true;
    return false;
  };
}

// ---------- 漢字 segment → 正則 ----------
function compileHan(seg, anchorS, anchorE) {
  let s = seg;
  let out = '', i = 0, runId = 0;
  while (i < s.length) {
    const c = s[i];
    // [刪除] 原本的 \ 跳脫
    const m = /^[A-Z]{2,}/.exec(s.slice(i));                  // [修改] 原本 [A-D]；A～Z 都可以當疊字代號
    if (m && isDupRun(m[0])) {                                // [新增] 要「從 A 開頭、新字母依序」才算疊字代號
      const seen = []; let r = '';                            // 疊字代號：不同字母＝不同字
      for (const L of m[0]) {
        const nm = 'g' + runId + L;
        if (seen.includes(L)) r += '\\k<' + nm + '>';
        else { const prev = seen.map(x => '\\k<g' + runId + x + '>'); r += (prev.length ? '(?!' + prev.join('|') + ')' : '') + '(?<' + nm + '>' + HANU + ')'; seen.push(L); }
      }
      runId++; out += r; i += m[0].length; continue;
    }
    if (m) { out += esc(m[0]); i += m[0].length; continue; }  // [新增] 不依序的大寫（BA、AC、PYI）：不是疊字代號，整段當一般字元
    if (c === 'w') out += HANU;
    else if (c === '.') out += '.';
    else if ('*+?|()'.includes(c)) out += c;
    else out += esc(c);
    i++;
  }
  const re = new RegExp((anchorS ? '^' : '') + '(?:' + out + ')' + (anchorE ? '$' : ''), 'u');
  return han => re.test(han);
}

// ---------- 總入口 ----------
const hanLike = s => /\p{Script=Han}|[\uE815-\uE864]|w/u.test(s) || hasDup(s);   // [修改] 疊字判斷改用 hasDup（A～Z、依序）；拿掉 \ 的處理
function splitTop(q, ch) {
  const parts = []; let d = 0, cur = '';
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    // [刪除] 原本的 \ 跳脫
    if (c === '(') d++; else if (c === ')') d = Math.max(0, d - 1);
    if (c === ch && d === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur); return parts;
}
const normHan = h => (h || '').replace(/【[^】]*】/g, '');
// 台羅無調＝「台羅」欄的讀音 ＋ 空格 ＋「又唸作」的讀音。詞組內的空格也是空格，所以用台羅欄的音節數把兩段切開
function clean(x) { return x.replace(/【[^】]*】/g, '').toLowerCase().replace(/[^a-z0-9\s\-\/]/g, ' '); }
function readings(nt, tl) {
  nt = clean(nt || '');
  let main = nt, extra = '';
  if (tl) {
    const total = clean((tl || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')).split(/[-\s\/]+/).filter(Boolean).length;
    const re = /[a-z0-9]+/g; let m, c = 0, cut = -1;
    while ((m = re.exec(nt))) { if (++c === total) { cut = m.index + m[0].length; break; } }
    if (cut >= 0) { main = nt.slice(0, cut); extra = nt.slice(cut); }
  }
  const out = [];
  for (const x of main.split('/')) { const t = x.trim(); if (t) out.push(t.split(/[-\s]+/).filter(Boolean)); }   // 主讀音：空格是詞組內的空格
  for (const x of extra.split(/[\/\s]+/)) { const t = x.trim(); if (t) out.push(t.split(/-+/).filter(Boolean)); }       // 又唸作：空格分開的是不同讀音
  return out;
}

function compile(query) {
  const warns = [];                                           // [新增] 警告陣列，掛在回傳的函式上（fn.warnings）
  WARN = warns;
  let tests;
  try {
    const q = query.trim();
    const segs = splitTop(q, '#').map(s => s.trim()).filter(Boolean);
    const auto = segs.length === 1;                           // 單一條件才自動精確；A#B 是「兩者都含」
    tests = segs.map(seg => {
      let anchS = false, anchE = false;
      if (seg[0] === '^') { anchS = true; seg = seg.slice(1); }
      if (seg.endsWith('$')) { anchE = true; seg = seg.slice(0, -1); }   // [修改] 拿掉「$ 前不是 \」的判斷
      const explicit = anchS || anchE;
      const S = explicit ? anchS : auto, E = explicit ? anchE : auto;
      if (hanLike(seg)) { const f = compileHan(seg, S, E); return row => f(normHan(row.han)); }
      const f = compileSyl(seg, S, E);
      return row => readings(row.nt, row.tl).some(f);
    });
  } catch (err) {                                             // [新增] 語法錯誤（如括號不成對）：不丟錯，查無結果＋警告
    warns.push('語法有誤，無法解讀：' + err.message);
    tests = [() => false];
  } finally {
    WARN = null;
  }
  const fn = row => tests.every(t => t(row));
  fn.warnings = warns;
  return fn;
}
const lint = query => compile(query).warnings;                // [新增] 只檢查寫法，回傳警告陣列
module.exports = { compile, lint, sylRe, readings, splitTokens, isDupRun };
