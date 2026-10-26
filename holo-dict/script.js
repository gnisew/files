const myLang =`
台語	台羅	又唸作	台羅無調
`;


function parseMyLang(myLangString) {
    const lines = myLangString.trim().split('\n');
    const langMap = new Map();

    lines.forEach(line => {
        const [main, ...others] = line.split('\t');
        langMap.set(main, others);
    });

    return langMap;
}

const langMap = parseMyLang(myLang);

// 使用修改後的 parseCSV 函數處理 myData
const {
    headers,
    data: dictionary,
    searchTypes
} = parseCSV(myData);
const searchInput = document.getElementById('searchInput');
const resultsContainer = document.getElementById('results');
const searchClear = document.getElementById('searchClear');
const searchHeader = document.getElementById('searchHeader');
const searchButton = document.getElementById('searchButton');

// ======== 例句拆成兩個搜尋範圍：「例句」＝台語漢字＋台羅；「華語例句」＝華語翻譯 ========
// 例句原始格式：[n] 漢字（台羅）華語。各範圍存成「一行一段」，比對時逐行測試，正規式不會跨欄位誤配。
const EX_ZH = '華語例句';
const EX_FIELD = { '例句': '_exTw', [EX_ZH]: '_exZh' };
const isExType = t => Object.prototype.hasOwnProperty.call(EX_FIELD, t);
const fieldOf = t => isExType(t) ? EX_FIELD[t] : t === '釋義' ? '_defTxt' : t;   // 釋義改搜「去掉編號」的版本
function buildExampleIndex() {
  dictionary.forEach(it => {
    const tw = [], zh = [];
    (it['例句'] || '').split('<br>').filter(Boolean).forEach(line => {
      const body = line.replace(/^\[\d+\] /, '');
      const m = body.match(/^([^（]*)（([^）]*)）([\s\S]*)$/);
      if (!m) { tw.push(body); return; }
      tw.push(m[1], m[2].normalize('NFC'));            // 統一成組合字寫法，才比對得到由數字調轉出的 gû thâu
      if (m[3].trim()) zh.push(m[3].trim());
    });
    Object.defineProperty(it, '_exTw', { value: tw.join('\n'), writable: true });   // 不可列舉：不會出現在其他欄位的迴圈裡
    Object.defineProperty(it, '_exZh', { value: zh.join('\n'), writable: true });
  });
  const i = searchTypes.indexOf('例句');
  if (i >= 0 && !searchTypes.includes(EX_ZH)) searchTypes.splice(i + 1, 0, EX_ZH);
}
buildExampleIndex();

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split('\t');
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        const entry = {};
        headers.forEach((header, index) => {
            entry[header] = values[index];
        });
        data.push(entry);
    }

    // 動態生成 searchTypes，排除詔安和詔安拼音本變
    const searchTypes = [...headers.filter(header => !['台羅', '又唸作', '台羅無調', '詞目id'].includes(header))];

    return {
        headers,
        data,
        searchTypes
    };
}


// ======== 延遲載入的附加資料 ========
const COMPARE_TAB = '華語對照';
const NAME_TAB = '姓名';                       // 新增：姓名查詢分頁（放在分頁最後面）
searchTypes.push(NAME_TAB);                    // 新增
const isSpecialTab = t => t === COMPARE_TAB || t === NAME_TAB;   // 新增：不使用一般列表的分頁
const _lazy = {};
function loadScript(src) {
  if (!_lazy[src]) {
    _lazy[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { delete _lazy[src]; reject(new Error('載入失敗：' + src)); };
      document.head.appendChild(el);
    });
  }
  return _lazy[src];
}
const variantIdSet = new Set(typeof myVariantIds !== 'undefined' ? myVariantIds : []);

function stripToneJS(r) {
  return (r || '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').replace(/ⁿ/g, 'nn').toLowerCase();
}
// 詞目後的「【替】」＝替代用字：改顯示成小標籤（資料本身不變，搜尋、複製不受影響）
function hanHtml(t) {
  return escHtml(t == null ? '' : t).replace(/【替】/g, '<span class="tag-sub" title="替代用字">替</span>');
}
function escHtml(t) {
  return String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// 詳細頁的「各地腔調」
function fillVariants(item, host) {
  fillVariantBox(item, host);   // 各地腔調
  fillCompare(item, host);      // 華語詞目（詞彙比較）
}
function fillVariantBox(item, host) {
  const id = item['詞目id'];
  if (!host || !variantIdSet.has(id)) return;
  const box = document.createElement('div');
  box.className = 'variant-box';
  box.innerHTML = '<div class="sec-title">各地腔調</div><div class="variant-loading">載入中⋯</div>';
  host.appendChild(box);
  loadVariants().then(() => {
    if (!host.contains(box)) return;
    const list = (myVariants[id] || []);
    box.innerHTML = '<div class="sec-title">各地腔調</div>' + list.map(([han, vals]) => {
      const cells = myVariantCols.map((c, i) => vals[i] ? `<div class="variant-cell"><span>${escHtml(c)}</span>${escHtml(vals[i])}</div>` : '').join('');
      return `${list.length > 1 ? `<div class="variant-han">${escHtml(han)}</div>` : ''}<div class="variant-grid">${cells}</div>`;
    }).join('');
    if (window._goVariants) {   // 從列表點「腔」進來：內容載入完成後，滾到「各地腔調」
      window._goVariants = false;
      requestAnimationFrame(() => box.scrollIntoView({ block: 'start' }));
    }
  }).catch(() => { box.innerHTML = '<div class="sec-title">各地腔調</div><div class="variant-loading">載入失敗，請稍後再試</div>'; });
}
const loadVariants = () => loadScript('variants.js');
const loadCompare = () => loadScript('compare.js');
const loadArticle = () => loadScript('article.js');   // 新增：換詞頁面（第一次開啟才載入）

// 詳細頁的「華語詞目」：詞彙比較資料沒有詞目id，改以「漢字＋台羅」對到本詞條（又唸、俗唸的台羅也算）
let _cmpIdx = null;
const _cmpNfc = t => (t || '').normalize('NFC').toLowerCase().trim();
const _cmpStrip = t => (t || '').replace(/【[^】]*】/g, '').trim();
function cmpIndex() {
  if (_cmpIdx) return _cmpIdx;
  _cmpIdx = new Map();   // 漢字 → [[華語詞目id, 台羅]]
  myCompare.forEach(g => g[2].forEach(([han, rom]) => {
    const k = _cmpStrip(han);
    if (!_cmpIdx.has(k)) _cmpIdx.set(k, []);
    _cmpIdx.get(k).push([g[0], _cmpNfc(rom)]);
  }));
  return _cmpIdx;
}
function cmpReadings(item) {
  const r = new Set();
  (item['台羅'] || '').split('/').forEach(x => r.add(_cmpNfc(x)));
  ['又唸作', '俗唸作'].forEach(f => (item[f] || '').split('<br>').forEach(p => {
    const m = p.match(/（([^）]*)）/);
    if (m) m[1].split('/').forEach(x => r.add(_cmpNfc(x)));
  }));
  return r;
}
function fillCompare(item, host) {
  if (!host) return;
  const wrap = document.createElement('div');
  wrap.className = 'cmp-wrap';
  host.appendChild(wrap);   // 先佔位（接在各地腔調之後），資料載入後再填入
  loadCompare().then(() => {
    if (!host.contains(wrap) || typeof myCompare === 'undefined') return;
    const han = _cmpStrip(item['台語']), R = cmpReadings(item);
    const ids = new Set((cmpIndex().get(han) || []).filter(([, rom]) => R.has(rom)).map(x => x[0]));
    if (!ids.size) return;
    wrap.innerHTML = myCompare.filter(g => ids.has(g[0])).map(g => {
      // 依「說法（漢字＋台羅）」分組，列出使用它的腔；本詞條自己的說法排最前面
      const byWord = new Map();
      g[2].forEach(([h, rom, qi]) => {   // 資料已依「漢字＋羅馬字」合併；qi 是腔名編號（對應 myCompareCols）
        byWord.set(h + '\u0001' + rom, { h, rom, qs: qi.map(i => myCompareCols[i]), self: _cmpStrip(h) === han && R.has(_cmpNfc(rom)) });
      });
      const rows = [...byWord.values()].sort((x, y) => y.self - x.self).map(w =>
        `<div class="cmp-row${w.self ? ' cmp-self' : ''}"><div class="cmp-word">${escHtml(w.h)}<span class="compare-rom">${escHtml(w.rom)}</span></div><div class="cmp-where">${w.qs.map(escHtml).join('、')}</div></div>`).join('');
      return `<div class="cmp-box"><div class="sec-title">華語詞目：${escHtml(g[1])}</div>${rows}</div>`;
    }).join('');
  }).catch(() => {});
}

// 華語對照：以華語詞為主，列出各腔說法
let _compareToken = 0;
function compareHits(regex) {
  return myCompare.filter(g => regex.test(g[1]) || g[2].some(r => regex.test(r[0]) || regex.test(r[1]) || regex.test(stripToneJS(r[1]))));
}
function updateCompareCount(regex) {
  if (typeof myCompare === 'undefined') return;
  const n = compareHits(regex).length;
  const countEl = document.getElementById('count-' + COMPARE_TAB);
  const btn = document.getElementById('button-' + COMPARE_TAB);
  if (countEl) { countEl.textContent = n.toLocaleString(); countEl.title = n + ' 組'; }
  if (btn) btn.disabled = n === 0 && currentSearchType !== COMPARE_TAB;
}
function performCompareSearch(regex) {
  const token = ++_compareToken;
  searchHeader.classList.add('has-results');
  resultsContainer.classList.add('has-results');
  if (typeof myCompare === 'undefined') {
    resultsContainer.innerHTML = '<div class="no-results">載入華語對照資料⋯</div>';
  }
  loadCompare().then(() => {
    if (token !== _compareToken || currentSearchType !== COMPARE_TAB) return;
    const hits = compareHits(regex);
    updateCompareCount(regex.plain || regex);
    hasSearchResults = hits.length > 0;
    // 華語詞完全相符的排前面
    hits.sort((a, b) => {
      const ea = (a[1].match(regex) || [''])[0].length === a[1].length, eb = (b[1].match(regex) || [''])[0].length === b[1].length;
      return ea === eb ? 0 : ea ? -1 : 1;
    });
    if (!hits.length) { resultsContainer.innerHTML = '<div class="no-results">沒有找到匹配的結果</div>'; return; }
    const LIMIT = 100;
    resultsContainer.innerHTML = hits.slice(0, LIMIT).map(g => {
      const byQiang = new Map();
      g[2].forEach(([han, rom, qi]) => qi.forEach(i => {
        if (!byQiang.has(i)) byQiang.set(i, []);
        byQiang.get(i).push(`${escHtml(han)}<span class="compare-rom">（${escHtml(rom)}）</span>`);
      }));
      const rows = [...byQiang].sort((a, b) => a[0] - b[0]).map(([i, v]) => { const q = myCompareCols[i]; return `<tr><th>${escHtml(q)}</th><td>${v.join('、')}</td></tr>`; }).join('');
      return `<div class="compare-card"><div class="compare-title">${escHtml(g[1])}</div><table class="compare-table">${rows}</table></div>`;
    }).join('') + (hits.length > LIMIT ? `<div class="no-results">共 ${hits.length} 組，只顯示前 ${LIMIT} 組，請縮小查詢範圍</div>` : '');
  }).catch(() => { resultsContainer.innerHTML = '<div class="no-results">資料載入失敗，請稍後再試</div>'; });
}


// ======== 姓名查詢模式 ========
// 輸入「李明哲」→ 拆成「姓：李」＋「名：明、哲」，列出推薦讀音（姓、名各取排第 1 的讀音）與其他讀音。
// 資料來自 name.js（converter.html 由 kautian.ods 的「姓」「名」工作表轉出）：每個字的第 1 個讀音 ＝ 推薦讀音。
const NAME_LIST_MAX = 30;                       // 「其他讀音」最多列幾組（組合太多時只列前面的）
const NAME_HAN = /^[\p{Script=Han}]+$/u;
let _nameParseIdx = 0, _nameRaw = '';           // 目前選的姓氏切分方式（歐陽明：「歐陽｜明」或「歐｜陽明」）

// 取出某字的讀音：[{rom, type}]；資料裡沒有就回傳 null
function nameReadings(map, key) {
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) return null;
  return map[key].map(s => { const [rom, type] = s.split('|'); return { rom: rom.normalize('NFC'), type: type || '' }; });
}
// 把輸入拆成「姓＋名」。可能有兩種切法（複姓／單姓），複姓排前面。失敗回傳 {err}
function parseName(raw) {
  const sur = typeof myNameSurnames !== 'undefined' ? myNameSurnames : null;
  const giv = typeof myNameGiven !== 'undefined' ? myNameGiven : null;
  if (!sur || !giv) return { err: '尚未載入姓名資料（請確認 name.js 與 index.html 放在同一層）' };
  const text = (raw || '').replace(/\s+/g, '');
  const chars = Array.from(text);
  if (chars.length < 2 || chars.length > 5 || !NAME_HAN.test(text)) return { err: '請輸入 2～5 個漢字的姓名，例如：李明哲' };
  const parses = [], missing = new Set(), missingSur = new Set();
  for (const n of [2, 1]) {                     // n＝姓氏字數
    if (chars.length - n < 1) continue;
    const surHan = chars.slice(0, n).join('');
    const surReads = nameReadings(sur, surHan);   // 修改：姓氏只查「姓」資料，不再借用「名」的讀音
    const given = chars.slice(n).map(ch => ({ ch, reads: nameReadings(giv, ch) }));
    const bad = given.filter(g => !g.reads).map(g => g.ch);
    if (!surReads) { if (n === 1) missingSur.add(surHan); continue; }
    if (bad.length) { bad.forEach(c => missing.add(c)); continue; }
    parses.push({ surHan, surReads, given, givenHan: given.map(g => g.ch).join('') });
  }
  if (!parses.length) {
    if (missingSur.size) return { err: '姓氏資料沒有這個字：' + [...missingSur].join('、') };
    return { err: missing.size ? '姓名資料裡查不到：' + [...missing].join('、') : '查不到這個姓名' };
  }
  return { parses };
}
// 依「讀音序號總和」由小到大列出組合（全部都取第 1 個 ＝ 推薦讀音，排第一）；最多 limit 組
function nameCombos(ps, limit) {
  const lens = [ps.surReads.length, ...ps.given.map(g => g.reads.length)];
  const total = lens.reduce((a, b) => a * b, 1);
  const maxSum = lens.reduce((a, l) => a + l - 1, 0);
  const out = [], vec = new Array(lens.length).fill(0);
  const rec = (i, left) => {
    if (out.length >= limit) return;
    if (i === lens.length - 1) { if (left <= lens[i] - 1) { vec[i] = left; out.push(vec.slice()); } return; }
    for (let k = 0; k <= Math.min(left, lens[i] - 1); k++) { vec[i] = k; rec(i + 1, left - k); }
  };
  for (let sum = 0; sum <= maxSum && out.length < limit; sum++) rec(0, sum);
  return { total, combos: out };
}
const nameCap = s => { const a = Array.from(s); return a.length ? a[0].toUpperCase() + a.slice(1).join('') : s; };
// 姓 空一格 名（名的字之間用連字號，第一個字母大寫）：Lí Bîng-tiat
function nameText(ps, vec) {
  return nameCap(ps.surReads[vec[0]].rom) + ' ' + nameCap(ps.given.map((g, i) => g.reads[vec[i + 1]].rom).join('-'));
}
// 分頁上的筆數：第一種切法的讀音組合數（不是姓名就是 0）
function nameCount(raw) {
  const p = parseName(raw);
  return p.err ? 0 : nameCombos(p.parses[0], 1).total;
}
function nameChips(reads) {
  return reads.map((r, i) => `<span class="name-chip${i === 0 ? ' rec' : ''}">${escHtml(r.rom)}${r.type && r.type !== '不標' ? `<small>${escHtml(r.type)}</small>` : ''}</span>`).join('');
}
function renderNameResult(p) {
  const idx = Math.min(_nameParseIdx, p.parses.length - 1), ps = p.parses[idx];
  const { total, combos } = nameCombos(ps, NAME_LIST_MAX);
  const texts = combos.map(v => nameText(ps, v));
  const toggle = p.parses.length > 1
    ? `<div class="name-parse">姓氏切法：${p.parses.map((x, i) => `<button type="button" class="name-parse-btn${i === idx ? ' active' : ''}" data-i="${i}">${escHtml(x.surHan)}｜${escHtml(x.givenHan)}</button>`).join('')}</div>` : '';
  const others = texts.length > 1
    ? `<ol class="name-others">${texts.slice(1).map(t => `<li class="name-copy" role="button" tabindex="0" title="點一下複製">${escHtml(t)}</li>`).join('')}</ol>` +
      (total > texts.length ? `<div class="name-note">共 ${total.toLocaleString()} 種組合，只列出前 ${texts.length} 組；其餘請參考下方「逐字讀音」自行搭配</div>` : '')
    : '<div class="name-note">沒有其他讀音</div>';
  const rows = [`<tr><th>姓<span>${escHtml(ps.surHan)}</span></th><td>${nameChips(ps.surReads)}</td></tr>`]
    .concat(ps.given.map(g => `<tr><th>名<span>${escHtml(g.ch)}</span></th><td>${nameChips(g.reads)}</td></tr>`)).join('');
  resultsContainer.innerHTML = `<div class="name-card">
    <div class="name-head"><span class="name-han"><span class="name-sur">${escHtml(ps.surHan)}</span>${escHtml(ps.givenHan)}</span></div>
    ${toggle}
    <div class="name-sec"><div class="sec-title">推薦讀音</div><div class="name-rec name-copy" role="button" tabindex="0" title="點一下複製">${escHtml(texts[0])}</div></div>
    <div class="name-sec"><div class="sec-title">其他讀音</div>${others}</div>
    <div class="name-sec"><div class="sec-title">逐字讀音</div><table class="name-table">${rows}</table></div>
  </div>`;
}
function performNameSearch() {
  searchHeader.classList.add('has-results');
  resultsContainer.classList.add('has-results');
  filteredData = [];
  const raw = searchInput.value;
  if (raw !== _nameRaw) { _nameRaw = raw; _nameParseIdx = 0; }
  const p = parseName(raw);
  if (p.err) { hasSearchResults = false; resultsContainer.innerHTML = `<div class="no-results">${escHtml(p.err)}</div>`; return; }
  hasSearchResults = true;
  renderNameResult(p);
  addSearchHistory();   // 新增
}
// 新增：點一下「推薦讀音」「其他讀音」的拼音就複製（顯示 1.2 秒「已複製」）
function copyNameText(el) {
  const t = el.textContent.trim();
  const done = () => { el.classList.add('copied'); clearTimeout(el._cpT); el._cpT = setTimeout(() => el.classList.remove('copied'), 1200); };
  const fallback = () => {   // 舊瀏覽器或非 https：改用隱藏的 textarea + execCommand
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { if (document.execCommand('copy')) done(); } catch (e) {}
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
}
resultsContainer.addEventListener('click', e => {
  const el = e.target.closest('.name-copy'); if (el) copyNameText(el);
});
resultsContainer.addEventListener('keydown', e => {   // 鍵盤 Enter／空白鍵也可複製
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest && e.target.closest('.name-copy'); if (!el) return;
  e.preventDefault(); copyNameText(el);
});
resultsContainer.addEventListener('click', e => {   // 切換姓氏切法
  const b = e.target.closest('.name-parse-btn'); if (!b) return;
  _nameParseIdx = parseInt(b.dataset.i, 10) || 0;
  const p = parseName(searchInput.value);
  if (!p.err) renderNameResult(p);
});

// ======== 詳細頁：義項與例句對應 ========
// ======== 例句顯示方式：RUBY（台羅標在漢字上）/ 單行 / 換行；華語用括弧 ========
const _LET = /[\p{L}\p{N}\p{M}]/u;
const _EDGE = /^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu;
// ---- 例句搜尋標示用的小工具 ----
// 取得 re 在 text 中所有（非空）符合的範圍 [起, 迄)
function matchRanges(text, re) {
  const out = [], g = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'g');
  let m;
  while ((m = g.exec(text))) { if (m[0] === '') { g.lastIndex++; continue; } out.push([m.index, m.index + m[0].length]); }
  return out;
}
// 取出落在 [off, off+len) 的範圍，並換成相對於該段文字的位置
function sliceRanges(ranges, off, len) {
  return (ranges || []).map(([a, b]) => [Math.max(a, off) - off, Math.min(b, off + len) - off]).filter(([a, b]) => b > a);
}
// 跳脫文字，並把 ranges 範圍包上 <mark class="hit">
function hlText(text, ranges) {
  if (!ranges || !ranges.length) return escHtml(text);
  let out = '', pos = 0;
  ranges.forEach(([a, b]) => { out += escHtml(text.slice(pos, a)) + `<mark class="hit">${escHtml(text.slice(a, b))}</mark>`; pos = b; });
  return out + escHtml(text.slice(pos));
}
// 台羅切成音節詞，並記錄每個詞（去掉頭尾標點後）在原字串中的起點
function romTokens(rom) {
  const out = [], re = /\S+/g; let m;
  while ((m = re.exec(rom))) {
    const raw = m[0], t = raw.replace(_EDGE, '');
    if (t) out.push({ t, off: m.index + raw.length - raw.replace(/^[^\p{L}\p{N}\p{M}]+/u, '').length });
  }
  return out;
}
// ======== 聲調色彩：依台羅的調符判斷聲調，替台語漢字上色（顏色在 styles.css 的 --tn1 ~ --tn9）========
// 設定值（window.tnOn / tnHead / tnEx / tnSet）由 index.html 的 applyAppearance 設定
const TONE_NAME = { 1: '陰平', 2: '陰上', 3: '陰去', 4: '陰入', 5: '陽平', 6: '陽上', 7: '陽去', 8: '陽入', 9: '高升' };
const _HAN_CHAR = /[\p{Script=Han}\uE000-\uF8FF]/u;   // 漢字（含造字區）；拉丁字母不上色
function toneOf(syl) {   // 台羅音節 → 聲調 1~9
  const d = syl.normalize('NFD');
  if (d.includes('\u030d')) return 8;   // a̍
  if (d.includes('\u030b')) return 9;   // a̋
  if (d.includes('\u0302')) return 5;   // â
  if (d.includes('\u0304')) return 7;   // ā
  if (d.includes('\u0300')) return 3;   // à
  if (d.includes('\u0301')) return 2;   // á
  return /[ptkh]$/i.test(syl.replace(/[^\p{L}]+$/u, '')) ? 4 : 1;   // 無調符：入聲（收 p/t/k/h）為 4，其餘為 1
}
function syllableTones(rom) {   // 台羅 → 每個音節的聲調（依序；連字符「-」連起來的算多個音節）
  const out = [];
  rom.trim().split(/\s+/).forEach(raw => {
    const t = raw.replace(_EDGE, '');
    t.split(/-+/).filter(Boolean).forEach(syl => out.push(toneOf(syl)));
  });
  return out;
}
// scope：'head' 詞目／'ex' 例句。預覽時（_tnPrev）不受總開關影響
function tnActive(scope) { return window._tnPrev ? true : !!(window.tnOn && (scope === 'head' ? window.tnHead : window.tnEx)); }
// 漢字（依 Array.from 順序）→ 聲調陣列（0＝不上色：非漢字／未選的聲調）；字數與音節數對不上時回傳 null
function hanToneMap(han, rom, scope) {
  if (!tnActive(scope) || !window.tnSet || !window.tnSet.size) return null;
  const tones = syllableTones(rom), chars = Array.from(han);
  if (chars.filter(c => _LET.test(c)).length !== tones.length) return null;
  let i = 0;
  return chars.map(c => { if (!_LET.test(c)) return 0; const t = tones[i++]; return t && window.tnSet.has(t) && _HAN_CHAR.test(c) ? t : 0; });
}
function toneSpan(ch, t) { return t ? `<span class="tn tn${t}">${escHtml(ch)}</span>` : escHtml(ch); }
// 一段漢字 → HTML：命中範圍標示（mark）＋依 tones 上色；cp0 為這段文字第一個字在整句中的字序
function hanRich(text, ranges, tones, cp0) {
  if (!tones) return hlText(text, ranges);   // 沒有聲調色彩：維持原本輸出
  let out = '', run = false, pos = 0, k = cp0 || 0;
  for (const ch of text) {
    const hit = ranges && ranges.some(([a, b]) => pos >= a && pos < b);
    if (hit && !run) { out += '<mark class="hit">'; run = true; } else if (!hit && run) { out += '</mark>'; run = false; }
    out += toneSpan(ch, tones[k++]);
    pos += ch.length;
  }
  return run ? out + '</mark>' : out;
}
// 詞目（台語欄）：han＝台語欄、rom＝台羅欄（依「台羅音讀」設定取主／副音讀）；【替】等標記照舊轉成小標籤
function toneHanHtml(han, rom) {
  han = han == null ? '' : han;
  const map = hanToneMap(han.replace(/【[^】]*】/g, ''), romText(rom || '').replace(/^【[^】]*】/, '').split('/')[0], 'head');
  if (!map) return hanHtml(han);
  let k = 0;
  return han.split(/(【[^】]*】)/).map(seg => /^【[^】]*】$/.test(seg) ? hanHtml(seg) : Array.from(seg).map(c => toneSpan(c, map[k++])).join('')).join('');
}
// ======== 音色：台羅拼音的母音（a e i o u，含調符）用同一個顏色標示（顏色在 styles.css 的 --vowel）========
// 設定值（window.vwOn / vwHead / vwEx）由 index.html 的 applyAppearance 設定
function vwActive(scope) { return window._vwPrev ? true : !!(window.vwOn && (scope === 'head' ? window.vwHead : window.vwEx)); }
// 台羅字串 → 母音所在的範圍 [起, 迄)；音節沒有 a e i o u 時，以 m／ng 為主音（韻化輔音，如 m̄、ng̍）
function vowelRanges(text) {
  const out = [];
  const add = (a, b) => { if (out.length && out[out.length - 1][1] === a) out[out.length - 1][1] = b; else out.push([a, b]); };
  const sylRe = /[\p{L}\p{M}]+/gu; let sm;
  while ((sm = sylRe.exec(text))) {
    const cl = [], cre = /\p{L}\p{M}*/gu; let c;   // 音節內的字母叢（一個字母＋它的調符）
    while ((c = cre.exec(sm[0]))) cl.push({ a: sm.index + c.index, b: sm.index + c.index + c[0].length, ch: c[0].normalize('NFD')[0].toLowerCase() });
    let any = false;
    cl.forEach(x => { if ('aeiou'.includes(x.ch)) { add(x.a, x.b); any = true; } });
    if (!any) {
      let i = cl.length;
      while (i > 0 && 'mng'.includes(cl[i - 1].ch)) i--;   // 尾端連續的 m／n／g
      for (let j = i; j < cl.length; j++) add(cl[j].a, cl[j].b);
    }
  }
  return out;
}
// 台羅 → HTML：命中範圍標示（mark）＋母音上色（vowel 為 true 時）
function romRich(text, ranges, vowel) {
  if (!vowel) return hlText(text, ranges);
  const vr = vowelRanges(text), inR = (rs, i) => rs && rs.some(([a, b]) => i >= a && i < b);
  let out = '', hit = false, vw = false, pos = 0;
  for (const ch of text) {
    const h = !!inR(ranges, pos), v = !!inR(vr, pos);
    if (vw && (!v || h !== hit)) { out += '</span>'; vw = false; }   // 母音 span 在 mark 裡面：先關 span，再處理 mark
    if (h !== hit) { if (hit) out += '</mark>'; if (h) out += '<mark class="hit">'; hit = h; }
    if (v && !vw) { out += '<span class="vw">'; vw = true; }
    out += escHtml(ch); pos += ch.length;
  }
  if (vw) out += '</span>';
  if (hit) out += '</mark>';
  return out;
}
function vwToggleHtml() {
  return `<button type="button" class="vw-toggle" title="開關音讀母音的顏色（細項在「設定」）">音色：<b>${window.vwOn ? '開' : '關'}</b></button>`;
}
// 詳細頁「聲調色彩」開關（總開關；細項在設定裡）
function tnToggleHtml() {
  return `<button type="button" class="tn-toggle" title="開關字調色彩（細項在「設定」）">調色：<b>${window.tnOn ? '開' : '關'}</b></button>`;
}
function refreshColorUI() {   // 設定或開關改變後：更新詳細頁與列表
  document.querySelectorAll('.entry-han[data-han]').forEach(el => { el.innerHTML = toneHanHtml(el.dataset.han, el.dataset.rom); });
  document.querySelectorAll('.entry-rom-main[data-rom]').forEach(el => { el.innerHTML = romHtml(el.dataset.rom); });
  document.querySelectorAll('.sense-ex li[data-ex]').forEach(li => { li.innerHTML = exampleHtml(li.dataset.ex); });
  document.querySelectorAll('.tn-toggle b').forEach(b => { b.textContent = window.tnOn ? '開' : '關'; });
  document.querySelectorAll('.vw-toggle b').forEach(b => { b.textContent = window.vwOn ? '開' : '關'; });
  if (filteredData.length && currentSearchType !== COMPARE_TAB) displayResults(filteredData, _lastPage);
}
document.addEventListener('click', function (e) {
  if (e.target.closest('.tn-toggle') && window.setToneOn) window.setToneOn(!window.tnOn);
  if (e.target.closest('.vw-toggle') && window.setVowelOn) window.setVowelOn(!window.vwOn);
});
function rubyHtml(han, rom, hl, tones, vw) {   // hl（可省略）：{ han: 範圍, rom: 範圍 }；tones（可省略）：每個字的聲調
  const chars = Array.from(han);
  const tk = romTokens(rom), toks = tk.map(x => x.t);
  const cnt = t => t.split(/-+/).filter(Boolean).length;
  const need = toks.reduce((n, t) => n + cnt(t), 0);
  if (chars.filter(c => _LET.test(c)).length !== need) return null;   // 字數與音節數對不上
  let out = '', ti = 0, left = 0, open = false, cpos = 0, ci = -1, base = '', word = '';   // base／word：目前這個詞的漢字（HTML／純文字）
  const hanHit = i => hl && hl.han && hl.han.some(([a, b]) => i >= a && i < b);
  const hanChar = (ch, at, i) => { const h = toneSpan(ch, tones && tones[i]); return hanHit(at) ? `<mark class="hit">${h}</mark>` : h; };
  for (const ch of chars) {
    const at = cpos; cpos += ch.length; ci++;
    if (_LET.test(ch)) {
      if (!open) { open = true; left = cnt(toks[ti]); base = ''; word = ''; }
      base += hanChar(ch, at, ci); word += ch; left--;
      if (left === 0) {
        // 修改：一個詞的漢字包成一個按鈕（原子元素），ruby 才不會把「好額人」分散對齊；點一下直接查詢這個詞（同分詞模式）
        // 詞與詞之間加一般空格：留出間距，也讓換行只發生在詞與詞之間
        out += (out.endsWith('</ruby>') ? ' ' : '') + `<ruby><button type="button" class="rel-word rb" data-word="${escHtml(word)}">${base}</button><rt>${romRich(toks[ti], hl && sliceRanges(hl.rom, tk[ti].off, toks[ti].length), vw)}</rt></ruby>`;
        open = false; ti++;
      }
    } else if (open) { base += hanChar(ch, at, ci); word += ch; }   // 詞內的標點
    else out += hanChar(ch, at, ci);
  }
  return out;
}
// 分詞：依台羅的空格把漢字分成詞（連字符「-」連起來的音節屬於同一個詞），標點黏在相鄰的詞上；對不上時回傳 null
function segmentHan(han, rom) {
  const chars = Array.from(han);
  const toks = rom.trim().split(/\s+/).map(t => t.replace(_EDGE, '')).filter(Boolean);
  const cnt = t => t.split(/-+/).filter(Boolean).length;
  const need = toks.reduce((n, t) => n + cnt(t), 0);
  if (chars.filter(c => _LET.test(c)).length !== need) return null;
  const words = []; let cur = '', left = 0, ti = 0, prefix = '';
  for (const ch of chars) {
    if (_LET.test(ch)) {
      if (left === 0) { left = cnt(toks[ti]); cur = prefix; prefix = ''; }
      cur += ch; left--;
      if (left === 0) { words.push(cur); cur = ''; ti++; }
    } else if (/\s/.test(ch)) continue;
    else if (left > 0) cur += ch;                                       // 詞內的標點
    else if (!words.length || /[\p{Ps}\p{Pi}]/u.test(ch)) prefix += ch;   // 開頭標點、左括號/引號 → 黏在後一個詞
    else words[words.length - 1] += ch;                                 // 句讀 → 黏在前一個詞
  }
  if (prefix && words.length) words[words.length - 1] += prefix;
  return words;
}
// 例句顯示方式：ruby（台羅標在漢字上）/ line（標準：分行）/ seg（分詞：分行，漢字依台羅分詞）
const EX_MODES = ['ruby', 'line', 'seg'];
const EX_LABEL = { ruby: 'RUBY', line: '標準', seg: '分詞' };
// 分詞模式：每個詞可點擊，直接以該詞查詢「詞目」（前後的標點留在按鈕外面，不列入查詢）
function segWordHtml(w, ranges, tones, cp0) {   // ranges（可省略）：此詞內要標示的範圍；tones／cp0（可省略）：聲調陣列與此詞第一個字的字序
  const m = w.match(/^([\p{P}\p{S}]*)([\s\S]*?)([\p{P}\p{S}]*)$/u);
  const core = m[2];
  if (!core) return hanRich(w, ranges, tones, cp0);
  const n1 = Array.from(m[1]).length, nc = Array.from(core).length;
  return hanRich(m[1], sliceRanges(ranges, 0, m[1].length), tones, cp0) + `<button type="button" class="rel-word" data-word="${escHtml(core)}">${hanRich(core, sliceRanges(ranges, m[1].length, core.length), tones, (cp0 || 0) + n1)}</button>` + hanRich(m[3], sliceRanges(ranges, m[1].length + core.length, m[3].length), tones, (cp0 || 0) + n1 + nc);
}
// line 格式：「漢字（台羅）華語」
// highlight 為 true 時（例句搜尋結果列），把符合查詢的字句標示出來
function exampleHtml(line, highlight) {
  const mode = window.exMode || 'ruby';
  const re = highlight && isExType(currentSearchType) ? _hlRe : null;
  const m = line.match(/^([^（]*)（([^）]*)）([\s\S]*)$/);
  if (!m) return re ? hlText(line, matchRanges(line, re)) : escHtml(line);
  let [, han, rom, zhRaw] = m;
  if (re) rom = rom.normalize('NFC');   // 與搜尋比對時一致（NFC）
  const hl = re ? (currentSearchType === '例句' ? { han: matchRanges(han, re), rom: matchRanges(rom, re) } : { zh: matchRanges(zhRaw.trim(), re) }) : null;
  const zh = zhRaw.trim() ? `<span class="x-zh">(${hl ? hlText(zhRaw.trim(), hl.zh) : escHtml(zhRaw.trim())})</span>` : '';
  const tones = hanToneMap(han, rom, 'ex');   // 聲調色彩（未開啟或對不上時為 null）
  const vw = vwActive('ex');                  // 音色：台羅母音上色
  if (mode === 'ruby') {
    const r = rubyHtml(han, rom, hl, tones, vw);
    if (r) return `<div class="x-ruby">${r}</div>${zh ? `<div>${zh}</div>` : ''}`;
  }
  let hanH = `<span class="x-han">${hanRich(han, hl && hl.han, tones, 0)}</span>`;
  // 修改：「標準」模式也比照分詞，每個詞可點擊查詢；差別只在詞與詞之間不加空格（外觀維持原本的連續漢字）
  if (mode === 'seg' || mode === 'line') {
    const isSeg = mode === 'seg';
    const w = segmentHan(han, rom);
    if (w) {
      let pos = 0;   // 分詞後空白被丟掉，這裡依序對回原字串的位置
      hanH = `<span class="x-han${isSeg ? ' x-seg' : ''}">${w.map(word => {
        let ws = '';
        while (pos < han.length && /\s/.test(han[pos])) ws += han[pos++];   // 原字串的空白
        const start = pos; pos += word.length;
        return (isSeg ? '' : ws) + segWordHtml(word, hl && sliceRanges(hl.han, start, word.length), tones, Array.from(han.slice(0, start)).length);
      }).join(isSeg ? ' ' : '')}</span>`;
    }
  }
  const romH = `<span class="x-rom">${romRich(rom, hl && hl.rom, vw)}</span>`;
  return `<div>${hanH}</div><div>${romH}</div>${zh ? `<div>${zh}</div>` : ''}`;   // 標準／分詞（含對不上時的備援）
}
// 列表中的例句欄：每句一行，前面保留義項序號
function listExamplesHtml(text) {
  return (text || '').split('<br>').filter(Boolean).map(line => {
    const m = line.match(/^\[(\d+)\] ([\s\S]*)$/);
    return `<div class="ex-item ex-mode-${window.exMode || 'ruby'}">${m ? `<span class="ex-no">${m[1]}</span>` : ''}${exampleHtml(m ? m[2] : line)}</div>`;
  }).join('');
}

