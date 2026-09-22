
// ================= 2. DOM 元素 =================
const menuBtn = document.getElementById('menuBtn');
const headerRight = document.getElementById('headerRight');
const searchWrapper = document.getElementById('searchWrapper');
const searchIconBtn = document.getElementById('searchIconBtn');
const searchInput = document.getElementById('searchInput');

const toggleRubyBtn = document.getElementById('toggleRubyBtn');
const fontSizeControls = document.getElementById('fontSizeControls');

const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const sidebarList = document.getElementById('sidebarList');
const logo = document.getElementById('logo');

const homeBanner = document.getElementById('homeBanner');
const homeView = document.getElementById('homeView');
const articleView = document.getElementById('articleView');
const infoView = document.getElementById('infoView');
const directoryGrid = document.getElementById('directoryGrid');
const articleCards = document.getElementById('articleCards'); 
const searchResults = document.getElementById('searchResults');

const articleTitle = document.getElementById('articleTitle');
const articleLevel = document.getElementById('articleLevel');
const articleImage = document.getElementById('articleImage'); 
const articleContent = document.getElementById('articleContent');
const articleVocab = document.getElementById('articleVocab');

const audioVoice = document.getElementById('audioVoice');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const progressBar = document.getElementById('progressBar');

function setProgress(percent) {
    const p = Number(percent) || 0;
    progressBar.value = p;
    progressBar.style.setProperty('--progress', p + '%');
}

const sentenceDataMap = new Map();

let sentenceOrder = [];  
const sentenceElementsMap = new Map();
let lastReadingLabel = null; 
let currentPlaybackIndex = null;

const toggleViewModeBtn = document.getElementById('toggleViewModeBtn');
let isSentenceMode = false;

let currentFontSize = 18;
let currentRubyMode = 0; // 0: 字音, 1: 漢字, 2: 拼音
const rubyModes = ['字音', '漢字', '拼音'];
let isPlaying = false;

toggleRubyBtn.classList.add('active'); 
toggleRubyBtn.textContent = '字音'; // 初始化按鈕文字

const toggleLangBtn = document.getElementById('toggleLangBtn');
let isTranslateMode = false; // false = 客語, true = 華語
let currentArticleData = null;



