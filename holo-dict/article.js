// 「文章」分頁：貼入台語漢字文章 → 標出有近義詞／反義詞的用詞（換詞分析），或標出異用字（異用字檢查）→ 點詞選單替換、可復原；
// 也可以做「斷詞分析」：把文章斷成一個一個詞，點或滑過詞就顯示台羅與釋義（詞頻資料來自 freq.js，第一次按「斷詞分析」時才載入）。
// 兩個模式共用同一個編輯區：建議先做「異用字檢查」把用字改成正字，再做「換詞分析」。異用字資料來自 alt.js（第一次按「異用字檢查」時才載入）。
// 第一次開啟「文章」分頁時才由 script.js 的 showArticle() 載入（跟 variants.js、compare.js 一樣，sw.js 會自動快取）。
// 依賴 script.js 的全域：dictionary、escHtml、loadScript；category.js 的 myCategoryTree（有就用來排除縣市、姓氏、諺語等分類）。
(function () {
  'use strict';

  // ---- 設定 ----
  // 用字正規化：只用來「比對」，畫面上仍顯示使用者原本的字。必須是一字對一字，位置才對得起來。
  var NORM = { '臺': '台', '個': '个', '着': '著', '裏': '裡' };
  var MAXLEN = 8;                        // 斷詞時，單一詞最長看幾個字
  var SPLIT = /[、，,。；;\/\s]+/;       // 近義詞／反義詞欄位的分隔符號（資料以「、」為主）
  var HAN = /[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2ffff}]/u;

  // ---- 狀態（切換分頁後仍保留：文章、分析結果、復原紀錄）----
  var S = {
    text: '',
    analyzed: false,                     // 已分析：文章裡有加底線的詞
    toks: [],                            // [{t:原文, kind:'syn'|'ant'|'both'|null, key, v, cur}]
    undo: [],                            // [{i, prev}]
    mode: 'syn',                         // 目前分析的模式：'syn'＝換詞分析、'alt'＝異用字檢查、'seg'＝斷詞分析
    lex: null, defIdx: null,             // 斷詞用的詞庫（詞頻）與釋義索引（用到才建）
    altIdx: null,
    nav: -1,                             // 「上一個／下一個」目前停在第幾個標示的詞                        // 異用字索引（用到才建）
    opt: { single: false, extra: false, hover: true, hv: 2, ruby: true, sp: false, exp: 'ruby', indent: false, gap: false, num: false, maybe: false, def: false, cust: false, us: false, mk: '_' },   // 新增 us：停止斷詞時，詞與詞之間加 _ 標記
    // indent／gap／num：段落格式（只改顯示，不改文字內容）   // hover：滑鼠懸停在詞上就顯示選單（只有電腦版有效）
    stat: { rec: 0, syn: 0, ant: 0, both: 0 },
    index: null,
    mkPlain: null,                       // 新增：停止斷詞（用標記）當下，拿掉標記的純文字；之後文字拿掉標記仍與它相同＝只改了詞界，再斷詞時照標記的位置切
    host: null,
    popFor: -1,
    pinned: true,                        // 選單是點開的（true，要點外面才關）或懸停開的（false，滑開就關）
    hoverT: null
  };

  var normStr = function (s) { return Array.from(s, function (c) { return NORM[c] || c; }).join(''); };

  // ---- 建索引（只做一次）：詞目（去【替】、正規化）→ 近義集合、反義集合、釋義 ----
  function buildIndex() {
    if (S.index) return S.index;
    var extraSubs = [], normalSubs = [];
    if (typeof myCategoryTree !== 'undefined') {
      myCategoryTree.forEach(function (g) { g.subs.forEach(function (n) { (g.extra ? extraSubs : normalSubs).push(n); }); });
    }
    normalSubs.sort(function (a, b) { return b.length - a.length; });   // 長的先扣，避免「其他」誤吃「其他動物」
    var catCache = new Map();
    function extraOnly(cat) {            // 這筆「只屬於」辭典分類索引以外的分類（縣市、百家姓、諺語…）？
      if (catCache.has(cat)) return catCache.get(cat);
      var rest = cat;
      normalSubs.forEach(function (n) { rest = rest.split(n).join(''); });
      var hasNormal = rest.length < cat.length;
      var hasExtra = extraSubs.some(function (n) { return rest.indexOf(n) >= 0; });
      var r = !hasNormal && hasExtra;
      catCache.set(cat, r);
      return r;
    }
    var idx = new Map();
    dictionary.forEach(function (it) {
      var raw = (it['台語'] || '').replace(/【替】/g, '').trim();
      if (!raw) return;
      var key = normStr(raw);
      var v = idx.get(key);
      if (!v) { v = { raw: raw, rom: it['台羅'] || '', def: '', syn: [], ant: [], ok: false }; idx.set(key, v); }
      if (!extraOnly(it['分類'] || '')) v.ok = true;
      if (!v.def) {
        v.def = (it['釋義'] || '').split('<br>')[0].replace(/<[^>]*>/g, '').replace(/^\d+\.\s*/, '').trim();
      }
      [['近義詞', 'syn'], ['反義詞', 'ant']].forEach(function (p) {
        (it[p[0]] || '').split(SPLIT).forEach(function (w) {
          if (w && w !== raw && v[p[1]].indexOf(w) < 0) v[p[1]].push(w);
        });
      });
    });
    S.index = idx;
    return idx;
  }

  // ---- 斷詞：最長詞優先、由左到右。詞典本身就是詞庫，所以不需要另外的斷詞模型 ----
  function analyze(text) {
    var idx = buildIndex();
    var chars = Array.from(text);        // 用 code point 切，才不會把「𪜶」這類字劈成兩半
    var nch = chars.map(function (c) { return NORM[c] || c; });
    var toks = [], plain = '', i = 0, n = chars.length;
    var stat = { rec: 0, syn: 0, ant: 0, both: 0 };
    function flush() { if (plain) { toks.push({ t: plain, kind: null }); plain = ''; } }
    while (i < n) {
      var hit = null, L = 0;
      if (HAN.test(chars[i])) {
        for (L = Math.min(MAXLEN, n - i); L >= 1; L--) {
          var v = idx.get(nch.slice(i, i + L).join(''));
          if (v) { hit = v; break; }
        }
      }
      if (!hit) { plain += chars[i]; i++; continue; }
      var word = chars.slice(i, i + L).join('');
      var allowed = (L >= 2 || S.opt.single) && (hit.ok || S.opt.extra);   // 單字詞、專有名詞分類預設不標
      var kind = null;
      if (allowed) {
        stat.rec++;
        if (hit.syn.length && hit.ant.length) kind = 'both';
        else if (hit.syn.length) kind = 'syn';
        else if (hit.ant.length) kind = 'ant';
        if (kind) stat[kind]++;
      }
      if (kind) { flush(); toks.push({ t: word, kind: kind, v: hit, cur: null }); }
      else plain += word;                // 沒底線的詞併進一般文字
      i += L;
    }
    flush();
    S.toks = toks; S.undo = []; S.stat = stat; S.mode = 'syn'; S.nav = -1;
  }

  // ---- 異用字檢查 ----
  // alt.js（converter 由試算表「異用字」工作表輸出）：{ 異用字: [正字, …] }
  // 修改：改用 script.js 的共用 loadScript（刪除原本自己寫的載入程式與 altLoading）
  function loadAlt() { return loadScript('alt.js', function () { return typeof myAltChars !== 'undefined'; }); }
  // 異用字（正規化）→ { std: [正字…], maybe: 這個寫法本身也是辭典詞目（例：同、共、事、到），不一定是錯 }
  function buildAltIndex() {
    if (S.altIdx) return S.altIdx;
    var idx = buildIndex(), m = new Map();
    Object.keys(myAltChars).forEach(function (w) {
      var key = normStr(w), v = m.get(key);
      if (!v) { v = { std: [], maybe: idx.has(key) }; m.set(key, v); }
      myAltChars[w].forEach(function (s) { if (s !== w && v.std.indexOf(s) < 0) v.std.push(s); });
    });
    S.altIdx = m;
    return m;
  }
  // 斷詞：每個位置同時找「最長的正常詞目」與「最長的異用字」。
  //   正常詞目比較長 → 這一段當作正確（避免把正常長詞裡的字誤判成異用字）
  //   異用字比較長（或一樣長）→ 標示。一樣長代表這個寫法本身也是詞目，歸為「疑似」
  function analyzeAlt(text) {
    var idx = buildIndex(), alt = buildAltIndex();
    var chars = Array.from(text);
    var nch = chars.map(function (c) { return NORM[c] || c; });
    var toks = [], plain = '', i = 0, n = chars.length, stat = { alt: 0, altq: 0 };
    function flush() { if (plain) { toks.push({ t: plain, kind: null }); plain = ''; } }
    while (i < n) {
      var Lh = 0, Lv = 0, v = null;
      if (HAN.test(chars[i])) {
        for (var L = Math.min(MAXLEN, n - i); L >= 1; L--) {
          var key = nch.slice(i, i + L).join('');
          if (!Lh && idx.has(key)) Lh = L;
          if (!Lv && alt.has(key)) { Lv = L; v = alt.get(key); }
          if (Lh && Lv) break;
        }
      }
      if (!Lh && !Lv) { plain += chars[i]; i++; continue; }
      if (Lh > Lv) { plain += chars.slice(i, i + Lh).join(''); i += Lh; continue; }
      var word = chars.slice(i, i + Lv).join(''), kind = v.maybe ? 'altq' : 'alt';
      if (kind === 'altq' && !S.opt.maybe) { plain += word; i += Lv; continue; }
      stat[kind]++;
      flush(); toks.push({ t: word, kind: kind, v: v, cur: null });
      i += Lv;
    }
    flush();
    S.toks = toks; S.undo = []; S.stat = stat; S.mode = 'alt'; S.nav = -1;
  }

  // ---- 斷詞分析 ----
  // freq.js（converter 由詞目、例句算出的詞頻）：myWordFreq＝[[漢字, 台羅, 總次數], …]（只出現 1 次的省略第 3 欄，視為 1）；同字不同音是不同的列。
  // 作法：以「漢字」為單位建詞庫（各種唸法的次數加總），用「機率最大的切法」（詞頻的對數相加，動態規劃）斷詞；
  // 每個詞顯示的台羅取該漢字最常見的唸法，其他唸法在選單裡一併列出。
  var HANALL = /^[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2ffff}]+$/u;
  function loadFreq() { return loadScript('freq.js', function () { return typeof myWordFreq !== 'undefined'; }); }   // 修改：同上
  // ---- 新增：個人詞庫（自訂台羅）＋數字調轉台羅 ----
  // 存在 localStorage（KEY + 'User'）：{ 詞（正規化後）: 台羅 }。斷詞時併進詞庫，所以同一個詞下次自動標。
  function userDict() {
    if (S.user) return S.user;
    S.user = {};
    try {
      var o = JSON.parse(localStorage.getItem(KEY + 'User') || '{}');
      Object.keys(o).forEach(function (k) { if (typeof o[k] === 'string' && o[k]) S.user[k] = o[k]; });
    } catch (e) {}
    return S.user;
  }
  function saveUser() { try { localStorage.setItem(KEY + 'User', JSON.stringify(S.user || {})); } catch (e) {} }
  function romConv(v) {   // mui5 → muî；沿用 script.js 的 holoNumberToTone（數字調 → 字中調）
    v = String(v || '').normalize('NFC');
    if (!/\d/.test(v) || typeof holoNumberToTone !== 'function') return v;
    try { return holoNumberToTone(v).normalize('NFC'); } catch (e) { return v; }
  }
  function lexApplyUser(lex, key, rom) {   // 把自訂唸法放到這個詞的第一順位（沒有這個詞就新增）
    var e = lex.map.get(key);
    if (!e) { e = { reads: [], total: 0, lp: Math.log(2 / lex.N) }; lex.map.set(key, e); }
    e.reads = e.reads.filter(function (r) { return !r.user; });
    e.reads.unshift({ rom: rom, n: 0, user: true });
    lex.maxL = Math.max(lex.maxL, Math.min(12, Array.from(key).length));
    return e;
  }
  function lexRemoveUser(lex, key) {   // 拿掉自訂唸法；詞庫本來沒有的詞就整個移除（不改動原物件，復原時才接得回去）
    var e = lex.map.get(key); if (!e) return;
    var rest = e.reads.filter(function (r) { return !r.user; });
    if (rest.length) e.reads = rest; else lex.map.delete(key);
  }
  function buildLex() {
    if (S.lex) return S.lex;
    var m = new Map(), N = 0, maxL = 1;
    myWordFreq.forEach(function (r) {
      if (!HANALL.test(r[0])) return;          // 含英數字的（例：gá-suh爐）不參與漢字斷詞
      var key = normStr(r[0]), e = m.get(key);
      if (!e) { e = { reads: [], total: 0 }; m.set(key, e); }
      var n = r[2] || 1;   // 只出現 1 次的沒有第 3 欄
      e.reads.push({ rom: r[1], n: n });
      e.total += n; N += n;
      var L = Array.from(key).length; if (L > maxL) maxL = L;
    });
    m.forEach(function (e) { e.reads.sort(function (a, b) { return b.n - a.n; }); e.lp = Math.log(e.total / N); });
    S.lex = { map: m, maxL: Math.min(maxL, 12), unk: Math.log(0.5 / N), N: N };   // unk：詞庫裡完全沒有的單字；修改：多記 N，個人詞庫新增詞時算詞頻用
    var ud = userDict();   // 新增：個人詞庫（使用者自己標的台羅）併進詞庫，之後斷詞自動帶入
    Object.keys(ud).forEach(function (key) { lexApplyUser(S.lex, key, ud[key]); });
    return S.lex;
  }
  function romKey(r) {   // 與 converter 的 headKey 同一套規則：小寫、連續連字符併成一個、去頭尾的 -
    return String(r || '').normalize('NFC').replace(/【[^】]*】/g, '').toLowerCase()
      .replace(/[\s\u3000]+/g, ' ').trim().replace(/-{2,}/g, '-').replace(/(^|\s)-+/g, '$1').replace(/-+(?=\s|$)/g, '');
  }
  // 釋義索引：「漢字＋台羅」→ 釋義（含又唸作的唸法，沿用詞目的釋義）；另有「漢字」→ 釋義，沒有完全對上的唸法時備用
  function buildDefIdx() {
    if (S.defIdx) return S.defIdx;
    var byKey = new Map(), byHan = new Map();
    dictionary.forEach(function (it) {
      var raw = (it['台語'] || '').replace(/【替】/g, '').replace(/\s+/g, ''); if (!raw) return;
      var han = normStr(raw.toLowerCase());
      var defs = (it['釋義'] || '').split('<br>').map(function (x) { return x.replace(/<[^>]*>/g, '').replace(/^\d+\.\s*/, '').trim(); }).filter(Boolean);
      if (!defs.length) return;
      if (!byHan.has(han)) byHan.set(han, defs);
      function put(h, rom) { String(rom || '').split('/').forEach(function (v) { var k = h + '\t' + romKey(v); if (!byKey.has(k)) byKey.set(k, defs); }); }
      put(han, it['台羅']);
      (it['又唸作'] || '').split('<br>').forEach(function (a) {
        var m = a.match(/^(.*?)（(.*)）(?:〔[^〕]*〕)?$/);
        if (m) put(normStr(m[1].replace(/\s+/g, '').toLowerCase()), m[2]);
      });
    });
    S.defIdx = { byKey: byKey, byHan: byHan };
    return S.defIdx;
  }
  function segRun(nch, lex) {   // 一段連續漢字 → [[起, 迄], …]
    var n = nch.length, best = new Array(n + 1), bk = new Array(n + 1), i, L;
    for (i = 0; i <= n; i++) best[i] = -Infinity;
    best[0] = 0;
    for (i = 0; i < n; i++) {
      if (best[i] === -Infinity) continue;
      for (L = 1; L <= Math.min(lex.maxL, n - i); L++) {
        var e = lex.map.get(nch.slice(i, i + L).join('')), sc;
        if (e) sc = e.lp; else if (L === 1) sc = lex.unk; else continue;
        if (best[i] + sc > best[i + L]) { best[i + L] = best[i] + sc; bk[i + L] = i; }
      }
    }
    var out = [], j = n;
    while (j > 0) { out.push([bk[j], j]); j = bk[j]; }
    return out.reverse();
  }
  // ---- 新增：斷詞標記（預設 _，使用者可在設定改）----
  var MK_BAD = /[\p{L}\p{N}\p{M}\s\-，。、；：！？「」『』（）,.;:!?()\[\]]/u;   // 不能當標記：字母、數字、空白、連字號、常用標點
  function mkOk(c) { return typeof c === 'string' && Array.from(c).length === 1 && !MK_BAD.test(c); }
  function mk() { return mkOk(S.opt.mk) ? S.opt.mk : '_'; }
  function mkAdj(c, k) { return c[k] === mk() && ((k > 0 && HAN.test(c[k - 1])) || (k + 1 < c.length && HAN.test(c[k + 1]))); }   // 漢字旁的標記才算詞界
  function stripMk(str) { var c = Array.from(str), o = ''; for (var k = 0; k < c.length; k++) if (!mkAdj(c, k)) o += c[k]; return o; }   // 拿掉詞界標記
  function analyzeSeg(text) {
    var m = S.segMemo;   // 新增：文字和上次停止斷詞時完全相同 → 還原上次的斷詞結果（含手動拆分、合併、選音）；文字改過就重新斷詞
    if (m && m.text === text) { S.toks = m.toks; S.undo = []; S.stat = m.stat; S.mode = 'seg'; S.nav = -1; S.navKind = m.stat.unk ? 'unk' : 'multi'; return; }
    var lex = buildLex(), chars = Array.from(text), nch = chars.map(function (c) { return NORM[c] || c; });
    var toks = [], plain = '', i = 0, n = chars.length, stat = { seg: 0, multi: 0, unk: 0 }, par = 0;
    function flush() { if (plain) { toks.push({ t: plain, kind: null }); plain = ''; } }
    // 新增：「照標記斷」模式——文字拿掉標記後，和上次停止斷詞（用標記）時完全一樣，代表使用者只動了標記。
    // 這時每個漢字段都照標記斷：標記之間就是一個詞，不再自動斷（刪掉標記＝合併、新增標記＝拆開；整段標記都刪光，字數不超過 MAXLEN 就合成一個詞）；只有超過 MAXLEN 字又沒有標記的段落才自動斷詞
    var exact = !!S.mkPlain && stripMk(text) !== text && stripMk(text) === S.mkPlain;
    var pm = new Map();   // 上次的詞（含已改選的唸法、自訂台羅），同一個詞盡量沿用
    if (exact && S.segMemo) S.segMemo.toks.forEach(function (x) { if (segLike(x) && !pm.has(x.t)) pm.set(x.t, x); });
    function exactTok(word) {   // 一個標記之間的字 → 一個詞
      var e = lex.map.get(normStr(word)), old = pm.get(word), tok;
      if (e) { tok = { t: word, kind: 'seg', v: e, cur: null, par: 0 }; if (old && old.kind === 'seg' && old.rd && old.rd < e.reads.length) tok.rd = old.rd; return tok; }
      if (old && old.kind === 'seg' && old.v && old.v.custom) return Object.assign({}, old, { cur: null });   // 先前手動合併、自訂的詞
      if (Array.from(word).length > 1) {
        var ps = segPiece(word);
        if (ps.every(function (x) { return x.kind === 'seg'; })) return { t: word, kind: 'seg', cur: null, par: 0, v: { reads: [{ rom: ps.map(segRom).join('-'), n: 0 }], total: 0, lp: 0, custom: true } };   // 同手動合併：台羅暫用各詞的音接起來
      }
      return { t: word, kind: 'unk' };
    }
    while (i < n) {
      if (exact && HAN.test(chars[i])) {
        var k = i, has = false;
        while (k < n && (HAN.test(chars[k]) || mkAdj(chars, k))) { if (!HAN.test(chars[k])) has = true; k++; }
        if (has || k - i <= MAXLEN) {   // 修改：含標記，或沒標記但不超過 MAXLEN 字（原本就是單一個詞，或使用者把標記全刪＝合成一個詞）→ 照標記斷；超過的才自動斷詞
          flush();
          chars.slice(i, k).join('').split(mk()).forEach(function (w) { if (w) toks.push(exactTok(w)); });
          i = k; continue;
        }
      }
      if (mkAdj(chars, i)) { i++; continue; }   // 修改：原本只認 _；改用 mk()。漢字旁的標記是「強制詞界」，只用來切開詞（漢字連續段到這裡結束），斷詞後自動消掉、不會變成文字
      if (!HAN.test(chars[i])) { plain += chars[i]; i++; continue; }
      var j = i; while (j < n && HAN.test(chars[j])) j++;
      segRun(nch.slice(i, j), lex).forEach(function (sp) {
        var a = i + sp[0], b = i + sp[1], word = chars.slice(a, b).join(''), e = lex.map.get(nch.slice(a, b).join(''));
        if (!e) { flush(); toks.push({ t: word, kind: 'unk' }); stat.unk++; return; }   // 修改：未收錄的字不再是純文字，改成可點的 unk（點開可自己標台羅）
        flush(); toks.push({ t: word, kind: 'seg', v: e, cur: null, par: par++ % 2 });
        stat.seg++; if (e.reads.length > 1) stat.multi++;
      });
      i = j;
    }
    flush();
    S.toks = toks; S.undo = []; S.stat = stat; S.mode = 'seg'; S.nav = -1;
    if (exact) fixSeg();   // 新增：照標記斷時，詞不是在迴圈裡算的，統計與底線顏色在這裡重算
    S.navKind = S.stat.unk ? 'unk' : 'multi';   // 修改：預設走未收錄字；沒有未收錄字就走多音詞
  }
  function restoreCaret(off) {   // 重畫後把游標放回原本的文字位置（文字沒變，位置對得起來）
    var t = S.wrap && S.wrap.querySelector('#arText');
    if (!t || off == null || off < 0 || !t.children.length) return;
    setCaretOffset(t, off);
    var sel = window.getSelection();
    if (sel.rangeCount) { S.caret = sel.getRangeAt(0).cloneRange(); S.caretHold = Date.now() + 200; }
  }
  function reanalyze() { if (S.mode === 'alt') analyzeAlt(S.text); else if (S.mode === 'seg') analyzeSeg(S.text); else analyze(S.text); }
  // ---- 暫存（localStorage）：文章與兩個勾選，重新整理、關掉再開都還在 ----
  var KEY = (typeof myLocal !== 'undefined' ? myLocal : '') + 'article';
  var saveTimer = null;
  function loadSaved() {
    try {
      S.text = localStorage.getItem(KEY + 'Text') || '';
      var o = JSON.parse(localStorage.getItem(KEY + 'Opt') || 'null');
      if (o) { S.opt.single = !!o.single; S.opt.extra = !!o.extra; S.opt.hover = o.hv === 2 ? !!o.hover : true;   // 預設開啟（hv：舊版預設是關，不沿用舊值）
       S.opt.ruby = o.ruby !== false; S.opt.sp = !!o.sp; S.opt.exp = ['ruby', 'inline', 'han', 'space', 'rom'].indexOf(o.exp) >= 0 ? o.exp : 'ruby'; S.opt.indent = !!o.indent; S.opt.gap = !!o.gap; S.opt.num = !!o.num; S.opt.maybe = !!o.maybe; S.opt.def = !!o.def; S.opt.cust = !!o.cust; S.opt.us = !!o.us; S.opt.mk = mkOk(o.mk) ? o.mk : '_'; }
      S.mkPlain = localStorage.getItem(KEY + 'MkPlain') || null;
    } catch (e) {}
  }
  function save() {   // 打字時稍等一下再存，不要每個字都寫
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var el = S.wrap && S.wrap.querySelector('#arText');
        var t = el ? readText(el) : S.text;
        if (t) localStorage.setItem(KEY + 'Text', t); else localStorage.removeItem(KEY + 'Text');
        localStorage.setItem(KEY + 'Opt', JSON.stringify(S.opt));
        if (S.mkPlain) localStorage.setItem(KEY + 'MkPlain', S.mkPlain); else localStorage.removeItem(KEY + 'MkPlain');   // 新增
      } catch (e) {}
    }, 300);
  }

  // ---- 畫面：只有一個版面。上面工具列，下面是可直接編輯的文章；分析後在同一處加上底線 ----
  var mobile = function () { return window.matchMedia('(max-width: 768px)').matches; };

  function ic(name) { return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  // 設定選單：放在頁面右上角（跟首頁的設定鈕同位置），不在工具列裡
  function settingsHtml() {   // 修改：分析前顯示全部設定；開始分析後只留該分析用得到的（換詞、異用字的分析選項只在「下次分析」才生效，分析後就收起來）
    var an = S.analyzed, seg = an && S.mode === 'seg';
    var chk = function (id, on, label, tip) { return '<label' + (tip ? ' title="' + tip + '"' : '') + '><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + label + '</label>'; };
    return ''+
      '<span class="ar-menu-wrap">' +
        '<button type="button" class="ar-btn ar-ic' + (!an && (S.opt.single || S.opt.extra || S.opt.maybe) ? ' ar-on' : '') + '" id="arOptBtn" aria-label="設定" title="設定" aria-haspopup="true" aria-expanded="false" aria-controls="arSetMenu">' + ic('settings') + '</button>' +
        '<div class="ar-setmenu" id="arSetMenu" hidden>' +
          (an ? '' :   // 新增：只有分析前才顯示的三組（換詞分析、異用字檢查、提示）
            '<div class="ar-set-title">換詞分析</div>' +
            chk('arSingle', S.opt.single, '單字詞也標示', '單字詞容易誤判，例如「才→材」') +
            chk('arExtra', S.opt.extra, '含縣市、姓氏、諺語') +
            '<div class="ar-set-title">異用字檢查</div>' +
            chk('arMaybe', S.opt.maybe, '含疑似（本身也是正常詞）', '有些異用字本身也是正常的詞（例如「同、共、事」），預設不標；勾選後以較淡的虛線標成「疑似」') +
            '<div class="ar-set-hint">以上選項，下次分析才會套用</div>' +
            '<div class="ar-set-sep"></div>') +
          '<div class="ar-set-title">互動與顯示</div>' +
          chk('arHover', S.opt.hover, '滑鼠懸停時顯示選單', '滑鼠停在詞上就顯示選單（換詞：近義、反義詞；斷詞分析：台羅與釋義）；點一下則固定住。取消勾選則要點一下詞才顯示。手機版一律點一下') +
          (!an || seg ? chk('arRuby', S.opt.ruby, '斷詞分析：詞上方標示台羅', '斷詞分析時，在每個詞上方標示台羅（用詞頻最高的唸法）；點詞開啟選單，可改選其他唸法') : '') +   // 修改：分析前、斷詞分析中才顯示
          (!an || seg ? chk('arSp', S.opt.sp, '斷詞分析：用空格分詞（不畫底線）', '詞與詞之間留空隙、不畫底線，方便看出詞界、手動拆分或合併；只改顯示，不會改到文字。有標示台羅時詞與詞本來就有間距，關閉台羅標示後才看得出差別') : '') +   // 新增
          (!an || seg ? chk('arUs', S.opt.us, '斷詞分析：停止時用標記顯示詞界', '按「停止斷詞」後，把詞與詞之間的詞界留成標記（例：有風_無沙）。之後可自己刪掉或加上標記來合併、拆開，再按「斷詞」就照標記斷；斷詞後標記自動消掉。要做換詞分析或異用字檢查前，請先把標記刪掉') : '') +   // 修改：用詞改成「標記」，標記字元可自訂
          (!an || seg ? '<label title="斷詞用的詞界標記（一個符號，不能是文字、數字、空白或常用標點）。在兩個漢字中間打這個符號，就是強制斷開"><span>斷詞標記</span><input type="text" id="arMk" class="ar-mk-in" maxlength="2" value="' + escHtml(mk()) + '" autocomplete="off" spellcheck="false"></label>' : '') +   // 新增
          '<div class="ar-set-sep"></div>' +
          '<div class="ar-set-title">段落格式（只改顯示）</div>' +
          chk('arIndent', S.opt.indent, '段落前空兩格') +
          chk('arGap', S.opt.gap, '加大段落間距') +
          chk('arNum', S.opt.num, '顯示段落編號') +
          (an ? '' :   // 修改：拼接斷句是改文字的動作，只在分析前顯示（要用就先按「停止」）
            '<div class="ar-set-sep"></div>' +
            '<button type="button" class="ar-set-act" id="arJoin" title="文章被硬切成很多行時用：結尾不是「。！？」的換行就接起來，空白行（分段）保留">拼接斷句</button>') +
        '</div>' +
      '</span>';
  }
  // ---- 新增：導覽的目標。換詞、異用字＝所有標示的詞；斷詞＝未收錄字（預設）或多音詞（在統計選單點「多音詞」切換）----
  function navKind() { return S.mode === 'seg' ? (S.navKind === 'multi' ? 'multi' : 'unk') : S.mode; }
  function navSel() { var k = navKind(); return k === 'unk' ? '.ar-w.ar-unk' : k === 'multi' ? '.ar-w.ar-multi' : '.ar-w'; }
  function navName() { return ({ alt: '異用字', syn: '換詞', unk: '未收錄字', multi: '多音詞' })[navKind()] || '詞'; }
  function navCount() {
    var k = navKind();
    return S.toks.filter(function (x) { return k === 'unk' ? x.kind === 'unk' : k === 'multi' ? (x.kind === 'seg' && x.v && x.v.reads && x.v.reads.length > 1) : !!x.kind; }).length;
  }
  function navPosText(n) { return S.nav >= 0 && n ? Math.min(S.nav + 1, n) + '/' + n : String(n); }   // 修改：還沒開始導覽時只顯示總數（不加「處」），不顯示容易誤會的 0/N
  function navHtml() {
    if (!S.analyzed) return '';
    var n = navCount(), nm = navName(), ar = ic('chevron-right');
    return '<span class="ar-nav ar-nav-' + navKind() + '"' + (n ? '' : ' hidden') + '>' +
      '<button type="button" class="ar-btn ar-ic" id="arPrev" aria-label="上一個' + nm + '" title="上一個' + nm + '">' + ar.replace('class="icon"', 'class="icon ar-flip"') + '</button>' +
      '<span class="ar-nav-pos" id="arPos" title="' + nm + '">' + navPosText(n) + '</span>' +
      '<button type="button" class="ar-btn ar-ic" id="arNext" aria-label="下一個' + nm + '" title="下一個' + nm + '">' + ar + '</button></span>';
  }
  // ---- 新增：範例文章（在工具列右側的「範例」按鈕選用）；想增加範例，照格式再加一筆 { title: '標題', text: '全文（一行一個段落）' } ----
  var SAMPLES = [
    {
      "title": "有風無沙",
      "text": "有風無沙\n彩雲伴日落山，徛佇紅記記的橋頂，看向白茫茫的溪埔，彼敢是你為著迎接中秋專工紩的新衫？一路對西螺開到溪州的猴蔗花海，綴微風輕輕舞弄，親像台頂的舞者溫柔擛手，日暝恬靜演出嘉南的歌詩。\n毋過，寒天罕得有雨水，闊莽莽的溪埔曝佇日頭跤，你敢會喙焦喉渴？東北風若透，抑是閣有風颱來剾，絞落到地是烏天暗地的風飛沙，舞甲逐家厝內全坱埃，若毋是人講的「食飯攪沙」，就是「目睭會吐沙」。較早一半擺仔，你猶會抌石頭仔來創治，這陣干焦賰無奈吐大氣。凡勢你只是袂忍得嗽，毋是咧無歡喜。敢是阮共你討傷濟，閘了你的一切，煞袂記得留一半喙仔水予你？\n失禮！阮做伙為你蓋幾領稻草蓆，予你的身軀較袂閣受風寒；加挖幾个窟仔窮寡水，予你隨時會當小可仔止喙焦；佇焦涸涸的沙埔濺水種草，按呢敢會當共你的皺痕熨平？敢會當予你袂閣焦燥來透風沙？你的元氣有沓沓咧恢復無？有較快活淡薄無？\n這馬，就算風又閣透，嘛較無聽著你咧嗽，有時陣過冬鳥會來海口，規陣揣你破豆。沙埔的西瓜嘛準備欲閣種矣，你猶是願意鬥相共，予阮逐粒飽水閣甜甘。濁水溪啊！是你共阮晟養大漢，向望你愈來愈勇健，水流會當繼續唱歌，共坱埃攏拑牢牢，予這片土地好好仔生湠，有風無沙。"
    },
    {
      "title": "神知廟算新農業",
      "text": "神知廟算新農業\n正月十五，阿叔𤆬我去崙背水汴頭，看有百外年的跋桮民俗。暗頭仔食飯飽，人攏倚倚過來庄廟前，準備「跋米籮」。\n「叔仔，按怎會用米籮來跋？」\n「彼本來就是貯五穀的，用來請示收成好䆀，嘛誠合。」阿叔解說。\n廟方便若問一項作物，就提點著的金紙，共米籮內外踅踅淨化，才𢯾到廟後壁，大大力共幌過廟頂。米籮落佇大埕，開喙若向頂懸，就代表豐收；若徛坦橫，就普普半收；若咧塗跤崁牢牢，就是講會欠收。\n我斟酌看烏枋頂懸跋的紀錄，越頭共叔仔講：「佳哉遮有神明來鬥預測，農民才會當較穩心仔種作；抑若無像新聞進前刊的，高麗菜一下仔好價，逐家就相爭種，落尾產量傷過濟，價數落甲塗塗塗，彼就變無撚矣！」\n阿叔頕頭講：「往過總是祈求豐收就好，這馬嘛愛知影過量會敗市；而且種啥才會大趁錢，較早干焦會當靠經驗佮運氣，真歹按算。不而過，現此時無仝矣，咱有『雲林數位農業行動平台』，查會著種作面積、數量佮價數趨勢咧！」\n「敢誠實遮𠢕？」\n「無毋著！」阿叔隨捎出手機仔，「你看這產銷預警，閣有氣象警戒，是毋是𠢕甲？另外，縣府也有智慧農業補助，像自動灌溉系統、環境監測設備攏是。」\n傳統文化教咱敬天愛地，現代科技助咱巧巧仔種作。莫怪雲林農業產額，連紲幾若冬全國第一，就是按呢毋才綴會著時代，才遐爾仔進步！"
    }
  ];
  function sampleHtml() {   // 新增：工具列右側的「範例」按鈕與選單（只有還沒分析時才有）
    return '<span class="ar-menu-wrap ar-sample-wrap">' +
      '<button type="button" class="ar-btn ar-sample" id="arSampleBtn" aria-haspopup="true" aria-expanded="false" aria-controls="arSampleMenu" title="載入範例文章來試用">範例</button>' +
      '<div class="ar-setmenu ar-samplemenu" id="arSampleMenu" hidden>' +
        '<div class="ar-set-title">範例文章</div>' +
        SAMPLES.map(function (m, i) { return '<button type="button" class="ar-expact" data-sample="' + i + '">' + escHtml(m.title) + '</button>'; }).join('') +
      '</div></span>';
  }
  function barHtml() {
    var has = S.analyzed, st = S.stat;
    var stopName = ({ alt: '異用字', syn: '換詞', seg: '斷詞' })[S.mode] || '分析';   // 新增：停止鈕依目前模式命名
    return '<div class="ar-bar">' +
      (has
        ? '<button type="button" class="ar-btn ar-stop" id="arStop" title="停止' + stopName + '：拿掉底線，回到可自由編輯的文字（已替換的詞會保留）"><span class="ar-stop-long">停止' + stopName + '</span><span class="ar-stop-short">結束</span></button>' +
          navHtml() +   // 修改：導覽鈕抽成 navHtml()；斷詞模式也有（走未收錄字／多音詞）
          '<button type="button" class="ar-btn ar-ic" id="arUndo" aria-label="復原上一步" title="復原上一步"' + (S.undo.length ? '' : ' disabled') + '>' + ic('undo') + '</button>' +
          '<button type="button" class="ar-btn ar-ic" id="arCopy" aria-label="複製結果" title="' + (S.mode === 'seg' ? '複製斷詞結果（詞與詞之間用空格隔開）' : '複製結果') + '">' + ic('content-copy') + '</button>' + expMenuHtml()
        : '<div class="ar-modes">' +
          '<button type="button" class="ar-btn ar-secondary ar-go" id="arGoAlt"' + (S.text.trim() ? '' : ' disabled') + ' title="找出文章裡的異用字，建議改成正字">' + ic('spellcheck') + '<span>異用字</span></button>' +
          '<button type="button" class="ar-btn ar-secondary ar-go" id="arGo"' + (S.text.trim() ? '' : ' disabled') + ' title="找出有近義詞、反義詞的用詞">' + ic('swap-horiz') + '<span>換詞</span></button>' +
          '<button type="button" class="ar-btn ar-secondary ar-go" id="arGoSeg"' + (S.text.trim() ? '' : ' disabled') + ' title="把文章斷成一個一個詞；點或滑過詞，看台羅與釋義。想強制斷開，在兩個漢字中間打 ' + mk() + '（斷詞後自動消掉）">' + ic('view-column') + '<span>斷詞</span></button>' +
          '</div>' + sampleHtml()) +   // 修改：右側加「範例」按鈕
      (has
        ? '<span class="ar-menu-wrap ar-stat-wrap">' +
            '<button type="button" class="ar-btn ar-ic" id="arStatBtn" aria-label="標示統計" title="標示統計" aria-haspopup="true" aria-expanded="false" aria-controls="arStatMenu">' +
              '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg></button>' +
            '<div class="ar-setmenu ar-statmenu" id="arStatMenu" hidden>' +
              (S.mode === 'seg'
                ? '<div class="ar-stat-row"><span class="ar-lg ar-seg-a">詞</span><span>' + (st.seg || 0) + '</span></div>' +
                  '<button type="button" class="ar-stat-row ar-stat-go" data-nav="multi" title="逐一檢視多音詞"' + (st.multi ? '' : ' disabled') + '><span>多音詞</span><span>' + (st.multi || 0) + '</span></button>' +   // 修改：改成可點，點了開始逐一檢視
                  '<button type="button" class="ar-stat-row ar-stat-go" data-nav="unk" title="逐一檢視未收錄字"' + (st.unk ? '' : ' disabled') + '><span>未收錄字</span><span>' + (st.unk || 0) + '</span></button>'
              : S.mode === 'alt'
                ? '<div class="ar-stat-row"><span class="ar-lg ar-alt">異用字</span><span>' + (st.alt || 0) + '</span></div>' +
                  '<div class="ar-stat-row"><span class="ar-lg ar-altq">疑似</span><span>' + (st.altq || 0) + '</span></div>'
                : '<div class="ar-stat-row"><span class="ar-lg ar-syn">近義</span><span>' + st.syn + '</span></div>' +
                  '<div class="ar-stat-row"><span class="ar-lg ar-ant">反義</span><span>' + st.ant + '</span></div>' +
                  '<div class="ar-stat-row"><span class="ar-lg ar-both">近反</span><span>' + st.both + '</span></div>') +
            '</div>' +
          '</span>'
        : '') +
    '</div>';
  }

  // ---- 文字區：一行（以換行分開）就是一個段落，用 <div class="ar-p"> 包起來，段落格式（縮排、間距、編號）才有地方套 ----
  function wrapLines(lines) {
    return lines.map(function (h) { return h === '' ? '<div class="ar-p ar-empty"><br></div>' : '<div class="ar-p">' + h + '</div>'; }).join('');
  }
  function plainHtml(t) { return t ? wrapLines(String(t).split('\n').map(escHtml)) : ''; }
  function fmtClass() { return (S.opt.indent ? ' ar-f-indent' : '') + (S.opt.gap ? ' ar-f-gap' : '') + (S.opt.num ? ' ar-f-num' : ''); }

  // 斷詞的詞要標哪個音：預設是詞頻最高的（reads 已依詞頻排好）；k.rd 是使用者在選單裡改選的唸法編號
  function segRom(k) { var r = k.v.reads[k.rd || 0] || k.v.reads[0]; return r.rom; }
  function isMrg(k) { return !!(k && k.kind === 'seg' && k.v && k.v.custom); }   // 新增：手動合併（或照標記合併）出來、詞庫沒有的詞：台羅是各詞的音接起來的，還沒確認 → 紫色點線；標了自訂台羅就變成綠色點線
  function isCus(k) { var r = k && k.kind === 'seg' && k.v && k.v.reads && (k.v.reads[k.rd || 0] || k.v.reads[0]); return !!(r && r.user); }   // 新增：這個詞目前標的音是使用者自訂的（個人詞庫）→ 加綠色底線；下一篇文章只要用到這個詞也會帶入
  function spOn() { return !!(S.analyzed && S.mode === 'seg' && S.opt.sp); }   // 新增：斷詞用「空格」分詞（不畫底線）
  function rubyOn() { return !!(S.analyzed && S.mode === 'seg' && S.opt.ruby); }
  function textHtml() {
    var lines = [''];
    S.toks.forEach(function (k, i) {
      if (!k.kind) {
        escHtml(k.t).split('\n').forEach(function (part, j) { if (j > 0) lines.push(''); lines[lines.length - 1] += part; });
        return;
      }
      lines[lines.length - 1] += '<span class="ar-w ar-' + k.kind + (k.kind === 'seg' ? ' ar-seg-' + (k.par ? 'b' : 'a') + (k.v && k.v.reads && k.v.reads.length > 1 ? ' ar-multi' : '') + (isCus(k) ? ' ar-cus' : isMrg(k) ? ' ar-mrg' : '') : '') + (k.cur != null ? ' ar-rep' : '') + '" contenteditable="false" tabindex="0" role="button" aria-haspopup="true" data-i="' + i + '"' + (k.kind === 'seg' ? ' data-rom="' + escHtml(segRom(k)) + '"' : '') + '>' +
           escHtml(k.cur != null ? k.cur : k.t) + '</span>';
    });
    return lines.length === 1 && lines[0] === '' ? '' : wrapLines(lines);
  }

  function render(focus) {
    closePop(); closeMenu();
    var h = S.host; if (!h) return;
    var prev = S.wrap && S.wrap.querySelector('#arText'), top = prev ? prev.scrollTop : 0;   // 重畫後維持原本捲動的位置
    h.innerHTML = ''; S.caret = null;
    var wrap = document.createElement('div');
    wrap.className = 'ar-wrap';
    wrap.innerHTML = '<div class="ar-card">' + barHtml() +
      '<div class="ar-text' + fmtClass() + (rubyOn() ? ' ar-ruby' : '') + (spOn() ? ' ar-sp' : '') + '" id="arText" contenteditable="true" spellcheck="false" data-ph="貼上臺灣台語漢字文章">' + (S.analyzed ? textHtml() : plainHtml(S.text)) + '</div>' +
      '<div class="ar-foot"><span id="arCount"></span>' +
        '<button type="button" class="ar-btn ar-ic" id="arClear" aria-label="清除" title="清除" hidden>' + ic('delete') + '</button></div></div>' +
      '<div class="ar-pop" id="arPop" hidden></div>';
    h.appendChild(wrap);
    S.wrap = wrap;
    var tools = document.getElementById('arTopTools'); if (tools) tools.innerHTML = settingsHtml();   // 右上角的設定鈕與選單
    bind(wrap);
    wrap.querySelector('#arText').scrollTop = top;
    if (focus) wrap.querySelector('#arText').focus();
  }

  function bind(wrap) {
    var text = wrap.querySelector('#arText'), pop = wrap.querySelector('#arPop');
    var go = wrap.querySelector('#arGo'), goAlt = wrap.querySelector('#arGoAlt'), goSeg = wrap.querySelector('#arGoSeg'), stop = wrap.querySelector('#arStop');   // 未分析：只有 arGo；已分析：只有 arStop

    // 新增：底部狀態列的字數與段落數（文字區內容有變動就更新，含替換詞、貼上、分析）
    var cnt = wrap.querySelector('#arCount'), clr = wrap.querySelector('#arClear');
    function updCount() {
      if (clr) clr.hidden = !text.textContent;   // 新增：有字才顯示刪除鈕
      if (!cnt) return;
      var n = text.textContent.replace(/\s+/g, '').length;
      var ps = Array.prototype.filter.call(text.querySelectorAll('.ar-p'), function (d) { return d.textContent.trim(); }).length;
      cnt.textContent = n ? n.toLocaleString() + ' 字' + (ps > 1 ? '・' + ps + ' 段' : '') : '';
    }
    updCount();
    new MutationObserver(updCount).observe(text, { childList: true, characterData: true, subtree: true });

    // 編輯
    var composing = false;   // 輸入法組字中不整理結構，免得打斷
    text.addEventListener('compositionstart', function () { composing = true; });
    text.addEventListener('compositionend', function () { composing = false; if (needsNorm(text)) normalizeEditor(text); });
    text.addEventListener('input', function () {
      closePop();
      if (!text.textContent) text.innerHTML = '';   // 清空後不留殘餘的 <br>，提示文字才會出現
      else if (!composing && needsNorm(text)) normalizeEditor(text);   // 貼上、按 Enter 之後，把換行整理成一行一個段落
      if (!S.analyzed) { var empty = !text.textContent.trim(); go.disabled = empty; goAlt.disabled = empty; goSeg.disabled = empty; }
      save();
    });
    text.addEventListener('scroll', function () { if (!S.navLock) closePop(); });   // 「上一個／下一個」捲動時不要把剛打開的選單關掉   // 框內捲動時，詞會移位，選單先收起
    text.addEventListener('paste', function (e) {   // 一律貼成純文字
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, t);
    });
    text.addEventListener('keydown', function (e) {
      var w = e.target.closest && e.target.closest('.ar-w');
      if (w) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(w, true); }
        return;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {   // 換行一律插入換行字元，不讓瀏覽器產生 <div>
        e.preventDefault(); document.execCommand('insertText', false, '\n');
      }
    });
    text.addEventListener('click', function (e) {
      var w = e.target.closest('.ar-w'); if (w) { S.nav = Array.prototype.indexOf.call(text.querySelectorAll(navSel()), w); setCaretOnWord(w, true); updatePos(); togglePop(w, false); }
    });

    // 工具列
    if (go) go.addEventListener('click', function () {
      S.text = readText(text);
      if (!S.text.trim()) return;
      go.disabled = true;
      var off = caretOffset(text);   // 分析前的游標位置，分析後接著從這裡找上一個／下一個
      setTimeout(function () { analyze(S.text); S.analyzed = true; render(); restoreCaret(off); save(); }, 20);   // 讓按鈕先換字再做事
    });
    if (stop) stop.addEventListener('click', function () {   // 停止分析：文字照畫面現況（含已替換）留下，回到純文字編輯；再按「分析」就是重新分析
      var useMk = S.mode === 'seg' && S.analyzed && S.opt.us;
      S.text = useMk ? segUnderscoreText(text) : readText(text);   // 修改：開啟「用標記顯示詞界」時，停止斷詞後的文字帶有標記
      S.mkPlain = useMk ? stripMk(S.text) : null;   // 新增：記下「拿掉標記的純文字」，再斷詞時用來判斷是不是只動了標記
      if (S.mode === 'seg' && S.analyzed && S.toks.length) S.segMemo = { text: S.text, toks: S.toks, stat: S.stat };   // 新增：停止斷詞時記住這次的詞界、拆分、合併、選音；同一段文字再按「斷詞」就還原（只存在本次使用期間）
      S.analyzed = false; S.toks = []; S.undo = []; S.stat = { rec: 0, syn: 0, ant: 0, both: 0 };
      render(true); save();
    });
    if (goAlt) goAlt.addEventListener('click', function () {   // 異用字檢查：先載入 alt.js
      S.text = readText(text);
      if (!S.text.trim()) return;
      var old = goAlt.textContent, off = caretOffset(text);
      go.disabled = goAlt.disabled = goSeg.disabled = true; goAlt.textContent = '載入中⋯';
      loadAlt().then(function () {
        setTimeout(function () { analyzeAlt(S.text); S.analyzed = true; render(); restoreCaret(off); save(); }, 20);
      }, function (err) {
        goAlt.textContent = err.message;
        setTimeout(function () { goAlt.textContent = old; go.disabled = goAlt.disabled = goSeg.disabled = !text.textContent.trim(); }, 2000);
      });
    });
    if (goSeg) goSeg.addEventListener('click', function () {   // 斷詞分析：先載入 freq.js
      S.text = readText(text);
      if (!S.text.trim()) return;
      var old = goSeg.textContent, off = caretOffset(text);
      go.disabled = goAlt.disabled = goSeg.disabled = true; goSeg.textContent = '載入中⋯';
      loadFreq().then(function () {
        setTimeout(function () { analyzeSeg(S.text); S.analyzed = true; render(); restoreCaret(off); save(); }, 20);
      }, function (err) {
        goSeg.textContent = err.message;
        setTimeout(function () { goSeg.textContent = old; go.disabled = goAlt.disabled = goSeg.disabled = !text.textContent.trim(); }, 2000);
      });
    });
    wrap.querySelector('#arClear').addEventListener('click', function () {
      S.text = ''; S.analyzed = false; S.toks = []; S.undo = [];
      render(true); save();
    });
    var u = wrap.querySelector('#arUndo'); if (u) u.addEventListener('click', undo);
    var pv = wrap.querySelector('#arPrev'), nx = wrap.querySelector('#arNext');
    if (pv) pv.addEventListener('click', function () { gotoWord(-1); });
    if (nx) nx.addEventListener('click', function () { gotoWord(1); });
    var c = wrap.querySelector('#arCopy'); if (c) c.addEventListener('click', function (e) { copyResult(e.currentTarget); });
    var $d = function (id) { return document.getElementById(id); }, ob = $d('arOptBtn');
    ob.addEventListener('click', function () { toggleMenu('arSetMenu', 'arOptBtn'); });   // 設定選單
    var eb = wrap.querySelector('#arExpBtn');   // 匯出選單
    if (eb) {
      eb.addEventListener('click', function () { toggleMenu('arExpMenu', 'arExpBtn'); });
      var em = wrap.querySelector('#arExpMenu');
      em.addEventListener('change', function (e) { if (e.target.name === 'arExpMode') { S.opt.exp = e.target.value; save(); } });
      em.addEventListener('click', function (e) { var b = e.target.closest('[data-exp]'); if (b) expAct(b.getAttribute('data-exp'), b); });
    }
    var spb = wrap.querySelector('#arSampleBtn'), spm = wrap.querySelector('#arSampleMenu');   // 新增：範例文章
    if (spb) {
      spb.addEventListener('click', function () { toggleMenu('arSampleMenu', 'arSampleBtn'); });
      spm.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sample]'); if (!b) return;
        var m = SAMPLES[+b.getAttribute('data-sample')]; if (!m) return;
        var cur = readText(text);
        var load = function () { S.text = m.text; closeMenu(); render(true); save(); };   // 新增：載入範例的動作獨立成函式，確認後才執行
        if (cur.trim() && cur !== m.text) {   // 已經有文字時先確認，免得誤蓋掉
          closeMenu();   // 新增：先收起範例選單，免得它的 Esc／點外面事件和確認視窗互相干擾
          // 修改：原本是瀏覽器內建的 confirm()，改用 script.js 的自訂視窗 holoConfirm（回傳 Promise<boolean>）
          if (typeof holoConfirm === 'function') holoConfirm('載入範例文章', '目前的文字會被取代，要載入範例嗎？', '載入').then(function (ok) { if (ok) load(); });
          else if (confirm('目前的文字會被取代，要載入範例嗎？')) load();   // 保險：holoConfirm 不存在時退回內建視窗
        } else load();
      });
    }
    var sb = wrap.querySelector('#arStatBtn'); if (sb) sb.addEventListener('click', function () { toggleMenu('arStatMenu', 'arStatBtn'); });   // 統計小視窗
    var sm = wrap.querySelector('#arStatMenu');   // 新增：點統計裡的「多音詞」「未收錄字」，切換導覽目標並跳到第一個
    if (sm) sm.addEventListener('click', function (e) {
      var g = e.target.closest('[data-nav]'); if (!g || g.disabled) return;
      S.navKind = g.getAttribute('data-nav'); S.nav = -1; S.caret = null;
      closeMenu(); render(); gotoWord(1);
    });
    function optChanged() { ob.classList.toggle('ar-on', !S.analyzed && !!(S.opt.single || S.opt.extra || S.opt.maybe)); save(); }   // 有開啟任何選項時，按鈕右上角顯示小圓點
    var on = function (id, ev, fn) { var el = $d(id); if (el) el.addEventListener(ev, fn); };   // 新增：分析後有些設定項目不存在，綁定前先確認
    on('arSingle', 'change', function (e) { S.opt.single = e.target.checked; optChanged(); });
    on('arExtra', 'change', function (e) { S.opt.extra = e.target.checked; optChanged(); });
    [['#arIndent', 'indent', 'ar-f-indent'], ['#arGap', 'gap', 'ar-f-gap'], ['#arNum', 'num', 'ar-f-num']].forEach(function (f) {   // 段落格式：只切換 class，立即生效
      on(f[0].slice(1), 'change', function (e) { S.opt[f[1]] = e.target.checked; text.classList.toggle(f[2], e.target.checked); save(); });
    });
    on('arJoin', 'click', function (e) { applyJoin(e.currentTarget); });
    on('arMaybe', 'change', function (e) { S.opt.maybe = e.target.checked; optChanged(); });
    on('arHover', 'change', function (e) { S.opt.hover = e.target.checked; if (!S.opt.hover) closeHoverPop(); optChanged(); });
    on('arSp', 'change', function (e) { S.opt.sp = e.target.checked; text.classList.toggle('ar-sp', spOn()); save(); });   // 新增：切換用底線或空格分詞，立即生效
    on('arMk', 'change', function (e) {   // 新增：自訂斷詞標記；不合法就退回原本的
      var v = Array.from(e.target.value.trim())[0];
      if (v && mkOk(v)) { S.opt.mk = v; save(); }
      e.target.value = mk();
    });
    on('arUs', 'change', function (e) { S.opt.us = e.target.checked; save(); });   // 新增：只影響「停止斷詞」時的文字，不用重畫
    on('arRuby', 'change', function (e) { S.opt.ruby = e.target.checked; text.classList.toggle('ar-ruby', rubyOn()); save(); });

    // 懸停：滑鼠停在詞上稍等一下就開；滑開（也沒移到選單上）就關。點一下則把選單「固定」住
    text.addEventListener('pointerover', function (e) {
      if (e.pointerType !== 'mouse' || !S.opt.hover || mobile()) return;   // 各模式共用「滑鼠懸停」選項
      var w = e.target.closest && e.target.closest('.ar-w'); if (!w || w.classList.contains('ar-unk')) return;   // 修改：未收錄字要點一下才開（選單有輸入框，不適合懸停就彈出）
      clearTimeout(S.hoverT);
      if (!pop.hidden && S.pinned) return;                          // 已經是點開的，不被懸停取代
      if (!pop.hidden && S.popFor === +w.getAttribute('data-i')) return;
      S.hoverT = setTimeout(function () { openPop(w, false); S.pinned = false; }, 200);
    });
    text.addEventListener('pointerout', function (e) {
      if (e.pointerType !== 'mouse') return;
      var w = e.target.closest && e.target.closest('.ar-w');
      if (!w || (e.relatedTarget && w.contains(e.relatedTarget))) return;
      scheduleHoverClose();
    });
    pop.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') clearTimeout(S.hoverT); });
    pop.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') scheduleHoverClose(); });

    // 選單裡：點選項替換（點綠色原詞則還原）；點 × 只關閉
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) {   // 關閉鈕：只收起選單，不替換
        var w0 = text.querySelector('[data-i="' + S.popFor + '"]');
        closePop(); if (w0) w0.focus();
        return;
      }
      var i = S.popFor, k = S.toks[i]; if (!k) return;
      if (b.hasAttribute('data-def')) {   // 新增：釋義開關；重開選單才會重新量高度與位置
        S.opt.def = !S.opt.def; save();
        var wd = text.querySelector('.ar-w[data-i="' + S.popFor + '"]'); if (wd) openPop(wd, false);
        var nb = pop.querySelector('[data-def]'); if (nb) nb.focus({ preventScroll: true });
        return;
      }
      if (b.hasAttribute('data-cust-tog')) {   // 新增：自訂開關
        S.opt.cust = !S.opt.cust; save();
        var wc = text.querySelector('.ar-w[data-i="' + S.popFor + '"]'); if (wc) openPop(wc, false);
        var ci = pop.querySelector('[data-cust]') || pop.querySelector('[data-cust-tog]'); if (ci) ci.focus({ preventScroll: true });
        return;
      }
      if (b.hasAttribute('data-cust-ok')) { applyCust(); return; }   // 新增：加入自訂台羅
      if (b.hasAttribute('data-udel')) { removeCustom(i); return; }   // 新增：移除自訂唸法
      if (b.hasAttribute('data-split')) { splitSeg(i, +b.getAttribute('data-split')); return; }
      if (b.hasAttribute('data-merge')) { mergeSeg(i, +b.getAttribute('data-merge')); return; }
      if (b.hasAttribute('data-rd')) { setRd(i, +b.getAttribute('data-rd')); return; }   // 斷詞：改選這個詞要標的音（選單不關）
      if (b.hasAttribute('data-all')) replaceSame(i, b.getAttribute('data-c'));
      else if (b.hasAttribute('data-restore')) setCur(i, null);
      else setCur(i, b.getAttribute('data-c'));
      var w = text.querySelector('[data-i="' + i + '"]');
      closePop(); if (w) w.focus();
    });
    function applyCust() {   // 新增
      var inp = pop.querySelector('[data-cust]'); if (!inp) return;
      if (!inp.value.trim()) { inp.focus(); return; }
      setCustom(S.popFor, inp.value);
    }
    pop.addEventListener('input', function (e) {   // 新增：輸入數字調就即時轉成台羅，游標維持在原本的位置
      var t = e.target; if (!t.hasAttribute || !t.hasAttribute('data-cust') || e.isComposing) return;
      var v = t.value; if (!/\d/.test(v)) return;
      var fromEnd = v.length - (t.selectionStart == null ? v.length : t.selectionStart), c = romConv(v);
      if (c === v) return;
      t.value = c; var pos = Math.max(0, c.length - fromEnd); try { t.setSelectionRange(pos, pos); } catch (err) {}
    });
    pop.addEventListener('focusin', function (e) {   // 新增：點進輸入框就把選單固定住，滑鼠移開不會關掉
      if (e.target.hasAttribute && e.target.hasAttribute('data-cust')) { S.pinned = true; clearTimeout(S.hoverT); }
    });
    pop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-cust')) { e.preventDefault(); applyCust(); return; }   // 新增：輸入框按 Enter 就加入
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      var w = text.querySelector('[data-i="' + S.popFor + '"]');
      closePop(); if (w) w.focus();
    });
  }

  // ---- 替換／復原 ----
  // ---- 斷詞：手動拆分／合併 ----
  function segPiece(str) {   // 一小段漢字 → 用詞庫斷詞後的 token（詞庫沒有的字留成一般文字）
    var lex = buildLex(), chars = Array.from(str), nch = chars.map(function (c) { return NORM[c] || c; }), out = [];
    segRun(nch, lex).forEach(function (sp) {
      var word = chars.slice(sp[0], sp[1]).join(''), e = lex.map.get(nch.slice(sp[0], sp[1]).join(''));
      out.push(e ? { t: word, kind: 'seg', v: e, cur: null, par: 0 } : { t: word, kind: 'unk' });   // 修改：詞庫沒有的字 kind: null → 'unk'
    });
    return out;
  }
  function pushSnap() { S.undo.push({ snap: S.toks.map(function (k) { return Object.assign({}, k); }), stat: Object.assign({}, S.stat) }); }
  function fixSeg() {   // 拆合後：相鄰的一般文字併回一塊、底線顏色重新交替、統計重算
    var out = [], par = 0, seg = 0, multi = 0, unk = 0;
    S.toks.forEach(function (k) {
      if (!k.kind) {
        Array.from(k.t).forEach(function (c) { if (HAN.test(c)) unk++; });
        if (out.length && !out[out.length - 1].kind) { out[out.length - 1].t += k.t; return; }
      } else if (k.kind === 'unk') { unk++; }   // 新增：未收錄字也要算進統計
      else { k.par = par++ % 2; seg++; if (k.v.reads.length > 1) multi++; }
      out.push(k);
    });
    S.toks = out; S.stat.seg = seg; S.stat.multi = multi; S.stat.unk = unk;
  }
  function segLike(k) { return !!k && (k.kind === 'seg' || k.kind === 'unk'); }   // 新增：斷詞裡可拆、可合的 token（含未收錄字）
  function splitSeg(i, p) {   // p＝在第幾個字後面切開；0＝全部拆成單字
    var k = S.toks[i]; if (!segLike(k)) return;   // 修改：未收錄的多字也能拆
    var chars = Array.from(k.t), parts = p ? [chars.slice(0, p).join(''), chars.slice(p).join('')] : chars, repl = [];
    parts.forEach(function (s) { repl = repl.concat(segPiece(s)); });
    pushSnap(); S.toks.splice.apply(S.toks, [i, 1].concat(repl)); fixSeg(); render();
    save();
  }
  function mergeSeg(i, dir) {   // dir＝-1 與前一詞、1 與後一詞合併
    var a = dir < 0 ? i - 1 : i, ka = S.toks[a], kb = S.toks[a + 1];
    if (!segLike(ka) || !segLike(kb)) return;   // 修改：未收錄字也能合併
    var t = ka.t + kb.t, e = buildLex().map.get(normStr(t)), tok;
    if (e) tok = { t: t, kind: 'seg', v: e, cur: null, par: 0 };
    else if (ka.kind === 'seg' && kb.kind === 'seg') tok = { t: t, kind: 'seg', cur: null, par: 0, v: { reads: [{ rom: segRom(ka) + '-' + segRom(kb), n: 0 }], total: 0, lp: 0, custom: true } };   // 詞庫沒有：台羅暫用兩詞的音接起來
    else tok = { t: t, kind: 'unk' };   // 新增：其中有未收錄字，合成一個「待標台羅」的詞，讓使用者自己輸入
    pushSnap(); S.toks.splice(a, 2, tok); fixSeg(); render();
    save();
  }
  // 新增：自訂台羅。同一個詞全文一起套用，並記進個人詞庫；pushSnap 時一併記下詞庫的舊值，復原才還原得完整
  function snapUser(key) { pushSnap(); var u = S.undo[S.undo.length - 1], d = userDict(); u.ud = { key: key, prev: Object.prototype.hasOwnProperty.call(d, key) ? d[key] : null }; }
  function setCustom(i, raw) {
    var k = S.toks[i]; if (!segLike(k)) return;
    var rom = romConv(raw).replace(/\s+/g, ' ').trim(); if (!rom) return;
    var key = normStr(k.t), lex = buildLex(), d = userDict();
    snapUser(key);
    d[key] = rom; saveUser();
    var e = lexApplyUser(lex, key, rom);
    S.toks.forEach(function (x) { if (segLike(x) && normStr(x.t) === key) { x.kind = 'seg'; x.v = e; x.rd = null; x.cur = null; } });
    fixSeg(); render(); save();
  }
  function removeCustom(i) {
    var k = S.toks[i]; if (!segLike(k)) return;
    var key = normStr(k.t), d = userDict(), lex = buildLex(); if (!Object.prototype.hasOwnProperty.call(d, key)) return;
    snapUser(key);
    delete d[key]; saveUser(); lexRemoveUser(lex, key);
    var e = lex.map.get(key);
    S.toks.forEach(function (x) {
      if (x.kind !== 'seg' || normStr(x.t) !== key) return;
      if (e) { x.v = e; x.rd = null; } else { x.kind = 'unk'; delete x.v; delete x.rd; }   // 詞庫本來就沒有：回到「待標台羅」
    });
    fixSeg(); render(); save();
  }
  function setRd(i, n) {
    var k = S.toks[i]; if (!k || k.kind !== 'seg') return;
    k.rd = n || null;
    var w = S.wrap.querySelector('.ar-w[data-i="' + i + '"]'); if (w) { w.setAttribute('data-rom', segRom(k)); w.classList.toggle('ar-cus', isCus(k)); }   // 修改：改選唸法時，自訂音的綠色底線也跟著開關
    var pop = S.wrap.querySelector('#arPop'); S.pinned = true;
    pop.innerHTML = popHtml(i);
    var f = pop.querySelector('[data-rd="' + n + '"]'); if (f) f.focus();
  }
  function setCur(i, cand) {
    var k = S.toks[i];
    var next = (cand == null || cand === k.t) ? null : cand;
    if (next === k.cur) return;
    S.undo.push([{ i: i, prev: k.cur }]);   // 每一步是一組（「全部改正」一次會有很多個）
    k.cur = next;
    paintWord(i);
    refreshUndo();
    save();
  }
  // ---- 上一個／下一個（換詞、異用字兩種模式都有）：依文章順序逐一檢視標示的詞，並打開它的選單（到頭會繞回另一端）----
  function updatePos() {
    var el = S.wrap && S.wrap.querySelector('#arPos');
    if (el) el.textContent = navPosText(S.wrap.querySelectorAll(navSel()).length);   // 修改：只算目前導覽目標；沒開始時顯示「N 處」
  }
  // 起點是「游標位置」：下一個＝游標後面第一個標示的詞，上一個＝游標前面最後一個。
  // S.caret 記著文字區最後的游標／選取範圍（selectionchange 隨時更新）；導覽到某個詞之後，游標就算在那個詞上，下一次從那裡接著找。
  function trackCaret() {
    if (Date.now() < (S.caretHold || 0)) return;   // 剛由程式指定位置，先不要被瀏覽器的選取事件蓋掉
    var t = S.wrap && S.wrap.querySelector('#arText'), sel = window.getSelection();
    if (t && sel && sel.rangeCount && t.contains(sel.anchorNode) && t.contains(sel.focusNode)) S.caret = sel.getRangeAt(0).cloneRange();
  }
  function setCaretOnWord(w, hold) {
    var r = document.createRange(); r.selectNode(w); S.caret = r;
    if (hold) S.caretHold = Date.now() + 200;
  }
  function wordByCaret(words, step) {   // 回傳 index；-1＝沒有游標資訊；-2＝游標後（前）面已經沒有了
    var c = S.caret, n = words.length;
    if (!c || !c.startContainer.isConnected || !c.endContainer.isConnected) return -1;
    try {
      var cs = c.cloneRange(); cs.collapse(true);
      var ce = c.cloneRange(); ce.collapse(false);
      var k, r;
      if (step > 0) {
        for (k = 0; k < n; k++) { r = document.createRange(); r.setStartBefore(words[k]); r.collapse(true); if (ce.compareBoundaryPoints(Range.START_TO_START, r) <= 0) return k; }
      } else {
        for (k = n - 1; k >= 0; k--) { r = document.createRange(); r.setStartAfter(words[k]); r.collapse(true); if (cs.compareBoundaryPoints(Range.START_TO_START, r) >= 0) return k; }
      }
      return -2;
    } catch (err) { return -1; }
  }
  function gotoWord(step) {
    var words = S.wrap && S.wrap.querySelectorAll(navSel()); if (!words || !words.length) return;   // 修改：只走目前的導覽目標
    var n = words.length, idx = wordByCaret(words, step);
    if (idx < 0) idx = step > 0 ? 0 : n - 1;   // 沒有游標資訊就從頭（尾）開始；後（前）面沒有了就繞回另一端
    S.nav = idx;
    var w = words[idx];
    closePop();
    S.navLock = true; clearTimeout(S.navT);   // 捲動事件會稍後才送到，先鎖住，免得選單一開就被關掉
    w.scrollIntoView({ block: 'center', inline: 'nearest' });
    setCaretOnWord(w, false);
    updatePos();
    openPop(w, false);
    S.navT = setTimeout(function () { S.navLock = false; }, 300);
  }

  function replaceSame(i, cand) {   // 把文章裡「同一個異用字寫法」且還沒改過的，全部換成同一個正字；一次復原就能全部還原
    var base = S.toks[i], grp = [];
    S.toks.forEach(function (k, j) {
      if (k.kind === 'alt' && k.cur == null && k.t === base.t && k.v.std.indexOf(cand) >= 0) { grp.push({ i: j, prev: k.cur }); k.cur = cand; paintWord(j); }
    });
    if (!grp.length) return;
    S.undo.push(grp); refreshUndo(); save();
  }
  function undo() {
    var u = S.undo.pop(); if (!u) return;
    if (!Array.isArray(u)) {   // 斷詞的拆分／合併／自訂台羅：整份還原
      if (u.ud) {   // 新增：自訂台羅同時還原個人詞庫
        var d = userDict(), lex = buildLex(), key = u.ud.key;
        if (u.ud.prev == null) { delete d[key]; lexRemoveUser(lex, key); } else { d[key] = u.ud.prev; lexApplyUser(lex, key, u.ud.prev); }
        saveUser();
        u.snap.forEach(function (x) { var e2 = lex.map.get(key); if (x.kind === 'seg' && e2 && normStr(x.t) === key && !(x.v && x.v.custom)) x.v = e2; });   // 詞庫物件可能重建過，重新接上
      }
      S.toks = u.snap; S.stat = u.stat; closePop(); render(); save(); return;
    }
    u.forEach(function (x) { S.toks[x.i].cur = x.prev; paintWord(x.i); });
    refreshUndo();
    closePop();
    save();
  }
  function paintWord(i) {
    var k = S.toks[i], w = S.wrap && S.wrap.querySelector('.ar-w[data-i="' + i + '"]');
    if (!w) return;
    w.textContent = k.cur != null ? k.cur : k.t;
    w.classList.toggle('ar-rep', k.cur != null);
  }
  function refreshUndo() {
    var b = S.wrap && S.wrap.querySelector('#arUndo'); if (b) b.disabled = !S.undo.length;
  }

  // ---- 選單 ----
  function defOf(w) {
    var v = S.index && S.index.get(normStr(w));
    return v && v.def ? v.def.slice(0, 60) : '';
  }
  function chips(list) {
    return list.map(function (c) {
      var d = defOf(c);
      return '<button type="button" class="ar-chip" data-c="' + escHtml(c) + '"' + (d ? ' title="' + escHtml(d) + '"' : '') + '>' + escHtml(c) + '</button>';
    }).join('');
  }
  // 選單標題：原始詞做成連結，點了在新分頁用本站查詢這個詞
  function popTitle(t, tip) {
    var href = location.pathname + '?q=' + encodeURIComponent(t);
    return '<a class="ar-pop-title ar-pop-link" href="' + href + '" target="_blank" rel="noopener" title="' + (tip ? escHtml(tip) + '（' : '') + '新開分頁查詢「' + escHtml(t) + '」' + (tip ? '）' : '') + '">' + escHtml(t) + '</a>';
  }
  function popAltHtml(k) {   // 異用字的選單：原寫法＋建議的正字
    var head = k.cur != null
      ? '<button type="button" class="ar-chip ar-orig" data-restore title="還原成原寫法">' + escHtml(k.t) + '</button>'
      : popTitle(k.t);
    var h = '<div class="ar-pop-head">' + head + '<span class="ar-pop-rom">' + (k.kind === 'altq' ? '疑似異用字' : '異用字') + '</span>' +
      '<button type="button" class="ar-pop-x" data-x aria-label="關閉" title="關閉">×</button></div>';
    h += '<div class="ar-row"><span class="ar-lab ar-lab-alt" title="建議的正字">正</span><div class="ar-chips ar-chips-alt">' + chips(k.v.std) + '</div></div>';
    var same = k.kind === 'alt' ? S.toks.filter(function (x) { return x.kind === 'alt' && x.cur == null && x.t === k.t; }).length : 0;
    if (same >= 2 || (same >= 1 && k.cur != null)) {   // 同一個寫法在文章裡不只一處：多一列「全」，一次把它們都換掉
      var many = k.v.std.length > 1;   // 有多個建議正字時，按鈕要寫清楚改成哪一個
      h += '<div class="ar-allrow">' + k.v.std.map(function (c) {
        return '<button type="button" class="ar-allbtn" data-all data-c="' + escHtml(c) + '" title="把文章裡還沒改的 ' + same + ' 處「' + escHtml(k.t) + '」都改成「' + escHtml(c) + '」">全部取代' + (many ? '為「' + escHtml(c) + '」' : '') + '<small>×' + same + '</small></button>';
      }).join('') + '</div>';
    }
    return h;
  }
  function popSegHtml(k, idx0) {   // 斷詞的選單：台羅（各種唸法與詞頻）＋釋義
    var e = k.v, di = buildDefIdx(), han = normStr(k.t.toLowerCase()), many = e.reads.length > 1;
    var anyExact = e.reads.some(function (r) { return di.byKey.has(han + '\t' + r.rom); });
    function defsFor(r, idx) { return di.byKey.get(han + '\t' + r.rom) || (!anyExact && idx === 0 ? di.byHan.get(han) : null); }
    var hasDef = e.reads.slice(0, 6).some(function (r, idx) { return !!defsFor(r, idx); });   // 新增：這個詞有釋義才顯示「釋義」開關
    var h = '<div class="ar-pop-head">' + popTitle(k.t) +
      (many ? '' : '<span class="ar-pop-rom ar-sg-rom">' + escHtml(e.reads[0].rom) + '</span>') +   // 修改：多種唸法時不再顯示「N 種唸法」
      '<button type="button" class="ar-pop-def" data-cust-tog aria-pressed="' + (S.opt.cust ? 'true' : 'false') + '" title="顯示／隱藏自訂台羅輸入框">自</button>' +   // 新增：自訂開關（預設關）
      (hasDef ? '<button type="button" class="ar-pop-def" data-def aria-pressed="' + (S.opt.def ? 'true' : 'false') + '" title="顯示／隱藏釋義">義</button>' : '') +   // 修改：按鈕文字「釋義」→「義」
      '<button type="button" class="ar-pop-x" data-x aria-label="關閉" title="關閉">×</button></div>';
    var rows = '', compact = !(S.opt.def && hasDef);   // 新增：不顯示釋義時，各唸法排成同一行（放不下才自動換行）
    e.reads.slice(0, 6).forEach(function (r, idx) {
      var defs = S.opt.def ? defsFor(r, idx) : null;   // 修改：釋義預設不顯示，開關打開才顯示
      var onlyUser = !many;   // 修改：只有一個唸法時，不顯示那一列（唸法已在標題，詞頻不需要顯示）；有釋義時只留釋義
      if (onlyUser && !defs) return;
      rows += '<div class="ar-sg">' + (onlyUser ? '' : '<div class="ar-sg-top">' + (many ? '<button type="button" class="ar-sg-rom ar-sg-pick' + (idx === (k.rd || 0) ? ' ar-on' : '') + '" data-rd="' + idx + '" title="標示這個唸法">' + escHtml(r.rom) + '</button>' : '') +
        '<small class="ar-sg-n">' + (r.n ? '(' + r.n.toLocaleString() + ')' : r.user ? '自訂' : '自行合併，不在詞庫') + '</small></div>') +   // 修改：「移除」改放到下面的輸入列
        (defs
          ? defs.slice(0, 3).map(function (d, j) { return '<div class="ar-sg-def">' + (defs.length > 1 ? (j + 1) + '. ' : '') + escHtml(d.length > 90 ? d.slice(0, 90) + '⋯' : d) + '</div>'; }).join('')
          : '') +   // 修改：沒有釋義時不顯示「（沒有釋義）」
        '</div>';
    });
    h += compact && rows ? '<div class="ar-sg-flow">' + rows + '</div>' : rows;
    if (e.reads.length > 6) h += '<div class="ar-sg-more">還有 ' + (e.reads.length - 6) + ' 種唸法</div>';
    var hasUser = Object.prototype.hasOwnProperty.call(userDict(), normStr(k.t));   // 新增：已有自訂的音，輸入框一定顯示（可修改）
    return h + (S.opt.cust || hasUser ? custHtml(k) : '') + popOpsHtml(k, idx0);   // 修改：自訂輸入框要開關打開或已有自訂才顯示（未收錄字則一律顯示，見 popUnkHtml）
  }
  function custHtml(k) {   // 新增：自訂台羅的輸入框；輸入數字調（mui5）會即時轉成台羅（muî）
    var val = userDict()[normStr(k.t)] || '';   // 新增：已有自訂的音，就放進輸入框，可直接修改
    return '<div class="ar-cust">' +   // 修改：拿掉「標台羅」「自訂」標籤
      '<input type="text" class="ar-cust-in" data-cust value="' + escHtml(val) + '" enterkeyhint="done" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="例：mui5" aria-label="自訂台羅" title="可輸入數字調，會自動轉成台羅；全文相同的字一起套用，並記住，下次斷詞自動帶入">' +
      '<button type="button" class="ar-op ar-cust-ok" data-cust-ok>' + (val ? '更新' : '加入') + '</button>' +   // 修改：已有自訂時，按鈕改叫「更新」
      (val ? '<button type="button" class="ar-op ar-udel" data-udel title="移除自訂唸法（個人詞庫也會刪掉）">移除</button>' : '') + '</div>';   // 新增：移除鈕移到輸入列   // 修改：拿掉說明文字（說明改放輸入框的滑鼠提示）
  }
  function popUnkHtml(k, idx0) {   // 新增：詞庫沒有的字的選單
    return '<div class="ar-pop-head">' + popTitle(k.t) + '<span class="ar-pop-rom">未收錄</span>' +
      '<button type="button" class="ar-pop-x" data-x aria-label="關閉" title="關閉">×</button></div>' + custHtml(k) + popOpsHtml(k, idx0);
  }
  function popOpsHtml(k, idx0) {   // 拆分／合併：斷得不對時手動調整（修改：從 popSegHtml 抽出，未收錄字也用）
    var h = '';
    var chars = Array.from(k.t), prev = S.toks[idx0 - 1], next = S.toks[idx0 + 1], sp = '', mg = '';
    if (chars.length >= 2) {
      for (var p = 1; p < chars.length; p++) sp += '<button type="button" class="ar-op" data-split="' + p + '" title="在這裡切開">' + escHtml(chars.slice(0, p).join('') + '｜' + chars.slice(p).join('')) + '</button>';
      if (chars.length >= 3) sp += '<button type="button" class="ar-op" data-split="0" title="每個字各自成詞">全拆</button>';
      h += '<div class="ar-ops"><span class="ar-ops-lab">拆分</span>' + sp + '</div>';
    }
    if (segLike(prev)) mg += '<button type="button" class="ar-op" data-merge="-1" title="與前一個詞「' + escHtml(prev.t) + '」合成一個詞">' + escHtml(prev.t) + '+</button>';
    if (segLike(next)) mg += '<button type="button" class="ar-op" data-merge="1" title="與後一個詞「' + escHtml(next.t) + '」合成一個詞">+' + escHtml(next.t) + '</button>';
    if (mg) h += '<div class="ar-ops"><span class="ar-ops-lab">合併</span>' + mg + '</div>';
    return h;
  }
  function popHtml(i) {
    var k = S.toks[i], v = k.v;
    if (k.kind === 'alt' || k.kind === 'altq') return popAltHtml(k);
    if (k.kind === 'seg') return popSegHtml(k, i);
    if (k.kind === 'unk') return popUnkHtml(k, i);   // 新增
    // 已替換：原詞變成綠色按鈕，點它就還原；沒替換：原詞只是標題（釋義放在滑過的提示）
    var head = k.cur != null
      ? '<button type="button" class="ar-chip ar-orig" data-restore title="還原成原詞">' + escHtml(k.t) + '</button>'
      : popTitle(k.t, v.def ? v.def.slice(0, 60) : '');
    var h = '<div class="ar-pop-head">' + head + (v.rom ? '<span class="ar-pop-rom">' + escHtml(v.rom) + '</span>' : '') +
      '<button type="button" class="ar-pop-x" data-x aria-label="關閉" title="關閉">×</button></div>';
    if (v.syn.length) h += '<div class="ar-row"><span class="ar-lab ar-lab-syn" title="近義詞">近</span><div class="ar-chips">' + chips(v.syn) + '</div></div>';
    if (v.ant.length) h += '<div class="ar-row"><span class="ar-lab ar-lab-ant" title="反義詞（意思會相反）">反</span><div class="ar-chips ar-chips-ant">' + chips(v.ant) + '</div></div>';
    return h;
  }
  // 新增：手機版底部面板（.ar-sheet）貼著「實際看得到的畫面」底部，並限制高度不超過可視範圍的 60%。
  //   虛擬鍵盤跳出、網址列伸縮時，fixed 的 bottom:0 會落在看不到的地方（面板被鍵盤蓋住或超出畫面），所以改用 visualViewport 量實際可視範圍。
  function fitSheet() {
    var pop = document.getElementById('arPop'), vv = window.visualViewport;
    if (!vv || !pop || pop.hidden || !pop.classList.contains('ar-sheet')) return;
    pop.style.bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px';
    pop.style.maxHeight = Math.max(120, Math.floor(vv.height * 0.6)) + 'px';
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitSheet); window.visualViewport.addEventListener('scroll', fitSheet); }
  function togglePop(w, focusFirst) {
    clearTimeout(S.hoverT);
    if (!document.getElementById('arPop').hidden && S.popFor === +w.getAttribute('data-i')) {
      if (S.pinned) closePop(); else S.pinned = true;   // 懸停開的：點一下是固定住，不是關掉
    } else openPop(w, focusFirst);
  }
  function openPop(w, focusFirst) {
    var wrap = S.wrap, pop = wrap.querySelector('#arPop'), i = +w.getAttribute('data-i');
    S.popFor = i; S.pinned = true;   // 懸停開啟時，呼叫端會再改成 false
    pop.innerHTML = popHtml(i);
    pop.hidden = false;
    pop.classList.toggle('ar-sheet', mobile());
    if (mobile()) {
      pop.style.left = pop.style.top = pop.style.maxHeight = pop.style.bottom = '';
      fitSheet();   // 新增：貼齊實際可視畫面的底部
    } else {
      pop.style.bottom = '';   // 新增：從手機版切回電腦版時，清掉面板的 bottom
      var wr = wrap.getBoundingClientRect(), r = w.getBoundingClientRect();
      pop.style.maxHeight = '';
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.max(0, Math.min(r.left - wr.left, wr.width - pw));
      var box = (wrap.closest('.article-body') || document.documentElement).getBoundingClientRect();   // 選單放在這個捲動區裡，超出它的部分會被切掉（例如被上方的標題列蓋住），所以可用範圍以它為準
      var vTop = Math.max(0, box.top), vBot = Math.min(window.innerHeight, box.bottom);
      var below = vBot - r.bottom - 14, above = r.top - vTop - 14;   // 詞下方、上方各剩多少可用高度
      var top;
      if (ph <= below) top = r.bottom - wr.top + 6;                    // 下面放得下
      else if (ph <= above) top = r.top - wr.top - ph - 6;             // 下面放不下就改放上面
      else {                                                           // 兩邊都放不下：選比較大的一邊，限制高度，選單內出現捲動條
        var room = Math.max(120, Math.max(below, above));
        pop.style.maxHeight = room + 'px'; ph = Math.min(ph, room);
        top = below >= above ? r.bottom - wr.top + 6 : r.top - wr.top - ph - 6;
      }
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
    }
    document.querySelectorAll('.ar-w.ar-open').forEach(function (x) { x.classList.remove('ar-open'); });
    w.classList.add('ar-open');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escClose, true);
    if (focusFirst) { var f = pop.querySelector('button'); if (f) f.focus(); }
    else if (!mobile() && S.pinned && S.toks[i] && S.toks[i].kind === 'unk') { var ci = pop.querySelector('.ar-cust-in'); if (ci) ci.focus({ preventScroll: true }); }   // 新增：電腦版點未收錄字，直接可以打字（手機版不自動叫出鍵盤）
  }
  function outside(e) {
    var pop = document.getElementById('arPop');
    if (!pop || pop.contains(e.target) || e.target.closest('.ar-w')) return;
    closePop();
  }
  function escClose(e) { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } }   // 攔下 Esc，只關選單，不讓頁面一起關掉
  function scheduleHoverClose() {   // 滑開詞或選單後稍等一下才關，讓滑鼠有時間移進選單
    clearTimeout(S.hoverT);
    S.hoverT = setTimeout(function () { if (!S.pinned) closePop(); }, 280);
  }
  function closeHoverPop() { clearTimeout(S.hoverT); if (!S.pinned) closePop(); }
  function closePop() {
    var pop = document.getElementById('arPop');
    clearTimeout(S.hoverT);
    if (pop) pop.hidden = true;
    S.popFor = -1; S.pinned = true;
    document.querySelectorAll('.ar-w.ar-open').forEach(function (x) { x.classList.remove('ar-open'); });
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escClose, true);
  }

  // ---- 設定選單 ----
  var MENUS = [['arSetMenu', 'arOptBtn'], ['arStatMenu', 'arStatBtn'], ['arExpMenu', 'arExpBtn'], ['arSampleMenu', 'arSampleBtn']];   // 修改：加入範例選單
  function toggleMenu(mid, bid) { var m = document.getElementById(mid); if (m && !m.hidden) closeMenu(); else openMenu(mid, bid); }
  function openMenu(mid, bid) {
    var m = document.getElementById(mid), b = document.getElementById(bid); if (!m || !b) return;
    closePop(); closeMenu();
    S.menuBtn = bid;
    m.style.transform = ''; m.style.maxHeight = ''; m.hidden = false; b.setAttribute('aria-expanded', 'true');
    var rc = m.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    if (rc.right > vw - 8) m.style.transform = 'translateX(' + (vw - 8 - rc.right) + 'px)';   // 超出左右邊就挪回來，手機版才不會被切掉
    else if (rc.left < 8) m.style.transform = 'translateX(' + (8 - rc.left) + 'px)';
    m.style.maxHeight = Math.max(140, window.innerHeight - rc.top - 8) + 'px';   // 超出視窗下緣就限制高度，選單內出現捲動條
    document.addEventListener('pointerdown', menuOutside, true);
    document.addEventListener('keydown', menuEsc, true);
  }
  function menuOutside(e) { if (!e.target.closest('#arSetMenu, #arOptBtn, #arStatMenu, #arStatBtn, #arExpMenu, #arExpBtn, #arSampleMenu, #arSampleBtn')) closeMenu(); }
  function menuEsc(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); closeMenu();   // 攔下 Esc，只關選單，不讓頁面一起關掉
    var b = document.getElementById(S.menuBtn); if (b) b.focus();
  }
  function closeMenu() {
    MENUS.forEach(function (p) {
      var m = document.getElementById(p[0]), b = document.getElementById(p[1]);
      if (m) m.hidden = true;
      if (b) b.setAttribute('aria-expanded', 'false');
    });
    document.removeEventListener('pointerdown', menuOutside, true);
    document.removeEventListener('keydown', menuEsc, true);
  }

  // ---- 複製結果 ----
  // 以畫面上的文字為準：使用者可以直接改文字，加底線的詞則是替換後的樣子
  // ---- 整理文字區結構：把「文字裡的換行字元」「<br>」「游離在外的文字」整理成一行一個 div.ar-p（已分析的詞 span 原樣搬過去）----
  function needsNorm(root) {
    var kids = root.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c.nodeType !== 1 || c.tagName !== 'DIV') return true;
      var tx = c.textContent;
      if (tx.indexOf('\n') >= 0 || c.querySelector('div') || (c.classList.contains('ar-empty') !== (tx === '')) || !c.classList.contains('ar-p')) return true;
    }
    return false;
  }
  function collectLines(root) {
    var lines = [], cur = null, afterNL = false;
    function open() { if (!cur) { cur = []; lines.push(cur); } afterNL = false; return cur; }
    function brk() { if (cur) cur = null; else { open(); cur = null; } }   // 結束目前這行；沒有目前這行就是一個空行
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          c.nodeValue.split('\n').forEach(function (part, k) {
            if (k > 0) { brk(); afterNL = true; }
            if (part !== '') open().push(document.createTextNode(part));
          });
        } else if (c.nodeType === 1) {
          if (c.classList.contains('ar-w')) open().push(c);
          else if (c.tagName === 'BR') brk();
          else if (c.tagName === 'DIV') {
            cur = null; afterNL = false;
            if (!c.textContent && !c.querySelector('.ar-w')) { open(); cur = null; }   // 空行
            else { walk(c); cur = null; }
          } else walk(c);
        }
      });
    }
    walk(root);
    if (afterNL) lines.push([]);   // 文字最後面的換行：代表游標在新的一行
    return lines;
  }
  function lineLen(d) {
    var n = 0;
    Array.prototype.forEach.call(d.childNodes, function (c) { if (c.nodeType === 3 || (c.nodeType === 1 && c.classList.contains('ar-w'))) n += c.textContent.length; });
    return n;
  }
  function caretOffset(root) {   // 游標在「純文字」裡的位置（以 readText 的算法）
    var sel = window.getSelection(); if (!sel || !sel.rangeCount) return -1;
    var r = sel.getRangeAt(0); if (!root.contains(r.startContainer)) return -1;
    var sc = r.startContainer, so = r.startOffset;
    var blk = sc.nodeType === 1 ? sc : sc.parentNode;
    if (blk && blk.classList && blk.classList.contains('ar-empty')) { sc = blk; so = 0; }
    var pre = document.createRange(); pre.selectNodeContents(root); pre.setEnd(sc, so);
    var tmp = document.createElement('div'); tmp.appendChild(pre.cloneContents());
    return readText(tmp).length;
  }
  function setCaretOffset(root, off) {
    var divs = root.children, start = 0, sel = window.getSelection(), r = document.createRange();
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i], len = lineLen(d);
      if (off <= start + len || i === divs.length - 1) {
        var rel = Math.max(0, Math.min(off - start, len)), placed = false;
        Array.prototype.some.call(d.childNodes, function (n, idx) {
          if (n.nodeType === 3) { if (rel <= n.length) { r.setStart(n, rel); placed = true; return true; } rel -= n.length; }
          else if (n.nodeType === 1 && n.classList.contains('ar-w')) {
            var l = n.textContent.length;
            if (rel <= l) { r.setStart(d, rel === 0 ? idx : idx + 1); placed = true; return true; }
            rel -= l;
          }
          return false;
        });
        if (!placed) r.setStart(d, len ? d.childNodes.length : 0);
        r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
        return;
      }
      start += len + 1;
    }
  }
  function normalizeEditor(root) {
    var focused = document.activeElement === root, off = focused ? caretOffset(root) : -1, top = root.scrollTop;
    var lines = collectLines(root);
    while (root.firstChild) root.removeChild(root.firstChild);
    lines.forEach(function (ln) {
      var d = document.createElement('div');
      if (ln.length) { d.className = 'ar-p'; ln.forEach(function (n) { d.appendChild(n); }); }
      else { d.className = 'ar-p ar-empty'; d.appendChild(document.createElement('br')); }
      root.appendChild(d);
    });
    root.scrollTop = top;
    if (focused && off >= 0 && root.children.length) setCaretOffset(root, off);
  }

  // ---- 拼接斷句：一行結尾不是 。！？（後面可跟引號、括號）就接到下一行；空白行（分段）保留 ----
  var SENT_END = /[。！？!?][」』”’）)》〉】\]]*[ \t\u3000]*$/;
  var LATIN = /[A-Za-z0-9\u00C0-\u02FF\u0300-\u036F\u1E00-\u1EFF]/;
  function joinLines(text) {
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n'), res = [], buf = '', n = 0;
    function flush() { if (buf !== '') { res.push(buf); buf = ''; } }
    lines.forEach(function (line) {
      if (!line.trim()) { flush(); res.push(''); return; }
      if (buf === '') buf = line;
      else {
        var a = buf.replace(/[ \t\u3000]+$/, ''), b = line.replace(/^[ \t\u3000]+/, '');
        var hadSp = a.length !== buf.length || b.length !== line.length;
        var ca = a.slice(-1), cb = b.charAt(0);
        // 中文接中文不加空白；羅馬字相接，或斷行處原本就有空白且一邊是羅馬字，才補一個空白
        var space = (LATIN.test(ca) && LATIN.test(cb)) || (hadSp && (LATIN.test(ca) || LATIN.test(cb)));
        buf = a + (space ? ' ' : '') + b; n++;
      }
      if (SENT_END.test(buf)) flush();
    });
    flush();
    return { text: res.join('\n'), n: n };
  }
  function applyJoin(btn) {
    var el = S.wrap && S.wrap.querySelector('#arText'); if (!el) return;
    var r = joinLines(readText(el));
    if (!r.n) {   // 沒有可接的斷行：在按鈕上短暫提示，選單不關
      var old = btn.textContent; btn.textContent = '沒有需要接合的斷行';
      setTimeout(function () { btn.textContent = old; }, 1500);
      return;
    }
    S.text = r.text; S.undo = [];
    if (S.analyzed) reanalyze();   // 文字變了，已分析的底線要重算（已替換的詞已是文字的一部分）
    closeMenu(); render(true); save();
  }

  function readText(root) {   // 與整理結構用同一套算法：一行一個段落，用換行字元串起來（來回重畫也不會多出空行）
    return collectLines(root).map(function (ln) {
      return ln.map(function (n) { return n.textContent; }).join('');
    }).join('\n');
  }

  function segResultText(el) {   // 斷詞結果：詞與詞之間補一個空格（以畫面現況為準）
    return collectLines(el).map(function (ln) {
      return ln.map(function (n) { return n.nodeType === 1 && n.classList.contains('ar-seg') ? ' ' + n.textContent + ' ' : n.textContent; }).join('').replace(/ {2,}/g, ' ').trim();
    }).join('\n');
  }
  function segUnderscoreText(el) {   // 新增：停止斷詞時，相鄰的兩個詞之間補標記（以畫面現況為準，含手動拆分、合併）；連兩個未收錄字也要補，之後再斷詞才會照標記還原
    var isW = function (n) { return n.nodeType === 1 && (n.classList.contains('ar-seg') || n.classList.contains('ar-unk')); };
    return collectLines(el).map(function (ln) {
      return ln.map(function (n, i) {
        var pv = ln[i - 1];
        var us = i > 0 && isW(n) && isW(pv);
        return (us ? mk() : '') + n.textContent;
      }).join('');
    }).join('\n');
  }
  function resultText() {
    var el = S.wrap && S.wrap.querySelector('#arText');
    if (el && S.analyzed && S.mode === 'seg') return segResultText(el);
    return el ? readText(el) : S.toks.map(function (k) { return k.cur != null ? k.cur : k.t; }).join('');
  }
  function copyResult(btn) {
    var t = resultText();
    var u = btn.querySelector('use');
    var done = function () { u.setAttribute('href', '#i-check'); btn.title = '已複製'; setTimeout(function () { u.setAttribute('href', '#i-content-copy'); btn.title = '複製結果'; }, 1200); };   // 圖示暫時變成打勾
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand('copy')) done(); } catch (e) {}
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  }

  // ---- 匯出（斷詞分析）：漢字＋台羅（ruby）／漢字（音讀）／只要漢字／只要音讀；複製、列印成 PDF、下載 HTML、下載純文字 ----
  var EXP_MODES = [['ruby', '漢字＋台羅（台羅在漢字上方）'], ['inline', '漢字（音讀）'], ['han', '只要漢字'], ['space', '漢字（詞間空格）'], ['rom', '只要音讀']];
  function expMenuHtml() {
    if (S.mode !== 'seg') return '';
    return '<span class="ar-menu-wrap">' +
      '<button type="button" class="ar-btn ar-exp" id="arExpBtn" aria-haspopup="true" aria-expanded="false" aria-controls="arExpMenu" title="複製、列印成 PDF、下載成 HTML">匯出</button>' +
      '<div class="ar-setmenu ar-expmenu" id="arExpMenu" hidden>' +
        '<div class="ar-set-title">內容</div>' +
        EXP_MODES.map(function (m) { return '<label><input type="radio" name="arExpMode" value="' + m[0] + '"' + (S.opt.exp === m[0] ? ' checked' : '') + '> ' + m[1] + '</label>'; }).join('') +
        '<div class="ar-set-sep"></div>' +
        '<button type="button" class="ar-expact" data-exp="copy" title="同時放入網頁格式與純文字；貼到 Word 時，台羅會在漢字上方（若 Word 沒有顯示，改選「漢字（音讀）」）">複製</button>' +
        '<button type="button" class="ar-expact" data-exp="print" title="開啟列印視窗，目的地選「另存為 PDF」即可">列印／存成 PDF</button>' +
        '<button type="button" class="ar-expact" data-exp="html" title="下載成單一 HTML 檔，可用瀏覽器開啟或用 Word 開啟">下載 HTML</button>' +
        '<button type="button" class="ar-expact" data-exp="txt" title="下載純文字檔">下載純文字</button>' +
      '</div></span>';
  }
  function expLines() {   // S.toks → 每行一個 token 陣列（依文章裡的換行分行）
    var lines = [[]];
    S.toks.forEach(function (k) {
      if (k.kind === 'seg') { lines[lines.length - 1].push(k); return; }
      if (k.kind === 'unk') { lines[lines.length - 1].push({ t: k.t, kind: null, unk: true }); return; }   // 修改：未收錄字仍視同一般文字，但記下它是獨立的一個詞（unk: true），「詞間空格」才分得開
      k.t.split('\n').forEach(function (part, j) {
        if (j > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ t: part, kind: null });
      });
    });
    return lines;
  }
  var ROM_PUNCT = { '，': ',', '。': '.', '！': '!', '？': '?', '：': ':', '；': ';', '、': ',', '（': '(', '）': ')', '「': '“', '」': '”', '『': '‘', '』': '’' };
  function romLine(line) {   // 一行 → 台羅文章：詞與詞之間空一格，標點貼在前一個詞後面
    var out = '', need = false, run = false;   // need：下一個詞前要空格；run：前一個是詞庫沒有的一般字（連續字不空格）
    line.forEach(function (k) {
      if (k.kind) { if (need || run) out += ' '; out += segRom(k); need = true; run = false; return; }
      Array.from(k.t).forEach(function (ch) {
        if (/\s/.test(ch)) { if (run || out) need = true; run = false; return; }
        if (/[\p{P}\p{S}]/u.test(ch)) {
          var m = ROM_PUNCT[ch] || ch;
          if (m === '(' || m === '“' || m === '‘') { if (need || run) out += ' '; out += m; need = false; }
          else { out += m; need = true; }
          run = false; return;
        }
        if (!run && need) out += ' ';
        out += ch; run = true; need = false;
      });
    });
    return out;
  }
  function spLine(line) {   // 新增：一行 → 漢字文章，詞與詞之間加一個空格；標點前後不加；原文本來就有的空白照留
    var out = '', need = false, run = false;   // need：下一個單位前要空格；run：前一個是連續的一般字（英數字等，連續字不空格）
    line.forEach(function (k) {
      if (k.kind || k.unk) { if (need || run) out += ' '; out += k.t; need = true; run = false; return; }
      Array.from(k.t).forEach(function (ch) {
        if (/\s/.test(ch)) { out += ch; need = false; run = false; return; }
        if (/[\p{P}\p{S}]/u.test(ch)) { out += ch; need = false; run = false; return; }
        if (!run && need) out += ' ';
        out += ch; run = true; need = false;
      });
    });
    return out;
  }
  var ROM_FONT = 'Calibri,"Segoe UI",Arial,sans-serif';   // 新增：台羅（ruby 的 rt）預設用 Calibri；貼到 Word、列印、下載 HTML 都套用
  var COPY_FONT = '台灣楷體';   // 修改：複製時漢字與台羅共用的字型名稱（Word 的 mso- 欄位只吃單一字型名稱，不能放備用字型清單）；想換字型只改這一行
  var COPY_FONT_STACK = "'" + COPY_FONT + "',serif";   // 新增：給 CSS font-family 用，含備用字型
  var COPY_HAN_SIZE = '14pt';   // 新增：複製時漢字大小（Word 14 號字，台羅 hps19 時 \up 才會是 13）
  var COPY_ROM_SIZE = '9.5pt';   // 台羅大小（Word 注音標示 hps19＝9.5pt）
  var COPY_GAP = '\u200B\u00A0';   // 詞與詞之間的間隔（零寬空格 U+200B＋不換行空格 U+00A0）；只用在「複製」的 ruby
  function copyFontStyle(size) {   // 新增：取代舊的 copyRomStyle()；字型一律用台灣楷體，拉丁字母、東亞字、複雜文字（bidi）全部指定
    return (size ? 'font-size:' + size + ';' : '') + 'font-family:' + COPY_FONT_STACK + ';mso-ascii-font-family:' + COPY_FONT + ';mso-hansi-font-family:' + COPY_FONT + ';mso-fareast-font-family:' + COPY_FONT + ';mso-bidi-font-family:' + COPY_FONT;
  }
  function expBuild(mode, forCopy) {   // 修改：forCopy 為 true（複製）時，漢字與台羅都用 COPY_FONT（台灣楷體）
    var hs = [], ts = [];
    expLines().forEach(function (ln) {
      var h = '', t = '';
      if (mode === 'rom') { t = romLine(ln); h = escHtml(t); }
      else if (mode === 'space') { t = spLine(ln); h = escHtml(t); }   // 新增：漢字（詞間空格）
      else ln.forEach(function (k, idx) {   // 修改：多收 idx，才知道前一個是不是詞
        if (!k.kind || mode === 'han') { h += escHtml(k.t); t += k.t; return; }
        var r = segRom(k);
        if (forCopy && mode === 'ruby' && idx > 0 && ln[idx - 1].kind === 'seg') h += COPY_GAP;   // 新增：複製（貼到 Word）時，相鄰的兩個詞之間加零寬空格＋不換行空格，ruby 的間距與換行才好看
        if (mode === 'ruby' && forCopy) {   // 新增：複製（貼到 Word）專用——字型與大小寫在 <span> 裡（Word 讀 span 的樣式，不讀 rt 本身的 font-size，所以之前台羅會變成預設的 hps24）
          h += '<ruby><span style="' + copyFontStyle(COPY_HAN_SIZE) + '">' + escHtml(k.t) + '</span><rt><span style="' + copyFontStyle(COPY_ROM_SIZE) + '">' + escHtml(r) + '</span></rt></ruby>';
        } else {
          h += mode === 'ruby' ? '<ruby>' + escHtml(k.t) + '<rt style="font-family:' + ROM_FONT + '">\u00A0' + escHtml(r) + '\u00A0</rt></ruby>' : escHtml(k.t) + '（' + escHtml(r) + '）';   // 修改：forCopy 的判斷移到上面，這裡只剩列印／下載 HTML 的寫法
        }
        t += k.t + '（' + r + '）';
      });
      hs.push(h); ts.push(t);
    });
    var pTag = (forCopy && mode === 'ruby') ? '<p style="' + copyFontStyle(COPY_HAN_SIZE) + '">' : '<p>';   // 新增：複製 ruby 時，整個段落（含標點、未收錄字）也用台灣楷體
    return { frag: hs.map(function (h) { return pTag + (h || '<br>') + '</p>'; }).join(''), text: ts.join('\n') };   // 修改：<p> 改用 pTag
  }
  function expDoc(mode) {   // 完整的獨立 HTML（列印、下載用）
    var p = expBuild(mode);
    return '<!DOCTYPE html>\n<html lang="nan-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>斷詞分析</title>' +
      '<style>body{margin:2em auto;max-width:820px;padding:0 1.2em;font:20px/1.6 "Noto Sans TC","Microsoft JhengHei","PingFang TC","Noto Sans",sans-serif;color:#202124}' +
      'p{margin:0 0 1.1em;line-height:' + (mode === 'ruby' ? '2.6' : '1.9') + '}ruby{ruby-position:over;ruby-align:center}rt{font-family:' + ROM_FONT + ';font-size:.7em;line-height:1.15;color:#3c4043;letter-spacing:0}' +
      '@page{margin:16mm}@media print{body{margin:0;max-width:none;padding:0;font-size:16px}}</style></head><body>' + p.frag + '</body></html>';
  }
  function expSave(name, type, content) {
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type: type }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function expPrint(mode) {
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(expDoc(mode)); d.close();
    setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); }, 300);
    setTimeout(function () { f.remove(); }, 60000);
  }
  function expCopy(btn, mode) {
    var p = expBuild(mode, true), old = btn.textContent;   // 修改：複製時 forCopy = true
    var done = function () { btn.textContent = '已複製'; setTimeout(function () { btn.textContent = old; }, 1200); };
    var fallback = function () {   // 沒有 ClipboardItem 時：把內容放進看不見的區塊，選取後複製（同樣帶網頁格式）
      var box = document.createElement('div'); box.innerHTML = p.frag; box.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(box);
      var r = document.createRange(); r.selectNodeContents(box);
      var sel = window.getSelection(), keep = sel.rangeCount ? sel.getRangeAt(0) : null;
      sel.removeAllRanges(); sel.addRange(r);
      try { if (document.execCommand('copy')) done(); } catch (e) {}
      sel.removeAllRanges(); if (keep) sel.addRange(keep);
      box.remove();
    };
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([p.frag], { type: 'text/html' }), 'text/plain': new Blob([p.text], { type: 'text/plain' }) })]).then(done, fallback);
    } else fallback();
  }
  function expAct(act, btn) {
    var mode = S.opt.exp;
    if (act === 'copy') expCopy(btn, mode);
    else if (act === 'print') { closeMenu(); expPrint(mode); }
    else if (act === 'html') expSave('斷詞分析.html', 'text/html;charset=utf-8', expDoc(mode));
    else if (act === 'txt') expSave('斷詞分析.txt', 'text/plain;charset=utf-8', '\ufeff' + expBuild(mode).text);
  }

  // ---- 對外介面 ----
  window.HoloArticle = {
    show: function (host) { if (!S.loaded) { S.loaded = true; loadSaved(); document.addEventListener('selectionchange', trackCaret); } S.host = host; render(); },
    close: closePop
  };
})();
