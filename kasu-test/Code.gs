/**
 * 詔安客語基礎百句測驗 － Google Apps Script 後端
 * 使用方式：開啟一份 Google 試算表 → 擴充功能 → Apps Script → 貼上本程式
 * → 部署 → 新增部署作業 → 類型「網頁應用程式」
 *   執行身分：我　　誰可以存取：所有人
 * 把部署後的 /exec 網址貼進 index.html 的 GAS_URL。
 * 修改程式後必須「管理部署作業 → 編輯 → 新版本」，網址才會套用新程式。
 */
const LISTEN_SHEET = '聽力成績';
const SPEAK_SHEET  = '口說評分';
const SPEAK_IDS = ['複誦1','複誦2','複誦3','複誦4','複誦5','問答1','問答2','問答3','問答4','問答5'];

function doGet() {
  return json_({ ok: true, msg: 'hakka test api ready' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();

    if (d.type === 'listening') {
      const sh = sheet_(ss, LISTEN_SHEET,
        ['時間','學校','班級座號','學號','得分','總題數']
        .concat(Array.from({length:10},(_, i)=>'第'+(i+1)+'題作答'))
        .concat(Array.from({length:10},(_, i)=>'第'+(i+1)+'題對錯')));
      const row = [now, d.school, "'" + d.cls, "'" + d.sid, d.score, d.total]
        .concat(d.detail.map(x => x.answer))
        .concat(d.detail.map(x => x.ok ? 1 : 0));
      sh.appendRow(row);
      return json_({ ok: true });
    }

    if (d.type === 'speaking') {
      const sh = sheet_(ss, SPEAK_SHEET,
        ['時間','教師學校','教師姓名','教師信箱','學生學校','班級座號','學號']
        .concat(SPEAK_IDS).concat(['總分','滿分']));
      const row = [now, d.teacher.school, d.teacher.name, d.teacher.mail,
                   d.student.school, "'" + d.student.cls, "'" + d.student.sid]
        .concat(SPEAK_IDS.map(id => d.grades[id] != null ? d.grades[id] : ''))
        .concat([d.total, d.max]);
      sh.appendRow(row);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'unknown type' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function sheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#dbe5f3');
    sh.getRange('C:D').setNumberFormat('@'); // 班級座號、學號保留前導 0
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
