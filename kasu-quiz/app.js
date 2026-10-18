'use strict';
/* ===== 工具 ===== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TONES = 'ˊˇˋˆ', rTone = /[ˊˇˋˆ]+$/;
const rnd = a => a[Math.random() * a.length | 0];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = p => (p * 100).toFixed(1) + '%';
let STORE_OK = (() => { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; } })();
const MEM = {};   // 無法使用 localStorage 時的暫存（關閉分頁就消失）
const store = {
  get(k, d) { try { return STORE_OK ? (JSON.parse(localStorage.getItem(k)) ?? d) : (MEM[k] ?? d); } catch (e) { return d; } },
  set(k, v) { if (STORE_OK) { try { localStorage.setItem(k, JSON.stringify(v)); return; } catch (e) { STORE_OK = false; } } MEM[k] = JSON.parse(JSON.stringify(v)); }
};
const storeWarn = () => STORE_OK ? '' : '<div class="card ng"><b>這個環境無法永久儲存紀錄</b><br>瀏覽器封鎖了儲存空間（常見於直接開啟本機檔案）。紀錄只會在這個分頁開著時保留，請在關閉前按「下載備份檔」或「複製備份碼」。若想自動保存，請改用本機網頁伺服器或放到網站空間開啟。</div>';
// 依機率加權、不重複抽樣 (Efraimidis-Spirakis)
const wsample = (items, w, n) => items.map(it => [Math.pow(Math.random(), 1 / Math.max(w(it), 1e-6)), it])
  .sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
const norm = s => String(s || '').trim().replace(/\s+/g, '').replace(/[´']/g, 'ˊ').replace(/\^/g, 'ˆ').replace(/`/g, 'ˋ').toLowerCase();
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
const finalize = out => shuffle(out).sort((a, b) => (a.type === '音') - (b.type === '音')); // 先字形、後字音

/* ===== 已答對的題目：自動出題時優先略過 ===== */
const qk = q => q.type + '|' + q.word + '|' + q.ch;
let DONE = new Set();
const isDone = q => DONE.has(qk(q));
const take = (L, k) => [...shuffle(L.filter(q => !isDone(q))), ...shuffle(L.filter(isDone))].slice(0, k); // 新題優先，不足才補舊題

/* ===== 自動產生 115 預測題：高頻 / 換字 / 新詞 ===== */
function genPredict(n, [a, b, c], ts) {
  const tot = a + b + c || 1, nA = Math.round(n * a / tot), nB = Math.round(n * b / tot), nC = Math.max(0, n - nA - nB);
  const used = new Set(), out = [];
  const A = take(wsample(DB.pw, r => r[4], nA * 3).map(r =>
    mk(r[1], r[2], Array.from(r[1]).indexOf(r[3]), pickType(ts), { src: '預測高頻', prob: r[4], years: r[6] })), nA);
  A.forEach(q => used.add(q.word)); out.push(...A);
  const B = take(wsample(DB.pw.filter(r => !used.has(r[1]) && Array.from(r[1]).length > 1), r => r[4], nB * 3).map(r => {
    const L = Array.from(r[1]), o = L.indexOf(r[3]);
    return mk(r[1], r[2], rnd(L.map((_, i) => i).filter(i => i !== o)), pickType(ts), { src: '換字變化', prob: r[4], years: r[6] }); }), nB);
  out.push(...B);
  out.push(...take(wsample(DB.nw, r => r[5], nC * 3).map(r =>
    mk(r[1], r[2], Array.from(r[1]).indexOf(r[3]), pickType(ts), { src: '詞庫新詞候補', prob: r[5], years: '未考過', snd: r[4] })), nC));
  return finalize(out);
}
function genHist(y, n, ts) {
  return finalize(take(shuffle(DB.hist.filter(r => y === '全部' || r[0] == y)).slice(0, n * 3).map(r => {
    const c = Array.from(r[3]); let i = r[2] - 1; if (c[i] !== r[5]) i = c.indexOf(r[5]);
    return mk(r[3], r[4], i, pickType(ts), { src: r[0] + ' 年歷屆', years: String(r[0]), snd: r[6] }); }), n));
}
function genSim(k, n, ts) {
  const L = DB.sim[k].filter(r => ts === '混合' || r[1] === ts);
  const keep = new Set(shuffle(L.map((_, i) => i)).slice(0, n));
  return L.filter((_, i) => keep.has(i)).map(r => ({ type: r[1], stem: r[2], py: r[3], ans: r[1] === '形' ? r[4] : r[5], ch: r[4], snd: r[5],
    word: r[9], full: r[10], src: r[6], years: r[7], prob: r[8] }));
}
const genWrong = (n, ts) => shuffle(Object.values(store.get('hk_wrong', {})).filter(q => ts === '混合' || q.type === ts)).slice(0, n).map(q => ({ ...q, opts: null, lets: null }));

