# Antigravity 交付包 — 股票買賣與損益管理小幫手

## 檔案
- `SPEC.md`：精簡定稿開發規格與驗收案例。
- `supabase_schema.sql`：Supabase 初版資料表與 RLS 範本，先審查，勿直接套用到有資料的資料庫。
- `ANTIGRAVITY_TASK.md`：可直接貼給 Antigravity 的工作指令。
- `README.md`：本說明。

## 使用方式
1. 將此資料夾／ZIP 交給 Antigravity。
2. 開啟 `ANTIGRAVITY_TASK.md`，要求它先檢查工作目錄與現有專案，再按規格分階段開發。
3. 先審查 SQL 與 OAuth 設定；不要把任何密鑰貼進聊天或提交至 Git。
4. 只有在確認正確的 Supabase 專案、備份完成並審查 SQL 後，才執行 migration。
5. 完成後按 `SPEC.md` 的 T01–T12 驗收。

## 安全提醒
- 前端只能使用 Supabase URL 與 anon/publishable key；禁止使用 `service_role` key。
- 不可採用公開讀寫政策。
- Google OAuth 需要在 Google Cloud 與 Supabase Dashboard 設定允許的回呼網址。
- 此包是開發規格與 SQL 範本，不是已完成或已部署的 App。