// 義項文字：編號與內容分開，換行時內容對齊（懸掛縮排）
// 詞類標籤：開頭的【名詞】等轉成小標籤（顏色依詞類分組）
const POS_CLASS = {
  '名詞': 'n', '代詞': 'n', '時間詞': 'n', '方位詞': 'n', '量詞': 'n', '數詞': 'n',
  '動詞': 'v', '助動詞': 'v',
  '形容詞': 'a', '副詞': 'a', '擬聲詞': 'a', '擬態詞': 'a',
  '連詞': 'f', '介詞': 'f', '助詞': 'f', '疑問詞': 'f', '嘆詞': 'f',
  '熟語': 'i'
};
// 列表用的單字簡稱（滑過／長按顯示全名；詳細頁仍顯示完整詞類名）
const POS_SHORT = {
  '名詞': '名', '代詞': '代', '時間詞': '時', '方位詞': '方', '量詞': '量', '數詞': '數',
  '動詞': '動', '助動詞': '助',   // 助動詞與助詞同為「助」，以顏色區分（動詞類綠、虛詞類紫）
  '形容詞': '形', '副詞': '副', '擬聲詞': '聲', '擬態詞': '態',
  '連詞': '連', '介詞': '介', '助詞': '助', '疑問詞': '疑', '嘆詞': '嘆',
  '熟語': '熟'
};
// 釋義的搜尋用文字：去掉各義項開頭的編號「1. 」與詞類「【名詞】」，一個義項一行（編號、詞類不可被查詢）
function buildDefIndex() {
  dictionary.forEach(it => {
    Object.defineProperty(it, '_defTxt', { value: (it['釋義'] || '').split('<br>').map(d =>
      d.replace(/^\d+\. /, '').replace(/^【([^】]{1,6})】\s*/, (m, k) => POS_CLASS[k] ? '' : m)).join('\n'), writable: true });   // 不可列舉：不影響其他欄位的迴圈
  });
}
buildDefIndex();   // 需在 POS_CLASS 定義之後執行
function posChipHtml(text, short) {
  const m = text.match(/^【([^】]{1,6})】\s*/);
  if (!m || !POS_CLASS[m[1]]) return { chip: '', rest: text };
  const label = short ? (POS_SHORT[m[1]] || m[1]) : m[1];
  return { chip: `<span class="pos pos-${POS_CLASS[m[1]]}" title="${m[1]}">${label}</span>`, rest: text.slice(m[0].length), has: true };
}
function defLineHtml(d, noPos, short) {   // noPos 為 true 時不顯示詞類標籤（標準模式）
  const m = d.match(/^(\d+)\. ([\s\S]*)$/);
  let { chip, rest, has } = posChipHtml(m ? m[2] : d, short);
  if (noPos) { chip = ''; has = false; }
  // 編號、詞類、內容各自一欄（grid），換行時內容永遠對齊在內容欄
  const cls = 'def-line' + (m ? ' has-no' : '') + (has ? ' has-pos' : '') + (has && short ? ' pos-short' : '');
  return `<div class="${cls}">${m ? `<span class="def-no">${m[1]}.</span>` : ''}${chip}<span class="def-text">${rest}</span></div>`;
}
// ======== 搜尋「釋義」時，在結果中標示符合的字句（只處理標籤外的文字，不破壞 HTML）========
let _hlRe = null;   // performSearch 每次搜尋時更新
function hlHtml(html) {
  if (!_hlRe || currentSearchType !== '釋義') return html;
  const re = new RegExp(_hlRe.source, 'gi');
  let skip = false;   // 位於編號 <span class="def-no">、詞類 <span class="pos ..."> 之內時不標示
  return html.split(/(<[^>]*>)/).map(p => {
    if (p.charAt(0) === '<') { if (/^<span class="(def-no|pos )/.test(p)) skip = true; else if (skip && p === '</span>') skip = false; return p; }
    return skip ? p : p.replace(re, m => m ? `<mark class="hit">${m}</mark>` : m);
  }).join('');
}
// ======== 列表「釋義」顯示模式：完整（編號＋詞類）／標準（編號，無詞類）／精簡（合併成一段）========
const DEF_MODES = ['full', 'std', 'brief'];
const DEF_LABEL = { full: '完整', std: '標準', brief: '精簡' };
function defListHtml(text) {
  const mode = window.defMode || 'brief';
  const defs = (text || '').split('<br>').filter(Boolean);
  if (mode === 'brief') {
    const joined = defs.map(d => {
      let t = posChipHtml(d.replace(/^\d+\. /, '')).rest.trim();
      if (t && !/[。！？；」』）)…]$/.test(t)) t += '；';
      return t;
    }).join('').replace(/；$/, '。');   // 最後一段若沒有句號，補上
    return `<div class="def-brief">${joined}</div>`;
  }
  return defs.map(d => defLineHtml(d, mode === 'std', true)).join('')   // 列表：詞類用單字簡稱;
}
document.addEventListener('click', function (e) {        // 表格頂端（手機版為各列標籤）的「釋義」：完整 → 標準 → 精簡
  const t = e.target.closest('.def-toggle'); if (!t) return;
  e.preventDefault();
  const next = DEF_MODES[(DEF_MODES.indexOf(window.defMode || 'brief') + 1) % DEF_MODES.length];
  if (window.setDefMode) window.setDefMode(next);
});
// 資料格式：釋義以 <br> 分隔各義項；例句若有多個義項，前面標 "[n] "，n 為義項序號
function senseDetailHtml(item) {
  const defs = (item['釋義'] || '').split('<br>').filter(Boolean);
  if (!defs.length) return '';
  const exs = (item['例句'] || '').split('<br>').filter(Boolean);
  const bySense = defs.map(() => []);
  exs.forEach(line => {
    const m = line.match(/^\[(\d+)\] ([\s\S]*)$/);
    const idx = m ? parseInt(m[1], 10) - 1 : 0;
    (bySense[idx] || bySense[0]).push(m ? m[2] : line);
  });
  return defs.map((d, i) => {
    const exHtml = bySense[i].map(e => `<li class="ex-mode-${window.exMode || 'ruby'}" data-ex="${escHtml(e)}">${exampleHtml(e)}</li>`).join('');
    return `<div class="sense${/^\d+\. /.test(d) ? ' numbered' : ''}"><div class="sense-def">${hlHtml(defLineHtml(d))}</div>${exHtml ? `<ul class="sense-ex">${exHtml}</ul>` : ''}</div>`;
  }).join('');
}

// 詳細頁「例句」切換鈕：RUBY → 標準 → 分詞 → RUBY
function exToggleHtml() {
  const m = EX_LABEL[window.exMode] || 'RUBY';
  return `<button type="button" class="ex-toggle" title="切換例句顯示方式">例句：<b>${m}</b></button>`;
}
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.ex-toggle'); if (!btn) return;
  const next = EX_MODES[(EX_MODES.indexOf(window.exMode) + 1) % EX_MODES.length];
  if (window.setExampleMode) window.setExampleMode(next); else window.exMode = next;
  document.querySelectorAll('.sense-ex li[data-ex]').forEach(li => {
    li.className = 'ex-mode-' + next;
    li.innerHTML = exampleHtml(li.dataset.ex);
  });
  document.querySelectorAll('.ex-toggle b').forEach(b => { b.textContent = EX_LABEL[next]; });
  if (filteredData.length && currentSearchType !== COMPARE_TAB) displayResults(filteredData, _lastPage);   // 列表同步
});

// 以「分類」欄查詢某個類別（詳細頁的分類標籤、首頁的分類面板共用）
function searchByCategory(cat) {
  hideDetailUI();
  currentDetailId = null;
  setRawRx(false);   // 新增：程式代入新查詢詞，離開正則模式
  searchInput.value = cat;
  currentSearchType = '分類';
  performSearch();
  updateActiveSearchType();
  window.scrollTo(0, 0);
}
// 點擊詳細頁的分類標籤 → 關閉詳細頁，改以「分類」欄查詢該類別
document.addEventListener('click', function (e) {
  const chip = e.target.closest('.chip[data-cat]'); if (!chip) return;
  searchByCategory(chip.dataset.cat);
});

// ======== 台羅音讀：資料以「/」分隔兩種音讀（前為主、後為副），可選 全部／主音讀／副音讀 ========
const ROM_MODES = ['full', 'main', 'sub'];
const ROM_LABEL = { full: '全', main: '主', sub: '副' };
function romText(v) {
  const mode = window.romMode || 'full';
  if (mode === 'full' || !v || v.indexOf('/') < 0) return v || '';
  const m = v.match(/^(【[^】]*】)?([\s\S]*)$/);          // 保留開頭的【白】【文】等標記
  const parts = m[2].split('/').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return v;
  return (m[1] || '') + (mode === 'sub' ? parts[1] : parts[0]);
}
// 台羅開頭的【白】【文】【俗】標記：改成接在拼音後面的右上角小標籤
const ROM_TAG_TITLE = { '白': '白話音', '文': '文讀音', '俗': '俗讀音' };
function romHtml(v) {
  const t = romText(v);
  const rh = x => vwActive('head') ? romRich(x, null, true) : escHtml(x);   // 音色：詞目的台羅
  const m = t.match(/^【([^】]*)】([\s\S]*)$/);
  if (!m) return rh(t);
  return rh(m[2].trim()) + `<span class="tag-sub tag-rom" title="${escHtml(ROM_TAG_TITLE[m[1]] || m[1])}">${escHtml(m[1])}</span>`;
}
document.addEventListener('click', function (e) {        // 表格頂端（手機版為各列標籤）的「台羅」：全 → 主 → 副
  const t = e.target.closest('.rom-toggle'); if (!t) return;
  e.preventDefault();
  const next = ROM_MODES[(ROM_MODES.indexOf(window.romMode || 'full') + 1) % ROM_MODES.length];
  if (window.setRomMode) window.setRomMode(next);
});

document.addEventListener('click', function (e) {        // 新增：表格頂端（手機版為各列標籤）的「詞目」：詞>音 ⇄ 音>詞
  const t = e.target.closest('.sort-toggle'); if (!t) return;
  e.preventDefault();
  if (window.setSortMode) window.setSortMode(window.sortMode === 'rom' ? 'han' : 'rom');
});

// 點整列（不只是左邊的編號）就開啟詳細頁；點到連結／按鈕、或正在選取文字時不觸發
document.addEventListener('click', function (e) {
  const tr = e.target.closest('.results-table tbody tr'); if (!tr) return;
  if (e.target.closest('a, button, .rom-toggle, .def-toggle, .sort-toggle')) return;
  if (String(window.getSelection && window.getSelection()).trim()) return;
  const num = tr.querySelector('.item-number[data-index]'); if (!num) return;
  showFullData(parseInt(num.dataset.index, 10));
});

// 近義詞／反義詞：每個詞可點擊，直接以該詞查詢「詞目」
function relWordsHtml(text) {
  return (text || '').split('、').map(w => w.trim()).filter(Boolean)
    .map(w => `<button type="button" class="rel-word" data-word="${escHtml(w)}" title="查詢「${escHtml(w)}」">${escHtml(w)}</button>`)
    .join('<span class="rel-sep">、</span>');
}
function searchRelWord(word) {   // 修改：抽成函式，近反義浮窗的詞也共用
  hideDetailUI();
  currentDetailId = null;
  setRawRx(false);   // 新增
  searchInput.value = word;
  currentSearchType = defaultType();     // 詞目
  performSearch();
  updateActiveSearchType();
  window.scrollTo(0, 0);
}
document.addEventListener('click', function (e) {
  const b = e.target.closest('.rel-word[data-word]'); if (!b) return;
  // 手機／觸控：開啟近反義顯示時，點例句的詞先浮出「原詞＋近反義詞」，再點其中一個才查詢（沒有近反義資料的詞則直接查詢）
  if (window.rwOn && e.pointerType && e.pointerType !== 'mouse' && b.matches(REL_WORD_SEL) && relOf(b.dataset.word || '')) {
    if (_relFor === b && _relPop && !_relPop.hidden) hideRelPop(); else showRelPop(b, true);
    return;
  }
  hideRelPop();
  searchRelWord(b.dataset.word);
});

// ======== 近反義顯示（設定 rw）：滑鼠停在例句的詞上，浮出這個詞的近義詞、反義詞；點浮窗裡的詞直接查詢 ========
// 資料來自詞典本身的「近義詞」「反義詞」欄；第一次用到才建立索引
const REL_NORM = { '臺': '台', '個': '个', '着': '著', '裏': '裡' };   // 只用來比對（一字對一字）
const relNorm = s => Array.from(String(s || ''), c => REL_NORM[c] || c).join('');
let _relIdx = null;
function relIndex() {
  if (_relIdx) return _relIdx;
  _relIdx = new Map();
  dictionary.forEach(it => {
    const key = relNorm((it['台語'] || '').replace(/【替】/g, '').trim());
    if (!key) return;
    let v = _relIdx.get(key);
    if (!v) { v = { syn: [], ant: [] }; _relIdx.set(key, v); }
    [['近義詞', 'syn'], ['反義詞', 'ant']].forEach(([f, k]) => {
      (it[f] || '').split(/[、，,；;\/\s]+/).forEach(w => { if (w && !v[k].includes(w)) v[k].push(w); });
    });
  });
  return _relIdx;
}
function relOf(word) {
  const idx = relIndex();
  let v = idx.get(relNorm(word));
  if (!v) v = idx.get(relNorm(word.replace(/[\p{P}\p{S}\s]/gu, '')));   // 詞內有標點時，去掉標點再找
  return v && (v.syn.length || v.ant.length) ? v : null;
}
const REL_WORD_SEL = '.x-han .rel-word, .x-ruby .rel-word';   // 只限例句裡的詞
let _relPop = null, _relFor = null, _relShowT = 0, _relHideT = 0;
function relPopEl() {
  if (_relPop) return _relPop;
  _relPop = document.createElement('div');
  _relPop.className = 'rw-pop'; _relPop.hidden = true;
  _relPop.addEventListener('pointerenter', () => clearTimeout(_relHideT));
  _relPop.addEventListener('pointerleave', () => scheduleRelHide());
  _relPop.addEventListener('click', e => {
    const c = e.target.closest('.rw-chip[data-word]'); if (!c) return;
    const w = c.dataset.word;
    hideRelPop();
    searchRelWord(w);
  });
  document.body.appendChild(_relPop);
  return _relPop;
}
function hideRelPop() {
  clearTimeout(_relShowT); clearTimeout(_relHideT);
  if (_relPop) _relPop.hidden = true;
  _relFor = null;
}
function scheduleRelHide() { clearTimeout(_relHideT); _relHideT = setTimeout(hideRelPop, 250); }
function showRelPop(btn, withOrig) {
  const v = relOf(btn.dataset.word || ''); if (!v) { hideRelPop(); return; }
  const pop = relPopEl();
  const row = (cls, label, list) => list.length ? `<div class="rw-row"><span class="rw-lab ${cls}">${label}</span><div class="rw-chips">${list.map(w => `<button type="button" class="rw-chip" data-word="${escHtml(w)}">${escHtml(w)}</button>`).join('')}</div></div>` : '';
  const head = withOrig ? `<div class="rw-row"><span class="rw-lab rw-org">原</span><div class="rw-chips"><button type="button" class="rw-chip rw-chip-orig" data-word="${escHtml(btn.dataset.word)}">${escHtml(btn.dataset.word)}</button></div></div>` : '';
  pop.innerHTML = head + row('rw-syn', '近', v.syn) + row('rw-ant', '反', v.ant);
  pop.hidden = false; _relFor = btn;
  const r = btn.getClientRects()[0] || btn.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight, vw = document.documentElement.clientWidth;
  const left = Math.max(8, Math.min(r.left, vw - pw - 8));
  let top = r.bottom + 4;
  if (top + ph > window.innerHeight - 8 && r.top - ph - 4 > 8) top = r.top - ph - 4;   // 下面放不下就放上面
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
document.addEventListener('pointerover', function (e) {
  if (e.pointerType !== 'mouse' || !window.rwOn) return;
  const b = e.target.closest && e.target.closest(REL_WORD_SEL); if (!b) return;
  clearTimeout(_relHideT);
  if (_relFor === b) return;
  clearTimeout(_relShowT);
  _relShowT = setTimeout(() => showRelPop(b), 200);
});
document.addEventListener('pointerout', function (e) {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest && e.target.closest(REL_WORD_SEL); if (!b) return;
  if (e.relatedTarget && b.contains(e.relatedTarget)) return;
  clearTimeout(_relShowT);
  scheduleRelHide();
});
window.addEventListener('scroll', () => { if (_relFor) hideRelPop(); }, true);
document.addEventListener('pointerdown', e => {   // 點浮窗與例句的詞以外的地方就收起（觸控版浮窗是點開的）
  if (!_relFor || (_relPop && _relPop.contains(e.target))) return;
  if (e.target.closest && e.target.closest(REL_WORD_SEL)) return;
  hideRelPop();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _relFor) hideRelPop(); });

// 詳細頁（不用表格，節省空間）：標題＋台羅(又唸) → 分類標籤 → 釋義 → 相關 → 其他欄位
function detailHtml(item) {
  const sec = (title, body) => `<section class="entry-sec"><div class="sec-title">${title}</div>${body}</section>`;
  // 又唸／俗唸：資料格式「詞目（台羅）」；詞目與主詞條相同時，只顯示台羅，不重複詞目
  const stripTag = s => s.replace(/【[^】]*】/g, '').trim();   // 詞目的【替】等標記不參與比對
  const hanMain = (item['台語'] || '').trim(), hanPlain = stripTag(hanMain);
  const altNote = (field, label) => {
    const parts = [...new Set((item[field] || '').split('<br>').map(p => p.trim()).filter(Boolean).map(p => {
      const m = p.match(/^([^（]*)（([^）]*)）$/);
      return m && (m[1].trim() === hanMain || stripTag(m[1]) === hanPlain) ? m[2].trim() : p;
    }))];
    return parts.length ? `<span class="alt-note"><span class="rel-tag">${label}</span>${parts.join('、')}</span>` : '';
  };
  let html = '<div class="entry-detail"><div class="entry-head">';
  // 標題列：詞目 + 「教育部辭典原頁」外連圖示
  const moeId = String(item['詞目id'] || '').trim();   // 有詞目id：直連該詞條頁（/su/837）；沒有才退回以詞目搜尋
  const moeUrl = /^\d+$/.test(moeId) ? 'https://sutian.moe.edu.tw/zh-hant/su/' + moeId
    : 'https://sutian.moe.edu.tw/zh-hant/tshiau/?lui=tai_su&tsha=' + encodeURIComponent('^' + hanPlain + '$');
  html += '<div class="entry-titlerow">';
  html += `<div class="entry-han" data-han="${escHtml(item['台語'] || '')}" data-rom="${escHtml(item['台羅'] || '')}">${toneHanHtml(item['台語'], item['台羅'])}</div>`;
  if (hanPlain || moeId) html += `<a class="moe-link" href="${moeUrl}" target="_blank" rel="noopener" title="到教育部臺灣台語常用詞辭典查看「${escHtml(hanPlain)}」" aria-label="教育部辭典原頁"><svg class="icon" aria-hidden="true"><use href="#i-open-in-new"/></svg></a>`;
  html += '</div>';
  html += `<div class="entry-romline"><span class="entry-rom-main" data-rom="${escHtml(item['台羅'] || '')}">${romHtml(item['台羅'])}</span>` +
    altNote('又唸作', '又唸') + altNote('俗唸作', '俗唸') + '</div></div>';
  if (item['分類']) {
    html += '<div class="entry-chips">' + item['分類'].split('、').map(c => c.trim()).filter(Boolean).map(c => `<button type="button" class="chip" data-cat="${escHtml(c)}" title="查詢「${escHtml(c)}」分類的詞">${escHtml(c)}</button>`).join('') + '</div>';
  }
  const secTools = withEx => { const btns = `${tnToggleHtml()}${vwToggleHtml()}${withEx ? exToggleHtml() : ''}`;   // 手機版：三個鈕收進一個「顯示」按鈕（電腦版維持原樣）
    return `<span class="sec-tools">${btns}<span class="sec-tools-m"><button type="button" class="tools-m-btn" aria-expanded="false" aria-haspopup="true"><svg class="icon" aria-hidden="true"><use href="#i-tune"/></svg>顯示</button><div class="tools-m-pop" hidden>${btns}</div></span></span>`; };   // 調色、音色在左，例句鈕在右
  if (item['釋義']) html += sec('釋義' + secTools(!!item['例句']), senseDetailHtml(item));
  else if (item['例句']) html += sec('例句' + secTools(false), item['例句']);
  const syn = item['近義詞'] || '', ant = item['反義詞'] || '';
  if (syn || ant) {
    html += sec('相關',
      (syn ? `<div class="rel-line"><span class="rel-tag">近</span>${relWordsHtml(syn)}</div>` : '') +
      (ant ? `<div class="rel-line"><span class="rel-tag rel-ant">反</span>${relWordsHtml(ant)}</div>` : ''));
  }
  const known = ['台語', '台羅', '又唸作', '俗唸作', '分類', '釋義', '例句', '近義詞', '反義詞', ...HIDDEN_BY_DEFAULT];
  const extra = headers.filter(h => !known.includes(h) && item[h]).map(h => {
    if (h === '詔安拼音本變') return '';
    return `<div class="rel-line"><span class="meta-key">${escHtml(h)}</span>${item[h]}</div>`;
  }).join('');
  if (extra) html += sec('其他', extra);
  return html + '</div>';
}
// ======== 附加資料結束 ========