/* ===== 選擇題選項：字形用同音字、字音用其他聲調 ===== */
let HX;
function hx() {
  if (HX) return HX;
  const ex = new Map(), bs = new Map(), all = new Set(), put = (m, k, c) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
  const add = (c, s) => { if (!s || c.length > 2 || /[\uE000-\uF8FF\u{F0000}-\u{10FFFF}]/u.test(c)) return; put(ex, s, c); put(bs, s.replace(rTone, ''), c); all.add(c); };
  DB.hist.forEach(r => add(r[5], r[6]));
  DB.lex.forEach(([w, p]) => { const c = Array.from(w), t = p.split(/\s+/); if (c.length === t.length) c.forEach((x, i) => add(x, t[i])); });
  return HX = { ex, bs, all: [...all] };
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
    const base = q.snd.replace(rTone, ''), v = ['', ...TONES].map(t => base + t).filter(s => s !== q.snd);
    const known = v.filter(s => H.ex.has(s)), rest = v.filter(s => !H.ex.has(s));
    d = [...shuffle(known), ...shuffle(rest)].slice(0, 3);
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
});

/* ===== 測驗：設定 ===== */
let Q = null;
function viewSetup() {
  Q = null;
  const yrs = [...new Set(DB.hist.map(r => r[0]))].sort((a, b) => b - a), wn = Object.keys(store.get('hk_wrong', {})).length;
  $('#quiz').innerHTML = storeWarn() + `<div class="card"><h2 style="margin-top:0">開始測驗</h2><div class="row">
    <label>題目來源<select id="mode"><option value="p">115 年預測題（自動產生）</option><option value="s1">預製模擬卷 1</option>
      <option value="s2">預製模擬卷 2</option><option value="s3">預製模擬卷 3</option><option value="h">歷屆試題（96–114）</option>
      <option value="w">錯題本複習（${wn} 題）</option></select></label>
    <label class="m-h" hidden>年度<select id="yr"><option>全部</option>${yrs.map(y => `<option>${y}</option>`).join('')}</select></label>
    <label>題數<input type="number" id="n" value="50" min="5" max="200"></label>
    <label>題型<select id="ts"><option>混合</option><option value="形">只考字形</option><option value="音">只考字音</option></select></label>
    <label>作答方式<select id="am"><option value="c">選擇題</option><option value="t">輸入答案</option><option value="l">拼字組合（字音題；字形題用選擇）</option></select></label>
    <label class="m-ph" style="flex-direction:row;align-items:center;gap:8px;color:var(--tx)"><input type="checkbox" id="skip" checked style="width:20px;height:20px">略過已答對的題目（累計 ${Object.keys(store.get('hk_done', {})).length} 題）</label>
    <label style="flex-direction:row;align-items:center;gap:8px;color:var(--tx)"><input type="checkbox" id="inst" ${store.get('hk_inst', false) ? 'checked' : ''} style="width:20px;height:20px">作答後立即顯示對錯（答錯會顯示正確答案）</label></div>
    <div class="row m-p" style="margin-top:12px"><label>預測高頻 %<input type="number" id="ma" value="35"></label>
    <label>換字變化 %<input type="number" id="mb" value="15"></label><label>新詞候補 %<input type="number" id="mc" value="50"></label></div>
    <p class="muted">預測題依「115預測」工作表的機率加權抽題，每次按開始都會重新產生；字音題需輸入聲調符號 ˊ ˇ ˋ ˆ（作答區有按鈕）。</p>
    <button class="btn" id="go">開始作答</button></div>`;
  const sync = () => { const v = $('#mode').value; document.querySelectorAll('.m-p').forEach(x => x.hidden = v !== 'p'); document.querySelectorAll('.m-ph').forEach(x => x.hidden = !'ph'.includes(v)); document.querySelectorAll('.m-h').forEach(x => x.hidden = v !== 'h'); };
  $('#mode').onchange = sync; sync();
  $('#go').onclick = () => startQuiz({ mode: $('#mode').value, yr: $('#yr').value, n: +$('#n').value || 50, ts: $('#ts').value, am: $('#am').value, instant: store.set('hk_inst', $('#inst').checked) ?? $('#inst').checked, skip: $('#skip').checked && 'ph'.includes($('#mode').value),
    mix: [+$('#ma').value || 0, +$('#mb').value || 0, +$('#mc').value || 0] });
}
function startQuiz(cfg) {
  const { mode, n, ts } = cfg;
  DONE = cfg.skip ? new Set(Object.keys(store.get('hk_done', {}))) : new Set();
  const qs = mode === 'p' ? genPredict(n, cfg.mix, ts) : mode === 'h' ? genHist(cfg.yr, n, ts) : mode === 'w' ? genWrong(n, ts) : genSim(mode[1], n, ts);
  if (!qs.length) return alert('沒有符合條件的題目（錯題本可能是空的）。');
  Q = { chk: qs.map(() => false), lt: qs.map(() => []), rep: cfg.skip ? qs.filter(isDone).length : 0, cfg, qs, ans: Array(qs.length).fill(''), i: 0, t0: Date.now(), done: false };
  Q.tm = setInterval(() => { const c = $('#clk'); if (c) c.textContent = '⏱ ' + fmt((Date.now() - Q.t0) / 1000); }, 1000);
  viewQ();
}
const fmt = s => (s / 60 | 0) + ':' + String(s % 60 | 0).padStart(2, '0');

