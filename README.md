# 持股管家 — 使用與設定指南（繁體中文）

🎉 **您的專屬免費公開網址（GitHub Pages）已正式上線**：
👉 **[https://maggie6362.github.io/stock-manager/](https://maggie6362.github.io/stock-manager/)**

本專案已依 `SPEC.md` 開發規格與 `頁面佈局示意圖.png` 視覺參考完成實作，通過 **T01–T12** 全部驗收測試案例，並已完成 Supabase 雲端資料庫、RLS 個人資料隔離、Google OAuth 登入與 GitHub Pages 部署。

---

## 一、如何直接在電腦上打開預覽與驗收（免安裝）

1. 在專案資料夾 `c:\Users\dsche\OneDrive\桌面\持股專家_GPT` 中，直接雙擊打開 **`index.html`**（使用 Chrome、Edge 或 Safari 瀏覽器皆可）。
2. 畫面預設以 **「📱 iPhone 直向（優先）」** 視角呈現：
   - 頂部工具列可隨時一鍵切換 **`iPhone 直向`**、**`iPad 橫向看板`**、**`自動適應全寬（電腦版左側導覽）`**，或點擊 **`🔑 檢視登入頁`** 查看 3D 黏土小豬撲滿登入鎖定畫面。
3. 點擊底部導覽列 **`⚙️ 設定`** 分頁，拉到最下方即可查看 **「🧪 SPEC.md T01–T12 規格驗收報告」**，並可點擊 **`重新執行驗證`**、**`💾 匯出 JSON 備份`** 或 **`🧹 清空交易從零測試`**。

---

## 二、如何啟用「Google 登入」與「電腦／iPhone／iPad 跨裝置雲端同步」

若您希望將資料存放在您個人的免費 Supabase 雲端資料庫，並在電腦、iPhone、iPad 跨裝置同步，請依序完成以下 **3 個步驟**（全程無須修改任何程式碼檔案）：

### 步驟 1：建立 Supabase 專案並執行資料庫表格設定
1. 前往 [Supabase 官網](https://supabase.com/) 登入並點擊 **`New Project`** 建立一個免費專案。
2. 進入專案後，點擊左側選單的 **`SQL Editor`** ➔ **`New query`**。
3. 用記事本打開本資料夾內的 **`supabase_migration.sql`**，全選複製裡面的 SQL 內容，貼到 Supabase 的 SQL Editor 中，點擊右下角 **`Run`**。
   - 顯示 `Success` 即代表已建立好個人隔離資料表（`profiles`、`accounts`、`transactions`、`prices`）與安全防護（RLS）。

### 步驟 2：設定 Google 登入（OAuth）
1. 在 Supabase 左側選單點擊 **`Authentication`** ➔ **`Providers`** ➔ 點開 **`Google`**。
2. 複製畫面上的 **`Callback URL (for OAuth)`**。
3. 前往 [Google Cloud Console](https://console.cloud.google.com/)：
   - 建立專案 ➔ 進入 **「API 和服務」➔「憑證」➔「建立憑證」➔「OAuth 用戶端 ID」**（應用程式類型選「網頁應用程式」）。
   - 在 **「已授權的重新導向 URI」** 貼上剛剛複製的 Supabase Callback URL，按下建立。
   - 複製產生的 **用戶端 ID (Client ID)** 與 **用戶端密鑰 (Client Secret)**，貼回 Supabase 的 Google Provider 設定中並開啟 **`Enable Sign in with Google`**，按下 **`Save`**。
4. 在 Supabase 左側 **`Authentication`** ➔ **`URL Configuration`**：
   - 將您正式部署的網站網址（或本地測試網址）加入 **`Site URL`** 與 **`Redirect URLs`**。

### 步驟 3：在 App 畫面填入連線資訊（無須改程式碼）
1. 在 Supabase 左側選單點擊 **`Project Settings`** ➔ **`API`**。
2. 複製以下兩項公開連線資訊：
   - **`Project URL`**（例如 `https://xxxx.supabase.co`）
   - **`anon` / `public` key**（⚠️ **請注意：絕對不要複製 `service_role` secret key！**）
3. 打開本 App，點擊 **`⚙️ Supabase 連線設定`**，貼上這兩項資訊並按 **`儲存連線設定`**，即可使用 **`使用 Google 登入`**！

---

## 三、服務限制與安全須知（依 SPEC.md 3 說明）
- **資料隔離與安全**：前端只使用公開 `anon` key，並由資料庫 Row Level Security (RLS) 強制限制只有您本人的 Google 帳號（`auth.uid()`）可讀寫自己的資料。
- **第三方免費方案與行情限制**：
  - Supabase 免費方案若連續 7 天無任何讀寫活動可能會暫停（於後台點擊 Restore 即可恢復），建議定期使用 App 內的 **`💾 匯出 JSON 備份`** 保存個人副本。
  - 收盤價來源為台灣證券交易所 OpenAPI (`STOCK_DAY_ALL`) 每日收盤行情，非盤中即時報價；若遇來源維護或上櫃／特殊代號未匹配，系統會自動保留最後一次有效價格，您亦可於「持倉總覽」點擊 **`🏷️`** 手動設定參考收盤價。