const myLocal = "kautian_";
let mainLanguage = '台語';
let currentSearchType = '台語';
// 預設不顯示的欄位（仍可在設定頁勾選）
const HIDDEN_BY_DEFAULT = ['台羅無調', '詞目id'];
// 預設顯示的欄位（其餘欄位仍可在設定頁勾選）
const DEFAULT_VISIBLE = ['台語', '台羅', '釋義'];
// 「欄位設定」只提供這幾項可選（依資料欄位名）
const COLUMN_CHOICES = ['台語', '台羅', '釋義', '近義詞', '反義詞'];
const DEFAULT_COLUMNS = () => headers.filter(h => DEFAULT_VISIBLE.includes(h));
// 欄位顯示名稱對照（資料內部欄位名不變，只改畫面上的文字）
const LABELS = { '台語': '詞目', '台羅': '音讀', '近義詞': '近義', '反義詞': '反義' };
const colLabel = h => LABELS[h] || h;
// 手機版卡片列表的欄位標籤：固定單字（序、詞、音、義、近、反），不可點擊切換；相關設定在「設定」裡
const MOBILE_LABELS = { '序號': '序', '台語': '詞', '台羅': '音', '釋義': '義', '近義詞': '近', '反義詞': '反' };
const mobLabel = h => MOBILE_LABELS[h] || colLabel(h);
let hasSearchResults = false;
let filteredData = [];

// ======== 網址參數：q 查詢詞、t 類型、p 頁碼、d 詳細檢視的詞目id（預設值不寫入網址）========
const TYPE_CODE = { '分類': 'fl', '釋義': 'sy', '例句': 'lj', '華語例句': 'lh', '近義詞': 'jy', '反義詞': 'fy', '華語對照': 'hy', '姓名': 'xm' };
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([k, v]) => [v, k]));
const typeToCode = t => TYPE_CODE[t] || t;
const codeToType = c => CODE_TYPE[c] || c;
const defaultType = () => searchTypes[0];
let _restoring = false;      // 依網址還原畫面時，不回寫網址
let _articleOpen = false;    // 新增：換詞（語詞替換）頁面是否開著（對應網址參數 a=1）
let _urlQ = '';              // 目前網址中的查詢詞（判斷要新增或取代歷史紀錄）
let _shownQ = null, _shownT = null;   // 畫面上已顯示的查詢詞與類型
// 新增：「原始正則模式」——按下「轉為正則」後，搜尋框內容完全當標準正則，不再經過簡易語法（單向，不能轉回）
let _rawRx = false;          // 是否在原始正則模式
let _rawSrc = '', _rawHl = null;   // 剛轉出時的正則文字與 A#B 的標示用正則（使用者改過文字後 _rawHl 即失效）
let _rawCode = 'p';          // 新增：隱藏包裝的代碼（b 音節邊界、g 群組、s／e／se 開頭／結尾／精確、p 無），見 SIMPLE.rawWrap
let _urlR = '', _shownR = '';   // 修改：網址中／畫面上的模式代碼（'' ＝ 一般模式；對應網址參數 r=代碼）
const rawKey = () => _rawRx ? _rawCode : '';   // 新增
let _syncAnchorBoxes = null;   // 虛擬鍵盤裡 ^開頭／結尾$／^精確$ 勾選的刷新函式（renderKeyboard 內設定）
let currentDetailId = null;  // 目前開啟的詳細檢視（詞目id）
let _listScrollY = 0;        // 開啟詳細檢視前，查詢結果列表的捲動位置（返回時還原）
const normQ = () => searchInput.value.trim().replace(/\s+/g, ' ');

function buildUrl() {
  const q = normQ();
  const p = new URLSearchParams();
  if (q) {
    p.set('q', q);
    if (_rawRx) p.set('r', _rawCode);   // 修改：r=代碼（舊的 r=1 視為 p）
    if (currentSearchType !== defaultType()) p.set('t', typeToCode(currentSearchType));
    if (!isSpecialTab(currentSearchType) && typeof _lastPage === 'number' && _lastPage > 1) p.set('p', _lastPage);
    if (currentDetailId) p.set('d', currentDetailId);
  }
  if (_articleOpen) p.set('a', '1');   // 新增：換詞頁開著
  const qs = p.toString();
  return location.pathname + (qs ? '?' + qs : '');
}
// mode：'push' 新增一筆歷史（新查詢、開啟詳細檢視）；'replace' 只更新網址（換頁、換類型）
function syncUrl(mode) {
  if (_restoring) return;
  const url = buildUrl();
  if (url === location.pathname + location.search) return;
  if (mode === 'push') history.pushState({ detail: !!currentDetailId }, '', url);
  else history.replaceState(history.state, '', url);
}
function syncSearchUrl() {
  const q = normQ();
  syncUrl(q !== _urlQ || rawKey() !== _urlR ? 'push' : 'replace');   // 修改：模式改變也算新查詢
  _urlQ = q; _urlR = rawKey(); _shownQ = q; _shownT = currentSearchType; _shownR = rawKey();   // 修改：多記 _urlR、_shownR
}
// 開啟／切換詳細檢視
function setDetail(item) {
  const wasOpen = currentDetailId != null;
  currentDetailId = (item && item['詞目id']) || null;
  syncUrl(wasOpen ? 'replace' : 'push');
}
// 使用者關閉詳細檢視（畫面已關）：若是我們新增的歷史就退回一步，否則只更新網址
function closeDetailState() {
  if (currentDetailId == null) return;
  currentDetailId = null;
  if (!_restoring && history.state && history.state.detail) history.back();
  else syncUrl('replace');
}
function hideDetailUI() {
  document.getElementById('sidebarModal').style.display = 'none';
  document.getElementById('fullDataModal').style.display = 'none';
  document.body.style.overflow = '';
}
// 新增：回到完全沒有查詢的首頁時，分頁固定回到預設的「詞目」（並更新記住的分頁）
function resetHomeTab() {
  currentSearchType = defaultType();
  try { localStorage.setItem(myLocal + 'currentSearchType', currentSearchType); } catch (e) {}
  updateActiveSearchType();
}
// 依網址還原畫面（載入、上一頁／下一頁）
function applyUrlState(initial) {
  const sp = new URLSearchParams(location.search);
  if (window.holoArticleView) {   // 新增：網址有 a=1 就開換詞頁，沒有就關（直接連進來、上一頁／下一頁都適用）
    if (sp.get('a') === '1') window.holoArticleView.open({ fromUrl: true });
    else window.holoArticleView.close({ fromUrl: true });
  }
  let q = (sp.get('q') ?? sp.get('cas') ?? '').trim();   // cas 為舊版參數，保持相容
  const id = sp.get('d');
  const item = id ? dictionary.find(x => x['詞目id'] === id) : null;
  const rv = sp.get('r');                                    // 修改：r=代碼 ＝ 原始正則模式；舊的 r=1 視為 p（只有 d 的永久連結不適用）
  const raw = rv && q ? (SIMPLE.RAW_CODES.test(rv) ? rv : 'p') : '';
  if (!q && item) q = (item['台語'] || '').trim();       // 只有 d：以該詞目查詢，當作永久連結
  if (!q) {
    if (initial) { resetHomeTab(); return; }   // 修改：開啟沒有查詢的首頁，也回到「詞目」（原本沿用上次記住的分頁）
    _restoring = true;
    try {
      resetHomeTab();   // 新增：上一頁／下一頁回到沒有查詢的首頁
      searchInput.value = ''; searchClear.style.display = 'none';
      setRawRx(false);   // 新增
      clearSearchResults(); hideDetailUI(); currentDetailId = null; _urlQ = ''; _shownQ = '';
    } finally { _restoring = false; }
    return;
  }
  let type = sp.get('t') ? codeToType(sp.get('t')) : defaultType();
  if (!searchTypes.includes(type)) type = defaultType();   // 含舊網址的 t=hy（華語對照已移除）
  const pg = parseInt(sp.get('p'), 10) || 1;

  _restoring = true;
  try {
    searchInput.value = q; searchClear.style.display = 'block';
    setRawRx(!!raw, raw);   // 修改：先還原模式與包裝代碼，再查詢
    if (q !== _shownQ || type !== _shownT || raw !== _shownR) {   // 修改：模式不同也要重查
      currentSearchType = type;
      performSearch();
      updateActiveSearchType();
    }
    _urlQ = q; _urlR = raw;   // 修改：多記 _urlR
    if (!isSpecialTab(currentSearchType) && filteredData.length) {
      const last = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
      const want = Math.min(pg, last);
      if (want !== _lastPage) displayResults(filteredData, want);
    }
    if (item && !isSpecialTab(currentSearchType)) {
      let idx = filteredData.indexOf(item);
      if (idx < 0) { filteredData = [item]; hasSearchResults = true; displayResults(filteredData, 1); idx = 0; }
      showFullData(idx);
    } else {
      hideDetailUI(); currentDetailId = null;
    }
  } finally { _restoring = false; }
}
window.addEventListener('popstate', () => applyUrlState(false));




// 台羅音節之間的「空白」和「-」視為相同：查 gu5 thau5 也找得到資料裡的 gu5-thau5（反之亦然）
function syllableSep(t) { return t.replace(/[ \-]+/g, '[ \\-]+'); }