/* ===== 測驗：作答 ===== */
function viewQ() {
  const { qs, i, ans } = Q, q = qs[i], last = i === qs.length - 1, cnt = ans.filter(Boolean).length;
  const ins = Q.cfg.instant, lock = ins && Q.chk[i], right = lock && isOk(q, ans[i]);
  const nav = qs.map((_, k) => `<button data-k="${k}" class="${k === i ? 'cur ' : ''}${ins && Q.chk[k] ? (isOk(qs[k], ans[k]) ? 'ok' : 'ng') : ans[k] ? 'done' : ''}">${k + 1}</button>`).join('');
  const am = Q.cfg.am === 'l' ? (q.type === '音' ? 'l' : 'c') : Q.cfg.am;   // 拼字組合只用在字音題
  const input = am === 'c'
    ? `<div class="opts">${options(q).map(o => `<button class="opt ${lock ? (o === q.ans ? 'right' : ans[i] === o ? 'wrong' : '') : ans[i] === o ? 'sel' : ''}" data-v="${esc(o)}" ${lock ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>`
    : am === 'l' ? letterUI(q, i, lock)
    : `<input class="ans" id="ai" value="${esc(ans[i])}" ${lock ? 'readonly' : ''} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${q.type === '形' ? '輸入漢字' : '輸入拼音，如 ziaˊ'}">
       ${q.type === '音' ? `<div class="tones">${[...TONES].map(t => `<button data-t="${t}" ${lock ? 'disabled' : ''}>${t}</button>`).join('')}</div>` : ''}`;
  $('#quiz').innerHTML = `<div class="card"><div class="muted">第 ${i + 1} / ${qs.length} 題　<span class="tag">${q.type === '形' ? '字形' : '字音'}</span><span id="clk"></span></div>
    <div class="bar"><i style="width:${cnt / qs.length * 100}%"></i></div>
    ${Q.rep ? `<div class="muted">未答對過的題目不足，已補入 ${Q.rep} 題曾答對的題目。</div>` : ''}
    <div class="muted">${q.type === '形' ? '請寫出 □ 的漢字' : '請寫出【】字的拼音（含聲調）'}</div>
    <div class="stem">${esc(q.stem)}</div><div class="py">${esc(q.py)}</div>${input}
    ${lock ? `<div class="fb ${right ? 'ok' : 'ng'}">${right ? '✔ 答對了' : '✘ 答錯了　正確答案：<b>' + esc(q.ans) + '</b>'}<br><span class="muted">${esc(q.word)}（${esc(q.full)}）</span></div>` : ''}
    <div class="row actions"><button class="btn ghost" id="pv" ${i ? '' : 'disabled'}>上一題</button><button class="btn ghost" id="clr" ${ans[i] && !lock ? '' : 'disabled'}>清除作答</button>
    ${ins && am !== 'c' && !lock ? `<button class="btn" id="chk" ${ans[i] ? '' : 'disabled'}>檢查答案</button>` : ''}
    <button class="btn" id="nx">${last ? '交卷' : '下一題'}</button></div></div>
    <div class="card"><div class="muted">題號（已作答 ${cnt} 題${ins ? `；已檢查答對 ${qs.filter((x, k) => Q.chk[k] && isOk(x, ans[k])).length} / ${Q.chk.filter(Boolean).length} 題` : ''}）</div><div class="grid">${nav}</div><button class="btn ghost" id="sub">提前交卷</button></div>`;
  const ai = $('#ai'); if (ai) { ai.focus(); ai.oninput = () => { Q.ans[Q.i] = ai.value; $('#clr').disabled = !ai.value; const c = $('#chk'); if (c) c.disabled = !ai.value; };
    ai.onkeydown = e => e.key === 'Enter' && $(ins && !lock ? '#chk' : '#nx').click(); }
}
document.addEventListener('click', e => {
  if (!Q || Q.done || !e.target.closest('#quiz')) return;
  const b = e.target.closest('button'); if (!b) return;
  const ins = Q.cfg.instant, lock = ins && Q.chk[Q.i];
  if (lock && (b.dataset.v !== undefined || b.dataset.l !== undefined || b.dataset.lb || b.dataset.t || b.id === 'clr')) return;   // 已檢查的題目不能再改
  if (b.dataset.v !== undefined) { Q.ans[Q.i] = ins ? b.dataset.v : (Q.ans[Q.i] === b.dataset.v ? '' : b.dataset.v); if (ins) Q.chk[Q.i] = true; viewQ(); }   // 立即模式：點選即檢查；一般模式：再點一次＝取消作答
  else if (b.id === 'chk') { Q.chk[Q.i] = true; viewQ(); }
  else if (b.dataset.l !== undefined) { Q.lt[Q.i].push(+b.dataset.l); setLetters(); viewQ(); }
  else if (b.dataset.lb) { Q.lt[Q.i].pop(); setLetters(); viewQ(); }
  else if (b.id === 'clr') { Q.ans[Q.i] = ''; Q.lt[Q.i] = []; viewQ(); }
  else if (b.dataset.k) { Q.i = +b.dataset.k; viewQ(); }
  else if (b.dataset.t) { const a = $('#ai'); a.setRangeText(b.dataset.t, a.selectionStart, a.selectionEnd, 'end'); a.focus(); Q.ans[Q.i] = a.value; }
  else if (b.id === 'pv') { Q.i--; viewQ(); }
  else if (b.id === 'nx') { Q.i < Q.qs.length - 1 ? (Q.i++, viewQ()) : submit(); }
  else if (b.id === 'sub') submit();
});
/* 拼字組合：把答案拆成字母（含聲調符號）亂數排列，依序點選拼出 */
function letterUI(q, i, lock) {
  if (!q.lets) { let t, n = 0; do { t = shuffle(Array.from(q.ans)); } while (t.length > 1 && t.join('') === q.ans && ++n < 10); q.lets = t; }
  const ch = Q.lt[i], used = new Set(ch);
  return `<div class="built">${ch.length ? esc(ch.map(k => q.lets[k]).join('')) : '<span class="muted">點下方字母，依序拼出讀音</span>'}</div>
    <div class="letters">${q.lets.map((c, k) => `<button class="lt" data-l="${k}" ${used.has(k) || lock ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
    <button class="btn ghost" data-lb="1" ${ch.length && !lock ? '' : 'disabled'}>退一格</button>`;
}
const setLetters = () => { const q = Q.qs[Q.i]; Q.ans[Q.i] = Q.lt[Q.i].map(k => q.lets[k]).join(''); };
function submit() {
  const blank = Q.ans.filter(a => !a).length;
  if (blank && !confirm(`還有 ${blank} 題未作答，確定交卷？`)) return;
  clearInterval(Q.tm); Q.done = true; Q.sec = Math.round((Date.now() - Q.t0) / 1000);
  Q.res = Q.qs.map((q, k) => isOk(q, Q.ans[k]));
  const W = store.get('hk_wrong', {}), D = store.get('hk_done', {});
  Q.qs.forEach((q, k) => { const key = qk(q);
    if (!Q.ans[k]) return;                                   // 未作答：不進錯題本，也不算答對
    if (Q.res[k]) { D[key] = 1; if (Q.cfg.mode === 'w') delete W[key]; }
    else { W[key] = { ...q, opts: null, lets: null }; delete D[key]; } });
  store.set('hk_wrong', W); store.set('hk_done', D);
  const L = store.get('hk_log', []); L.unshift({ t: new Date().toLocaleString('zh-TW'), mode: modeName(Q.cfg), n: Q.qs.length, s: Q.res.filter(Boolean).length, sec: Q.sec });
  store.set('hk_log', L.slice(0, 100));
  viewResult(false);
}
const modeName = c => ({ p: '115 預測題', h: '歷屆 ' + c.yr, w: '錯題本' }[c.mode] || '模擬卷 ' + c.mode[1]);

/* ===== 測驗：結果 ===== */
function viewResult(onlyWrong) {
  const { qs, ans, res } = Q, s = res.filter(Boolean).length, by = t => { const k = qs.map((q, i) => i).filter(i => qs[i].type === t); return k.length ? `${k.filter(i => res[i]).length}/${k.length}` : '—'; };
  $('#quiz').innerHTML = `<div class="card"><div class="score">${s} <small style="font-size:1rem">/ ${qs.length} 分（${Math.round(s / qs.length * 100)}%）</small></div>
    <p class="muted">${esc(modeName(Q.cfg))}　用時 ${fmt(Q.sec)}　字形 ${by('形')}　字音 ${by('音')}</p>
    <div class="row"><button class="btn" id="again">同設定再產生一份</button><button class="btn ghost" id="back">回設定</button>
    <button class="btn ghost" id="flt">${onlyWrong ? '顯示全部' : '只看錯題'}</button></div>
    <p class="muted">未作答的題目不會加入錯題本。</p></div>
    <div class="card">${qs.map((q, k) => (onlyWrong && res[k]) ? '' : `<div class="rv"><span class="tag ${res[k] ? 'ok' : 'ng'}">${res[k] ? '答對' : ans[k] ? '答錯' : '未答'}</span>
      <b>${k + 1}.</b> <span style="font-size:1.2rem">${esc(q.stem)}</span> <span class="muted">${esc(q.py)}</span><br>
      <span class="muted">你的答案：${esc(ans[k] || '（未答）')}　正確答案：<b style="color:var(--ok)">${esc(q.ans)}</b>　完整：${esc(q.word)}（${esc(q.full)}）
      <br><span class="tag">${esc(q.src)}</span>${q.prob ? `<span class="tag">預測 ${pct(q.prob)}</span>` : ''}<span class="tag">歷屆：${esc(q.years || '—')}</span></span></div>`).join('')}</div>`;
  $('#again').onclick = () => startQuiz(Q.cfg); $('#back').onclick = viewSetup; $('#flt').onclick = () => viewResult(!onlyWrong);
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
const hl = (w, i) => Array.from(w).map((c, k) => k === i ? `<mark>${esc(c)}</mark>` : esc(c)).join('');
const chips = ws => ({ w: 1, h: ws.map(w => `<span class="wc"><b>${esc(w)}</b> <i>${esc(lexIndex().WP.get(w) || '')}</i></span>`).join('') });
// 某字的學習詞：歷屆相關詞 + 詞庫補足（最多 8 個，短詞優先），每個詞附完整拼音
function charWords(ch, rel) {
  const ws = (rel || '').split('、').filter(Boolean);
  const extra = [...new Set(lexIndex().byCh.get(ch) || [])].filter(w => w.length > 1 && !ws.includes(w)).sort((a, b) => a.length - b.length).slice(0, Math.max(0, 8 - ws.length));
  return chips([...ws, ...extra]);
}
const big = c => ({ h: `<span class="big">${esc(c)}</span>` });
const letter = s => /^[a-z]/i.test(s) ? s[0].toUpperCase() : '其他';
const band3 = (r, a, b, t) => r <= a ? 'A 先背 1–' + a : r <= b ? 'B 次之 ' + (a + 1) + '–' + b : 'C 補充 ' + (b + 1) + '–' + t;
const wlen = w => { const n = Array.from(w).length; return n >= 5 ? '5 字以上' : n + ' 字詞'; };
const gi = (w, ch) => Array.from(w).indexOf(ch);

/* ===== 資料來源定義：rules＝瀏覽規則（把全部資料分成不重疊的類別，合計＝全部） ===== */
let PS, DS;
const predSrc = () => PS ||= (() => {
  const rel = new Map(DB.bz.map(r => [r[1], r[4]]));
  const readRules = i => ({ name: '依讀音首字母（A–Z）', cat: r => letter(r[i]), sort: (a, b) => a[i].localeCompare(b[i]) || a[0] - b[0] });
  return {
    pc: { name: '115 預測・答案字（300）', head: ['排名', '字', '讀音', '相關詞（漢字＋拼音）', '機率'], get: () => DB.pc,
      cells: r => [r[0], big(r[1]), r[4], charWords(r[1], rel.get(r[1]) || r[3]), pct(r[2])],
      rules: [{ name: '依排名分級', cat: r => band3(r[0], 50, 150, 300) }, readRules(4)] },
    pw: { name: '115 預測・詞彙（300）', head: ['排名', '詞', '完整拼音', '考的字音', '機率'], get: () => DB.pw,
      cells: r => { const i = gi(r[1], r[3]); return [r[0], { h: hl(r[1], i) }, r[2], r[2].split(' ')[i] || '', pct(r[4])]; },
      rules: [{ name: '依排名分級', cat: r => band3(r[0], 50, 150, 300) }, { name: '依詞長', cat: r => wlen(r[1]) }] },
    nw: { name: '115 新詞候補（500）', head: ['排名', '詞', '完整拼音', '考的字音', '機率'], get: () => DB.nw,
      cells: r => [r[0], { h: hl(r[1], gi(r[1], r[3])) }, r[2], r[4], pct(r[5])],
      rules: [{ name: '依排名分級', cat: r => band3(r[0], 100, 300, 500) }, { name: '依詞長', cat: r => wlen(r[1]) }] },
    bz: { name: '背誦清單・全部答案字（1,707）', head: ['排名', '字', '讀音', '相關詞（漢字＋拼音）', '機率'], get: () => DB.bz,
      cells: r => [r[0], big(r[1]), r[3], charWords(r[1], r[4]), pct(r[2])],
      rules: [{ name: '依排名每 100 名', cat: r => { const s = (r[0] - 1) / 100 | 0; return `${s * 100 + 1}–${Math.min(s * 100 + 100, DB.bz.length)} 名`; } }, readRules(3)] }
  };
})();
const dbSrc = () => DS ||= {
  hist: { name: `歷屆題庫（${DB.hist.length} 題）`, head: ['年度', '序號', '詞', '拼音', '答案字', '答案音'], get: () => DB.hist,
    cells: r => { const c = Array.from(r[3]); let i = r[2] - 1; if (c[i] !== r[5]) i = c.indexOf(r[5]); return [r[0], r[1], { h: hl(r[3], i) }, r[4], big(r[5]), r[6]]; },
    rules: [{ name: '依年度', cat: r => r[0] + ' 年', sort: (a, b) => a[0] - b[0] || a[1] - b[1] },
      { name: '依答案音首字母（A–Z）', cat: r => letter(r[6]), sort: (a, b) => a[6].localeCompare(b[6]) || a[0] - b[0] || a[1] - b[1] },
      { name: '依詞長', cat: r => wlen(r[3]), sort: (a, b) => a[0] - b[0] || a[1] - b[1] }] },
  lex: { name: `詞庫（${DB.lex.length} 詞）`, head: ['詞', '拼音', '歷屆'], get: () => DB.lex,
    cells: r => [r[0], r[1], lexIndex().tested.has(r[0]) ? '✓ 考過' : ''],
    rules: [{ name: '依拼音首字母（A–Z）', cat: r => letter(r[1]) }, { name: '依詞長', cat: r => wlen(r[0]) },
      { name: '依歷屆是否考過', cat: r => lexIndex().tested.has(r[0]) ? '歷屆考過' : '歷屆未考過' }] }
};

/* ===== 通用：瀏覽（分類＋分頁）＋搜尋 ===== */
const plain = c => typeof c === 'object' ? c.h.replace(/<[^>]*>/g, '') : String(c);
const cellHtml = c => typeof c === 'object' ? `<td${c.w ? ' class="w"' : ''}>${c.h}</td>` : `<td>${esc(c)}</td>`;
function browse(el, src, st) {
  const keys = Object.keys(src); st.k ||= keys[0]; st.ri ??= 0; st.cat ??= '全部'; st.q ??= ''; st.pg ??= 1; st.sz ??= 50;
  const S = () => { const s = src[st.k]; if (!s.rows) { s.rows = s.get(); s.cell = s.rows.map(s.cells); s.idx = s.cell.map(c => c.map(plain).join(' ').toLowerCase()); } return s; };
  el.innerHTML = `<div class="card"><div class="row"><label>資料表<select id="bs">${keys.map(k => `<option value="${k}" ${k === st.k ? 'selected' : ''}>${src[k].name}</option>`).join('')}</select></label>
    <label>瀏覽方式<select id="br"></select></label>
    <label>每頁<select id="bz">${[20, 50, 100].map(n => `<option ${n === st.sz ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>搜尋（字、詞、拼音）<input id="bq" value="${esc(st.q)}" placeholder="例如：殮、liam"></label></div>
    <div class="chips" id="bc"></div><div id="bp1"></div><div class="tbl" id="bt"></div><div id="bp2"></div></div>`;
  const fillRules = () => $('#br', el).innerHTML = src[st.k].rules.map((r, i) => `<option value="${i}" ${i === st.ri ? 'selected' : ''}>${r.name}</option>`).join('');
  const draw = () => {
    const s = S(), rule = s.rules[st.ri] || s.rules[0], q = st.q.trim().toLowerCase();
    rule.lab ||= s.rows.map(rule.cat);
    const ids = []; for (let i = 0; i < s.rows.length; i++) if (!q || s.idx[i].includes(q)) ids.push(i);
    const cnt = new Map(); ids.forEach(i => cnt.set(rule.lab[i], (cnt.get(rule.lab[i]) || 0) + 1));
    const labs = [...cnt.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
    if (st.cat !== '全部' && !cnt.has(st.cat)) st.cat = '全部';
    let sel = st.cat === '全部' ? ids : ids.filter(i => rule.lab[i] === st.cat);
    if (rule.sort) sel = sel.sort((a, b) => rule.sort(s.rows[a], s.rows[b]));
    const pages = Math.max(1, Math.ceil(sel.length / st.sz)); st.pg = Math.min(Math.max(1, st.pg), pages);
    $('#bc', el).innerHTML = [['全部', ids.length], ...labs.map(l => [l, cnt.get(l)])].map(([l, n]) =>
      `<button class="chip ${l === st.cat ? 'on' : ''}" data-c="${esc(l)}">${esc(l)}（${n}）</button>`).join('');
    const pg = `<div class="pager"><button data-p="1" ${st.pg <= 1 ? 'disabled' : ''}>«</button><button data-p="${st.pg - 1}" ${st.pg <= 1 ? 'disabled' : ''}>‹</button>
      <span>第 <input type="number" class="pn" min="1" max="${pages}" value="${st.pg}"> / ${pages} 頁</span>
      <button data-p="${st.pg + 1}" ${st.pg >= pages ? 'disabled' : ''}>›</button><button data-p="${pages}" ${st.pg >= pages ? 'disabled' : ''}>»</button>
      <span class="muted">共 ${sel.length} 筆</span></div>`;
    $('#bp1', el).innerHTML = $('#bp2', el).innerHTML = pg;
    const from = (st.pg - 1) * st.sz;
    $('#bt', el).innerHTML = sel.length ? `<table><tr>${s.head.map(h => `<th>${h}</th>`).join('')}</tr>${sel.slice(from, from + st.sz).map(i => `<tr>${s.cell[i].map(cellHtml).join('')}</tr>`).join('')}</table>` : '<p class="muted">沒有符合的資料</p>';
  };
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.c !== undefined) { st.cat = b.dataset.c; st.pg = 1; draw(); }
    else if (b.dataset.p) { st.pg = +b.dataset.p; draw(); if (b.closest('#bp2')) el.scrollIntoView(); } };
  el.onchange = e => { const t = e.target;
    if (t.id === 'bs') { st.k = t.value; st.ri = 0; st.cat = '全部'; st.pg = 1; fillRules(); draw(); }
    else if (t.id === 'br') { st.ri = +t.value; st.cat = '全部'; st.pg = 1; draw(); }
    else if (t.id === 'bz') { st.sz = +t.value; st.pg = 1; draw(); }
    else if (t.classList.contains('pn')) { st.pg = +t.value || 1; draw(); } };
  $('#bq', el).oninput = e => { st.q = e.target.value; st.pg = 1; draw(); };
  fillRules(); draw();
}
const PST = {}, DST = {};
function viewPred() { browse($('#pred'), predSrc(), PST); }
function viewDb() { browse($('#db'), dbSrc(), DST); }

/* ===== 備份：匯出／匯入 ===== */
const exportData = () => JSON.stringify({ app: 'hakka-quiz', v: 1, at: new Date().toISOString(),
  log: store.get('hk_log', []), wrong: store.get('hk_wrong', {}), done: store.get('hk_done', {}) });
function importData(txt, mode) {
  let d; try { d = JSON.parse(String(txt).replace(/^\uFEFF/, '').trim()); } catch (e) { throw new Error('內容不是有效的備份（JSON 格式錯誤）'); }
  if (!d || d.app !== 'hakka-quiz' || !Array.isArray(d.log) || typeof d.wrong !== 'object' || typeof d.done !== 'object') throw new Error('這不是本網站的備份檔');
  let L = d.log, W = d.wrong, D = d.done;
  if (mode === 'merge') {
    const L0 = store.get('hk_log', []), seen = new Set(L0.map(x => x.t + x.mode + x.n + x.s));
    L = [...L0, ...d.log.filter(x => !seen.has(x.t + x.mode + x.n + x.s))].slice(0, 100);
    W = { ...d.wrong, ...store.get('hk_wrong', {}) }; D = { ...d.done, ...store.get('hk_done', {}) };
  }
  Object.keys(W).forEach(k => delete D[k]);   // 同一題同時出現在錯題與已答對時，以「錯題」為準
  store.set('hk_log', L); store.set('hk_wrong', W); store.set('hk_done', D);
  return { log: L.length, wrong: Object.keys(W).length, done: Object.keys(D).length };
}

/* ===== 紀錄・錯題本 ===== */
function viewLog(msg = '') {
  const L = store.get('hk_log', []), W = Object.values(store.get('hk_wrong', {})), avg = L.length ? Math.round(L.reduce((a, x) => a + x.s / x.n, 0) / L.length * 100) : 0;
  $('#log').innerHTML = storeWarn() + `<div class="card"><b>作答紀錄</b>　<span class="muted">共 ${L.length} 次，平均 ${avg}%</span>
    <div class="tbl"><table><tr><th>時間</th><th>來源</th><th>得分</th><th>用時</th></tr>${L.slice(0, 30).map(x => `<tr><td>${esc(x.t)}</td><td>${esc(x.mode)}</td><td>${x.s}/${x.n}</td><td>${fmt(x.sec)}</td></tr>`).join('')}</table></div>
    <button class="btn ghost" id="cl">清除紀錄</button></div>
    <div class="card"><b>錯題本</b>　<span class="muted">${W.length} 題（到「測驗」選「錯題本複習」，答對後自動移除）</span>
    <div class="tbl"><table><tr><th>題型</th><th>詞</th><th>拼音</th><th>答案</th></tr>${W.map(q => `<tr><td>${q.type === '形' ? '字形' : '字音'}</td><td>${esc(q.word)}</td><td>${esc(q.full)}</td><td>${esc(q.ans)}</td></tr>`).join('')}</table></div>
    <button class="btn ghost" id="cw">清空錯題本</button></div>
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
  $('#cl').onclick = () => { store.set('hk_log', []); viewLog(); };
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
  $('#cd').onclick = () => { store.set('hk_done', {}); viewLog(); };
  $('#cw').onclick = () => { store.set('hk_wrong', {}); viewLog(); };
}
viewSetup();
