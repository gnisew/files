'use strict';
/* ===== 工具 ===== */
const REV_NEED = 2;   // 錯題本：連續答對幾次才算「已複習」（答錯會歸零）
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TONES = 'ˊˇˋˆ', rTone = /[ˊˇˋˆ]+$/;
// 鍵盤聲調：z ˊ　v ˇ　s ˋ　x ˆ　f ⁺（含資料中可能出現的其他寫法）
const TONEKEY = { z: 'ˊ', v: 'ˇ', s: 'ˋ', x: 'ˆ', f: '⁺' };
const TONEALT = { 'ˊ': 'ˊ´\'', 'ˇ': 'ˇ', 'ˋ': 'ˋ`', 'ˆ': 'ˆ^', '⁺': '⁺+˖' };
const toneOf = c => Object.keys(TONEALT).find(t => TONEALT[t].includes(c)) || '';
const rnd = a => a[Math.random() * a.length | 0];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = p => (p * 100).toFixed(1) + '%';
let STORE_OK = (() => { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; } })();
const MEM = {};   // 無法使用 localStorage 時的暫存（關閉分頁就消失）
const store = {
  get(k, d) { try { return STORE_OK ? (JSON.parse(localStorage.getItem(k)) ?? d) : (MEM[k] ?? d); } catch (e) { return d; } },
  set(k, v) { if (STORE_OK) { try { localStorage.setItem(k, JSON.stringify(v)); return; } catch (e) { STORE_OK = false; } } MEM[k] = JSON.parse(JSON.stringify(v)); }
};
/* 一次性遷移（v2）：清掉舊的設定記憶，新的預設值才會生效 */
if (!store.get('hk_v3', false)) { store.set('hk_cfg', null); store.set('hk_v3', true); }
if (!store.get('hk_v2', false)) { ['hk_cfg', 'hk_inst', 'hk_cols', 'hk_dd'].forEach(k => store.set(k, null)); store.set('hk_v2', true); }
const storeWarn = () => STORE_OK ? '' : '<div class="card ng"><b>這個環境無法永久儲存紀錄</b><br>瀏覽器封鎖了儲存空間（常見於直接開啟本機檔案）。紀錄只會在這個分頁開著時保留，請在關閉前按「下載備份檔」或「複製備份碼」。若想自動保存，請改用本機網頁伺服器或放到網站空間開啟。</div>';
// 依機率加權、不重複抽樣 (Efraimidis-Spirakis)
const wsample = (items, w, n) => items.map(it => [Math.pow(Math.random(), 1 / Math.max(w(it), 1e-6)), it])
  .sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