// ---- 數字調 → 字中調（取自和樂 data-pinyin2pinyin.js 的 holoNumberToTone）：gu5 thau5 → gû thâu ----
// 和樂數字調轉字中調   
const holoNumberToTone = (function() {
    return function(t) {     
		t = t.replace(/([aeiourmn]|nn|ng)(1)/gi, '$1')
		t = t.replace(/([aeiourmn]|nn|ng)([ptkh])(4)/gi, '$1$2')

		t=t.replace(/([MNmn])(n)(g|gh)(9)\b/g, '$1n̋$3');
		t=t.replace(/([MNmn])(n)(g|gh)(2)\b/g, '$1ń$3');
		t=t.replace(/([MNmn])(n)(g|gh)(3)\b/g, '$1ǹ$3');
		t=t.replace(/([MNmn])(n)(g|gh)(5)\b/g, '$1n̂$3');
		t=t.replace(/([MNmn])(n)(g|gh)(6)\b/g, '$1ň$3');
		t=t.replace(/([MNmn])(n)(g|gh)(7)\b/g, '$1n̄$3');
		t=t.replace(/([MNmn])(n)(g|gh)(8)\b/g, '$1n̍$3');

		t=t.replace(/(O)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'Ő$2');
		t=t.replace(/(O)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'Ó$2');
		t=t.replace(/(O)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'Ò$2');
		t=t.replace(/(O)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'Ô$2');
		t=t.replace(/(O)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'Ǒ$2');
		t=t.replace(/(O)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'Ō$2');
		t=t.replace(/(O)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'O̍$2');
		t=t.replace(/(o)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'ő$2');
		t=t.replace(/(o)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'ó$2');
		t=t.replace(/(o)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'ò$2');
		t=t.replace(/(o)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'ô$2');
		t=t.replace(/(o)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'ǒ$2');
		t=t.replace(/(o)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'ō$2');
		t=t.replace(/(o)([eiouy]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'o̍$2');
		t=t.replace(/(Yu)((?:n|ng)?)(7)\b/g, 'Ǖ$2');
		t=t.replace(/(Yu)((?:n|ng)?)(2)\b/g, 'Ǘ$2');
		t=t.replace(/(Yu)((?:n|ng)?)(6)\b/g, 'Ǚ$2');
		t=t.replace(/(Yu)((?:n|ng)?)(3)\b/g, 'Ǜ$2');
		t=t.replace(/(yu)((?:n|ng)?)(7)\b/g, 'ǖ$2');
		t=t.replace(/(yu)((?:n|ng)?)(2)\b/g, 'ǘ$2');
		t=t.replace(/(yu)((?:n|ng)?)(6)\b/g, 'ǚ$2');
		t=t.replace(/(yu)((?:n|ng)?)(3)\b/g, 'ǜ$2');
		t=t.replace(/(Y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'Ȳ$2');
		t=t.replace(/(Y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'Y̌$2');
		t=t.replace(/(Y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'Ý$2');
		t=t.replace(/(Y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'Ỳ$2');
		t=t.replace(/(Y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'Ŷ$2');
		t=t.replace(/(y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'ȳ$2');
		t=t.replace(/(y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'y̌$2');
		t=t.replace(/(y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'ý$2');
		t=t.replace(/(y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'ỳ$2');
		t=t.replace(/(y)([iu]{0,1}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'ŷ$2');
		t=t.replace(/(A)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'A̋$2');
		t=t.replace(/(A)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'Á$2');
		t=t.replace(/(A)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'À$2');
		t=t.replace(/(A)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'Â$2');
		t=t.replace(/(A)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'Ǎ$2');
		t=t.replace(/(A)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'Ā$2');
		t=t.replace(/(A)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'A̍$2');
		t=t.replace(/(a)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'a̋$2');
		t=t.replace(/(a)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'á$2');
		t=t.replace(/(a)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'à$2');
		t=t.replace(/(a)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'â$2');
		t=t.replace(/(a)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'ǎ$2');
		t=t.replace(/(a)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'ā$2');
		t=t.replace(/(a)([eiou]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'a̍$2');


		t=t.replace(/(E)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'E̋$2');
		t=t.replace(/(E)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'É$2');
		t=t.replace(/(E)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'È$2');
		t=t.replace(/(E)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'Ê$2');
		t=t.replace(/(E)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'Ě$2');
		t=t.replace(/(E)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'Ē$2');
		t=t.replace(/(E)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'E̍$2');
		t=t.replace(/(e)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'e̋$2');
		t=t.replace(/(e)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'é$2');
		t=t.replace(/(e)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'è$2');
		t=t.replace(/(e)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'ê$2');
		t=t.replace(/(e)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'ě$2');
		t=t.replace(/(e)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'ē$2');
		t=t.replace(/(e)([eiur]{0,2}(?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'e̍$2');
		t=t.replace(/(U)((?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'Ű$2');
		t=t.replace(/(U)((?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'Ú$2');
		t=t.replace(/(U)((?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'Ù$2');
		t=t.replace(/(U)((?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'Û$2');
		t=t.replace(/(U)((?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'Ǔ$2');
		t=t.replace(/(U)((?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'Ū$2');
		t=t.replace(/(U)((?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'U̍$2');
		t=t.replace(/(u)((?:[mngbdptkh]|nnh|ng|nn)?)(9)\b/g, 'ű$2');
		t=t.replace(/(u)((?:[mngbdptkh]|nnh|ng|nn)?)(2)\b/g, 'ú$2');
		t=t.replace(/(u)((?:[mngbdptkh]|nnh|ng|nn)?)(3)\b/g, 'ù$2');
		t=t.replace(/(u)((?:[mngbdptkh]|nnh|ng|nn)?)(5)\b/g, 'û$2');
		t=t.replace(/(u)((?:[mngbdptkh]|nnh|ng|nn)?)(6)\b/g, 'ǔ$2');
		t=t.replace(/(u)((?:[mngbdptkh]|nnh|ng|nn)?)(7)\b/g, 'ū$2');
		t=t.replace(/(u)((?:[mngbdptkh]|nnh|ng|nn)?)(8)\b/g, 'u̍$2');
		t=t.replace(/(I)([i]{0,1}(?:[mngbdptkhrr]|nnh|ng|nn)?)(9)\b/g, 'I̋$2');
		t=t.replace(/(I)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(2)\b/g, 'Í$2');
		t=t.replace(/(I)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(3)\b/g, 'Ì$2');
		t=t.replace(/(I)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(5)\b/g, 'Î$2');
		t=t.replace(/(I)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(6)\b/g, 'Ǐ$2');
		t=t.replace(/(I)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(7)\b/g, 'Ī$2');
		t=t.replace(/(I)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(8)\b/g, 'I̍$2');
		t=t.replace(/(i)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(9)\b/g, 'i̋$2');
		t=t.replace(/(i)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(2)\b/g, 'í$2');
		t=t.replace(/(i)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(3)\b/g, 'ì$2');
		t=t.replace(/(i)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(5)\b/g, 'î$2');
		t=t.replace(/(i)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(6)\b/g, 'ǐ$2');
		t=t.replace(/(i)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(7)\b/g, 'ī$2');
		t=t.replace(/(i)([i]{0,1}(?:[mngbdptkhr]|nnh|ng|nn)?)(8)\b/g, 'i̍$2');
		t=t.replace(/(M)((?:h)?)(9)\b/g, 'M̋$2');
		t=t.replace(/(M)((?:h)?)(2)\b/g, 'Ḿ$2');
		t=t.replace(/(M)((?:h)?)(3)\b/g, 'M̀$2');
		t=t.replace(/(M)((?:h)?)(5)\b/g, 'M̂$2');
		t=t.replace(/(M)((?:h)?)(6)\b/g, 'M̌$2');
		t=t.replace(/(M)((?:h)?)(7)\b/g, 'M̄$2');
		t=t.replace(/(M)((?:h)?)(8)\b/g, 'M̍$2');
		t=t.replace(/(m)((?:h)?)(9)\b/g, 'm̋$2');
		t=t.replace(/(m)((?:h)?)(2)\b/g, 'ḿ$2');
		t=t.replace(/(m)((?:h)?)(3)\b/g, 'm̀$2');
		t=t.replace(/(m)((?:h)?)(5)\b/g, 'm̂$2');
		t=t.replace(/(m)((?:h)?)(6)\b/g, 'm̌$2');
		t=t.replace(/(m)((?:h)?)(7)\b/g, 'm̄$2');
		t=t.replace(/(m)((?:h)?)(8)\b/g, 'm̍$2');

		t=t.replace(/(N)((g|gh)?)(9)\b/g, 'N̋$2');
		t=t.replace(/(N)((g|gh)?)(2)\b/g, 'Ń$2');
		t=t.replace(/(N)((g|gh)?)(3)\b/g, 'Ǹ$2');
		t=t.replace(/(N)((g|gh)?)(5)\b/g, 'N̂$2');
		t=t.replace(/(N)((g|gh)?)(6)\b/g, 'Ň$2');
		t=t.replace(/(N)((g|gh)?)(7)\b/g, 'N̄$2');
		t=t.replace(/(N)((g|gh)?)(8)\b/g, 'N̍$2');

		t=t.replace(/(n)((g|gh)?)(9)\b/g, 'n̋$2');
		t=t.replace(/(n)((g|gh)?)(2)\b/g, 'ń$2');
		t=t.replace(/(n)((g|gh)?)(3)\b/g, 'ǹ$2');
		t=t.replace(/(n)((g|gh)?)(5)\b/g, 'n̂$2');
		t=t.replace(/(n)((g|gh)?)(6)\b/g, 'ň$2');
		t=t.replace(/(n)((g|gh)?)(7)\b/g, 'n̄$2');
		t=t.replace(/(n)((g|gh)?)(8)\b/g, 'n̍$2');

        return t;
    };
})();

// 台羅查詢的比對式：含數字調時，同時比對「數字調」（詞目欄的台羅數字）與轉成字中調後的寫法（例句裡的台羅）
function latinTermPattern(term) {
  const LB = "(?<![A-Za-z\\u00C0-\\u024F\\u0300-\\u036F])", LA = "(?![A-Za-z\\u00C0-\\u024F\\u0300-\\u036F])";
  const mk = t => LB + syllableSep(t) + LA;
  if (/[A-Za-z][1-9](?![A-Za-z0-9])/.test(term)) {
    let alt = term;
    try { alt = holoNumberToTone(term); } catch (e) {}
    if (alt !== term) return '(?:' + mk(term) + '|' + mk(alt) + ')';
  }
  return mk(term);
}

// ======== 輸入法式查詢：不打聲調（tsiulaua）、或只打各音節開頭（tsla）========
// 規則：查詢詞只含英文字母（可夾空白、-），把它拆成「每個音節開頭的一段」，段數須等於詞的音節數。
//   tsiulaua → tsiu|lau|a、tsla → ts|l|a、tsiula → tsiu|la|（酒漏仔 tsiú-lāu-á）；ts、tsh、kh、ng 等聲母不會被拆開
// 比對對象為純台羅欄位（台羅、台羅無調）；只有一個音節的詞須完整輸入，避免 ts 之類列出一大堆。
const IME_ROM = /^[A-Za-z0-9\u00C0-\u024F\u0300-\u036F\u207F\s\-\/]+$/;
function imeQuery(raw) {
  raw = (raw || '').trim();
  if (!/^[A-Za-z\s\-]+$/.test(raw) || /^[A-D]{2,}$/.test(raw)) return '';   // 含數字、符號、漢字，或 AA／ABB 疊字代號：不啟用
  const q = raw.toLowerCase().replace(/[\s\-]+/g, '');
  return q.length >= 3 && !/[vxy]/.test(q) ? q : '';   // 至少 3 個字母，避免打到一半列出太多
}
function imeSylls(r) {   // 一個讀音 → 音節陣列（去聲調、數字調）
  return stripToneJS(r).split(/[\s\-]+/).map(x => x.replace(/[^a-z]/g, '')).filter(Boolean);
}
const IME_INI = /^(?:tsh|ts|ph|th|kh|ng|[ptkbgmnlsjh])/;
function imeMatchSylls(S, q) {
  const n = S.length;
  if (!n || n > q.length) return false;
  if (n === 1) return S[0] === q;
  const go = (i, p) => {
    if (i === n) return p === q.length;
    const ini = (S[i].match(IME_INI) || [''])[0].length;   // 音節開頭（聲母）的長度：ts、tsh、ph、kh、ng… 不可被拆開
    for (let len = Math.min(S[i].length, q.length - p - (n - i - 1)); len >= 1; len--)
      if (S[i].startsWith(q.substr(p, len)) && (len === S[i].length || len >= ini) && go(i + 1, p + len)) return true;
    return false;
  };
  return go(0, 0);
}
const _imeParsedCache = new Map();
function imeParsed(v) {   // 欄位值 → 各讀音的音節陣列；不是台羅（含漢字、過長、空值）回傳 null。結果有快取（用到才算），呼叫端不可修改
  let p = _imeParsedCache.get(v);
  if (p === undefined) {
    if (_imeParsedCache.size > 200000) _imeParsedCache.clear();   // 保險上限
    p = (!v || v.length > 80 || !IME_ROM.test(v)) ? null : v.split('/').map(imeSylls);
    _imeParsedCache.set(v, p);
  }
  return p;
}
function imeTest(s, q) {
  if (!q) return false;
  const P = imeParsed(s);
  return !!P && P.some(S => imeMatchSylls(S, q));
}
let _imeCurQ = '';   // 目前這次查詢的輸入法式查詢詞（空字串＝未啟用）
// 輸入法式「完全符合」：某個讀音去掉聲調後，音節串起來剛好等於查詢詞（sikan ＝ sî-kan 時間）
function imeExactVals(values, q) {
  if (!q) return false;
  return values.some(v => { const P = imeParsed(v); return !!P && P.some(S => S.join('') === q); });
}
// 輸入法式「縮寫符合」：每個音節只打聲母（無聲母的音節打第一個母音），串起來剛好等於查詢詞（kaj ＝ kin-á-ji̍t 今仔日）
function imeInitialsVals(values, q) {
  if (!q) return false;
  return values.some(v => {
    const P = imeParsed(v);
    return !!P && P.some(S => S.length > 1 && S.map(x => (x.match(IME_INI) || [x[0]])[0]).join('') === q);
  });
}
// 正則的子類別：原本的比對失敗時，再用輸入法式比對一次（其餘行為不變）
class ImeRegExp extends RegExp {
  constructor(src, flags, q) { super(src, flags); this.imeQ = q; this.plain = q ? new RegExp(src, flags) : this; }   // plain：不含輸入法式的原正則
  test(s) { return super.test(s) || imeTest(s, this.imeQ); }
}

// ======== 簡易查詢語法（把一般人看得懂的符號轉成正則）========
const SIMPLE = (() => {
  const HAN = '(?:[\\u3007\\u3400-\\u9FFF\\uE815-\\uE864\\uF900-\\uFAFF]|[\\uD840-\\uD8BF][\\uDC00-\\uDFFF])';   // 修改：合併 \\u3400-\\u4DBF 與 \\u4E00-\\u9FFF；擴充字範圍 D840-D87F 改 D840-D8BF（補上第 3 平面 U+30000 以後）
  const ANY = '(?:[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[^\\uD800-\\uDFFF\\n\\r])';
  const LET = 'A-Za-z\\u00C0-\\u036F';   // 修改：\\u00C0-\\u024F 與 \\u0300-\\u036F 合併成 \\u00C0-\\u036F
  const LB = '(?<![' + LET + '])', LA = '(?![' + LET + '])';   // 音節前後不可緊接其他拉丁字母
  const TONE = '[1-9]';
  const SYL = '[A-Za-z]+' + TONE;                               // ~ ＝ 一個拼音音節
  const CODA_N = '(?:ng|nn|m|n)', CODA_P = '(?:p|t|k|h)';
  const INITIAL = '[phmbtnlkgsj]+';                             // ~<
  const FINAL = '(?:[aeiou][a-z]*|(?:ng|m)h?)';                 // ~>（含 m、ng 成音節）
  const CONS1 = '[b-df-hj-np-tv-z]';                            // V ＝ 非母音字母
  const PREFIX = { ph: '(?:ph|th|kh|tsh)', ts: '(?:tsh|ts|s|j)', p: '(?:ph|p|m|b)', t: '(?:th|t|n|l)', k: '(?:kh|k|ng|g|h)', m: '(?:m|ng|n)' };
  const HAN_RE = /[\u3007\u3400-\u4DBF\u4E00-\u9FFF\uE815-\uE864\uF900-\uFAFF]|[\uD840-\uD87F][\uDC00-\uDFFF]/;
  const noEsc = t => t.replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');   // 去掉跳脫字元與 [...] 字元集後再判斷
  const hasH = t => /\\h/.test(t.replace(/\\[^h]/g, '').replace(/\[[^\]]*\]/g, ''));   // 新增：偵測 \h（一個漢字的短代號，等同 x）；先去掉 \\ 等其他跳脫與 [...] 字元集

  // 新增：音節黏在一起時自動補空格：聲調數字（或 %）後面直接接字母、~ ，視為下一個音節（y0y3 → y0 y3）。\x 跳脫、[...] 字元集、{…} 內不處理
  function splitSyl(t) {
    let out = '', inCls = false, inBr = false, prevEnd = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') { out += c + (t[i + 1] || ''); i++; prevEnd = false; continue; }
      if (inCls) { out += c; if (c === ']') inCls = false; prevEnd = false; continue; }
      if (inBr) { out += c; if (c === '}') inBr = false; prevEnd = false; continue; }
      if (c === '[') { inCls = true; out += c; prevEnd = false; continue; }
      if (c === '{') { inBr = true; out += c; prevEnd = false; continue; }
      if (prevEnd && /[A-Za-z~]/.test(c)) out += ' ';
      out += c; prevEnd = /[0-9%]/.test(c);
    }
    return out;
  }
  // 新增：用了簡易語法、又不含漢字的查詢才補空格（一般的台羅、華語、舊的 {x} 寫法維持原樣）
  const tidySyl = term => (!/\{[A-Za-z0-9~<>]*\}/.test(term) && engaged(term) && !HAN_RE.test(noEsc(term))) ? splitSyl(term) : term;

  function findAA(t) {   // 疊字代號：A~D 連續 2 個以上且有重複，如 AA、ABB、AABC
    const re = /(?<![A-Za-z])[A-D]{2,}(?![A-Za-z])/g; let m;
    while ((m = re.exec(t))) if (new Set(m[0]).size < m[0].length) return true;
    return false;
  }

  // 是否要用簡易語法處理（否則維持原本的查詢方式）
  function engaged(term) {
    if (/\{[A-Za-z0-9~<>]*\}/.test(term)) return false;         // 舊的 {x}{y}… 寫法照舊
    const t = noEsc(term), han = HAN_RE.test(t);
    if (/[x#]/.test(t) || hasH(term) || findAA(t)) return true;   // 修改：加入 hasH(term)，輸入 \h 也啟用簡易語法
    if (han) return false;
    if (/[yvV~%@_]/.test(t) || /(?<=[A-Za-z])0/.test(t)) return true;
    return /[A-Za-z0-9]/.test(t) && /[?*+.|()]|\[/.test(t);      // 台羅含正則符號：改為不自動加 ^$
  }

  function splitTop(term, ch) {   // 在括號、字元集之外，以 ch 切開
    const parts = []; let depth = 0, cur = '';
    for (let i = 0; i < term.length; i++) {
      const c = term[i];
      if (c === '\\') { cur += c + (term[i + 1] || ''); i++; continue; }
      if (c === '[') { let j = i + 1; while (j < term.length && term[j] !== ']') { if (term[j] === '\\') j++; j++; } cur += term.slice(i, j + 1); i = j; continue; }
      if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1);
      if (c === ch && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur); return parts;
  }

  let gN = 0;
  function translate(term) {
    const n = term.length, han = HAN_RE.test(noEsc(term)), seps = [];
    let out = '', i = 0, latin = false, hasAt = false;
    const isL = ch => /[A-Za-z]/.test(ch || '');
    while (i < n) {
      const c = term[i], prev = term[i - 1] || '', rest = term.slice(i);
      let m;
      if (c === '\\') {
        const d = term[i + 1];
        if (d === undefined) { out += '\\\\'; i++; continue; }
        if (d === 'h') { out += HAN; i += 2; continue; }   // 新增：\h ＝ 一個漢字，等同 x（不設 latin）
        out += /[xyvV]/.test(d) ? d : c + d; if (/[A-Za-z0-9]/.test(d)) latin = true; i += 2; continue;
      }
      if (c === '[') {
        let j = i + 1; if (term[j] === '^') j++; if (term[j] === ']') j++;
        while (j < n && term[j] !== ']') { if (term[j] === '\\') j++; j++; }
        if (j >= n) { out += '\\['; i++; continue; }
        const seg = term.slice(i, j + 1); out += seg; if (/[A-Za-z0-9]/.test(seg)) latin = true; i = j + 1; continue;
      }
      if (c === '(' && term[i + 1] === '?') {
        let k = i + 2;
        if (term[k] === '<' && term[k + 1] !== '=' && term[k + 1] !== '!') { const e = term.indexOf('>', k); k = e < 0 ? k + 1 : e + 1; }
        else if (term[k] === '<') k += 2; else k += 1;
        out += term.slice(i, k); i = k; continue;
      }
      if (c === ' ' || c === '-') { let j = i; while (term[j] === ' ' || term[j] === '-') j++; seps.push(term.slice(i, j)); out += '\u0001'; i = j; continue; }
      if (/[A-D]/.test(c) && !isL(prev) && (m = /^[A-D]{2,}(?![A-Za-z])/.exec(rest)) && new Set(m[0]).size < m[0].length) {
        const names = {}; let s = '';
        for (const L of m[0]) { if (names[L]) s += '\\k<' + names[L] + '>'; else { names[L] = 'g' + (gN++) + L; s += '(?<' + names[L] + '>' + HAN + ')'; } }
        out += s; i += m[0].length; continue;
      }
      if (c === 'x') { out += HAN; i++; continue; }
      if (c === '.') { out += ANY; i++; continue; }
      if (!han) {
        if (c === '~') {
          if (term[i + 1] === '<') { out += INITIAL; latin = true; i += 2; continue; }
          if (term[i + 1] === '>') { out += FINAL + TONE; latin = true; i += 2; continue; }
          if ((term[i + 1] === 'm' || term[i + 1] === 'p') && !isL(term[i + 2])) { out += term[i + 1] === 'm' ? CODA_N : CODA_P; latin = true; i += 2; continue; }
          if ((m = /^~([a-z]+)/.exec(rest))) { out += CONS1 + '*' + m[1] + TONE; latin = true; i += m[0].length; continue; }   // 舊寫法 ~ang
          out += SYL; latin = true; i++; continue;
        }
        if (c === '_' && (term[i + 1] === 'm' || term[i + 1] === 'p') && !isL(term[i + 2])) { out += '[a-z]*' + (term[i + 1] === 'm' ? CODA_N : CODA_P) + TONE; latin = true; i += 2; continue; }
        if (!isL(prev) && (m = /^(ph|ts|p|t|k|m)_/.exec(rest))) {
          const nx = term[i + m[0].length] || '';   // 新增：_ 後面直接接字母或數字（中間沒有空格、-）時，只代表聲母：p_a1 ＝ (ph|p|m|b)a1
          out += PREFIX[m[1]] + (/[A-Za-z0-9]/.test(nx) ? '' : '[a-z]*' + TONE);
          latin = true; i += m[0].length; continue;
        }
        if (c === 'y') { out += '[A-Za-z]+'; latin = true; i++; continue; }
        if (c === 'v') { out += '[aeiou]'; latin = true; i++; continue; }
        if (c === 'V') { out += CONS1; latin = true; i++; continue; }
        if (c === '%') { out += '(?:p|t|k|h)?' + TONE; latin = true; i++; continue; }
        if (c === '@') { out += TONE + '(?=$|/)'; hasAt = true; latin = true; i++; continue; }
        if (c === '0' && !/[0-9]/.test(prev)) { out += TONE; latin = true; i++; continue; }
      }
      if (/[A-Za-z0-9\u00C0-\u024F\u0300-\u036F]/.test(c)) latin = true;
      out += c; i++;
    }
    const wrap = latin && !hasAt && !/^\^/.test(term) && !/\$$/.test(term);
    out = out.replace(/\u0001/g, () => latin ? '[ \\-]+' : seps.shift());
    if (latin) seps.length = 0;
    return { body: out, wrap };
  }

  // 修改：精簡轉出的正則——(1) 本體沒有最外層的 | 時，不再多包 (?:…)；(2) 本體以聲調 [1-9] 結尾時，後面不可能再緊接字母，省略結尾邊界 LA
  const comp = (s, exact) => {
    if (exact) return s.body;
    if (!s.wrap) return '(?:' + s.body + ')';
    const b = splitTop(s.body, '|').length > 1 ? '(?:' + s.body + ')' : s.body;
    return LB + b + (/\[1-9\]$/.test(s.body) ? '' : LA);
  };

  // 回傳 { src, hl, and } 或 null（不是簡易語法）
  function toRegex(term, start, end) {
    const exact = !!(start && end), oneSide = !!(start || end) && !exact;   // 修改：exact 改由 start、end 同時勾選而來
    term = term.replace(/\s+/g, ' ').trim();
    if (oneSide ? /\{[A-Za-z0-9~<>]*\}/.test(term) : !engaged(term)) return null;   // 只開頭／只結尾：一律走簡易引擎（不加音節邊界）
    if (!HAN_RE.test(noEsc(term))) term = splitSyl(term);   // 新增：y0y3 → y0 y3
    const segs = splitTop(term, '#').map(s => s.trim()).filter(Boolean);
    if (!segs.length) return null;
    const parts = segs.map(translate);
    if (parts.length === 1) {
      const b = parts[0].body;
      // 修改：多回傳 disp（照字面轉出的本體）與 code（程式額外加的包裝：b 音節邊界、g 只包群組、s／e／se 開頭／結尾／精確）
      // 修改：開頭／結尾勾選不再藏在 code 裡，改成直接寫進 disp 的 ^、$（已有就不重複加）；有勾選時 code 一律 g（只包群組）
      let disp = shortenH(b);
      if (exact || oneSide) disp = withAnchors(disp, exact || start, exact || end);
      const code = exact || oneSide ? 'g' : (parts[0].wrap ? 'b' : 'g');
      return { src: exact ? exactWrap(b) : oneSide ? anchorWrap(b, start, end) : comp(parts[0], false), hl: null, and: false, disp, code };   // 修改：disp 用 \h 縮短
    }
    const src = parts.map(p => '(?=[^]*' + comp(p, false) + ')').join('');   // A#B：每段各有邊界，無法用前後包裝表示，照原樣顯示（code p）
    return { src, hl: '(?:' + parts.map(p => comp(p, false)).join('|') + ')', and: true, disp: shortenH(src), code: 'p' };   // 修改：disp 用 \h 縮短
  }
  // 新增：正則模式的 ^ $ ——框內「開頭的 ^」「結尾的 $」視同勾選（比對方式與 ^開頭／結尾$ 勾選相同：多個讀音以 / 分開者逐一比對、結尾可帶【…】）
  const A_ST = '(?:^|(?<=/))', A_EN = '(?:【[^】]*】)?(?:$|(?=/))';
  const hasTopAlt = x => splitTop(x, '|').length > 1;
  function splitAnchors(t) {   // → { s, e, body }；本體含最外層 | 時（如 ^a|b）不解讀，維持標準正則的意思
    let body = t, s = false, e = false;
    if (body[0] === '^') { s = true; body = body.slice(1); }
    const m = /(\\*)\$$/.exec(body);
    if (m && m[1].length % 2 === 0) { e = true; body = body.slice(0, -1); }
    if ((s || e) && hasTopAlt(body)) return { s: false, e: false, body: t };
    return { s, e, body };
  }
  // 設定開頭／結尾：已有的 ^ $ 不重複加；要加但本體含最外層 | 時，先包 (?:…)
  function withAnchors(t, wantS, wantE) {
    const a = splitAnchors(t); let body = a.body;
    const s = wantS, e = wantE;
    if (!a.s && !a.e && (s || e) && hasTopAlt(body)) body = '(?:' + body + ')';
    return (s ? '^' : '') + body + (e ? '$' : '');
  }
  // 框內文字 → 實際查詢的正則：有 ^ $ 就換成勾選的比對方式，沒有就套轉換時記下的包裝
  function rawExec(t, code) {
    const a = splitAnchors(t);
    if (a.s || a.e) return (a.s ? A_ST : '') + '(?:' + expandH(a.body) + ')' + (a.e ? A_EN : '');
    const [pre, post] = rawWrap(code);
    return pre + expandH(t) + post;
  }
  // 新增：依代碼還原「隱藏的包裝」［前, 後］；p ＝ 不包裝（純正則）
  const RAW_CODES = /^(?:p|b|g|s|e|se)$/;
  function rawWrap(code) {
    if (code === 'p') return ['', ''];
    if (code === 'b') return [LB + '(?:', ')' + LA];
    if (code === 'g') return ['(?:', ')'];
    return [(/s/.test(code) ? '(?:^|(?<=/))' : '') + '(?:', ')' + (/e/.test(code) ? '(?:【[^】]*】)?(?:$|(?=/))' : '')];
  }
  // 新增：只要求開頭或只要求結尾（多個讀音以「/」分開者逐一比對）
  function anchorWrap(body, start, end) {
    return (start ? '(?:^|(?<=/))' : '') + '(?:' + body + ')' + (end ? '(?:【[^】]*】)?(?:$|(?=/))' : '');
  }
  function exactWrap(body) { return '(?:^|(?<=/))(?:' + body + ')(?:【[^】]*】)?(?:$|(?=/))'; }

  // 新增：正則模式專用的短代號 \h ＝ 一個漢字（HAN 的完整寫法）。框內顯示 \h，查詢時才展開；[...] 字元集內與 \\h 的 \\ 不展開
  function expandH(t) {
    let out = '', inCls = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') {
        const d = t[i + 1];
        if (d === undefined) { out += c; continue; }
        out += (d === 'h' && !inCls) ? HAN : c + d;
        i++; continue;
      }
      if (inCls) { if (c === ']') inCls = false; } else if (c === '[') inCls = true;
      out += c;
    }
    return out;
  }
  // 轉為正則時用：HAN → \h，並把只包一個字元的 (?:天)、(?:\h) 拆掉，讓框內文字好讀好改
  function shortenH(t) {
    return t.split(HAN).join('\\h').replace(/\(\?:(\\h|\\[^h]|[^()\\|\[\]?*+{}.^$])\)/g, '$1');
  }
  return { toRegex, tidySyl, exactWrap, anchorWrap, rawWrap, RAW_CODES, expandH, shortenH, splitAnchors, withAnchors, rawExec };
})();

// 「^開頭」「結尾$」「^精確$」開關（記在 localStorage）。精確＝開頭＋結尾
let _simpleHl = null;   // 修改：刪除 _anchor、anchorState()、setAnchor()——^ $ 不再是永久設定，改由搜尋框內的文字決定

// ======== 新增：簡易語法 → 標準正則（單向）========
// 設定／離開原始正則模式，並刷新按鈕與鍵盤面板的勾選狀態
function setRawRx(on, code) {   // 修改：多一個 code（隱藏包裝代碼）
  _rawRx = !!on;
  _rawCode = _rawRx && SIMPLE.RAW_CODES.test(code) ? code : 'p';
  if (!_rawRx) { _rawSrc = ''; _rawHl = null; }
  updateRxUI();
  if (_syncAnchorBoxes) _syncAnchorBoxes();
}
// 搜尋框右側的按鈕：用了簡易語法且尚未轉換 →「轉為正則」；已轉換 → 小標籤「正則模式」（不可點）
function updateRxUI() {
  const btn = document.getElementById('rxBtn'), wrap = searchInput.parentElement;
  if (!btn || !wrap) return;
  let show = false;
  btn.classList.remove('rx-on');   // 修改：已轉為正則（正則模式）就不再顯示圖示，刪除原本的「正則模式」小標籤（rx-on）
  if (!_rawRx) {
    try {
      const term = searchInput.value.trim().replace(/\s+/g, ' ');
      show = !!term && !!SIMPLE.toRegex(SIMPLE.splitAnchors(term).body, false, false);   // 修改：先去掉框內開頭的 ^、結尾的 $ 再判斷：只有真的用到簡易語法才出現
    } catch (e) { show = false; }
    if (show) {   // 修改：提示文字簡化為「轉為正則模式」
      btn.textContent = '.*'; btn.setAttribute('aria-label', '轉為正則模式');
      btn.title = '轉為正則模式';
    }
  }
  wrap.classList.toggle('has-rx', show);
  if (_syncAnchorBoxes) _syncAnchorBoxes();   // 修改：不分模式，三個勾選一律依框內的 ^、$ 顯示（原本只有正則模式）
}
// 按下「轉為正則」：搜尋框改放 SIMPLE.toRegex 的結果（已含 ^ $ 勾選效果），並進入原始正則模式
function convertToRegex() {
  if (_rawRx) return;
  const term = searchInput.value.trim().replace(/\s+/g, ' ');
  const a = SIMPLE.splitAnchors(term);   // 修改：開頭／結尾由框內的 ^、$ 決定（原本讀 anchorState()）
  const r = term && SIMPLE.toRegex(a.body, a.s, a.e);
  if (!r) return;
  searchInput.value = r.disp;   // 修改：只放照字面轉出的本體（a0 → a[1-9]），邊界與 ^$ 由 rawWrap 在背後附加
  _rawSrc = r.disp; _rawHl = r.hl;
  setRawRx(true, r.code);
  searchInput.focus();   // 修改：不立即查詢（刪除 performSearch()），讓使用者先檢視、修改，按 Enter 才查
}
document.getElementById('rxBtn').addEventListener('click', convertToRegex);

// 查詢字串 → 正則字串。簡易語法由 SIMPLE 處理，其餘維持原本流程（searchTermReplaceCore）
function searchTermReplace(searchTerm) {
  _simpleHl = null;
  if (_rawRx) {   // 新增：原始正則模式——框內文字直接當標準正則，不經簡易語法，包裝固定為轉換當下的設定
    const t = String(searchTerm).replace(/\s+/g, ' ').trim();
    if (t === _rawSrc) _simpleHl = _rawHl;   // A#B 轉出的正則仍可標示 A 或 B；使用者改過後就不再標示
    return SIMPLE.rawExec(t, _rawCode);   // 修改：套回隱藏的包裝；框內開頭的 ^、結尾的 $ 換成勾選的比對方式；\h 在這裡展開
  }
  // 修改：開頭／結尾改由框內的 ^、$ 決定（不再讀勾選的永久設定，避免重複套用）
  const a = SIMPLE.splitAnchors(String(searchTerm).replace(/\s+/g, ' ').trim());
  const start = a.s, end = a.e, term = (start || end) ? a.body : searchTerm;
  const r = SIMPLE.toRegex(term, start, end);
  if (r) { _simpleHl = r.hl; return r.src; }
  const src = searchTermReplaceCore(term);
  return start && end ? SIMPLE.exactWrap(src) : (start || end) ? SIMPLE.anchorWrap(src, start, end) : src;
}

function searchTermReplaceCore(searchTerm){

	searchTerm = searchTerm.replace(/{AA}/g,"({x})(\\1)");
	searchTerm = searchTerm.replace(/{ABB}/g,"({x})({x})(\\2)");
	searchTerm = searchTerm.replace(/{ABA}/g,"({x})({x})(\\1)");
	searchTerm = searchTerm.replace(/{AAB}/g,"({x})(\\1)({x})");
	searchTerm = searchTerm.replace(/{AAA}/g,"({x})(\\1)(\\1)");
	searchTerm = searchTerm.replace(/{AAAA}/g,"({x})(\\1)(\\1)(\\1)");
	searchTerm = searchTerm.replace(/{AABB}/g,"({x})\\1({x})\\2");
	searchTerm = searchTerm.replace(/{AAAB}/g,"({x})\\1\\1({x})");
	searchTerm = searchTerm.replace(/{ABBB}/g,"({x})({x})\\2\\2");
	searchTerm = searchTerm.replace(/{ABAB}/g,"({x})({x})\\1\\2");
	searchTerm = searchTerm.replace(/{ABCB}/g,"({x})({x})({x})\\2");
	searchTerm = searchTerm.replace(/{ABAC}/g,"({x})({x})\\1({x})");
	searchTerm = searchTerm.replace(/{AABC}/g,"({x})\\1({x})({x})");
	searchTerm = searchTerm.replace(/{ABCC}/g,"({x})({x})({x})\\3");

	searchTerm = searchTerm.replace(/\{\{~?(\w+)\}\}/g, function(match, p1) {
		return `{y}?(${p1}){t}$`; // 押ang韻的字詞{{ang}}
	});
	searchTerm = searchTerm.replace(/~([a-z]+)/g, '{c0}$1{t}');  // ~ang韻的音

	searchTerm = searchTerm.replace(/{t}|{tone}/g,"([0-9,ˊˇˋˆ⁺^+]{0,3})");
	searchTerm = searchTerm.replace(/{y}/g,"([A-u]+)");
	searchTerm = searchTerm.replace(/~|{~}|{yin}|{py}|{yt}/g,"([A-u]+[1-9,ˊˇˋˆ⁺^+]{0,3})");
	searchTerm = searchTerm.replace(/{v}/g,"([aeiou]+)");
	searchTerm = searchTerm.replace(/{V}|{s}|{c}/g,"([bcdfghjklmnpqrstvwxyz]+)");
	searchTerm = searchTerm.replace(/{v0}/g,"([aeiou]?)");
	searchTerm = searchTerm.replace(/{v1}/g,"([aeiou])");
	searchTerm = searchTerm.replace(/{v2}/g,"([aeiou]{2})");
	searchTerm = searchTerm.replace(/{v3}/g,"([aeiou]{3})");
	searchTerm = searchTerm.replace(/{v4}/g,"([aeiou]{4})");
	searchTerm = searchTerm.replace(/{v5}/g,"([aeiou]{5})");
	searchTerm = searchTerm.replace(/{V0}|{s0}|{c0}/g,"([bcdfghjklmnpqrstvwxyz]?)");
	searchTerm = searchTerm.replace(/{V1}|{s1}|{c1}/g,"([bcdfghjklmnpqrstvwxyz])");
	searchTerm = searchTerm.replace(/{V2}|{s2}|{c2}/g,"([bcdfghjklmnpqrstvwxyz]){2}");
	searchTerm = searchTerm.replace(/{V3}|{s3}|{c3}/g,"([bcdfghjklmnpqrstvwxyz]){3}");
	searchTerm = searchTerm.replace(/{V4}|{s4}|{c4}/g,"([bcdfghjklmnpqrstvwxyz]){4}");
	searchTerm = searchTerm.replace(/{V5}|{s5}|{c5}/g,"([bcdfghjklmnpqrstvwxyz]){5}");

	 // 定義檢查漢字的正則表達式
	  const hanziRegex = /[\u3007\u3400-\u4DB5\u4E00-\u9FCB\uE815-\uE864\uD840-\uD87F][\uDC00-\uDFFF]?/;

	  // 如果是 {x} | {h} | {hanzi}，用漢字範圍代替
	  if (/{x}|{h}|{hanzi}/.test(searchTerm)) {
		searchTerm = searchTerm.replace(/{h}|{x}|{hz}|{hanzi}/g, "[\u3007\u3400-\u4DB5\u4E00-\u9FCB\uE815-\uE864\uD840-\uD87F][\uDC00-\uDFFF]?");
		searchTerm = isStartEnd(searchTerm);
	  } 
	  // 如果不是漢字，則處理拼音或正則符號
		  else if (!hanziRegex.test(searchTerm)) {
			if (/[.?^$[\]()\-*]/.test(searchTerm)) {
			  // 含正則符號（注意 - 是台羅音節連字號，不含其他符號時視為一般台羅）
			  if (/^[^.?^$[\]()*]*$/.test(searchTerm)) {
				return latinTermPattern(searchTerm);
			  }
			  return isStartEnd(searchTerm);
			}
			// 台羅：前後不可緊接其他拉丁字母（音節以 - 或空白分隔）
			return latinTermPattern(searchTerm);
		  } 
		  // // 如果是漢字，直接返回原始查詢字串
	  else {
		
		return searchTerm;
	  }

	return searchTerm;
}

function isStartEnd(searchTerm) {
  if (/^\^/.test(searchTerm) || /\$$/.test(searchTerm)) {
    return searchTerm;  // 已經有 ^ 或 $，直接返回
  } else {
    return "^" + searchTerm + "$";  // 加上 ^ 和 $
  }
}



// 轉義正則表達式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 正則快取
const _reCache = new Map();
function cachedRegex(term) {
  if (!_reCache.has(term)) {
    if (_reCache.size > 50) _reCache.clear();
    try { _reCache.set(term, new RegExp(term, 'i')); }
    catch (e) { _reCache.set(term, new RegExp(escapeRegExp(term), 'i')); }
  }
  return _reCache.get(term);
}

// ======== 列表排序：詞目 > 音讀（預設，詞目依資料原順序）／音讀 > 詞目 ========
const SORT_LABEL = { han: '詞>音', rom: '音>詞' };
let _ordMap = null;                 // 詞條 → 資料原順序（詞目漢字順序）
const _romKeyCache = new Map();     // 詞條 → 音讀排序鍵
function dataOrd(item) {
  if (!_ordMap) { _ordMap = new Map(); dictionary.forEach((it, i) => _ordMap.set(it, i)); }
  const v = _ordMap.get(item); return v == null ? 0 : v;
}
function romSortKey(item) {         // 取主音讀、去掉【白】等標記與調符、轉小寫；「-」視為空格
  let k = _romKeyCache.get(item);
  if (k == null) {
    const v = (item['台羅'] || '').replace(/^【[^】]*】/, '').split('/')[0];
    k = v.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/-/g, ' ').trim();
    _romKeyCache.set(item, k);
  }
  return k;
}
const sortCmp = (x, y) => x < y ? -1 : x > y ? 1 : 0;
function cmpRomThenHan(a, b) {      // 音讀 > 詞目：音讀相同時依詞目（資料原順序）
  const ka = romSortKey(a), kb = romSortKey(b);                 // 新增：先取出兩邊的音讀排序鍵
  if (!ka !== !kb) return ka ? -1 : 1;                          // 新增：沒有音讀的排在有音讀的後面
  return sortCmp(ka, kb) || (dataOrd(a) - dataOrd(b));          // 修改：改用上面的 ka、kb
}
function cmpHanThenRom(a, b) {      // 詞目 > 音讀：詞目（資料原順序）；同一個詞目才比音讀
  const ha = (a['台語'] || '').replace(/【[^】]*】/g, ''), hb = (b['台語'] || '').replace(/【[^】]*】/g, '');
  if (ha === hb) return sortCmp(romSortKey(a), romSortKey(b)) || (dataOrd(a) - dataOrd(b));
  return dataOrd(a) - dataOrd(b);
}

// 搜索結果排序比較
function compareSearchResults(a, b, searchTerm, searchType) {
  function getRelevantValues(item) {
    if (langMap.has(searchType)) {
      return [searchType, ...langMap.get(searchType)].map(field => {
        if (field.includes('本變')) {
          return convertPinyin(item[field] || '')?.pinyinBendiao || '';
        }
        return item[field] || '';
      });
    }
    return isExType(searchType) ? (item[fieldOf(searchType)] || '').split('\n').filter(Boolean) : [item[searchType] || ''];
  }

  // 修改：「分類」欄是逐類完全符合，結果全都同樣符合，不分層級。
  // 原本會拿整個分類字串（如「資源礦物、獸類」）去比層級／開頭，導致只有單一分類的排前面、有多個分類的排後面，
  // 同一個詞目的不同音讀（如 馬 bé／má）因此被拆得很遠。改為直接依排序設定排序。
  if (EXACT_FIELDS.has(searchType)) return window.sortMode === 'rom' ? cmpRomThenHan(a, b) : cmpHanThenRom(a, b);

  const aValues = getRelevantValues(a);
  const bValues = getRelevantValues(b);

  const regex = cachedRegex(searchTerm);

  // 完全符合的排在最前面
  // 符合程度分層：0 完全符合、1 不計聲調、2 縮寫符合、3 混拼符合、4 部分符合；層級小的排前面
  const imeSort = langMap.has(searchType) ? _imeCurQ : '';
  const aTier = tierOfValues(aValues, regex, imeSort), bTier = tierOfValues(bValues, regex, imeSort);
  if (aTier !== bTier) return TIER_RANK[aTier] - TIER_RANK[bTier];   // 修改：依顯示順序（完全 → 不計聲調 → 部分 → 縮寫 → 混拼）

  // 新增：排序設定「音讀 > 詞目」：層級之後直接依音讀排序（略過下方的相關度細項）
  if (window.sortMode === 'rom') return cmpRomThenHan(a, b);

  // 創建部分匹配的正則表達式
  const partialRegex = regex;

  // 新增：檢查是否為單個字符並且符合正則表達式
  const aSingleCharMatch = aValues.some(value => value.length === 1 && partialRegex.test(value));
  const bSingleCharMatch = bValues.some(value => value.length === 1 && partialRegex.test(value));
  if (aSingleCharMatch && !bSingleCharMatch) return -1;
  if (bSingleCharMatch && !aSingleCharMatch) return 1;

  // 其次比較是否以搜尋詞開頭
  const aStartsWith = aValues.some(value => value.startsWith(searchTerm));
  const bStartsWith = bValues.some(value => value.startsWith(searchTerm));
  if (aStartsWith && !bStartsWith) return -1;
  if (bStartsWith && !aStartsWith) return 1;

  // 如果以上條件都不符合，比較匹配的字符串長度，較短的排在前面
  const aMinLength = Math.min(...aValues.filter(value => partialRegex.test(value)).map(value => value.length));
  const bMinLength = Math.min(...bValues.filter(value => partialRegex.test(value)).map(value => value.length));
  if (aMinLength < bMinLength) return -1;
  if (bMinLength < aMinLength) return 1;

  // 如果長度也相同：依「詞目 > 音讀」排序（原本是保持資料原順序）
  return cmpHanThenRom(a, b);
}

// 「分類」欄須完全符合：以「、」切成各個類別，逐一與查詢詞整體比對（查「生」不會找到「生養老死」）
const EXACT_FIELDS = new Set(['分類']);
let _catSub = null;   // 新增：目前查詢若是分類階層的小類／大類，這裡放比對函式（見 catPredicate）
const _exactCache = new Map();
function fieldTest(regex, type, value) {
  if (regex.imeQ) regex = regex.plain;   // 輸入法式只用在「詞目」分頁（langMap）；例句、釋義等分頁維持原本的比對
  if (isExType(type) || type === '釋義') return (value || '').split('\n').some(l => regex.test(l));   // 例句、釋義：逐行比對
  if (!EXACT_FIELDS.has(type)) return regex.test(value || '');
  if (_catSub) return _catSub(value || '');   // 新增：查詢詞是分類階層的「小類／大類」時，改用階層比對
  let ex = _exactCache.get(regex);
  if (!ex) { ex = new RegExp('^(?:' + regex.source + ')$', regex.flags.replace(/[gy]/g, '')); _exactCache.set(regex, ex); }
  return (value || '').split('、').some(part => ex.test(part.trim()));
}

// 生成>搜索類型選擇器
function generateSearchTypeSelector() {
    const selectorContainer = document.createElement('div');
    selectorContainer.className = 'search-type-selector';

    // 從 localStorage 讀取已儲存的搜索類型
    const savedSearchType = localStorage.getItem(myLocal + 'currentSearchType');
    if (savedSearchType && savedSearchType !== '分類' && searchTypes.includes(savedSearchType)) {
        currentSearchType = savedSearchType;
    }

    const orderedTypes = [...searchTypes];   // 已移除「華語對照」分頁
    const TAB_LABELS = { '近義詞': '近義', '反義詞': '反義', [EX_ZH]: '華例' };   // 分頁上的簡稱

    orderedTypes.forEach(type => {
        const button = document.createElement('button');
        const buttonContent = document.createElement('div');
        buttonContent.textContent = TAB_LABELS[type] || colLabel(type);
        buttonContent.dataset.type = type;
        const countSpan = document.createElement('span');
        countSpan.className = 'type-count';
        countSpan.id = `count-${type}`;
        countSpan.textContent = '';
        button.appendChild(buttonContent);
        button.appendChild(countSpan);
        button.id = `button-${type}`;
        if (type === '分類' && currentSearchType !== '分類') button.classList.add('tab-hidden');   // 預設不顯示
        if (type === NAME_TAB && currentSearchType !== NAME_TAB) button.classList.add('tab-hidden');   // 新增：「姓名」預設不顯示，查得到姓名（筆數 > 0）時才顯示
        button.addEventListener('click', () => {
            if (!button.disabled) {
                currentSearchType = type;
                if (!isSpecialTab(type)) localStorage.setItem(myLocal + 'currentSearchType', type);   // 修改：姓名分頁也不記住
                if (hasSearchResults || searchInput.value.trim() ) {
                    performSearch();
                }
                updateActiveSearchType();
            }
        });
        selectorContainer.appendChild(button);
    });
    return selectorContainer;
}

// 計算>搜索類型選擇器筆數
function calculateTypeCounts(regex) {
    if (!regex) return;
    const typeCounts = {};   // 新增：先記下各分頁筆數（已扣掉不顯示的混拼），迴圈結束後再決定是否切換分頁
    searchTypes.forEach(type => {
        let count = 0;
        if (langMap.has(type)) {
            const searchFields = [type, ...langMap.get(type)];
            let arr = dictionary.filter(item =>
                searchFields.some(field => {
                    if (field.includes('本變')) {
                        return regex.test(convertPinyin(item[field] || '')?.pinyinBendiao || '');
                    }
                    return regex.test(item[field] || '');
                })
            );
            if (!window.showMixed && _imeCurQ) {   // 新增：不顯示「混拼符合」時，分頁筆數也要扣掉
                const re = regex.plain || regex;   // 修改：直接用傳進來的正則，不再對每個分頁重新轉換查詢字串（searchTermReplace + cachedRegex）
                arr = arr.filter(it => tierOfValues(getRelevantValues(it, type), re, _imeCurQ) !== 3);
            }
            count = arr.length;
        } else if (type === NAME_TAB) {   // 新增：姓名分頁的筆數 ＝ 讀音組合數
            count = nameCount(searchInput.value);
        } else {
            count = dictionary.filter(item =>
                fieldTest(regex, type, item[fieldOf(type)])
            ).length;
        }
        typeCounts[type] = count;   // 新增
        const button = document.getElementById(`button-${type}`);
        const countElement = document.getElementById(`count-${type}`);
        if (countElement) {
            countElement.textContent = count.toLocaleString();
            countElement.title = `${count} 筆`;
        }
        if (button) {
            button.disabled = count === 0;
            if (type === NAME_TAB) button.classList.toggle('tab-hidden', count === 0 && currentSearchType !== NAME_TAB);   // 新增：姓名分頁有值才顯示
        }
    });
    // 新增：目前分頁沒有結果時，切到第一個「有結果」的其他分頁（用上面算好的筆數判斷，與分頁數字一致）
    if (typeCounts[currentSearchType] === 0) {
        const firstValidType = searchTypes.find(t => t !== currentSearchType && typeCounts[t] > 0);
        if (firstValidType) {
            currentSearchType = firstValidType;
            updateActiveSearchType();
            performSearch();
            return;
        }
        // 新增：停在「姓名」分頁、但姓名查不到，其他分頁也都沒結果 → 回到預設分頁，顯示一般的「沒有找到匹配的結果」
        if (currentSearchType === NAME_TAB) {
            currentSearchType = defaultType();
            updateActiveSearchType();
            performSearch();
            return;
        }
    }
    syncExScope();
}

// 更新>搜索類型樣式
const HIDDEN_TAB = '分類';
function updateActiveSearchType() {
    const buttons = document.querySelectorAll('.search-type-selector button');
    buttons.forEach(button => {
        const t = button.querySelector('div').dataset.type;
        // 手機版「華語例句」分頁隱藏，改由小切換選擇；此時讓「例句」分頁保持亮起
        const on = t === currentSearchType;   // 例句、華例並列為分頁（手機版也一樣）
        button.classList.toggle('active', on);
        // 「分類」分頁平常隱藏，只有從詳細頁點分類標籤進來（目前正在看分類）時才出現
        if (t === HIDDEN_TAB) button.classList.toggle('tab-hidden', !on);
    });
    syncExScope();
}

// ======== 例句範圍切換：電腦版用分頁（「例句」「華語例句」並列）；手機版隱藏「華語例句」分頁，改用下方小切換 ========
const _mqMobile = window.matchMedia('(max-width: 768px)');
function createExScope() {
    const box = document.createElement('div');
    box.className = 'ex-scope';
    box.id = 'exScope';
    box.innerHTML = [['例句', '台語例句'], [EX_ZH, '華語例句']].map(([t, label]) =>
        `<button type="button" data-t="${t}">${label}<span class="type-count"></span></button>`).join('');
    box.addEventListener('click', e => {
        const b = e.target.closest('button[data-t]'); if (!b || b.disabled) return;
        const tab = document.getElementById('button-' + b.dataset.t);
        if (tab) { tab.disabled = false; tab.click(); }
    });
    return box;
}
function syncExScope() {
    const box = document.getElementById('exScope'); if (!box) return;
    box.classList.toggle('show', isExType(currentSearchType));
    const n = {};
    box.querySelectorAll('button[data-t]').forEach(b => {
        const t = b.dataset.t, c = document.getElementById('count-' + t);
        n[t] = c ? c.textContent : '';
        b.querySelector('.type-count').textContent = n[t];
        b.classList.toggle('active', t === currentSearchType);
        b.disabled = n[t] === '0' && t !== currentSearchType;
    });
    // 手機版：兩個範圍都沒有結果，「例句」分頁才停用（只有華語那邊有結果時，仍要能進入）
    const tab = document.getElementById('button-例句');
}
_mqMobile.addEventListener('change', () => { updateActiveSearchType(); });




let ITEMS_PER_PAGE = parseInt(localStorage.getItem(myLocal + 'itemsPerPage')) || 20; // 每頁顯示的結果數量


let _lastPage = 1;
// 搜尋「例句／華語例句」時：一個符合的例句一列（序、詞目、台羅、例句）
function buildExampleRows(list) {
    const re = _hlRe, rows = [];
    if (!re) return rows;
    list.forEach((item, i) => {
        (item['例句'] || '').split('<br>').filter(Boolean).forEach(line => {
            const body = line.replace(/^\[\d+\] /, '');
            const m = body.match(/^([^（]*)（([^）]*)）([\s\S]*)$/);
            let hit;
            if (currentSearchType === '例句') hit = m ? (re.test(m[1]) || re.test(m[2].normalize('NFC'))) : re.test(body);
            else hit = !!m && re.test(m[3].trim());
            if (hit) rows.push({ item, i, line });
        });
    });
    return rows;
}
function exampleRowsHtml(rows) {
    const lab = (t, title) => `<span class="mobile-header"${title ? ` title="${title}"` : ''}>${t}</span>`;
    let html = `<table class="results-table ex-table"><thead><tr><th aria-label="序號"></th><th>${colLabel('台語')}${colLabel('台羅')}</th><th>例句</th></tr></thead><tbody>`;   // 修改：「詞目」「音讀」兩欄合併成「詞目音讀」
    rows.forEach(({ item, i, line }) => {
        const m = line.match(/^\[(\d+)\] ([\s\S]*)$/);
        const hanLen = Array.from(String(item['台語'] || '').replace(/【[^】]*】/g, '').replace(/[\s,，、\/／()（）]/g, '')).length;
        const short = hanLen > 0 && hanLen <= 2;   // 手機版：詞目 2 字以內，音讀接在詞後；否則音讀另一列
        const hasRom = !!String(item['台羅'] || '').trim();
        html += `<tr class="${short && hasRom ? 'ex-short' : ''}">
            <td class="m-row">${lab('序', '序號')}<a href="#" class="item-number" data-index="${i}" onclick="showFullData(${i}); return false;">${displayNo(i)}</a></td>
            <td data-lang-type="language" class="ex-word">
                <div class="m-line">${lab('詞', colLabel('台語'))}<div class="m-val"><div class="ex-han">${toneHanHtml(item['台語'], item['台羅'])}${short && hasRom ? `<span class="ex-inl-rom">${romHtml(item['台羅'])}</span>` : ''}</div></div></div>
                ${hasRom ? `<div class="m-line m-rom-line">${lab('音', colLabel('台羅'))}<div class="m-val"><div class="ex-rom">${romHtml(item['台羅'])}</div></div></div>` : ''}
            </td>
            <td class="ex-cell m-row">${lab('例', '例句')}<div class="m-val"><div class="ex-item ex-mode-${window.exMode || 'ruby'}">${exampleHtml(m ? m[2] : line, true)}</div></div></td>
        </tr>`;
    });
    return html + '</tbody></table>';
}

function displayResults(filteredData, currentPage) {
    _lastPage = currentPage || 1;
    const resultsContainer = document.getElementById('results');
    const exampleMode = isExType(currentSearchType) && filteredData.length > 0;
    const exRows = exampleMode ? buildExampleRows(filteredData) : null;
    const totalItems = exampleMode ? exRows.length : filteredData.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    
    // 為每筆資料添加全局索引
    const pageData = exampleMode ? exRows.slice(startIndex, endIndex) : filteredData.slice(startIndex, endIndex).map((item, localIndex) => ({
        ...item,
        globalIndex: startIndex + localIndex
    }));

    if (filteredData.length > 0) {
        searchHeader.classList.add('has-results');
        resultsContainer.classList.add('has-results');
    } else {
        searchHeader.classList.remove('has-results');
        resultsContainer.classList.remove('has-results');
    }


    let html = '';

    if (pageData.length === 0) {
        html = '<div class="no-results">沒有找到匹配的結果</div>';
    } else if (exampleMode) {
        html = exampleRowsHtml(pageData);
    } else {
        function formatHeader(header) {
            const langType = getLangType(header);
            if (header === '詔安拼音本變') {
                return `<th data-lang-type="${langType}">本音</th><th data-lang-type="${langType}">變音</th>`;
            }
            if (header === '台羅') {
                return `<th data-lang-type="${langType}"><button type="button" class="rom-toggle" title="切換音讀：全／主／副">${colLabel(header)}<span class="rom-mode">${ROM_LABEL[window.romMode || 'full']}</span></button></th>`;
            }
            if (header === '釋義') {
                return `<th data-lang-type="${langType}"><button type="button" class="def-toggle" title="切換釋義顯示：完整／標準／精簡">${colLabel(header)}<span class="rom-mode">${DEF_LABEL[window.defMode || 'brief']}</span></button></th>`;
            }
            if (header === '台語') {   // 新增：「詞目」表頭可切換排序
                return `<th data-lang-type="${langType}"><button type="button" class="sort-toggle" title="切換排序：詞目＞音讀／音讀＞詞目">${colLabel(header)}<span class="rom-mode">${SORT_LABEL[window.sortMode || 'han']}</span></button></th>`;
            }
            return `<th data-lang-type="${langType}">${colLabel(header)}</th>`;
        }

        // 生成表頭內容
        const displayColumns = getDisplayColumns();   // 修改：改用含「暫時顯示欄位」的清單
        const tableHeaders = displayColumns.map(formatHeader).join('');

        // 組合成完整的 HTML 結構
        html = `
            <table class="results-table">
                <thead>
                    <tr>
                        <th aria-label="序號"></th>
                        ${tableHeaders}
                    </tr>
                </thead>
                <tbody>
        `;

        // 分層標題（完全符合／不計聲調／縮寫符合／部分符合）：結果已排序，在各層交界插入標題列
        const _term = searchTermReplace(searchInput.value.trim());
        const _T = tierInfo();
        let prevTier = startIndex > 0 && _T.grouped ? _T.tiers[startIndex - 1] : null;
        // 沒有更高層級時：第一頁最上方補一行摘要「完全符合 0 筆　部分符合 N 筆」
        if (!_T.grouped && startIndex === 0 && _term && filteredData.length > 0 && !EXACT_FIELDS.has(currentSearchType)) {
            html += `<tr class="group-row group-partial group-none"><td colspan="99">完全符合<span class="group-n">0 筆</span><span class="group-sep"></span>部分符合<span class="group-n">${filteredData.length} 筆</span></td></tr>`;
        }
        pageData.forEach((item, localIndex) => {
            const globalIndex = startIndex + localIndex;
            const tier = _T.tiers[globalIndex], isExactMatch = tier === 0;
            if (_T.grouped && tier !== prevTier) {
                html += `<tr class="group-row ${isExactMatch ? 'group-exact' : 'group-partial'}"><td colspan="99">${TIER_LABELS[tier]}<span class="group-n">${_T.counts[tier]} 筆</span></td></tr>`;
            }
            prevTier = tier;
            const hanLen = Array.from(String(item['台語'] || '').replace(/【[^】]*】/g, '').replace(/[\s,，、\/／()（）]/g, '')).length;   // 詞目字數（不含【替】標記）
            const inlRom = displayColumns.includes('台語') && displayColumns.includes('台羅') && hanLen > 0 && hanLen <= 2;   // 手機版「音讀接在詞後」：要有詞目、音讀兩欄，且詞目 2 字以內才接（3 字以上維持分開一列）
            html += `<tr class="${isExactMatch ? 'exact-match' : ''}${inlRom ? ' has-inl' : ''}">`;
            html += `
                <td class="m-row">
                    <span class="mobile-header" title="序號">序</span>
                    <a href="#" class="item-number ${isExactMatch ? 'exact-match' : ''}" data-index="${globalIndex}" onclick="showFullData(${globalIndex}); return false;">${displayNo(globalIndex)}</a>
                </td>
            `;
            
            displayColumns.forEach((header) => {   // 修改：selectedColumns → displayColumns
                const langType = getLangType(header);
                if (header === '詔安拼音本變') {
                    const { pinyinBendiao, pinyinBiandiao } = convertPinyin(item[header]);
                    html += `
                        <td data-lang-type="${langType}">
                            <span class="mobile-header">本音</span>
                            ${pinyinBendiao}
                        </td>
                        <td data-lang-type="${langType}">
                            <span class="mobile-header">變音</span>
                            ${pinyinBiandiao}
                        </td>
                    `;
                } else {
                    html += `
                        <td data-lang-type="${langType}" class="m-row${String(item[header] == null ? '' : item[header]).trim() ? '' : ' m-empty'}${header === '台羅' && inlRom ? ' m-rom-td' : ''}">
                            <span class="mobile-header" title="${colLabel(header)}">${mobLabel(header)}</span><div class="m-val">
                            ${header === '台羅' ? romHtml(item[header]) : header === '釋義' ? hlHtml(defListHtml(item[header])) : header === '例句' ? listExamplesHtml(item[header]) : header === '台語' ? toneHanHtml(item[header], item['台羅']) : (item[header] || '')}${header === '台語' && inlRom && String(item['台羅'] || '').trim() ? `<span class="m-inl-rom">${romHtml(item['台羅'])}</span>` : ''}${header === '台語' && variantIdSet.has(item['詞目id']) ? ` <a href="#" class="tag-sub tag-var" title="有各地腔調（點擊查看）" onclick="window._goVariants = true; showFullData(${globalIndex}); return false;">腔</a>` : ''}</div>
                        </td>
                    `;
                }
            });
            
            html += '</tr>';
        });
        
        html += '</tbody></table>';
    }
    
    resultsContainer.innerHTML = html;
  
  resultsContainer.appendChild(generatePagination(totalItems, currentPage, totalPages));

    if (window.innerWidth > 768) {
        const table = document.querySelector('.results-table');
        if (table) {
            const header = table.querySelector('thead');
            const handleScroll = () => {
                const tableRect = table.getBoundingClientRect();
                if (tableRect.top <= 0 && tableRect.bottom > window.innerHeight) {
                    header.classList.add('sticky');
                } else {
                    header.classList.remove('sticky');
                }
            };

            window.addEventListener('scroll', handleScroll);
            // 在組件卸載時移除事件監聽器
            return () => {
                window.removeEventListener('scroll', handleScroll);
            };
        }
    }
}

// 語言類型
function getLangType(header) {
  for (const [lang, pinyins] of langMap.entries()) {
    if (header === lang) return 'language';
    if (pinyins.includes(header)) return 'pinyin';
  }
  return 'other';
}

// ======== 符合程度分層：完全符合 → 不計聲調 → 縮寫符合 → 混拼符合 → 部分符合 ========
// 不計聲調＝去聲調後與詞目台羅相同（sikan＝sî-kan）；縮寫符合＝每個音節只打聲母（kaj＝kin-á-ji̍t）；混拼符合＝有的音節打整個、有的只打開頭（kaj→ka-jîn）
const TIER_LABELS = ['完全符合', '不計聲調', '縮寫符合', '混拼符合', '部分符合'];
const TIER_SHORT = ['全合', '略調', '縮寫', '混拼', '部分'];   // 詳細檢視（側邊清單）用的短名稱
const TIER_ORDER = [0, 1, 4, 2, 3];   // 顯示順序：完全符合 → 不計聲調 → 部分符合 → 縮寫符合 → 混拼符合
const TIER_RANK = [0, 1, 3, 4, 2];    // 層級 → 名次（與 TIER_ORDER 互為反查）
// 新增：完全符合時，詞目前後的【替】【白】等標記不算（「揣【替】」查「揣」算完全符合）
// 修改：一個詞有多個讀音時（台羅以「/」分開，如 tshuē/tshē），任何一個讀音完全符合就算完全符合
function wholeMatch(v, re) {
  if (wholeMatch1(v, re)) return true;
  if (v.indexOf('/') < 0) return false;
  return v.split('/').some(p => { p = p.trim(); return p && wholeMatch1(p, re); });
}
function wholeMatch1(v, re) {   // 原本的 wholeMatch：整個字串（略過前後的【替】等標記）被一次比對吃完
  let m = v.match(re);
  if (m && m[0].length === v.length) return true;
  const c = v.replace(/^(?:【[^】]*】)+|(?:【[^】]*】)+$/g, '');
  if (c === v) return false;
  m = c.match(re);
  return !!m && m[0].length === c.length;
}
function tierOfValues(values, re, q) {
  if (values.some(v => wholeMatch(v, re))) return 0;
  if (q) {
    if (imeExactVals(values, q)) return 1;
    if (!values.some(v => re.test(v))) return imeInitialsVals(values, q) ? 2 : 3;   // 原正則沒中、只有輸入法式中：純聲母縮寫 / 混拼
  }
  return 4;
}
let _tierKey = null, _tierVal = null;
// 結果已排序（層級小的在前）：算出每筆的層級、各層筆數與起點
function tierInfo() {
  const term = searchTermReplace(searchInput.value.trim());
  if (_tierKey && _tierKey[0] === filteredData && _tierKey[1] === currentSearchType && _tierKey[2] === term && _tierKey[3] === _imeCurQ) return _tierVal;
  const n = filteredData.length, tiers = new Array(n).fill(4), counts = [0, 0, 0, 0, 0];
  if (!isExType(currentSearchType) && !EXACT_FIELDS.has(currentSearchType)) {
    const re = cachedRegex(term), q = langMap.has(currentSearchType) ? _imeCurQ : '';
    for (let i = 0; i < n; i++) tiers[i] = tierOfValues(getRelevantValues(filteredData[i], currentSearchType), re, q);
  }
  tiers.forEach(t => counts[t]++);
  const start = [0, 0, 0, 0, 0]; let acc = 0;   // 各層在結果中的起點（依顯示順序累加）
  TIER_ORDER.forEach(t => { start[t] = acc; acc += counts[t]; });
  _tierKey = [filteredData, currentSearchType, term, _imeCurQ];
  _tierVal = { tiers, counts, start, grouped: n > 0 && (tiers[0] !== 4 || counts[2] + counts[3] > 0) };   // 只有「部分符合」一層時，不加分組標題
  return _tierVal;
}
function exactCount() { return tierInfo().counts[0]; }
// 顯示用的序號：每一層各自從 1 起算（只有部分符合時就是一般序號）
function displayNo(i) { const T = tierInfo(); return T.grouped ? i - T.start[T.tiers[i]] + 1 : i + 1; }

function isExactMatchItem(item, searchTerm, searchType) {
  if (EXACT_FIELDS.has(searchType)) return false;   // 「分類」本來就只列完全符合的結果，全部都符合，不再另外標示
  const relevantValues = getRelevantValues(item, searchType);
  let regex;
  try {
    regex = new RegExp(searchTerm, 'i');
  } catch (e) {
    // 如果不是有效的正則表達式，則使用普通字符串搜索
    regex = new RegExp(escapeRegExp(searchTerm), 'i');
  }
  return relevantValues.some(value => wholeMatch(value, regex));   // 修改：改用 wholeMatch（略過前後的【替】等標記）
}

function getRelevantValues(item, searchType) {
  if (langMap.has(searchType)) {
    return [searchType, ...langMap.get(searchType)].map(field => {
      if (field.includes('本變')) {
        return convertPinyin(item[field] || '')?.pinyinBendiao || '';
      }
      return item[field] || '';
    });
  }
  return isExType(searchType) ? (item[fieldOf(searchType)] || '').split('\n').filter(Boolean) : [item[searchType] || ''];
}

// 生成>分頁導覽
function generatePagination(totalItems, currentPage, totalPages) {
    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'pagination';

    // 首頁按鈕
    const firstPageButton = document.createElement('button');
    firstPageButton.textContent = '頭';
    firstPageButton.disabled = currentPage === 1;
    firstPageButton.addEventListener('click', () => changePage(1));
    paginationContainer.appendChild(firstPageButton);

    // 上一頁
    const isMobile = window.innerWidth <= 768;
    const prevButton = document.createElement('button');
    prevButton.textContent = isMobile ? '‹' : '‹ 上一頁';
    prevButton.title = '上一頁';
    prevButton.className = 'page-nav';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => changePage(currentPage - 1));
    paginationContainer.appendChild(prevButton);

    // 頁碼按鈕：只顯示目前頁前後幾頁（電腦 5 個、手機 3 個），按鈕可以做大一些
    const maxVisiblePages = isMobile ? 3 : 5;
    const startPage = Math.max(1, Math.min(currentPage - Math.floor(maxVisiblePages / 2), totalPages - maxVisiblePages + 1));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.classList.toggle('active', i === currentPage);
        pageButton.addEventListener('click', () => changePage(i));
        paginationContainer.appendChild(pageButton);
    }

    // 下一頁
    const nextButton = document.createElement('button');
    nextButton.textContent = isMobile ? '›' : '下一頁 ›';
    nextButton.title = '下一頁';
    nextButton.className = 'page-nav';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => changePage(currentPage + 1));
    paginationContainer.appendChild(nextButton);

    // 尾頁按鈕
    const lastPageButton = document.createElement('button');
    lastPageButton.textContent = '尾';
    lastPageButton.disabled = currentPage === totalPages;
    lastPageButton.addEventListener('click', () => changePage(totalPages));
    paginationContainer.appendChild(lastPageButton);

    // 跳到指定頁面
    const jumpContainer = document.createElement('div');
    jumpContainer.className = 'jump-container';
    
    const jumpInput = document.createElement('input');
    jumpInput.type = 'number';
    jumpInput.min = 1;
    jumpInput.max = totalPages;
    jumpInput.placeholder = `共${totalPages}頁`;

    jumpInput.addEventListener('focus', () => {
        jumpInput.placeholder = '跳到...';
    });

    // 修改輸入處理邏輯
    jumpInput.addEventListener('change', (e) => {
        let page = parseInt(e.target.value);
        
        // 如果輸入的頁數大於總頁數，則跳到最後一頁
        if (page > totalPages) {
            page = totalPages;
        }
        
        // 如果輸入有效數字且大於等於1
        if (page && page >= 1) {
            changePage(page);
            e.target.value = ''; // 清空輸入框
            jumpInput.placeholder = `共${totalPages}頁`; // 恢復提示文字
        }
    });

    jumpContainer.appendChild(jumpInput);
    // 把 jumpContainer 放在尾頁按鈕左邊
    paginationContainer.insertBefore(jumpContainer, lastPageButton);

  // 每頁顯示筆數選單
  const itemsPerPageContainer = document.createElement('div');
  itemsPerPageContainer.className = 'items-per-page-container';
  const itemsPerPageSelect = document.createElement('select');
  itemsPerPageSelect.id = 'itemsPerPageSelect';
  [5, 10, 20, 50, 100].forEach(num => {
    const option = document.createElement('option');
    option.value = num;
    option.textContent = `${num}/頁`;
    if (num === ITEMS_PER_PAGE) {
      option.selected = true;
    }
    itemsPerPageSelect.appendChild(option);
  });
  itemsPerPageSelect.addEventListener('change', (e) => {
    const newItemsPerPage = parseInt(e.target.value);
    changeItemsPerPage(newItemsPerPage);
  });
  itemsPerPageContainer.appendChild(itemsPerPageSelect);

  paginationContainer.insertBefore(itemsPerPageContainer, lastPageButton.nextSibling);

  return paginationContainer;
}

function changeItemsPerPage(newItemsPerPage) {
  ITEMS_PER_PAGE = newItemsPerPage;
  localStorage.setItem(myLocal + 'itemsPerPage', newItemsPerPage);
  performSearch();
}


function changePage(newPage) {
    // 不需要重新過濾數據，只需要重新排序和顯示
    
    const searchTerm = searchInput.value.trim();
    
    // 重新排序 filteredData
    filteredData.sort((a, b) => compareSearchResults(a, b, searchTerm, currentSearchType));

    // 顯示新頁面的結果
    displayResults(filteredData, newPage);
    syncUrl('replace');

    // 滾動到結果容器的頂部
    const resultsContainer = document.getElementById('results');
    resultsContainer.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start'
    });
}

// 執行搜尋
// 新增：搜尋框下方的錯誤提示（正則格式有誤時顯示；用 var 避免啟動時還原網址、比宣告更早呼叫而出錯）
var _rxErrEl = null;
function showRxError(msg) {
  if (!_rxErrEl) {
    if (!msg) return;
    _rxErrEl = document.createElement('div');
    _rxErrEl.className = 'rx-error'; _rxErrEl.setAttribute('role', 'status');
    const w = document.querySelector('.search-wrapper');
    if (w) w.insertAdjacentElement('afterend', _rxErrEl);
  }
  _rxErrEl.textContent = msg; _rxErrEl.hidden = !msg;
}
// 新增：搖晃搜尋框（查不到、或查詢被擋下時使用）；連續觸發時會重新播放動畫
function shakeSearchInput() {
  searchInput.classList.remove('shake'); void searchInput.offsetWidth;
  searchInput.classList.add('shake');
  setTimeout(() => searchInput.classList.remove('shake'), 300);
}
// 新增：統一判斷「無意義的查詢」——沒有查詢內容，或會比對到全部資料的寫法（^$、^、$、.、.+、.*、x*、y*、[^x]、\S…）。
// 回傳要提示的文字；空字串表示可以查詢。
// 作法：不逐一列舉寫法，而是拿幾個不同的字串去試——整組都比對得上，就代表這個寫法沒有篩選效果。
// 正則模式（_rawRx）維持標準正則的意思，所以 ^$（找空白欄位）仍可使用；不過 .*、x* 這類照樣擋。
var MEANINGLESS_PROBES = ['a', 'Z', '1', '漢', 'ab-cd', 'tai-uan', '台灣話'];
var MSG_ALL = '這個寫法會比對到全部資料，請加上要查的字';
function isMeaninglessQuery(term, rawRx) {
  term = String(term || '').trim();
  if (!term) return '';   // 空白由 performSearch 另外處理（清空結果、回首頁）
  if (!rawRx && /^[\^$\s]+$/.test(term)) return '只有 ^、$ 而沒有內容，請加上要查的字';
  if (/^.?\*$/.test(term)) return MSG_ALL;   // 任一字元加 *（含單獨的 *，它不是合法正則，下面測不到）
  let re;
  try { re = new RegExp(term, 'i'); } catch (e) { return ''; }   // 格式有誤的，交給後面原本的提示處理
  return MEANINGLESS_PROBES.every(p => re.test(p)) ? MSG_ALL : '';
}
function performSearch() {
  let searchTerm = searchInput.value.trim().replace(/\s+/g, ' ');
  if (!searchTerm) setRawRx(false); else updateRxUI();   // 新增：清空就離開正則模式；其餘刷新按鈕
  searchClear.style.display = searchInput.value ? 'block' : 'none';   // 新增：程式代入搜尋框文字（分類、相關詞點選）時，也要顯示 X 按鈕

    // 修改：無意義的查詢（^$、.、.+、x*、y*…）統一由 isMeaninglessQuery() 判斷；擋下時搖晃搜尋框，並在搜尋框下方說明原因
    const _meaningless = isMeaninglessQuery(searchTerm, _rawRx);
    if (_meaningless) { showRxError(''); shakeSearchInput(); return; }   // 修改：只搖晃搜尋框，不再顯示說明文字（搖晃已足以提示）

  if (!searchTerm) {
    showRxError('');   // 新增
    const _wasResults = hasSearchResults;   // 新增：原本有結果、現在清空回首頁時，分頁回到「詞目」
    clearSearchResults();
    if (_wasResults) resetHomeTab();
    return;
  }

  if (!_restoring) currentDetailId = null;   // 新的查詢會關閉詳細檢視
  _catSub = currentSearchType === '分類' ? catPredicate(searchTerm) : null;   // 新增：判斷是否為小類／大類

  // 正則替換
  searchTerm = searchTermReplace(searchTerm);
  // 聲調替換

  // 新增：檢查是否為正則表達式
  let regex;
  showRxError('');   // 新增：先清掉上一次的錯誤提示
  try {
    regex = new RegExp(searchTerm, 'i');
  } catch (e) {
    // 如果不是有效的正則表達式，則使用普通字符串搜索
    regex = new RegExp(escapeRegExp(searchTerm), 'i');
    showRxError('正則格式有誤（' + String(e.message).replace(/^.*:\s*/, '') + '），已改以文字原樣搜尋');   // 新增：告訴使用者為什麼結果怪怪的
  }
  _hlRe = regex;   // 供結果標示使用
  if (_simpleHl) { try { _hlRe = new RegExp(_simpleHl, 'i'); } catch (e) {} }   // 新增：A#B 查詢標示 A 或 B
  const _imeQ = _rawRx ? '' : imeQuery(searchInput.value);   // 修改：原始正則模式不啟用輸入法式   // 輸入法式查詢（標示仍用上面的原正則）
  if (_imeQ) regex = new ImeRegExp(regex.source, regex.flags, _imeQ);
  _imeCurQ = _imeQ;

  // 計算並更新所有類型的筆數
  calculateTypeCounts(regex);

  // 新增：姓名分頁：另有顯示方式
  if (currentSearchType === NAME_TAB) {
    syncSearchUrl();
    performNameSearch();
    return;
  }

  // 華語對照分頁：另有顯示方式
  if (currentSearchType === COMPARE_TAB) {
    syncSearchUrl();
    performCompareSearch(regex.plain || regex);
    return;
  }
  updateCompareCount(regex);

  // 過濾數據
  filteredData = hideMixedTier(filterData(regex));   // 新增：設定為不顯示時，去掉「混拼符合」

  // 排序結果
  sortFilteredData(searchTerm);

  // 顯示第一頁結果
  displayResults(filteredData, 1);
  syncSearchUrl();
  if (filteredData.length) addSearchHistory();   // 新增：有結果的查詢才記到歷史

    hasSearchResults = filteredData.length > 0;

    // 當完全搜尋不到資料時，添加晃動效果
    if (filteredData.length === 0) shakeSearchInput();   // 修改：改呼叫 shakeSearchInput()
}

function filterData(regex) {
    if (langMap.has(currentSearchType)) {
        const searchFields = [currentSearchType, ...langMap.get(currentSearchType)];
        return dictionary.filter(item =>
            searchFields.some(field => {
                if (field.includes('本變')) {
                    const { pinyinBendiao } = convertPinyin(item[field] || '');
                    return regex.test(pinyinBendiao);
                }
                return regex.test(item[field] || '');
            })
        );
    } else {
        return dictionary.filter(item =>
            fieldTest(regex, currentSearchType, item[fieldOf(currentSearchType)])
        );
    }
}

// 新增：設定「混拼符合」為不顯示（預設）時，把混拼層級的結果去掉
function hideMixedTier(arr) {
  if (window.showMixed || !_imeCurQ || !langMap.has(currentSearchType)) return arr;
  const re = cachedRegex(searchTermReplace(searchInput.value.trim()));
  return arr.filter(it => tierOfValues(getRelevantValues(it, currentSearchType), re, _imeCurQ) !== 3);
}

function sortFilteredData(searchTerm) {
    filteredData.sort((a, b) => compareSearchResults(a, b, searchTerm, currentSearchType));
}


searchButton.addEventListener('click', submitSearch);   // 修改：改走 submitSearch（搜尋框沒字時隨機查一個詞）

// 新增：搜尋框沒填任何字就按搜尋（按鈕或 Enter）→ 隨機挑一個 2～4 字的詞目來查
// 只在「送出」時觸發；清空搜尋框（input 事件）不會觸發，仍然是回到空白首頁
let _randPool = null;
function randomWord() {
    if (!_randPool) {
        _randPool = [];
        for (const it of dictionary) {
            const han = (it['台語'] || '').replace(/【[^】]*】/g, '');
            const n = Array.from(han).length;
            if (n >= 2 && n <= 4 && /^[\p{Script=Han}]+$/u.test(han)) _randPool.push(han);   // 只取純漢字的 2～4 字詞
        }
    }
    return _randPool.length ? _randPool[Math.floor(Math.random() * _randPool.length)] : '';
}
function submitSearch() {
    if (!searchInput.value.trim()) {
        const w = randomWord();
        if (w) {
            if (currentSearchType !== defaultType()) { currentSearchType = defaultType(); updateActiveSearchType(); }   // 以「詞目」查詢
            setRawRx(false);   // 新增
            searchInput.value = w;
            if (typeof hideVirtualKeyboard === 'function') hideVirtualKeyboard();
        }
    }
    performSearch();
}

// 查詢送出（按 Enter、離開輸入框、手機「前往」鍵）時，整理搜尋框文字：去掉前後空格，音節之間多個空格縮成 1 個
// （輸入中不整理，否則打到一半的空格會被吃掉）
function tidySearchInput() {
    let v = searchInput.value.replace(/\s+/g, ' ').trim();
    if (!_rawRx) v = SIMPLE.tidySyl(v);   // 新增：簡易語法的音節黏在一起時，補上空格（y0y3 → y0 y3）；正則模式不動
    if (v !== searchInput.value) searchInput.value = v;
    searchClear.style.display = v ? 'block' : 'none';
    if (!v) setRawRx(false);   // 新增
}
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tidySearchInput(); });
searchInput.addEventListener('blur', tidySearchInput);

// 新增：浮動面板（鍵盤、查詢歷史）的高度不超出視窗底部：從面板頂端算到視窗底端，留 12px 空隙；最多 maxPx
function fitFloatingPanel(el, maxPx) {
  if (!el || el.style.display === 'none' || !el.style.display) return;
  const top = el.getBoundingClientRect().top;
  el.style.maxHeight = Math.max(160, Math.min(maxPx, window.innerHeight - top - 12)) + 'px';
}
window.addEventListener('resize', () => {
  fitFloatingPanel(document.getElementById('virtualKeyboard'), 360);
  fitFloatingPanel(_histEl, 320);
});

// ======== 新增：查詢歷史（搜尋框是空的時候，點進去會列出最近的查詢）========
// 存在 localStorage：[{ q: 查詢文字, r: 正則模式代碼（一般模式為 ''）}]，最新的在最前面，最多 HIST_MAX 筆
// 用 var 與函式宣告：啟動時還原網址會比這段更早呼叫 performSearch，const／let 會出錯
var HIST_MAX = 20, _histEl = null;
function loadSearchHistory() {
  try {
    const a = JSON.parse(localStorage.getItem(myLocal + 'history') || '[]');
    return Array.isArray(a) ? a.filter(x => x && typeof x.q === 'string' && x.q) : [];
  } catch (e) { return []; }
}
function saveSearchHistory(a) { try { localStorage.setItem(myLocal + 'history', JSON.stringify(a.slice(0, HIST_MAX))); } catch (e) {} }
function addSearchHistory() {
  if (_restoring) return;   // 還原網址、上一頁／下一頁不算新查詢
  const q = searchInput.value.replace(/\s+/g, ' ').trim(); if (!q) return;
  const r = _rawRx ? _rawCode : '';
  saveSearchHistory([{ q, r }].concat(loadSearchHistory().filter(x => !(x.q === q && (x.r || '') === r))));
}
function hideSearchHistory() { if (_histEl) _histEl.style.display = 'none'; }
function renderSearchHistory() {
  const list = loadSearchHistory();
  if (searchInput.value.trim() || !list.length) { hideSearchHistory(); return; }
  const kb = document.getElementById('virtualKeyboard');
  if (kb && kb.style.display === 'block') { hideSearchHistory(); return; }   // 鍵盤面板開著就不顯示
  if (!_histEl) {
    _histEl = document.createElement('div'); _histEl.className = 'search-history';
    _histEl.addEventListener('mousedown', e => e.preventDefault());   // 點面板時，不讓搜尋框失去焦點
    _histEl.addEventListener('click', e => {
      const del = e.target.closest('.hist-del'), all = e.target.closest('.hist-clear'), it = e.target.closest('.hist-item');
      if (all) { saveSearchHistory([]); hideSearchHistory(); return; }
      if (del) { const a = loadSearchHistory(); a.splice(+del.dataset.i, 1); saveSearchHistory(a); renderSearchHistory(); return; }
      if (it) {
        const h = loadSearchHistory()[+it.dataset.i]; if (!h) return;
        hideSearchHistory();
        searchInput.value = h.q; searchClear.style.display = 'block';
        setRawRx(!!h.r, h.r);   // 正則模式的查詢，連同模式一起還原
        performSearch();
      }
    });
    document.querySelector('.search-wrapper').appendChild(_histEl);
  }
  _histEl.innerHTML = '<div class="hist-head"><span>最近查詢</span><button type="button" class="hist-clear">清除全部</button></div>' +
    list.map((h, i) => '<div class="hist-item" data-i="' + i + '" role="button" tabindex="-1"><span class="hist-q">' + escHtml(h.q) + '</span>' +
      (h.r ? '<span class="hist-tag">正則</span>' : '') + '<button type="button" class="hist-del" data-i="' + i + '" title="刪除這筆" aria-label="刪除這筆">×</button></div>').join('');
  _histEl.style.display = 'block';
  fitFloatingPanel(_histEl, 320);
}
searchInput.addEventListener('focus', renderSearchHistory);
searchInput.addEventListener('click', renderSearchHistory);
searchInput.addEventListener('input', () => { if (searchInput.value.trim()) hideSearchHistory(); else renderSearchHistory(); });
searchInput.addEventListener('blur', () => setTimeout(hideSearchHistory, 120));
searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') hideSearchHistory(); });

// 監聽回車鍵
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitSearch();   // 修改：performSearch → submitSearch
    }
});





// 新增：正則模式中，若整個框內文字被選取後直接打字、貼上或刪除（＝整個重打），視同清空，離開正則模式，新打的文字重新用簡易語法解讀
searchInput.addEventListener('beforeinput', () => {
    if (_rawRx && searchInput.value && searchInput.selectionStart === 0 && searchInput.selectionEnd === searchInput.value.length) setRawRx(false);
});
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    searchClear.style.display = searchTerm ? 'block' : 'none';
    if (!searchTerm.trim()) setRawRx(false); else updateRxUI();   // 新增：框內變空白才離開正則模式；其餘只刷新按鈕
});

// 添加清除按鈕的事件監聽器
searchClear.addEventListener('click', () => {
    searchInput.value = '';
    setRawRx(false);   // 新增：按 X 離開正則模式
    // 新增：清除後搜尋類型回到預設（詞目），同時更新記住的類型
    currentSearchType = defaultType();
    localStorage.setItem(myLocal + 'currentSearchType', currentSearchType);
    clearSearchResults();
    updateActiveSearchType();
    searchClear.style.display = 'none';
    showRxError('');   // 新增
});

// 初始顯示空結果
displayResults([]);

// 在頁面加載時添加搜索類型選擇器
document.addEventListener('DOMContentLoaded', () => {
    const searchContainer = document.getElementById('searchContainer');
    const selector = generateSearchTypeSelector();
    searchContainer.parentNode.insertBefore(selector, searchContainer.nextSibling);
    selector.insertAdjacentElement('afterend', createExScope());   // 手機版的「台語／華語」例句小切換
    updateActiveSearchType();

    // 初始化欄位選擇器
    generateColumnSelector();
});



document.addEventListener('DOMContentLoaded', () => {
    currentSearchType = localStorage.getItem(myLocal + 'currentSearchType') || headers[0];
 
  // 更新搜索類型選擇器
  updateSearchTypeSelector();

    // 側邊欄選項的點擊行為統一交給 initializePanelBehavior() 處理，
    // 避免同一顆按鈕被兩組事件監聽器重複觸發、造成顯示狀態互相打架。
    initializePanelBehavior();
});

function updateSearchTypeSelector() {
  const selector = document.querySelector('.search-type-selector');
  if (selector) {
    const activeButton = selector.querySelector(`#button-${currentSearchType}`);
    if (activeButton) {
      document.querySelectorAll('.search-type-selector button').forEach(btn => btn.classList.remove('active'));
      activeButton.classList.add('active');
    }
  }
}

function clearSearchResults() {
        filteredData = [];
        displayResults([], 1);
        hasSearchResults = false;
        currentDetailId = null; _urlQ = ''; _shownQ = ''; _urlR = ''; _shownR = '';   // 修改：多重設 _urlR、_shownR
        syncUrl('replace');
        searchTypes.forEach(type => {
            const button = document.getElementById(`button-${type}`);
            const countElement = document.getElementById(`count-${type}`);
            if (countElement) {
                countElement.textContent = '';
                countElement.removeAttribute('title');
            }
            if (button) {
                button.disabled = false;
            }
        });
        syncExScope();
        return;
}



let selectedColumns = DEFAULT_COLUMNS();

// 新增：取得實際要顯示的欄位。
// 當目前分頁是「近義詞／反義詞」而該欄位未勾選時，暫時顯示該欄；切到其他分頁就自動隱藏（不改動使用者設定）
const TEMP_SHOW_COLUMNS = ['近義詞', '反義詞'];
function getDisplayColumns() {
    if (!TEMP_SHOW_COLUMNS.includes(currentSearchType) ||
        !headers.includes(currentSearchType) ||
        selectedColumns.includes(currentSearchType)) {
        return selectedColumns;
    }
    // 依設定頁的欄位順序，把暫時欄位插在正確位置
    let order = COLUMN_CHOICES.filter(h => headers.includes(h));
    try {
        const saved = JSON.parse(localStorage.getItem(myLocal + 'columnOrder') || 'null');
        if (Array.isArray(saved)) {
            order = [...saved.filter(h => order.includes(h)), ...order.filter(h => !saved.includes(h))];
        }
    } catch (e) {}
    return order.filter(h => selectedColumns.includes(h) || h === currentSearchType);
}

// 生成欄位選擇器
function generateColumnSelector() {
    const columnList = document.getElementById('columnList');
    columnList.innerHTML = '';

    // 從 localStorage 讀取已儲存的欄位設定
    const savedColumns = localStorage.getItem(myLocal + 'selectedColumns');
    const savedColumnOrder = localStorage.getItem(myLocal + 'columnOrder');

    const choices = headers.filter(h => COLUMN_CHOICES.includes(h));

    if (savedColumns) {
        // 舊版存過的欄位（例如「例句」「分類」）已不提供，濾掉；全被濾掉就用預設
        selectedColumns = JSON.parse(savedColumns).filter(h => choices.includes(h));
        if (!selectedColumns.length) selectedColumns = DEFAULT_COLUMNS();
    }

    let orderedHeaders = choices;
    if (savedColumnOrder) {
        const savedOrder = JSON.parse(savedColumnOrder);
        orderedHeaders = [
            ...savedOrder.filter(h => choices.includes(h)),
            ...choices.filter(h => !savedOrder.includes(h))
        ];
    }

    orderedHeaders.forEach((header, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="drag-handle">&#9776; </span>
            <input type="checkbox" id="col-${index}" ${selectedColumns.includes(header) ? 'checked' : ''}>
            <label for="col-${index}" data-col="${header}">${colLabel(header)}</label>
            <div class="move-buttons">
                <button class="move-up" title="向上移動"><svg class="icon" aria-hidden="true"><use href="#i-expand-less"/></svg></button>
                <button class="move-down" title="向下移動"><svg class="icon" aria-hidden="true"><use href="#i-expand-more"/></svg></button>		
            </div>
        `;
        columnList.appendChild(li);

        const checkbox = li.querySelector(`#col-${index}`);
        checkbox.addEventListener('change', () => {
            updateSelectedColumns();
        });

        const moveUpButton = li.querySelector('.move-up');
        const moveDownButton = li.querySelector('.move-down');

        moveUpButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (index > 0) {
                columnList.insertBefore(li, li.previousElementSibling);
                updateSelectedColumns();
            }
        });

        moveDownButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (index < orderedHeaders.length - 1) {
                columnList.insertBefore(li.nextElementSibling, li);
                updateSelectedColumns();
            }
        });
    });

    // 新增重設按鈕容器
    const resetContainer = document.createElement('div');
    resetContainer.className = 'reset-button-container';

    // 新增重設按鈕
    const resetButton = document.createElement('button');
    resetButton.className = 'reset-button';
    resetButton.textContent = '重設欄位顯示';
    resetButton.addEventListener('click', resetColumnSettings);

    resetContainer.appendChild(resetButton);

    // 找到欄位選擇器面板的 panel-content
    const columnPanel = document.getElementById('columnPanel');
    const panelContent = columnPanel.querySelector('.panel-content');
    panelContent.appendChild(resetContainer);

    // 啟用拖放排序
    new Sortable(columnList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        handle: '.drag-handle',
        onEnd: () => {
            updateSelectedColumns();
        }
    });
}

// 新增重設函數
function resetColumnSettings() {
    // 清除 localStorage 中的欄位設定
    localStorage.removeItem(myLocal + 'selectedColumns');
    localStorage.removeItem(myLocal + 'columnOrder');

    // 重設選中的欄位為預設值（全部欄位）
    selectedColumns = DEFAULT_COLUMNS();

    // 重新生成欄位選擇器
    generateColumnSelector();

    // 重新執行搜索以更新顯示
    performSearch();
}


function updateSelectedColumns() {
    const liElements = document.querySelectorAll('#columnList li');
    
    // 更新選中的欄位
    selectedColumns = Array.from(liElements)
        .filter(li => li.querySelector('input[type="checkbox"]').checked)
        .map(li => li.querySelector('label').dataset.col);
    
    // 儲存選中的欄位到 localStorage
    localStorage.setItem(myLocal + 'selectedColumns', JSON.stringify(selectedColumns));
    
    // 儲存欄位順序到 localStorage
    const columnOrder = Array.from(liElements).map(li => li.querySelector('label').dataset.col);
    localStorage.setItem(myLocal + 'columnOrder', JSON.stringify(columnOrder));
    
    performSearch(); // 重新執行搜索以更新結果顯示
}


const container = document.querySelector('.container');
const settingsPage = document.getElementById('settingsPage');
const settingsTrigger = document.getElementById('settingsTrigger');
const settingsTriggerInner = document.getElementById('settingsTriggerInner');
const settingsClose = document.getElementById('settingsClose');

function toggleSettings() {
    settingsPage.classList.toggle('active');
    document.documentElement.classList.toggle('settings-open', settingsPage.classList.contains('active'));   // 開啟設定時鎖住背後頁面的捲動
    if (window.innerWidth <= 768) container.classList.toggle('hidden');
}

// 桌面版：點對話框外部或按 Esc 關閉
document.addEventListener('mousedown', function(e) {
    if (window.innerWidth > 768 && settingsPage.classList.contains('active') &&
        !settingsPage.contains(e.target) && !e.target.closest('.settings-trigger')) {
        toggleSettings();
    }
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && settingsPage.classList.contains('active')) toggleSettings();
});

settingsTrigger.addEventListener('click', function() {
    toggleSettings();
});

// ======== 分類瀏覽：大類 → 小類 兩層（階層資料在 category.js）========
const CAT_TREE = (typeof myCategoryTree !== 'undefined') ? myCategoryTree : [];
const CAT_SUB_MAP = new Map(), CAT_MAJOR_MAP = new Map();   // 小類名 → 資料詞陣列；大類名 → 各小類資料詞陣列
CAT_TREE.forEach(m => {
  const subs = m.subs.map(s => s.split('、'));
  m.subs.forEach((s, i) => CAT_SUB_MAP.set(s, subs[i]));
  CAT_MAJOR_MAP.set(m.name, subs);
});
const _catSetCache = new Map();
function catTokenSet(v) {                                  // 「分類」欄 → 詞的集合（快取）
  let set = _catSetCache.get(v);
  if (!set) { set = new Set(v.split('、').map(x => x.trim()).filter(Boolean)); _catSetCache.set(v, set); }
  return set;
}
// 小類＝所列的詞「全部都有」；大類＝底下任一小類成立。不是階層名稱就回傳 null（維持原本的逐詞完全比對）
function catPredicate(term) {
  const t = CAT_SUB_MAP.get(term);
  if (t) return v => { const set = catTokenSet(v); return t.every(x => set.has(x)); };
  const m = CAT_MAJOR_MAP.get(term);
  if (m) return v => { const set = catTokenSet(v); return m.some(ts => ts.every(x => set.has(x))); };
  return null;
}

const catTrigger = document.getElementById('catTrigger');
const catPanel = document.getElementById('catPanel');
const catGrid = document.getElementById('catGrid');
const catFilter = document.getElementById('catFilter');
const catBack = document.getElementById('catBack');
let _catStats = null, _catMajor = null;                    // _catMajor：目前展開的大類（null＝顯示大類總覽）

// 各小類、大類的詞條數（第一次開啟時才計算，之後重複使用）
function getCategoryStats() {
  if (_catStats) return _catStats;
  const cnt = new Map();
  CAT_TREE.forEach(m => { cnt.set(m.name, 0); m.subs.forEach(s => cnt.set(s, 0)); });
  dictionary.forEach(it => {
    const set = catTokenSet(it['分類'] || ''); if (!set.size) return;
    CAT_TREE.forEach(m => {
      let hit = false;
      m.subs.forEach(s => { if (CAT_SUB_MAP.get(s).every(x => set.has(x))) { cnt.set(s, cnt.get(s) + 1); hit = true; } });
      if (hit) cnt.set(m.name, cnt.get(m.name) + 1);
    });
  });
  return (_catStats = cnt);
}
function renderCategoryGrid() {
  const kw = catFilter.value.trim(), cnt = getCategoryStats(), E = escHtml;
  const sub = s => `<button type="button" class="cat-item" data-cat="${E(s)}">${E(s)}<small>${cnt.get(s)}</small></button>`;
  const sec = (m, subs, label) => `<div class="cat-sec"><button type="button" class="cat-major-link" data-cat="${E(m.name)}">${label || E(m.name)}<small>${cnt.get(m.name)}</small></button><div class="cat-chips">${subs.map(sub).join('')}</div></div>`;
  catBack.hidden = !(_catMajor && !kw);
  let html = '';
  if (kw) {                                                // 篩選：跨大類找小類
    CAT_TREE.forEach(m => {
      const subs = m.name.includes(kw) ? m.subs : m.subs.filter(s => s.includes(kw));
      if (subs.length) html += sec(m, subs);
    });
    if (!html) html = '<div class="cat-empty">找無符合的分類</div>';
  } else if (_catMajor) {                                  // 某個大類底下的小類
    const m = CAT_TREE.find(x => x.name === _catMajor);
    html = sec(m, m.subs, `${E(m.name)}　全部`);
  } else {                                                 // 大類總覽
    const major = m => `<button type="button" class="cat-major" data-major="${E(m.name)}">${E(m.name)}<svg class="icon" aria-hidden="true"><use href="#i-chevron-right"/></svg></button>`;
    html = `<div class="cat-majors">${CAT_TREE.filter(m => !m.extra).map(major).join('')}</div>` +
      `<div class="cat-extra-title">其他分類</div><div class="cat-majors">${CAT_TREE.filter(m => m.extra).map(major).join('')}</div>`;
  }
  catGrid.innerHTML = html;
  catGrid.scrollTop = 0;
}
function toggleCategoryPanel(force) {
  const open = typeof force === 'boolean' ? force : !catPanel.classList.contains('open');
  catPanel.classList.toggle('open', open);
  catTrigger.setAttribute('aria-expanded', open);
  if (open) {
    catFilter.value = '';
    renderCategoryGrid();
    if (window.innerWidth > 768) catFilter.focus();        // 手機版不自動跳出鍵盤
  }
}
catTrigger.addEventListener('click', () => toggleCategoryPanel());
catFilter.addEventListener('input', renderCategoryGrid);
catBack.addEventListener('click', () => { _catMajor = null; renderCategoryGrid(); });
catFilter.addEventListener('keydown', e => {               // 篩選後按 Enter：直接進入第一個小類
  if (e.key !== 'Enter' || e.isComposing) return;
  const first = catGrid.querySelector('.cat-item') || catGrid.querySelector('.cat-major-link');
  if (first) { toggleCategoryPanel(false); searchByCategory(first.dataset.cat); }
});
catGrid.addEventListener('click', e => {
  const mj = e.target.closest('.cat-major[data-major]');   // 點大類 → 展開小類
  if (mj) { _catMajor = mj.dataset.major; renderCategoryGrid(); return; }
  const b = e.target.closest('[data-cat]'); if (!b) return;   // 點小類／「大類全部」→ 查詢
  toggleCategoryPanel(false);
  searchByCategory(b.dataset.cat);
});
document.addEventListener('mousedown', e => {              // 點面板外面就關閉
  if (catPanel.classList.contains('open') && !e.target.closest('#catPanel, #catTrigger')) toggleCategoryPanel(false);
});

// ---- 全部檢視（大版面）：一次列出所有大類與小類，不必逐層返回 ----
const catFull = document.getElementById('catFull');
const catFullBody = document.getElementById('catFullBody');
const catFullFilter = document.getElementById('catFullFilter');
function renderCategoryFull() {
  const kw = catFullFilter.value.trim(), cnt = getCategoryStats(), E = escHtml;
  const item = s => `<button type="button" class="cat-full-item" data-cat="${E(s)}"><span>${E(s)}</span><small>${cnt.get(s)}</small></button>`;
  const pick = m => !kw ? m.subs : (m.name.includes(kw) ? m.subs : m.subs.filter(s => s.includes(kw)));
  const sec = ([m, subs]) => `<section class="cat-full-sec"><button type="button" class="cat-full-major" data-cat="${E(m.name)}"><span>${E(m.name)}</span><small>${cnt.get(m.name)}</small></button><div class="cat-full-list${m.extra ? ' is-flow' : ''}">${subs.map(item).join('')}</div></section>`;
  const rows = f => CAT_TREE.filter(f).map(m => [m, pick(m)]).filter(x => x[1].length);
  const main = rows(m => !m.extra), extra = rows(m => m.extra);
  let html = main.length ? `<div class="cat-full-cols">${main.map(sec).join('')}</div>` : '';
  if (extra.length) html += `<details class="cat-full-extra" open><summary>其他分類</summary><div class="cat-full-cols">${extra.map(sec).join('')}</div></details>`;
  catFullBody.innerHTML = html || '<div class="cat-empty">找無符合的分類</div>';
  catFullBody.scrollTop = 0;
}
function toggleCategoryFull(open) {
  catFull.classList.toggle('open', open);
  document.documentElement.classList.toggle('cat-full-open', open);   // 開啟時鎖住背後頁面的捲動
  if (open) {
    toggleCategoryPanel(false);
    catFullFilter.value = '';
    renderCategoryFull();
    if (window.innerWidth > 768) catFullFilter.focus();
  }
}
document.getElementById('catExpand').addEventListener('click', () => toggleCategoryFull(true));
document.getElementById('catFullClose').addEventListener('click', () => toggleCategoryFull(false));
catFull.addEventListener('click', e => { if (e.target === catFull) toggleCategoryFull(false); });   // 點背景關閉
catFullFilter.addEventListener('input', renderCategoryFull);
catFullFilter.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const first = catFullBody.querySelector('.cat-full-item') || catFullBody.querySelector('.cat-full-major');
  if (first) { toggleCategoryFull(false); searchByCategory(first.dataset.cat); }
});
catFullBody.addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  toggleCategoryFull(false);
  searchByCategory(b.dataset.cat);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (catFull.classList.contains('open')) toggleCategoryFull(false);        // 先關大版面，再關小視窗
  else if (catPanel.classList.contains('open')) toggleCategoryPanel(false);
});

const settingsTriggerDetail = document.getElementById('settingsTriggerDetail');   // 詳細檢視頂端列的設定按鈕
if (settingsTriggerDetail) settingsTriggerDetail.addEventListener('click', toggleSettings);

if (settingsTriggerInner) {
    settingsTriggerInner.addEventListener('click', function() {
        toggleSettings();
    });
}

settingsClose.addEventListener('click', toggleSettings);

// 點擊設定頁面外部關閉設定
settingsPage.addEventListener('click', function(e) {
    if (e.target === settingsPage) {
        toggleSettings();
    }
});



function initializePanelBehavior() {
    const panels = document.querySelectorAll('.settings-panel');
    const sidebarItems = document.querySelectorAll('.settings-sidebar-item');

    // 修改：初始化面板狀態
    function initializePanels() {
        const isDesktop = window.innerWidth > 768;

        if (isDesktop) {
            // 在大螢幕時，一次只顯示一個面板（預設：外觀）
            const activeItem = document.querySelector('.settings-sidebar-item.active:not([data-panel="allSettings"])')
                || document.querySelector('[data-panel="layoutPanel"]');
            const activeId = activeItem.dataset.panel;
            sidebarItems.forEach(i => i.classList.toggle('active', i === activeItem));
            panels.forEach(panel => {
                const on = panel.id === activeId;
                panel.style.display = on ? 'block' : 'none';
                panel.classList.toggle('expanded', on);
                const content = panel.querySelector('.panel-content');
                if (content) content.style.display = on ? 'block' : 'none';
            });
            return;
        } else {
            // 在小螢幕時，只展開第一個面板
            panels.forEach((panel, index) => {
                const content = panel.querySelector('.panel-content');
                if (index === 0) {
                    panel.classList.add('expanded');
                    if (content) content.style.display = 'block';
                } else {
                    panel.classList.remove('expanded');
                    if (content) content.style.display = 'none';
                }
            });
        }
        // 預設選中「所有設定」
        document.querySelector('[data-panel="allSettings"]').classList.add('active');
    }

    // 新增：切換面板的展開狀態
    function togglePanel(panel) {
        const content = panel.querySelector('.panel-content');
        panel.classList.toggle('expanded');
        if (content) {
            content.style.display = panel.classList.contains('expanded') ? 'block' : 'none';
        }
    }

    // 修改：顯示所有面板
    function showAllPanels() {
        const isDesktop = window.innerWidth > 768;

        panels.forEach(panel => {
            panel.style.display = 'block';
            if (isDesktop) {
                // 在大螢幕時保持內容展開
                panel.classList.add('expanded');
                const content = panel.querySelector('.panel-content');
                if (content) content.style.display = 'block';
            } else {
                // 在小螢幕時收合內容
                panel.classList.remove('expanded');
                const content = panel.querySelector('.panel-content');
                if (content) content.style.display = 'none';
            }
        });
    }

    // 修改：更新側邊欄項目的點擊事件
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const panelId = item.dataset.panel;
            const scrollTop0 = () => {   // 切換類別後回到該類別頂端
                const sc = document.querySelector('.settings-content');
                if (sc) sc.scrollTop = 0;
                settingsPage.scrollTop = 0;
            };
            if (panelId === 'allSettings') {
                showAllPanels();
            } else {
                panels.forEach(panel => {
                    if (panel.id === panelId) {
                        panel.style.display = 'block';
                        panel.classList.add('expanded');
                        const content = panel.querySelector('.panel-content');
                        if (content) content.style.display = 'block';
                    } else {
                        panel.style.display = 'none';
                        panel.classList.remove('expanded');
                        const content = panel.querySelector('.panel-content');
                        if (content) content.style.display = 'none';
                    }
                });
            }
            scrollTop0();
        });
    });

    // 修改：為每個面板的標題添加點擊事件
    panels.forEach(panel => {
        const header = panel.querySelector('.settings-header');
        if (header) {
            header.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    togglePanel(panel);
                }
            });
        }
    });

    // 監聽螢幕大小變化
    window.addEventListener('resize', initializePanels);

    // 初始化
    initializePanels();
}


