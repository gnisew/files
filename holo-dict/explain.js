// explain.js ── 查詢解說（代號面板「!」按鈕用，第一次按「!」才載入）
// 不是「一個查詢對一句解說」的資料庫，而是「規則式」：
//   1. 把查詢拆成一個個「位置」（漢字、w、音節代號、疊字、群組、字元集…）
//   2. 每個位置各自翻成白話（聲母、韻尾、聲調、筆畫、部首、量詞…）
//   3. 再接成一句話。要調整說法，改下面各 describe／Text 函式即可。
// 涵蓋：烏衣行簡易代號（w y v V ~ % @ 0 0+ 0++ ; ? 1y AA # | 頻 部件查字…）與正則（群組、| 、[] 、{} 、量詞、前後查看、\h…）。
// 對外只有一個函式：holoExplain(查詢文字, { autoExact }) → { main: 一句話, notes: [補充說明…] }
(function () {
  'use strict';

  // ===== 基本常數（與 script.js 的 SIMPLE 語法保持一致）=====
  const HANCH = '(?:[\\u3007\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uE815-\\uE864\\uF900-\\uFAFF]|[\\uD840-\\uD87F][\\uDC00-\\uDFFF])';
  const HAN1 = new RegExp('^' + HANCH + '$');
  const hanAt = (s, i) => { if (i >= s.length) return null; const ch = String.fromCodePoint(s.codePointAt(i)); return HAN1.test(ch) ? ch : null; };
  const INITS = 'tsh|ts|ph|th|kh|ng|p|t|k|m|b|n|l|s|j|g|h';
  const CODA = '(?:ng|nn|m|n|p|t|k|h)';
  const INIT_ONE = '(?:' + INITS + ')';
  const INIT_G = '(' + INIT_ONE + '(?:;' + INIT_ONE + ')*;?)';      // 聲母、聲母群組（p;）、聲母或（p;kh）
  const CODA_G = '(' + CODA + '(?:;' + CODA + ')*;?)';              // 韻尾、韻尾清單（m;ng）、m; p;
  const INIT_RE = new RegExp('^(?:' + INITS + ')(?:;(?:' + INITS + '))*');
  const INIT_ALL = new RegExp('^(?:' + INITS + ')$');
  const VOW_LIST = /^(?:oo|[aeiou])(?:;(?:oo|[aeiou]))+/;
  const CODA_LIST = new RegExp('^([b-df-hj-np-tv-z]*[aeiou]+)(' + CODA + '(?:;' + CODA + ')+)(?![A-Za-z])');
  const INIT_GROUP = {
    p: ['唇音', 'p ph m b'], t: ['舌音', 't th n l'], ts: ['齒音', 'ts tsh s j'], k: ['牙喉音', 'k kh g ng h'],
    ph: ['送氣音', 'ph th kh tsh'], m: ['鼻音聲母', 'm n ng'], b: ['b、g 組', 'b g'], j: ['j、l 組', 'j l']
  };
  const RADA = HANCH + '部';
  const W_SPEC = '(?:(?:<=|>=|<|>)[0-9]+|[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*)';
  const W_ELEM = new RegExp('w(?:' + RADA + '|' + W_SPEC + ')?(?:#(?:' + RADA + '|' + W_SPEC + '|[^\\s#]+))*', 'y');
  const SPEC_ONLY = new RegExp('^' + W_SPEC + '$');
  const RAD_ONLY = new RegExp('^(' + HANCH + ')部$');
  const BRACE_Q = /^\{\d*(?:,\d*)?\}/;

  const NUM = ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'];
  const num = n => (n <= 10 ? NUM[n] : String(n));
  const q1 = s => '「' + s + '」';

  // ===== 用語（想改說法就改這裡）=====
  const initText = I => {                         // 聲母寫法 → 白話
    if (I.endsWith(';')) { const n = I.slice(0, -1), g = INIT_GROUP[n]; return g ? g[0] + '（' + g[1] + '）' : n; }
    return I.split(';').join('或');
  };
  const codaText = c => {                         // 韻尾寫法 → 白話
    if (c === 'm;') return '鼻音結尾（m n ng nn）';
    if (c === 'p;') return '入聲結尾（p t k h）';
    return c.replace(/;$/, '').split(';').join('或') + '結尾';
  };
  const TONE_TXT = { '0': '任意調', '0+': '完整八調（入聲收 h）', '0++': '完整八調（入聲 p t k h 皆可）', '%': '任意調（可含入聲尾）', '@': '聲調在詞尾' };
  const toneText = t => TONE_TXT[t] || (/^[1-9]$/.test(t) ? '第' + t + '調' : '');
  const strokeText = spec => {
    const m = /^(<=|>=|<|>)([0-9]+)$/.exec(spec);
    if (m) return '筆畫' + { '<': '小於', '<=': '小於或等於', '>': '大於', '>=': '大於或等於' }[m[1]] + m[2];
    return '筆畫' + spec.split(',').map(p => p.replace('-', '至')).join('、');
  };
  // 量詞 → 放在前面的說法：* → 零個以上的、{2,5} → 2至5個
  function qPrefix(q) {
    if (q === '*') return '零個以上的';
    if (q === '+') return '一個以上的';
    if (q === '?') return '可有可無的';
    const m = /^\{(\d*)(?:(,)(\d*))?\}$/.exec(q);
    if (!m) return '';
    const a = m[1], b = m[3];
    if (!m[2]) return num(+a) + '個';
    if (a && !b) return num(+a) + '個以上的';
    if (!a && b) return '最多' + num(+b) + '個的';
    if (a && b) return num(+a) + '至' + num(+b) + '個';
    return '零個以上的';
  }

  // 0+／0++ 的實際展開（只用在補充說明）：sam0+ → sam1、sam2、sam3、sam5、sam7、sap4、sap8
  function toneExamples(stem, plus2) {
    const lo = ['1', '2', '3', '5', '7'].map(d => stem + d);
    const four = base => ['p', 't', 'k', 'h'].map(x => base + x).join('／') + ' 的 4、8 調';
    const toStop = { m: 'p', n: 't', ng: 'k' };
    if (/[aeiou][ptkh]$/.test(stem)) return stem + '4、' + stem + '8';
    if (/nn$/.test(stem) || !/[aeiou]/.test(stem)) return lo.concat([stem + 'h4', stem + 'h8']).join('、');
    const nm = /(ng|m|n)$/.exec(stem);
    if (nm) {
      const base = stem.slice(0, -nm[1].length);
      return plus2 ? lo.join('、') + '，另有 ' + four(base)
                   : lo.concat([base + toStop[nm[1]] + '4', base + toStop[nm[1]] + '8']).join('、');
    }
    return plus2 ? lo.join('、') + '，另有 ' + four(stem) : lo.concat([stem + 'h4', stem + 'h8']).join('、');
  }

  // ===== 括號、字元集的輔助 =====
  function clsEnd(s, i) {                          // s[i] 是 [ → 回傳對應 ] 的位置，沒有回傳 -1
    let j = i + 1; if (s[j] === '^') j++; if (s[j] === ']') j++;
    while (j < s.length && s[j] !== ']') { if (s[j] === '\\') j++; j++; }
    return j < s.length ? j : -1;
  }
  function matchClose(s, i) {                      // s[i] 是 ( → 回傳對應 ) 的位置，沒有回傳 -1
    let d = 0;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '[') { j = clsEnd(s, j); if (j < 0) return -1; continue; }
      if (c === '(') d++;
      else if (c === ')') { d--; if (!d) return j; }
    }
    return -1;
  }
  function splitTop(s, ch) {                       // 在括號、字元集、跳脫之外，以 ch 切開
    const parts = []; let d = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
      if (c === '[') { const e = clsEnd(s, i); if (e > 0) { cur += s.slice(i, e + 1); i = e; continue; } }
      if (c === '(') d++; else if (c === ')') d = Math.max(0, d - 1);
      if (c === ch && d === 0) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur); return parts;
  }

  // 字元集 [ptkh]、[^a-z] → 白話
  function classText(inner) {
    let neg = false, s = inner;
    if (s[0] === '^') { neg = true; s = s.slice(1); }
    const out = []; const cs = Array.from(s);
    const ESC = { d: '數字', D: '非數字', s: '空白', S: '非空白', w: '字母數字底線', W: '非字母數字底線' };
    for (let i = 0; i < cs.length; i++) {
      let c = cs[i];
      if (c === '\\' && i + 1 < cs.length) {
        const d = cs[++i];
        if (ESC[d]) { out.push(ESC[d]); continue; }
        c = d;
      }
      if (cs[i + 1] === '-' && i + 2 < cs.length) { out.push(c + '至' + (cs[i + 2] === '\\' ? cs[i + 3] : cs[i + 2])); i += cs[i + 2] === '\\' ? 3 : 2; continue; }
      out.push(c);
    }
    return neg ? '不是「' + out.join(' ') + '」的字元' : '「' + out.join(' ') + '」其中一個';
  }

  // ===== 一個音節代號 → { base, frags, key } =====
  // ctx.mix：查詢含漢字或 w（混合查詢），沒寫聲調的拼音＝任意調；ctx.stand：這個音節單獨一段（前後是空格或頭尾），沒寫聲調才補預設調
  function describeSyl(tok, ctx) {
    let s = tok, m;
    if ((m = /^([1-9])y$/.exec(s))) { ctx.notes.add('數字相同＝同一音節，不同＝不同音節（編號，不是聲調）'); return { base: '音節' + m[1], frags: [], key: null }; }
    let tone = '';
    if ((m = /(0\+\+|0\+|0|[1-9]|%|@)$/.exec(s)) && s.length > m[0].length) { tone = m[1]; s = s.slice(0, -m[0].length); }
    else if (/^(?:0\+\+|0\+|0|[1-9]|%|@)$/.test(s)) { tone = s; s = 'y'; }       // 只有聲調：等同 y＋聲調
    let zero = false, must = false, anyI = false;
    if (s[0] === '-' && s[1] === 'y') { zero = true; s = s.slice(1); }
    else if ((s[0] === '?' || s[0] === '+') && /^[aeiouy]/.test(s[1] || '')) { if (s[0] === '?') anyI = true; else must = true; s = s.slice(1); }

    const frags = [], tf = tone ? toneText(tone) : '';
    const pre = I => { if (zero) frags.push('無聲母'); else if (I) frags.push(initText(I) + '開頭'); else if (must) frags.push('一定有聲母'); };
    const tail = () => frags.push(tf || '任意調');
    const R = re => new RegExp('^' + re + '$').exec(s);
    const syl = extra => ({ base: '一個音節', frags, key: null, ...extra });

    // ---- ~ 系列 ----
    if (s[0] === '~') {
      const T = { '~': '任一音節', '~<': '聲母', '~>': '韻母（含聲調）', '~m': '鼻音結尾（m n ng nn）', '~p': '入聲結尾（p t k h）' };
      if (T[s]) { if (tf && s !== '~>') frags.push(tf); return { base: s === '~' ? '一個音節' : s === '~<' || s === '~>' ? T[s] : '一個音節', frags: s === '~' || s === '~<' || s === '~>' ? frags : [T[s]].concat(frags), key: null }; }
      if ((m = /^~([a-z]+)$/.exec(s))) { frags.push('以「' + m[1] + '」結尾（舊寫法）'); tail(); return syl(); }
    }

    if (s === 'y') {                                             // y、-y、+y、y3
      pre(''); if (frags.length || tf) tail();
      return { base: '一個音節', frags, key: frags.length ? null : 'y' };
    }
    if ((m = R(INIT_G + '?y'))) { pre(m[1]); if (m[1]) frags.push('任意韻'); tail(); return syl(); }                         // ty、by
    if ((m = R(INIT_G + '?y' + CODA_G))) {                                                                                 // sym、ym;、yp;、ym;ng
      pre(m[1]);
      if (m[1] || zero) frags.push('中間是元音');
      frags.push(codaText(m[2])); tail(); return syl();
    }
    if ((m = R(INIT_G + '?y([-+])' + '(?:' + CODA_G + ')?'))) {                                                            // py-、py+、py-ng
      pre(m[1]); frags.push(m[2] === '-' ? '只有一個元音' : '只有元音（一個以上）'); if (m[3]) frags.push(codaText(m[3])); tail();
      return syl();
    }
    if ((m = R(INIT_G + '?y([a-z]+(?:;[a-z]+)+)')) && !m[2].split(';').every(x => INIT_ALL.test(x))) {                      // yi;u、ya;ah
      pre(m[1]); frags.push('以' + m[2].split(';').map(q1).join('或') + '結尾'); tail(); return syl();
    }
    if ((m = R(INIT_G + '?([aeiou]+)y'))) { frags.push('以「' + m[2] + '」開頭，後面至少再有一個字母'); tail(); return syl(); }   // piy
    if ((m = R(INIT_G + '?y([aeiou]+)'))) { pre(m[1]); frags.push(m[1] ? '中間有元音，以「' + m[2] + '」結尾' : '「' + m[2] + '」前面還有字母'); tail(); return syl(); }   // kyu、ya
    if ((m = R('([aeiou]+)y([aeiou]+)'))) { frags.push('首「' + m[1] + '」、尾「' + m[2] + '」，中間有元音'); tail(); return syl(); }   // iyu
    if ((m = R('([a-z]+)y([a-z]+)'))) { frags.push('以「' + m[1] + '」開頭、「' + m[2] + '」結尾，中間是元音（一個以上）'); tail(); return syl(); }   // piym、kyt
    if ((m = R(INIT_G)) && /;/.test(s)) { frags.push(initText(m[1]) + '開頭'); if (tf) frags.push(tf); return syl(); }      // p;、p;kh

    // ---- 純拼音（可含 ; ? + v V）：pue、sam0++、a;i、pa;i0、p;a、hu?e1、pvt ----
    if (/^[a-zV;?+]+$/.test(s)) {
      const hasSemi = s.includes(';'), hasQ = s.includes('?'), hasPlus = s.includes('+'), hasV = /[vV]/.test(s);
      const stem = s.replace(/[;?+]/g, '');
      if (anyI || must) { frags.push((anyI ? '任一聲母（含無聲母）' : '一定有聲母') + '加「' + s + '」'); frags.push(tf || '第1調'); return syl(); }
      // 拆開「聲母群組、元音或、韻尾或」，其餘照字母
      const parts = []; let lit = '', i = 0;
      const flush = () => { if (lit) { parts.push(q1(lit)); lit = ''; } };
      while (i < s.length) {
        const rest = s.slice(i), prevL = /[a-zV]/.test(s[i - 1] || ''); let mm;
        if (hasSemi && !prevL && (mm = INIT_RE.exec(rest)) && (mm[0].includes(';') || rest[mm[0].length] === ';')) {
          flush(); const g = rest[mm[0].length] === ';' && !mm[0].includes(';');
          parts.push(initText(g ? mm[0] + ';' : mm[0])); i += mm[0].length + (g ? 1 : 0); continue;
        }
        if (hasSemi && !prevL && (mm = CODA_LIST.exec(rest))) {
          lit += mm[1]; flush(); parts.push('（' + mm[2].split(';').map(q1).join('或') + '）'); i += mm[0].length; continue;
        }
        if (hasSemi && /[aeiou]/.test(s[i]) && (mm = VOW_LIST.exec(rest))) {
          flush(); parts.push('（' + mm[0].split(';').map(q1).join('或') + '）'); i += mm[0].length; continue;
        }
        lit += s[i]; i++;
      }
      flush();
      let t = tf;
      if (!t) {
        if (hasSemi || hasV || ctx.mix) t = '任意調';
        else if (ctx.stand) { t = /[ptkh]$/.test(stem) ? '第4調' : '第1調'; ctx.notes.add('沒寫聲調的拼音，視為第 1 調（p t k h 結尾視為第 4 調）'); }
      }
      if (hasSemi) frags.push(parts.join('接'));
      if (hasQ) frags.push('「?」前面的字母可有可無');
      if (hasPlus) frags.push('「+」前面的字母可重複');
      if (hasV) ctx.notes.add('v＝任一元音（a e i o u），V＝任一輔音字母');
      if (t) frags.push(t);
      if ((tone === '0+' || tone === '0++') && !hasSemi && !hasQ && !hasPlus) ctx.notes.add('例：' + toneExamples(stem, tone === '0++'));
      return { base: hasSemi ? '一個音節' : '音節「' + s + '」', frags: hasSemi ? frags : frags, key: null, pin: !hasSemi && !hasQ && !hasPlus && !hasV ? s : undefined };
    }
    return { base: '一個音節', frags: ['寫法較進階：「' + tok + '」'], key: null, unknown: true };
  }

  // 黏在一起的音節拆開：y0y3 → y0 y3；pue-kue → pue kue；yy → y y
  function splitGlue(t) {
    if (/^y{2,}$/.test(t)) return t.split('');
    const out = []; let cur = '';
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '-' && i > 0 && t[i - 1] !== 'y' && cur) { out.push(cur); cur = ''; continue; }   // 音節間的連字號（y- 是元音符號，不拆）
      cur += c;
      let isTone = false;
      if (c === '0' && t[i + 1] === '+') { cur += '+'; i++; if (t[i + 1] === '+') { cur += '+'; i++; } isTone = true; }
      else if (/[0-9%]/.test(c) && !(cur.length === 1 && t[i + 1] === 'y')) isTone = true;        // 1y 的 1 是編號，不是聲調
      if (isTone) {
        const q = t[i + 1];
        if (q && (/[A-Za-z~]/.test(q) || ((q === '?' || q === '+') && /[aeiou]/.test(t[i + 2] || '')))) { out.push(cur); cur = ''; }
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  // 疊字代號（AA、ABB…）：字母依序編排且有重複才算
  function isRep(code) {
    let max = 64, rep = false; const seen = new Set();
    for (const c of code) { const k = c.charCodeAt(0); if (seen.has(c)) rep = true; else { if (k !== max + 1) return false; max = k; seen.add(c); } }
    return rep;
  }
  function repText(code) {
    const g = {}; Array.from(code).forEach((c, i) => (g[c] = g[c] || []).push(i + 1));
    const reps = Object.keys(g).filter(c => g[c].length > 1);
    const all = reps.length === 1 && g[reps[0]].length === code.length;
    return '疊字「' + code + '」：' + (all ? num(code.length) + '個字相同' : '共' + num(code.length) + '個字；' + reps.map(c => '第' + g[c].join('、') + '字相同').join('，') + '，其餘彼此不同');
  }

  // 一個 w 元素（w、w5、w<5、w好部、w#ky、w<5#好部#hy）→ 條件說明
  function wItem(str, quant, ctx) {
    const frags = [];
    for (const part of str.slice(1).split('#')) {
      if (!part) continue;
      let m;
      if (SPEC_ONLY.test(part)) frags.push(strokeText(part));
      else if ((m = RAD_ONLY.exec(part))) frags.push('部首與「' + m[1] + '」相同');
      else { const d = describeSyl(part, ctx); frags.push.apply(frags, d.frags); }
    }
    if (quant) return { base: qPrefix(quant) + '字', frags, key: null };
    return { base: '一個字', frags, key: frags.length ? null : 'w' };
  }

  // 量詞接在最後一個位置上
  function applyQuant(items, q, lazy) {
    let it = items[items.length - 1]; if (!it) return false;
    if (it.lit !== undefined && Array.from(it.lit).length > 1) {          // 天地? → 只有「地」可有可無
      const cs = Array.from(it.lit), last = cs.pop();
      it.lit = cs.join(''); it.base = q1(it.lit);
      it = { lit: last, base: q1(last), frags: [], key: null }; items.push(it);
    }
    if (it.pin && it.pin.length > 1) {                                    // sa* → 「s」接零個以上的「a」
      it.base = q1(it.pin.slice(0, -1)) + '接' + qPrefix(q) + q1(it.pin.slice(-1)); it.frags = [];
    } else it.base = qPrefix(q) + it.base;
    if (lazy) it.base += '（盡量少）';
    it.lit = undefined; it.key = null; it.pin = undefined;
    return true;
  }

  // 整串查詢（已去掉頭尾的 ^ $、| 、頂層 #）→ 位置清單；遇到看不懂的寫法回傳 null。nd＝在群組／| 之內，不補預設聲調
  function scan(body, ctx, nd) {
    const items = []; const n = body.length; let i = 0, sawHan = false;
    const sylStart = c => (c === '?' || c === '+') && !ctx.han && (i === 0 || /[ \-(|#]/.test(body[i - 1])) && /[aeiouy]/.test(body[i + 1] || '');
    while (i < n) {
      const c = body[i];
      if (c === ' ') { i++; continue; }

      // 量詞：* + ? {n,m}（接在漢字、.、群組、字元集、\h…後面）
      if ((c === '*' || c === '+' || c === '?' || (c === '{' && BRACE_Q.test(body.slice(i)))) && !sylStart(c)) {
        if (!items.length || i === 0 || body[i - 1] === ' ') return null;
        const q = c === '{' ? BRACE_Q.exec(body.slice(i))[0] : c;
        i += q.length;
        let lazy = false; if (body[i] === '?') { lazy = true; i++; }
        if (!applyQuant(items, q, lazy)) return null;
        continue;
      }

      if (c === 'w') {
        W_ELEM.lastIndex = i; const m = W_ELEM.exec(body); i += m[0].length;
        let q = '';
        if (body[i] && '+*?'.indexOf(body[i]) >= 0) { q = body[i]; i++; }
        else if (body[i] === '{' && BRACE_Q.test(body.slice(i))) { q = BRACE_Q.exec(body.slice(i))[0]; i += q.length; }
        items.push(wItem(m[0], q, ctx)); sawHan = true; continue;
      }

      // 群組 ( … )、(?: … )、(?= … )、(?! … )、(?<= … )、(?<! … )、(?<名稱> … )
      if (c === '(') {
        const end = matchClose(body, i); if (end < 0) return null;
        let k = i + 1, look = '';
        if (body[k] === '?' && !(!ctx.han && /[aeiouy]/.test(body[k + 1] || ''))) {
          const m = /^\?(?::|=|!|<=|<!|<[A-Za-z_][A-Za-z0-9_]*>)/.exec(body.slice(k)); if (!m) return null;
          look = m[0].slice(1); k += m[0].length;
        }
        const txt = renderAlt(body.slice(k, end), ctx, true); if (txt === null) return null;
        const LOOK = { '=': '後面接', '!': '後面不接', '<=': '前面是', '<!': '前面不是' };
        items.push({ base: LOOK[look] ? '（' + LOOK[look] + '：' + txt + '）' : '（' + txt + '）', frags: [], key: null, grp: true });
        i = end + 1; sawHan = true; continue;
      }
      if (c === ')') return null;

      // 字元集
      if (c === '[') {
        const e = clsEnd(body, i); if (e < 0) return null;
        items.push({ base: classText(body.slice(i + 1, e)), frags: [], key: null }); i = e + 1; sawHan = true; continue;
      }

      // 跳脫：\h \d \s \b \1 \k<名> \. …
      if (c === '\\') {
        const d = body[i + 1]; if (d === undefined) return null;
        let m;
        if (d === 'h') { items.push({ base: '一個字', frags: [], key: 'w' }); i += 2; sawHan = true; continue; }
        if (d === 'k' && (m = /^\\k<([^>]+)>/.exec(body.slice(i)))) { items.push({ base: '與「' + m[1] + '」組相同', frags: [], key: null }); i += m[0].length; continue; }
        if (/[1-9]/.test(d)) { items.push({ base: '與第' + d + '組相同', frags: [], key: null }); i += 2; continue; }
        const E = { d: '一個數字', D: '一個非數字', s: '一個空白', S: '一個非空白', b: '詞的邊界', B: '非詞的邊界', n: '換行', t: 'Tab' };
        if (E[d]) { items.push({ base: E[d], frags: [], key: null }); i += 2; continue; }
        if (/[wyvV]/.test(d)) ctx.notes.add('\\' + d + ' 是字母「' + d + '」本身，不是代號');
        items.push({ base: q1(d), frags: [], key: null, lit: undefined }); i += 2; continue;
      }

      if (c === '^') { items.push({ base: '詞目開頭', frags: [], key: null }); i++; continue; }
      if (c === '$') { items.push({ base: '詞目結尾', frags: [], key: null }); i++; continue; }

      const h = hanAt(body, i);
      if (h) {
        sawHan = true;
        const alts = [h]; let j = i + h.length;
        while (body[j] === ';' && hanAt(body, j + 1)) { const h2 = hanAt(body, j + 1); alts.push(h2); j += 1 + h2.length; }
        if (alts.length > 1) items.push({ base: alts.map(q1).join('或'), frags: [], key: null, alt: true });
        else {
          const last = items[items.length - 1];
          if (last && last.lit !== undefined) { last.lit += h; last.base = q1(last.lit); }
          else items.push({ lit: h, base: q1(h), frags: [], key: null });
        }
        i = j; continue;
      }
      if (/[A-Z]/.test(c) && !/[A-Za-z]/.test(body[i - 1] || '')) {
        const m = /^[A-Z]{2,}(?![A-Za-z])/.exec(body.slice(i));
        if (m && isRep(m[0])) { items.push({ base: repText(m[0]), frags: [], key: null }); i += m[0].length; sawHan = true; continue; }
      }
      if (c === '.') { items.push({ base: '任一字元', frags: [], key: null }); i++; continue; }

      // 音節代號一段
      let j = i;
      while (j < n && /[A-Za-z0-9%@;~+?<>=,\-]/.test(body[j]) && body[j] !== 'w') {
        if (j > i && /[A-Z]/.test(body[j]) && !/[A-Za-z]/.test(body[j - 1])) { const m = /^[A-Z]{2,}(?![A-Za-z])/.exec(body.slice(j)); if (m && isRep(m[0])) break; }
        j++;
      }
      if (j === i) return null;
      let run = body.slice(i, j);
      const left = body[i - 1], right = body[j];
      ctx.stand = !nd && (left === undefined || left === ' ') && (right === undefined || right === ' ');
      i = j;
      if (/^[0-9]$/.test(run) && sawHan) run = 'y' + run;         // 混合查詢裡單獨的數字＝y＋聲調
      const sy = splitGlue(run);
      sy.forEach((t, idx) => {
        const d = describeSyl(t, ctx);
        if (idx < sy.length - 1) d.pin = undefined;
        items.push({ base: d.base, frags: d.frags, key: d.key, pin: d.pin, unknown: d.unknown });
      });
    }
    return items;
  }

  // 位置清單 → 一句話（相鄰、無條件的 w 或 y 會合併成「兩個字」「三個音節」）
  function render(items) {
    const merged = [];
    items.forEach(it => {
      const last = merged[merged.length - 1];
      if (it.key && last && last.key === it.key) last.count++;
      else merged.push(Object.assign({ count: 1 }, it));
    });
    const single = merged.length === 1;
    return merged.map(it => {
      let base = it.base;
      if (it.key === 'w') base = (it.count === 1 ? '一個' : num(it.count) + '個') + '字';
      if (it.key === 'y') base = (it.count === 1 ? '一個' : num(it.count) + '個') + '音節';
      if (it.alt && !single) base = '（' + base + '）';
      if (!it.frags.length) return base;
      return single ? base + '，' + it.frags.join('，') : base + '（' + it.frags.join('，') + '）';
    }).join('加');
  }

  // 單一項目不加括號；內含「加」「，」的複合條件才加括號分組
  const par = r => /[加，]/.test(r) ? '（' + r + '）' : r;
  // 以 | 切開（整段二選一）；各段各自解說
  function renderAlt(str, ctx, nd) {
    const alts = splitTop(str, '|');
    const rs = [];
    for (const a of alts) {
      const it = scan(a.trim(), ctx, nd || alts.length > 1); if (!it) return null;
      rs.push(it.length ? render(it) : '（空）');
    }
    return rs.length === 1 ? rs[0] : rs.map(par).join('或');
  }

  // ===== 對外函式 =====
  function holoExplain(raw, opts) {
    opts = opts || {};
    const ctx = { notes: new Set(), mix: false, han: false, stand: false };
    let q = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!q) return { main: '還沒輸入查詢。', notes: ['在上面打字，或點下面的符號，這裡會用白話說明這串查詢在找什麼。'] };

    let s = false, e = false, auto = false;
    if (q[0] === '^') { s = true; q = q.slice(1); }
    if (/(^|[^\\])\$$/.test(q)) { e = true; q = q.slice(0, -1); }
    q = q.trim();
    if (!q) return { main: '還沒輸入內容（只有 ^ 或 $）。', notes: [] };
    if (opts.autoExact && !s && !e) { s = e = true; auto = true; }

    // 詞頻：w#頻、w頻100、ww#頻100-200、w+#頻
    let freq = null;
    const fm = /([w+#])頻(\d+)?(?:-(\d+))?(?![^\s#w])/.exec(q);
    if (fm) {
      let rest = q.slice(0, fm.index) + (fm[1] === '#' ? '' : fm[1]) + q.slice(fm.index + fm[0].length);
      rest = rest.replace(/#{2,}/g, '#').replace(/#(?=\s|$)/g, '').replace(/\s+/g, ' ').trim();
      if (rest && rest.indexOf('w') >= 0) {
        let lo = 0, hi = 0;
        if (fm[2]) { const x = +fm[2], y = fm[3] ? +fm[3] : null; if (y == null) { lo = 1; hi = Math.max(1, x); } else { lo = Math.max(1, Math.min(x, y)); hi = Math.max(1, x, y); } }
        freq = { lo, hi }; q = rest;
      }
    }

    const wrap = body => {
      let t = ((s && e) ? '精確查' : '查') + body;
      if (s && !e) t += '，位置在詞目開頭';
      if (e && !s) t += '，位置在詞目結尾';
      if (freq) t += freq.lo ? (freq.lo === 1 ? '，只取詞頻最高的前' + freq.hi + '名' : '，只取詞頻第' + freq.lo + '至' + freq.hi + '名') : '，依詞頻由高到低排序';
      return t;
    };
    const finish = main => {
      const notes = Array.from(ctx.notes);
      if (auto) notes.push('已自動精確比對（用了拼音／疊字範例）');
      else if (!s && !e) notes.push('沒加 ^ $：任何位置符合都算（^ 限開頭，$ 限結尾，兩個都加＝精確）');
      return { main, notes };
    };
    const orig = () => '原文：' + (s ? '^' : '') + q + (e ? '$' : '');

    const regexy = /[\[\]\(\)\{\}\\]/.test(q);
    let m;

    // 部件查字：亻+惡、惡+、+惡
    if (!regexy) {
      if ((m = new RegExp('^((?:' + HANCH + '\\+)+' + HANCH + ')$').exec(q))) return finish(wrap('由' + m[1].split('+').map(q1).join('加') + '部件組成的字'));
      if ((m = new RegExp('^(' + HANCH + ')\\+$|^\\+(' + HANCH + ')$').exec(q))) return finish(wrap('含有' + q1(m[1] || m[2]) + '這個部件的字'));
    }

    // 一般文字（沒用到任何代號或正則）
    const engaged = regexy || /[wyvV#~%@;.?+*|]/.test(q) || /(?<=[A-Za-z])0/.test(q) || /[A-Z]{2,}/.test(q) || /^[0-9](?: [0-9])+$/.test(q) || !!freq;
    if (!engaged) {
      const t = s && e ? '精確查' + q1(q) : s ? '查以' + q1(q) + '開頭的詞目' : e ? '查以' + q1(q) + '結尾的詞目' : '查含有' + q1(q) + '的詞目';
      return { main: t, notes: ['想查得更靈活：w＝任一漢字、y＝任一音節，例如 w#ty、sym（點上面符號可看說明）'] };
    }

    if (/^[0-9](?: [0-9])+$/.test(q)) q = q.replace(/[0-9]/g, 'y$&');             // 1 2 1 2 ＝ y1 y2 y1 y2

    const plain = q.replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
    ctx.han = new RegExp(HANCH).test(plain);
    ctx.mix = ctx.han || /w/.test(plain);

    if (q === 'w+' && freq) return finish(wrap('所有字詞'));

    // 沒有 w 的頂層 # ＝ 而且（天#地）；含 w 的 # 屬於 w 的條件（w#ky）
    if (splitTop(q, '#').length > 1 && q.indexOf('w') < 0) {
      const rs = splitTop(q, '#').map(a => renderAlt(a.trim(), ctx, true));
      if (rs.every(r => r !== null)) return finish(wrap('同時符合：' + rs.map(par).join('而且')));
    } else {
      const r = renderAlt(q, ctx, false);
      if (r !== null) return finish(wrap(r));
    }
    return { main: '這串查詢含有我還不會用白話解說的寫法。', notes: [orig()] };
  }

  window.holoExplain = holoExplain;
})();
