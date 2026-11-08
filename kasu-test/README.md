https://script.google.com/macros/s/AKfycbyZgwh7NWuZIXTgX8Ek5hIf0gv1aJq4T3QCHaPLlTA6FRVmMXLTgE9M2s55YPz0pExzQw/exec


部分一：建立試算表並貼上後端程式
用瀏覽器登入你的 Google 帳號，開啟 https://sheets.google.com。
點左上角「空白」試算表，新增一份。
左上角把檔名改成「詔安客語測驗成績」（名稱隨意）。
上方選單點「擴充功能」→「Apps Script」，會開啟新分頁，這是程式編輯器。
編輯器中間已有一段預設程式（function myFunction() {...}），全部選取後刪除（Ctrl+A，再按 Delete）。
打開我給你的 Code.gs，全部複製，貼進編輯器。
按 Ctrl+S 存檔。左上角專案名稱可改成「客語測驗後端」。
部分二：部署成網頁應用程式
編輯器右上角點藍色「部署」→「新增部署作業」。
在彈出視窗，點左側「類型」旁的齒輪圖示 → 選「網頁應用程式」。
設定三個欄位：
說明：填「第一版」。
執行身分：選「我」。
誰可以存取：選「所有人」。
點「部署」。
出現「需要授權存取權」，點「授權存取權」，選你的 Google 帳號。
會看到「Google 尚未驗證這個應用程式」，這是正常的，因為程式是你自己寫的。請點左下角「進階」，再點「前往『客語測驗後端』（不安全）」，最後點「允許」。
部署完成後，會顯示一串「網頁應用程式網址」，結尾是 /exec。點「複製」，貼到記事本先存著，下一步會用到。
驗證：在瀏覽器新分頁貼上這個網址。如果看到 {"ok":true,"msg":"hakka test api ready"}，代表後端成功。
部分三：把網址填進網頁
用「記事本」（Windows）或「文字編輯」（Mac，需切換成純文字模式）打開 index.html。
按 Ctrl+F 搜尋 GAS_URL，會找到這一行：
   const GAS_URL = "https://script.google.com/macros/s/請換成你的部署ID/exec";
把引號內的整串網址，換成剛才複製的 /exec 網址（保留前後的引號和結尾的分號）。
存檔。

如果沒有文字編輯器，也可以等上傳到 GitHub 之後，在網頁上直接編輯（見部分四第 7 步）。

部分四：把網站放上 GitHub Pages

先準備音檔：確認檔名全是小寫英文＋數字，且與程式一致，例如 listen01.mp3 到 listen10.mp3、repeat01.mp3 到 repeat05.mp3。

開啟 https://github.com，點「Sign up」註冊免費帳號（已有帳號就直接登入）。帳號名稱會出現在網址裡，建議用英文。
登入後，右上角點「+」→「New repository」。
設定：
Repository name：填 hakka-test。
選「Public」。免費版必須是公開的才能使用 Pages。
勾選「Add a README file」。
點綠色「Create repository」。
進入 repo 頁面後，點「Add file」→「Upload files」。
把 index.html 拖進來，再點下方綠色「Commit changes」。
上傳音檔資料夾：
再點一次「Add file」→「Upload files」。
把你電腦裡的 audio 資料夾整個拖進去（資料夾裡要有 mp3 檔）。
等檔案列表出現後，點「Commit changes」。
回到 repo 首頁，檢查檔案列表有 index.html 和 audio 資料夾，點進 audio 確認 mp3 都在。
如果前面還沒改 GAS_URL：點 index.html → 右上角鉛筆圖示，搜尋 GAS_URL 貼上網址 → 右上角綠色「Commit changes」。
部分五：啟用網站
在 repo 頁面上方點「Settings」（齒輪）。
左側選單點「Pages」。
在「Build and deployment」的「Source」選「Deploy from a branch」。
「Branch」選 main，旁邊資料夾選 / (root)，點「Save」。
等 1～3 分鐘，重新整理這個頁面，上方會出現「Your site is live at ...」，網址格式如下，這就是給學生的網址：
   https://你的帳號.github.io/hakka-test/
部分六：測試
開啟上面的網址，先用「學生」身分走一次：學校選崙背國小，班級座號填 40107，學號填 test01。
聽第 1 題時確認有聲音。如果沒有，多半是音檔檔名不符，或剛上傳還沒生效，等一下再試。
交卷後看到「✔ 成績已送出」，回到 Google 試算表，會看到新增的「聽力成績」工作表和一筆資料。
再用「老師」身分走一次口說評分，確認「口說評分」工作表有資料。
測試完，把試算表裡的測試資料列刪除（保留第 1 列標題）。
常見問題
狀況	原因與處理
顯示「成績傳送失敗」	檢查 GAS_URL 是否貼對（結尾是 /exec）；部署時「誰可以存取」是否選「所有人」。
聽不到聲音	檔名大小寫要完全一致；確認檔案在 audio 資料夾內；手機請關閉靜音。
網站打開是 404	剛啟用 Pages 要等幾分鐘；確認 index.html 在 repo 最外層。
修改網頁後沒變化	GitHub Pages 更新需 1～2 分鐘，按 Ctrl+F5 強制重新整理。
修改了 Code.gs	必須重新部署才會生效：部署 → 管理部署作業 → 鉛筆圖示 → 版本選「新版本」→ 部署。網址不會變。
提醒
如果要讓其他老師一起看成績，在試算表右上角點「共用」，加入他們的信箱即可。
試算表是用你的帳號寫入的，不要刪除或改動第 1 列標題。
正式施測前，請先拿 2～3 台學生用的平板或電腦試一次，確認網路和音量都正常。