// 初始化語言設定
function initializeLanguageSettings() {
    const languageSelector = document.getElementById('languageSelector');
    languageSelector.innerHTML = ''; // 清空現有內容

    const existingLanguages = new Set();
    headers.forEach(header => {
        if (langMap.has(header)) {
            const hasContent = dictionary.some(item => {
                return item[header] && item[header].trim() !== '';
            });
            if (hasContent) {
                existingLanguages.add(header);
            }
        }
    });


  existingLanguages.forEach(lang => {
    const dialects = langMap.get(lang) || [];
    const option = document.createElement('div');
    option.className = `language-option ${lang === mainLanguage ? 'active' : ''}`;
    const radioId = `lang-${lang}`;
    option.innerHTML = `
      <input type="radio" name="mainLanguage" id="${radioId}" 
      value="${lang}" ${lang === mainLanguage ? 'checked' : ''}>
      <div class="language-name">
        <div>${colLabel(lang)}</div>
        <div class="language-info">
          ${dialects.join('、')}
        </div>
      </div>
    `;


        option.addEventListener('click', () => {
            const previousType = currentSearchType;
            // 更新主要語言設定
            document.querySelectorAll('.language-option').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
            const radio = option.querySelector('input[type="radio"]');
            radio.checked = true;
            currentSearchType = lang;
			mainLanguage = lang;

            // 儲存設定到 localStorage
            localStorage.setItem(myLocal + 'mainLanguage', lang);			
            localStorage.setItem(myLocal + 'currentSearchType', lang);

            // 如果語言確實改變了，才重新生成搜索類型選擇器
            if (previousType !== lang) {
                // 移除舊的選擇器
                const oldSelector = document.querySelector('.search-type-selector');
                if (oldSelector) {
                    const newSelector = generateSearchTypeSelector();
                    oldSelector.parentNode.replaceChild(newSelector, oldSelector);
                }

                // 更新活動狀態
                updateActiveSearchType();

                // 如果有搜尋內容，更新搜尋結果
                if (searchInput.value.trim()) {
                    performSearch();
                }
            }
        });
        languageSelector.appendChild(option);
    });


  // 如果當前選擇的語言不在實際存在的語言中，選擇第一個可用的語言
    if (!existingLanguages.has(mainLanguage)) {
        const firstAvailableLang = existingLanguages.values().next().value;
        if (firstAvailableLang) {
            mainLanguage = firstAvailableLang;
            currentSearchType = firstAvailableLang;
            localStorage.setItem(myLocal + 'mainLanguage', firstAvailableLang);
            localStorage.setItem(myLocal + 'currentSearchType', firstAvailableLang);
        }
    }

  // 確保選中正確的語言選項
    const selectedRadio = document.querySelector(`#lang-${mainLanguage}`);
    if (selectedRadio) {
        selectedRadio.checked = true;
        selectedRadio.closest('.language-option').classList.add('active');
    }

  // 更新搜索類型選擇器
  updateSearchTypeSelector();
}


