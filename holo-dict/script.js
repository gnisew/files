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

// 新增：把「台羅無調」裡「主音讀 ↔ 又唸」之間的空格改成「/」（與「主/副音讀」同一種分隔），讓比對不會跨讀音。
// 做法：依「台羅」（主音讀）與「又唸作」（括號內的又唸）各讀音的音節數，在累計音節數剛好是讀音邊界的地方，把分隔符換成「/」。
// 沒有又唸作的詞條不動（它們的空格是同一讀音內的音節分隔，如 tsit8 gueh8-jit8）。
function fixAltRomBoundary(entry) {
  const wd = entry['台羅無調'], alt = entry['又唸作'], rom = entry['台羅'];
  if (!wd || !alt || !alt.trim() || !rom) return;
  const sylN = t => t.split(/[\s\-]+/).filter(Boolean).length;
  const L = [];
  String(rom).replace(/【[^】]*】/g, '').split('/').map(x => x.trim()).filter(Boolean).forEach(m => L.push(sylN(m)));
  alt.split('<br>').forEach(l => (l.match(/（([^）]*)）/g) || []).forEach(m => m.slice(1, -1).split('/').forEach(x => { x = x.trim(); if (x) L.push(sylN(x)); })));
  const bounds = new Set(); let c = 0;
  L.forEach(n => { c += n; bounds.add(c); });
  const total = c; let cnt = 0, out = '', force = false, m;
  const re = /([^\s\-\/]+)|([\s\-\/]+)/g;
  while ((m = re.exec(wd))) {
    if (m[1]) { cnt++; out += m[1]; force = bounds.has(cnt) && cnt < total; }
    else { out += (force && !m[2].includes('/')) ? '/' : m[2]; force = false; }
  }
  entry['台羅無調'] = out;
}

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split('\t');
    const data = [];
    // 新增：data.js 的「分類」欄只存 myCatDict 的編號（省檔案大小），這裡還原成原本的字串；沒有 myCatDict（舊版 data.js）就維持原樣
    const catCol = typeof myCatDict !== 'undefined' ? headers.indexOf('分類') : -1;
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        if (catCol >= 0) values[catCol] = myCatDict[values[catCol]] || '';
        const entry = {};
        headers.forEach((header, index) => {
            entry[header] = values[index];
        });
        fixAltRomBoundary(entry);   // 新增：「台羅無調」把主音讀與又唸以空格相接，空格會被當成音節分隔，查詢（如 -y8 -y8）會跨讀音湊成符合；這裡改用「/」分開各讀音
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
// 新增：「部首」分頁（比照「分類」：平常隱藏，只有從詳細頁點部首進來才出現）。
// 資料裡沒有「部首」欄，所以替每個單字詞目加一個不可列舉的虛擬欄位 item['部首']（屬多個部首時以「、」相連），
// 之後與「分類」一樣逐項「完全符合」比對（查「木」只找部首是「木」的字，不會找到含「木」的詞）。
const RADICAL_TAB = '部首';
if (typeof myRadicalOf === 'function') {   // radical.js 沒載入就不提供此分頁
  dictionary.forEach(it => {
    const han = (it['台語'] || '').replace(/【[^】]*】/g, '').trim();
    const chars = han.length <= 2 ? [...han] : [];   // 修改：單一字元最多 2 個 UTF-16 單位，超過的直接略過（啟動時少掃約三萬筆的展開）
    const names = chars.length === 1 ? [...new Set(myRadicalOf(chars[0]).map(r => r.name))] : [];
    Object.defineProperty(it, RADICAL_TAB, { value: names.join('、'), writable: true });   // 不可列舉：不會出現在其他欄位的迴圈裡
  });
  searchTypes.push(RADICAL_TAB);
}
const _lazy = {};
// 修改：全站唯一的動態載入函式（原本 article.js 的 alt.js／freq.js、suggest.js 各有一套）。
// check（選用）：載入後檢查資料是否真的出現，例如 () => typeof myAltChars !== 'undefined'；沒通過就當失敗，下次可重試。
// 同一個 src 只載入一次；已有 check 且已通過時，直接回傳成功。
function loadScript(src, check) {
  if (check && check()) return Promise.resolve();
  if (!_lazy[src]) {
    _lazy[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => { if (check && !check()) { delete _lazy[src]; el.remove(); reject(new Error(src + ' 內容不正確')); } else resolve(); };
      el.onerror = () => { delete _lazy[src]; el.remove(); reject(new Error('載入失敗：' + src)); };
      document.head.appendChild(el);
    });
  }
  return _lazy[src];
}
const SORTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.14.0/Sortable.min.js';   // 新增：原本寫在 index.html <head>（會擋住畫面），改成用到才載入
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
  return `<button type="button" class="vw-toggle" title="開關音讀母音的顏色（細項在「設定」）">母音標色<b class="sw" data-on="${(window.vwOn) ? 1 : 0}">${window.vwOn ? '開' : '關'}</b></button>`;
}
// 詳細頁「聲調色彩」開關（總開關；細項在設定裡）
function tnToggleHtml() {
  return `<button type="button" class="tn-toggle" title="開關字調色彩（細項在「設定」）">字調標色<b class="sw" data-on="${(window.tnOn) ? 1 : 0}">${window.tnOn ? '開' : '關'}</b></button>`;
}
// 詳細頁「句色」開關（分句標色總開關；細項在設定裡）
function scToggleHtml() {
  return `<button type="button" class="sc-toggle" title="開關釋義的分句標色（細項在「設定」）">釋義句色<b class="sw" data-on="${(window.scCfg && window.scCfg.on) ? 1 : 0}">${window.scCfg && window.scCfg.on ? '開' : '關'}</b></button>`;
}
// 詳細頁「例句語詞查詢」「近反義顯示」開關（細項在設定裡）
function rqToggleHtml() {
  return `<button type="button" class="rq-toggle" title="開關例句分詞的點擊查詢（設定裡也可調整）">分詞查詢<b class="sw" data-on="${window.rqOn ? 1 : 0}">${window.rqOn ? '開' : '關'}</b></button>`;
}
function rwToggleHtml() {
  return `<button type="button" class="rw-toggle" title="開關例句分詞的近反義懸停顯示（設定裡也可調整）">分詞近反義<b class="sw" data-on="${window.rwOn ? 1 : 0}">${window.rwOn ? '開' : '關'}</b></button>`;
}
function refreshColorUI() {   // 設定或開關改變後：更新詳細頁與列表
  document.querySelectorAll('.entry-han[data-han]').forEach(el => { el.innerHTML = toneHanHtml(el.dataset.han, el.dataset.rom); });
  document.querySelectorAll('.entry-rom-main[data-rom]').forEach(el => { el.innerHTML = romHtml(el.dataset.rom); });
  document.querySelectorAll('.sense-ex li[data-ex]').forEach(li => { li.innerHTML = exampleHtml(li.dataset.ex); });
  document.querySelectorAll('.sense-def[data-def]').forEach(el => { el.innerHTML = hlHtml(defLineHtml(el.dataset.def, false, false, true)); });   // 新增：分句標色開關改變
  document.querySelectorAll('.rel-words[data-w]').forEach(el => { el.innerHTML = relWordsHtml(el.dataset.w); });   // 相關詞音讀開關改變
  document.querySelectorAll('.tn-toggle b').forEach(b => { b.textContent = window.tnOn ? '開' : '關'; b.dataset.on = (window.tnOn) ? 1 : 0; });
  document.querySelectorAll('.vw-toggle b').forEach(b => { b.textContent = window.vwOn ? '開' : '關'; b.dataset.on = (window.vwOn) ? 1 : 0; });
  document.querySelectorAll('.rq-toggle b').forEach(b => { b.textContent = window.rqOn ? '開' : '關'; b.dataset.on = window.rqOn ? 1 : 0; });
  document.querySelectorAll('.rw-toggle b').forEach(b => { b.textContent = window.rwOn ? '開' : '關'; b.dataset.on = window.rwOn ? 1 : 0; });
  document.querySelectorAll('.sc-toggle b').forEach(b => { b.textContent = window.scCfg && window.scCfg.on ? '開' : '關'; b.dataset.on = (window.scCfg && window.scCfg.on) ? 1 : 0; });
  if (filteredData.length && currentSearchType !== COMPARE_TAB) displayResults(filteredData, _lastPage);
}
document.addEventListener('click', function (e) {
  if (e.target.closest('.tn-toggle') && window.setToneOn) window.setToneOn(!window.tnOn);
  if (e.target.closest('.vw-toggle') && window.setVowelOn) window.setVowelOn(!window.vwOn);
  if (e.target.closest('.rq-toggle') && window.setRqOn) window.setRqOn(!window.rqOn);
  if (e.target.closest('.rw-toggle') && window.setRwOn) window.setRwOn(!window.rwOn);
  if (e.target.closest('.sc-toggle') && window.setScOn) window.setScOn(!(window.scCfg && window.scCfg.on));
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
// ======== 分句標色（詳細頁釋義）：依標點切句，相鄰句子 3 色循環底色；1 句也標示（選項在「設定 → 內容顯示」）========
const SC_HUES = [215, 35, 140];   // 藍、橘黃、綠
const SC_CLOSERS = '」』”’）)】';
function scRender(text) {   // 回傳 { html, cls }；不需套用時回傳 null
  const c = window.scCfg;
  if (!c || !c.on || !text || /</.test(text)) return null;   // 開關關閉、或內容含 HTML 標籤時，不處理
  const ends = '。；;？?！!' + (c.comma ? '，,、' : '');
  const chars = Array.from(text), parts = [];
  let cur = '';
  for (let i = 0; i < chars.length; i++) {
    cur += chars[i];
    if (ends.includes(chars[i])) {
      while (i + 1 < chars.length && SC_CLOSERS.includes(chars[i + 1])) cur += chars[++i];
      parts.push(cur); cur = '';
    }
  }
  if (cur.trim()) parts.push(cur);
  if (!parts.length) return null;
  const html = parts.map((t, i) => `<span class="sc-w"><span class="sc-s" style="--h:${SC_HUES[i % 3]}">${t}</span></span>`).join('');
  const cls = 'sc-bg' + (c.blk ? ' sc-blk' : '');
  return { html, cls };
}
function defLineHtml(d, noPos, short, sc) {   // noPos 為 true 時不顯示詞類標籤（標準模式）；sc 為 true 時套用分句標色（詳細頁用）
  const m = d.match(/^(\d+)\. ([\s\S]*)$/);
  let { chip, rest, has } = posChipHtml(m ? m[2] : d, short);
  if (noPos) { chip = ''; has = false; }
  // 編號、詞類、內容各自一欄（grid），換行時內容永遠對齊在內容欄
  const scr = sc ? scRender(rest) : null;   // 分句標色（詳細頁）
  const cls = 'def-line' + (m ? ' has-no' : '') + (has ? ' has-pos' : '') + (has && short ? ' pos-short' : '');
  return `<div class="${cls}">${m ? `<span class="def-no">${m[1]}.</span>` : ''}${chip}<span class="def-text${scr ? ' ' + scr.cls : ''}">${scr ? scr.html : rest}</span></div>`;
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
// ======== 列表「釋義」顯示模式：完整（編號＋詞類）／標準（編號，無詞類）／合併（合併成一段）／單行（合併後不換行，超出隱藏）========
const DEF_MODES = ['full', 'std', 'brief', 'line'];   // 修改：新增 'line'（單行）；內部代碼 brief 不變，名稱改為「合併」
const DEF_LABEL = { full: '完整', std: '標準', brief: '合併', line: '單行' };   // 修改：精簡→合併；新增單行
function defListHtml(text) {
  const mode = window.defMode || 'brief';
  const defs = (text || '').split('<br>').filter(Boolean);
  if (mode === 'brief' || mode === 'line') {   // 修改：單行與合併用同一段內容，只差外層樣式
    const joined = defs.map(d => {
      let t = posChipHtml(d.replace(/^\d+\. /, '')).rest.trim();
      if (t && !/[。！？；」』）)…]$/.test(t)) t += '；';
      return t;
    }).join('').replace(/；$/, '。');   // 最後一段若沒有句號，補上
    if (mode === 'line') return `<div class="def-brief def-oneline" title="${joined.replace(/<[^>]*>/g, '').replace(/"/g, '&quot;')}">${joined}</div>`;   // 新增：單行（不換行、超出隱藏；滑過顯示完整釋義）
    return `<div class="def-brief">${joined}</div>`;
  }
  return defs.map(d => defLineHtml(d, mode === 'std', true)).join('')   // 列表：詞類用單字簡稱;
}
document.addEventListener('click', function (e) {        // 表格頂端（手機版為各列標籤）的「釋義」：完整 → 標準 → 合併 → 單行
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
    return `<div class="sense${/^\d+\. /.test(d) ? ' numbered' : ''}"><div class="sense-def" data-def="${escHtml(d)}">${hlHtml(defLineHtml(d, false, false, true))}</div>${exHtml ? `<ul class="sense-ex">${exHtml}</ul>` : ''}</div>`;
  }).join('');
}

// 詳細頁「例句」切換鈕：RUBY → 標準 → 分詞 → RUBY
function exToggleHtml() {
  const m = EX_LABEL[window.exMode] || 'RUBY';
  return `<button type="button" class="ex-toggle" title="切換例句顯示方式">例句顯示：<b>${m}</b></button>`;
}
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.ex-toggle, .ex-head-toggle'); if (!btn) return;   // 修改：加入列表表頭的「例句」切換鈕（.ex-head-toggle）
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

// 新增：以「部首」查詢（詳細頁的部首）→ 關閉詳細頁，切到「部首」分頁，只列部首完全符合的字
function searchByRadical(name) {
  hideDetailUI();
  currentDetailId = null;
  setRawRx(false);
  searchInput.value = name;
  currentSearchType = RADICAL_TAB;
  performSearch();
  updateActiveSearchType();
  window.scrollTo(0, 0);
}
document.addEventListener('click', function (e) {
  const b = e.target.closest('.radical-link[data-rad]'); if (!b) return;
  searchByRadical(b.dataset.rad);
});

// ======== 台羅音讀：資料以「/」分隔兩種音讀（前為主、後為副），可選 全部／主音讀／副音讀 ========
const ROM_MODES = ['full', 'main', 'sub'];
const ROM_LABEL = { full: '主副', main: '主', sub: '副' };   // 修改：full 的標籤 全→主副
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
  const cp = e.target.closest('.copy-han');
  if (cp && window.matchMedia('(max-width: 768px)').matches) { copyPlain(cp.dataset.copy); return; }   // 手機版：點詞目＝複製詞目（電腦版維持點整列開詳細頁）
  const hit = e.target.closest('a, button, .rom-toggle, .def-toggle, .sort-toggle');
  if (hit && !hit.classList.contains('rel-word')) return;   // 列表裡的例句詞不是連結：點下去等同點整列，開詳細頁
  if (String(window.getSelection && window.getSelection()).trim()) return;
  const num = tr.querySelector('.item-number[data-index]'); if (!num) return;
  showFullData(parseInt(num.dataset.index, 10));
});

// 教育部辭典原頁網址（有詞目id直連該詞條頁，沒有才以詞目搜尋）；手機版列表的外連圖示用
function moeUrlOf(item) {
  const id = String(item['詞目id'] || '').trim(), han = String(item['台語'] || '').replace(/【[^】]*】/g, '').trim();
  return /^\d+$/.test(id) ? 'https://sutian.moe.edu.tw/zh-hant/su/' + id
    : 'https://sutian.moe.edu.tw/zh-hant/tshiau/?lui=tai_su&tsha=' + encodeURIComponent('^' + han + '$');
}
const copyHanHtml = (item, inner) => `<span class="copy-han" data-copy="${escHtml(String(item['台語'] || '').replace(/【[^】]*】/g, '').trim())}" title="點一下複製詞目">${inner}</span>`;
// 小提示（約 1.4 秒後消失）
function holoToast(msg) {
  let t = document.getElementById('holoToast');
  if (!t) { t = document.createElement('div'); t.id = 'holoToast'; t.className = 'holo-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1400);
}
function copyPlain(text) {
  const ok = () => holoToast('已複製：' + text);
  const fb = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { if (document.execCommand('copy')) ok(); } catch (e) {} ta.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fb); else fb();
}