// 字尾的 z v s x f 視為聲調鍵（ˊ ˇ ˋ ˆ ⁺）；前一個字母必須是音節可能的結尾（母音或 m n g b d），避免把聲母 z、s、f 誤轉
const toneKeys = v => v.replace(/([aeioumngbd])([zvsxf])$/i, (m, a, k) => a + TONEKEY[k.toLowerCase()]);
const norm = s => toneKeys(String(s || '').trim().replace(/\s+/g, '').replace(/[´']/g, 'ˊ').replace(/\^/g, 'ˆ').replace(/`/g, 'ˋ').replace(/[+˖]/g, '⁺')).toLowerCase();
const isOk = (q, a) => norm(a) === norm(q.ans);

/* ===== 題目建構：idx 為要考的字位置 ===== */
function mk(word, py, idx, type, meta) {
  const c = Array.from(word), t = py.trim().split(/\s+/), ok = t.length === c.length;
  if (idx < 0 || idx >= c.length) idx = 0;
  if (type === '音' && !ok) type = '形';          // 拼音無法逐字對齊時改出字形題
  const ch = c[idx], snd = ok ? t[idx] : (meta.snd || '');
  return {
    ...meta, type, word, full: py, ch, snd, ans: type === '形' ? ch : snd,
    stem: c.map((x, i) => i === idx ? (type === '形' ? '□' : '【' + x + '】') : x).join(''),
    py: type === '音' ? t.map((x, i) => i === idx ? '＿＿＿' : x).join(' ') : py
  };
}
const pickType = ts => ts === '混合' ? (Math.random() < .5 ? '形' : '音') : ts;
const finalize = (out, ord = 'r') => (ord === 'r' ? shuffle(out) : out).sort((a, b) => (a.type === '音') - (b.type === '音'));   // 先字形、後字音（依序／頻率高到低時，各類內保留原本順序）

/* ===== 已答對的題目：自動出題時優先略過 ===== */
const qk = q => q.type + '|' + q.word + '|' + q.ch;
let DONE = new Set();
const isDone = q => DONE.has(qk(q));

/* ===== 錯題本：只存「識別鍵＋狀態」，顯示／出題時再從資料庫還原 =====
   鍵 = 題型|詞|答案字（同 qk）；記錄 = { wn 錯次, wt 時間, rv 已複習, rc 連續答對 }。
   只有「從資料庫無法原樣還原」的題目，才多存 i（考第幾個字）、f/s（拼音／答案音），
   最後手段是 x（完整題目）。舊版的完整題目物件會自動轉成精簡格式。 */
const wrongRaw = () => store.get('hk_wrong', {});
const wrongQs = () => Object.entries(wrongRaw()).map(([k, r]) => hydrate(k, r));
function hydrate(key, r) {
  const st = { wn: r.wn, wt: r.wt, rv: !!r.rv, rc: r.rc, opts: null, lets: null };
  if (r.stem !== undefined) return { ...r, ...st };                        // 舊格式（完整題目）
  if (r.x) return { ...r.x, src: '錯題本', ...st };
  const a = key.split('|'), type = a[0], ch = a[a.length - 1], word = a.slice(1, -1).join('|');
  const full = r.f ?? lexIndex().WP.get(word) ?? '', idx = r.i ?? Array.from(word).indexOf(ch);
  return { ...mk(word, full, idx, type, { src: '錯題本', snd: r.s || '' }), ...st };
}
const sameQ = (a, b, keys = ['type', 'stem', 'ans', 'snd', 'full']) => keys.every(k => String(a[k] ?? '') === String(b[k] ?? ''));
function packQ(key, q, st, keys) {
  const rec = { wn: st.wn, wt: st.wt, rv: !!st.rv, rc: st.rc };
  const k = Array.from(q.stem).findIndex(x => x === '□' || x === '【'), ix = k >= 0 && k !== Array.from(q.word).indexOf(q.ch) ? { i: k } : {};
  for (const ex of [{}, ix, { ...ix, f: q.full, s: q.snd }]) { const r = { ...rec, ...ex }; if (sameQ(hydrate(key, r), q, keys)) return r; }
  return { ...rec, x: { type: q.type, word: q.word, full: q.full, ch: q.ch, snd: q.snd, ans: q.ans, stem: q.stem, py: q.py } };
}
// 把含舊格式的錯題本整份轉成精簡格式（啟動遷移、匯入備份共用）
const packAll = W => Object.fromEntries(Object.entries(W || {}).map(([k, r]) => [k, r && r.stem !== undefined ? packQ(k, r, r) : r]));
// 取 k 題：新題優先，不足才補舊題；ord 為 r 時先洗牌，否則保留 L 的順序；ex 為要排除的題目
const take = (L, k, ord = 'r', ex) => { if (ex) L = L.filter(q => !ex.has(qk(q))); const o = ord === 'r' ? shuffle : x => x; return [...o(L.filter(q => !isDone(q))), ...o(L.filter(isDone))].slice(0, k); };

/* ===== 自動產生 115 預測題：高頻 / 換字 / 新詞 / 錯題 ===== */
function genPredict(n, [a, b, c, d], ts, ord = 'r') {
  const tot = a + b + c + d || 1, nA = Math.round(n * a / tot), nB = Math.round(n * b / tot), nW0 = Math.round(n * d / tot);
  // 錯題（只取「未複習」的）：不足的部分讓給新詞候補
  const wl = wrongQs().filter(q => !q.rv && (ts === '混合' || q.type === ts));
  const W = (ord === 'r' ? shuffle(wl) : ord === 'f' ? wl.slice().sort((x, y) => (y.wn || 1) - (x.wn || 1)) : wl).slice(0, nW0).map(q => ({ ...q, opts: null, lets: null, src: '錯題本' }));
  const ex = new Set(W.map(qk)), nC = Math.max(0, n - nA - nB - W.length), used = new Set();
  // 候選：隨機＝依機率加權抽樣；依序＝依排名；頻率高到低＝依機率
  const pick = (L, p, k) => ord === 'r' ? wsample(L, r => r[p], k * 3) : L.slice().sort(ord === 's' ? (x, y) => x[0] - y[0] : (x, y) => y[p] - x[p]);
  const A = take(pick(DB.pw, 4, nA).map(r =>
    mk(r[1], r[2], Array.from(r[1]).indexOf(r[3]), pickType(ts), { src: '預測高頻', prob: r[4], years: r[6] })), nA, ord, ex);
  A.forEach(q => used.add(q.word));
  const B = take(pick(DB.pw.filter(r => !used.has(r[1]) && Array.from(r[1]).length > 1), 4, nB).map(r => {
    const L = Array.from(r[1]), o = L.indexOf(r[3]);
    return mk(r[1], r[2], rnd(L.map((_, i) => i).filter(i => i !== o)), pickType(ts), { src: '換字變化', prob: r[4], years: r[6] }); }), nB, ord, ex);
  const C = take(pick(DB.nw, 5, nC).map(r =>
    mk(r[1], r[2], Array.from(r[1]).indexOf(r[3]), pickType(ts), { src: '詞庫新詞候補', prob: r[5], years: '未考過', snd: r[4] })), nC, ord, ex);
  const out = [...A, ...B, ...C, ...W];
  if (ord !== 'r') out.sort((x, y) => (y.prob || 0) - (x.prob || 0));
  return finalize(out, ord);
}
// 歷屆：dd＝略過重複（同一個詞、同一個答案字只留最近一年）；頻率＝考過次數
function genHist(y, n, ts, ord = 'r', dd = true) {
  let pool = DB.hist.filter(r => y === '全部' || r[0] == y);
  if (dd) { const seen = new Set(); pool = pool.slice().sort((p, q) => q[0] - p[0] || p[1] - q[1]).filter(r => { const k = r[3] + '|' + r[5]; if (seen.has(k)) return false; seen.add(k); return true; }); }
  pool = ord === 'r' ? shuffle(pool).slice(0, n * 3)
    : ord === 'f' ? pool.slice().sort((p, q) => fq(q) - fq(p) || q[0] - p[0] || p[1] - q[1])
    : pool.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return finalize(take(pool.map(r => {
    const c = Array.from(r[3]); let i = r[2] - 1; if (c[i] !== r[5]) i = c.indexOf(r[5]);
    return mk(r[3], r[4], i, pickType(ts), { src: r[0] + ' 年歷屆', years: String(r[0]), snd: r[6] }); }), n, ord), ord);
}
function genSim(k, n, ts, ord = 'r') {
  let L = DB.sim[k].filter(r => ts === '混合' || r[1] === ts);
  L = ord === 'r' ? shuffle(L) : ord === 'f' ? L.slice().sort((x, y) => (y[8] || 0) - (x[8] || 0)) : L;
  return finalize(L.slice(0, n).map(r => ({ type: r[1], stem: r[2], py: r[3], ans: r[1] === '形' ? r[4] : r[5], ch: r[4], snd: r[5],
    word: r[9], full: r[10], src: r[6], years: r[7], prob: r[8] })), ord);
}
// 錯題本：依序＝加入的先後；頻率高到低＝錯的次數多 → 少
const genWrong = (n, ts, rv, ord = 'r') => {
  const L = wrongQs().filter(q => !!q.rv === rv && (ts === '混合' || q.type === ts));
  return (ord === 'r' ? shuffle(L) : ord === 'f' ? L.sort((x, y) => (y.wn || 1) - (x.wn || 1)) : L).slice(0, n).map(q => ({ ...q, opts: null, lets: null }));
};

/* ===== 選擇題選項：字形用同音字、字音用其他聲調 ===== */
let HX;
function hx() {
  if (HX) return HX;
  const ex = new Map(), bs = new Map(), all = new Set(), put = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
  const add = (c, s) => { if (!s || c.length > 2 || /[\uE000-\uF8FF\u{F0000}-\u{10FFFF}]/u.test(c)) return; put(ex, s, c); put(bs, s.replace(rTone, ''), c); all.add(c); };
  DB.hist.forEach(r => add(r[5], r[6]));
  DB.lex.forEach(([w, p]) => { const c = Array.from(w), t = p.split(/\s+/); if (c.length === t.length) c.forEach((x, i) => add(x, t[i])); });
  // 確實存在的音節（含聲調／不含聲調）：供誘答選項判斷「這個音聽起來像不像真的」
  const syl = new Set(), tok = t => { if (/^[a-z]+[ˊˇˋˆ]?$/.test(t)) syl.add(t); };
  DB.hist.forEach(r => { String(r[4]).split(/\s+/).forEach(tok); tok(String(r[6]).trim()); });
  DB.lex.forEach(([, p]) => p.split(/\s+/).forEach(tok));
  [...DB.pw.map(r => r[2]), ...DB.nw.map(r => r[2]), ...DB.nw.map(r => r[4]), ...DB.bz.map(r => r[3])].forEach(p => String(p).split(/\s+/).forEach(tok));
  return HX = { ex, bs, all: [...all], syl, sb: new Set([...syl].map(x => x.replace(rTone, ''))) };
}

/* ===== 字音題的誘答：客語常見的易混淆音（海陸腔拼音）=====
   聲母：送氣／不送氣（b‑p、d‑t、g‑k、z‑c、zh‑ch）、舌尖／捲舌（z‑zh、c‑ch、s‑sh）、n‑l、ng‑n、ng‑零聲母、f‑h、bb‑零聲母…
   韻母：韻尾鼻音（m／n／ng）、塞音（b／d／g）、主要元音相近（i‑e、u‑o、o‑oo、e‑ee、ai‑oi、au‑eu、iu‑eu…）
   只保留「資料庫裡真的出現過的音節」，避免出現不存在的怪音。 */
const ONSETS = ['zh', 'ch', 'sh', 'rh', 'bb', 'ng', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's'];   // 長的先比對
const OPAIR = [['b', 'p'], ['d', 't'], ['g', 'k'], ['z', 'c'], ['zh', 'ch'], ['z', 'zh'], ['c', 'ch'], ['s', 'sh'], ['s', 'c'], ['n', 'l'], ['ng', 'n'], ['ng', ''], ['f', 'h'], ['bb', ''], ['bb', 'b'], ['rh', '']];
const NPAIR = [['i', 'e'], ['u', 'o'], ['o', 'oo'], ['e', 'ee'], ['ia', 'ie'], ['io', 'ioo'], ['iu', 'eu'], ['ai', 'oi'], ['au', 'eu'], ['ui', 'oi']];
const CODAS = [['m', 'n', 'ng'], ['b', 'd', 'g']];
const swaps = (x, P) => P.flatMap(([a, b]) => x === a ? [b] : x === b ? [a] : []);
// 回傳 [{ s: 誘答音節, k: 'o' 聲母／'r' 韻母, strong: 此聲調真的存在 }]
function confusable(snd, H) {
  const base = snd.replace(rTone, ''), tn = snd.slice(base.length);
  const on = ONSETS.find(o => base.startsWith(o)) ?? '', rime = base.slice(on.length), m = rime.match(/(ng|nn|m|n|b|d|g)$/), coda = m ? m[1] : '', nuc = rime.slice(0, rime.length - coda.length);
  if (!nuc) return [];
  const c = [];
  swaps(on, OPAIR).forEach(o => c.push([o + rime, 'o']));
  swaps(nuc, NPAIR).forEach(n => c.push([on + n + coda, 'r']));
  CODAS.forEach(g => { if (g.includes(coda)) g.filter(x => x !== coda).forEach(x => c.push([on + nuc + x, 'r'])); });
  const seen = new Set();
  return c.filter(([b]) => b !== base && H.sb.has(b) && !seen.has(b) && seen.add(b)).map(([b, k]) => ({ s: b + tn, k, strong: H.syl.has(b + tn) }));
}
// 字音題的 3 個誘答：聲母、韻母各一個易混淆音（同聲調），再補聲調不同的音
function soundOptions(q, H) {
  const base = q.snd.replace(rTone, ''), v = ['', ...TONES].map(t => base + t).filter(s => s !== q.snd), stop = /[bdg]$/.test(base);
  const tv = [...shuffle(v.filter(s => H.syl.has(s))), ...(stop ? [] : shuffle(v.filter(s => !H.syl.has(s))))];   // 入聲字不會有不存在的聲調
  const cf = confusable(q.snd, H), all = [...shuffle(cf.filter(x => x.strong)), ...shuffle(cf.filter(x => !x.strong))], d = [];
  const add = x => { if (x && d.length < 3 && !d.includes(x)) d.push(x); };
  add(all.find(x => x.k === 'o')?.s); add(all.find(x => x.k === 'r')?.s);   // 聲母、韻母各一
  all.forEach(x => d.length < 2 && add(x.s));
  tv.forEach(add); all.forEach(x => add(x.s)); v.forEach(add);
  return d;
}
function options(q) {
  if (q.opts) return q.opts;
  const H = hx(); let d;
  if (q.type === '形') {
    const e = [...(H.ex.get(q.snd) || [])].filter(x => x !== q.ch);
    const b = [...(H.bs.get(q.snd.replace(rTone, '')) || [])].filter(x => x !== q.ch && !e.includes(x));
    d = [...shuffle(e), ...shuffle(b)].slice(0, 3);
    while (d.length < 3) { const x = rnd(H.all); if (x !== q.ch && !d.includes(x)) d.push(x); }
  } else {
    if (/^[a-z]+[ˊˇˋˆ]?$/.test(q.snd)) d = soundOptions(q, H);
    else {   // 拼音含「/」等特殊寫法時，退回只換聲調
      const base = q.snd.replace(rTone, ''), v = ['', ...TONES].map(t => base + t).filter(s => s !== q.snd);
      const known = v.filter(s => H.ex.has(s)), rest = v.filter(s => !H.ex.has(s));
      d = [...shuffle(known), ...shuffle(rest)].slice(0, 3);
    }
  }
  return q.opts = shuffle([q.ans, ...d]);
}

/* ===== 分頁 ===== */
const views = { quiz: viewSetup, pred: viewPred, db: viewDb, log: viewLog };
document.addEventListener('click', e => {
  const t = e.target.closest('#tabs button'); if (!t) return;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === t));
  Object.keys(views).forEach(k => $('#' + k).hidden = k !== t.dataset.tab);
  if (t.dataset.tab !== 'quiz') views[t.dataset.tab]();
  else if (!Q) viewSetup();
  window.scrollTo(0, 0);   // 切換分頁後回到頁面最上方
});

/* ===== 測驗：設定 ===== */
let Q = null;
function viewSetup() {
  Q = null;
  const yrs = [...new Set(DB.hist.map(r => r[0]))].sort((a, b) => b - a), WV = Object.values(store.get('hk_wrong', {})), wn1 = WV.filter(q => q.rv).length, wn0 = WV.length - wn1;
  const RS = store.get('hk_resume', null), RN = resumeLen(RS), rsH = RN ? `<div class="card"><b>有一份未完成的測驗</b>　<span class="muted">${esc(modeName(RS.cfg))}・第 ${RS.i + 1} / ${RN} 題・已作答 ${RS.ans.filter(Boolean).length} 題・用時 ${fmt(RS.sec || 0)}</span>
    <div class="row actions"><button class="btn" id="rs">繼續測驗</button><button class="btn ghost" id="rd">放棄</button></div></div>` : '';
  $('#quiz').innerHTML = storeWarn() + rsH + `<div class="card" id="setcard"><div class="set-h"><h2>開始測驗</h2><button class="link" id="rst" type="button">恢復預設</button></div>
    <div class="row">
    <label>題目來源<select id="mode"><option value="p">115 年預測題（自動產生）</option><option value="s1">預製模擬卷 1</option>
      <option value="s2">預製模擬卷 2</option><option value="s3">預製模擬卷 3</option><option value="h">歷屆試題（96–114）</option>
      <option value="w">錯題本（未複習正確）${wn0} 題</option><option value="r">錯題本（已複習正確）${wn1} 題</option></select></label>
    <label class="m-h" hidden>年度<select id="yr"><option>全部</option>${yrs.map(y => `<option>${y}</option>`).join('')}</select></label>
    <label>題數<select id="n">${[10, 20, 30, 40, 50, 100].map(v => `<option value="${v}">${v}</option>`).join('')}</select></label>
    <label>題型<select id="ts"><option>混合</option><option value="形">只考字形</option><option value="音">只考字音</option></select></label>
    <label>出題順序<select id="ord"><option value="r">隨機</option><option value="s">依序</option><option value="f">頻率高到低</option></select></label>
    <label>作答方式<select id="am"><option value="c">選取項目</option><option value="l">拼字組合（字音題；字形題用選取）</option><option value="t">手動輸入</option></select></label>
    <label class="m-ph ck"><input type="checkbox" id="skip" checked style="width:20px;height:20px">略過已答對的題目（累計 ${Object.keys(store.get('hk_done', {})).length} 題）</label>
    <label class="ck"><input type="checkbox" id="inst" ${store.get('hk_inst', true) ? 'checked' : ''} style="width:20px;height:20px">立即顯示答案</label>
    <label class="m-h ck"><input type="checkbox" id="dup" checked style="width:20px;height:20px">略過重複的題目</label></div>
    <div class="row m-p" style="margin-top:10px"><label>預測高頻 %<input type="number" id="ma" value="35"></label>
    <label>換字變化 %<input type="number" id="mb" value="15"></label><label>新詞候補 %<input type="number" id="mc" value="40"></label><label>錯題 %<input type="number" id="md" value="10"></label></div>
    <p class="muted m-p" style="margin:6px 0 0">錯題取自「未複習」的錯題本；題數不足時，不足的部分會補給新詞候補。</p>
    <div class="actions"><button class="btn go" id="go">開始作答</button></div></div>`;
  const sync = () => { const v = $('#mode').value; document.querySelectorAll('.m-p').forEach(x => x.hidden = v !== 'p'); document.querySelectorAll('.m-ph').forEach(x => x.hidden = !'ph'.includes(v)); document.querySelectorAll('.m-h').forEach(x => x.hidden = v !== 'h'); };
  /* 記住上次的設定；「恢復預設」清掉記憶並還原 */
  const CFG0 = { mode: 'h', yr: '全部', n: 50, ts: '混合', am: 'c', ord: 'f', ma: 35, mb: 15, mc: 40, md: 10, skip: true, inst: true, dup: true };
  const FIELDS = ['mode', 'yr', 'n', 'ts', 'ord', 'am', 'ma', 'mb', 'mc', 'md'];
  const applyCfg = c => {
    FIELDS.forEach(k => { const el = $('#' + k); if (!el || c[k] === undefined) return; el.value = c[k]; if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = k === 'n' ? [...el.options].findIndex(o => o.value === '50') : 0; });
    $('#skip').checked = !!c.skip; $('#inst').checked = !!c.inst; $('#dup').checked = c.dup !== false; sync();
  };
  const readCfg = () => ({ ...Object.fromEntries(FIELDS.map(k => [k, $('#' + k).value])), skip: $('#skip').checked, inst: $('#inst').checked, dup: $('#dup').checked });
  const card = $('#setcard');
  if ($('#rs')) { $('#rs').onclick = resumeQuiz; $('#rd').onclick = async () => { if (await askDlg('確定放棄這份未完成的測驗？', '放棄', '取消')) { clearResume(); viewSetup(); } }; }
  applyCfg({ ...CFG0, inst: store.get('hk_inst', true), ...store.get('hk_cfg', {}) });
  const save = () => store.set('hk_cfg', readCfg());
  card.addEventListener('change', save); card.addEventListener('input', save);
  $('#rst').onclick = () => { store.set('hk_cfg', {}); store.set('hk_inst', true); applyCfg(CFG0); };
  $('#mode').addEventListener('change', sync); sync();
  $('#go').onclick = async () => {
    if (resumeLen(store.get('hk_resume', null)) && !(await askDlg('已有一份未完成的測驗，開始新測驗會取代它。確定嗎？', '開始新測驗', '取消'))) return;
    startQuiz({ mode: $('#mode').value, yr: $('#yr').value, n: +$('#n').value || 50, ts: $('#ts').value, ord: $('#ord').value, dup: $('#dup').checked, am: $('#am').value, instant: store.set('hk_inst', $('#inst').checked) ?? $('#inst').checked, skip: $('#skip').checked && 'ph'.includes($('#mode').value),
    mix: [+$('#ma').value || 0, +$('#mb').value || 0, +$('#mc').value || 0, +$('#md').value || 0] }); };
}
function startQuiz(cfg) {
  const { mode, n, ts } = cfg;
  DONE = cfg.skip ? new Set(Object.keys(store.get('hk_done', {}))) : new Set();
  const qs = mode === 'p' ? genPredict(n, cfg.mix, ts, cfg.ord) : mode === 'h' ? genHist(cfg.yr, n, ts, cfg.ord, cfg.dup) : mode === 'w' ? genWrong(n, ts, false, cfg.ord) : mode === 'r' ? genWrong(n, ts, true, cfg.ord) : genSim(mode[1], n, ts, cfg.ord);
  if (!qs.length) return void askDlg('沒有符合條件的題目（所選分類的錯題本可能是空的）。', '知道了', null);
  Q = { flag: new Set(), fprev: {}, chk: qs.map(() => false), lt: qs.map(() => []), rep: cfg.skip ? qs.filter(isDone).length : 0, cfg, qs, ans: Array(qs.length).fill(''), i: 0, t0: Date.now(), done: false };
  Q.tm = setInterval(() => { const c = $('#clk'); if (c) c.textContent = '⏱ ' + fmt((Date.now() - Q.t0) / 1000); }, 1000);
  viewQ();
}
const fmt = s => (s / 60 | 0) + ':' + String(s % 60 | 0).padStart(2, '0');

/* ===== 測驗：作答 ===== */
/* 字形題的拼音：把要考的那個音節框起來，例如 ten 「tooˆ」；對不齊時原樣顯示 */
const pyBr = q => { const t = String(q.full || q.py || '').trim().split(/\s+/), c = Array.from(q.stem), k = c.findIndex(x => x === '□' || x === '【');
  return k >= 0 && t.length === c.length ? esc(t.map((x, i) => i === k ? '「' + x + '」' : x).join(' ')) : esc(q.py); };
/* ===== 測驗進度保存：作答中隨時存檔，重新整理或離開後可繼續 ===== */
/* 分成兩份：題目（hk_resume_q）每份測驗只在開始時寫一次，只存題目鍵＋來源資訊，其餘從資料庫還原；
   作答狀態（hk_resume）每次換題才寫，只有作答、選項順序、字母順序等小資料。 */
const RKEYS = ['type', 'stem', 'ans', 'snd', 'full', 'py', 'ch', 'word'];   // 還原後必須和原題一致的欄位，否則多存
const packQs = qs => qs.map(q => {
  const key = qk(q), r = packQ(key, q, {}, RKEYS); ['wn', 'wt', 'rv', 'rc'].forEach(k => delete r[k]);
  return { k: key, r: Object.keys(r).length ? r : undefined, m: { src: q.src, prob: q.prob, years: q.years } };
});
const unpackQ = it => ({ ...hydrate(it.k, it.r || {}), ...it.m, opts: null, lets: null });
// 可繼續的題數：新格式要題目檔配得上；舊格式（整份題目放在同一筆）也能讀
const resumeLen = d => !d ? 0 : d.v === 2 ? (store.get('hk_resume_q', null)?.sid === d.sid ? d.n : 0) : (Array.isArray(d.qs) ? d.qs.length : 0);
const sparse = (qs, f) => Object.fromEntries(qs.flatMap((q, i) => q[f] ? [[i, q[f]]] : []));
function saveResume() {
  if (!Q || Q.done) return;
  if (!Q.sid) Q.sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (!Q.sq) { store.set('hk_resume_q', { sid: Q.sid, items: packQs(Q.qs) }); Q.sq = true; }
  store.set('hk_resume', { v: 2, sid: Q.sid, n: Q.qs.length, cfg: Q.cfg, ans: Q.ans, chk: Q.chk, lt: Q.lt, i: Q.i, rep: Q.rep, flag: [...Q.flag], fprev: Q.fprev, sec: (Date.now() - Q.t0) / 1000, o: sparse(Q.qs, 'opts'), l: sparse(Q.qs, 'lets') });
}
const clearResume = () => { store.set('hk_resume', null); store.set('hk_resume_q', null); };
document.addEventListener('visibilitychange', () => { if (document.hidden) saveResume(); });
window.addEventListener('pagehide', saveResume);
function resumeQuiz() {
  const d = store.get('hk_resume', null); if (!resumeLen(d)) return;
  const v2 = d.v === 2, qs = v2 ? store.get('hk_resume_q', null).items.map(unpackQ) : d.qs;
  if (v2) qs.forEach((q, i) => { q.opts = d.o?.[i] || null; q.lets = d.l?.[i] || null; });
  Q = { flag: new Set(d.flag || []), fprev: d.fprev || {}, chk: d.chk, lt: d.lt, rep: d.rep || 0, cfg: d.cfg, qs, ans: d.ans, i: Math.min(d.i || 0, qs.length - 1), t0: Date.now() - (d.sec || 0) * 1000, done: false, sid: d.sid, sq: v2 };   // 舊格式沒有 sid／題目檔：第一次存檔時自動轉成新格式
  Q.tm = setInterval(() => { const c = $('#clk'); if (c) c.textContent = '⏱ ' + fmt((Date.now() - Q.t0) / 1000); }, 1000);
  viewQ();
}
/* 輕量 DOM 比對：只更新有變動的節點／屬性／文字，其餘節點（含輸入框的焦點、游標、捲動位置）原封不動 */
function morph(root, html) { const t = document.createElement('template'); t.innerHTML = html; syncKids(root, t.content); }
function syncKids(a, b) {
  const bl = Array.from(b.childNodes);
  bl.forEach((n, i) => {
    const o = a.childNodes[i];
    if (!o) return void a.appendChild(n);
    if (o.nodeName !== n.nodeName) return void a.replaceChild(n, o);
    if (n.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
    Array.from(o.attributes).forEach(at => { if (!n.hasAttribute(at.name)) o.removeAttribute(at.name); });
    Array.from(n.attributes).forEach(at => { if (o.getAttribute(at.name) !== at.value) o.setAttribute(at.name, at.value); });
    if (o.nodeName === 'INPUT' && o.value !== (n.getAttribute('value') || '')) o.value = n.getAttribute('value') || '';
    syncKids(o, n);
  });
  while (a.childNodes.length > bl.length) a.removeChild(a.lastChild);
}
function viewQ() {
  queueMicrotask(saveResume);
  const { qs, i, ans } = Q, q = qs[i], last = i === qs.length - 1, cnt = ans.filter(Boolean).length;
  const ins = Q.cfg.instant, lock = ins && Q.chk[i], right = lock && isOk(q, ans[i]);
  const nav = qs.map((_, k) => `<button data-k="${k}" class="${k === i ? 'cur ' : ''}${ins && Q.chk[k] ? (isOk(qs[k], ans[k]) ? 'ok' : 'ng') : ans[k] ? 'done' : ''}">${k + 1}</button>`).join('');
  const am = Q.cfg.am === 'l' ? (q.type === '音' ? 'l' : 'c') : Q.cfg.am;   // 拼字組合只用在字音題
  const chai = q.type === '形' && am === 'c' && store.get('hk_chai', true);   // 拆字模式：選項顯示字的拆碼，檢查後才顯示原字
  const input = am === 'c'
    ? `<div class="opts">${options(q).map((o, n) => `<button class="opt${chai ? ' cm' : ''}${chai && !lock ? ' cz' : ''} ${lock ? (o === q.ans ? 'right' : ans[i] === o ? 'wrong' : '') : ans[i] === o ? 'sel' : ''}" data-v="${esc(o)}" ${lock ? 'disabled' : ''}><span class="no">${n + 1}</span>${chai && !lock ? esc((window.CHAI || {})[o] || o) : esc(o)}</button>`).join('')}</div>`
    : am === 'l' ? letterUI(q, i, lock)
    : `<input class="ans${lock ? (right ? ' ok' : ' ng') : ''}" id="ai" value="${esc(ans[i])}" ${lock ? 'readonly' : ''} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${q.type === '形' ? '輸入漢字' : '輸入拼音，如 ziaˊ'}">
       ${q.type === '音' ? `<div class="tones">${[...TONES].map(t => `<button data-t="${t}" ${lock ? 'disabled' : ''}>${t}</button>`).join('')}</div><div class="muted" style="font-size:.85rem">字尾直接打 <b>z</b>ˊ　<b>v</b>ˇ　<b>s</b>ˋ　<b>x</b>ˆ　<b>f</b>⁺ 會自動轉成聲調符號</div>` : ''}`;
  const fill = `<span class="fill">${esc(q.ans)}</span>`, show = lock && am !== 'c', showF = lock;   // show：字音題（填寫／拼字）檢查後頂端空格填上答案；showF：字形題檢查後（任何作答方式）顯示完整漢字
  const vm = store.get(q.type === '形' ? 'hk_vf' : 'hk_vy', q.type === '形' ? 'A' : 'B');   // 版面：形題預設 A（只看拼音）、音題預設 B（字與拼音分兩行）
  const stemH = q.type === '形' ? (showF ? esc(q.stem).replace('□', fill) : esc(q.stem)) : esc(q.stem).replace(/【/g, '「').replace(/】/g, '」');
  // 拼字組合：只有一個空格（一個音節），拼的過程直接顯示在頂端空格裡
  const liveTxt = am === 'l' && !lock ? Q.lt[i].map(k => q.lets[k]).join('') : '';
  const pyH = show && q.type === '音' ? esc(q.py).replace('＿＿＿', fill)
    : liveTxt ? esc(q.py).replace('＿＿＿', `<span class="live">${esc(liveTxt)}</span>`) : esc(q.py);
  // 形題：A＝只顯示 ten 「tooˆ」；B＝再換行顯示 定□　音題：A＝只顯示 通「透」；B＝再換行顯示 tungˇ ＿＿＿
  // 填寫類題目檢查後，一律多顯示一行，才看得到填入的正確答案
  const box = q.type === '形'
    ? `<div class="stem pyl">${pyBr(q)}</div><div class="stem${vm === 'B' || showF ? '' : ' hid'}"${vm === 'B' || showF ? '' : ' aria-hidden="true"'}>${stemH}</div>`
    : `<div class="stem">${stemH}</div>${vm === 'B' || show ? `<div class="py">${pyH}</div>` : ''}`;
  const unfinished = ans.some(a => !a);   // 還有題目沒作答：最後一題不顯示「交卷」
  const nxBtn = last && unfinished ? '' : `<button class="btn" id="nx" ${ins && am === 'c' && !lock ? 'disabled' : ''}>${last ? '交卷' : '下一題'}</button>`;
  const actions = am === 'c'
    // 選擇題：點選即作答並自動下一題；只有「立即顯示對錯」鎖定後、或最後一題已作答時才需要按鈕
    ? ((ins || (last && ans[i])) && nxBtn ? `<div class="row actions">${nxBtn}</div>` : '')
    : `<div class="row actions">${am === 'l' ? '' : `<button class="btn ghost" id="pv" ${i ? '' : 'disabled'}>上一題</button>`}${am === 'l' ? '' : `<button class="btn ghost" id="clr" ${ans[i] && !lock ? '' : 'disabled'}>清除作答</button>`}
    ${ins && !lock ? `<button class="btn" id="chk" ${ans[i] ? '' : 'disabled'}>檢查答案</button>` : ''}
    ${am === 'l' && ins && !lock ? '' : nxBtn}</div>`;   // 拼字組合：檢查前只有「檢查答案」，檢查後同一個位置變成「下一題」
  const html = `<div class="card" id="qcard"><div class="vtw">${q.type === '形' && am === 'c' ? `<button class="vt${chai ? ' on' : ''}" id="cz" type="button" aria-pressed="${!!chai}" title="選項改顯示拆字碼，答對／答錯後才顯示原字">${chai ? '拆字' : '字'}</button>` : ''}<button class="vt" id="vt" type="button" title="切換題目顯示方式">⇄ 版面</button></div><div class="muted">第 ${i + 1} / ${qs.length} 題　<span class="tag">${q.type === '形' ? '字形' : '字音'}</span><span id="clk">⏱ ${fmt((Date.now() - Q.t0) / 1000)}</span></div>
    <div class="bar"><i style="width:${cnt / qs.length * 100}%"></i></div>
    <div class="fgrow"><button class="fg${Q.flag.has(i) ? ' on' : ''}" id="fg" type="button" aria-pressed="${Q.flag.has(i)}" title="不確定答案（或是猜的）時，加入錯題本"><svg viewBox="0 0 24 24" fill="${Q.flag.has(i) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>${Q.flag.has(i) ? '已加入錯題本' : '加入錯題本'}</button></div>
    ${Q.rep ? `<div class="muted">未答對過的題目不足，已補入 ${Q.rep} 題曾答對的題目。</div>` : ''}
    <div class="qbox">${box}</div>${input}
    ${actions}</div>
    <div class="card"><div class="muted">題號（已作答 ${cnt} 題${ins ? `；已檢查答對 ${qs.filter((x, k) => Q.chk[k] && isOk(x, ans[k])).length} / ${Q.chk.filter(Boolean).length} 題` : ''}）</div><div class="grid">${nav}</div><div class="qfoot"><button class="btn ghost" id="sub">提前交卷</button><button class="btn ghost cx" id="cx">取消測驗</button></div></div>`;
  // 局部更新：已在作答畫面就只比對差異；從設定／結果畫面進來才整塊換
  const root = $('#quiz'), moved = Q.vi !== i; Q.vi = i;
  if (root.firstElementChild && root.firstElementChild.id === 'qcard') morph(root, html); else root.innerHTML = html;
  const ai = $('#ai'); if (ai) { if (moved || document.activeElement !== ai) ai.focus({ preventScroll: !moved }); ai.oninput = e => {
      if (q.type === '音' && !lock && !(e && e.isComposing) && ai.selectionStart === ai.value.length) { const v = toneKeys(ai.value); if (v !== ai.value) ai.value = v; }   // 字尾打 z v s x f 即轉成聲調符號
      Q.ans[Q.i] = ai.value; $('#clr').disabled = !ai.value; const c = $('#chk'); if (c) c.disabled = !ai.value; };
    ai.onkeydown = e => e.key === 'Enter' && $(ins && !lock ? '#chk' : '#nx').click(); }
}
document.addEventListener('click', e => {
  if (!Q || Q.done || !e.target.closest('#quiz')) return;
  const b = e.target.closest('button'); if (!b) return;
  const ins = Q.cfg.instant, lock = ins && Q.chk[Q.i];
  if (lock && (b.dataset.v !== undefined || b.dataset.l !== undefined || b.dataset.lb || b.dataset.t || b.id === 'clr')) return;   // 已檢查的題目不能再改
  if (b.dataset.v !== undefined) { Q.ans[Q.i] = b.dataset.v; if (ins) Q.chk[Q.i] = true; else if (Q.i < Q.qs.length - 1) Q.i++; viewQ(); }   // 立即模式：點選即檢查（按下一題繼續）；一般模式：點選即作答並自動下一題
  else if (b.id === 'fg') {   // 加入／取消錯題本：立即寫入，取消時還原成原本的狀態
    const q = Q.qs[Q.i], key = qk(q), W = store.get('hk_wrong', {});
    if (Q.flag.has(Q.i)) { Q.flag.delete(Q.i); const p = Q.fprev[Q.i]; if (p) W[key] = p.stem !== undefined ? packQ(key, p, p) : p; else delete W[key]; }
    else { Q.flag.add(Q.i); const p = W[key]; Q.fprev[Q.i] = p || null; W[key] = packQ(key, q, { wn: (p ? (p.wn || 1) : 0) + 1, wt: Date.now(), rv: false, rc: 0 }); }
    store.set('hk_wrong', W); viewQ(); }
  else if (b.id === 'vt') { const f = Q.qs[Q.i].type === '形', k = f ? 'hk_vf' : 'hk_vy'; store.set(k, store.get(k, f ? 'A' : 'B') === 'A' ? 'B' : 'A'); viewQ(); }
  else if (b.id === 'cz') { store.set('hk_chai', !store.get('hk_chai', true)); viewQ(); }
  else if (b.id === 'kbq') { Q.kb = !Q.kb; viewQ(); }
  else if (b.id === 'chk') { Q.chk[Q.i] = true; viewQ(); }
  else if (b.dataset.l !== undefined) { Q.lt[Q.i].push(+b.dataset.l); setLetters(); viewQ(); }
  else if (b.dataset.lb) { Q.lt[Q.i].pop(); setLetters(); viewQ(); }
  else if (b.id === 'clr') { Q.ans[Q.i] = ''; Q.lt[Q.i] = []; viewQ(); }
  else if (b.dataset.k) { Q.i = +b.dataset.k; viewQ(); jump($('#quiz .card')); }   // 點題號後捲到題目上方
  else if (b.dataset.t) { const a = $('#ai'); a.setRangeText(b.dataset.t, a.selectionStart, a.selectionEnd, 'end'); a.focus(); Q.ans[Q.i] = a.value; }
  else if (b.id === 'pv') { Q.i--; viewQ(); }
  else if (b.id === 'nx') { Q.i < Q.qs.length - 1 ? (Q.i++, viewQ()) : submit(); }
  else if (b.id === 'sub') submit();
  else if (b.id === 'cx') cancelQuiz();
});

/* 鍵盤：選擇題按 1～9 選項；有「下一題／交卷」按鈕時按 Enter 或 → 前進 */
document.addEventListener('keydown', e => {
  if (!Q || Q.done || $('#quiz').hidden || $('.dlg-mask') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const lts = $$('#quiz .lt');
  if (lts.length) {   // 拼字組合：字母鍵＝點對應字母；該字母按鈕沒有（或已用完）時，z v s x f 才當聲調
    const k = e.key.toLowerCase(); let b = null;
    if (e.key === 'Backspace') b = $('#quiz [data-lb]');
    else if (/^[a-z]$/.test(k)) {
      const free = lts.filter(x => !x.disabled);
      b = free.find(x => x.dataset.ch.toLowerCase() === k) || free.find(x => TONEKEY[k] && toneOf(x.dataset.ch) === TONEKEY[k]);
    }
    if (b && !b.disabled) { e.preventDefault(); b.click(); return; }
    if (e.key === 'Backspace') return;
  }
  if (/^[1-9]$/.test(e.key)) { const b = $$('#quiz .opt')[+e.key - 1]; if (b && !b.disabled) { e.preventDefault(); b.click(); } }
  else if (e.key === 'Enter' || e.key === 'ArrowRight') { const c = $('#chk'), b = c && !c.disabled && e.key === 'Enter' ? c : $('#nx'); if (b) { e.preventDefault(); b.click(); } }
});
/* 拼字組合：把答案拆成字母（含聲調符號）亂數排列，依序點選拼出 */
function letterUI(q, i, lock) {
  if (!q.lets) { let t, n = 0; do { t = shuffle(Array.from(q.ans)); } while (t.length > 1 && t.join('') === q.ans && ++n < 10); q.lets = t; }
  const ch = Q.lt[i], used = new Set(ch);
  return `<div class="built${lock ? (isOk(q, Q.ans[i]) ? ' b-ok' : ' b-ng') : ''}">${ch.length ? esc(ch.map(k => q.lets[k]).join('')) : '<span class="muted">點下方字母（或用鍵盤輸入），依序拼出讀音</span>'}</div>
    <div class="letters">${q.lets.map((c, k) => `<button class="lt" data-l="${k}" data-ch="${esc(c)}" ${used.has(k) || lock ? 'disabled' : ''}>${tk(c) ? `<span class="no">${tk(c)}</span>` : ''}${esc(c)}</button>`).join('')}</div>
    <button class="btn ghost" data-lb="1" ${ch.length && !lock ? '' : 'disabled'}>退一格</button>
    <button class="kbq${Q.kb ? ' on' : ''}" id="kbq" aria-label="鍵盤操作說明" aria-expanded="${!!Q.kb}">?</button>
    ${Q.kb ? `<div class="kbhint muted">直接打字母；Backspace 退一格。聲調鍵：<b>z</b>ˊ　<b>v</b>ˇ　<b>s</b>ˋ　<b>x</b>ˆ　<b>f</b>⁺（有同字母的按鈕時優先當字母）</div>` : ''}`;
}
const tk = c => Object.keys(TONEKEY).find(k => TONEKEY[k] === toneOf(c)) || '';   // 聲調符號對應的鍵盤字母
// 字母按鈕是完整的答案字母：全部點完才算作答（才能檢查），沒點完視為尚未作答
const setLetters = () => { const q = Q.qs[Q.i]; Q.ans[Q.i] = Q.lt[Q.i].length === q.lets.length ? Q.lt[Q.i].map(k => q.lets[k]).join('') : ''; };
/* 自訂對話框（取代瀏覽器內建 confirm / alert）；回傳 Promise<boolean> */
function askDlg(msg, okText = '確定', cancelText = '取消') {
  return new Promise(res => {
    if ($('.dlg-mask')) return res(false);
    const m = document.createElement('div'); m.className = 'dlg-mask';
    m.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><p>${esc(msg)}</p><div class="dlg-btns">${cancelText ? `<button class="btn ghost" data-r="0">${esc(cancelText)}</button>` : ''}<button class="btn dark" data-r="1">${esc(okText)}</button></div></div>`;
    const close = v => { document.removeEventListener('keydown', kd, true); m.remove(); res(v); };
    const kd = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
    document.addEventListener('keydown', kd, true);
    m.onclick = e => { const b = e.target.closest('button'); if (b) close(b.dataset.r === '1'); else if (e.target === m && cancelText) close(false); };
    document.body.appendChild(m); $('.dlg .dark', m).focus();
  });
}
/* 取消測驗：不計分、不寫入作答紀錄與已答對／錯題（作答中手動加入錯題本的題目會保留），回到首頁設定 */
async function cancelQuiz() {
  if (!(await askDlg('確定取消這次測驗？結果不會列入紀錄。', '取消測驗', '繼續作答')) || !Q || Q.done) return;
  clearInterval(Q.tm); clearResume(); viewSetup(); window.scrollTo(0, 0);
}
async function submit() {
  const blank = Q.ans.filter(a => !a).length;
  if (blank && !(await askDlg(`還有 ${blank} 題未作答，確定交卷？`, '確定交卷', '繼續作答'))) return;
  if (Q.done) return;
  clearInterval(Q.tm); Q.done = true; clearResume(); Q.sec = Math.round((Date.now() - Q.t0) / 1000);
  Q.res = Q.qs.map((q, k) => isOk(q, Q.ans[k]));
  const W = store.get('hk_wrong', {}), D = store.get('hk_done', {});
  Q.rvs = { up: 0, prog: 0 };
  Q.qs.forEach((q, k) => { const key = qk(q);
    if (Q.flag.has(k)) { delete D[key]; return; }             // 手動加入錯題本的題目：已在錯題本，不算已答對，答對也不移除
    if (!Q.ans[k]) return;                                   // 未作答：不進錯題本，也不算答對
    if (Q.res[k]) { D[key] = 1; if ('wr'.includes(Q.cfg.mode) && W[key]) {   // 錯題本複習答對：連續答對達標才升為「已複習」
      const was = !!W[key].rv, rc = (W[key].rc ?? (was ? REV_NEED : 0)) + 1;
      W[key] = { ...W[key], rc, rv: rc >= REV_NEED };
      if (!was && W[key].rv) Q.rvs.up++; else if (!W[key].rv) Q.rvs.prog++; } }
    else { const p = W[key]; W[key] = packQ(key, q, { wn: (p ? (p.wn || 1) : 0) + 1, wt: Date.now(), rv: false, rc: 0 }); delete D[key]; } });
  store.set('hk_wrong', W); store.set('hk_done', D);
  const L = store.get('hk_log', []); L.unshift({ t: new Date().toLocaleString('zh-TW'), mode: modeName(Q.cfg), n: Q.qs.length, s: Q.res.filter(Boolean).length, sec: Q.sec });
  store.set('hk_log', L.slice(0, 100));
  viewResult(false);
}
const modeName = c => ({ p: '115 預測題', h: '歷屆 ' + c.yr, w: '錯題本（未複習）', r: '錯題本（已複習）' }[c.mode] || '模擬卷 ' + c.mode[1]);

/* ===== 結果列：單行詞＋拼音（答案處標色）、答錯才顯示對照、來源資訊合併成一行 ===== */
function resultRow(q, k, a, ok) {
  const cs = Array.from(q.word), ps = String(q.full || '').trim().split(/\s+/);
  const idx = Array.from(q.stem).findIndex(x => x === '□' || x === '【');
  const aligned = ps.length === cs.length;
  const word = cs.map((c, i) => i === idx ? `<mark>${esc(c)}</mark>` : esc(c)).join('');
  const py = aligned ? ps.map((p, i) => i === idx ? `<mark>${esc(p)}</mark>` : esc(p)).join(' ') : esc(q.full);
  const meta = [q.src + (q.prob ? ' ' + pct(q.prob) : '')];
  if (q.years && !/歷屆/.test(q.src)) meta.push('歷屆 ' + q.years);
  const diff = ok ? '' : `<div class="rs-d">${a ? `你填 <s>${esc(a)}</s> → ` : '未作答　'}正確 <b>${esc(q.ans)}</b></div>`;
  return `<div class="rs-row ${ok ? 'r-ok' : 'r-ng'}"><div class="rs-n"><b>${k + 1}</b><span class="tag ${ok ? 'ok' : 'ng'}">${ok ? '答對' : a ? '答錯' : '未答'}</span></div>
    <div class="rs-b"><div class="rs-w">${word}<span class="rs-py">${py}</span><span class="rs-t">${q.type === '音' ? '字音' : '字形'}</span></div>${diff}
    <div class="rs-m">${meta.map(esc).join('　·　')}</div></div></div>`;
}

/* ===== 測驗：結果 ===== */
function viewResult(onlyWrong) {
  const { qs, ans, res } = Q, s = res.filter(Boolean).length, by = t => { const k = qs.map((q, i) => i).filter(i => qs[i].type === t); return k.length ? `${k.filter(i => res[i]).length}/${k.length}` : '—'; };
  $('#quiz').innerHTML = `<div class="card"><div class="score">${s} <small style="font-size:1rem">/ ${qs.length} 分（${Math.round(s / qs.length * 100)}%）</small></div>
    <p class="muted">${esc(modeName(Q.cfg))}　用時 ${fmt(Q.sec)}　字形 ${by('形')}　字音 ${by('音')}</p>
    ${'wr'.includes(Q.cfg.mode) ? `<p class="muted">錯題本：${Q.rvs.up} 題升為已複習；${Q.rvs.prog} 題答對了，但還沒連續答對 ${REV_NEED} 次。</p>` : ''}
    <div class="row"><button class="btn" id="again">同設定再產生一份</button><button class="btn ghost" id="back">回設定</button>
    <button class="btn ghost" id="flt">${onlyWrong ? '顯示全部' : '只看錯題'}</button>
    <button class="btn ghost" id="mt">${store.get('hk_meta', false) ? '隱藏來源資訊' : '顯示來源資訊'}</button></div>
    <p class="muted">未作答的題目不會加入錯題本。</p></div>
    <div class="card rs-list${store.get('hk_meta', false) ? '' : ' hide-meta'}">${qs.map((q, k) => (onlyWrong && res[k]) ? '' : resultRow(q, k, ans[k], res[k])).join('') || '<div class="muted">全部答對，沒有錯題 🎉</div>'}</div>`;
  $('#again').onclick = () => startQuiz(Q.cfg); $('#back').onclick = viewSetup; $('#flt').onclick = () => viewResult(!onlyWrong);
  $('#mt').onclick = () => { const on = !store.get('hk_meta', false); store.set('hk_meta', on); $('.rs-list').classList.toggle('hide-meta', !on); $('#mt').textContent = on ? '隱藏來源資訊' : '顯示來源資訊'; };
}

/* ===== 詞與拼音對照（惰性建立）：歷屆題優先，再用詞庫補 ===== */
let LX;
function lexIndex() {
  if (LX) return LX;
  const WP = new Map(), byCh = new Map();
  [...DB.hist.map(r => [r[3], r[4]]), ...DB.pw.map(r => [r[1], r[2]]), ...DB.nw.map(r => [r[1], r[2]]), ...DB.lex].forEach(([w, p]) => { if (!WP.has(w)) WP.set(w, p); });
  DB.lex.forEach(([w, p]) => new Set(Array.from(w)).forEach(c => (byCh.get(c) || byCh.set(c, []).get(c)).push(w)));
  return LX = { WP, byCh, tested: new Set(DB.hist.map(r => r[3])) };
}
let TS;
const testedSet = () => TS ||= new Set(DB.hist.map(r => r[3]));   // 歷屆考過的詞（不必建整個詞庫索引）
const hl = (w, i) => Array.from(w).map((c, k) => k === i ? `<mark>${esc(c)}</mark>` : esc(c)).join('');
const chips = ws => ({ w: 1, h: ws.map(w => `<span class="wc"><b>${esc(w)}</b> <i>${esc(lexIndex().WP.get(w) || '')}</i></span>`).join('') });
// 某字的學習詞：歷屆相關詞 + 詞庫補足（最多 8 個，短詞優先），每個詞附完整拼音
function charWords(ch, rel) {
  const ws = (rel || '').split('、').filter(Boolean);
  const extra = [...new Set(lexIndex().byCh.get(ch) || [])].filter(w => w.length > 1 && !ws.includes(w)).sort((a, b) => a.length - b.length).slice(0, Math.max(0, 8 - ws.length));
  return chips([...ws, ...extra]);
}
const wd = h => ({ h: `<span class="wd">${h}</span>` });
const snd = t => ({ h: `<span class="snd">${esc(t)}</span>` });
const big = c => ({ h: `<span class="big">${esc(c)}</span>` });
const letter = s => {
  s = String(s).trim();
  if (!/^[a-z]/i.test(s)) return '其他';
  const t = s.toLowerCase(), two = t.slice(0, 2);
  return ['bb', 'ch', 'zh', 'sh', 'ng'].includes(two) ? two.toUpperCase() : t[0].toUpperCase();
};
const band3 = (r, a, b, t) => r <= a ? 'A 先背 1–' + a : r <= b ? 'B 次之 ' + (a + 1) + '–' + b : 'C 補充 ' + (b + 1) + '–' + t;
const wlen = w => { const n = Array.from(w).length; return n >= 5 ? '5 字以上' : n + ' 字詞'; };
const gi = (w, ch) => Array.from(w).indexOf(ch);

/* ===== 加入錯題本：資料表每列可切換「形」「音」兩種題型（錯題本以 題型|詞|答案字 為鍵） ===== */
const WBT = ['形', '音'];
let WK = {};   // 目前畫面用的錯題本快照
const wbQ = (f, r, t) => { const q = f(r, t); return q && q.type === t ? q : null; };   // 音題但拼音無法逐字對齊時為 null
const wbRule = f => ({ name: '依錯題本', live: true, sort: (a, b) => a[0] - b[0] || a[1] - b[1],
  cat: r => WBT.some(t => { const q = wbQ(f, r, t); return q && WK[qk(q)]; }) ? '已加入錯題本' : '未加入錯題本' });
function toggleWrong(f, r, t) {
  const q = wbQ(f, r, t); if (!q) return;
  const key = qk(q), W = store.get('hk_wrong', {});
  if (W[key]) delete W[key];
  else { W[key] = packQ(key, q, { wn: 1, wt: Date.now(), rv: false, rc: 0 }); const D = store.get('hk_done', {}); if (D[key]) { delete D[key]; store.set('hk_done', D); } }
  store.set('hk_wrong', W);
}

/* ===== 資料來源定義：rules＝瀏覽規則（把全部資料分成不重疊的類別，合計＝全部） ===== */
let PS, DS;
const predSrc = () => PS ||= (() => {
  const rel = new Map(DB.bz.map(r => [r[1], r[4]]));
  const readRules = i => ({ name: '依讀音首字母（A–Z）', cat: r => letter(r[i]), sort: (a, b) => a[i].localeCompare(b[i]) || a[0] - b[0] });
  return {
    pc: { name: '115 預測・答案字（300）', head: ['排名', '字', '讀音', '相關詞（漢字＋拼音）', '機率'], get: () => DB.pc,
      cells: r => [r[0], big(r[1]), snd(r[4]), charWords(r[1], rel.get(r[1]) || r[3]), pct(r[2])],
      rules: [{ name: '依排名分級', cat: r => band3(r[0], 50, 150, 300) }, readRules(4)] },
    pw: { name: '115 預測・詞彙（300）', head: ['排名', '錯題本', '詞', '完整拼音', '考的字音', '機率'], wb: (r, t) => mk(r[1], r[2], gi(r[1], r[3]), t, {}), get: () => DB.pw,
      cells: r => { const i = gi(r[1], r[3]); return [r[0], '', wd(hl(r[1], i)), r[2], snd(r[2].split(' ')[i] || ''), pct(r[4])]; },
      rules: [{ name: '依排名分級', cat: r => band3(r[0], 50, 150, 300) }, { name: '依詞長', cat: r => wlen(r[1]) }, wbRule((r, t) => mk(r[1], r[2], gi(r[1], r[3]), t, {}))] },
    nw: { name: '115 新詞候補（500）', head: ['排名', '錯題本', '詞', '完整拼音', '考的字音', '機率'], wb: (r, t) => mk(r[1], r[2], gi(r[1], r[3]), t, { snd: r[4] }), get: () => DB.nw,
      cells: r => [r[0], '', wd(hl(r[1], gi(r[1], r[3]))), r[2], snd(r[4]), pct(r[5])],
      rules: [{ name: '依排名分級', cat: r => band3(r[0], 100, 300, 500) }, { name: '依詞長', cat: r => wlen(r[1]) }, wbRule((r, t) => mk(r[1], r[2], gi(r[1], r[3]), t, { snd: r[4] }))] },
    bz: { name: '背誦清單・全部答案字（1,707）', head: ['排名', '字', '讀音', '相關詞（漢字＋拼音）', '機率'], get: () => DB.bz,
      cells: r => [r[0], big(r[1]), snd(r[3]), charWords(r[1], r[4]), pct(r[2])],
      rules: [{ name: '依排名每 100 名', cat: r => { const s = (r[0] - 1) / 100 | 0; return `${s * 100 + 1}–${Math.min(s * 100 + 100, DB.bz.length)} 名`; } }, readRules(3)] }
  };
})();
/* 歷屆重複題：同一個詞、同一個答案字視為重複；統計出現次數，去重時只留最近一年那筆 */
let HF;
const histFreq = () => HF ||= (() => {
  const n = new Map(), at = new Map();
  DB.hist.forEach((r, i) => { const k = r[3] + '|' + r[5]; n.set(k, (n.get(k) || 0) + 1);
    const j = at.get(k); if (j === undefined || r[0] > DB.hist[j][0] || (r[0] === DB.hist[j][0] && r[1] < DB.hist[j][1])) at.set(k, i); });
  return { n, keep: new Set(at.values()) };
})();
const fq = r => histFreq().n.get(r[3] + '|' + r[5]);
const histQ = (r, t) => { const c = Array.from(r[3]); let i = r[2] - 1; if (c[i] !== r[5]) i = c.indexOf(r[5]); return mk(r[3], r[4], i, t, { snd: r[6] }); };
const dbSrc = () => DS ||= {
  hist: { name: `歷屆題庫（${DB.hist.length} 題）`, head: ['編號', '錯題本', '年度', '序號', '詞', '拼音', '答案字', '答案音', '考過次數'], hide: [2, 3, 8], serial: true, wb: histQ, get: () => DB.hist, keep: (r, i) => histFreq().keep.has(i),
    txt: r => r[0] + ' ' + r[1] + ' ' + r[3] + ' ' + r[4] + ' ' + r[5] + ' ' + r[6] + ' ' + fq(r) + ' 次',
    cells: r => { const c = Array.from(r[3]); let i = r[2] - 1; if (c[i] !== r[5]) i = c.indexOf(r[5]); return ['', '', r[0], r[1], wd(hl(r[3], i)), r[4], big(r[5]), r[6], fq(r) + ' 次']; },
    rules: [{ name: '依年度', cat: r => r[0] + ' 年', sort: (a, b) => a[0] - b[0] || a[1] - b[1] },
      { name: '依出現頻率（多 → 少）', rev: true, cat: r => '考過 ' + fq(r) + ' 次', sort: (a, b) => fq(b) - fq(a) || a[3].localeCompare(b[3]) || b[0] - a[0] || a[1] - b[1] },
      { name: '依答案音首字母（A–Z）', cat: r => letter(r[6]), sort: (a, b) => a[6].localeCompare(b[6]) || a[0] - b[0] || a[1] - b[1] },
      { name: '依詞長', cat: r => wlen(r[3]), sort: (a, b) => a[0] - b[0] || a[1] - b[1] }, wbRule(histQ)] },
  lex: { name: `詞庫（${DB.lex.length} 詞）`, head: ['編號', '詞', '拼音', '歷屆'], serial: true, get: () => DB.lex,
    cells: r => ['', wd(esc(r[0])), r[1], testedSet().has(r[0]) ? '✓ 考過' : ''],
    txt: r => r[0] + ' ' + r[1] + (testedSet().has(r[0]) ? ' ✓ 考過' : ''),
    rules: [{ name: '依拼音首字母（A–Z）', cat: r => letter(r[1]) }, { name: '依詞長', cat: r => wlen(r[0]) },
      { name: '依歷屆是否考過', cat: r => testedSet().has(r[0]) ? '歷屆考過' : '歷屆未考過' }] }
};

/* ===== 通用：瀏覽（分類＋分頁）＋搜尋 ===== */
const plain = c => typeof c === 'object' ? c.h.replace(/<[^>]*>/g, '') : String(c);
const cellHtml = c => typeof c === 'object' ? `<td${c.w ? ' class="w"' : ''}>${c.h}</td>` : `<td>${esc(c)}</td>`;
/* 換頁後捲到資料表頂端（扣掉黏在上方的標題列），不是整頁最頂端 */
const jump = t => { if (!t) return; t.style.scrollMarginTop = ($('header').offsetHeight + 8) + 'px'; t.scrollIntoView(); };
function browse(el, src, st) {
  const keys = Object.keys(src); st.k ||= keys[0]; st.ri ??= 0; st.cat ??= '全部'; st.q ??= ''; st.pg ??= 1; st.sz ??= 50; st.dd ??= store.get('hk_dd', true); st.cols ??= store.get('hk_cols', {});
  /* 記住偏好：資料表、瀏覽方式、每頁筆數（預測榜、資料庫各自記） */
  if (!st.loaded) { st.loaded = true; const sv = store.get('hk_br_' + el.id, null);
    if (sv && src[sv.k]) { st.k = sv.k; st.ri = src[sv.k].rules[sv.ri] ? sv.ri : 0; if ([20, 50, 100].includes(sv.sz)) st.sz = sv.sz; } }
  const remember = () => store.set('hk_br_' + el.id, { k: st.k, ri: st.ri, sz: st.sz });
  const hidOf = () => st.cols[st.k] ?? src[st.k].hide ?? [];
  /* 延遲計算：列只在要顯示時才產生儲存格；搜尋索引到第一次搜尋才建（大表用 txt 直接拼文字，不經過 HTML） */
  const S = () => { const s = src[st.k]; if (!s.rows) { s.rows = s.get(); s.cell = []; } return s; };
  const cellsOf = (s, i) => s.cell[i] ||= s.cells(s.rows[i]);
  const idxOf = s => s.idx ||= s.rows.map((r, i) => (s.txt ? s.txt(r) : cellsOf(s, i).map(plain).join(' ')).toLowerCase());
  el.innerHTML = `<div class="card"><div class="row"><label>資料表<select id="bs">${keys.map(k => `<option value="${k}" ${k === st.k ? 'selected' : ''}>${src[k].name}</option>`).join('')}</select></label>
    <label>瀏覽方式<select id="br"></select></label>
    <label>每頁<select id="bz">${[20, 50, 100].map(n => `<option ${n === st.sz ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>搜尋（字、詞、拼音）<input id="bq" value="${esc(st.q)}" placeholder="例如：殮、liam"></label>
    <label class="ck" id="bdl" hidden title="同一個詞、同一個答案字只留最近一年的那題"><input type="checkbox" id="bd">不顯示重複</label>
    <button class="btn ghost" id="bcb" type="button">欄位 ▾</button></div><div class="set-g" id="bcp" hidden style="margin-top:12px"></div>
    <div class="chips" id="bc"></div><div id="bp1"></div><div class="tbl" id="bt"></div><div id="bp2"></div></div>`;
  const fillRules = () => $('#br', el).innerHTML = src[st.k].rules.map((r, i) => `<option value="${i}" ${i === st.ri ? 'selected' : ''}>${r.name}</option>`).join('');
  const fillCols = () => { const s = src[st.k], hid = hidOf();
    $('#bcp', el).innerHTML = `<div class="row">${s.head.map((h, c) => `<label class="ck"><input type="checkbox" data-col="${c}" ${hid.includes(c) ? '' : 'checked'}>${esc(h)}</label>`).join('')}</div>`; };
  const wbCell = (s, i) => `<td><span class="wbs">${WBT.map(t => { const q = wbQ(s.wb, s.rows[i], t);
    return q ? `<button type="button" class="${WK[qk(q)] ? 'on' : ''}" data-wb="${i}|${t}" aria-pressed="${!!WK[qk(q)]}" title="${WK[qk(q)] ? '已在錯題本（字' + t + '題），點一下移除' : '加入錯題本（字' + t + '題）'}">${t}</button>` : `<button type="button" disabled title="拼音無法逐字對齊，不能出字音題">${t}</button>`; }).join('')}</span></td>`;
  const draw = () => {
    clearTimeout(st.tm);   // 手動重畫時，取消還在等的搜尋
    const s = S(), rule = s.rules[st.ri] || s.rules[0], q = st.q.trim().toLowerCase();
    if (s.wb) WK = wrongRaw();
    if (rule.live || !rule.lab) rule.lab = s.rows.map(rule.cat);   // 依錯題本的分類會隨時變動，每次重算
    $('#bdl', el).hidden = !s.keep; $('#bd', el).checked = !!st.dd;
    const dd = !!(st.dd && s.keep), hid = hidOf(), vis = s.head.map((_, c) => c).filter(c => !hid.includes(c));
    const ix = q ? idxOf(s) : null, N = s.rows.length;   // 排序只在每個瀏覽方式第一次用到時算一次，之後依此順序篩選
    const order = rule.sort ? (rule.ord ||= Array.from({ length: N }, (_, i) => i).sort((a, b) => rule.sort(s.rows[a], s.rows[b]))) : null;
    const ids = []; for (let k = 0; k < N; k++) { const i = order ? order[k] : k; if ((!q || ix[i].includes(q)) && (!dd || s.keep(s.rows[i], i))) ids.push(i); }
    const cnt = new Map(); ids.forEach(i => cnt.set(rule.lab[i], (cnt.get(rule.lab[i]) || 0) + 1));
    const labs = [...cnt.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })); if (rule.rev) labs.reverse();
    if (st.cat !== '全部' && !cnt.has(st.cat)) st.cat = '全部';
    let sel = st.cat === '全部' ? ids : ids.filter(i => rule.lab[i] === st.cat);
    const pages = Math.max(1, Math.ceil(sel.length / st.sz)); st.pg = Math.min(Math.max(1, st.pg), pages);
    $('#bc', el).innerHTML = [['全部', ids.length], ...labs.map(l => [l, cnt.get(l)])].map(([l, n]) =>
      `<button class="chip ${l === st.cat ? 'on' : ''}" data-c="${esc(l)}">${esc(l)}（${n}）</button>`).join('');
    const pg = `<div class="pager"><button data-p="1" ${st.pg <= 1 ? 'disabled' : ''}>«</button><button data-p="${st.pg - 1}" ${st.pg <= 1 ? 'disabled' : ''}>‹</button>
      <span>第 <input type="number" class="pn" min="1" max="${pages}" value="${st.pg}"> / ${pages} 頁</span>
      <button data-p="${st.pg + 1}" ${st.pg >= pages ? 'disabled' : ''}>›</button><button data-p="${pages}" ${st.pg >= pages ? 'disabled' : ''}>»</button>
      <span class="muted">共 ${sel.length} 筆</span></div>`;
    $('#bp1', el).innerHTML = $('#bp2', el).innerHTML = pg;
    const from = (st.pg - 1) * st.sz;
    $('#bt', el).innerHTML = sel.length ? `<table class="${vis.some(c => /^相關詞/.test(s.head[c])) ? 't-rel' : ''}"><tr>${vis.map(c => `<th>${s.head[c]}</th>`).join('')}</tr>${sel.slice(from, from + st.sz).map((i, j) => `<tr>${vis.map(c => s.serial && c === 0 ? `<td class="muted">${from + j + 1}</td>` : s.wb && c === 1 ? wbCell(s, i) : cellHtml(cellsOf(s, i)[c])).join('')}</tr>`).join('')}</table>` : '<p class="muted">沒有符合的資料</p>';
  };
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'bcb') $('#bcp', el).hidden = !$('#bcp', el).hidden;
    else if (b.dataset.c !== undefined) { st.cat = b.dataset.c; st.pg = 1; draw(); }
    else if (b.dataset.wb) { const [i, t] = b.dataset.wb.split('|'), s = S(); toggleWrong(s.wb, s.rows[+i], t); draw(); }
    else if (b.dataset.p) { st.pg = +b.dataset.p; draw(); jump($('#bt', el)); } };
  el.onchange = e => { const t = e.target;
    if (t.dataset.col !== undefined) { const h = new Set(hidOf()); t.checked ? h.delete(+t.dataset.col) : h.add(+t.dataset.col);
      if (h.size >= src[st.k].head.length) { t.checked = true; return; }   // 至少留一欄
      st.cols[st.k] = [...h]; store.set('hk_cols', st.cols); draw(); }
    else if (t.id === 'bd') { st.dd = t.checked; store.set('hk_dd', st.dd); st.pg = 1; draw(); }
    else if (t.id === 'bs') { st.k = t.value; st.ri = 0; st.cat = '全部'; st.pg = 1; remember(); fillRules(); fillCols(); draw(); }
    else if (t.id === 'br') { st.ri = +t.value; st.cat = '全部'; st.pg = 1; remember(); draw(); }
    else if (t.id === 'bz') { st.sz = +t.value; st.pg = 1; remember(); draw(); }
    else if (t.classList.contains('pn')) { st.pg = +t.value || 1; draw(); jump($('#bt', el)); } };
  clearTimeout(st.tm);
  $('#bq', el).oninput = e => { st.q = e.target.value; st.pg = 1; clearTimeout(st.tm); st.tm = setTimeout(draw, 200); };   // 停手 200 毫秒才搜尋
  fillRules(); fillCols(); draw();
}
const PST = {}, DST = { ri: 1 };   // 資料庫預設：歷屆題庫、依出現頻率
function viewPred() { browse($('#pred'), predSrc(), PST); }
function viewDb() { browse($('#db'), dbSrc(), DST); }

/* ===== 備份：匯出／匯入 ===== */
const exportData = () => JSON.stringify({ app: 'hakka-quiz', v: 2, at: new Date().toISOString(),
  log: store.get('hk_log', []), wrong: store.get('hk_wrong', {}), done: store.get('hk_done', {}) });
function importData(txt, mode) {
  let d; try { d = JSON.parse(String(txt).replace(/^\uFEFF/, '').trim()); } catch (e) { throw new Error('內容不是有效的備份（JSON 格式錯誤）'); }
  if (!d || d.app !== 'hakka-quiz' || !Array.isArray(d.log) || typeof d.wrong !== 'object' || typeof d.done !== 'object') throw new Error('這不是本網站的備份檔');
  let L = d.log, W = packAll(d.wrong), D = d.done;   // v1 備份內是完整題目，轉成精簡格式
  if (mode === 'merge') {
    const L0 = store.get('hk_log', []), seen = new Set(L0.map(x => x.t + x.mode + x.n + x.s));
    L = [...L0, ...d.log.filter(x => !seen.has(x.t + x.mode + x.n + x.s))].slice(0, 100);
    W = { ...W, ...store.get('hk_wrong', {}) }; D = { ...d.done, ...store.get('hk_done', {}) };
  }
  Object.keys(W).forEach(k => delete D[k]);   // 同一題同時出現在錯題與已答對時，以「錯題」為準
  store.set('hk_log', L); store.set('hk_wrong', W); store.set('hk_done', D);
  return { log: L.length, wrong: Object.keys(W).length, done: Object.keys(D).length };
}

/* ===== 紀錄・錯題本 ===== */
let LOGOPEN = false;   // 作答紀錄預設折疊
let WPG = 1, WSORT = store.get('hk_wsort', 't'), WFILT = 'all'; const WSZ = 20, WSEL = new Set();
function viewLog(msg = '') {
  const L = store.get('hk_log', []), W = Object.values(store.get('hk_wrong', {})), avg = L.length ? Math.round(L.reduce((a, x) => a + x.s / x.n, 0) / L.length * 100) : 0;
  $('#log').innerHTML = storeWarn() + `<details class="card fold" id="lgd" ${LOGOPEN ? 'open' : ''}><summary><b>作答紀錄</b>　<span class="muted">共 ${L.length} 次，平均 ${avg}%</span></summary>
    <div class="tbl"><table><tr><th>時間</th><th>來源</th><th>得分</th><th>用時</th></tr>${L.slice(0, 30).map(x => `<tr><td>${esc(x.t)}</td><td>${esc(x.mode)}</td><td>${x.s}/${x.n}</td><td>${fmt(x.sec)}</td></tr>`).join('')}</table></div>
    <button class="btn ghost" id="cl">清除紀錄</button></details>
    <div class="card"><b>錯題本</b>　<span class="muted">共 ${W.length} 題（未複習 ${W.filter(q => !q.rv).length}、已複習 ${W.filter(q => q.rv).length}）。到「測驗」選錯題本，連續答對 ${REV_NEED} 次才會標為已複習，答錯會歸零。</span>
    <div id="wb"></div>
    <div class="xbox"><p class="muted" style="margin:0 0 6px">匯出錯題本（試算表、其他軟體或列印）</p>
    <div class="row"><label>匯出範圍<select id="xs"><option value="cur">目前篩選與排序</option><option value="sel">僅已勾選</option></select></label>
    <button class="btn ghost" data-x="csv">下載 CSV</button><button class="btn ghost" data-x="tsv">下載 TSV</button><button class="btn ghost" data-x="print">列印清單</button>
    <label class="ck"><input type="checkbox" id="xh">列印時遮住答案（自我測驗用）</label></div><p class="muted" id="xm" style="margin:6px 0 0"></p></div>
    <button class="btn ghost" id="cw" style="margin-top:12px">清空錯題本</button></div>
    <div class="card"><b>已答對題目</b>　<span class="muted">共 ${Object.keys(store.get('hk_done', {})).length} 題（自動出題時預設略過）</span><br><br><button class="btn ghost" id="cd">清除已答對記錄</button></div>
    <div class="card"><b>備份與還原</b>　<span class="muted">換裝置或清除瀏覽器資料前先匯出；到新裝置再匯入。</span>
    <p class="muted" style="margin:12px 0 4px">匯出（擇一）</p>
    <div class="row"><button class="btn" id="ex">下載備份檔</button><button class="btn ghost" id="cp">複製備份碼</button></div>
    <p class="muted" style="margin:14px 0 4px">匯入（擇一）</p>
    <div class="row"><label>合併方式<select id="imm"><option value="merge">合併（保留現有）</option><option value="replace">覆蓋（以備份為準）</option></select></label>
    <label>選擇備份檔<input type="file" id="imf"></label><button class="btn ghost" id="pa">貼上備份碼…</button></div>
    <div id="pz" hidden><textarea id="bk" rows="4" placeholder="貼上備份碼" style="width:100%;margin-top:10px"></textarea>
    <div class="row" id="imrow" style="margin-top:8px"><button class="btn" id="im">匯入貼上內容</button></div></div>
    <p class="muted" id="bm">${esc(msg)}</p></div>`;
  /* 錯題本：篩選（全部／未複習／已複習）＋排序＋分頁（每頁 WSZ 題）＋勾選後批次操作。舊資料沒有次數／時間／複習狀態：次數視為 1、狀態視為未複習 */
  const WO = store.get('hk_wrong', {});
  [...WSEL].forEach(k => { if (!(k in WO)) WSEL.delete(k); });
  const base = Object.entries(WO).map(([key, r], i) => ({ key, q: hydrate(key, r), n: r.wn || 1, t: r.wt ?? i, rv: !!r.rv }));
  const tone = /[ˊˇˋˆ`´^]+/g, py = q => String(q.full || '').toLowerCase().replace(tone, '');
  const SORTS = {
    t: ['時間（新 → 舊）', (x, y) => y.t - x.t],
    n: ['錯的次數（多 → 少）', (x, y) => y.n - x.n || y.t - x.t],
    p: ['拼音（A → Z）', (x, y) => py(x.q).localeCompare(py(y.q)) || String(x.q.full).localeCompare(String(y.q.full)) || y.t - x.t],
    h: ['漢字（字碼序）', (x, y) => (x.q.word < y.q.word ? -1 : x.q.word > y.q.word ? 1 : 0) || y.t - x.t]
  };
  let curKeys = [];
  const updSel = () => {
    const n = WSEL.size, sn = $('#wsn'), all = $('#wall');
    if (sn) sn.textContent = n ? `已選 ${n} 題` : '';
    $$('#wb .wact .btn').forEach(b => b.disabled = !n);
    if (all) all.checked = curKeys.length > 0 && curKeys.every(k => WSEL.has(k));
    const xs = $('#xs'); if (xs) {   // 匯出範圍：題數與是否可選「已勾選」
      xs.options[0].textContent = `目前篩選與排序（${curKeys.length} 題）`; xs.options[1].textContent = `僅已勾選（${n} 題）`; xs.options[1].disabled = !n;
      if (!n && xs.value === 'sel') xs.value = 'cur';
      $$('[data-x]').forEach(b => b.disabled = !(xs.value === 'sel' ? n : curKeys.length));
    }
  };
  const drawW = () => {
    if (!SORTS[WSORT]) WSORT = 't';
    const cnt = { all: base.length, 0: base.filter(x => !x.rv).length, 1: base.filter(x => x.rv).length };
    const WL = base.filter(x => WFILT === 'all' || (WFILT === '1') === x.rv).sort(SORTS[WSORT][1]), pages = Math.max(1, Math.ceil(WL.length / WSZ)); WPG = Math.min(Math.max(1, WPG), pages);
    curKeys = WL.map(x => x.key);
    const from = (WPG - 1) * WSZ, pg = pages > 1 ? `<div class="pager"><button data-p="1" ${WPG <= 1 ? 'disabled' : ''}>«</button><button data-p="${WPG - 1}" ${WPG <= 1 ? 'disabled' : ''}>‹</button>
      <span>第 ${WPG} / ${pages} 頁</span><button data-p="${WPG + 1}" ${WPG >= pages ? 'disabled' : ''}>›</button><button data-p="${pages}" ${WPG >= pages ? 'disabled' : ''}>»</button></div>` : '';
    const filt = `<label>顯示<select id="wf">${[['all', '全部'], ['0', '未複習'], ['1', '已複習']].map(([k, l]) => `<option value="${k}" ${k === WFILT ? 'selected' : ''}>${l}（${cnt[k]}）</option>`).join('')}</select></label>`;
    const sort = WL.length > 1 ? `<label>排序<select id="ws">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === WSORT ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>` : '';
    const tool = WL.length ? `<div class="wtool"><label class="ck"><input type="checkbox" id="wall">全選（${WL.length} 題）</label><span class="muted" id="wsn"></span></div>
      <div class="wact"><button class="btn ghost" data-a="del" disabled>從錯題本移除</button><button class="btn ghost" data-a="0" disabled>標為未複習</button><button class="btn ghost" data-a="1" disabled>標為已複習</button></div>` : '';
    $('#wb').innerHTML = base.length ? `<div class="row" style="margin:8px 0">${filt}${sort}</div>${tool}${WL.length ? `${pg}<div class="tbl"><table><tr><th></th><th>#</th><th>題型</th><th>詞</th><th>拼音</th><th>答案</th><th>錯次</th><th>狀態</th></tr>${WL.slice(from, from + WSZ).map(({ key, q, n, rv }, j) => `<tr><td><input type="checkbox" class="wk" data-k="${esc(key)}" ${WSEL.has(key) ? 'checked' : ''}></td><td class="muted">${from + j + 1}</td><td>${q.type === '形' ? '字形' : '字音'}</td><td>${esc(q.word)}</td><td>${esc(q.full)}</td><td>${esc(q.ans)}</td><td>${n}</td><td><span class="tag ${rv ? 'ok' : 'ng'}">${rv ? '已複習' : q.rc ? `未複習 ${q.rc}/${REV_NEED}` : '未複習'}</span></td></tr>`).join('')}</table></div>${pg}` : '<p class="muted">這個分類目前沒有題目。</p>'}` : '<p class="muted">目前沒有錯題。</p>';
    updSel();
  };
  $('#wb').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p) { WPG = +b.dataset.p; drawW(); jump($('#wb .tbl')); return; }
    if (b.dataset.a && WSEL.size) {
      const W = store.get('hk_wrong', {}), ks = [...WSEL];
      if (b.dataset.a === 'del') { if (!(await askDlg(`確定從錯題本移除 ${ks.length} 題？`, '移除', '取消'))) return; ks.forEach(k => delete W[k]); }
      else ks.forEach(k => { if (W[k]) W[k] = { ...W[k], rv: b.dataset.a === '1', rc: b.dataset.a === '1' ? REV_NEED : 0 }; });
      WSEL.clear(); store.set('hk_wrong', W); viewLog();
    }
  };
  $('#wb').onchange = e => {
    const t = e.target;
    if (t.id === 'ws') { WSORT = t.value; store.set('hk_wsort', WSORT); WPG = 1; drawW(); }
    else if (t.id === 'wf') { WFILT = t.value; WSEL.clear(); WPG = 1; drawW(); }
    else if (t.id === 'wall') { curKeys.forEach(k => t.checked ? WSEL.add(k) : WSEL.delete(k)); $$('#wb .wk').forEach(c => c.checked = t.checked); updSel(); }
    else if (t.classList.contains('wk')) { t.checked ? WSEL.add(t.dataset.k) : WSEL.delete(t.dataset.k); updSel(); }
  };
  drawW();
  $('#lgd').ontoggle = e => { LOGOPEN = e.target.open; };
  $('#cl').onclick = async () => { if (!L.length || !(await askDlg(`確定清除全部 ${L.length} 筆作答紀錄？此動作無法復原。`, '清除', '取消'))) return; store.set('hk_log', []); viewLog(); };
  /* 錯題本匯出：CSV（Excel 可直接開，含 BOM）／TSV／可列印清單 */
  const xRows = () => { const by = new Map(base.map(x => [x.key, x])), ks = $('#xs').value === 'sel' ? curKeys.filter(k => WSEL.has(k)) : curKeys; return ks.map(k => by.get(k)).filter(Boolean); };
  const XH = ['題型', '題目', '詞', '拼音', '考的字', '答案', '錯次', '狀態', '連續答對', '最近答錯'];
  const xCells = ({ q, n, rv }) => [q.type === '形' ? '字形' : '字音', String(q.stem).replace(/【/g, '「').replace(/】/g, '」'), q.word, q.full, q.ch, q.ans, n, rv ? '已複習' : '未複習', q.rc ?? (rv ? REV_NEED : 0), q.wt ? new Date(q.wt).toLocaleString('zh-TW', { hour12: false }) : ''];
  const safe = v => { v = String(v ?? '').replace(/[\t\r\n]+/g, ' '); return /^[=+@-]/.test(v) ? "'" + v : v; };   // 避免被試算表當成公式
  const toCsv = rows => '\uFEFF' + [XH, ...rows.map(xCells)].map(r => r.map(v => '"' + safe(v).replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n';
  const toTsv = rows => [XH, ...rows.map(xCells)].map(r => r.map(safe).join('\t')).join('\n') + '\n';
  const saveFile = (name, text, type) => { const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
  const printList = rows => {
    const hide = $('#xh').checked, now = new Date();
    const tr = rows.map(({ q, n, rv }, i) => {
      const k = Array.from(q.stem).findIndex(c => c === '□' || c === '【'), ws = Array.from(q.word), ps = String(q.full || '').trim().split(/\s+/);
      const word = hide ? esc(q.stem).replace(/【/g, '「').replace(/】/g, '」') : ws.map((c, j) => j === k ? `<mark>${esc(c)}</mark>` : esc(c)).join('');
      const py = hide ? esc(q.py) : (ps.length === ws.length ? ps.map((p, j) => j === k ? `<mark>${esc(p)}</mark>` : esc(p)).join(' ') : esc(q.full));
      return `<tr><td class="c">${i + 1}</td><td class="c">${q.type === '形' ? '字形' : '字音'}</td><td class="w">${word}</td><td>${py}</td><td class="a">${hide ? '' : esc(q.ans)}</td><td class="c">${n}</td><td class="c">${rv ? '已複習' : '未複習'}</td></tr>`; }).join('');
    document.getElementById('psheet')?.remove();
    const el = document.createElement('div'); el.id = 'psheet';
    el.innerHTML = `<h2>客語字音字形・錯題本${hide ? '（自我測驗）' : ''}</h2><p>${now.toLocaleDateString('zh-TW')}　共 ${rows.length} 題${hide ? '　請在「答案」欄寫下答案，再對照原本的錯題本' : ''}</p>
      <table><thead><tr><th>#</th><th>題型</th><th>${hide ? '題目' : '詞'}</th><th>拼音</th><th>答案</th><th>錯次</th><th>狀態</th></tr></thead><tbody>${tr}</tbody></table>`;
    document.body.appendChild(el);
    const done = () => { el.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); $('#xm').textContent = '此環境無法開啟列印，請改用 CSV／TSV 匯出。'; }
  };
  $('#xs').onchange = updSel;
  document.querySelector('.xbox').onclick = e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const rows = xRows(), x = b.dataset.x, d = new Date().toISOString().slice(0, 10); if (!rows.length) return;
    try {
      if (x === 'print') { printList(rows); return; }
      saveFile(`hakka-quiz-wrong-${d}.${x}`, x === 'csv' ? toCsv(rows) : toTsv(rows), x === 'csv' ? 'text/csv;charset=utf-8' : 'text/tab-separated-values;charset=utf-8');
      $('#xm').textContent = `已開始下載 ${x.toUpperCase()}（${rows.length} 題）。若沒有出現檔案，可能是此環境擋下載。`;
    } catch (err) { $('#xm').textContent = '此環境無法下載檔案。'; } };
  $('#ex').onclick = () => {   // 只下載檔案，不產生備份碼
    try { const u = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' })), a = document.createElement('a');
      a.href = u; a.download = `hakka-quiz-records-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 3000); $('#bm').textContent = '已開始下載備份檔。若沒有出現檔案（部分環境會擋下載），請改用「複製備份碼」。';
    } catch (e) { $('#bm').textContent = '此環境無法下載檔案，請改用「複製備份碼」。'; } };
  $('#cp').onclick = async () => {   // 只複製備份碼，不下載檔案
    const t = exportData();
    try { await navigator.clipboard.writeText(t); $('#bm').textContent = '已複製備份碼，到新裝置按「貼上備份碼…」匯入。'; }
    catch (e) { $('#pz').hidden = false; $('#imrow').hidden = true; const b = $('#bk'); b.value = t; b.select(); $('#bm').textContent = '無法自動複製，已選取全部文字，請手動複製。'; } };
  $('#pa').onclick = () => { $('#pz').hidden = false; $('#imrow').hidden = false; $('#bk').value = ''; $('#bk').focus(); };
  const run = t => { try { const r = importData(t, $('#imm').value); viewLog(`匯入完成：紀錄 ${r.log} 筆、錯題 ${r.wrong} 題、已答對 ${r.done} 題。`); } catch (e) { $('#bm').textContent = '匯入失敗：' + e.message; } };
  $('#im').onclick = () => run($('#bk').value);
  $('#imf').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { e.target.value = ''; run(rd.result); }; rd.onerror = () => { e.target.value = ''; $('#bm').textContent = '匯入失敗：無法讀取這個檔案'; }; rd.readAsText(f); };
  $('#cd').onclick = async () => { const n = Object.keys(store.get('hk_done', {})).length; if (!n || !(await askDlg(`確定清除已答對記錄（共 ${n} 題）？之後自動出題將不再略過這些題目。`, '清除', '取消'))) return; store.set('hk_done', {}); viewLog(); };
  $('#cw').onclick = async () => { if (!W.length || !(await askDlg(`確定清空錯題本（共 ${W.length} 題）？此動作無法復原。`, '清空', '取消'))) return; store.set('hk_wrong', {}); WSEL.clear(); WPG = 1; viewLog(); };
}
/* ===== 佈景：自動（跟隨系統）→ 淺色 → 深色，循環切換，記住選擇 ===== */
const THEMES = [['auto', '◐', '自動'], ['light', '☀', '淺色'], ['dark', '☾', '深色']];
function applyTheme(t) {
  const r = document.documentElement, b = $('#theme'), cur = THEMES.find(x => x[0] === t) || THEMES[0], nxt = THEMES[(THEMES.indexOf(cur) + 1) % 3];
  cur[0] === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', cur[0]);
  if (b) { b.innerHTML = `<span aria-hidden="true">${cur[1]}</span>${cur[2]}`; b.title = `目前：${cur[2]}（點一下切換成${nxt[2]}）`; b.setAttribute('aria-label', b.title); }
}
applyTheme(store.get('hk_theme', 'auto'));
$('#theme').addEventListener('click', () => { const i = THEMES.findIndex(x => x[0] === store.get('hk_theme', 'auto')), t = THEMES[(i + 1) % 3][0]; store.set('hk_theme', t); applyTheme(t); });

/* 一次性遷移（v4）：舊版錯題本存的是完整題目物件，改存精簡格式 */
if (!store.get('hk_v5', false)) { const c = store.get('hk_cols', {}) || {}; delete c.lex; store.set('hk_cols', c); store.set('hk_v5', true); }
if (!store.get('hk_v6', false)) { const c = store.get('hk_cols', {}) || {}; ['hist', 'pw', 'nw'].forEach(k => delete c[k]); store.set('hk_cols', c); store.set('hk_v6', true); }   // 新增「錯題本」欄，欄位位置改變
if (!store.get('hk_v4', false)) { store.set('hk_wrong', packAll(wrongRaw())); store.set('hk_v4', true); }
viewSetup();