// 返回頂部按鈕：往下捲超過一屏就顯示；點擊回到頁面最頂端，並（桌面版）聚焦搜尋框方便重新查詢
document.addEventListener('DOMContentLoaded', () => {
  const scrollToTopBtn = document.getElementById('scrollToTopBtn');
  let ticking = false;

  function updateBtn() {
    ticking = false;
    scrollToTopBtn.classList.toggle('show', window.scrollY > window.innerHeight * 0.6);
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateBtn); }
  }, { passive: true });

  scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.innerWidth > 768) {   // 手機版不自動聚焦，避免鍵盤突然彈出
      setTimeout(() => { searchInput.focus({ preventScroll: true }); searchInput.select(); }, 350);
    }
  });
  updateBtn();
});/*略*/




// 拼音轉換
// 修改：convertPinyin 只看輸入字串、沒有副作用，同一字串的結果快取起來（每次查詢會對全部詞條各算一次，原本很耗時）
var _cpCache = new Map();   // var：啟動還原網址時可能比宣告更早呼叫
function convertPinyin(pinyinBenbian) {
    let hit = _cpCache.get(pinyinBenbian);
    if (hit) return hit;
    if (_cpCache.size > 60000) _cpCache.clear();   // 上限，避免佔用過多記憶體
    hit = convertPinyinRaw(pinyinBenbian);
    _cpCache.set(pinyinBenbian, hit);
    return hit;
}
function convertPinyinRaw(pinyinBenbian) {
    const original = zxvToneToOriginal(pinyinBenbian);
    const changed = zxvToneToChange(pinyinBenbian);
    const pinyinBendiao = zxvToTone(rovToRHOOBB(original));
    const pinyinBiandiao = zxvToTone(rovToRHOOBB(changed));
    return {
        pinyinBendiao,
        pinyinBiandiao
    };
}