// ================= 3. 畫面與側邊欄初始化 =================
function initUI() {
    articleCards.innerHTML = ''; 
    sidebarList.innerHTML = '';
    
    articlesData.forEach((article, index) => {
        const numberStr = String(index + 1).padStart(2, '0');
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-number">${numberStr}</div>
                          <div class="card-icon">${article.icon}</div>
                          <div class="card-title">${article.title}</div>`;
        card.addEventListener('click', () => loadArticle(article.id));
        articleCards.appendChild(card); 

        const li = document.createElement('li');
        li.innerHTML = `<span class="material-icons" style="font-size:18px; color:#4DB6AC;">article</span> ${article.title}`;
        li.addEventListener('click', () => {
            loadArticle(article.id);
            closeSidebar();
        });
        sidebarList.appendChild(li);
    });
}
initUI();

function updateHeaderHeightVar() {
    const h = document.querySelector('.main-header').offsetHeight;
    document.documentElement.style.setProperty('--header-height', h + 'px');
}
updateHeaderHeightVar();
window.addEventListener('resize', updateHeaderHeightVar);

const mainHeader = document.querySelector('.main-header');
const headerArticleTitle = document.getElementById('headerArticleTitle');

function setHeaderTitleMode(showArticle) {
    if (mainHeader.classList.contains('show-article-title') === showArticle) return;
    if (showArticle) headerArticleTitle.textContent = articleTitle.textContent;
    mainHeader.classList.toggle('show-article-title', showArticle);
}

function updateHeaderTitle() {
    headerTitleTicking = false;
    if (articleView.style.display === 'none') { setHeaderTitleMode(false); return; }
    const hidden = articleTitle.getBoundingClientRect().bottom <= mainHeader.offsetHeight;
    setHeaderTitleMode(hidden);
}

let headerTitleTicking = false;
window.addEventListener('scroll', () => {
    if (headerTitleTicking) return;
    headerTitleTicking = true;
    requestAnimationFrame(updateHeaderTitle);
}, { passive: true });

headerArticleTitle.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});











// ================= 4. UI 互動與導覽邏輯 =================


// ================= 語言切換 (客語 / 華語) =================
function applyLangMode(translateMode) {
    isTranslateMode = translateMode;
    const targetLang = isTranslateMode ? 'mandarin' : 'hakka';

    if (isTranslateMode) {
        toggleLangBtn.textContent = '華語';
        toggleLangBtn.classList.remove('active');
        toggleRubyBtn.classList.add('disabled');
    } else {
        toggleLangBtn.textContent = '客語';
        toggleLangBtn.classList.add('active');
        toggleRubyBtn.classList.remove('disabled');
    }

    document.querySelectorAll('.sentence-block').forEach(block => {
        const label = block.getAttribute('data-label');
        const data = sentenceDataMap.get(label);
        if (data) {
            data.current = targetLang;
            const textSpan = block.querySelector('.sentence-text');
            if (textSpan) textSpan.innerHTML = data[targetLang];
            if (isTranslateMode) {
                block.classList.remove('is-translated');
            }
        }
    });

    const keyword = searchInput.value.trim();
    if (keyword) highlightArticle(articleContent, keyword);
}

toggleLangBtn.addEventListener('click', function() {
    applyLangMode(!isTranslateMode);
    syncStateToUrl();
});





articleTitle.addEventListener('click', () => {
    audioVoice.pause();
    isPlaying = false;
    playIcon.textContent = 'play_arrow';
    audioVoice.currentTime = 0;
    setProgress(0);

    if (currentSentencePlaying) stopSentencePlayback();

    clearReadingHighlight();
    currentPlaybackIndex = null;

    syncStateToUrl();
});

function openSidebar() { 
    sidebar.classList.add('open'); 
    sidebarOverlay.style.display = 'block'; 
    document.body.style.overflow = 'hidden'; 
    sidebarList.scrollTop = 0; 
}

function closeSidebar() { 
    sidebar.classList.remove('open'); 
    sidebarOverlay.style.display = 'none'; 
    document.body.style.overflow = ''; 
}

menuBtn.addEventListener('click', openSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

function hideAllViews() {
    homeView.style.display = 'none';
    articleView.style.display = 'none';
    infoView.style.display = 'none';
    setHeaderTitleMode(false);

    audioVoice.pause();
    isPlaying = false; playIcon.textContent = 'play_arrow';

    if (currentSentencePlaying) {
        if (currentSentencePlaying.btnEl) {
            currentSentencePlaying.btnEl.textContent = '▶';
            currentSentencePlaying.btnEl.classList.remove('playing');
        }
        currentSentencePlaying = null;
    }

    clearReadingHighlight();
}


logo.addEventListener('click', () => {
    closeSearch();
    searchResults.innerHTML = ''; directoryGrid.style.display = 'grid'; 
    showHome();
});

const INFO_PAGES = ['preface', 'zixu', 'author'];

function showInfoPage(page, pushHistory = true) {
    if (!INFO_PAGES.includes(page)) page = 'preface';

    hideAllViews(); 
    homeBanner.style.display = 'none';
    infoView.style.display = 'block';
    infoView.querySelectorAll('.info-page').forEach(sec => {
        sec.hidden = (sec.dataset.page !== page);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (pushHistory) {
        const newUrl = window.location.pathname + '?view=' + page;
        window.history.pushState({ view: page }, '', newUrl);
    }
}

document.addEventListener('click', (e) => {
    const infoTrigger = e.target.closest('[data-info]');
    if (infoTrigger) {
        closeSidebar();
        showInfoPage(infoTrigger.dataset.info);
        return;
    }
    if (e.target.closest('.info-back-btn')) {
        backBtn.click(); 
    }
});

function showHome() {
    hideAllViews();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    homeBanner.style.display = 'block'; 
    homeView.style.display = 'block';
    
    window.history.pushState(null, '', window.location.pathname);
}

backBtn.addEventListener('click', () => {
    hideAllViews();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    homeView.style.display = 'block';
    
    window.history.pushState(null, '', window.location.pathname);
    
    if (searchInput.value.trim() !== '') {
        homeBanner.style.display = 'none';
        directoryGrid.style.display = 'none';
        searchResults.style.display = 'block';
    } else {
        homeBanner.style.display = 'block';
        directoryGrid.style.display = 'grid';
        searchResults.style.display = 'none';
    }
});

function closeSearch() {
    searchInput.classList.remove('active');
    headerRight.classList.remove('searching'); 
    searchInput.value = '';
}

searchIconBtn.addEventListener('click', (e) => {
    e.stopPropagation(); 
    const isActive = searchInput.classList.contains('active');
    if (!isActive) {
        searchInput.classList.add('active');
        headerRight.classList.add('searching'); 
        searchInput.focus();
    } else if (searchInput.value.trim() !== '') {
        performSearch(searchInput.value.trim());
    } else {
        closeSearch();
    }
});

searchInput.addEventListener('click', (e) => e.stopPropagation());
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim() !== '') performSearch(searchInput.value.trim());
});

// ================= 點擊外部的智慧處理 =================
document.addEventListener('click', (e) => {
    if (searchInput.classList.contains('active') && !headerRight.contains(e.target)) {
        
        if (searchInput.value.trim() === '') {
            closeSearch();
        } else {
            searchInput.blur();
        }
    }
});

function normalizeToneMarks(text) {
    if (!text) return '';
    return text
        .replace(/\s*\u0301/g, 'ˊ') 
        .replace(/\s*\u030C/g, 'ˇ') 
        .replace(/\s*\u0300/g, 'ˋ'); 
}

// ================= 5. 載入文章與進階解析邏輯 =================
function loadArticle(id, pushHistory = true) {
    const article = articlesData.find(a => a.id === id);
    if (!article) return;

    if (pushHistory) {
        const newUrl = window.location.pathname + '?id=' + id;
        window.history.pushState({ articleId: id }, '', newUrl);
    }
    currentArticleData = article;
    isTranslateMode = false;
    toggleLangBtn.textContent = '客語';
    toggleLangBtn.classList.add('active');
    toggleRubyBtn.classList.remove('disabled');
    currentPlaybackIndex = null;
    


    if (article.translate && article.translate.trim() !== '') {
        toggleLangBtn.style.display = 'block';
    } else {
        toggleLangBtn.style.display = 'none';
    }

    articleTitle.textContent = article.title;
    articleLevel.textContent = article.level;
    
    if (article.image) {
        articleImage.src = article.image; articleImage.style.display = 'block';
    } else {
        articleImage.style.display = 'none';
    }

    articleContent.innerHTML = parseTextToRuby(article.content, article.translate);

    sentenceElementsMap.clear();
    articleContent.querySelectorAll('.sentence-block').forEach(el => {
        sentenceElementsMap.set(el.getAttribute('data-label'), el);
    });
    lastReadingLabel = null;
    
    const keyword = searchInput.value.trim();
    if (keyword) {
        highlightArticle(articleContent, keyword);
    }
    
    articleVocab.innerHTML = article.vocab.map(v => `<li>${v}</li>`).join('');
    audioVoice.src = article.audioVoice; setProgress(0);
    loadSrtForArticle(article);
    syncStateToUrl();

    hideAllViews();
    homeBanner.style.display = 'none';
    articleView.style.display = 'block';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 單一句子解析輔助函式
function parseSingleSentence(sentence) {
    if (!sentence) return '';
    const rubyRegex = /([^\(\s，。、！？；：「」『』．―─【】《》〈〉·,.\?!]+)\(([^)]+)\)/g;
    let sentHTML = sentence.replace(rubyRegex, function(match, char, pinyin) {
        let normalizedPinyin = normalizeToneMarks(pinyin);
        return `<ruby><rb>${char}</rb><rt>${normalizedPinyin}</rt></ruby>`;
    });
    return sentHTML.replace(/<\/ruby>\s+<ruby>/g, '</ruby><ruby>');
}

// ================= 智慧斷句輔助函式 =================
function splitIntoSentences(para) {
    if (!para) return [];
    let sentences = [];
    let current = '';
    let inBrackets = false;

    for (let i = 0; i < para.length; i++) {
        let char = para[i];
        current += char;

        if (char === '[') inBrackets = true;
        if (char === ']') inBrackets = false;

        if (!inBrackets && /[，。：；！？、．―─「」【】『』《》〈〉·?!.,]/.test(char)) {
            let isDecimal = false;
            // 保護數學符號 1.3 或千位符號 1,000
            if ((char === '.' || char === ',') && i > 0 && i < para.length - 1) {
                if (/\d/.test(para[i-1]) && /\d/.test(para[i+1])) {
                    isDecimal = true;
                }
            }

            if (!isDecimal) {
                // 貪婪吸收後續連著的標點或空白，確保 ？」 或 ：「 不會被拆開
                while (i + 1 < para.length && /[，。：；！？、．―─「」【】『』《》〈〉·"”'’?!.,\s]/.test(para[i+1])) {
                    let nextChar = para[i+1];
                    if (nextChar === '[') break; 
                    if ((nextChar === '.' || nextChar === ',') && /\d/.test(para[i]) && i + 2 < para.length && /\d/.test(para[i+2])) {
                        break;
                    }
                    current += nextChar;
                    i++;
                }

                if (current.trim()) {
                    if (!/^[\p{P}\p{S}\s]+$/u.test(current)) {
                        sentences.push(current.trim());
                        current = '';
                    }
                }
            }
        }
    }

    if (current.trim()) {
        if (/^[\p{P}\p{S}\s]+$/u.test(current) && sentences.length > 0) {
            sentences[sentences.length - 1] += current.trim();
        } else {
            sentences.push(current.trim());
        }
    }
    if (sentences.length === 0) sentences = [para];
    
    return sentences;
}

function parseTextToRuby(rawText, rawTranslateText = '') {
    sentenceDataMap.clear();
    sentenceOrder = [];

    // 1. 強制將純文字的 \n 替換為真實的換行符號
    const processedRawText = rawText.replace(/\\n/g, '\n');
    const processedTransText = rawTranslateText ? rawTranslateText.replace(/\\n/g, '\n') : '';

    const rawParagraphs = processedRawText.split(/\r?\n/).filter(p => p.trim() !== '');
    const transParagraphs = processedTransText ? processedTransText.split(/\r?\n/).filter(p => p.trim() !== '') : [];

    // 全篇文章「跨段落」的句子流水序號 (0 起算)，用來對應 srt 字幕檔的逐句順序
    let globalSentenceIndex = 0;

    const paragraphsHTML = rawParagraphs.map((para, paraIndex) => {
        const paraLetter = String.fromCharCode(65 + paraIndex); 
        
        const sentences = splitIntoSentences(para);
        const transSentences = transParagraphs[paraIndex] ? splitIntoSentences(transParagraphs[paraIndex]) : [];
        
        const sentencesHTML = sentences.map((sentence, sentIndex) => {
            const sentNumber = String(sentIndex + 1).padStart(2, '0');
            const label = `${paraLetter}${sentNumber}`; 
            
            const hakkaHTML = parseSingleSentence(sentence);
            const mandarinHTML = transSentences[sentIndex] ? parseSingleSentence(transSentences[sentIndex]) : hakkaHTML;
            
            // 將結果存入記憶體地圖中
            sentenceDataMap.set(label, {
                hakka: hakkaHTML,
                mandarin: mandarinHTML,
                current: 'hakka', // 預設顯示客語
                srtIndex: globalSentenceIndex
            });
            globalSentenceIndex++;
            sentenceOrder.push(label);
            
            return `<span class="sentence-block" data-label="${label}"><span class="sentence-play-btn" data-label="${label}">▶</span><span class="sentence-text">${hakkaHTML}</span></span>`;
        }).join('');
        
        return `<p>${sentencesHTML}</p>`;
    });
    
    return paragraphsHTML.join('');
}

// ================= 字幕檔 (srt) 解析與逐句播放 =================

// 將 "00:00:04,510" 這種 srt 時間格式轉換成秒數
function srtTimeToSeconds(t) {
    const [hms, ms] = t.trim().split(',');
    const parts = hms.split(':').map(Number);
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s + (Number(ms || 0) / 1000);
}

function timingStart(t) {
    return Array.isArray(t) ? t[0] : t.start;
}
function timingEnd(t) {
    return Array.isArray(t) ? t[1] : t.end;
}

function parseSRT(text) {
    const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).filter(b => b.trim() !== '');
    const times = [];
    blocks.forEach(block => {
        const lines = block.split('\n').filter(l => l.trim() !== '');
        const timeLine = lines.find(l => l.includes('-->'));
        if (!timeLine) return;
        const [startStr, endStr] = timeLine.split('-->');
        times.push({ start: srtTimeToSeconds(startStr), end: srtTimeToSeconds(endStr) });
    });
    return times;
}

function getArticleNumberFromAudioPath(article) {
    if (!article || !article.audioVoice) return null;
    const match = article.audioVoice.match(/(\d+)\.mp3$/i);
    return match ? match[1] : null;
}

function getSrtPathForArticle(article) {
    if (!article || !article.audioVoice) return null;
    return article.audioVoice.replace('audio/', 'srt/').replace(/\.mp3$/i, '.srt');
}

let currentSrtTimes = [];
let srtLoadToken = 0;
let currentSentencePlaying = null; // { label, endTime, btnEl }

// 確保音檔已經載入到可以設定 currentTime 的狀態（readyState >= 1 = HAVE_METADATA）
// 如果 src 剛換過、瀏覽器還沒讀完 metadata，直接設定 currentTime 常會被瀏覽器忽略，
// 導致「跳到指定時間點播放」失敗、變成從頭（或上次的位置）開始播，也就是開頭時間不準確的原因。
function whenAudioReady(callback) {
    if (audioVoice.readyState >= 1) {
        callback();
    } else {
        const onReady = () => {
            audioVoice.removeEventListener('loadedmetadata', onReady);
            callback();
        };
        audioVoice.addEventListener('loadedmetadata', onReady);
    }
}

// 載入目前文章對應的 srt 字幕時間
function loadSrtForArticle(article) {
    currentSrtTimes = [];
    const num = getArticleNumberFromAudioPath(article);

    if (typeof srtTimesData !== 'undefined' && num && srtTimesData[num]) {
        currentSrtTimes = srtTimesData[num];
        return;
    }

    const path = getSrtPathForArticle(article);
    if (!path) return;
    const token = ++srtLoadToken;
    fetch(path)
        .then(res => { if (!res.ok) throw new Error('srt not found'); return res.text(); })
        .then(text => {
            if (token !== srtLoadToken) return;
            currentSrtTimes = parseSRT(text);
        })
        .catch(() => {
            if (token === srtLoadToken) currentSrtTimes = [];
        });
}

function stopSentencePlayback() {
    if (!currentSentencePlaying) return;
    if (currentSentencePlaying.btnEl) {
        currentSentencePlaying.btnEl.textContent = '▶';
        currentSentencePlaying.btnEl.classList.remove('playing');
    }
    currentSentencePlaying = null;
    audioVoice.pause();
    isPlaying = false;
    playIcon.textContent = 'play_arrow';
}

function playSentence(label, btnEl) {
    const data = sentenceDataMap.get(label);
    if (!data || data.srtIndex === undefined) return;
    const timing = currentSrtTimes[data.srtIndex];
    if (!timing) return;


    if (currentSentencePlaying && currentSentencePlaying.label === label) {
        stopSentencePlayback();
        return;
    }

    if (currentSentencePlaying) stopSentencePlayback();

    btnEl.textContent = '■';
    btnEl.classList.add('playing');
    currentSentencePlaying = { label, endTime: timingEnd(timing), btnEl };

    currentPlaybackIndex = data.srtIndex;
    syncStateToUrl();

    whenAudioReady(() => {
        // 等待期間如果使用者已經切換播放別句，就不要再執行這個過期的播放請求
        if (!currentSentencePlaying || currentSentencePlaying.label !== label) return;
        audioVoice.currentTime = timingStart(timing);
        audioVoice.play();
        isPlaying = true;
        playIcon.textContent = 'pause';
        sentenceEndWatch();
    });
}

// 用 requestAnimationFrame 逐格檢查是否到達句子結尾時間，
// 精確度遠高於 timeupdate（瀏覽器對 timeupdate 的觸發頻率通常較低、間隔不固定，
// 常常會「超過」設定的結尾時間才觸發，造成結尾時間不準確）。
function sentenceEndWatch() {
    if (!currentSentencePlaying) return;
    if (audioVoice.currentTime >= currentSentencePlaying.endTime) {
        stopSentencePlayback();
        return;
    }
    requestAnimationFrame(sentenceEndWatch);
}

// ================= 段落模式：跟讀底線 =================
function updateReadingHighlight(currentTime) {
    if (!currentSrtTimes.length || !sentenceOrder.length) return;

    let lo = 0, hi = currentSrtTimes.length - 1, idx = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (timingStart(currentSrtTimes[mid]) <= currentTime) {
            idx = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    if (idx === -1) {
        clearReadingHighlight();
        return;
    }

    const label = sentenceOrder[idx];
    if (label === lastReadingLabel) return; 

    clearReadingHighlight();
    const el = sentenceElementsMap.get(label);
    if (el) {
        el.classList.add('reading-now');
        lastReadingLabel = label;
        scrollSentenceIntoViewIfNeeded(el); 
    }

    currentPlaybackIndex = idx;
    syncStateToUrl();
}

function scrollSentenceIntoViewIfNeeded(el) {
    const rect = el.getBoundingClientRect();

    const headerEl = document.querySelector('.main-header');
    const toolsEl = document.querySelector('.article-tools');
    const topOffset = (headerEl ? headerEl.offsetHeight : 0) + (toolsEl ? toolsEl.offsetHeight : 0);

    const visibleBottom = window.innerHeight;

    if (rect.top >= topOffset && rect.bottom <= visibleBottom) return;

    const targetScrollY = window.scrollY + rect.top - topOffset - 12;
    window.scrollTo({ top: Math.max(targetScrollY, 0), behavior: 'smooth' });
}

function clearReadingHighlight() {
    if (!lastReadingLabel) return;
    const prevEl = sentenceElementsMap.get(lastReadingLabel);
    if (prevEl) prevEl.classList.remove('reading-now');
    lastReadingLabel = null;
}


function getPureText(rawText) { 
    return rawText.replace(/\([^)]+\)/g, '').replace(/\s+/g, ''); 
}


function highlightArticle(container, keyword) {
    if (!keyword) return;
    
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.parentNode.tagName.toLowerCase() === 'rt') continue;
        if (node.parentNode.classList.contains('ruby-space')) continue;
        if (node.parentNode.classList.contains('sentence-play-btn')) continue;
        textNodes.push(node);
    }
    
    let pureText = '';
    let charMap = [];
    
    for (let i = 0; i < textNodes.length; i++) {
        let text = textNodes[i].nodeValue;
        for (let j = 0; j < text.length; j++) {
            if (!/\s/.test(text[j])) { 
                pureText += text[j];
                charMap.push({ node: textNodes[i], index: j });
            }
        }
    }
    
    let matches = [];
    let matchIndex = pureText.indexOf(keyword);
    while (matchIndex !== -1) {
        matches.push(matchIndex);
        matchIndex = pureText.indexOf(keyword, matchIndex + keyword.length);
    }
    
    for (let i = matches.length - 1; i >= 0; i--) {
        let start = matches[i];
        let end = start + keyword.length - 1;
        
        for (let k = end; k >= start; k--) {
            let mapData = charMap[k];
            let textNode = mapData.node;
            let offset = mapData.index;
            
            if (offset + 1 < textNode.nodeValue.length) {
                textNode.splitText(offset + 1);
            }
            let charNode = textNode.splitText(offset);
            
            let mark = document.createElement('mark');
            charNode.parentNode.insertBefore(mark, charNode);
            mark.appendChild(charNode);
        }
    }
}



// ================= 6. 功能切換 =================
function performSearch(keyword) {
    hideAllViews(); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
    homeBanner.style.display = 'none'; 
    homeView.style.display = 'block'; 
    directoryGrid.style.display = 'none';
    
    searchResults.style.display = 'block'; 
    
    let resultsHTML = '';
    
    articlesData.forEach(article => {
        const pureText = getPureText(article.content);
        let matchIndex = pureText.indexOf(keyword);
        
        if (matchIndex >= 0) {
            let snippetsHTML = '';
            let lastSearchIndex = 0;
            while (matchIndex !== -1) {
                let startIndex = Math.max(0, matchIndex - 15);
                let endIndex = Math.min(pureText.length, matchIndex + keyword.length + 15);
                
                if (startIndex > 0 && 
                    pureText.charCodeAt(startIndex) >= 0xDC00 && 
                    pureText.charCodeAt(startIndex) <= 0xDFFF) {
                    startIndex--;
                }
                
                if (endIndex < pureText.length && 
                    pureText.charCodeAt(endIndex - 1) >= 0xD800 && 
                    pureText.charCodeAt(endIndex - 1) <= 0xDBFF) {
                    endIndex++;
                }
                // =========================================================

                let snippet = pureText.substring(startIndex, endIndex);
                
                if (startIndex > 0) snippet = '...' + snippet;
                if (endIndex < pureText.length) snippet = snippet + '...';
                
                const highlightedSnippet = snippet.split(keyword).join(`<mark>${keyword}</mark>`);
                
                snippetsHTML += `<div style="margin-top: 10px; font-size: 0.95rem; color: #555; line-height: 1.6;">
                                    ${highlightedSnippet}
                                 </div>`;
                
                lastSearchIndex = matchIndex + keyword.length;
                matchIndex = pureText.indexOf(keyword, lastSearchIndex);
            }
            
            resultsHTML += `
                <div class="result-item" data-id="${article.id}" style="background:white; padding:15px 20px; border-radius:8px; margin-bottom:15px; border:1px solid #EBEBEB; cursor:pointer; transition: box-shadow 0.2s;">
                    <div class="result-title" style="color:var(--primary-color); font-weight:bold; font-size: 1.1rem; margin-bottom:5px; border-bottom: 1px dashed #DDD; padding-bottom: 8px;">
                        <span class="material-icons" style="font-size: 1.1rem; vertical-align: text-bottom; margin-right: 4px;">article</span>${article.title}
                    </div>
                    <div>${snippetsHTML}</div>
                </div>`;
        }
    });
    
    searchResults.innerHTML = resultsHTML || '<p style="padding: 20px; text-align:center;">找不到符合的結果哦！</p>';
    
    document.querySelectorAll('.result-item').forEach(item => {
        item.addEventListener('click', function() {
            loadArticle(this.getAttribute('data-id'));
            searchInput.blur(); 
        });
    });
}


// ================= 檢視模式切換 (段落 / 斷句) =================
function applyViewMode(sentenceMode) {
    isSentenceMode = sentenceMode;
    if (isSentenceMode) {
        articleContent.classList.add('mode-sentence');
        toggleViewModeBtn.textContent = '斷句';
        toggleViewModeBtn.classList.remove('active');
    } else {
        articleContent.classList.remove('mode-sentence');
        toggleViewModeBtn.textContent = '段落';
        toggleViewModeBtn.classList.add('active');
    }
}

function scrollToArticleTop() {
    const articleHeaderEl = document.querySelector('#articleView .article-header');
    if (!articleHeaderEl) return;

    const headerEl = document.querySelector('.main-header');
    const topOffset = headerEl ? headerEl.offsetHeight : 0;

    const rect = articleHeaderEl.getBoundingClientRect();
    const targetScrollY = window.scrollY + rect.top - topOffset;
    window.scrollTo({ top: Math.max(targetScrollY, 0), behavior: 'smooth' });
}

toggleViewModeBtn.addEventListener('click', function() {
    applyViewMode(!isSentenceMode);
    scrollToArticleTop();
    syncStateToUrl();
});

function applyRubyMode(mode) {
    currentRubyMode = mode;
    toggleRubyBtn.textContent = rubyModes[currentRubyMode];

    articleContent.classList.remove('mode-hanzi-only', 'mode-pinyin-only');

    if (currentRubyMode === 0) {
        toggleRubyBtn.classList.add('active');

    } else if (currentRubyMode === 1) {
        articleContent.classList.add('mode-hanzi-only');
        toggleRubyBtn.classList.remove('active');

    } else if (currentRubyMode === 2) {
        articleContent.classList.add('mode-pinyin-only');
        toggleRubyBtn.classList.add('active');
    }
}

toggleRubyBtn.addEventListener('click', function() {
    applyRubyMode((currentRubyMode + 1) % 3);
    syncStateToUrl();
});

document.getElementById('fontSizePlusBtn').addEventListener('click', () => {
    if (currentFontSize < 32) currentFontSize += 2;
    document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
});
document.getElementById('fontSizeMinusBtn').addEventListener('click', () => {
    if (currentFontSize > 16) currentFontSize -= 2;
    document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
});

playPauseBtn.addEventListener('click', function() {
    if (isPlaying) {
        audioVoice.pause(); playIcon.textContent = 'play_arrow';
    } else {
        audioVoice.play(); playIcon.textContent = 'pause';
    }
    isPlaying = !isPlaying;

    if (currentSentencePlaying) {
        if (currentSentencePlaying.btnEl) {
            currentSentencePlaying.btnEl.textContent = '▶';
            currentSentencePlaying.btnEl.classList.remove('playing');
        }
        currentSentencePlaying = null;
    }
});
audioVoice.addEventListener('timeupdate', function() {
    const percentage = (audioVoice.currentTime / audioVoice.duration) * 100;
    if (!isNaN(percentage)) setProgress(percentage);

    updateReadingHighlight(audioVoice.currentTime);
});
audioVoice.addEventListener('ended', function() {
    if (currentSentencePlaying) stopSentencePlayback();
    clearReadingHighlight();
});
progressBar.addEventListener('input', function() {
    setProgress(progressBar.value);
    const seekTime = (progressBar.value / 100) * audioVoice.duration;
    audioVoice.currentTime = seekTime;

    if (currentSentencePlaying) {
        if (currentSentencePlaying.btnEl) {
            currentSentencePlaying.btnEl.textContent = '▶';
            currentSentencePlaying.btnEl.classList.remove('playing');
        }
        currentSentencePlaying = null;
    }
});

// ================= 7. 網址參數與瀏覽器歷史紀錄 =================
//   例如 data=zi-p-k-3 代表：字音模式、段落檢視、客語、目前播放/跟讀到全篇第 3 句 (0 起算)。
const RUBY_CODES = ['zi', 'han', 'py']; // 對應 currentRubyMode 0:字音 1:漢字 2:拼音
const VIEW_CODE_SENTENCE = 's';   // 斷句
const VIEW_CODE_PARAGRAPH = 'p';  // 段落
const LANG_CODE_MANDARIN = 'm';   // 華語
const LANG_CODE_HAKKA = 'k';      // 客語

function buildDataParam() {
    const parts = [
        RUBY_CODES[currentRubyMode],
        isSentenceMode ? VIEW_CODE_SENTENCE : VIEW_CODE_PARAGRAPH,
        isTranslateMode ? LANG_CODE_MANDARIN : LANG_CODE_HAKKA
    ];
    if (currentPlaybackIndex !== null) parts.push(currentPlaybackIndex); // 沒播放過就不加這欄
    return parts.join('-');
}

function syncStateToUrl() {
    if (!currentArticleData) return;
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('data', buildDataParam());
    const newUrl = window.location.pathname + '?' + urlParams.toString();
    window.history.replaceState(window.history.state, '', newUrl);
}

function restorePlaybackPosition(index) {
    const label = sentenceOrder[index];
    if (!label) return;

    clearReadingHighlight();
    const el = sentenceElementsMap.get(label);
    if (el) {
        el.classList.add('reading-now');
        lastReadingLabel = label;
    }
    currentPlaybackIndex = index;

    const timing = currentSrtTimes[index];
    if (timing) {
        whenAudioReady(() => {
            // 等待期間如果使用者已經切換到別的播放位置，就不要再執行這個過期的 seek
            if (currentPlaybackIndex !== index) return;
            audioVoice.currentTime = timingStart(timing);
        });
    }
}

function applyDataParam(dataStr) {
    if (!dataStr) return;
    const [rubyCode, viewCode, langCode, posStr] = dataStr.split('-');

    const rubyIndex = RUBY_CODES.indexOf(rubyCode);
    if (rubyIndex !== -1) applyRubyMode(rubyIndex);

    if (viewCode === VIEW_CODE_SENTENCE) applyViewMode(true);
    else if (viewCode === VIEW_CODE_PARAGRAPH) applyViewMode(false);

    if (langCode === LANG_CODE_MANDARIN) applyLangMode(true);
    else if (langCode === LANG_CODE_HAKKA) applyLangMode(false);

    const posIndex = Number(posStr);
    if (posStr !== undefined && !Number.isNaN(posIndex)) {
        restorePlaybackPosition(posIndex);
    }
}

// 1. 網頁初次載入時，檢查網址參數
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('id');
    const viewName = urlParams.get('view');
    const dataStr = urlParams.get('data');

    if (INFO_PAGES.includes(viewName) || viewName === 'about') {
        showInfoPage(viewName === 'about' ? 'preface' : viewName, false);
    } else if (articleId) {
        loadArticle(articleId, false);
        applyDataParam(dataStr);
        syncStateToUrl();
    }
});

// 2. 支援手機或瀏覽器的實體「上一頁 / 下一頁」按鈕
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.articleId) {
        loadArticle(event.state.articleId, false);
        const dataStr = new URLSearchParams(window.location.search).get('data');
        applyDataParam(dataStr); 
        syncStateToUrl();
        
    } else if (event.state && INFO_PAGES.includes(event.state.view)) {
        showInfoPage(event.state.view, false); 
        
    } else {
        hideAllViews();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        homeBanner.style.display = 'block'; 
        homeView.style.display = 'block';
        directoryGrid.style.display = 'grid';
        searchResults.style.display = 'none';
        
        if (typeof closeSearch === 'function') closeSearch();
    }
});



// ================= 斷句模式：點擊播放圖示播放單句音檔 =================
articleContent.addEventListener('click', (e) => {
    if (!isSentenceMode) return;

    const playBtn = e.target.closest('.sentence-play-btn');
    if (playBtn) {
        const label = playBtn.getAttribute('data-label');
        playSentence(label, playBtn);
        return;
    }

    const block = e.target.closest('.sentence-block');
    if (!block) return;
    
    const rect = block.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    
    if (clickX <= 28) {
        const label = block.getAttribute('data-label');
        const data = sentenceDataMap.get(label);
        
        if (data && data.mandarin && data.mandarin !== data.hakka) {
            data.current = data.current === 'hakka' ? 'mandarin' : 'hakka';
            
            const textSpan = block.querySelector('.sentence-text');
            if (textSpan) textSpan.innerHTML = data[data.current];
            
            const globalLang = isTranslateMode ? 'mandarin' : 'hakka';
            
            const isManuallyToggled = data.current !== globalLang;
            
            block.classList.toggle('is-translated', isManuallyToggled);
            // =======================================================
            
            const keyword = searchInput.value.trim();
            if (keyword) highlightArticle(block, keyword);
        }
    }
});