// 近義詞／反義詞：每個詞可點擊，直接以該詞查詢「詞目」
let _romIdx = null;
function romOfWord(w) {   // 詞 → 音讀陣列（辭典裡同字詞的各個音讀，去重）；找不到回傳空陣列
  if (!_romIdx) {
    _romIdx = new Map();
    dictionary.forEach(it => {
      const key = relNorm((it['台語'] || '').replace(/【替】/g, '').trim()), rom = (it['台羅'] || '').trim();
      if (!key || !rom) return;
      let v = _romIdx.get(key); if (!v) _romIdx.set(key, v = []);
      if (!v.includes(rom)) v.push(rom);
    });
  }
  return _romIdx.get(relNorm(w)) || [];   // 修改：改回傳陣列（每個音讀各自帶【白】【文】等標記），不再先接成一個字串
}
function relWordsHtml(text) {
  const ws = (text || '').split('、').map(w => w.trim()).filter(Boolean);
  const btn = w => `<button type="button" class="rel-word" data-word="${escHtml(w)}" title="查詢「${escHtml(w)}」">${escHtml(w)}</button>`;
  if (!window.rrOn) return ws.map(btn).join('<span class="rel-sep">、</span>');   // 預設：一行，用頓號分開
  return ws.map(w => { const rs = romOfWord(w); return `<div class="rel-item">${btn(w)}${rs.length ? `<span class="rel-rom">${rs.map(romHtml).join('<span class="rel-sep"> ／ </span>')}</span>` : ''}</div>`; }).join('');   // 修改：各音讀分別用 romHtml 轉換（標記才會跟在各自的拼音後面），再用「 ／ 」相接
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
  if (b.closest(LIST_WORD_SEL)) return;   // 列表（結果表格、側邊清單）裡的詞不可點擊查詢，避免與「點整列看詳細」混淆
  if (b.matches(REL_WORD_SEL)) {   // 例句裡的詞
    const touch = e.pointerType && e.pointerType !== 'mouse';
    // 手機／觸控：開啟近反義顯示時，點詞浮出視窗：有開「例句語詞查詢」→ 最上面一列「查 詞」；有近反義資料 → 近、反各一列。兩者都沒有就不浮出
    if (window.rwOn && touch && (window.rqOn || relOf(b.dataset.word || ''))) {
      if (_relFor === b && _relPop && !_relPop.hidden) hideRelPop(); else showRelPop(b, true);
      return;
    }
    if (!window.rqOn) return;   // 未啟用「例句語詞查詢」：點例句的詞不查詢
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
const LIST_WORD_SEL = '#results, #sidebarList';   // 列表區：裡面的例句詞不提供點擊查詢、近反義浮窗
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
  const v = relOf(btn.dataset.word || '') || { syn: [], ant: [] };
  const showOrig = withOrig && window.rqOn;
  if (!showOrig && !v.syn.length && !v.ant.length) { hideRelPop(); return; }
  const pop = relPopEl();
  const row = (cls, label, list) => list.length ? `<div class="rw-row"><span class="rw-lab ${cls}">${label}</span><div class="rw-chips">${list.map(w => `<button type="button" class="rw-chip" data-word="${escHtml(w)}">${escHtml(w)}</button>`).join('')}</div></div>` : '';
  const head = showOrig ? `<div class="rw-row"><span class="rw-lab rw-org">查</span><div class="rw-chips"><button type="button" class="rw-chip rw-chip-orig" data-word="${escHtml(btn.dataset.word)}">${escHtml(btn.dataset.word)}</button></div></div>` : '';
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
  const b = e.target.closest && e.target.closest(REL_WORD_SEL); if (!b || b.closest(LIST_WORD_SEL)) return;
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
  // 新增：單字詞目 → 部首與筆畫「部首 部首筆畫-部首外筆畫-總筆畫」（例：鳥 11-10-21）；靠右顯示。同字若屬多個部首，各列一組
  const radicalNote = () => {
    if (typeof myRadicalOf !== 'function') return '';   // radical.js 沒載入就略過
    const chars = [...hanPlain];
    if (chars.length !== 1) return '';                  // 只處理單字
    const rs = myRadicalOf(chars[0]);
    if (!rs.length) return '';
    return '<span class="radical-note" title="部首　部首筆畫－部首外筆畫－總筆畫">' +
      rs.map(r => `<button type="button" class="radical-link" data-rad="${escHtml(r.name)}" title="查詢部首「${escHtml(r.name)}」的字">${escHtml(r.name)}</button> ${r.strokes}-${r.outside}-${r.total}`).join('、') + '</span>';   // 修改：部首改成可點擊的按鈕
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
    altNote('又唸作', '又唸') + altNote('俗唸作', '俗唸') + radicalNote() + '</div></div>';   // 修改：音讀列最後加上部首筆畫
  if (item['分類']) {
    html += '<div class="entry-chips">' + item['分類'].split('、').map(c => c.trim()).filter(Boolean).map(c => `<button type="button" class="chip" data-cat="${escHtml(c)}" title="查詢「${escHtml(c)}」分類的詞">${escHtml(c)}</button>`).join('') + '</div>';
  }
  const secTools = (withEx, withSc) => { const sep = '<div class="tm-sep" role="separator"></div>';
    const btns = `${tnToggleHtml()}${vwToggleHtml()}${withSc ? scToggleHtml() : ''}${withEx ? sep + rqToggleHtml() + rwToggleHtml() + sep + exToggleHtml() : ''}`;   // 修改：分三組（標色開關｜分詞查詢、分詞近反義｜例句顯示），組間加細線，「例句顯示」放最下面（電腦版、手機版相同）
    return `<span class="sec-tools"><span class="sec-tools-m"><button type="button" class="tools-m-btn" aria-expanded="false" aria-haspopup="true"><svg class="icon" aria-hidden="true"><use href="#i-tune"/></svg>顯示</button><div class="tools-m-pop" hidden>${btns}</div></span></span>`; };
  if (item['釋義']) html += sec('釋義' + secTools(!!item['例句'], true), senseDetailHtml(item));
  else if (item['例句']) html += sec('例句' + secTools(false), item['例句']);
  const syn = item['近義詞'] || '', ant = item['反義詞'] || '';
  if (syn || ant) {
    html += sec('相關',
      (syn ? `<div class="rel-line"><span class="rel-tag">近</span><span class="rel-words" data-w="${escHtml(syn)}">${relWordsHtml(syn)}</span></div>` : '') +
      (ant ? `<div class="rel-line"><span class="rel-tag rel-ant">反</span><span class="rel-words" data-w="${escHtml(ant)}">${relWordsHtml(ant)}</span></div>` : ''));
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
const TYPE_CODE = { '分類': 'fl', '釋義': 'sy', '例句': 'lj', '華語例句': 'lh', '近義詞': 'jy', '反義詞': 'fy', '華語對照': 'hy', '姓名': 'xm', [RADICAL_TAB]: 'bs' };   // 修改：加上「部首」(bs)
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([k, v]) => [v, k]));
const typeToCode = t => TYPE_CODE[t] || t;
const codeToType = c => CODE_TYPE[c] || c;
const defaultType = () => searchTypes[0];
let _restoring = false;      // 依網址還原畫面時，不回寫網址
let _articleOpen = false;    // 新增：換詞（語詞替換）頁面是否開著（對應網址參數 a=1）
let _browseOpen = false;    // 新增：分類／部首／拼音瀏覽大視窗是否開著（對應網址參數 b）
let _urlQ = '';              // 目前網址中的查詢詞（判斷要新增或取代歷史紀錄）
let _shownQ = null, _shownT = null;   // 畫面上已顯示的查詢詞與類型
// 新增：「原始正則模式」——按下「轉為正則」後，搜尋框內容完全當標準正則，不再經過簡易語法（單向，不能轉回）
let _rawRx = false;          // 是否在原始正則模式
let _rawSrc = '', _rawHl = null;   // 剛轉出時的正則文字與 A#B 的標示用正則（使用者改過文字後 _rawHl 即失效）
let _rawCode = 'p';          // 新增：隱藏包裝的代碼（b 音節邊界、g 群組、s／e／se 開頭／結尾／精確、p 無），見 SIMPLE.rawWrap
let _urlR = '', _shownR = '';   // 修改：網址中／畫面上的模式代碼（'' ＝ 一般模式；對應網址參數 r=代碼）
const rawKey = () => _rawRx ? _rawCode : '';   // 新增
let _autoEx = false;   // 新增：「自動精確」——點拼音範例、疊字範例時，查詢當作 ^…$ 精確比對，但框內不顯示 ^ $（隱藏狀態）；使用者自己打了 ^ 或 $ 就改以框內文字為準
const modeKey = () => rawKey() + (_autoEx ? 'x' : '');   // 新增：網址／畫面上的模式代碼（正則代碼 ＋ 自動精確 x），用來判斷模式有沒有改變
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
    else if (_autoEx) p.set('x', '1');   // 新增：x=1 ＝ 自動精確（框內不顯示 ^ $）
    if (currentSearchType !== defaultType()) p.set('t', typeToCode(currentSearchType));
    if (!isSpecialTab(currentSearchType) && typeof _lastPage === 'number' && _lastPage > 1) p.set('p', _lastPage);
    if (currentDetailId) p.set('d', currentDetailId);
  }
  if (_articleOpen) p.set('a', '1');   // 新增：換詞頁開著
  if (_browseOpen) {
    p.set('b', _browseMode);
    if (_browseMode === 'py') {
      if (_pySel) p.set('bp', _pySel);
      if (_pyView !== 'fam') p.set('bv', _pyView);
      if (_pyRev) p.set('br', '1');
      if (!_pyOne) p.set('bo', '0');
      if (_pyView === 'mx' && _pyMxPair) p.set('bm', 'pair');
      if (_pyOne && _pyView !== 'mx' && _pyCur) p.set('bc', _pyCur);
    }
    if (_browseMode === 'rad' && _radCur) p.set('bs', _radCur);   // 新增：部首目前捲到的筆畫（第一組不寫）
    if (_browseMode === 'rad' && _radAct === 'text' && _radSel) p.set('bq', _radSel);   // 新增：「檢視文字」模式選中的部首
  }   // 新增：分類／部首／拼音瀏覽開著（b＝哪一種；bp＝拼音選中的音節）
  const qs = p.toString();
  return location.pathname + (qs ? '?' + qs : '');
}
// mode：'push' 新增一筆歷史（新查詢、開啟詳細檢視）；'replace' 只更新網址（換頁、換類型）
function syncUrl(mode) {
  updateTitle();   // 新增：查詢、開關詳細檢視時，同步分頁標題
  if (_restoring) return;
  const url = buildUrl();
  if (url === location.pathname + location.search) return;
  if (mode === 'push') history.pushState({ detail: !!currentDetailId, browse: _browseOpen }, '', url);
  else history.replaceState(history.state, '', url);
}
function syncSearchUrl() {
  const q = normQ();
  syncUrl(q !== _urlQ || modeKey() !== _urlR ? 'push' : 'replace');   // 修改：模式改變也算新查詢（rawKey → modeKey）
  _urlQ = q; _urlR = modeKey(); _shownQ = q; _shownT = currentSearchType; _shownR = modeKey();   // 修改：多記 _urlR、_shownR
}
// 新增：分頁標題跟著查詢變動
//   有查詢：「花(206) 和樂典-烏衣行」；開啟詞目：「沃花-和樂典-烏衣行」；其他：「和樂典-烏衣行」
//   用 setTimeout 0 延後到狀態都更新完（例如 currentDetailId 在關閉時才被清掉）再讀取。
function updateTitle() {
  clearTimeout(window._titleTimer);
  window._titleTimer = setTimeout(() => {
    const BASE = '和樂典-烏衣行';
    let t = BASE;
    if (currentDetailId != null) {
      const it = dictionary.find(x => x['詞目id'] === currentDetailId);
      const w = it ? String(it['台語'] || '').replace(/【[^】]*】/g, '').trim() : '';
      if (w) t = w + '-' + BASE;
    } else if (_shownQ) {
      const q = searchInput.value.trim();
      if (q) t = q + (isSpecialTab(currentSearchType) ? '' : '(' + filteredData.length + ')') + ' ' + BASE;   // 修改：查詢（筆數）與「和樂典」之間加一個空格   // 比對、取名分頁沒有一般列表，不顯示筆數
    }
    if (document.title !== t) document.title = t;
  }, 0);
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
  updateTitle();   // 新增
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
  { // 新增：b=cat／rad／py ＝ 瀏覽大視窗開著（上一頁／下一頁、直接連進來都適用）；沒有 b 就關
    const bm = sp.get('b');
    if (bm === 'cat' || bm === 'rad' || bm === 'py') {
      const pyChg = bm === 'py' && pyStateFromUrl(sp);
      const _newOpen = !catFull.classList.contains('open') || _browseMode !== bm;   // 新增：這次是否由網址「新開啟」（含切換模式）
      if (_newOpen) toggleCategoryFull(true, bm, { fromUrl: true });
      else if (pyChg) renderPinyinFull();
      if (bm === 'rad') {   // 新增：還原部首的筆畫位置
        const bq = sp.get('bq') || '';   // 新增：還原「檢視文字」選中的部首
        if (bq !== _radSel) { _radSel = bq; if (bq) { _radAct = 'text'; syncRadAct(); } radMarkSel(); }
        const bs = sp.get('bs') || '';
        if (bs !== _radCur) { if (bs) radScrollTo(bs, false); else catFullBody.scrollTop = 0; _radCur = bs; }
      }
      const bp = sp.get('bp');
      if (bm === 'py' && bp && bp !== _pySel) { const e = getPinyinIndex().syl.get(bp); if (e) { _pySel = bp; _pyCur = sp.get('bc') || (_pyRev ? e.fin : (e.ini || '零')); renderPinyinFull(); } }
      if (_newOpen && !initial) restoreBrowseScroll(bm, bm === 'rad' ? (sp.get('bq') || '') : bm === 'py' ? (sp.get('bp') || '') : '');   // 新增：上一頁回到瀏覽視窗 → 回到上次的捲動位置（重新整理不套用）
    } else if (catFull.classList.contains('open')) toggleCategoryFull(false, null, { fromUrl: true });
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
    _autoEx = !raw && sp.get('x') === '1';   // 新增：還原自動精確（setRawRx 會先把它清掉，所以放在後面）
    const mode = raw + (_autoEx ? 'x' : '');   // 新增
    if (q !== _shownQ || type !== _shownT || mode !== _shownR) {   // 修改：raw → mode   // 修改：模式不同也要重查
      currentSearchType = type;
      performSearch();
      updateActiveSearchType();
    }
    _urlQ = q; _urlR = mode;   // 修改：raw → mode
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
window.addEventListener('popstate', updateTitle);   // 新增：上一頁／下一頁後，標題跟著還原




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
  return q.length >= 3 && !/[vwy]/.test(q) ? q : '';   // 至少 3 個字母，避免打到一半列出太多
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
  const CODA_ONE = '(?:ng|nn|m|n|p|t|k|h)';   // 新增：韻尾清單用的單項（m;ng、am;ng）
  const CODA_ENGAGE = new RegExp('[aeiou]' + CODA_ONE + '(?:;' + CODA_ONE + ')+(?![A-Za-z])');
  const CODA_LIST = new RegExp('^([b-df-hj-np-tv-z]*[aeiou]+)(' + CODA_ONE + '(?:;' + CODA_ONE + ')+)(?![A-Za-z])');   // am;ng ＝ a＋(m|ng)
  const INITIAL = '[phmbtnlkgsj]+';                             // ~<
  const FINAL = '(?:[aeiou][a-z]*|(?:ng|m)h?)';                 // ~>（含 m、ng 成音節）
  const CONS1 = '[b-df-hj-np-tv-z]';                            // V ＝ 非母音字母
  // 新增：聲母群組與「或」——p; ＝ 唇音群組；p;kh ＝ p 或 kh。只寫聲母（沒有 y）時，只代表聲母本身
  const INITS = 'tsh|ts|ph|th|kh|ng|p|t|k|m|b|n|l|s|j|g|h';
  const INIT_GROUP = { p: '(?:ph|p|m|b)', t: '(?:th|t|n|l)', ts: '(?:tsh|ts|s|j)', k: '(?:kh|k|ng|g|h)', ph: '(?:ph|th|kh|tsh)', m: '(?:ng|n|m)', b: '(?:b|g)', j: '(?:j|l)' };
  const REQ_INIT = '(?:tsh|ts|ph|th|kh|ng|[ptkmbnlsjgh])', ANY_INIT = REQ_INIT + '?';   // 新增：+a ＝ 一定要有聲母（不含零聲母）；   // 新增：?a ＝ 任一聲母（含零聲母）＋元音；?y 仍同 y
  const INIT_RE = new RegExp('^(?:' + INITS + ')(?:;(?:' + INITS + '))*');
  const INIT_ENGAGE = new RegExp('(?<![A-Za-z])(?:' + INITS + ');');
  const HAN_RE = /[\u3007\u3400-\u4DBF\u4E00-\u9FFF\uE815-\uE864\uF900-\uFAFF]|[\uD840-\uD87F][\uDC00-\uDFFF]/;
  const noEsc = t => t.replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');   // 去掉跳脫字元與 [...] 字元集後再判斷
  const hasH = t => /\\h/.test(t.replace(/\\[^h]/g, '').replace(/\[[^\]]*\]/g, ''));   // 新增：偵測 \h（一個漢字的短代號，等同 w）；先去掉 \\ 等其他跳脫與 [...] 字元集

  // 新增：音節黏在一起時自動補空格：聲調數字（或 %）後面直接接字母、~ ，視為下一個音節（y0y3 → y0 y3）。\w 跳脫、[...] 字元集、{…} 內不處理
  function splitSyl(t) {
    let out = '', inCls = false, inBr = false, prevEnd = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') { out += c + (t[i + 1] || ''); i++; prevEnd = false; continue; }
      if (inCls) { out += c; if (c === ']') inCls = false; prevEnd = false; continue; }
      if (inBr) { out += c; if (c === '}') inBr = false; prevEnd = false; continue; }
      if (c === '[') { inCls = true; out += c; prevEnd = false; continue; }
      if (c === '{') { inBr = true; out += c; prevEnd = false; continue; }
      if (/[1-9]/.test(c) && t[i + 1] === 'y' && (i === 0 || /[ \-(|#]/.test(t[i - 1]))) { out += c; prevEnd = false; continue; }   // 新增：音節開頭、緊接 y 的數字＝音節編號（1y 2y），不是聲調
      if (c === '0' && t[i + 1] === '+' && !/[0-9]/.test(t[i - 1] || '')) {   // 新增：0+（完整八調）算一個完整的聲調記號，後面緊接字母視為下一音節
        out += '0+'; i++; prevEnd = true; continue;
      }
      if (prevEnd && (/[A-Za-z~]/.test(c) || ((c === '?' || c === '+') && /[aeiou]/.test(t[i + 1] || '')))) out += ' ';   // 修改：?元音（任一聲母）也視為下一個音節的開頭
      out += c; prevEnd = /[0-9%]/.test(c);
    }
    return out;
  }
  // 新增：用了簡易語法、又不含漢字的查詢才補空格（一般的台羅、華語、舊的 {x} 寫法維持原樣）
  const tidySyl = term => (engaged(term) && !HAN_RE.test(noEsc(term))) ? splitSyl(term) : term;

  function findAA(t) {   // 疊字代號：A~D 連續 2 個以上且有重複，如 AA、ABB、AABC
    const re = /(?<![A-Za-z])[A-D]{2,}(?![A-Za-z])/g; let m;
    while ((m = re.exec(t))) if (new Set(m[0]).size < m[0].length) return true;
    return false;
  }

  // 是否要用簡易語法處理（否則維持原本的查詢方式）
  function engaged(term) {
    const t = noEsc(term), han = HAN_RE.test(t);
    if (/[w#]/.test(t) || hasH(term) || findAA(t)) return true;
    if (!han && /(?:^|[ \-(|#])[?+][aeiouy]/.test(t)) return true;   // 新增：?a、?a3、?a0、+a（音節開頭的 ?／+ ＋元音）   // 修改：加入 hasH(term)，輸入 \h 也啟用簡易語法
    if (han) return false;
    if (/[yvV~%@]/.test(t) || /(?<=[A-Za-z])0/.test(t) || INIT_ENGAGE.test(t) || CODA_ENGAGE.test(t)) return true;   // 修改：加入聲母群組／或（p;）
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

  // 新增：y 依「前後的符號」決定功能（前：聲母／元音；後：聲調／字母／元音）
  //   前後有元音           → 只剩元音（一個以上）            iyu → iau；pyi → pai、puai
  //     例外：只有前面是元音、y 在結尾（沒被元音封閉）→ 元音＋聲調  pyay → piau2、puai3（pyay2 → 聲調已由 2 負責，只剩元音）
  //   前有聲母（輔音字母） → 聲母功能取消，只剩韻（＋調）    py → pa2；py2 → pa2（不含 pa1、a1）
  //   後有聲調（數字、0、%、@） → 聲調功能取消               y2 → 聲母＋韻＋2
  //   後有其他字母或符號   → 不含聲調（聲調由後面的符號負責）  yng0、y~m0
  //   前後都沒有東西       → 整個音節（聲母＋韻＋調）        y → a1、pa2、mai3、gak8
  // 修改：新增 zero 參數。zero 為 true 時，等同「前面已有聲母」＝取消 y 的聲母能力，只剩韻＋調（-y → 零聲母音節）
  function yPat(term, i, zero) {
    const p = term[i - 1], q = term[i + 1];
    const atEnd = q === undefined || /[ \-)|#$?*+{]/.test(q);          // 後面沒有東西：y 含聲調（修改：提前宣告，供下面判斷）
    const vBefore = !!p && /[aeiouv]/.test(p), vAfter = !!q && /[aeiouv]/.test(q);
    if (vBefore || vAfter) {
      // 新增：前後都是元音（被元音封閉）→ 只剩元音；只有前面是元音、後面已經沒有東西（結尾）→ 沒被封閉，仍有聲調功能：元音＋聲調（pyay → piau2、puai3）
      if (vBefore && !vAfter && atEnd) return '(?:[aeiou]+' + TONE + ')';
      return '(?:[aeiou]+)';   // 其餘：前或後有元音，只剩元音
    }
    const hasInit = !!zero || (!!p && /[A-Za-z;]/.test(p));            // 前面緊接字母＝已有聲母，y 不再含聲母；修改：加上 zero
    const toneAfter = !!q && /[0-9%@]/.test(q);                      // 後面緊接聲調：y 不再含聲調
    if (hasInit) return atEnd ? '(?:' + FINAL + TONE + ')' : toneAfter ? '(?:' + FINAL + ')' : '(?:[aeiou]+)';
    if (!atEnd && q === 'n' && !/[ng]/.test(term[i + 2] || '')) return '(?:[A-Za-z]*[A-Za-mo-z])';   // 新增：yn0 只取 n 結尾，不含 nn（前面的字母部分不能再以 n 結尾）
    return atEnd ? '(?:[A-Za-z]+' + TONE + ')' : '(?:[A-Za-z]+)';
  }

  // 新增：y- ＝ 一個元音的音節（oo 算一個元音）、y+ ＝ 一個或多個元音的音節，兩者都不含韻尾。py- → pa1、pe5、poo7；py+ → pa1、pai5、poo7，不含 pan5
  //   前有聲母（或 zero）時聲母固定；沒有聲母時，聲母為任意輔音（或無聲母）。後面直接接聲調（數字、0、%）時由它負責聲調，沒寫就是任意聲調
  //   「-」「+」後面接字母、~ 時，仍是音節分隔符號／重複符號，不當作元音符號（y-y 還是兩個音節）
  function yVowel(term, i, zero) {
    const m = /^y([-+])(?=$|[ )|#$0-9%])/.exec(term.slice(i)); if (!m) return null;
    const p = term[i - 1], q = term[i + 2];
    const hasInit = !!zero || (!!p && /[A-Za-z;]/.test(p));
    const V = m[1] === '-' ? '(?:oo|[aeiou])' : '[aeiou]+';
    return { out: (hasInit ? '' : CONS1 + '*') + V + (q && /[0-9%]/.test(q) ? '' : TONE), len: 2 };
  }
  // 新增：yi;u、ya;ah ＝ 結尾為 i 或 u／a 或 ah 的音節；後面可接聲調數字，沒寫就是任意聲調。前面有聲母（或 zero）時，聲母與結尾之間只能是元音
  //   （「; 」前後每一項都是聲母名稱時，如 yk;kh，不當作結尾清單）
  const INIT_ONE = new RegExp('^(?:' + INITS + ')$');
  function yList(term, i, zero) {
    // 新增：ym; ＝ 鼻音結尾（m n ng nn）、yp; ＝ 入聲結尾（p t k h）；ym;ng ＝ 結尾為 m 或 ng（清單每項都是韻尾 m n ng nn p t k h 時，視為韻尾清單；有 kh 等非韻尾項時仍是聲母清單）
    //   單項要寫成 ym;（ym、ym0 照舊）；後面可接聲調數字，沒寫就是任意聲調（最後一項後面不可再接字母）
    const mc = new RegExp('^y(' + CODA_ONE + '(?:;' + CODA_ONE + ')*)(;?)(?![A-Za-z])').exec(term.slice(i));
    if (mc && (mc[2] || mc[1].includes(';'))) {
      const p0 = term[i - 1], q0 = term[i + mc[0].length];
      const hasInit0 = !!zero || (!!p0 && /[A-Za-z;]/.test(p0));
      const atEnd0 = q0 === undefined || /[ \-)|#$?*+{]/.test(q0);
      let body;
      if (!mc[1].includes(';') && mc[1] === 'm') body = CODA_N;        // ym; ＝ 鼻音結尾
      else if (!mc[1].includes(';') && mc[1] === 'p') body = CODA_P;   // yp; ＝ 入聲結尾
      else body = '(?:' + mc[1].split(';').join('|') + ')';
      return { out: (hasInit0 ? '[aeiou]*' : '[A-Za-z]*') + body + (atEnd0 ? TONE : ''), len: mc[0].length };
    }
    const m = /^y([a-z]+(?:;[a-z]+)+)/.exec(term.slice(i)); if (!m) return null;
    const names = m[1].split(';'); if (names.every(x => INIT_ONE.test(x))) return null;
    const p = term[i - 1], q = term[i + m[0].length];
    const hasInit = !!zero || (!!p && /[A-Za-z;]/.test(p));
    const atEnd = q === undefined || /[ \-)|#$?*+{]/.test(q);
    return { out: (hasInit ? '[aeiou]*' : '[A-Za-z]*') + '(?:' + names.join('|') + ')' + (atEnd ? TONE : ''), len: m[0].length };
  }

  let gN = 0;
  function translate(term) {
    const n = term.length, han = HAN_RE.test(noEsc(term)), seps = [];
    let out = '', i = 0, latin = false, hasAt = false;
    const isL = ch => /[A-Za-z]/.test(ch || '');
    const refs = {};   // 新增：音節編號 → 群組名稱（1y 2y 1y 2y）
    while (i < n) {
      const c = term[i], prev = term[i - 1] || '', rest = term.slice(i);
      let m;
      if (c === '\\') {
        const d = term[i + 1];
        if (d === undefined) { out += '\\\\'; i++; continue; }
        if (d === 'h') { out += HAN; i += 2; continue; }   // 新增：\h ＝ 一個漢字，等同 w（不設 latin）
        out += /[wyvV]/.test(d) ? d : c + d; if (/[A-Za-z0-9]/.test(d)) latin = true; i += 2; continue;
      }
      if (c === '[') {
        let j = i + 1; if (term[j] === '^') j++; if (term[j] === ']') j++;
        while (j < n && term[j] !== ']') { if (term[j] === '\\') j++; j++; }
        if (j >= n) { out += '\\['; i++; continue; }
        const seg = term.slice(i, j + 1); out += seg; if (/[A-Za-z0-9]/.test(seg)) latin = true; i = j + 1; continue;
      }
      if (c === '(' && term[i + 1] === '?' && !(!han && /[aeiouy]/.test(term[i + 2] || ''))) {   // 修改：(?a 不是正則群組，是括號＋?a
        let k = i + 2;
        if (term[k] === '<' && term[k + 1] !== '=' && term[k + 1] !== '!') { const e = term.indexOf('>', k); k = e < 0 ? k + 1 : e + 1; }
        else if (term[k] === '<') k += 2; else k += 1;
        out += term.slice(i, k); i = k; continue;
      }
      // 新增：音節開頭（詞首或空格後）的「-」緊接 y ＝ 取消 y 的聲母能力（零聲母音節）。-y -y ＝ 兩個零聲母音節
      if (!han && c === '-' && term[i + 1] === 'y' && (i === 0 || term[i - 1] === ' ')) {
        const yv0 = yVowel(term, i + 1, true);   // 新增：-y- 、-y+
        if (yv0) { out += yv0.out; latin = true; i += 1 + yv0.len; continue; }
        const yl = yList(term, i + 1, true);
        if (yl) { out += yl.out; latin = true; i += 1 + yl.len; continue; }
        out += yPat(term, i + 1, true); latin = true; i += 2; continue;
      }
      // 新增：音節開頭的 ?＋元音 ＝ 任一聲母（含零聲母）：?a、?a3、?a0；?y 仍同 y（? 略過）
      //       音節開頭的 +＋元音 ＝ 一定要有聲母（不含零聲母）：+ai3 符合 pai3、不符合 ai3；+y ＝ 有聲母的任一音節
      if (!han && (c === '?' || c === '+') && (i === 0 || /[ \-(|#]/.test(prev)) && /[aeiouy]/.test(term[i + 1] || '')) {
        if (term[i + 1] === 'y') {
          if (c === '?') { latin = true; i++; continue; }
          out += REQ_INIT;   // +y：先要有聲母，後面的 y 照「前面已有聲母」處理（只剩韻＋調）
          const yv1 = yVowel(term, i + 1, true);
          if (yv1) { out += yv1.out; latin = true; i += 1 + yv1.len; continue; }
          const yl1 = yList(term, i + 1, true);
          if (yl1) { out += yl1.out; latin = true; i += 1 + yl1.len; continue; }
          out += yPat(term, i + 1, true); latin = true; i += 2; continue;
        }
        out += c === '?' ? ANY_INIT : REQ_INIT; latin = true; i++;
        // 沒寫聲調（後面直接結束）＝ 只限第 1 調：不可接 2~9（pa、pa1 可，pa2、pa3 不可）
        const mv = /^[aeiou][a-uxz]*/.exec(term.slice(i));
        if (mv) {
          const q = term[i + mv[0].length];
          out += mv[0]; i += mv[0].length;
          if (q === undefined || /[ \-)|#$]/.test(q)) out += '(?![2-9])';
        }
        continue;
      }
      if (c === ' ' || c === '-') {
        let j = i;
        while (term[j] === ' ' || (term[j] === '-' && !(!han && term[j + 1] === 'y' && term[j - 1] === ' '))) j++;   // 修改：遇到音節開頭的 -y 就停，不吞掉這個 -
        seps.push(term.slice(i, j)); out += '\u0001'; i = j; continue;
      }
      if (/[A-D]/.test(c) && !isL(prev) && (m = /^[A-D]{2,}(?![A-Za-z])/.exec(rest)) && new Set(m[0]).size < m[0].length) {
        const names = {}; let s = '';
        for (const L of m[0]) { if (names[L]) s += '\\k<' + names[L] + '>'; else { names[L] = 'g' + (gN++) + L; s += '(?<' + names[L] + '>' + HAN + ')'; } }
        out += s; i += m[0].length; continue;
      }
      if (c === 'w') { out += HAN; i++; continue; }
      if (c === '.') { out += ANY; i++; continue; }
      if (!han) {
        if (c === '~') {
          if (term[i + 1] === '<') { out += INITIAL; latin = true; i += 2; continue; }
          if (term[i + 1] === '>') { out += FINAL + TONE; latin = true; i += 2; continue; }
          if ((term[i + 1] === 'm' || term[i + 1] === 'p') && !isL(term[i + 2])) { out += term[i + 1] === 'm' ? CODA_N : CODA_P; latin = true; i += 2; continue; }
          if ((m = /^~([a-z]+)/.exec(rest))) { out += CONS1 + '*' + m[1] + TONE; latin = true; i += m[0].length; continue; }   // 舊寫法 ~ang
          out += SYL; latin = true; i++; continue;
        }
        if (!isL(prev) && (m = CODA_LIST.exec(rest))) {   // 新增：am;ng0 ＝ a＋(m|ng)＋任意聲調
          const q1 = term[i + m[0].length], atEnd1 = q1 === undefined || /[ \-)|#$?*+{]/.test(q1);
          out += m[1] + '(?:' + m[2].split(';').join('|') + ')' + (atEnd1 ? TONE : ''); latin = true; i += m[0].length; continue;
        }
        if (!isL(prev) && (m = INIT_RE.exec(rest))) {   // 新增：聲母群組（p;）與聲母或（p;kh、g;tsh;ng）
          const names = m[0].split(';');
          if (names.length > 1) { out += '(?:' + names.join('|') + ')'; latin = true; i += m[0].length; continue; }
          if (rest[m[0].length] === ';') { out += INIT_GROUP[names[0]] || names[0]; latin = true; i += m[0].length + 1; continue; }
        }
        // 新增：數字＋y（在音節開頭）＝指稱音節。相同數字的音節完全相同，不同數字的音節不同：1y 2y 1y 2y ＝ ABAB；1y 2y 2y ＝ 第 2、3 相同且與第 1 不同
        if (/[1-9]/.test(c) && term[i + 1] === 'y' && (i === 0 || /[ \-(|#]/.test(prev))) {
          const d = c;
          if (refs[d]) { out += '\\k<' + refs[d] + '>'; }
          else {
            const nm = 'sy' + (gN++) + 'n' + d;
            Object.values(refs).forEach(o => { out += '(?!\\k<' + o + '>(?![A-Za-z0-9]))'; });   // 與先前其他編號的音節不同
            refs[d] = nm;
            out += '(?<' + nm + '>' + yPat(term, i + 1) + ')';
          }
          latin = true; i += 2; continue;
        }
        if (c === 'y') {
          const yv = yVowel(term, i, false);   // 新增：y-、y+
          if (yv) { out += yv.out; latin = true; i += yv.len; continue; }
          const yl = yList(term, i, false);   // 新增：yi;u、ya;ah
          if (yl) { out += yl.out; latin = true; i += yl.len; continue; }
          out += yPat(term, i); latin = true; i++; continue;
        }   // 修改：改依位置決定功能（見 yPat）
        if (c === 'v') { out += '[aeiou]'; latin = true; i++; continue; }
        if (c === 'V') { out += CONS1; latin = true; i++; continue; }
        if (c === '%') { out += '(?:p|t|k|h)?' + TONE; latin = true; i++; continue; }
        if (c === '@') { out += TONE + '(?=$|/)'; hasAt = true; latin = true; i++; continue; }
        // 新增：0+ ＝ 完整八調（1 2 3 4 5 7 8，不含 6、9）。pa0+ → pa1、pa2、pa3、pak4、pa5、pa7、pak8
        //   第 4、8 調是入聲：開音節補上 p t k h（pa → pap／pat／pak／pah）；已是入聲韻尾（pak0+、pah0+）只取第 4、8 調；
        //   鼻音韻尾（m n ng）沒有入聲調，只取 1 2 3 5 7；nn 結尾的入聲只接 h（pannh4）
        if (c === '0' && term[i + 1] === '+' && !/[0-9]/.test(prev)) {
          const stem = (/[A-Za-z]*$/.exec(term.slice(0, i)) || [''])[0].toLowerCase();
          let t8;
          if (/[aeiou][ptkh]$/.test(stem)) t8 = '[48]';
          else if (/nn$/.test(stem)) t8 = '(?:[12357]|h[48])';
          else if (/(?:ng|m|n)$/.test(stem)) t8 = '[12357]';
          else t8 = '(?:[12357]|[ptkh][48])';
          out += t8; latin = true; i += 2; continue;
        }
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
    if (!oneSide && !engaged(term)) return null;   // 只開頭／只結尾：一律走簡易引擎（不加音節邊界）
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
  const A_ST = '(?:^|(?<=/))(?:【[^】]*】)?', A_EN = '(?:【[^】]*】)?(?:$|(?=/))';
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
    return [(/s/.test(code) ? '(?:^|(?<=/))(?:【[^】]*】)?' : '') + '(?:', ')' + (/e/.test(code) ? '(?:【[^】]*】)?(?:$|(?=/))' : '')];
  }
  // 新增：只要求開頭或只要求結尾（多個讀音以「/」分開者逐一比對）
  function anchorWrap(body, start, end) {
    return (start ? '(?:^|(?<=/))(?:【[^】]*】)?' : '') + '(?:' + body + ')' + (end ? '(?:【[^】]*】)?(?:$|(?=/))' : '');
  }
  function exactWrap(body) { return '(?:^|(?<=/))(?:【[^】]*】)?(?:' + body + ')(?:【[^】]*】)?(?:$|(?=/))'; }

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
  _autoEx = false;   // 新增：進出正則模式、清空、程式代入新查詢詞時，一律結束自動精確
  if (!_rawRx) { _rawSrc = ''; _rawHl = null; }
  updateRxUI();
  if (_syncAnchorBoxes) _syncAnchorBoxes();
}
// 已移除「轉為正則」按鈕（一般使用者看不懂）。這裡只保留：刷新 ^開頭／結尾$ 勾選。
// 舊的查詢紀錄若帶有正則模式（_rawRx），仍照原樣還原查詢，只是不再提供從簡易語法轉換的入口。
function updateRxUI() {
  const wrap = searchInput.parentElement;
  if (wrap) wrap.classList.remove('has-rx');
  if (_syncAnchorBoxes) _syncAnchorBoxes();   // 三個勾選一律依框內的 ^、$ 顯示
}

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
  const auto = _autoEx && !a.s && !a.e;   // 新增：自動精確＝框內沒有自己打 ^ $ 時，當作 ^…$（有打就以框內為準）
  const start = a.s || auto, end = a.e || auto, term = (a.s || a.e) ? a.body : searchTerm;   // 修改：加入 auto
  const r = SIMPLE.toRegex(term, start, end);
  if (r) { _simpleHl = r.hl; return r.src; }
  const src = searchTermReplaceCore(term);
  return start && end ? SIMPLE.exactWrap(src) : (start || end) ? SIMPLE.anchorWrap(src, start, end) : src;
}

function searchTermReplaceCore(searchTerm){

	// 刪除：舊的 {AA}、{x}、{hanzi}、{y}、{v}、{c0}、{t}、{{ang}}、~ang 等大括號寫法，全部移除
	// 如果不是漢字，則處理拼音或正則符號
	if (!/[\u3007\u3400-\u4DB5\u4E00-\u9FCB\uE815-\uE864\uD840-\uD87F][\uDC00-\uDFFF]?/.test(searchTerm)) {
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
const EXACT_FIELDS = new Set(['分類', RADICAL_TAB]);   // 修改：「部首」也須完全符合
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
    // 首頁一律以「詞目」查詢：不再還原上次選的搜尋類型
    currentSearchType = defaultType();

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
        if (type === RADICAL_TAB && currentSearchType !== RADICAL_TAB) button.classList.add('tab-hidden');   // 新增：「部首」預設不顯示
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
        const firstValidType = searchTypes.find(t => t !== currentSearchType && t !== RADICAL_TAB && typeCounts[t] > 0);   // 修改：排除隱藏的「部首」分頁
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
        if (t === HIDDEN_TAB || t === RADICAL_TAB) button.classList.toggle('tab-hidden', !on);   // 修改：「部首」同樣只在目前正在看時顯示
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
    let html = `<table class="results-table ex-table"><thead><tr><th aria-label="序號"></th><th><button type="button" class="sort-toggle" title="切換排序：詞目＞音讀／音讀＞詞目">${colLabel('台語')}${colLabel('台羅')}<span class="rom-mode">${SORT_LABEL[window.sortMode || 'han']}</span></button></th><th><button type="button" class="ex-head-toggle" title="切換例句顯示方式：RUBY／標準／分詞">例句<span class="rom-mode">${EX_LABEL[window.exMode] || 'RUBY'}</span></button></th></tr></thead><tbody>`;   // 修改：「詞目」「音讀」兩欄合併成「詞目音讀」；新增：表頭可切換排序（詞>音 ⇄ 音>詞）、「例句」表頭可切換顯示方式（RUBY／標準／分詞），例句、華例都適用
    rows.forEach(({ item, i, line }, n) => {
        const m = line.match(/^\[(\d+)\] ([\s\S]*)$/);
        const hanLen = Array.from(String(item['台語'] || '').replace(/【[^】]*】/g, '').replace(/[\s,，、\/／()（）]/g, '')).length;
        const short = hanLen > 0 && hanLen <= 2;   // 手機版：詞目 2 字以內，音讀接在詞後；否則音讀另一列
        const hasRom = !!String(item['台羅'] || '').trim();
        html += `<tr class="${short && hasRom ? 'ex-short' : ''}${n % 2 ? ' row-b' : ''}">
            <td class="m-row m-no-td">${lab('序', '序號')}<a href="#" class="item-number" data-index="${i}" onclick="showFullData(${i}); return false;">${displayNo(i)}</a></td>
            <td data-lang-type="language" class="ex-word">
                <div class="m-line"><span class="mobile-header copy-han" data-copy="${escHtml(String(item['台語'] || '').replace(/【[^】]*】/g, '').trim())}" title="點「詞」複製詞目">詞</span><div class="m-val"><div class="ex-han">${toneHanHtml(item['台語'], item['台羅'])}${short && hasRom ? `<span class="ex-inl-rom">${romHtml(item['台羅'])}</span>` : ''}</div></div><a href="#" class="item-number m-no" data-index="${i}" onclick="showFullData(${i}); return false;" aria-label="序號">${displayNo(i)}</a></div>
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
            const on = header === currentSearchType && !isSpecialTab(currentSearchType) ? ' class="th-on"' : '';   // 新增：目前查詢的欄位，表頭強調（像分頁籤）
            if (header === '詔安拼音本變') {
                return `<th data-lang-type="${langType}">本音</th><th data-lang-type="${langType}">變音</th>`;
            }
            if (header === '台羅') {
                return `<th data-lang-type="${langType}"${on}><button type="button" class="rom-toggle" title="切換音讀：主副／主／副">${colLabel(header)}<span class="rom-mode">${ROM_LABEL[window.romMode || 'full']}</span></button></th>`;
            }
            if (header === '釋義') {
                return `<th data-lang-type="${langType}"${on}><button type="button" class="def-toggle" title="切換釋義顯示：完整／標準／合併／單行">${colLabel(header)}<span class="rom-mode">${DEF_LABEL[window.defMode || 'brief']}</span></button></th>`;
            }
            if (header === '台語') {   // 新增：「詞目」表頭可切換排序
                return `<th data-lang-type="${langType}"${on}><button type="button" class="sort-toggle" title="切換排序：詞目＞音讀／音讀＞詞目">${colLabel(header)}<span class="rom-mode">${SORT_LABEL[window.sortMode || 'han']}</span></button></th>`;
            }
            return `<th data-lang-type="${langType}"${on}>${colLabel(header)}</th>`;
        }

        // 生成表頭內容
        const displayColumns = getDisplayColumns();   // 修改：改用含「暫時顯示欄位」的清單
        const tableHeaders = displayColumns.map(formatHeader).join('');

        // 組合成完整的 HTML 結構
        html = `
            <table class="results-table">
                <thead>
                    <tr>
                        <th aria-label="序號"${currentSearchType === '台語' && displayColumns.includes('台語') ? ' class="th-on"' : ''}></th>
                        ${tableHeaders}
                    </tr>
                </thead>
                <tbody>
        `;

        // 分層標題（完全符合／不計聲調／縮寫符合／部分符合）：結果已排序，在各層交界插入標題列
        const _term = searchTermReplace(searchInput.value.trim());
        const _T = tierInfo();
        let prevTier = startIndex > 0 && _T.grouped ? _T.tiers[startIndex - 1] : null;
        // 淺深交錯計數：每一組（完全符合／部分符合…）從第一筆重新開始，第一筆一律淺色
        let stripe = 0;
        if (startIndex > 0 && _T.grouped) {   // 換頁時，延續上一頁同組的淺深順序
            for (let k = startIndex - 1; k >= 0 && _T.tiers[k] === prevTier; k--) stripe++;
        }
        // 沒有更高層級時：第一頁最上方補一行摘要「完全符合 0 筆　部分符合 N 筆」
        if (!_T.grouped && startIndex === 0 && _term && filteredData.length > 0 && !EXACT_FIELDS.has(currentSearchType)) {
            html += `<tr class="group-row group-partial group-none"><td colspan="99">完全符合<span class="group-n">0 筆</span><span class="group-sep"></span>部分符合<span class="group-n">${filteredData.length} 筆</span></td></tr>`;
        }
        pageData.forEach((item, localIndex) => {
            const globalIndex = startIndex + localIndex;
            const tier = _T.tiers[globalIndex], isExactMatch = tier === 0;
            if (_T.grouped && tier !== prevTier) {
                html += `<tr class="group-row ${isExactMatch ? 'group-exact' : 'group-partial'}"><td colspan="99">${TIER_LABELS[tier]}<span class="group-n">${_T.counts[tier]} 筆</span></td></tr>`;
                stripe = 0;   // 新增：新的一組，重新從淺色開始
            }
            prevTier = tier;
            const hanLen = Array.from(String(item['台語'] || '').replace(/【[^】]*】/g, '').replace(/[\s,，、\/／()（）]/g, '')).length;   // 詞目字數（不含【替】標記）
            const inlRom = displayColumns.includes('台語') && displayColumns.includes('台羅') && hanLen > 0 && hanLen <= 2;   // 手機版「音讀接在詞後」：要有詞目、音讀兩欄，且詞目 2 字以內才接（3 字以上維持分開一列）
            html += `<tr class="${isExactMatch ? 'exact-match' : ''}${inlRom ? ' has-inl' : ''}${stripe++ % 2 ? ' row-b' : ''}">`;
            html += `
                <td class="m-row${displayColumns.includes('台語') ? ' m-no-td' : ''}">
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
                            <span class="mobile-header${header === '台語' ? ' copy-han' : ''}"${header === '台語' ? ` data-copy="${escHtml(String(item['台語'] || '').replace(/【[^】]*】/g, '').trim())}" title="點「詞」複製詞目"` : ` title="${colLabel(header)}"`}>${mobLabel(header)}</span><div class="m-val">
                            ${header === '台羅' ? romHtml(item[header]) : header === '釋義' ? hlHtml(defListHtml(item[header])) : header === '例句' ? listExamplesHtml(item[header]) : header === '台語' ? toneHanHtml(item[header], item['台羅']) : (item[header] || '')}${header === '台語' && inlRom && String(item['台羅'] || '').trim() ? `<span class="m-inl-rom">${romHtml(item['台羅'])}</span>` : ''}${header === '台語' && variantIdSet.has(item['詞目id']) ? ` <a href="#" class="tag-sub tag-var" title="有各地腔調（點擊查看）" onclick="window._goVariants = true; showFullData(${globalIndex}); return false;">腔</a>` : ''}</div>${header === '台語' ? `<a href="#" class="item-number m-no ${isExactMatch ? 'exact-match' : ''}" data-index="${globalIndex}" onclick="showFullData(${globalIndex}); return false;" aria-label="序號">${displayNo(globalIndex)}</a>` : ''}
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

// 新增：音讀排序時的「聲母索引」——回傳 { list:[{ch, page}], tier:分層名稱或'' }；不適用時 list 為空
// 只取音讀的第一個字母（ts、th→t；kh→k）；無聲母的字（a、i、u、e、o）就是它們自己。
// 修改：搜尋結果若分成「完全符合／部分符合…」多層，每層各自依音讀排序，所以索引只針對「目前這一頁所在的那一層」。
// 自我檢查：該層內每個字母必須是連續的一段，否則不顯示索引，避免跳到錯的地方。
function buildInitialIndex(currentPage) {
    const none = { list: [], tier: '' };
    if (window.sortMode !== 'rom' || !Array.isArray(filteredData) || filteredData.length === 0) return none;
    const T = tierInfo();
    // 目前頁面裡，哪一層的筆數最多，就用那一層
    const p0 = (currentPage - 1) * ITEMS_PER_PAGE, p1 = Math.min(filteredData.length, p0 + ITEMS_PER_PAGE);
    const cnt = [0, 0, 0, 0, 0];
    for (let i = p0; i < p1; i++) cnt[T.tiers[i]]++;
    let t = 4; for (let k = 0; k < 5; k++) if (cnt[k] > cnt[t]) t = k;
    const from = T.start[t], to = from + T.counts[t];
    if (to - from <= ITEMS_PER_PAGE) return none;          // 這一層不到一頁，不需要索引
    const seen = new Set(), list = [];
    let prev = null;
    for (let i = from; i < to; i++) {
        const k = romSortKey(filteredData[i]);
        if (!k) continue;                                  // 沒有音讀的（排在最後）不列入索引
        const ch = /^[a-z]/.test(k) ? k[0] : '#';          // 非英文字母開頭的歸為「#」
        if (ch === prev) continue;
        if (seen.has(ch)) return none;                     // 字母又出現第二段：放棄索引
        seen.add(ch); prev = ch;
        list.push({ ch, page: Math.floor(i / ITEMS_PER_PAGE) + 1, idx: i });   // 修改：多記 idx（該字母第一筆在 filteredData 的位置）
    }
    return list.length >= 2 ? { list, tier: T.grouped ? TIER_LABELS[t] : '' } : none;
}

// 生成>分頁導覽（修改：電腦版與手機版共用同一套精簡分頁，只差頁碼個數：電腦 4 個、手機 3 個）
function generatePagination(totalItems, currentPage, totalPages) {
    return generateMobilePagination(totalItems, currentPage, totalPages);
}

// 生成>精簡分頁（電腦、手機共用）：‹ 1 2 3 (4) …尾 [下一頁 ›] ⋮（首頁、跳頁、每頁筆數收進「⋮」更多選項）
function generateMobilePagination(totalItems, currentPage, totalPages) {
    const box = document.createElement('div');
    box.className = 'pagination pagination-m';

    const mk = (text, title, disabled, onClick, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.title = title;
        b.setAttribute('aria-label', title);
        if (cls) b.className = cls;
        b.disabled = disabled;
        b.addEventListener('click', onClick);
        return b;
    };

    box.appendChild(mk('‹', '上一頁', currentPage === 1, () => changePage(currentPage - 1), 'pm-nav'));

    // 頁碼：目前頁盡量置中；窄手機 2 個、手機 3 個、電腦 5 個（電腦版另外保留首頁 1）
    const wide = window.innerWidth > 768;   // 新增：電腦版（寬螢幕）
    const maxVisible = window.innerWidth <= 400 ? 2 : window.innerWidth <= 768 ? 3 : 5;   // 修改：電腦 4 → 5；窄手機（≤400px）2、手機 3 不變
    const start = wide ? Math.max(1, Math.min(currentPage - 2, totalPages - maxVisible + 1))   // 修改：電腦版目前頁置中（前後各 2 個）
                       : Math.max(1, Math.min(currentPage - 1, totalPages - maxVisible + 1));
    const end = Math.min(totalPages, start + maxVisible - 1);
    // 新增：電腦版保留「1」當首頁；與後面的頁碼之間隔著頁數時，在 1 後面加「…」（1…）
    if (wide && start > 1) box.appendChild(mk('1' + (start > 2 ? '…' : ''), '第一頁', false, () => changePage(1), 'pm-text'));
    for (let i = start; i <= end; i++) {
        const b = mk(String(i), `第${i}頁`, false, () => changePage(i), i === currentPage ? 'active' : '');
        if (i === currentPage) b.setAttribute('aria-current', 'page');
        box.appendChild(b);
    }

    // 修改：「尾」改成直接顯示最末頁的頁碼；最末頁已在上面的頁碼裡（頁數 ≤ 3、或已翻到後段）就不重複顯示
    // 修改：與前面的頁碼之間隔著頁數時，最末頁前面加「…」（…11）表示中間省略；剛好銜接（如 1 2 3 4）就不加
    if (end < totalPages) box.appendChild(mk((end < totalPages - 1 ? '…' : '') + totalPages, `最末頁（第${totalPages}頁）`, false, () => changePage(totalPages), 'pm-text'));
    box.appendChild(mk('下一頁 ›', '下一頁', currentPage === totalPages, () => changePage(currentPage + 1), 'pm-next'));   // 最常點：做成大按鈕

    // 「⋯」更多設定：共幾頁、跳頁、每頁筆數
    const more = document.createElement('div');
    more.className = 'page-more';
    const pop = document.createElement('div');
    pop.className = 'page-more-pop';

    const info = document.createElement('div');
    info.className = 'pm-row pm-info';
    const infoText = document.createElement('span');
    infoText.textContent = `第 ${currentPage} / ${totalPages} 頁（共 ${totalItems} 筆）`;
    const firstBtn = mk('首頁', '回到第一頁', currentPage === 1, () => changePage(1), 'pm-first');
    info.append(infoText);   // 修改：「首頁」按鈕移到下面的跳頁列（跳到第幾頁的左邊）
    pop.appendChild(info);

    // 新增：符合程度（完全符合／部分符合…）有分層時，列出各層與筆數；點選後跳到該層第一筆所在頁並標示
    const TI = tierInfo();
    const tierList = (TI.grouped && totalPages > 1) ? TIER_ORDER.filter(t => TI.counts[t] > 0) : [];
    if (tierList.length >= 2) {
        const tRow = document.createElement('div');
        tRow.className = 'pm-row pm-tier-row';
        const tBox = document.createElement('div');
        tBox.className = 'pm-tier';
        const curT = TI.tiers[Math.min((currentPage - 1) * ITEMS_PER_PAGE, filteredData.length - 1)];   // 目前頁第一筆所在的層，標示「現在在哪一層」
        tierList.forEach(t => {
            const idx = TI.start[t];
            tBox.appendChild(mk(`${TIER_LABELS[t]} ${TI.counts[t]}`, `跳到「${TIER_LABELS[t]}」（共 ${TI.counts[t]} 筆）`, false,
                () => changePage(Math.floor(idx / ITEMS_PER_PAGE) + 1, idx), 'pm-tier-chip' + (t === curT ? ' on' : '')));
        });
        tRow.append(tBox);   // 修改：不放「符合程度」標題文字，只留按鈕
        pop.appendChild(tRow);
    }

    // 新增：聲母索引（只有「音>詞」排序且有 2 頁以上才出現；點選後跳到該字母第一筆所在頁）
    const idxInfo = totalPages > 1 ? buildInitialIndex(currentPage) : { list: [], tier: '' };
    const idxList = idxInfo.list;
    if (idxList.length) {
        const idxRow = document.createElement('div');
        idxRow.className = 'pm-row pm-idx-row';
        const idxLabel = document.createElement('span');
        idxLabel.textContent = idxInfo.tier ? '聲母・' + idxInfo.tier : '聲母';   // 修改：有分層時註明是哪一層的索引
        const idxBox = document.createElement('div');
        idxBox.className = 'pm-idx';
        // 目前頁第一筆的字母，用來標示「現在在哪一段」
        const curIdx = idxList.filter(x => x.page <= currentPage).pop();
        idxList.forEach(x => {
            const c = mk(x.ch, x.ch === '#' ? '其他' : `跳到 ${x.ch}（第${x.page}頁）`, false, () => changePage(x.page, x.idx), 'pm-idx-chip' + (curIdx && curIdx.ch === x.ch ? ' on' : ''));
            idxBox.appendChild(c);
        });
        idxRow.append(idxLabel, idxBox);
        pop.appendChild(idxRow);
    }

    const jumpRow = document.createElement('div');
    jumpRow.className = 'pm-row';
    const jumpInput = document.createElement('input');
    jumpInput.type = 'number';
    jumpInput.inputMode = 'numeric';
    jumpInput.min = 1;
    jumpInput.max = totalPages;
    jumpInput.placeholder = '跳到第幾頁';
    const go = () => {
        let page = parseInt(jumpInput.value);
        if (!page || page < 1) return;
        changePage(Math.min(page, totalPages));
    };
    jumpInput.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const goBtn = mk('前往', '前往指定頁', false, go, 'pm-go');
    jumpRow.append(firstBtn, jumpInput, goBtn);   // 修改：加入「首頁」按鈕，放在輸入框左邊
    pop.appendChild(jumpRow);

    const perRow = document.createElement('div');
    perRow.className = 'pm-row';
    const perLabel = document.createElement('span');
    perLabel.textContent = '每頁顯示';
    const sel = document.createElement('select');
    sel.id = 'itemsPerPageSelect';
    [5, 10, 20, 50, 100].forEach(num => {
        const o = document.createElement('option');
        o.value = num;
        o.textContent = `${num} 筆`;
        if (num === ITEMS_PER_PAGE) o.selected = true;
        sel.appendChild(o);
    });
    sel.addEventListener('change', e => changeItemsPerPage(parseInt(e.target.value)));
    perRow.append(perLabel, sel);
    pop.appendChild(perRow);

    // 修改：齒輪改成「垂直三個點」，避免和右上角選單的「設定」混淆，也不會和最末頁前面的「…5」混淆
    const moreBtn = mk('', '更多選項', false, e => {   // 修改：title／aria-label 由「更多設定」改為「更多選項」
        e.stopPropagation();
        pop.classList.toggle('open');
    }, 'pm-more');
    moreBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">' +
        '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>' +
        '</svg>';
    more.append(moreBtn, pop);
    box.appendChild(more);

    // 點選別處或按 Esc 關閉浮窗（全域只綁一次）
    if (!window._pageMoreBound) {
        window._pageMoreBound = true;
        document.addEventListener('click', e => {
            document.querySelectorAll('.page-more-pop.open').forEach(p => {
                if (!p.parentElement.contains(e.target)) p.classList.remove('open');
            });
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') document.querySelectorAll('.page-more-pop.open').forEach(p => p.classList.remove('open'));
        });
    }

    return box;
}

function changeItemsPerPage(newItemsPerPage) {
  ITEMS_PER_PAGE = newItemsPerPage;
  localStorage.setItem(myLocal + 'itemsPerPage', newItemsPerPage);
  performSearch();
}


function changePage(newPage, targetIdx) {   // 修改：新增 targetIdx（選填）：換頁後直接捲到這一筆並閃一下標示
    // 不需要重新過濾數據，只需要重新排序和顯示
    
    const searchTerm = searchTermReplace(searchInput.value.trim());   // 修改：要先轉成正則字串（與 performSearch 相同），否則「AA」「ABB」等簡易語法會被當成一般文字，分層排序就亂掉
    
    // 重新排序 filteredData
    filteredData.sort((a, b) => compareSearchResults(a, b, searchTerm, currentSearchType));

    // 顯示新頁面的結果
    displayResults(filteredData, newPage);
    syncUrl('replace');

    // 新增：指定了某一筆（聲母索引）→ 捲到那一筆並標示；找不到才用下面原本的「捲到頂端」
    if (targetIdx != null) {
        const a = document.querySelector(`#results .item-number[data-index="${targetIdx}"]`);
        const tr = a && a.closest('tr');
        if (tr) {
            tr.classList.add('idx-hit');
            tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => tr.classList.remove('idx-hit'), 1800);
            return;
        }
    }

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
// 新增：統一判斷「無意義的查詢」——沒有查詢內容，或會比對到全部資料的寫法（^$、^、$、.、.+、.*、w*、y*、[^w]、\S…）。
// 回傳要提示的文字；空字串表示可以查詢。
// 作法：不逐一列舉寫法，而是拿幾個不同的字串去試——整組都比對得上，就代表這個寫法沒有篩選效果。
// 正則模式（_rawRx）維持標準正則的意思，所以 ^$（找空白欄位）仍可使用；不過 .*、w* 這類照樣擋。
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

    // 修改：無意義的查詢（^$、.、.+、w*、y*…）統一由 isMeaninglessQuery() 判斷；擋下時搖晃搜尋框，並在搜尋框下方說明原因
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


searchButton.addEventListener('click', () => { clearTimeout(_sgT); hideSearchHistory(); submitSearch(); });   // 查詢後提示框關閉   // 修改：改走 submitSearch（搜尋框沒字時隨機查一個詞）

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
  const r = _rawRx ? _rawCode : '', ax = _autoEx ? 1 : 0;   // 修改：多記 ax（自動精確）
  saveSearchHistory([{ q, r, ax }].concat(loadSearchHistory().filter(x => !(x.q === q && (x.r || '') === r && (x.ax || 0) === ax))));
}
function setHistOpen(on) { const w = document.querySelector('.search-wrapper'); if (w) w.classList.toggle('sg-open', !!on); }   // 面板開著時，搜尋框與面板合成一個整體（見 styles.css 的 .sg-open）
function hideSearchHistory() { if (_histEl) _histEl.style.display = 'none'; setHistOpen(false); }
function ensureHistEl() {   // 查詢紀錄與輸入提示共用同一個浮動面板
  if (_histEl) return _histEl;
  _histEl = document.createElement('div'); _histEl.className = 'search-history';
  _histEl.addEventListener('mousedown', e => e.preventDefault());   // 點面板時，不讓搜尋框失去焦點
  _histEl.addEventListener('click', e => {
    const fill = e.target.closest('.sg-fill');
    if (fill) { searchInput.value = fill.dataset.q; searchClear.style.display = 'block'; searchInput.focus(); renderSuggest(); return; }   // 只填入搜尋框，不查詢
    const sg = e.target.closest('.sg-item');
    if (sg && sg.classList.contains('sg-q')) { hideSearchHistory(); submitSearch(); return; }   // 照輸入的字查詢
    if (sg) {   // 輸入提示：以該詞目查詢（一律用「詞目」類型）
      hideSearchHistory();
      searchInput.value = sg.dataset.q; searchClear.style.display = 'block';
      setRawRx(false);
      currentSearchType = defaultType(); updateActiveSearchType();
      performSearch();
      return;
    }
    const del = e.target.closest('.hist-del'), all = e.target.closest('.hist-clear'), it = e.target.closest('.hist-item');
    if (all) { saveSearchHistory([]); hideSearchHistory(); return; }
    if (del) { const a = loadSearchHistory(); a.splice(+del.dataset.i, 1); saveSearchHistory(a); renderSearchHistory(); return; }
    if (it) {
      const h = loadSearchHistory()[+it.dataset.i]; if (!h) return;
      hideSearchHistory();
      searchInput.value = h.q; searchClear.style.display = 'block';
      setRawRx(!!h.r, h.r);   // 正則模式的查詢，連同模式一起還原
      _autoEx = !h.r && !!h.ax;   // 新增：連同自動精確一起還原
      performSearch();
    }
  });
  document.querySelector('.search-wrapper').appendChild(_histEl);
  return _histEl;
}
function renderSearchHistory() {
  const list = loadSearchHistory();
  if (searchInput.value.trim() || !list.length) { hideSearchHistory(); return; }
  const kb = document.getElementById('virtualKeyboard');
  if (kb && kb.style.display === 'block') { hideSearchHistory(); return; }   // 鍵盤面板開著就不顯示
  ensureHistEl(); _histMode = 'hist';
  _histEl.innerHTML = '<div class="hist-head"><span>最近查詢</span><button type="button" class="hist-clear">清除全部</button></div>' +
    list.map((h, i) => '<div class="hist-item" data-i="' + i + '" role="button" tabindex="-1"><span class="hist-q">' + escHtml(h.q) + '</span>' +
      (h.r ? '<span class="hist-tag">正則</span>' : h.ax ? '<span class="hist-tag">精確</span>' : '') +   // 修改：自動精確的紀錄標「精確」
       '<button type="button" class="hist-del" data-i="' + i + '" title="刪除這筆" aria-label="刪除這筆">×</button></div>').join('');
  _histEl.style.display = 'block'; setHistOpen(true);
  fitFloatingPanel(_histEl, 320);
}

// ======== 輸入提示：打字時，依輸入的字列出詞目（漢字或台羅前綴），詞頻高的排前面 ========
// 候選詞直接用已載入的詞目比對（約 1.7 萬筆，一次比對只要幾毫秒）；排序用的詞頻在 suggest.js（很小，第一次打字才載入，沒載入完就先用字數排）
var _histMode = 'hist', _sgSel = 0, _sgBase = '', _sgIdx = null, _sgFreq = null, _sgLoading = false, _sgT = 0;
function sgCompact(s) { return String(s || '').toLowerCase().replace(/[\s\-'’·‧.]/g, ''); }
function sgBuildIndex() {
  if (_sgIdx) return _sgIdx;
  _sgIdx = [];
  const seen = new Set();
  dictionary.forEach((it, n) => {
    const han = String(it['台語'] || '').replace(/【[^】]*】/g, '').trim();
    if (!han || han.length > 8 || /[，。？！、；：（）()「」『』]/.test(han)) return;   // 諺語、長條目不列入提示
    const romRaw = String(it['台羅無調'] || '');
    const romKeys = romRaw.replace(/[0-9]/g, '').split('/').map(sgCompact).filter(Boolean);
    const numKeys = romRaw.split('/').map(sgCompact).filter(Boolean);   // 新增：保留數字調（ban2、tsit8），輸入含數字時用
    _sgIdx.push({ han, rom: String(it['台羅'] || '').split('/')[0].trim(), keys: romKeys, numKeys, id: String(it['詞目id'] || ''), n });
  });
  return _sgIdx;
}
function sgLoadFreq() {
  if (_sgFreq || _sgLoading) return;
  _sgLoading = true;
  loadScript('suggest.js', () => typeof mySuggestFreq !== 'undefined')   // 修改：改用共用的 loadScript
    .then(() => { _sgFreq = mySuggestFreq; if (searchInput.value.trim()) renderSuggest(); })
    .catch(() => { _sgFreq = {}; });   // 沒有 suggest.js：不排詞頻
}
function sgFind(q) {
  const idx = sgBuildIndex(), freq = _sgFreq || {};
  const isHan = /[㐀-鿿\u{20000}-\u{3ffff}]/u.test(q), qc = sgCompact(q);
  const hasNum = /[0-9]/.test(q);
  if (!qc) return [];
  const hits = [];
  for (const e of idx) {
    let tier = -1;
    if (isHan) { const p = e.han.indexOf(q); if (p === 0) tier = 0; else if (p > 0) tier = 1; }
    else if ((hasNum ? e.numKeys : e.keys).some(k => k.startsWith(qc))) tier = 0;   // 輸入含數字調（ban2）→ 比對帶數字調的音讀
    if (tier >= 0) hits.push({ e, tier, f: freq[e.id] || 0 });
  }
  hits.sort((a, b) => a.tier - b.tier || b.f - a.f || a.e.han.length - b.e.han.length || a.e.n - b.e.n);
  const out = [], seenHan = new Set();
  for (const h of hits) { if (seenHan.has(h.e.han)) continue; seenHan.add(h.e.han); out.push(h); if (out.length >= 8) break; }
  return out;
}
function renderSuggest() {
  const q = searchInput.value.trim();
  if (!q) { renderSearchHistory(); return; }
  const kb = document.getElementById('virtualKeyboard');
  if ((kb && kb.style.display === 'block') || _rawRx) { hideSearchHistory(); return; }   // 虛擬鍵盤開著、或正則模式：不提示
  sgLoadFreq();
  const hits = sgFind(q);
  // 修改：沒有符合的提示時也照樣顯示第一列「輸入的字 - 查詢」（原本是整個面板收起來，放大鏡就一直露在外面）；有這一列時，styles.css 會自動隱藏放大鏡
  ensureHistEl(); _histMode = 'sg'; _sgSel = 0; _sgBase = q;
  const qRow = '<div class="hist-item sg-item sg-q sg-sel" data-q="' + escHtml(q) + '" role="button" tabindex="-1"><span class="hist-q">' + escHtml(q) + '<span class="sg-rom sg-qlab"> - 查詢</span></span></div>';   // 第一列＝照輸入的字查詢（Enter 預設就是它）
  _histEl.innerHTML = qRow + hits.map(({ e }) => {
    const typed = e.han.startsWith(q) ? q : '', rest = typed ? e.han.slice(q.length) : e.han;
    return '<div class="hist-item sg-item" data-q="' + escHtml(e.han) + '" role="button" tabindex="-1"><span class="hist-q">' +
      (typed ? escHtml(typed) : '') + '<b>' + escHtml(rest) + '</b>' + (e.rom ? '<span class="sg-rom">' + escHtml(e.rom) + '</span>' : '') + '</span>' +
      '<button type="button" class="sg-fill" data-q="' + escHtml(e.han) + '" title="填入搜尋框" aria-label="填入搜尋框">↖</button></div>';
  }).join('');
  _histEl.style.display = 'block'; setHistOpen(true);
  fitFloatingPanel(_histEl, 320);
}
function sgMove(dir) {   // 方向鍵：在提示列中移動，並把選到的詞填進搜尋框（回到第一列就還原成原本輸入的字）
  if (!_histEl || _histEl.style.display === 'none' || _histMode !== 'sg') return false;
  const rows = _histEl.querySelectorAll('.sg-item'); if (!rows.length) return false;
  _sgSel = (_sgSel + dir + rows.length) % rows.length;
  rows.forEach((r, i) => r.classList.toggle('sg-sel', i === _sgSel));
  rows[_sgSel].scrollIntoView({ block: 'nearest' });
  searchInput.value = _sgSel === 0 ? _sgBase : rows[_sgSel].dataset.q;
  searchClear.style.display = 'block';
  return true;
}
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) renderSuggest(); else renderSearchHistory(); });
searchInput.addEventListener('click', () => { if (searchInput.value.trim()) renderSuggest(); else renderSearchHistory(); });
searchInput.addEventListener('input', () => {
  if (!searchInput.value.trim()) { clearTimeout(_sgT); renderSearchHistory(); return; }
  clearTimeout(_sgT); _sgT = setTimeout(renderSuggest, 60);   // 停 60 毫秒再比對，連續打字不會每個字都算
});
searchInput.addEventListener('blur', () => setTimeout(hideSearchHistory, 120));
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideSearchHistory();
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (sgMove(e.key === 'ArrowDown' ? 1 : -1)) e.preventDefault(); }
});

// 監聽回車鍵
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(_sgT); hideSearchHistory();   // 查詢後提示框關閉
        submitSearch();   // 修改：performSearch → submitSearch
    }
});





// 新增：正則模式中，若整個框內文字被選取後直接打字、貼上或刪除（＝整個重打），視同清空，離開正則模式，新打的文字重新用簡易語法解讀
searchInput.addEventListener('beforeinput', () => {
    if ((_rawRx || _autoEx) && searchInput.value && searchInput.selectionStart === 0 && searchInput.selectionEnd === searchInput.value.length) setRawRx(false);   // 修改：自動精確時整個重打，也一併結束
});
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    searchClear.style.display = searchTerm ? 'block' : 'none';
    if (_autoEx) { const x = SIMPLE.splitAnchors(searchTerm.replace(/\s+/g, ' ').trim()); if (x.s || x.e) _autoEx = false; }   // 新增：使用者自己打了 ^ 或 $ → 結束自動精確，改以框內文字為準
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
    searchInput.focus();          // 新增：按 X 後游標留在搜尋框（手機維持鍵盤開著，可直接重打）
    renderSearchHistory();        // 新增：重新整理下方面板——框內已空，所以換成「最近查詢」（沒有紀錄就收起舊的輸入提示）
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
        currentSearchType = defaultType(); updateSearchTypeSelector();   // 回到首頁：搜尋類型重設為「詞目」
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

    // 啟用拖放排序（修改：Sortable 改成這裡才載入，不再於 index.html 的 <head> 阻擋畫面；載入失敗只是不能拖曳，上下移動鈕仍可用）
    loadScript(SORTABLE_URL, () => typeof Sortable !== 'undefined').then(() => {
        if (!columnList.isConnected) return;   // 載入期間清單已被重建：這個舊清單不必再處理
        if (Sortable.get(columnList)) return;   // 新增：重設欄位會再次執行本函式，已建立過就不重複建立（原本會疊出多個實例）
        new Sortable(columnList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: '.move-buttons, input',   // 整條都能拖曳；勾選框與上下移動鈕除外
            preventOnFilter: false,
            delay: 150, delayOnTouchOnly: true,   // 觸控：長按一下才開始拖曳，不影響捲動
            onEnd: () => {
                updateSelectedColumns();
            }
        });
    }).catch(() => {});
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
  // 修改：每個「不同的分類字串」只判斷一次（結果記在 memo），三萬筆查詢時多數筆數直接用記下的結果
  const memo = new Map();
  const wrap = f => v => { let r = memo.get(v); if (r === undefined) memo.set(v, r = f(catTokenSet(v))); return r; };
  const t = CAT_SUB_MAP.get(term);
  if (t) return wrap(set => t.every(x => set.has(x)));
  const m = CAT_MAJOR_MAP.get(term);
  if (m) return wrap(set => m.some(ts => ts.every(x => set.has(x))));
  return null;
}

const catTrigger = document.getElementById('catTrigger');
let _catStats = null;

// 各小類、大類的詞條數（第一次開啟時才計算，之後重複使用）
function getCategoryStats() {
  if (_catStats) return _catStats;
  const cnt = new Map();
  CAT_TREE.forEach(m => { cnt.set(m.name, 0); m.subs.forEach(s => cnt.set(s, 0)); });
  // 修改：先數「不同的分類字串」各出現幾次（三萬筆只有約 1,900 種），再逐種比對、乘上次數；結果相同，約快 7 倍（原本三萬筆 × 全部小類逐筆比對）
  const byStr = new Map();
  dictionary.forEach(it => { const v = it['分類'] || ''; if (v) byStr.set(v, (byStr.get(v) || 0) + 1); });
  byStr.forEach((n, v) => {
    const set = catTokenSet(v); if (!set.size) return;
    CAT_TREE.forEach(m => {
      let hit = false;
      m.subs.forEach(s => { if (CAT_SUB_MAP.get(s).every(x => set.has(x))) { cnt.set(s, cnt.get(s) + n); hit = true; } });
      if (hit) cnt.set(m.name, cnt.get(m.name) + n);
    });
  });
  return (_catStats = cnt);
}
// 新增：記住上次瀏覽視窗的位置（分類／部首／拼音、選中的部首或音節、捲動位置），關閉時存、從首頁再開時還原
const BROWSE_LAST_KEY = myLocal + 'browseLast';
function saveBrowseLast() {
  try {
    localStorage.setItem(BROWSE_LAST_KEY, JSON.stringify({
      m: _browseMode,                                   // 哪一種瀏覽：cat／rad／py
      q: _browseMode === 'rad' ? _radSel : '',          // 部首：選中的部首（檢視文字）
      p: _browseMode === 'py' ? _pySel : '',            // 拼音：選中的音節
      c: _browseMode === 'py' ? _pyCur : '',            // 拼音：「只看所選」目前那一組
      t: Math.round(catFullBody.scrollTop), l: Math.round(catFullBody.scrollLeft)   // 捲動位置
    }));
  } catch (err) {}
}
function restoreBrowseScroll(mode, key) {   // 新增：上一頁／下一頁回到瀏覽視窗時，把捲動位置還原成上次關閉時的位置（key＝部首 bq／音節 bp，要和記下的一致才還原）
  let sv = null; try { sv = JSON.parse(localStorage.getItem(BROWSE_LAST_KEY) || 'null'); } catch (err) {}
  if (!sv || sv.m !== mode) return;
  if (mode === 'rad' && (sv.q || '') !== key) return;
  if (mode === 'py' && (sv.p || '') !== key) return;
  requestAnimationFrame(() => {   // 等版面排好再捲
    _catIgnoreScroll = Date.now() + 500;   // 新增：程式還原位置，不要觸發「捲動就收合」
    catFullBody.scrollTo({ top: sv.t || 0, left: sv.l || 0, behavior: 'auto' });
    if (mode !== 'cat') updateRadicalSpy();
  });
}
function openBrowseRemembered() {   // 從首頁按分類鈕：開到上次關閉時的位置（沒有紀錄就照舊從分類開始）
  let sv = null; try { sv = JSON.parse(localStorage.getItem(BROWSE_LAST_KEY) || 'null'); } catch (err) {}
  if (!sv || !['cat', 'rad', 'py'].includes(sv.m)) { toggleCategoryFull(true); return; }
  toggleCategoryFull(true, sv.m);
  if (_browseMode !== sv.m) return;   // 例如沒有部首資料時會退回分類，就不還原
  if (sv.m === 'rad' && sv.q) { _radSel = sv.q; _radAct = 'text'; syncRadAct(); radMarkSel(); }
  else if (sv.m === 'py' && sv.p && getPinyinIndex().syl.has(sv.p)) { _pySel = sv.p; if (sv.c) _pyCur = sv.c; renderPinyinFull(); }
  requestAnimationFrame(() => {   // 版面（含右側例字面板）排好後再還原捲動位置
    _catIgnoreScroll = Date.now() + 500;   // 新增：程式還原位置，不要觸發「捲動就收合」
    catFullBody.scrollTo({ top: sv.t || 0, left: sv.l || 0, behavior: 'auto' });
    if (sv.m !== 'cat') updateRadicalSpy();
  });
  syncUrl('replace');   // 網址的 b／bq／bp… 跟著更新
}
catTrigger.addEventListener('click', () => openBrowseRemembered());   // 修改：原本 toggleCategoryFull(true)（每次都從分類開始）→ 開到上次的位置

// ---- 全部檢視（大版面）：一次列出所有大類與小類，不必逐層返回 ----
const catFull = document.getElementById('catFull');
const catFullBody = document.getElementById('catFullBody');
const catFullFilter = document.getElementById('catFullFilter');
let _catRailOpen = true; try { _catRailOpen = localStorage.getItem(myLocal + 'catRailOpen') !== '0'; } catch (err) {}   // 修改：改成記在 localStorage——第一次（沒存過）展開；收合後下次進來、返回回來都維持收合
let _catIgnoreScroll = 0, catRailSync = () => {};   // 新增：_catIgnoreScroll＝程式自己捲動（還原位置）時，這個時間點前不當成「使用者開始捲動」；catRailSync＝導覽列內部的重新排版（由下面的導覽列程式填入）
function catRailRemember(open) { _catRailOpen = open; try { localStorage.setItem(myLocal + 'catRailOpen', open ? '1' : '0'); } catch (err) {} }   // 新增：記住大類導覽列展開／收合   // 新增：分類模式的「大類」導覽列預設展開（使用者按收合鈕後，這次開啟期間維持收合）
function renderCategoryFull() {
  const kw = catFullFilter.value.trim(), cnt = getCategoryStats(), E = escHtml;
  const item = s => `<button type="button" class="cat-full-item" data-cat="${E(s)}"><span>${E(s)}</span><small>${cnt.get(s)}</small></button>`;
  const pick = m => !kw ? m.subs : (m.name.includes(kw) ? m.subs : m.subs.filter(s => s.includes(kw)));
  const sec = ([m, subs]) => `<section class="cat-full-sec" data-s="${E(m.name)}"><button type="button" class="cat-full-major" data-cat="${E(m.name)}"><i class="cat-full-no" data-tone="${m.tone || 0}">${CAT_TREE.indexOf(m) + 1}</i><span>${E(m.name)}</span><small>${cnt.get(m.name)}</small></button><div class="cat-full-list${m.extra ? ' is-flow' : ''}">${subs.map(item).join('')}</div></section>`;
  const rows = f => CAT_TREE.filter(f).map(m => [m, pick(m)]).filter(x => x[1].length);
  const main = rows(m => !m.extra), extra = rows(m => m.extra);
  let html = main.length ? `<div class="cat-full-cols">${main.map(sec).join('')}</div>` : '';
  if (extra.length) html += `<details class="cat-full-extra" open><summary>其他分類</summary><div class="cat-full-cols">${extra.map(sec).join('')}</div></details>`;
  catFullBody.innerHTML = html || '<div class="cat-empty">找無符合的分類</div>';
  catFullBody.scrollTop = 0;
  const majors = [...main, ...extra];   // 新增：頂部導覽列＝大類別（含「其他分類」裡的），點了捲到該大類；篩選中不顯示
  catFullRail.hidden = !!kw || !majors.length;
  catFullRail.innerHTML = catFullRail.hidden ? '' : '<span class="rad-unit">大類</span>' + majors.map(([m]) => `<button type="button" data-s="${E(m.name)}" data-tone="${m.tone || 0}">${E(m.name)}</button>`).join('');
  catFullRail.classList.toggle('is-open', !catFullRail.hidden && _catRailOpen);   // 新增：大類預設展開（多排顯示）
}
// 新增：分類模式——捲到指定大類別（「其他分類」被收合時先展開），並閃一下標題
function catScrollTo(name, smooth) {
  const sec = [...catFullBody.querySelectorAll('.cat-full-sec')].find(x => x.dataset.s === name); if (!sec) return;
  const d = sec.closest('details'); if (d) d.open = true;
  catFullBody.scrollTo({ top: sec.getBoundingClientRect().top - catFullBody.getBoundingClientRect().top + catFullBody.scrollTop - 8, behavior: smooth ? 'smooth' : 'auto' });
  sec.classList.remove('is-pulse'); void sec.offsetWidth; sec.classList.add('is-pulse');
}
// 修改：只剩大視窗。開關會同步網址參數 b=cat／rad／py（py 另有 bp=選中的音節），並新增一筆歷史，讓「上一頁」能回到瀏覽畫面
// opt.fromUrl：依網址還原（不動歷史）；opt.keep：因為「選了項目、要去查詢」而離開——不退歷史，讓查詢接在這一筆後面，之後按上一頁就回到瀏覽畫面
function toggleCategoryFull(open, mode, opt) {
  { // 重新整理還原（畫面還藏著、html 帶有 restoring）時，直接用行內樣式關掉開啟動畫，避免顯示瞬間又播一次淡入＋放大而閃一下；之後任何開關都會清掉，恢復正常動畫
    const card = catFull.querySelector('.cat-full-card');
    if (card) card.style.animation = document.documentElement.classList.contains('restoring') ? 'none' : '';
  }
  const was = catFull.classList.contains('open');
  if (was && !open) saveBrowseLast();   // 新增：關閉前先記住目前的位置
  catFull.classList.toggle('open', open);
  if (!open) setFilterExpanded(false);   // 新增：關閉瀏覽視窗時還原查詢框
  document.documentElement.classList.toggle('cat-full-open', open);   // 開啟時鎖住背後頁面的捲動
  catTrigger.setAttribute('aria-expanded', open);
  _browseOpen = open;
  if (open) setBrowseMode(mode || 'cat');   // 原本的 catFullFilter.value = ''; renderCategoryFull(); catFullFilter.focus() 都搬進 setBrowseMode
  if (opt && opt.fromUrl) return;
  if (open && !was) history.pushState({ detail: !!currentDetailId, browse: true }, '', buildUrl());
  else if (!open && was) {
    if (opt && opt.keep) _urlQ = '\u0000';   // 讓接著的查詢一定「新增」歷史（不要取代掉瀏覽那一筆）
    else if (history.state && history.state.browse) history.back();
    else syncUrl('replace');
  }
}
const closeBrowseForPick = () => toggleCategoryFull(false, null, { keep: true });   // 新增：選了分類／部首／字，離開瀏覽畫面去查詢
// 新增：部首／拼音字面板：標題（音節／部首）本身是「查詢」按鈕，旁邊的小圖示按鈕＝在新視窗查詢
function openNewWin(q, type, d) {   // 另開分頁：q＝查詢詞、type＝搜尋欄位（不填＝預設）、d＝詞目id（有就直接進詳細頁）
  const sp = new URLSearchParams(); sp.set('q', q);
  if (type) sp.set('t', typeToCode(type));
  if (d != null) sp.set('d', d);
  window.open(location.pathname + '?' + sp.toString(), '_blank', 'noopener');
}
// 新增：「在新視窗開啟」開關（拼音／部首例字面板共用，記在 localStorage）：開啟後，點標題或例字都改在新視窗開啟
let _nwMode = false; try { _nwMode = localStorage.getItem(myLocal + 'nwMode') === '1'; } catch (err) {}
const NW_BTN = () => `<button type="button" class="py-nw${_nwMode ? ' is-on' : ''}" aria-pressed="${_nwMode}" aria-label="例字改在新視窗開啟" title="${_nwMode ? '已啟用：點標題或例字會在新視窗開啟（點此關閉）' : '未啟用：點此後，點標題或例字會在新視窗開啟'}"><svg class="icon" aria-hidden="true"><use href="#i-tab"/></svg></button>`;
function toggleNwMode() {
  _nwMode = !_nwMode;
  try { localStorage.setItem(myLocal + 'nwMode', _nwMode ? '1' : '0'); } catch (err) {}
  document.querySelectorAll('.py-nw').forEach(b => {   // 兩個面板的鈕一起更新，不必重畫面板
    b.classList.toggle('is-on', _nwMode); b.setAttribute('aria-pressed', _nwMode);
    b.title = _nwMode ? '已啟用：點標題或例字會在新視窗開啟（點此關閉）' : '未啟用：點此後，點標題或例字會在新視窗開啟';
  });
}
function openEntryNewWin(id, listOnly) {   // 在新視窗開例字：詞目的台語當查詢詞；listOnly＝只列結果清單，不直接進詳細頁
  const item = dictionary.find(x => String(x['詞目id']) === String(id)); if (!item) return;
  const han = String(item['台語'] || '').trim();
  openNewWin(han.replace(/【[^】]*】/g, '').trim() || han, null, listOnly ? null : item['詞目id']);
}
function pickCategory(c) { closeBrowseForPick(); searchByCategory(c); }
function pickRadical(n, nw) { if (nw) openNewWin(n, RADICAL_TAB); else { closeBrowseForPick(); searchByRadical(n); } }   // nw＝在新視窗開
function pickSyl(n, nw) { if (nw) openNewWin('^' + n + '0$'); else { closeBrowseForPick(); searchByPinyinSyl(n); } }
document.getElementById('catFullClose').addEventListener('click', () => toggleCategoryFull(false));
// 修改：不再「點背景關閉」——瀏覽畫面有獨立的網址參數（b=cat／rad／py），點到外面不該離開；仍可用右上角 ✕、Esc 或瀏覽器上一頁關閉
catFullFilter.addEventListener('input', renderBrowse);   // 修改：renderCategoryFull → renderBrowse（依目前模式渲染）
// 新增：手機版查詢框最大化。聚焦時隱藏分頁與右側 ✕、框內出現 ✕；打字時 input 事件（上一行）會即時顯示符合的選單
const _isMobileBrowse = () => window.matchMedia('(max-width: 768px)').matches;
function setFilterExpanded(on) { catFull.querySelector('.cat-full-head').classList.toggle('is-searching', !!on); }   // 每次現找，避免初始化順序問題
catFullFilter.addEventListener('focus', () => { if (_isMobileBrowse()) setFilterExpanded(true); });
catFullFilter.addEventListener('blur', () => { if (!catFullFilter.value.trim()) setFilterExpanded(false); });   // 沒打字就點別處 → 自動還原；有打字則維持最大化，由框內 ✕ 關閉
document.getElementById('catFullFclear').addEventListener('click', () => {   // 框內 ✕：清空文字、收起查詢框、還原完整選單
  catFullFilter.value = ''; catFullFilter.blur(); setFilterExpanded(false); renderBrowse();
});
catFullFilter.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (_browseMode === 'rad') {   // 新增：部首模式，Enter＝進入第一個部首
    const t = catFullBody.querySelector('.rad-tile:not(:disabled)');
    if (t && _radAct === 'text') { const h = catFullBody.querySelector('.rad-tile.is-hit:not(:disabled)') || t; radSelect(h.dataset.rad, h); return; }   // 新增：檢視文字＝選取第一個（或命中的）部首
    if (t) pickRadical(t.dataset.rad);
    return;
  }
  if (_browseMode === 'py') {   // 新增：拼音模式，Enter＝開啟輸入的字的詞條；沒輸入字就選第一個音節
    const hz = catFullBody.querySelector('.py-han.is-hit');
    if (hz) openEntryById(hz.dataset.id);
    else { const sb = catFullBody.querySelector('.py-syl, .py-cell'); if (sb) sb.click(); }
    return;
  }
  const first = catFullBody.querySelector('.cat-full-item') || catFullBody.querySelector('.cat-full-major');
  if (first) pickCategory(first.dataset.cat);
});
catFullBody.addEventListener('click', e => {
  const rt = e.target.closest('.rad-tile[data-rad]');   // 新增：點部首 → 關閉大版面，以該部首查詢
  if (rt) {
    if (_radAct === 'text') { radSelect(rt.dataset.rad === _radSel ? '' : rt.dataset.rad, rt); return; }   // 新增：檢視文字＝留在這裡，下方列出該部首的字
    pickRadical(rt.dataset.rad); return;
  }
  const b = e.target.closest('[data-cat]'); if (!b) return;
  pickCategory(b.dataset.cat);
});
// ======== 新增：「部首」瀏覽模式（與「分類」共用同一個大版面，標題列用「分類｜部首」切換）========
// 版面：上方筆畫導覽列（1 2 3 … 畫，點了跳到該筆畫；捲動時自動標示目前位置）；
//       內容依部首筆畫分段，左邊是筆畫（捲動時黏在左側），右邊是部首方格（右下角小字＝辭典裡該部首的單字數）。
// 篩選框：輸入「字」→ 標示該字所屬部首；輸入「部首」→ 標示該部首；輸入數字（如 5 或 5畫）→ 只看該筆畫。
// 點部首 → 關閉大版面，切到「部首」分頁列出該部首的字（沿用 searchByRadical）。
const catFullRail = document.getElementById('radRail');
const HAS_RADICAL = typeof myRadicalData !== 'undefined' && typeof myRadicalGroupByStrokes === 'function';
let _browseMode = 'cat', _radStats = null;
if (!HAS_RADICAL) {   // radical.js 沒載入：藏起部首入口
  const sw = catFull.querySelector('.cat-full-switch button[data-mode="rad"]'); if (sw) sw.hidden = true;
  const rb = document.getElementById('catRadical'); if (rb) rb.hidden = true;
}
let _radCur = '', _radUrlTimer = 0;   // 新增：部首目前捲到的筆畫（''＝第一組，不寫進網址）
// ---- 新增：部首「檢視文字」模式 ----
// 部首右側的選項「直接查詢｜檢視文字」：直接查詢（預設）＝點部首後離開瀏覽、以該部首查詢（原本的做法）；
// 檢視文字＝點部首後留在瀏覽畫面，下方（同拼音的上下欄）列出該部首的字，依部首外筆畫分列，點字開詞條。
let _radAct = 'text', _radSel = '', _radHan = null;   // 修改：固定為「檢視文字」（已移除「直接查詢｜檢視文字」切換鈕；要直接查詢請按面板裡的「查詢此部首」）   // _radAct：go／text（記在 localStorage）；_radSel：檢視文字時選中的部首
const radActEl = document.getElementById('radAct'), radDetailEl = document.getElementById('radDetail');
function syncRadAct() {   // 選項鈕的亮燈
  if (!radActEl) return;
  radActEl.querySelectorAll('button').forEach(b => { const on = b.dataset.act === _radAct; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}
function radChars(name) {   // 該部首在辭典裡的單字：[[部首外筆畫, [{han, id}, ...]], ...]（順序依 radical.js；辭典有、部首表沒有的放最後「其他」＝-1）
  const r = myRadicalData.find(x => x.name === name); if (!r) return [];
  if (!_radHan) {
    _radHan = new Map();
    dictionary.forEach(it => {
      const v = it[RADICAL_TAB]; if (!v) return;
      const han = String(it['台語'] || '').replace(/【[^】]*】/g, '').trim(); if ([...han].length !== 1) return;
      v.split('、').forEach(n => { let m = _radHan.get(n); if (!m) _radHan.set(n, m = new Map()); if (!m.has(han)) m.set(han, String(it['詞目id'] || '')); });
    });
  }
  const have = _radHan.get(name) || new Map(), seen = new Set(), out = [];
  r.groups.forEach(([o, str]) => {
    const l = [];
    [...str].forEach(c => { if (have.has(c) && !seen.has(c)) { seen.add(c); l.push({ han: c, id: have.get(c) }); } });
    if (l.length) out.push([o, l]);
  });
  const rest = []; have.forEach((id, c) => { if (!seen.has(c)) rest.push({ han: c, id }); });
  if (rest.length) out.push([-1, rest]);
  return out;
}
function radDrawDetail() {   // 底部面板：被選中部首的字
  if (!radDetailEl) return;
  if (_browseMode !== 'rad' || _radAct !== 'text' || !_radSel) { radDetailEl.hidden = true; radDetailEl.innerHTML = ''; return; }
  const E = escHtml, rows = radChars(_radSel), r = myRadicalData.find(x => x.name === _radSel);
  const total = rows.reduce((n, [, l]) => n + l.length, 0), hits = new Set([...catFullFilter.value.trim()]);   // 篩選框輸入的字會標色
  radDetailEl.innerHTML = `<div class="py-dh"><button type="button" class="py-ttl" title="離開瀏覽，以此部首查詢"><b>${E(_radSel)}</b></button><small>${r ? r.strokes + ' 畫・' : ''}${total} 字</small>${NW_BTN()}<button type="button" class="py-x" aria-label="收起" title="收起"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button></div><div class="py-rows">` +
    rows.map(([o, l]) => `<div class="py-tr"><div class="py-tn" title="${o < 0 ? '部首表未列' : '部首外 ' + o + ' 畫' + (r ? '，總筆畫 ' + (r.strokes + o) : '')}"><b>${o < 0 ? '其他' : '+' + o}</b></div><div class="py-hz">` +
      l.map(x => `<button type="button" class="py-han${hits.has(x.han) ? ' is-hit' : ''}" data-id="${E(x.id)}" title="查詢「${E(x.han)}」">${E(x.han)}</button>`).join('') + '</div></div>').join('') + '</div>';
  radDetailEl.hidden = false;
  radLayout();
}
function radLayout() {   // 新增：依面板寬度與各列字數，智慧分 1～3 欄；一欄放不下的列橫跨多欄
  if (!radDetailEl || radDetailEl.hidden) return;
  const box = radDetailEl.querySelector('.py-rows'); if (!box) return;
  const trs = [...box.querySelectorAll('.py-tr')]; if (!trs.length) return;
  box.classList.remove('rad-cols'); trs.forEach(t => { t.style.gridColumn = ''; });
  const W = box.clientWidth, h0 = box.querySelector('.py-han');
  let cols = Math.max(1, Math.min(3, Math.floor((W + 12) / 330)));   // 每欄至少約 330px
  if (window.innerWidth <= 768 || !h0) cols = 1;
  if (cols < 2) return;
  const colW = (W - 12 * (cols - 1)) / cols, charW = h0.offsetWidth + 2;
  const perCol = Math.max(1, Math.floor((colW - 72 - 40) / charW));   // 一欄扣掉左邊「+n」標籤與內距後，大約放幾個字
  const spans = trs.map(t => Math.min(cols, Math.ceil(t.querySelectorAll('.py-han').length / perCol) || 1));
  if (spans.every(n => n > 1)) return;   // 每列都很長：維持單欄
  box.style.setProperty('--rc', cols); box.classList.add('rad-cols');
  trs.forEach((t, i) => { if (spans[i] > 1) t.style.gridColumn = 'span ' + spans[i]; });
}
window.addEventListener('resize', () => { clearTimeout(radLayout._t); radLayout._t = setTimeout(radLayout, 80); });
function radMarkSel() {   // 標出選中的部首方格，並重畫面板
  catFullBody.querySelectorAll('.rad-tile.on').forEach(b => { if (b.dataset.rad !== _radSel || _radAct !== 'text') b.classList.remove('on'); });
  if (_radSel && _radAct === 'text') { const t = [...catFullBody.querySelectorAll('.rad-tile')].find(x => x.dataset.rad === _radSel); if (t) t.classList.add('on'); }
  radDrawDetail();
}
function radSelect(name, tile) {   // 點部首方格（檢視文字）：再點一次收起
  _radSel = name; radMarkSel(); syncUrl('replace');
  if (name && tile) pyReveal(tile, true);   // 面板展開後清單變矮，把被點的方格捲到可見處
}
function radScrollTo(s, smooth) {   // 新增：捲到指定筆畫（導覽列點擊、網址還原共用）
  const sec = catFullBody.querySelector(`.rad-sec[data-s="${s}"]`); if (!sec) return;
  catFullBody.scrollTo({ top: sec.getBoundingClientRect().top - catFullBody.getBoundingClientRect().top + catFullBody.scrollTop - 4, behavior: smooth ? 'smooth' : 'auto' });
}
function getRadicalStats() {   // 各部首在辭典裡的單字數（第一次用到才計算）
  if (_radStats) return _radStats;
  _radStats = new Map();
  dictionary.forEach(it => {
    const v = it[RADICAL_TAB]; if (!v) return;
    v.split('、').forEach(n => _radStats.set(n, (_radStats.get(n) || 0) + 1));
  });
  return _radStats;
}
function renderRadicalFull() {
  const kw = catFullFilter.value.trim(), cnt = getRadicalStats(), E = escHtml;
  let only = null, hit = null;
  const num = kw.match(/^(\d+)\s*畫?$/);
  if (num) only = +num[1];
  else if (kw) {
    hit = new Set();
    [...kw].forEach(ch => {
      if (myRadicalData.some(r => r.name === ch)) hit.add(ch);
      myRadicalOf(ch).forEach(r => hit.add(r.name));
    });
  }
  let html = '', strokes = [];
  myRadicalGroupByStrokes().forEach(([s, list]) => {
    if (only !== null && s !== only) return;
    list = list.filter(r => hit ? hit.has(r.name) : (cnt.get(r.name) || 0) > 0);   // 沒篩選時，辭典裡沒有字的部首不列
    if (!list.length) return;
    strokes.push(s);
    html += `<section class="rad-sec" data-s="${s}"><h3 class="rad-sec-h">${s}</h3><div class="rad-grid">` +
      list.map(r => {
        const n = cnt.get(r.name) || 0, lv = n >= 100 ? 4 : n >= 40 ? 3 : n >= 15 ? 2 : n >= 5 ? 1 : 0;   // 新增：依字數分 0～4 級，決定方格底色深淺
        return `<button type="button" class="rad-tile${hit ? ' is-hit' : ''}${_radAct === 'text' && r.name === _radSel ? ' on' : ''}" data-h="${lv}" data-rad="${E(r.name)}" title="${E(r.name)}部・${r.strokes} 畫・${n} 字"${n ? '' : ' disabled'}><b>${E(r.name)}</b><small>${n || ''}</small></button>`;
      }).join('') + '</div></section>';
  });
  catFullBody.innerHTML = html || '<div class="cat-empty">找無符合的部首</div>';
  catFullBody.scrollTop = 0;
  if (_radCur) { _radCur = ''; clearTimeout(_radUrlTimer); _radUrlTimer = setTimeout(() => { if (_browseOpen) syncUrl('replace'); }, 300); }   // 新增：重畫（篩選）後捲回頂端，網址的 bs 跟著拿掉
  catFullRail.hidden = !!kw || !strokes.length;   // 篩選中不顯示導覽列
  catFullRail.innerHTML = catFullRail.hidden ? '' : '<span class="rad-unit">畫數</span>' + strokes.map(s => `<button type="button" data-s="${s}">${s}</button>`).join('');
  radDrawDetail();   // 新增：篩選的字要在面板裡標色
  updateRadicalSpy();
}
function updateRadicalSpy() {   // 依捲動位置，標示導覽列目前的筆畫
  if (_browseMode === 'cat' || catFullRail.hidden) return;   // 修改：原本只有部首模式，拼音模式共用
  const top = catFullBody.getBoundingClientRect().top + 24;
  let cur = null;
  catFullBody.querySelectorAll('.rad-sec').forEach(s => { if (s.getBoundingClientRect().top <= top) cur = s.dataset.s; });
  const f0 = catFullBody.querySelector('.rad-sec');
  if (!cur) cur = f0 && f0.dataset.s;
  if (_browseMode === 'rad') {   // 新增：捲動停下 300ms 後，把目前筆畫寫進網址 bs（replace，不增加歷史）
    const v = cur && f0 && cur !== f0.dataset.s ? cur : '';
    if (v !== _radCur) { _radCur = v; clearTimeout(_radUrlTimer); _radUrlTimer = setTimeout(() => { if (_browseOpen) syncUrl('replace'); }, 300); }
  }
  catFullRail.querySelectorAll('button').forEach(b => {
    const on = b.dataset.s === cur;
    if (on === b.classList.contains('on')) return;
    b.classList.toggle('on', on);
    if (on) { const r = catFullRail.getBoundingClientRect(), br = b.getBoundingClientRect(); catFullRail.scrollLeft += br.left - r.left - (r.width - br.width) / 2; }   // 讓目前筆畫留在導覽列中間
  });
}
function renderBrowse() {
  const _pd = document.getElementById('pyDetail'); if (_pd && _browseMode !== 'py') _pd.hidden = true;   // 新增：離開拼音模式就藏起例字面板
  _pyBar.hidden = _browseMode !== 'py'; if (_pyBar.hidden && typeof pyPopToggle === 'function') pyPopToggle(false);   // 新增：離開拼音模式時收起選項面板
  if (_browseMode !== 'py') catFullBody.classList.remove('is-mx');   // 新增：排版切換列只在拼音模式出現
  if (radActEl) { radActEl.hidden = _browseMode !== 'rad'; syncRadAct(); }   // 新增：「直接查詢｜檢視文字」只在部首模式出現
  if (radDetailEl && _browseMode !== 'rad') radDetailEl.hidden = true;
  if (_browseMode === 'rad') renderRadicalFull();
  else if (_browseMode === 'py') renderPinyinFull();   // 新增：拼音模式
  else renderCategoryFull();   // 修改：導覽列改由 renderCategoryFull 自己處理（原本這裡先藏起並清空）
}
function setBrowseMode(mode) {
  if (mode === 'rad' && !HAS_RADICAL) mode = 'cat';
  catFullRail.classList.toggle('is-cat', mode === 'cat');   // 新增：分類模式的大類按鈕用灰底
  if (mode !== 'cat') catFullRail.classList.remove('is-open');   // 修改：原本每次進分類模式都強制展開（_catRailOpen = true）→ 改用記住的狀態；其他模式維持原本的單排
  _browseMode = mode; _radCur = ''; _radSel = '';   // 修改：多重設 _radCur（每次開啟／切換模式，部首都從第一組開始）
  catFull.querySelectorAll('.cat-full-switch button').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  catFullFilter.value = ''; setFilterExpanded(false);   // 修改：切換模式時一併還原最大化狀態
  catFullFilter.placeholder = mode === 'rad' ? '字、部首、筆畫數' : mode === 'py' ? '音節或字，例：tsi、tsit8、貴' : '篩選分類⋯⋯';   // 修改：多了拼音
  if (mode === 'py') { _pySel = ''; _pyTone = ''; _pyHits = new Set(); }   // 新增：每次進拼音模式都從頭開始
  renderBrowse();
  if (window.innerWidth > 768) catFullFilter.focus();
}
catFull.querySelector('.cat-full-switch').addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]'); if (b && b.dataset.mode !== _browseMode) { setBrowseMode(b.dataset.mode); syncUrl('replace'); }   // 修改：切換分類／部首／拼音，網址 b 跟著換
});
catFullRail.addEventListener('click', e => {   // 點筆畫 → 捲到該筆畫
  const b = e.target.closest('button[data-s]'); if (!b) return;
  if (_browseMode === 'cat') { const n = b.dataset.s; catFullRail.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); requestAnimationFrame(() => catScrollTo(n, true)); return; }   // 修改：大類列點了會自動收合（下面的導覽列處理），標示點選的大類（收合後導覽列會自動把它捲到中間），等收合後版面定了再捲到該大類   // 新增：分類模式，點大類別 → 捲到該大類
  if (_browseMode === 'py' && _pyOne) { _pyCur = b.dataset.s; renderPinyinFull(); syncUrl('replace'); return; }   // 只看所選：換成那一組
  radScrollTo(b.dataset.s, true);   // 修改：改用 radScrollTo
});
// 新增：導覽列（聲母／韻母／筆畫）可拖曳、可用滾輪橫捲、有細滾動條；放不下時，左邊標籤固定、右側出現圖示鈕，點了全部攤開成多排
(function () {
  const r = catFullRail; let down = false, moved = false, sx = 0, sl = 0;
  const wrap = document.createElement('div'); wrap.className = 'rad-rail-wrap';
  const inner = document.createElement('div'); inner.className = 'rad-rail-in';   // 新增：導覽列自己的容器（遮罩層、展開鈕以它為準），右邊才有位置放「直接查詢｜檢視文字」
  r.parentNode.insertBefore(wrap, r); wrap.appendChild(inner); inner.appendChild(r);   // 外面包一層：左右兩端的遮罩層、展開鈕放在這裡，才不會跟著內容捲
  const lab = document.createElement('div'); lab.className = 'rad-unit rail-lab'; lab.hidden = true; lab.setAttribute('aria-hidden', 'true');   // 左邊固定的標籤（複製自內容裡的「韻母」）
  const end = document.createElement('div'); end.className = 'rail-end'; end.hidden = true;   // 右端：白色漸層遮住尾端＋展開鈕
  const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'rail-more';
  mb.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  end.appendChild(mb); inner.appendChild(lab); inner.appendChild(end);
  if (radActEl) wrap.appendChild(radActEl);   // 新增：「直接查詢｜檢視文字」從標題列移到筆畫數字的右邊（仍只在部首模式顯示）
  const isOpen = () => r.classList.contains('is-open');
  function label() { const o = isOpen(); mb.title = o ? '收合' : '展開全部'; mb.setAttribute('aria-label', mb.title); mb.setAttribute('aria-expanded', o); }
  function fade() {   // 左邊標籤的寬度／是否已捲動（捲動後標籤右邊才有淡出）
    const u = r.querySelector('.rad-unit');
    lab.hidden = !u || !r.classList.contains('has-more') || isOpen();
    if (u) { lab.textContent = u.textContent; lab.style.width = (u.offsetLeft + u.offsetWidth) + 'px'; }
    lab.classList.toggle('is-scrolled', r.scrollLeft > 2);
  }
  function centerOn() { const b = r.querySelector('button.on'); if (!b || isOpen() || !r.clientWidth) return; const rr = r.getBoundingClientRect(), br = b.getBoundingClientRect(); r.scrollLeft += br.left - rr.left - (rr.width - br.width) / 2; }   // 把目前那一項捲到導覽列中間
  function sync() {   // 內容重畫、視窗大小改變後：放得下就不顯示鈕，放不下才顯示
    if (r.hidden || !r.firstElementChild) { r.classList.remove('is-open', 'has-more'); end.hidden = true; lab.hidden = true; return; }
    if (!r.clientWidth) return;   // 大版面還沒顯示出來，量不到
    const last = r.lastElementChild, need = isOpen() || last.offsetLeft + last.offsetWidth > r.clientWidth - 8;
    r.classList.toggle('has-more', need); end.hidden = !need;
    if (!need) r.classList.remove('is-open');
    label(); fade();
  }
  catRailSync = () => { sync(); centerOn(); };   // 新增：讓外面（捲動時收合）能通知導覽列重新排版
  new MutationObserver(sync).observe(r, { childList: true });
  window.addEventListener('resize', sync);
  r.addEventListener('scroll', fade, { passive: true });
  mb.addEventListener('click', () => { r.classList.toggle('is-open'); r.scrollLeft = 0; if (_browseMode === 'cat') catRailRemember(isOpen()); sync(); centerOn(); });   // 修改：原本只改變數，現在一併存起來
  r.addEventListener('mousedown', e => {
    if (e.button !== 0 || isOpen()) return;
    if (e.clientY > r.getBoundingClientRect().top + r.clientHeight) return;   // 按在滾動條上：交給瀏覽器
    down = true; moved = false; sx = e.clientX; sl = r.scrollLeft;
  });
  window.addEventListener('mousemove', e => { if (!down) return; const dx = e.clientX - sx; if (!moved && Math.abs(dx) < 5) return; moved = true; r.classList.add('is-drag'); r.scrollLeft = sl - dx; });
  window.addEventListener('mouseup', () => { if (!down) return; down = false; r.classList.remove('is-drag'); if (moved) setTimeout(() => { moved = false; }, 0); });
  r.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);   // 拖曳結束不要當成點選
  r.addEventListener('wheel', e => { if (isOpen() || r.scrollWidth <= r.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; r.scrollLeft += e.deltaY; e.preventDefault(); }, { passive: false });   // 滾輪＝左右捲
  r.addEventListener('click', e => { if (isOpen() && e.target.closest('button[data-s]')) { r.classList.remove('is-open'); if (_browseMode === 'cat') catRailRemember(false); setTimeout(() => { sync(); centerOn(); }, 0); } });   // 選了一項就自動收合，並把選中的那一項捲到中間
})();
let _radSpyRaf = 0;
catFullBody.addEventListener('scroll', () => {   // 新增：分類模式，使用者一開始捲動頁面就把上方大類導覽列收起來（並記住，下次進來／返回都維持收合）
  if (_browseMode !== 'cat' || !_catRailOpen || Date.now() < _catIgnoreScroll || catFullBody.scrollTop <= 4) return;
  catRailRemember(false); catFullRail.classList.remove('is-open'); catRailSync();
}, { passive: true });
catFullBody.addEventListener('scroll', () => { if (_browseMode === 'cat' || _radSpyRaf) return; _radSpyRaf = requestAnimationFrame(() => { _radSpyRaf = 0; updateRadicalSpy(); }); }, { passive: true });   // 修改：原本 !== 'rad'，拼音模式共用

// ======== 新增：「拼音」瀏覽模式（與分類、部首共用同一個大版面）========
// 以「拼音音節（不含聲調）」瀏覽單字：左邊聲母、右邊音節方塊（右邊小字＝單字數）；
// 點音節 → 版面底部浮出面板，依聲調（1 陰平…8 陽入）分列該音節的字，字的顏色沿用聲調色彩；點字 → 開啟該字的詞條。
// 資料不另建檔：第一次用到時，掃過辭典裡的單字詞目，用「台羅無調」欄位建立「音節 → 調 → 字」索引。
// 篩選框：輸入音節（tsi，包含即符合）、數字調（tsit8、gu5）、帶調符的台羅（tsi̍t）、或漢字（貴；列出它所有的音節）。
const PY_ORDER = ['', 'p', 'ph', 'm', 'b', 't', 'th', 'n', 'l', 'k', 'kh', 'ng', 'h', 'g', 'ts', 'tsh', 's', 'j'];   // 空字串＝零聲母
const PY_INI = ['tsh', 'ts', 'ph', 'th', 'kh', 'ng', 'p', 'b', 'm', 't', 'n', 'l', 'k', 'g', 'h', 's', 'j'];   // 比對用：長的在前
let _pyIdx = null, _pySel = '', _pyTone = '', _pyHits = new Set();
let _pyView = 'fam', _pyRev = false, _pyOne = true, _pyCur = '', _pyMxPair = false;   // 修改：_pyOne 預設 false → true（預設啟用「只看所選」）   // 新增：排版 list 清單／fam 家族／mx 矩陣；_pyRev 反向（韻母→聲母）；_pyOne 只看所選的一組（_pyCur＝目前那一組）
// 修改：「只看所選」預設啟用——沒存過（null）也算啟用，只有明確存了 '0'（使用者自己關掉）才是關
try { const v = localStorage.getItem('holoPyView'); if (v === 'list' || v === 'mx') _pyView = v; _pyRev = localStorage.getItem('holoPyRev') === '1'; _pyOne = localStorage.getItem('holoPyOne') !== '0'; _pyMxPair = localStorage.getItem('holoPyMx') === 'pair'; } catch (err) {}
function pyStateFromUrl(sp) {
  const v = sp.get('bv'), view = (v === 'list' || v === 'mx') ? v : 'fam';
  const rev = sp.get('br') === '1', one = sp.get('bo') !== '0', pair = sp.get('bm') === 'pair', cur = sp.get('bc') || '';
  const changed = view !== _pyView || rev !== _pyRev || one !== _pyOne || pair !== _pyMxPair || (!!cur && cur !== _pyCur);
  if (rev !== _pyRev) _pyCur = '';
  _pyView = view; _pyRev = rev; _pyOne = one; _pyMxPair = pair;
  if (cur) _pyCur = cur;
  return changed;
}
function pySavePrefs() { try { localStorage.setItem('holoPyView', _pyView); localStorage.setItem('holoPyRev', _pyRev ? '1' : '0'); localStorage.setItem('holoPyOne', _pyOne ? '1' : '0'); localStorage.setItem('holoPyMx', _pyMxPair ? 'pair' : 'fam'); } catch (err) {} }
// 新增：韻母家族（每個韻母只歸一類，依序判斷）
const PY_FAM = [{ k: 1, name: '開韻', note: 'a i u e o' }, { k: 2, name: '鼻韻尾', note: '-m -n -ng' }, { k: 3, name: '入聲', note: '-p -t -k -h' }, { k: 4, name: '鼻化', note: '-nn' }, { k: 5, name: '鼻音', note: 'm ng' }];
function pyFamOf(f) {
  if (/^(?:m|ng|mh|ngh)$/.test(f)) return 5;   // 自成音節的鼻音
  if (/nnh?$/.test(f)) return 4;               // 鼻化（ann、iunn、annh）
  if (/[ptkh]$/.test(f)) return 3;             // 入聲
  if (/(?:m|n|ng)$/.test(f)) return 2;         // 鼻韻尾（am、an、ang）
  return 1;                                    // 開韻（只有母音）
}
const PY_RK = 'aiueomngptkh';   // 家族內排序：a i u e o，其後 m n g、p t k h
function pyFinCmp(a, b) {   // 修改：家族內的排序——開韻、鼻化：單元音 → 複元音；鼻韻尾：依 -m -n -ng 再依韻腹；入聲：依 -p -t -k -h 再依韻腹
  const fa = pyFamOf(a), fb = pyFamOf(b); if (fa !== fb) return fa - fb;
  if (fa === 5) return a < b ? -1 : a > b ? 1 : 0;   // 自成音節的鼻音：m、mh、ng、ngh
  const A = pyPairParse(a), B = pyPairParse(b);
  if ((fa === 2 || fa === 3) && A.g !== B.g) return A.g - B.g;   // 鼻韻尾 m→n→ng；入聲 p→t→k→h（pyPairParse 的組別 2、3、4、6 剛好是這個先後）
  const d = pyStemCmp(A.stem, B.stem); if (d) return d;
  return A.t - B.t;   // 同一韻腹：ann 在 annh 前
}
function pyStemCmp(x, y) {   // 新增：韻腹比較：單元音（a i u e o）→ 複元音 → 三元音；同長度依母音順序
  const ua = x.match(/oo|ee|er|ir|ur|[aiueo]/g) || [], ub = y.match(/oo|ee|er|ir|ur|[aiueo]/g) || [];
  if (ua.length !== ub.length) return ua.length - ub.length;
  const rk = u => { const i = PY_VOW.indexOf(u); return i < 0 ? 99 : i; };
  for (let i = 0; i < ua.length; i++) { const d = rk(ua[i]) - rk(ub[i]); if (d) return d; }
  return x === y ? 0 : x < y ? -1 : 1;
}
// 新增：矩陣「依韻尾配對」——開韻在前；其後依韻尾分成 -m‧-p、-n‧-t、-ng‧-k 三組（舒聲與入聲相鄰：am→ap、an→at、ang→ak），再接 -nn（鼻化）、-h（喉塞）各自一組；
// 每組內先依「韻腹」排：單元音（a i u e o）優先、二元音其次、三元音再後；同一個韻腹則舒聲在前、入聲在後。
const PY_PAIR = [{ k: 1, name: '開韻', note: 'a i u e o' }, { k: 2, name: '-m ‧ -p', note: '雙唇' }, { k: 3, name: '-n ‧ -t', note: '舌尖' }, { k: 4, name: '-ng ‧ -k', note: '舌根' }, { k: 5, name: '-nn', note: '鼻化' }, { k: 6, name: '-h', note: '喉塞' }, { k: 7, name: '鼻音', note: 'm ng' }];   // 修改：-nn 與 -h 沒有舒入對應，拆成兩組；鼻音由 6 改成 7
const PY_VOW = ['a', 'i', 'u', 'e', 'o', 'oo', 'ee', 'er', 'ir', 'ur'];   // 母音單位的先後
function pyPairParse(f) {   // 韻母 → { g 組別, stem 韻腹, t 組內先後（0 開韻、1 舒聲、2 入聲…） }
  if (/^(?:m|ng|mh|ngh)$/.test(f)) return { g: 7, stem: f, t: 0 };   // 修改：6 → 7
  let m;
  if ((m = /^(.*?)(nnh|nn)$/.exec(f))) return { g: 5, stem: m[1], t: m[2] === 'nn' ? 1 : 2 };   // 鼻化：ann、annh（annh 跟在 ann 後面）
  if ((m = /^(.*)h$/.exec(f))) return { g: 6, stem: m[1], t: 1 };    // 修改：喉塞 -h 自成一組（ah、ih、eh…）
  if ((m = /^(.*)ng$/.exec(f))) return { g: 4, stem: m[1], t: 1 };
  if ((m = /^(.*)k$/.exec(f))) return { g: 4, stem: m[1], t: 2 };
  if ((m = /^(.*)n$/.exec(f))) return { g: 3, stem: m[1], t: 1 };
  if ((m = /^(.*)t$/.exec(f))) return { g: 3, stem: m[1], t: 2 };
  if ((m = /^(.*)m$/.exec(f))) return { g: 2, stem: m[1], t: 1 };
  if ((m = /^(.*)p$/.exec(f))) return { g: 2, stem: m[1], t: 2 };
  return { g: 1, stem: f, t: 0 };
}
function pyPairCmp(a, b) {
  const A = pyPairParse(a), B = pyPairParse(b);
  if (A.g !== B.g) return A.g - B.g;
  if (A.g === 7) return a < b ? -1 : a > b ? 1 : 0;   // 修改：6 → 7
  const d = pyStemCmp(A.stem, B.stem); if (d) return d;   // 修改：韻腹比較抽成 pyStemCmp，與家族排序共用（單元音 → 二元音 → 三元音）
  return A.t - B.t;   // 同一個韻腹：舒聲在前、入聲在後
}
function pySplit(syl) {   // 音節 → 聲母（m、ng 單獨成音節時視為零聲母）
  if (/^(?:m|mh|ng|ngh)$/.test(syl)) return '';
  for (const i of PY_INI) if (syl.length > i.length && syl.startsWith(i)) return i;
  return '';
}
function getPinyinIndex() {
  if (_pyIdx) return _pyIdx;
  const syl = new Map(), chars = new Map(), re = /^([a-z]+)([1-9])$/;
  dictionary.forEach(it => {
    const han = String(it['台語'] || '').replace(/【[^】]*】/g, '').trim();
    if (han.length > 2 || [...han].length !== 1 || !_HAN_CHAR.test(han)) return;   // 只要單字詞目（修改：先用長度快速排除多字詞）
    const raw = String(it['台羅無調'] || ''), mk = (raw.match(/^【([白文])】/) || [])[1] || '';   // 【白】【文】標記
    raw.replace(/【[^】]*】/g, '').split(/[\/\s]+/).forEach(p => {
      const m = re.exec(p.trim().toLowerCase()); if (!m) return;
      let e = syl.get(m[1]); if (!e) syl.set(m[1], e = { s: m[1], ini: pySplit(m[1]), tones: new Map(), n: 0, set: new Set() });
      let arr = e.tones.get(m[2]); if (!arr) e.tones.set(m[2], arr = []);
      if (arr.some(x => x.han === han)) return;
      arr.push({ han, id: String(it['詞目id'] || ''), mk });
      if (!e.set.has(han)) { e.set.add(han); e.n++; }
      let cs = chars.get(han); if (!cs) chars.set(han, cs = new Set()); cs.add(m[1]);
    });
  });
  const by = new Map(PY_ORDER.map(i => [i, []])), finSet = new Set();
  syl.forEach(e => { e.fin = e.ini ? e.s.slice(e.ini.length) : e.s; finSet.add(e.fin); by.get(e.ini).push(e); });   // 新增：fin＝韻母（零聲母的就是整個音節）
  by.forEach(l => l.sort((a, b) => a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  const fins = [...finSet].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);   // 新增：全部韻母（對齊、矩陣用）
  return (_pyIdx = { syl, chars, by, fins, finsFam: [...fins].sort(pyFinCmp), finsPair: [...fins].sort(pyPairCmp) });   // fins＝字母序、finsFam＝家族序、finsPair＝韻尾配對序
}
function pyLevel(n) { return n >= 40 ? 4 : n >= 25 ? 3 : n >= 12 ? 2 : n >= 5 ? 1 : 0; }   // 依單字數分 0～4 級，決定底色深淺
function pyChip(e, rev, full) {   // 清單／家族用的音節方塊（等寬）；rev＝反向時顯示聲母；修改：full＝「只看所選」時，自動補上另一半（聲母或韻母），顯示完整音節
  const E = escHtml, n = e.n;
  let lab = rev ? (e.ini ? E(e.ini) : '零') : E(e.fin);   // 有聲母的只顯示韻母（-ann），聲母已在左邊標題
  if (full) lab = rev ? `${E(e.ini || '零')}<span class="py-p">${E(e.fin)}</span>` : `<span class="py-p">${E(e.ini)}</span>${E(e.fin)}`;   // 新增：只看所選＝完整音節；補上的那一半用淡灰色（一般：補聲母；韻母→聲母：補韻母）
  return `<button type="button" class="py-syl" data-h="${pyLevel(n)}" data-syl="${E(e.s)}" title="${E(e.s)}" aria-label="${E(e.s)}，${n} 字"><b>${lab}</b><small>${n}</small></button>`;
}
function pyFamBanner(F) { return `<div class="py-fam-bn">${F.name}<small>${F.note}</small></div>`; }
function pyMatrixHtml(ix, want) {   // 矩陣：直列＝韻母（依家族排序）、橫欄＝聲母，格內＝單字數；沒有的音節留白
  const E = escHtml, cell = new Map(), fins = new Set(), inis = new Set();
  let first = '';
  ix.by.forEach((list, ini) => list.forEach(e => {
    if (want && !want.has(e.s)) return;
    if (!first) first = e.s;
    cell.set(ini + '|' + e.fin, e); fins.add(e.fin); inis.add(ini);
  }));
  if (!cell.size) return { html: '', first: '' };
  const cols = PY_ORDER.filter(i => inis.has(i)), rows = (_pyMxPair ? ix.finsPair : ix.finsFam).filter(f => fins.has(f));   // 修改：依目前的排序方式取列
  let h = '<table class="py-mx"><thead><tr><th class="py-mx-corner" scope="col"></th>' +
    cols.map(i => `<th scope="col" title="${i ? E(i) + ' 聲母' : '零聲母'}">${E(i || '零')}</th>`).join('') + '</tr></thead><tbody>';
  let lastF = 0;
  rows.forEach(f => {
    const k = _pyMxPair ? pyPairParse(f).g : pyFamOf(f);   // 修改：配對模式用配對組別
    if (k !== lastF) { lastF = k; const F = (_pyMxPair ? PY_PAIR : PY_FAM)[k - 1]; h += `<tr class="py-mx-fam"><td colspan="${cols.length + 1}">${F.name}<small>${F.note}</small></td></tr>`; }
    h += `<tr><th scope="row">${E(f)}</th>`;   // 修改：移除韻母前的「-」（原本是 <i>-</i>${E(f)}）
    cols.forEach(i => {
      const e = cell.get(i + '|' + f);
      h += e ? `<td><button type="button" class="py-cell" data-h="${pyLevel(e.n)}" data-syl="${E(e.s)}" title="${E(e.s)}・${e.n} 字" aria-label="${E(e.s)}，${e.n} 字">${e.n}</button></td>` : '<td></td>';
    });
    h += '</tr>';
  });
  return { html: h + '</tbody></table>', first };
}
// 排版列：清單｜家族｜矩陣，右邊兩個開關（韻母→聲母、只看所選）；只在拼音模式出現，並記住上次的選擇
const _pyBar = document.createElement('div');
_pyBar.className = 'py-view'; _pyBar.hidden = true; _pyBar.setAttribute('aria-label', '拼音排版');
_pyBar.innerHTML = '<span class="rad-unit">排版</span>' + [['fam', '家族'], ['list', '清單'], ['mx', '矩陣']].map(([k, t]) => `<button type="button" data-v="${k}">${t}</button>`).join('') +
  '<button type="button" class="py-more" data-pop="1" aria-label="排版選項" aria-expanded="false" title="更多選項"><svg class="icon" aria-hidden="true"><use href="#i-tune"/></svg></button>' +   // 新增：選項按鈕（取代原本右側兩個開關與 py-view-sp 空白撐開元素）
  '<div class="py-pop" role="group" aria-label="排版選項">' +   // 新增：展開的選項面板
    '<div class="py-pop-tg"><button type="button" class="py-tg" data-o="rev"><span><b>韻母 → 聲母</b><small>先選韻母，再看有哪些聲母</small></span></button><button type="button" class="py-tg" data-o="one"><span><b>只看所選</b><small>上方導覽列選哪一組，只顯示那一組</small></span></button></div>' +   // 修改：這兩個開關從排版列搬進面板
    '<span class="py-mxo"><span class="rad-unit">排序</span><button type="button" data-m="fam" title="開韻、鼻韻尾、入聲、鼻化、鼻音分區">依韻類</button><button type="button" data-m="pair" title="-m/-p、-n/-t、-ng/-k、-nn/-h 舒聲與入聲相鄰；單元音優先、二元音其次">依韻尾配對</button></span>' +   // 修改：矩陣的排序切換也搬進面板（只在矩陣出現）
  '</div>';
(catFullRail.closest('.rad-rail-wrap') || catFullRail).before(_pyBar);   // 放在導覽列（含外層）上面
// 新增：選項面板開關；點面板外面就收起
function pyPopToggle(on) {
  const open = on === undefined ? !_pyBar.classList.contains('is-pop') : !!on;
  _pyBar.classList.toggle('is-pop', open);
  const g = _pyBar.querySelector('.py-more'); if (g) g.setAttribute('aria-expanded', open);
}
document.addEventListener('click', e => { if (_pyBar.classList.contains('is-pop') && !_pyBar.contains(e.target)) pyPopToggle(false); });
_pyBar.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pop) { pyPopToggle(); return; }   // 新增：選項按鈕只開關面板，不重畫
  if (b.dataset.v) { if (b.dataset.v === _pyView) return; _pyView = b.dataset.v; }
  else if (b.dataset.o === 'rev') { _pyRev = !_pyRev; _pyCur = ''; }   // 換方向：分組不同，目前那一組作廢
  else if (b.dataset.m) { const p = b.dataset.m === 'pair'; if (p === _pyMxPair) return; _pyMxPair = p; }   // 新增：矩陣排序方式
  else if (b.dataset.o === 'one') { _pyOne = !_pyOne; if (_pyOne) { const on = catFullRail.querySelector('button.on'); if (on) _pyCur = on.dataset.s; } }   // 開啟時，就看目前捲到的那一組
  else return;
  pySavePrefs();
  renderPinyinFull();
  syncUrl('replace');
});
// 新增：矩陣十字準線——游標移到格子（或表頭）時，標出所在的「列」與「欄」，並在左上角顯示音節（如 ts + -ia → tsia）；點選後的格子，它的列欄表頭會持續標示（手機也看得到）
let _mxT = null;
function mxPaint(cls, t) {   // cls：'hot'＝游標所在、'sel'＝已點選；t＝格子或表頭（null＝清除）
  const tb = catFullBody.querySelector('.py-mx'); if (!tb) return;
  tb.querySelectorAll(`.${cls}-r, .${cls}-c, .${cls}-x`).forEach(x => x.classList.remove(`${cls}-r`, `${cls}-c`, `${cls}-x`));
  const cn = tb.querySelector('.py-mx-corner');
  if (cls === 'hot' && cn) cn.removeAttribute('data-r');   // 修改：音節改放在 data-r（用 ::after 顯示），不再改文字，避免撐寬第一欄造成版面位移
  if (!t) return;
  const tr = t.parentElement, ci = [...tr.children].indexOf(t), body = tr.parentElement.tagName === 'TBODY';
  if (body) tr.classList.add(cls + '-r');
  if (ci > 0) tb.querySelectorAll(`tr:not(.py-mx-fam) > :nth-child(${ci + 1})`).forEach(x => x.classList.add(cls + '-c'));
  if (body && ci > 0) {
    t.classList.add(cls + '-x');   // 修改：下一行只有「真的有這個音節」（格子裡有按鈕）才在左上角拼出音節，空白格不顯示
    if (cls === 'hot' && cn && t.querySelector('.py-cell')) { const ini = tb.querySelector('thead tr').children[ci].textContent.trim(); cn.dataset.r = (ini === '零' ? '' : ini) + tr.children[0].textContent.replace(/^-/, ''); }
  }
}
const _mxHover = window.matchMedia ? matchMedia('(hover: hover)') : { matches: true };
catFullBody.addEventListener('mouseover', e => {
  if (!_mxHover.matches) return;
  if (!e.target.closest('.py-mx')) { if (_mxT) { _mxT = null; mxPaint('hot', null); } return; }   // 移到表格外：清除
  const t = e.target.closest('td, th');
  if (!t || t.parentElement.classList.contains('py-mx-fam') || t.classList.contains('py-mx-corner')) return;   // 修改：格子間的縫隙、分組標題、左上角：維持原標示，不清除（原本一過縫隙就清掉再重畫，才會閃）
  if (t === _mxT) return; _mxT = t; mxPaint('hot', t);
});
catFullBody.addEventListener('mouseleave', () => { _mxT = null; mxPaint('hot', null); });
function renderPinyinFull() {
  const kw = catFullFilter.value.trim(), ix = getPinyinIndex(), E = escHtml;
  let want = null, exact = '';
  _pyTone = ''; _pyHits = new Set();
  if (kw) {
    want = new Set();
    const hans = [...kw].filter(c => _HAN_CHAR.test(c));
    if (hans.length) hans.forEach(c => { _pyHits.add(c); (ix.chars.get(c) || []).forEach(s => want.add(s)); });
    else {
      const q = stripToneJS(kw.replace(/(o)\u0358/gi, '$1$1')).replace(/[\s\-]+/g, ''), m = /^([a-z]+)([1-9])?$/.exec(q);
      if (m) {
        ix.syl.forEach((e, s) => { if (s.includes(m[1])) want.add(s); });
        if (want.has(m[1])) { exact = m[1]; _pyTone = m[2] || ''; }   // 輸入的剛好是一個音節：直接打開它（有打調就標出該調）
      }
    }
  }
  let html = '', heads = [], first = '';
  const view = _pyView, rev = _pyRev && view !== 'mx', one = _pyOne && !kw && view !== 'mx';   // 篩選中顯示全部符合的；矩陣沒有分組
  if (view === 'mx') { const r = pyMatrixHtml(ix, want); html = r.html; first = r.first; }
  else {
    let groups = [];   // 每組＝一個聲母（反向時為一個韻母）
    if (rev) {
      const by = new Map();
      ix.by.forEach(list => list.forEach(e => {
        if (want && !want.has(e.s)) return;
        let g = by.get(e.fin); if (!g) by.set(e.fin, g = { key: e.fin, es: [] });
        g.es.push(e);
      }));
      groups = [...by.values()].sort(view === 'fam' ? (a, b) => pyFinCmp(a.key, b.key) : (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    } else {
      ix.by.forEach((list, ini) => {
        if (want) list = list.filter(e => want.has(e.s));
        if (list.length) groups.push({ key: ini || '零', ini, es: list });
      });
    }
    heads = groups.map(g => g.key);
    if (groups.length) first = groups[0].es[0].s;
    if (one) { if (!heads.includes(_pyCur)) _pyCur = heads[0] || ''; groups = groups.filter(g => g.key === _pyCur); }
    let lastK = 0;
    groups.forEach(g => {
      let inner;
      if (view === 'fam' && !rev) {   // 家族：同一個聲母裡，韻母依家族分行，每行前面有小標題
        const es = g.es.slice().sort((a, b) => pyFinCmp(a.fin, b.fin));
        inner = '<div class="py-fams">' + PY_FAM.map(F => {
          const l = es.filter(e => pyFamOf(e.fin) === F.k); if (!l.length) return '';
          return `<div class="py-fam"><div class="py-fam-h">${F.name}<small>${F.note}</small></div><div class="py-grid">${l.map(e => pyChip(e, false)).join('')}</div></div>`;
        }).join('') + '</div>';
      } else if (rev) {   // 反向：18 個聲母固定位置（兩排各 9 個），這個韻母沒有的聲母留成灰色、不能點
        const have = new Map(g.es.map(e => [e.ini, e]));
        inner = `<div class="py-grid py-rv">${PY_ORDER.map(i => have.has(i) ? pyChip(have.get(i), true, false) : `<span class="py-syl py-no" aria-hidden="true"><b>${i ? E(i) : '零'}</b></span>`).join('')}</div>`;
      } else inner = `<div class="py-grid">${g.es.map(e => pyChip(e, false)).join('')}</div>`;
      if (rev && view === 'fam') { const k = pyFamOf(g.key); if (k !== lastK && !one) { lastK = k; html += pyFamBanner(PY_FAM[k - 1]); } }   // 反向＋家族：各家族之間放一條標題
      const lb = E(g.key), ttl = rev ? '-' + g.key + ' 韻母' : (g.ini ? g.ini + ' 聲母' : '零聲母');
      html += `<section class="rad-sec py-sec${rev ? ' py-rvs' : ''}${rev && one ? ' py-one' : ''}" data-s="${E(g.key)}"><h3 class="rad-sec-h" title="${E(ttl)}">${lb}<small>${g.es.length}</small></h3>${inner}</section>`;
    });
  }
  if (want) {   // 篩選中：自動打開最符合的音節；沒有符合的就收起面板
    if (exact) _pySel = exact; else if (_pyHits.size && first) _pySel = first; else if (!want.has(_pySel)) _pySel = '';
  }
  catFullBody.innerHTML = html || '<div class="cat-empty">找無符合的音節</div>';
  catFullBody.scrollTop = 0; catFullBody.scrollLeft = 0;
  catFullBody.classList.toggle('is-mx', view === 'mx');
  _pyBar.classList.toggle('is-mx', view === 'mx');
  _pyBar.querySelectorAll('button').forEach(b => { if (b.dataset.pop) { b.classList.toggle('has-opt', (view !== 'mx' && (_pyRev || !_pyOne)) || (view === 'mx' && _pyMxPair)); return; }   // 新增：選項按鈕——有開啟非預設選項時亮小圓點
    const on = b.dataset.v ? b.dataset.v === view : b.dataset.m ? (b.dataset.m === 'pair') === _pyMxPair : b.dataset.o === 'rev' ? _pyRev : _pyOne; b.classList.toggle('on', on); b.setAttribute(b.dataset.v || b.dataset.m ? 'aria-selected' : 'aria-pressed', on); });
  catFullBody.querySelectorAll('.py-syl, .py-cell').forEach(b => b.classList.toggle('on', b.dataset.syl === _pySel));
  { const sc = catFullBody.querySelector('.py-cell.on'); mxPaint('sel', sc ? sc.parentElement : null); }   // 新增：矩陣重畫後，標出已選格子的列欄
  catFullRail.hidden = !!kw || !heads.length;   // 篩選中、矩陣都不顯示導覽列
  catFullRail.innerHTML = catFullRail.hidden ? '' : `<span class="rad-unit">${rev ? '韻母' : '聲母'}</span>` + heads.map(s => `<button type="button" data-s="${E(s)}">${E(s)}</button>`).join('');
  pyDrawDetail();
  pyReveal(catFullBody.querySelector('.py-syl.on, .py-cell.on'), false);   // 篩選後自動展開的音節也要看得到
  updateRadicalSpy();
}
function pyDrawDetail() {   // 底部面板：被選中音節的各調單字
  const box = document.getElementById('pyDetail'); if (!box) return;
  const e = _pySel && getPinyinIndex().syl.get(_pySel);
  if (!e) { box.hidden = true; box.innerHTML = ''; return; }
  const E = escHtml;
  // 電腦版：字少的調兩兩並排成左右兩欄，字多的調（超過 8 字）或落單的調獨佔一整列（.py-w）
  const ks = [...e.tones.keys()].sort(), wide = new Set();
  for (let i = 0; i < ks.length;) {
    const a = e.tones.get(ks[i]).length <= 8, b = i + 1 < ks.length && e.tones.get(ks[i + 1]).length <= 8;
    if (a && b) i += 2; else { wide.add(ks[i]); i++; }
  }
  const two = ks.length >= 2;
  const tl = ['1', '2', '3', '4', '5', '7', '8', '9']; if (e.tones.has('6')) tl.splice(5, 0, '6');   // 新增：聲調列（各調字數，沒有的調淡化；點了捲到該調）
  const strip = '<div class="py-ts" role="group" aria-label="聲調">' + tl.map(t => { const n = (e.tones.get(t) || []).length; return `<button type="button" class="py-tp${n ? '' : ' is-no'}${t === _pyTone ? ' on' : ''}" data-t="${t}" style="--tn:var(--tn${t})" title="${t} ${TONE_NAME[t] || ''}${n ? '・' + n + ' 字' : '・無'}"${n ? '' : ' disabled'}><b>${t}</b></button>`; }).join('') + '</div>';
  box.innerHTML = `<div class="py-dh"><button type="button" class="py-ttl" title="離開瀏覽，以此音讀查詢（^${E(e.s)}0$：任意聲調）"><b>${E(e.s)}</b></button><small>${e.n} 字</small>${strip}${NW_BTN()}<button type="button" class="py-x" aria-label="收起" title="收起"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button></div><div class="py-rows${two ? ' py-2c' : ''}">` +   // 修改：標題列（含 X）固定；下面的各調列包進 .py-rows 才會捲動
    ks.map(t => {
      let r; try { r = holoNumberToTone(e.s + t); } catch (err) { r = e.s + t; }   // 數字調 → 字中調：tsi2 → tsí
      return `<div class="py-tr${t === _pyTone ? ' is-hit' : ''}${wide.has(t) ? ' py-w' : ''}" data-t="${t}" style="--tn:var(--tn${t})"><div class="py-tn" title="${t} ${TONE_NAME[t] || ''}"><b>${E(r)}</b></div><div class="py-hz">` +
        e.tones.get(t).map(x => `<button type="button" class="py-han${_pyHits.has(x.han) ? ' is-hit' : ''}" data-id="${E(x.id)}" title="開啟「${E(x.han)}」的詞條">${E(x.han)}${x.mk ? `<sup>${x.mk}</sup>` : ''}</button>`).join('') + '</div></div>';
    }).join('') + '</div>';
  box.hidden = false;
}
function pyReveal(btn, smooth) {   // 新增：面板展開後清單變矮，若選中的音節被遮住（或太靠邊），就把它捲到可見區中間
  if (!btn) return;
  const mx = btn.classList.contains('py-cell'), r = catFullBody.getBoundingClientRect(), b = btn.getBoundingClientRect();
  const needV = !(b.top >= r.top + (mx ? 48 : 8) && b.bottom <= r.bottom - 8);   // 矩陣：上方有黏住的聲母列
  const needH = mx && (b.left < r.left + 72 || b.right > r.right - 8);           // 矩陣：左邊有黏住的韻母欄
  if (!needV && !needH) return;   // 本來就看得到：不動
  const o = { behavior: smooth ? 'smooth' : 'auto' };
  if (needV) o.top = Math.max(0, catFullBody.scrollTop + (b.top - r.top) - (r.height - b.height) / 2);
  if (needH) o.left = Math.max(0, catFullBody.scrollLeft + (b.left - r.left) - (r.width - b.width) / 2);
  catFullBody.scrollTo(o);
}
function searchByPinyinSyl(syl) {   // 新增：拼音瀏覽「查此音讀」：搜尋框填 ^音節0$（0＝任意聲調），照一般查詢列出結果
  hideDetailUI(); currentDetailId = null; setRawRx(false);
  searchInput.value = '^' + syl + '0$'; searchClear.style.display = 'block';
  currentSearchType = defaultType();
  performSearch(); updateActiveSearchType();
  window.scrollTo(0, 0);
}
function openEntryById(id, listOnly) {   // 關閉大版面，直接開啟該詞目的詳細頁（做法同 applyUrlState 的 d=詞目id）；修改：listOnly＝只列出搜尋結果清單，不進詳細頁（部首例字用）
  const item = dictionary.find(x => String(x['詞目id']) === String(id)); if (!item) return;
  closeBrowseForPick();
  hideDetailUI(); currentDetailId = null; setRawRx(false);
  const _han = String(item['台語'] || '').trim();
  searchInput.value = _han.replace(/【[^】]*】/g, '').trim() || _han; searchClear.style.display = 'block';   // 修改：搜尋框不帶【替】【白】等標記（「翱【替】」→「翱」）；全部都是標記時才退回原文
  currentSearchType = defaultType();
  performSearch(); updateActiveSearchType();
  let idx = filteredData.indexOf(item);
  if (idx < 0) { filteredData = [item]; hasSearchResults = true; displayResults(filteredData, 1); idx = 0; }
  if (listOnly) { window.scrollTo(0, 0); return; }   // 新增：只停在結果清單
  showFullData(idx);
}
catFull.addEventListener('click', e => {   // 修改：原本掛在 catFullBody，面板移出後改掛 catFull
  if (_browseMode !== 'py') return;
  const tp = e.target.closest('.py-tp[data-t]');   // 點聲調：捲到該調那一列並閃一下
  if (tp && !tp.disabled) {
    const row = document.getElementById('pyDetail').querySelector(`.py-tr[data-t="${tp.dataset.t}"]`);
    if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.remove('is-pulse'); void row.offsetWidth; row.classList.add('is-pulse'); }
    return;
  }
  const sb = e.target.closest('.py-syl[data-syl], .py-cell[data-syl]');
  if (sb) {   // 點音節：展開／收起底部面板
    _pySel = _pySel === sb.dataset.syl ? '' : sb.dataset.syl; _pyTone = ''; syncUrl('replace');   // 修改：選中的音節記在網址 bp
    catFullBody.querySelectorAll('.py-syl.on, .py-cell.on').forEach(b => b.classList.remove('on'));
    if (_pySel) sb.classList.add('on');
    mxPaint('sel', _pySel ? sb.closest('td') : null);   // 新增：標出（或清除）已選格子的列欄表頭
    pyDrawDetail();
    if (_pySel) pyReveal(sb, true);   // 新增：展開面板後，把被點的音節捲到上方可見處，不被面板遮住
    return;
  }
  if (e.target.closest('.py-nw')) { toggleNwMode(); return; }   // 修改：圖示只切換「新視窗」開關，不直接開新視窗
  if (e.target.closest('.py-ttl')) { if (_pySel) pickSyl(_pySel, _nwMode); return; }   // 修改：開關開啟時，標題查詢改在新視窗   // 新增：查此音讀 → 離開瀏覽，查 ^音節0$（任意聲調、完全符合）
  if (e.target.closest('.py-x')) {
    _pySel = ''; syncUrl('replace'); catFullBody.querySelectorAll('.py-syl.on, .py-cell.on').forEach(b => b.classList.remove('on')); mxPaint('sel', null); pyDrawDetail(); return;
  }
  const hz = e.target.closest('.py-han[data-id]');
  if (hz) { if (_nwMode) openEntryNewWin(hz.dataset.id, true); else openEntryById(hz.dataset.id, true); }   // 修改：點字：開詞條；開關開啟時在新視窗開
});

if (radActEl) radActEl.addEventListener('click', e => {   // 新增：部首右側的選項
  const b = e.target.closest('button[data-act]'); if (!b || b.dataset.act === _radAct) return;
  _radAct = b.dataset.act; _radSel = '';
  try { localStorage.setItem(myLocal + 'radAct', _radAct); } catch (err) {}
  syncRadAct(); radMarkSel(); syncUrl('replace');
});
catFull.addEventListener('click', e => {   // 新增：部首「檢視文字」面板：收起、查詢此部首、點字開詞條
  if (_browseMode !== 'rad' || !radDetailEl || !radDetailEl.contains(e.target)) return;
  if (e.target.closest('.py-x')) { radSelect(''); return; }
  if (e.target.closest('.py-nw')) { toggleNwMode(); return; }   // 修改：圖示只切換「新視窗」開關
  if (e.target.closest('.py-ttl')) { if (_radSel) pickRadical(_radSel, _nwMode); return; }   // 修改：開關開啟時，標題查詢改在新視窗
  const hz = e.target.closest('.py-han[data-id]'); if (hz) { if (_nwMode) openEntryNewWin(hz.dataset.id, true); else openEntryById(hz.dataset.id, true); }   // 修改：開關開啟時在新視窗；點部首例字 → 進搜尋結果清單（不是直接開詳細頁）
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (catFull.classList.contains('open')) toggleCategoryFull(false);
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
    let lastIsDesktop = null;   // 新增：記住上次是桌面版還是手機版
    function initializePanels() {
        const isDesktop = window.innerWidth > 768;
        if (isDesktop === lastIsDesktop) return;   // 新增：只有跨越 768px 才重設；手機的鍵盤、網址列伸縮也會觸發 resize，不該把使用者展開的面板收起來
        lastIsDesktop = isDesktop;

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
            sidebarItems.forEach(i => i.classList.toggle('active', i.dataset.panel === 'allSettings'));   // 新增：手機版回到「所有設定」
            panels.forEach((panel, index) => {
                const content = panel.querySelector('.panel-content');
                panel.style.display = '';   // 新增：清掉桌面版設的 display:none，否則畫面轉橫再轉直（或視窗縮小）後，只剩「版面與字體」
                if (index === 0) {
                    panel.classList.add('expanded');
                    if (content) content.style.display = 'block';
                } else {
                    panel.classList.remove('expanded');
                    if (content) content.style.display = 'none';
                }
            });
        }
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


// 返回頂部按鈕：往下捲超過一屏就顯示；點擊回到頁面最頂端
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
    window.scrollTo({ top: 0, behavior: 'smooth' });   // 修改：只回到頂端，不再自動聚焦、全選搜尋框
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
    if (catFull.classList.contains('open')) toggleCategoryFull(false, null, { keep: true });   // 先收起分類瀏覽大視窗
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
  if (currentDetailId == null) { _listScrollY = window.scrollY; window._detailOpenIdx = index; }   // 記住列表位置，返回時回到原處（修改：同時記下一開始點開的是第幾筆）
  window._detailIdx = index;   // 新增：目前看的是第幾筆（用「上一個／下一個」換詞後，返回時要回到這一筆）
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
      <button class="detail-menu" type="button" aria-label="選單" aria-haspopup="true" aria-expanded="false"><svg class="icon" aria-hidden="true"><use href="#i-menu"/></svg></button>
      <div class="detail-menu-pop" role="menu" hidden>
        <button type="button" role="menuitem" data-act="cat"><svg class="icon" aria-hidden="true"><use href="#i-apps"/></svg>分類</button>
        <button type="button" role="menuitem" data-act="article"><svg class="icon" aria-hidden="true"><use href="#i-refresh"/></svg>分析</button>
        <button type="button" role="menuitem" data-act="settings"><svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg>設定</button>
      </div>
    </div>
  `;

  // 新增：內容最後的切換列（上一個／下一個詞目，直接顯示詞目名稱，不必返回列表；不固定，捲到底才看到）
  const wordOf = i => escHtml(String((filteredData[i] || {})['台語'] || '').replace(/【[^】]*】/g, '').trim());
  const hasPrev = index > 0, hasNext = index < filteredData.length - 1;
  const navHtml = filteredData.length > 1 ? `
    <nav class="detail-nav" aria-label="切換詞目">
      <button type="button" class="dn-btn dn-prev" ${hasPrev ? '' : 'disabled'} aria-label="上一個詞目"><svg class="icon" aria-hidden="true"><use href="#i-chevron-right"/></svg><span class="dn-word">${hasPrev ? wordOf(index - 1) : ''}</span></button>
      <span class="dn-pos">${index + 1} / ${filteredData.length}</span>
      <button type="button" class="dn-btn dn-next" ${hasNext ? '' : 'disabled'} aria-label="下一個詞目"><span class="dn-word">${hasNext ? wordOf(index + 1) : ''}</span><svg class="icon" aria-hidden="true"><use href="#i-chevron-right"/></svg></button>
    </nav>` : '';


  // 生成詳細內容表格
  let tableContent = '<div class="mobile-modal-content">';
  tableContent += detailHtml(item);
  tableContent += navHtml;
  tableContent += '</div>';

  // 更新模態框內容
  const modalContent = document.getElementById('fullDataContent');
  modalContent.innerHTML = headerContent + tableContent;   // 修改：切換列已改放進 tableContent 內（內容最後）
  fillVariants(item, modalContent.querySelector('.mobile-modal-content'));

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
  if (modalContent.parentElement) modalContent.parentElement.scrollTop = 0;   // 新增：實際捲動的是外層 .modal-content，換詞後回到最上面
  const dnPrev = modalContent.querySelector('.dn-prev'), dnNext = modalContent.querySelector('.dn-next');   // 新增：綁定上一個／下一個
  if (dnPrev) dnPrev.onclick = () => showFullData(index - 1);
  if (dnNext) dnNext.onclick = () => showFullData(index + 1);

  // 綁定關閉按鈕事件
  const closeButton = modalContent.querySelector('.close-button');
  closeButton.onclick = function() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    closeDetailState();
  };
  if (window.closeDetailView) closeButton.onclick = () => window.closeDetailView(false);   // 返回：回到查詢結果原本的位置
  const dMenu = modalContent.querySelector('.detail-menu'), dPop = modalContent.querySelector('.detail-menu-pop');   // 新增：右上角三條線選單（與首頁相同：分類／分析／設定）
  if (dMenu && dPop) {
    const setOpen = on => { dPop.hidden = !on; dMenu.setAttribute('aria-expanded', on); };
    dMenu.onclick = e => { e.stopPropagation(); setOpen(dPop.hidden); };
    dPop.onclick = e => {
      const it = e.target.closest('button[data-act]'); if (!it) return;
      e.stopPropagation(); setOpen(false);
      const act = it.dataset.act;
      if (act === 'settings') settingsTrigger.click();            // 設定頁、分析頁都蓋在詳細頁上方（z-index 較高），直接代按即可
      else if (act === 'article') document.getElementById('articleTrigger').click();
      else if (act === 'cat') {                                   // 分類面板畫在首頁上、會被詳細頁蓋住，而且選了類別本來就要離開詳細頁：先回到首頁頂端，再打開面板
        if (window.closeDetailView) window.closeDetailView(true, true);   // 第二個參數：不要讓搜尋框取得焦點（避免跳出鍵盤）
        setTimeout(() => document.getElementById('catTrigger').click(), 200);   // 等遮罩移除、畫面穩定後再開
      }
    };
  }
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
  function closeDetail(toTop, noFocus) {   // 修改：新增 noFocus，回到頂端時可不聚焦搜尋框
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
      if (!noFocus) { searchInput.focus({ preventScroll: true }); searchInput.select(); }   // 修改：加上 noFocus 判斷

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
    const y = _listScrollY, idx = window._detailIdx;
    // 新增：若中途用「上一個／下一個」換過詞，返回時改回到「目前這一筆」所在的頁與位置，而不是一開始點開的那一筆
    const moved = typeof idx === 'number' && idx !== window._detailOpenIdx && !isExType(currentSearchType) && !isSpecialTab(currentSearchType);
    const go = () => {
      if (!moved) { window.scrollTo(0, y); return; }
      const page = Math.floor(idx / ITEMS_PER_PAGE) + 1;
      if (page !== _lastPage) { displayResults(filteredData, page); syncUrl('replace'); }   // 該筆在別的分頁：先換到那一頁
      const num = document.querySelector('#results .item-number[data-index="' + idx + '"]');
      const row = num && num.closest('tr');
      if (row) window.scrollTo(0, Math.max(0, row.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3));   // 放在畫面上方三分之一處
    };
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
w	一個漢字
y	一個音節（前有聲母、後有聲調或元音時縮減）
0	任意聲調
0+	完整八調（1 2 3 4 5 7 8），如 pa0+ ＝ pa1、pa2、pa3、pak4、pa5、pa7、pak8
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
【漢字位置範例】
^ww$	精確兩個漢字
^wwwww$	精確五個漢字
^天	天開頭
天$	天結尾
^天..$	天開頭的三字詞
^...天$	天結尾的四字詞
^..無.$	第三字為無的四字詞
【拼音範例】
y0	任意聲調的音節
pa0+	 pa 的完整八調：pa1、pa2、pa3、pap／pat／pak／pah4、pa5、pa7、pap／pat／pak／pah8
y3	第 3 調的音節
y2 y5	第 2、5 調兩音節
1y 2y 1y 2y	四個音節，第 1、3 相同，第 2、4 相同（ABAB）
1y 2y 2y	三個音節，第 2、3 相同，且與第 1 不同
tua7 y0 y0	三字詞，tua7 開頭
ya0	元音＋a（ia、ua）
pyay	結尾的 y 前面是元音：元音＋聲調，如 piau2、puai3
v0	母音＋任意聲調
Va0	聲母＋a
ym0	以 m 結尾的音節，如 am3、kam2、hiam1
yn0	以 n 結尾的音節，如 an5、kin2、tsin3
yng0	以 ng 結尾的音節，如 ing5、tong7、tshiong1
ynn0	以 nn 結尾的音節，如 inn7、tenn7、hainn3
yp0	以 p 結尾的音節，如 ap4、tsap8
yt0	以 t 結尾的音節，如 at4、kit4
yk0	以 k 結尾的音節，如 ik8、sik4
yh0	以 h 結尾的音節，如 ah4、beh4
tym0	以 t 開頭而 m 結尾的音節，如 tim5、tiam7，不含 thim7
kyp0	以 k 開頭而 p 結尾的音節，如 kip8、kiap4，不含 khip4
-yn0	無聲母而以 n 結尾的音節，如 in3、ian5
-yat0	無聲母而以 at 結尾的音節，如 iat4、uat8
y~m0	鼻音結尾
y~p0	入聲結尾
ym;	鼻音結尾的音節（m n ng nn），可加聲調數字
yp;	入聲結尾的音節（p t k h），可加聲調數字
ym;ng	結尾為 m 或 ng 的音節；-ym;ng 為無聲母，如 am3、ang5、im1、ing3
am;ng0	符合 am3、ang5（a 後接 m 或 ng）
py-	以 p 開頭，一個元音的音節，如 pa1、pe5、poo7
py+	以 p 開頭，一個或多個元音的音節，如 pa1、pai5、poo7，但不符合 pan5
yi;u	結尾為 i 或 u 的音節，可加聲調數字
ya;ah	結尾為 a 或 ah 的音節，可加聲調數字
-y	零聲母音節（無聲母，a1、im2、ng7 等）
-y -y	兩個零聲母音節
hu?e1	u 可有可無
?a	任一聲母（含零聲母）拼 a，只限第 1 調，如 pa、ka1、sa
?a3	任一聲母拼 a 第 3 調，如 pa3、ka3、sa3
?a0	任一聲母拼 a 任一調，如 pa1、ka3、tsa7
?y	仍同 y（? 只用在元音前）
+ai3	一定要有聲母（不含零聲母）拼 ai 第 3 調，如 pai3、kai3，不符合 ai3
+a0	一定要有聲母拼 a 任一調（不符合 a1）；+a 沒寫聲調只限第 1 調
+y	同 y，但一定要有聲母（不含零聲母）
si%	各聲調
~ ~ ~	三個音節
s~ b~ h~	s、b、h 開頭的三音節
~ bak8 ~	中間為 bak8
~<a1	聲母＋a1
ph~>	ph 開頭的所有韻
ai@	押 ai 韻
【聲母代號】
p;	唇音：p ph m b
t;	舌音：t th n l
ts;	齒音：ts tsh s j
k;	牙喉音：k kh g ng h
ph;	送氣音：ph th kh tsh
m;	鼻音聲母：m n ng
b;	b、g 組（同 b;g）
j;	j、l 組（同 j;l，如 jit8／lit8）
p;kh	聲母「或」：p 或 kh（只寫聲母沒有 y，就只代表聲母本身）
p;khy	聲母為 p 或 kh 的音節
【疊字範例】
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



  const EXACT_GROUPS = ['拼音範例', '疊字範例'];   // 點這兩組的符號時，自動勾選精確
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
    defaultOption.textContent = '組別';
    defaultOption.value = '';
    select.appendChild(defaultOption);

    Object.keys(groups).forEach(groupName => {
      const option = document.createElement('option');
      option.textContent = groupName;
      option.value = groupName;
      select.appendChild(option);
    });
    navigation.appendChild(select);

    // 新增：^開頭、結尾$ 勾選；兩個都勾時，旁邊顯示「＝精確」標記（不再有獨立的 ^精確$ 按鈕）
    const mkBox = (text, title, cls) => {   // 修改：多一個 cls 參數，讓開頭、結尾各自有專屬 class（上色用）
      const label = document.createElement('label');
      label.className = 'keyboard-exact' + (cls ? ' ' + cls : '');   // 修改：加上 cls
      label.title = title;
      const box = document.createElement('input');
      box.type = 'checkbox';
      label.appendChild(box);
      label.appendChild(document.createTextNode(text));
      label._title = title;   // 新增：記住原本的提示文字（正則模式時會暫時改掉）
      return { label, box };
    };
    const bStart = mkBox('^開頭', '作為開頭（加上 ^）', 'kb-start');   // 修改：加第三個參數
    const bEnd = mkBox('結尾$', '作為結尾（加上 $）', 'kb-end');   // 修改：加第三個參數
    const exactMark = document.createElement('span');
    exactMark.className = 'kb-exact-mark'; exactMark.textContent = '＝精確'; exactMark.title = '開頭＋結尾＝精確比對';
    const syncBoxes = () => {
      // 修改：不分模式，勾選狀態一律依框內有沒有開頭的 ^、結尾的 $ 決定（原本一般模式讀 localStorage 的永久設定）
      const x = SIMPLE.splitAnchors(searchInput.value.replace(/\s+/g, ' ').trim());
      const auto = _autoEx && !x.s && !x.e;   // 新增：自動精確時，兩個勾選與「＝精確」照樣亮起（雖然框內沒有 ^ $）
      const a = { start: x.s || auto, end: x.e || auto };   // 修改：加入 auto
      bStart.box.checked = a.start; bEnd.box.checked = a.end; exactMark.classList.toggle('on', a.start && a.end);
      [bStart, bEnd].forEach(b => { b.box.disabled = false; b.label.classList.remove('kb-disabled'); b.label.title = b.label._title; });
      // 修改：不再用紅點（exact-on），改以 ˅ 按鈕底色表示：只有開頭＝黃、只有結尾＝紅、兩者都有＝紫
      virtualKeyboardToggle.classList.toggle('anchor-start', a.start && !a.end);
      virtualKeyboardToggle.classList.toggle('anchor-end', a.end && !a.start);
      virtualKeyboardToggle.classList.toggle('anchor-both', a.start && a.end);
    };
    _syncAnchorBoxes = syncBoxes;   // 新增：讓 setRawRx 能刷新勾選狀態
    const applyAnchor = (start, end) => {
      _autoEx = false;   // 新增：手動勾選／取消 ^開頭、結尾$ 時，隱藏的自動精確轉成框內真正的 ^ $
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
    [bStart, bEnd].forEach(b => navigation.insertBefore(b.label, select));
    navigation.insertBefore(exactMark, select);
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
			if (EXACT_GROUPS.includes(groupName)) {   // 修改：用了拼音範例、疊字範例的符號，自動精確，但框內不再加 ^ $（改記在隱藏的 _autoEx；游標位置不用再調整）
			  const x = SIMPLE.splitAnchors(searchInput.value.replace(/\s+/g, ' ').trim());
			  if (!x.s && !x.e) { _autoEx = true; updateRxUI(); }   // 使用者自己打了 ^ 或 $ 就尊重框內，不另外加；updateRxUI 會刷新勾選
			}
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

  // 新增：特殊代號面板開著時，搜尋框與面板合成一個整體（同輸入提示的樣式，見 styles.css 的 kb-open）
  new MutationObserver(() => {
    const w = document.querySelector('.search-wrapper');
    const on = virtualKeyboard.style.display === 'block';   // 新增：on
    if (w) w.classList.toggle('kb-open', on);
    // 新增：特殊代號面板開著時，提示文字改成「烏衣行代號揣看覓...」（只有框內沒字時才看得到）；關閉後換回原本的提示
    if (on && !searchInput._phKb) { searchInput._phKb = true; searchInput._phNormal = searchInput.placeholder; searchInput.placeholder = '烏衣行代號揣看覓...'; }
    else if (!on && searchInput._phKb) { searchInput._phKb = false; searchInput.placeholder = searchInput._phNormal; }
  }).observe(virtualKeyboard, { attributes: true, attributeFilter: ['style'] });

  // 初始渲染鍵盤
  renderKeyboard();

  // 隱藏虛擬鍵盤的函數
  function hideVirtualKeyboard() {
    virtualKeyboard.style.display = 'none';
  }

  // 切換虛擬鍵盤的顯示/隱藏
  function toggleVirtualKeyboard() {
    const open = virtualKeyboard.style.display === 'none' || virtualKeyboard.style.display === '';
    virtualKeyboard.style.display = open ? 'block' : 'none';
    if (open) hideSearchHistory();   // 新增：開鍵盤面板時，收起輸入提示／查詢紀錄
    fitFloatingPanel(virtualKeyboard, 360);   // 新增：高度不超出視窗底部
  }
  virtualKeyboardToggle.title = '特殊代號輸入（Alt+K）';
  virtualKeyboardToggle.setAttribute('aria-label', '特殊代號輸入');
  virtualKeyboardToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleVirtualKeyboard();
  });
  // 新增：Alt+K 開關特殊代號面板（用 e.code，Mac 上 Option+K 會產生特殊字元，e.key 不準）
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyK') {
      e.preventDefault();
      toggleVirtualKeyboard();
      if (virtualKeyboard.style.display === 'block') searchInput.focus();
    }
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
  const def = { fs: 130, font: 'tauhu', lh: 'normal', ex: 'ruby', pw: 'normal', rom: 'full', so: 'han', mx: 'off', df: 'brief', tn: 'off', tnh: 'on', tne: 'on', tns: '12345789', vw: 'off', vwh: 'on', vwe: 'on', vc: 'red', rw: 'off', rq: 'off', rr: 'on', ri: 'off', nm: 'normal', cs: 'stripe', sc: 'off', scb: 'off', scd: 'end' };
  let a = { ...def };
  try { Object.assign(a, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  if (!['ruby', 'line', 'seg'].includes(a.ex)) a.ex = 'ruby';
  if (!DEF_MODES.includes(a.df)) a.df = 'brief';
  if (!['han', 'rom'].includes(a.so)) a.so = 'han';   // 新增：列表排序
  if (!ROM_MODES.includes(a.rom)) a.rom = 'full';   // 舊版的「單行」改為 RUBY
  ['tn', 'tnh', 'tne', 'vw', 'vwh', 'vwe', 'mx', 'rw', 'rq', 'rr', 'ri', 'sc', 'scb'].forEach(k => { if (a[k] !== 'on' && a[k] !== 'off') a[k] = def[k]; });
  { const SC_OPT = { scd: ['end', 'comma'] };   // 新增：分句標色的選項驗證
    Object.keys(SC_OPT).forEach(k => { a[k] = String(a[k]); if (!SC_OPT[k].includes(a[k])) a[k] = def[k]; }); }
  if (!['normal', 'tight'].includes(a.nm)) a.nm = 'normal';   // 手機版列表編號位置
  if (!['stripe', 'solid'].includes(a.cs)) a.cs = 'stripe';   // 新增：手機版卡片樣式（隔色卡片／單色卡片）
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
    document.querySelectorAll('#settingsPage .setting-row[data-sc]').forEach(r => {   // 新增：分句標色的細項，未啟用或不適用時變淡
      r.classList.toggle('sc-dim', a.sc !== 'on');
    });
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
    if (['tn', 'tnh', 'tne', 'vw', 'vwh', 'vwe'].includes(key) || key === 'rr' || key.indexOf('sc') === 0) refreshColorUI();   // 聲調色彩、音色：同時更新詳細頁與列表
  }));
  function setTones(str) { a.tns = str; sync(); save(); refreshColorUI(); }
  tnChips.forEach(c => c.addEventListener('click', () => {   // 點選聲調：加入／取消
    const t = c.dataset.t;
    setTones(a.tns.includes(t) ? a.tns.replace(t, '') : [...a.tns, t].sort().join(''));
  }));
  window.setVowelOn = v => { a.vw = v ? 'on' : 'off'; sync(); save(); refreshColorUI(); };   // 詳細頁的「音色」開關：與設定同步
  window.setRqOn = v => { a.rq = v ? 'on' : 'off'; sync(); save(); hideRelPop(); refreshColorUI(); };   // 詳細頁的「例句語詞查詢」開關：與設定同步
  window.setRwOn = v => { a.rw = v ? 'on' : 'off'; sync(); save(); hideRelPop(); refreshColorUI(); };   // 詳細頁的「近反義顯示」開關：與設定同步
  window.setScOn = v => { a.sc = v ? 'on' : 'off'; sync(); save(); refreshColorUI(); };   // 詳細頁的「句色」開關：與設定同步
  window.setToneOn = v => { a.tn = v ? 'on' : 'off'; sync(); save(); refreshColorUI(); };   // 詳細頁的「聲調色彩」開關：與設定同步
  document.querySelectorAll('.js-reset-appearance').forEach(btn => btn.addEventListener('click', () => {   // 桌面（側邊欄）與手機（內容底部）各一顆
    holoConfirm('重設外觀設定', '所有外觀設定（字體、顏色、顯示方式等）都會恢復成預設值。', '重設').then(ok => {
      if (!ok) return;
      a = { ...def }; sync(); save();
      refreshColorUI();   // 含列表與詳細頁
    });
  }));
  function rerunSearch() {   // 新增：「混拼符合」顯示與否改變後，重新查詢（含詳細頁的側邊清單）
    if (!searchInput.value.trim() || currentSearchType === COMPARE_TAB) return;
    performSearch();
    if (window._sbRefresh) window._sbRefresh();
  }
  function resortList() {   // 新增：排序設定改變後，重新排序並回到第 1 頁
    if (!filteredData.length || currentSearchType === COMPARE_TAB) return;
    sortFilteredData(searchTermReplace(searchInput.value.trim()));   // 修改：同上，先轉成正則字串再排序
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
  const HINT = '揣漢字、音讀、華語釋義...', DELAY = 4000;   // 修改：台羅→音讀、⋯⋯→三個點
  let done = false, timer = 0;
  const setPh = v => { if (box._phKb) box._phNormal = v; else box.placeholder = v; };   // 新增：特殊代號面板開著時，只記下來，等面板關閉再換上
  const swap = animate => {
    if (done) return; done = true; clearTimeout(timer);
    if (!animate) { setPh(HINT); return; }   // 修改：box.placeholder = HINT → setPh(HINT)
    box.classList.add('ph-fade');                                   // 淡出
    setTimeout(() => { setPh(HINT); box.classList.remove('ph-fade'); }, 350);   // 修改：同上
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


// ======== 詳細頁右上角選單：點外面或按 Esc 就關閉 ========
(function () {
  const closeAll = () => document.querySelectorAll('.detail-menu-pop:not([hidden])').forEach(p => {
    p.hidden = true; const b = p.parentNode.querySelector('.detail-menu'); if (b) b.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', e => { if (!e.target.closest('.detail-menu, .detail-menu-pop')) closeAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
})();

// ======== 詳細頁：調色／音色／句色／例句 收在一個「顯示」按鈕裡 ========
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.tools-m-btn');
  document.querySelectorAll('.tools-m-pop').forEach(pop => {
    const mine = btn && pop.parentNode === btn.parentNode;
    if (mine) { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', !pop.hidden); }
    else if (!pop.contains(e.target)) { pop.hidden = true; const b = pop.parentNode.querySelector('.tools-m-btn'); if (b) b.setAttribute('aria-expanded', 'false'); }
  });
});


// ======== 自訂確認視窗：holoConfirm(標題, 說明, 確定鈕文字) → Promise<boolean>；點背景、按 Esc、按「取消」都算取消 ========
function holoConfirm(title, text, okText) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'hc-overlay';
    ov.innerHTML = `<div class="hc-box" role="alertdialog" aria-modal="true" aria-labelledby="hcTitle" aria-describedby="hcText">
      <div class="hc-title" id="hcTitle"></div><div class="hc-text" id="hcText"></div>
      <div class="hc-btns"><button type="button" class="hc-cancel">取消</button><button type="button" class="hc-ok"></button></div></div>`;
    ov.querySelector('.hc-title').textContent = title;
    ov.querySelector('.hc-text').textContent = text;
    ov.querySelector('.hc-ok').textContent = okText || '確定';
    const done = v => {
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Tab') {   // 焦點只在兩顆按鈕之間循環
        const bs = ov.querySelectorAll('button'), f = bs[0], l = bs[bs.length - 1];
        if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); }
        else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    };
    ov.addEventListener('click', e => { if (e.target === ov) done(false); });
    ov.querySelector('.hc-cancel').addEventListener('click', () => done(false));
    ov.querySelector('.hc-ok').addEventListener('click', () => done(true));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    ov.querySelector('.hc-cancel').focus();   // 預設停在「取消」，避免誤按 Enter 就重設
  });
}


// ======== 首頁狀態（輸入框是空的、也沒有結果）：手機版版面下移、隱藏搜尋類型分頁（見 styles.css 的 html.is-home）========
(function () {
  const update = () => {
    const hasRes = searchHeader.classList.contains('has-results');
    document.documentElement.classList.toggle('is-home', !searchInput.value.trim() && !hasRes);
    document.documentElement.classList.toggle('no-tabs', !hasRes);   // 新增：還沒有查詢結果前（含打字中），不顯示搜尋類型分頁
  };
  searchInput.addEventListener('input', update);
  new MutationObserver(update).observe(searchHeader, { attributes: true, attributeFilter: ['class'] });
  update();
})();


// ======== 手機版：點進搜尋框＝進入「搜尋模式」（搜尋框與介面放到最大，下面是查詢紀錄，左側有返回鍵，像 Gmail）========
(function () {
  const mq = window.matchMedia('(max-width: 768px)');
  const root = document.documentElement, kb = document.getElementById('virtualKeyboard'), back = document.getElementById('searchBack');
  const kbOpen = () => !!kb && kb.style.display === 'block';
  const sc = document.getElementById('searchContainer');
  const setTop = () => { if (root.classList.contains('search-active') && sc) root.style.setProperty('--sa-top', Math.ceil(sc.getBoundingClientRect().bottom) + 'px'); };   // 下方面板從搜尋列的實際底部開始，不壓到搜尋框
  const update = () => { root.classList.toggle('search-active', mq.matches && (document.activeElement === searchInput || kbOpen())); setTop(); requestAnimationFrame(setTop); setTimeout(setTop, 350); };   // 新增：搜尋列有 0.3 秒的版面動畫，動畫結束後再量一次，面板才不會蓋到搜尋框
  window.addEventListener('resize', setTop);
  const exit = () => { if (document.activeElement === searchInput) searchInput.blur(); if (kb) kb.style.display = 'none'; hideSearchHistory(); setTimeout(update, 0); };
  searchInput.addEventListener('focus', update);
  searchInput.addEventListener('blur', () => setTimeout(update, 200));   // 稍等一下：點查詢紀錄、虛擬鍵盤時不要誤退出
  if (kb) new MutationObserver(update).observe(kb, { attributes: true, attributeFilter: ['style'] });
  if (back) back.addEventListener('click', exit);
  searchButton.addEventListener('click', () => { if (mq.matches) exit(); });
  searchInput.addEventListener('keypress', e => { if (e.key === 'Enter' && mq.matches) exit(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('search-active')) exit(); });
  document.addEventListener('click', e => { if (mq.matches && e.target.closest && e.target.closest('.hist-item') && !e.target.closest('.hist-del, .sg-fill')) exit(); });   // 點某筆查詢紀錄 → 查詢並回到結果畫面
  const wrap = document.querySelector('.search-wrapper');   // 點清除、虛擬鍵盤、正則等按鈕時，不讓搜尋框失去焦點（否則會誤退出搜尋模式）
  if (wrap) wrap.addEventListener('mousedown', e => { if (mq.matches && e.target.closest('button, .search-clear, .search-icon') && !e.target.closest('.search-history')) e.preventDefault(); });
  mq.addEventListener && mq.addEventListener('change', update);
})();