function zxvToneToOriginal(t) {
    t = t.replace(/([aeioumngbdzvsxfc])(=)([a-z])/gi, '$1-$3');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])([zvsxc])([zvsxfc])/gi, '$1$2$3');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])([cf])/gi, '$1$2');
    return t;
}

function zxvToneToChange(t) {
    t = t.replace(/([aeioumngbdzvsxfc])(=)([a-z])/gi, '$1-$3');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])([zvsxc])([zvsxfc])/gi, '$1$2$4');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])([c])/gi, '$1$2');
    return t;
}

function rovToRHOOBB(t) {
    t = t.replace(/\b(oo)([czvsxf]\b|[ˇˋˊ⁺ˆ^]|\b)/g, 'ȫ$2');
    t = t.replace(/\b(o)([czvsxf]\b|[ˇˋˊ⁺ˆ^]|\b)/g, 'oo$2');
    t = t.replace(/ȫ/g, 'o');
    t = t.replace(/(rh)([aeiou])/g, 'r$2');
    t = t.replace(/(bb)([aeiou])/g, 'v$2');
    t = t.replace(/(v)([aeiou])/g, 'bb$2');
    t = t.replace(/(r)([aeiou])/g, 'rh$2');
    t = t.replace(/\b([bpfdtlgkhzcs]|bb|zh|ch|sh|rh)(o)([czvsxf]\b|[ˇˋˊ⁺ˆ^]|\b)/g, '$1oo$3');
    t = t.replace(/([-]+)/g, ' ');
    return t;
}

function zxvToTone(t) {
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])(z)/gi, '$1$2ˊ');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])(x)/gi, '$1$2ˆ');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])(v)/gi, '$1$2ˇ');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])(s)/gi, '$1$2ˋ');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])(f)/gi, '$1$2⁺');
    t = t.replace(/([a-z]{0,4})([mngbdgaeiou])(c)/gi, '$1$2');
    return t;
}



// ======== 新增：換詞（語詞替換）頁面。畫面內容由 article.js 負責；關閉後文章與復原紀錄仍保留 ========
(function () {
  const trigger = document.getElementById('articleTrigger'), page = document.getElementById('articlePage');
  const host = document.getElementById('articleHost'), logo = document.getElementById('articleLogo');
  if (!trigger || !page) return;
  let mounted = false, prevOverflow = '';
  function openArticle(opt) {
    if (!page.hidden) return;
    if (typeof toggleCategoryPanel === 'function') toggleCategoryPanel(false);   // 先收起分類小視窗
    const f = document.getElementById('logo').style.fontFamily;                   // 沿用首頁 LOGO 當下的字體
    if (f) logo.style.fontFamily = f;
    prevOverflow = document.body.style.overflow;
    page.hidden = false; document.body.style.overflow = 'hidden';
    _articleOpen = true;
    if (!(opt && opt.fromUrl)) history.pushState({ detail: !!currentDetailId, article: true }, '', buildUrl());   // 新增一筆歷史：手機按「返回」會先關掉換詞頁
    if (mounted) return;
    host.innerHTML = '<div class="no-results">載入中⋯</div>';
    loadArticle().then(() => { HoloArticle.show(host); mounted = true; })
      .catch(() => { host.innerHTML = '<div class="no-results">載入失敗，請稍後再試</div>'; });
  }
  function closeArticle(opt) {
    if (page.hidden) return;
    page.hidden = true; document.body.style.overflow = prevOverflow;
    if (typeof HoloArticle !== 'undefined') HoloArticle.close();
    _articleOpen = false;
    if (!(opt && opt.fromUrl)) {   // 使用者自己關：是我們新增的歷史就退回一步，否則（直接用網址進來）只把網址上的 a=1 拿掉
      if (history.state && history.state.article) history.back();
      else history.replaceState(history.state, '', buildUrl());
    }
  }
  window.holoArticleView = { open: openArticle, close: closeArticle };   // 給 applyUrlState 用
  trigger.addEventListener('click', function () { openArticle(); });
  document.getElementById('articleClose').addEventListener('click', function () { closeArticle(); });
  logo.addEventListener('click', function () { closeArticle(); });
  logo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeArticle(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeArticle(); });   // 選單開著時，article.js 會先攔下 Esc
})();

// LOGO字體
document.addEventListener('DOMContentLoaded', () => {
    const googleFonts = `
Big Shoulders Inline Display
Bodoni Moda
Bonbon
Bungee Outline
Codystar
Coiny
Dancing Script
Danfo
Diplomata
Diplomata SC
DynaPuff
Edu AU VIC WA NT Guides
Emblema One
Ewert
Fascinate
Faster One
Flavors
Geostar
Hanalei
Jacquarda Bastarda 9
Jacquarda Bastarda 9 Charted
Jacques Francois Shadow
Jersey 10 Charted
Kablammo
Libre Barcode 39 Extended
Libre Barcode 39 Extended Text
Lily Script One
Lunasima
Micro 5 Charted
Molle
Monofett
Moo Lah Lah
Moulpali
Neonderthaw
Nosifer
Orbitron
Pacifico
Permanent Marker
Phudu
Plaster
Ribeye Marrow
Rubik Distressed
Rubik Doodle Shadow
Rubik Doodle Triangles
Rubik Iso
Rubik Moonrocks
Rubik Puddles
Rubik Spray Paint
Rubik Vinyl
Spirax
Tapestry
Tilt Prism
Tourney
Train One
Twinkle Star
Vibes
Warnes
Workbench
Yatra One
Zen Tokyo Zoo
`;

    const logoText = document.getElementById('logo').textContent.trim();

    const fonts = googleFonts.trim().split('\n').map(font => {
        const fontName = font.trim();
        const family = `'${fontName}', sans-serif`;
        const url = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}&text=${logoText}&display=swap`;
        return {
            family,
            url
        };
    });

    // 根據當前時間的分鐘數來選擇字體
    const now = new Date();
    const minute = now.getMinutes();
    const selectedFont = fonts[minute % fonts.length];

    // 動態加載字體
    const link = document.createElement('link');
    link.href = selectedFont.url;
    link.rel = 'stylesheet';
    link.onload = () => document.getElementById('logo').style.fontFamily = selectedFont.family;
    document.head.appendChild(link);
});





// 顯示完整欄位
function showFullData(index) {
  if (index < 0 || index >= filteredData.length) {
    console.error('無效的索引');
    return;
  }
  
  const item = filteredData[index];
const isExactMatch = isExactMatchItem(item, searchTermReplace(searchInput.value.trim()), currentSearchType);
  if (currentDetailId == null) _listScrollY = window.scrollY;   // 記住列表位置，返回時回到原處
  setDetail(item);

  if (window.innerWidth > 768) {
    showSidebarModal(index, isExactMatch);
  } else {
    showMobileModal(index, isExactMatch);
  }
}

// 新增顯示移動端模態框的函數
function showMobileModal(index) {
  const item = filteredData[index];
  const pinyinField = getPinyinField(mainLanguage);
const isExactMatch = isExactMatchItem(item, searchTermReplace(searchInput.value.trim()), currentSearchType);


  // 處理詔安拼音本變
  let pinyinContent = '';
  if (pinyinField === '詔安拼音本變') {
    const { pinyinBendiao } = convertPinyin(item[pinyinField] || '');
    pinyinContent = pinyinBendiao; // 只顯示本音
  } else {
    pinyinContent = pinyinField === '台羅' ? romHtml(item[pinyinField]) : escHtml(item[pinyinField] || '');
  }

  // 頂部固定列：返回鈕 ＋ 查詢框（顯示目前查詢詞，點一下回到搜尋框）；詞目、音讀改放在內容裡，隨內容捲動
  const qText = escHtml(searchInput.value.trim());
  let headerContent = `
    <div class="mobile-modal-header">
      <button class="close-button" type="button" aria-label="返回結果" title="返回結果"><svg class="icon" aria-hidden="true"><use href="#i-arrow-back"/></svg></button>
      <button class="detail-q" type="button" aria-label="回到搜尋" title="回到搜尋"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><span>${qText || '搜尋'}</span></button>
    </div>
  `;

  // 生成詳細內容表格
  let tableContent = '<div class="mobile-modal-content">';
  tableContent += detailHtml(item);
  tableContent += '</div>';

  // 更新模態框內容
  const modalContent = document.getElementById('fullDataContent');
  modalContent.innerHTML = headerContent + tableContent;
  fillVariants(item, modalContent.querySelector('.mobile-modal-content'));
  { const tr = modalContent.querySelector('.entry-titlerow'), mv = modalContent.querySelector('.entry-titlerow .moe-link');   // 序號：放在詞目列右側（外連圖示左邊）
    if (tr) { const no = document.createElement('span'); no.className = 'entry-no' + (isExactMatch ? ' exact-match' : ''); no.textContent = displayNo(index); tr.insertBefore(no, mv); } }

  // 顯示模態框
  const modal = document.getElementById('fullDataModal');
  if (modal.style.display !== 'block') {
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  const contentArea = modalContent.querySelector('.mobile-modal-content');
  if (contentArea) {
    contentArea.scrollTop = 0;
  }

  // 綁定關閉按鈕事件
  const closeButton = modalContent.querySelector('.close-button');
  closeButton.onclick = function() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    closeDetailState();
  };
  if (window.closeDetailView) closeButton.onclick = () => window.closeDetailView(false);   // 返回：回到查詢結果原本的位置
  const searchBtn = modalContent.querySelector('.detail-q');   // 查詢框：直接回到首頁最頂端的搜尋框（全選，可直接改查）
  if (searchBtn) searchBtn.onclick = function() {
    if (window.closeDetailView) window.closeDetailView(true);
    else { closeButton.onclick(); window.scrollTo(0, 0); searchInput.focus(); searchInput.select(); }
  };
}

// 新增顯示側邊欄模態框的函數
function addIndexClickHandlers() {
    document.querySelectorAll('a[onclick*="showFullData"]').forEach(link => {
        link.onclick = function(e) {
            e.preventDefault();
            const index = parseInt(this.getAttribute('data-index'));
            showFullData(index);
        };
    });
}

// ======== 詳細頁左側清單：虛擬捲動（只繪製看得到的列）＋ 位置／跳轉 ＋ 篩選 ＋ 層級標題 ========
// 2 字以內的詞目：詞目與音讀排在同一行（compact）；其餘兩行。各列高度固定，才能用虛擬捲動。
let _sb = null;
const SB_BUF = 500;                    // 可視範圍上下多繪製的距離（px）
const _sbHayCache = new WeakMap();     // 詞條 → 篩選用的搜尋字串
const sbNorm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-\s/]+/g, ' ').trim();

function sbHay(item) {
  let h = _sbHayCache.get(item);
  if (!h) {
    const s = sbNorm((item['台語'] || '').replace(/【[^】]*】/g, '')) + '|' + sbNorm(item['台羅']) + '|' + sbNorm(item['台羅無調']);
    h = { s, c: s.replace(/ /g, '') };
    _sbHayCache.set(item, h);
  }
  return h;
}
function sbNoPy(item) {                // 新增：沒有音讀的詞目（非 compact 時，不必保留第二行的空間）
  return !String(item['台羅'] || '').trim() && !sbPyHtml(item).trim();
}
function sbIsCompact(item) {
  if (mainLanguage !== '台語') return false;
  return Array.from((item['台語'] || '').replace(/【[^】]*】/g, '')).length <= 2;
}
function sbPyHtml(item) {              // 新增：音讀的 HTML（沒有音讀時為空字串），列高判斷與內容共用
  const pf = getPinyinField(mainLanguage);
  return pf === '詔安拼音本變' ? escHtml(convertPinyin(item[pf] || '')?.pinyinBendiao || '')
       : pf === '台羅' ? romHtml(item[pf]) : escHtml(item[pf] || '');
}
function sbInner(item, no) {           // 一列的內容（編號＋詞目＋音讀）
  const han = mainLanguage === '台語' ? hanHtml(item[mainLanguage]) : escHtml(item[mainLanguage] || '');
  const py = sbPyHtml(item);
  return `<div class="item-number">${no}</div><div class="content-wrapper"><div class="main-language">${han}</div><div class="pinyin">${py}</div></div>`;
}

function sbMeasure() {                 // 量出單行／雙行／標題列的實際高度（隨字級、字體而變）
  const S = _sb, list = S.list, probe = (cls, html) => {
    const d = document.createElement('div'); d.className = cls + ' sb-probe'; d.innerHTML = html;
    list.appendChild(d); const h = d.offsetHeight; d.remove(); return h;
  };
  const dummyC = { '台語': '一', '台羅': 'tsi̍t' }, dummyN = { '台語': '一二三', '台羅': 'tsi̍t-tsi̍t' };
  let hc = 0, hn = 0, seen = 0;
  const dummyP = { '台語': '一二三', '台羅': '' };   // 新增：沒有音讀的詞目
  let hp = 0, seenP = 0;
  const trial = (item, c, p) => {
    const h = probe('sidebar-item' + (c ? ' compact' : p ? ' nopy' : ''), sbInner(item, '9999'));
    if (c) hc = Math.max(hc, h); else if (p) hp = Math.max(hp, h); else hn = Math.max(hn, h);
  };
  trial(dummyC, true); trial(dummyN, false); trial(dummyP, false, true);
  for (const r of S.rows) {            // 真實資料再抽樣（含有【替】【白】等標記的列，行高可能略高）
    if (r.h) continue;
    const it = filteredData[r.idx];
    if (r.p) { if (seenP < 12) { trial(it, false, true); seenP++; } continue; }   // 新增：無音讀的列另外抽樣
    if (seen < 12 || /【/.test((it['台語'] || '') + (it['台羅'] || ''))) { trial(it, r.c); seen++; }
    if (seen >= 24 && seenP >= 12) break;
  }
  S.H = { c: hc, n: hn, p: hp || hn, h: probe('sb-head', '<b>全合</b><span>0 筆</span>') };
}
function sbLayout() {                  // 算出每一列的位置與整體高度
  const S = _sb;
  if (!S.H) sbMeasure();
  let y = 0;
  for (const r of S.rows) { r.ht = r.h ? S.H.h : r.c ? S.H.c : r.p ? S.H.p : S.H.n; r.off = y; y += r.ht; }
  S.list.style.height = (S.rows.length ? y : 72) + 'px';
  S.lt = S.list.offsetTop;
  S.rs = S.re = -1;
}
function sbBuild() {                   // 依目前篩選，建立顯示清單（view）與各列（rows）
  const S = _sb, T = tierInfo(), n = filteredData.length, view = [];
  if (S.q) { for (let i = 0; i < n; i++) if (sbMatch(filteredData[i])) view.push(i); }
  else for (let i = 0; i < n; i++) view.push(i);
  S.view = view; S.posOf = new Int32Array(n).fill(-1); S.rowOf = new Int32Array(n).fill(-1);
  const tc = [0, 0, 0, 0, 0];
  view.forEach((idx, p) => { S.posOf[idx] = p; tc[T.tiers[idx]]++; });
  S.tc = tc; S.grouped = T.grouped; S.T = T;
  const rows = []; let last = -1; S.tierRow = [-1, -1, -1, -1, -1];
  view.forEach(idx => {
    const t = T.tiers[idx];
    if (T.grouped && t !== last) { S.tierRow[t] = rows.length; rows.push({ h: true, t, count: tc[t] }); last = t; }
    S.rowOf[idx] = rows.length;
    const c = sbIsCompact(filteredData[idx]);
    rows.push({ idx, c, p: !c && sbNoPy(filteredData[idx]) });   // p：沒有音讀，只佔一行高度
  });
  S.rows = rows;
  S.tierBar.hidden = !T.grouped;   // 固定在工具列的層級按鈕：列出所有有資料的層級，點一下跳到該層開頭
  S.tierBar.innerHTML = T.grouped ? TIER_ORDER.map(t => tc[t] ? `<button type="button" class="sb-chip t${t}" data-t="${t}" title="${TIER_LABELS[t]}">${TIER_SHORT[t]}<small>${tc[t].toLocaleString()}</small></button>` : '').join('') : '';
  S.cache = new Map();
  sbLayout();
}
function sbMatch(item) {
  const S = _sb, h = sbHay(item);
  return S.qTok.every(t => h.s.includes(t)) || h.c.includes(S.qCompact);
}
function sbRowHtml(r) {
  const S = _sb;
  if (r.h) return `<div class="sb-head sb-t${r.t}" style="top:${r.off}px;height:${r.ht}px"><b>${TIER_SHORT[r.t]}</b><span>${r.count.toLocaleString()} 筆</span></div>`;
  let c = S.cache.get(r.idx);
  if (!c) {
    const item = filteredData[r.idx];
    c = { inner: sbInner(item, displayNo(r.idx)), ex: isExactMatchItem(item, S.term, currentSearchType) };
    S.cache.set(r.idx, c);
  }
  return `<div class="sidebar-item${r.c ? ' compact' : r.p ? ' nopy' : ''}${r.idx === S.cur ? ' active' : ''}${c.ex ? ' exact-match' : ''}" data-idx="${r.idx}" style="top:${r.off}px;height:${r.ht}px">${c.inner}</div>`;
}
function sbRender(force) {
  const S = _sb; if (!S || !S.rows) return;
  const rows = S.rows, sc = S.sc;
  if (!rows.length) { S.list.innerHTML = '<div class="sb-empty">沒有符合的詞條</div>'; S.rs = S.re = -1; S.tierBar.hidden = true; return; }
  const find = y => { let lo = 0, hi = rows.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].off + rows[m].ht > y) hi = m; else lo = m + 1; } return lo; };
  const yTop = sc.scrollTop - S.lt, yBot = sc.scrollTop + sc.clientHeight - S.lt;
  // 固定在頂端的層級標題：看目前捲到的位置（工具列下緣）屬於哪一層
  const yv = sc.scrollTop - S.lt;   // 修改：工具列已獨立在捲動區外，清單頂端就是捲動區頂端
  if (S.grouped) {                                          // 目前捲到的層級：對應的按鈕亮起
    const r = rows[find(Math.max(0, yv))];
    const t = r.h ? r.t : S.T.tiers[r.idx];
    if (S.tierShown !== t) { S.tierShown = t; S.tierBar.querySelectorAll('.sb-chip').forEach(b => b.classList.toggle('on', +b.dataset.t === t)); }
  }
  const s = find(yTop - SB_BUF); let e = s;
  while (e < rows.length && rows[e].off < yBot + SB_BUF) e++;
  if (!force && s === S.rs && e === S.re) return;
  let html = ''; for (let i = s; i < e; i++) html += sbRowHtml(rows[i]);
  S.list.innerHTML = html; S.rs = s; S.re = e;
}
function sbReveal(idx, center) {       // center＝置中；否則只在看不到時捲到剛好可見
  const S = _sb, r = S.rows[S.rowOf[idx]]; if (!r) return;
  const sc = S.sc, th = 0, ch = sc.clientHeight, topY = S.lt + r.off, botY = topY + r.ht;   // 修改：th（工具列高度）改為 0，工具列不在捲動區內
  if (center) sc.scrollTop = topY + r.ht / 2 - th - (ch - th) / 2;
  else if (topY < sc.scrollTop + th) sc.scrollTop = topY - th;
  else if (botY > sc.scrollTop + ch) sc.scrollTop = botY - ch;
}
function sbStep(from, dir) {           // 在顯示清單中，從 from 往前（-1）或往後（+1）找下一筆；沒有回傳 -1
  const S = _sb, v = S.view; if (!v.length) return -1;
  let p = S.posOf[from];
  if (p >= 0) p += dir;
  else { let lo = 0, hi = v.length; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < from) lo = m + 1; else hi = m; } p = dir > 0 ? lo : lo - 1; }
  return p >= 0 && p < v.length ? v[p] : -1;
}
function sbNav() {                     // 更新工具列：位置／總數、上一筆／下一筆、篩選筆數
  const S = _sb, cur = S.cur, T = S.T, t = T.tiers[cur];
  const byTier = S.grouped && !S.q;    // 有分層且未篩選：編號與列表一致（各層各自從 1 起算）
  const local = byTier ? displayNo(cur) : (S.posOf[cur] >= 0 ? S.posOf[cur] + 1 : '–');
  const total = byTier ? T.counts[t] : S.view.length;
  if (document.activeElement !== S.jump) S.jump.value = local;
  S.total.textContent = '/ ' + total.toLocaleString();
  S.prev.disabled = sbStep(cur, -1) < 0; S.next.disabled = sbStep(cur, 1) < 0;
  S.fcount.textContent = S.q ? S.view.length.toLocaleString() + ' 筆' : '';
  S.fclear.hidden = !S.filter.value;
}
function sbSelect(idx, reveal) {
  const S = _sb; if (idx == null || idx < 0 || idx >= filteredData.length) return;
  S.cur = idx; S.curItem = filteredData[idx];
  showSidebarContent(idx);
  if (reveal) sbReveal(idx, false);
  sbRender(true); sbNav();
}
function sbJump(v) {                   // 跳到第 k 筆（有分層且未篩選時，k 是目前這一層的編號）
  const S = _sb, k = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  if (!k || !S.view.length) return;
  let idx;
  if (S.grouped && !S.q) { const t = S.T.tiers[S.cur], st = S.T.start[t]; idx = st + Math.min(k, S.T.counts[t]) - 1; }
  else idx = S.view[Math.min(k, S.view.length) - 1];
  sbSelect(idx, false); sbReveal(idx, true); sbRender(true);
}
function sbApplyFilter(raw) {
  const S = _sb; S.q = sbNorm(raw); S.qTok = S.q ? S.q.split(' ') : []; S.qCompact = S.q.replace(/ /g, '');
  sbBuild();
  if (S.posOf[S.cur] >= 0) sbReveal(S.cur, true); else S.sc.scrollTop = 0;
  S.tierShown = null; sbRender(true); sbNav();
}
window._sbRefresh = function () {      // 設定（字級、顏色、排序…）改變時：重建清單，並保持目前這一筆
  const S = _sb, m = document.getElementById('sidebarModal');
  if (!S || !S.rows || !m || m.style.display !== 'block') return;
  if (!filteredData.length) return;
  const i = filteredData.indexOf(S.curItem);
  S.cur = i >= 0 ? i : 0; S.H = null;
  if (i < 0) { S.curItem = filteredData[0]; showSidebarContent(0); }   // 目前這筆已不在結果中：改看第一筆
  S.term = searchTermReplace(searchInput.value.trim());
  sbBuild(); S.tierShown = null; sbReveal(S.cur, true); sbRender(true); sbNav();
};
function sbInit() {
  if (_sb) return _sb;
  const $ = id => document.getElementById(id), S = _sb = {
    sc: document.getElementById('sbScroll'), tools: $('sbTools'), list: $('sidebarList'), tierBar: $('sbTier'),
    prev: $('sbPrev'), next: $('sbNext'), jump: $('sbJump'), total: $('sbTotal'),
    filter: $('sbFilter'), fcount: $('sbFcount'), fclear: $('sbFclear'),
  };
  let raf = 0;
  S.sc.addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; sbRender(false); }); });
  window.addEventListener('resize', () => { if (S.rows) { S.lt = S.list.offsetTop; sbRender(true); } });
  S.list.addEventListener('click', e => {
    const row = e.target.closest('.sidebar-item'); if (!row) return;
    const idx = parseInt(row.dataset.idx, 10); if (idx !== S.cur) sbSelect(idx, true);
  });
  S.tierBar.addEventListener('click', e => {   // 點層級按鈕：捲到該層的開頭
    const b = e.target.closest('.sb-chip'); if (!b) return;
    const r = S.rows[S.tierRow[+b.dataset.t]]; if (!r) return;
    S.sc.scrollTop = S.lt + r.off; sbRender(true);   // 修改：不再扣掉工具列高度
  });
  S.prev.addEventListener('click', () => sbSelect(sbStep(S.cur, -1), true));
  S.next.addEventListener('click', () => sbSelect(sbStep(S.cur, 1), true));
  S.jump.addEventListener('focus', () => S.jump.select());
  S.jump.addEventListener('blur', () => sbNav());
  S.jump.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sbJump(S.jump.value); S.jump.blur(); }
    else if (e.key === 'Escape') { e.stopPropagation(); S.jump.blur(); }
  });
  let ft = 0;
  S.filter.addEventListener('input', () => { clearTimeout(ft); S.fclear.hidden = !S.filter.value; ft = setTimeout(() => sbApplyFilter(S.filter.value), 120); });
  S.filter.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (S.filter.value) { e.stopPropagation(); S.filter.value = ''; sbApplyFilter(''); }   // 先清除篩選；再按一次 Esc 才關閉詳細頁
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sbSelect(sbStep(S.cur, e.key === 'ArrowDown' ? 1 : -1), true); }
  });
  S.fclear.addEventListener('click', () => { S.filter.value = ''; sbApplyFilter(''); S.filter.focus(); });
  document.addEventListener('keydown', e => {   // ↑ ↓：上一筆／下一筆（焦點在輸入框、設定開啟時不攔截）
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!S.rows || $('sidebarModal').style.display !== 'block' || document.documentElement.classList.contains('settings-open')) return;
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    e.preventDefault(); sbSelect(sbStep(S.cur, e.key === 'ArrowDown' ? 1 : -1), true);
  });
  return S;
}

function showSidebarModal(index) {
  const sidebarModal = document.getElementById('sidebarModal');
  const S = sbInit();
  sidebarModal.style.display = 'block';          // 先顯示，才量得到各列高度
  document.body.style.overflow = 'hidden';
  S.q = ''; S.qTok = []; S.qCompact = ''; S.filter.value = ''; S.H = null; S.tierShown = null;
  S.term = searchTermReplace(searchInput.value.trim());
  S.cur = index; S.curItem = filteredData[index];
  sbBuild();
  showSidebarContent(index);
  const dq = document.getElementById('detailQuery');
  if (dq) dq.textContent = searchInput.value;
  S.sc.scrollTop = 0;
  sbReveal(index, true);                         // 確保選中的項目可見（置中）
  sbRender(true); sbNav();
}

// 新增顯示側邊欄內容的函數
function showSidebarContent(index) {
  const item = filteredData[index];
  setDetail(item);
  const pinyinField = getPinyinField(mainLanguage);
  const isExactMatch = isExactMatchItem(item, searchTermReplace(searchInput.value.trim()), currentSearchType);

  let content = detailHtml(item);

  // 更新內容
  const sidebarContent = document.getElementById('sidebarFullDataContent');
  sidebarContent.innerHTML = content;
  fillVariants(item, sidebarContent);

  // 將右側內容區域滾動到頂部
  const sidebarContentWrapper = document.querySelector('.sidebar-content');
  if (sidebarContentWrapper) {
    sidebarContentWrapper.scrollTop = 0;
  }
}


function getPinyinField(language) {
  if (!langMap.has(language)) {
    return '標音'; // 如果找不到對應的拼音欄位，返回默認值
  }
  const possibleFields = langMap.get(language);
  
  // 檢查 myData 中實際存在的欄位
  for (const field of possibleFields) {
    if (headers.includes(field)) {
      return field; // 直接返回找到的欄位名
    }
  }
  
  return '標音'; // 如果都沒找到，返回默認值
}

// 在 DOMContentLoaded 事件中初始化關閉功能
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('fullDataModal');
  const sidebarModal = document.getElementById('sidebarModal');
  const closeBtns = document.querySelectorAll('.close');

  // 詳細檢視頂部列：返回 / LOGO / 搜尋框
  // toTop = false：返回查詢結果（回到開啟前的頁碼與捲動位置）；true：回到首頁最頂端並聚焦搜尋框
  function closeDetail(toTop) {
    // 修改：回到搜尋時直接到首頁頂端的搜尋框，中間完全不露出列表
    // 做法：先蓋一層與頁面同色的遮罩 → 在遮罩下關閉詳細檢視、捲到頂端、處理 history.back() 的還原 →
    //       等捲動與畫面都穩定後，才移除遮罩（遮罩期間任何一幀的列表都不會被看到）
    if (toTop) {
      const prevSR = ('scrollRestoration' in history) ? history.scrollRestoration : null;
      if (prevSR) history.scrollRestoration = 'manual';                 // 禁止瀏覽器自動還原捲動
      const top = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      const cover = document.createElement('div');                      // 新增：遮罩
      cover.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:' +
        (getComputedStyle(document.body).backgroundColor || '#fff');
      document.body.appendChild(cover);                                 // 新增

      top();
      sidebarModal.style.display = 'none'; modal.style.display = 'none';   // 手機版（彈出視窗）也一併關閉
      document.body.style.overflow = '';
      closeDetailState();
      top();
      searchInput.focus({ preventScroll: true }); searchInput.select();

      window.addEventListener('popstate', top, { once: true });         // popstate 是非同步的，期間補捲到頂端
      requestAnimationFrame(top); setTimeout(top, 0); setTimeout(top, 80);
      setTimeout(() => {                                                // 新增：穩定後才收尾
        top();
        window.removeEventListener('popstate', top);
        if (prevSR) history.scrollRestoration = prevSR;
        cover.remove();                                                 // 新增：移除遮罩
      }, 150);
      return;
    }
    sidebarModal.style.display = 'none'; modal.style.display = 'none';
    document.body.style.overflow = '';
    closeDetailState();
    const y = _listScrollY;
    const go = () => window.scrollTo(0, y);
    go(); requestAnimationFrame(go); setTimeout(go, 80); setTimeout(go, 250);   // 列表可能剛重繪，多補幾次
  }
  window.closeDetailView = closeDetail;   // 手機版詳細頁的返回鈕、查詢框共用
  document.getElementById('detailBack').onclick = () => closeDetail(false);
  document.getElementById('detailLogo').onclick = () => closeDetail(false);
  document.getElementById('detailSearch').onclick = () => closeDetail(true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebarModal.style.display === 'block') closeDetail(false);
  });

  closeBtns.forEach(btn => {
    btn.onclick = function() {
      modal.style.display = 'none';
      sidebarModal.style.display = 'none';
      document.body.style.overflow = '';
      closeDetailState();
    }
  });

  // 只有手機版的彈出視窗，點外部才關閉；桌面詳細檢視不因點外部而關閉
  window.onclick = function(event) {
    if (event.target == modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      closeDetailState();
    }
  }
});





function xxx(){
    let searchTerm = searchInput.value.trim().replace(/\s+/g, ' ');
	searchTerm = rovToRHOOBB(searchTerm);
	searchTerm = zxvToTone(searchTerm);
	searchInput.value = searchTerm;
	updateRxUI();   // 新增
}

document.addEventListener('DOMContentLoaded', function() {
  const virtualKeyboardToggle = document.getElementById('virtualKeyboardToggle');
  const virtualKeyboard = document.getElementById('virtualKeyboard');
  const searchInput = document.getElementById('searchInput');
  const searchButton = document.getElementById('searchButton');


    const myChars = `
【基本符號】
.	任一符號
x	一個漢字
y	任意字母
0	任意聲調
.*	0 次以上
.+	1 次以上
.?	0 或 1 次
|	或（天|地）
#	而且（天#地）
^	作為開頭
$	作為結尾
~	一個音節
~<	聲母
~>	韻母＋聲調
%	補足各調（si%）
@	同韻（ai@）
【母音與聲母】
v	母音（a e i o u）
V	聲母（非母音）
_m	鼻音結尾（m n ng nn）
_p	入聲結尾（p t k h）
p_	p ph m b 開頭（p_a1＝只取聲母）
t_	t th n l 開頭（t_a1＝只取聲母）
k_	k kh ng g h 開頭（k_a1＝只取聲母）
ts_	ts tsh s j 開頭（ts_a1＝只取聲母）
ph_	ph th kh tsh 開頭（ph_a1＝只取聲母）
m_	m n ng 開頭（m_a1＝只取聲母）
【漢字位置範例】
^xx$	精確兩個漢字
^xxxxx$	精確五個漢字
^天	天開頭
天$	天結尾
^天..$	天開頭的三字詞
^...天$	天結尾的四字詞
^..無.$	第三字為無的四字詞
【拼音範例（建議勾精確）】
y0	任意聲調的音節
y3	第 3 調的音節
y2 y5	第 2、5 調兩音節
yng0	ng 結尾
tua7 y0 y0	三字詞，tua7 開頭
ya0	字母＋a
v0	母音＋任意聲調
Va0	聲母＋a
ym0	m 結尾
yp0	p 結尾
y~m0	鼻音結尾
y~p0	入聲結尾
hu?e1	u 可有可無
si%	各聲調
~ ~ ~	三個音節
s~ b~ h~	s、b、h 開頭的三音節
~ bak8 ~	中間為 bak8
~<a1	聲母＋a1
ph~>	ph 開頭的所有韻
ai@	押 ai 韻
【疊字範例（建議勾精確）】
AA	如「譀譀」
花AA	如「花貓貓」
ABB	如「紅記記、閒仙仙」
AABB	如「風風雨雨」
AABC	如「寬寬仔是」
ABCC	如「無閒𩑾𩑾」
ABAC	如「想空想縫」
`;


  // 解析 myChars 字符串
  const groups = {};
  let currentGroup = '';
  myChars.trim().split('\n').forEach(line => {
    if (line.startsWith('【') && line.endsWith('】')) {
      currentGroup = line.slice(1, -1);
      groups[currentGroup] = [];
    } else {
      const [symbol, hint, execute] = line.split('\t');
      if (symbol && currentGroup) {
        groups[currentGroup].push({ symbol, hint, execute });
      }
    }
  });

  // 模擬函數執行
  function executeFunction(funcName) {
    console.log(`執行函數: ${funcName}`);
    if (funcName === 'xxx()') { xxx(); }
  }

  // 在游標位置插入字符的函數
	function insertAtCursor(input, textToInsert) {
	  const start = input.selectionStart;
	  const end = input.selectionEnd;
	  const text = input.value;
	  const before = text.substring(0, start);
	  const after = text.substring(end);
	  input.value = before + textToInsert + after;
	  input.selectionStart = input.selectionEnd = start + textToInsert.length;
	  const searchTerm = input.value.trim();
	  searchClear.style.display = searchTerm ? 'block' : 'none';
	  updateRxUI();   // 新增：鍵盤插入符號後，刷新「轉為正則」按鈕
	}

  // 渲染虛擬鍵盤



  function renderKeyboard() {
    virtualKeyboard.innerHTML = ''; // 清空現有內容

    // 創建導航下拉選單
    const navigation = document.createElement('div');
    navigation.className = 'keyboard-navigation';
    const select = document.createElement('select');
    select.addEventListener('change', (event) => {
      const groupName = event.target.value;
      const target = groupName && document.getElementById(groupName);
      if (target) {
        // 修改：只捲動鍵盤面板本身（原本 scrollIntoView 會連整個頁面一起捲）
        virtualKeyboard.scrollTo({ top: target.offsetTop - navigation.offsetHeight, behavior: 'smooth' });
      }
      event.target.value = '';   // 回到「選擇組別」，方便再選同一組
    });
    
    // 添加預設選項
    const defaultOption = document.createElement('option');
    defaultOption.textContent = '選擇組別';
    defaultOption.value = '';
    select.appendChild(defaultOption);

    Object.keys(groups).forEach(groupName => {
      const option = document.createElement('option');
      option.textContent = groupName;
      option.value = groupName;
      select.appendChild(option);
    });
    navigation.appendChild(select);

    // 新增：^開頭、結尾$、^精確$ 勾選（精確 ＝ 開頭 ＋ 結尾，三者連動）
    const mkBox = (text, title) => {
      const label = document.createElement('label');
      label.className = 'keyboard-exact';
      label.title = title;
      const box = document.createElement('input');
      box.type = 'checkbox';
      label.appendChild(box);
      label.appendChild(document.createTextNode(text));
      label._title = title;   // 新增：記住原本的提示文字（正則模式時會暫時改掉）
      return { label, box };
    };
    const bStart = mkBox('^開頭', '作為開頭（加上 ^）');
    const bEnd = mkBox('結尾$', '作為結尾（加上 $）');
    const bExact = mkBox('^精確$', '精確＝開頭＋結尾（加上 ^ 與 $）');
    const syncBoxes = () => {
      // 修改：不分模式，勾選狀態一律依框內有沒有開頭的 ^、結尾的 $ 決定（原本一般模式讀 localStorage 的永久設定）
      const x = SIMPLE.splitAnchors(searchInput.value.replace(/\s+/g, ' ').trim());
      const a = { start: x.s, end: x.e };
      bStart.box.checked = a.start; bEnd.box.checked = a.end; bExact.box.checked = a.start && a.end;
      [bStart, bEnd, bExact].forEach(b => { b.box.disabled = false; b.label.classList.remove('kb-disabled'); b.label.title = b.label._title; });
      virtualKeyboardToggle.classList.toggle('exact-on', a.start || a.end);
    };
    _syncAnchorBoxes = syncBoxes;   // 新增：讓 setRawRx 能刷新勾選狀態
    const applyAnchor = (start, end) => {
      // 修改：不分模式，直接在框內加上或移除 ^、$（已有的不重複加）；不再記到 localStorage
      const body = SIMPLE.splitAnchors(searchInput.value.replace(/\s+/g, ' ').trim()).body;
      searchInput.value = SIMPLE.withAnchors(searchInput.value.replace(/\s+/g, ' ').trim(), start, end);
      searchClear.style.display = searchInput.value ? 'block' : 'none';
      updateRxUI(); syncBoxes();
      // 修改：勾選後不自動查詢（刪除 performSearch()），按查詢鈕或 Enter 才查
      searchInput.focus();
      if (!body) { const pos = start ? 1 : 0; searchInput.setSelectionRange(pos, pos); }   // 框內還沒有內容時，游標停在 ^ 與 $ 之間等待輸入
    };
    bStart.box.addEventListener('change', () => applyAnchor(bStart.box.checked, bEnd.box.checked));
    bEnd.box.addEventListener('change', () => applyAnchor(bStart.box.checked, bEnd.box.checked));
    bExact.box.addEventListener('change', () => applyAnchor(bExact.box.checked, bExact.box.checked));
    [bStart, bEnd, bExact].forEach(b => navigation.insertBefore(b.label, select));
    syncBoxes();

    virtualKeyboard.appendChild(navigation);   // 修改：導航列固定在面板頂端（CSS sticky）

    // 渲染各組按鈕
    Object.entries(groups).forEach(([groupName, chars], index) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'keyboard-group kb-list';   // 修改：加 kb-list（符號 + 說明 的排列）
      groupDiv.id = groupName;
      
      const groupTitle = document.createElement('div');
      groupTitle.className = 'keyboard-group-title';
      groupTitle.textContent = groupName;
      groupDiv.appendChild(groupTitle);


      chars.forEach(char => {
        const item = document.createElement('div');   // 新增：每個符號一列，右側顯示說明
        item.className = 'keyboard-item';
        const button = document.createElement('button');
        button.textContent = char.symbol;
        if (char.hint) {
          button.setAttribute('title', char.hint);
        }
		button.addEventListener('click', () => {
		  if (char.execute && char.execute.endsWith('()')) {
			executeFunction(char.execute);
		  } else {
			insertAtCursor(searchInput, char.symbol);
		  }
		  const searchTerm = searchInput.value.trim();
		  searchClear.style.display = searchTerm ? 'block' : 'none';
		  searchInput.focus();
		});
        item.appendChild(button);
        if (char.hint) {
          const desc = document.createElement('span');
          desc.className = 'kb-desc';
          desc.textContent = char.hint;
          desc.addEventListener('click', () => button.click());   // 點說明文字也可輸入
          item.appendChild(desc);
        }
        groupDiv.appendChild(item);
      });

      virtualKeyboard.appendChild(groupDiv);
    });

  }

  // 初始渲染鍵盤
  renderKeyboard();

  // 隱藏虛擬鍵盤的函數
  function hideVirtualKeyboard() {
    virtualKeyboard.style.display = 'none';
  }

  // 切換虛擬鍵盤的顯示/隱藏
  virtualKeyboardToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    virtualKeyboard.style.display = virtualKeyboard.style.display === 'none' || virtualKeyboard.style.display === '' ? 'block' : 'none';
    fitFloatingPanel(virtualKeyboard, 360);   // 新增：高度不超出視窗底部
  });

  // 點擊搜索框以外的地方時隱藏虛擬鍵盤
  document.addEventListener('click', (event) => {
    const searchWrapper = document.querySelector('.search-wrapper');
    if (!searchWrapper.contains(event.target) && !virtualKeyboard.contains(event.target) && event.target !== virtualKeyboardToggle) {
      hideVirtualKeyboard();
    }
  });

  // 防止點擊虛擬鍵盤和搜索框時關閉虛擬鍵盤
  virtualKeyboard.addEventListener('click', (event) => event.stopPropagation());
  searchInput.addEventListener('click', (event) => event.stopPropagation());

  // 點擊搜索按鈕時隱藏虛擬鍵盤
  searchButton.addEventListener('click', () => {
    hideVirtualKeyboard();
    // 這裡可以添加執行搜索的代碼
  });

  // 在搜索框中按下 Enter 鍵時隱藏虛擬鍵盤
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      hideVirtualKeyboard();
      // 這裡可以添加執行搜索的代碼
    }
  });
});

// https://sutian.moe.edu.tw/zh-hant/tshiau/?lui=tai_su&tsha=
// https://dict.revised.moe.edu.tw/search.jsp?md=1&word=媽媽

// ======== 外觀設定（字體大小 / 字體 / 行距）========
(function () {
  const KEY = 'kautian_appearance';
  const def = { fs: 130, font: 'tauhu', lh: 'normal', ex: 'ruby', pw: 'normal', rom: 'full', so: 'han', mx: 'off', df: 'brief', tn: 'off', tnh: 'on', tne: 'on', tns: '12345789', vw: 'off', vwh: 'on', vwe: 'on', vc: 'red', rw: 'off', ri: 'off' };
  let a = { ...def };
  try { Object.assign(a, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  if (!['ruby', 'line', 'seg'].includes(a.ex)) a.ex = 'ruby';
  if (!DEF_MODES.includes(a.df)) a.df = 'brief';
  if (!['han', 'rom'].includes(a.so)) a.so = 'han';   // 新增：列表排序
  if (!ROM_MODES.includes(a.rom)) a.rom = 'full';   // 舊版的「單行」改為 RUBY
  ['tn', 'tnh', 'tne', 'vw', 'vwh', 'vwe', 'mx', 'rw', 'ri'].forEach(k => { if (a[k] !== 'on' && a[k] !== 'off') a[k] = def[k]; });
  if (!['red', 'orange', 'blue', 'green'].includes(a.vc)) a.vc = def.vc;
  a.tns = typeof a.tns === 'string' ? a.tns.replace(/[^1-9]/g, '') : def.tns;   // 要標示的聲調（數字字串，如 "12345789"）
  { const FS = [150, 140, 130, 110], n = parseInt(a.fs, 10) || 130;   // 舊版連續字體大小 → 最接近的選項
    a.fs = FS.reduce((p, c) => Math.abs(c - n) < Math.abs(p - n) ? c : p); }
  const $ = id => document.getElementById(id);
  const segs = document.querySelectorAll('#settingsPage .seg[data-key]');
  const tnChips = document.querySelectorAll('#tnChips .tn-chip');
  function sync() {
    segs.forEach(seg => seg.querySelectorAll('button').forEach(btn => {
      const on = btn.dataset.v === String(a[seg.dataset.key]);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', on);
    }));
    tnChips.forEach(c => { const on = a.tns.includes(c.dataset.t); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  }
  function renderPreview() {   // 各設定列下方的即時預覽（用實際的顯示格式）
    const pe = $('previewEx');
    if (pe) pe.innerHTML = exampleHtml('你做你放心，時到一定有貴人會出現。（Lí tsò lí hòng-sim, sî kàu it-tīng ū kuì-jîn ē tshut-hiān.）你儘管放心，到時候一定有貴人會出現。');
    const pr = $('previewRom'), pd = $('previewDf');
    if (pr) pr.innerHTML = '<span class="pv-han">貴人</span> ' + romText('kuì-jîn/kuì-lîn');
    if (pd) pd.innerHTML = defListHtml('1. 【名詞】尊貴、顯貴的人。<br>2. 【名詞】使自己免於災難的人。');
    const pt = $('previewTn');   // 聲調色彩預覽：不受總開關影響，只反映「標示的聲調」
    if (pt) {
      window._tnPrev = true;
      try {
        pt.innerHTML = '<div class="pv-label">詞目</div><div class="pv-han">' + toneHanHtml('貴人', 'kuì-jîn') + '</div><div class="pv-label">例句</div>' +
          exampleHtml('你做你放心，時到一定有貴人會出現。（Lí tsò lí hòng-sim, sî kàu it-tīng ū kuì-jîn ē tshut-hiān.）你儘管放心，到時候一定有貴人會出現。');
      } finally { window._tnPrev = false; }
    }
    const pv = $('previewVw');   // 音色預覽：不受總開關影響
    if (pv) {
      window._vwPrev = true;
      try {
        pv.innerHTML = '<div class="pv-label">詞目</div><div class="pv-han">貴人　' + romHtml('kuì-jîn') + '</div><div class="pv-label">例句</div>' +
          exampleHtml('你做你放心，時到一定有貴人會出現。（Lí tsò lí hòng-sim, sî kàu it-tīng ū kuì-jîn ē tshut-hiān.）你儘管放心，到時候一定有貴人會出現。');
      } finally { window._vwPrev = false; }
    }
  }
  function save() {
    window.applyAppearance(a);
    renderPreview();
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {}
  }
  segs.forEach(seg => seg.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const key = seg.dataset.key;
    if (String(a[key]) === btn.dataset.v) return;
    a[key] = btn.dataset.v; sync(); save();
    if ((key === 'ex' || key === 'rom' || key === 'df' || key === 'ri') && filteredData.length && currentSearchType !== COMPARE_TAB) displayResults(filteredData, _lastPage);   // 立即更新列表
    if (key === 'so') resortList();   // 排序設定：立即重新排序
    if (key === 'mx') rerunSearch();  // 混拼符合：立即重新查詢
    if (key === 'rw') hideRelPop();   // 近反義顯示：切換時收起浮窗（滑鼠一移到詞上就依新設定動作）
    if (['tn', 'tnh', 'tne', 'vw', 'vwh', 'vwe'].includes(key)) refreshColorUI();   // 聲調色彩、音色：同時更新詳細頁與列表
  }));
  function setTones(str) { a.tns = str; sync(); save(); refreshColorUI(); }
  tnChips.forEach(c => c.addEventListener('click', () => {   // 點選聲調：加入／取消
    const t = c.dataset.t;
    setTones(a.tns.includes(t) ? a.tns.replace(t, '') : [...a.tns, t].sort().join(''));
  }));
  $('tnAll').addEventListener('click', () => setTones('12345789'));
  $('tnNone').addEventListener('click', () => setTones(''));
  window.setVowelOn = v => { a.vw = v ? 'on' : 'off'; sync(); save(); refreshColorUI(); };   // 詳細頁的「音色」開關：與設定同步
  window.setToneOn = v => { a.tn = v ? 'on' : 'off'; sync(); save(); refreshColorUI(); };   // 詳細頁的「聲調色彩」開關：與設定同步
  document.querySelectorAll('.js-reset-appearance').forEach(btn => btn.addEventListener('click', () => {   // 桌面（側邊欄）與手機（內容底部）各一顆
    a = { ...def }; sync(); save();
    refreshColorUI();   // 含列表與詳細頁
  }));
  function rerunSearch() {   // 新增：「混拼符合」顯示與否改變後，重新查詢（含詳細頁的側邊清單）
    if (!searchInput.value.trim() || currentSearchType === COMPARE_TAB) return;
    performSearch();
    if (window._sbRefresh) window._sbRefresh();
  }
  function resortList() {   // 新增：排序設定改變後，重新排序並回到第 1 頁
    if (!filteredData.length || currentSearchType === COMPARE_TAB) return;
    sortFilteredData(searchInput.value.trim());
    displayResults(filteredData, 1);
    if (window._sbRefresh) window._sbRefresh();   // 新增：詳細頁開著時，側邊清單也跟著重排
  }
  window.setSortMode = v => { a.so = v; sync(); save(); resortList(); };   // 表格頂端的「詞目」切換：與設定同步
  sync(); renderPreview();
  window.setExampleMode = v => { a.ex = v; sync(); save(); };
  window.setDefMode = v => {   // 表格頂端的「釋義」切換：與設定同步並立即更新列表
    a.df = v; sync(); save();
    if (filteredData.length && currentSearchType !== COMPARE_TAB) displayResults(filteredData, _lastPage);
  };
  window.setRomMode = v => {   // 表格頂端的「台羅」切換：與設定同步並立即更新列表
    a.rom = v; sync(); save();
    if (filteredData.length && currentSearchType !== COMPARE_TAB) displayResults(filteredData, _lastPage);
  };
})();

// 依網址還原畫面：不等圖片／字型／外部資源（window.onload），DOM 就緒就立刻做；
// 放在檔案最後，確保其他 DOMContentLoaded 初始化都已先執行。
function restoreFromUrl() {
  try { applyUrlState(true); }
  finally {
    void document.body.offsetHeight;                       // 先讓畫面以「已還原」的狀態定案（此時過場動畫仍關閉）
    document.documentElement.classList.remove('restoring'); // 再顯示畫面、恢復過場動畫
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreFromUrl);
else restoreFromUrl();

// 新增：搜尋框提示文字。一開始顯示「臺灣台語和樂典」，數秒後淡出並換成查詢提示；
// 使用者點進搜尋框時，立刻換成查詢提示（不再換回去）
(function () {
  const box = document.getElementById('searchInput');
  if (!box) return;
  const HINT = '揣漢字、台羅、華語釋義⋯⋯', DELAY = 4000;
  let done = false, timer = 0;
  const swap = animate => {
    if (done) return; done = true; clearTimeout(timer);
    if (!animate) { box.placeholder = HINT; return; }
    box.classList.add('ph-fade');                                   // 淡出
    setTimeout(() => { box.placeholder = HINT; box.classList.remove('ph-fade'); }, 350);   // 換字後淡入
  };
  box.addEventListener('focus', () => swap(false));
  timer = setTimeout(() => swap(true), DELAY);
})();


// ======== 手機版右上角選單：分類／分析／設定 收進一個三條線按鈕（點選項目＝代按原本的按鈕）========
(function () {
  const btn = document.getElementById('menuTrigger'), pop = document.getElementById('menuPop');
  if (!btn || !pop) return;
  const setOpen = on => { pop.hidden = !on; btn.setAttribute('aria-expanded', on); };
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(pop.hidden); });
  pop.addEventListener('click', e => {
    const it = e.target.closest('button[data-target]'); if (!it) return;
    e.stopPropagation();   // 避免分類面板的「點外面就關閉」把剛開啟的面板又關掉
    setOpen(false);
    const t = document.getElementById(it.dataset.target); if (t) t.click();
  });
  document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('#menuPop, #menuTrigger')) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) setOpen(false); });
})();


// ======== 詳細頁（手機版）：調色／音色／例句 收在一個「顯示」按鈕裡 ========
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.tools-m-btn');
  document.querySelectorAll('.tools-m-pop').forEach(pop => {
    const mine = btn && pop.parentNode === btn.parentNode;
    if (mine) { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', !pop.hidden); }
    else if (!pop.contains(e.target)) { pop.hidden = true; const b = pop.parentNode.querySelector('.tools-m-btn'); if (b) b.setAttribute('aria-expanded', 'false'); }
  });
});
