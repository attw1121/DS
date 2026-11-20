# DS 個人雲端資料庫

GitHub Pages 使用 Supabase Auth 與 Postgres；localhost 保留 SQLite API。

1. 檢查目標專案後，套用 `ds-schema.sql`。
2. 在 Supabase Authentication 建立或確認網站使用者。Supabase 管理平台帳號與網站 Auth 帳號是不同帳號。
3. 由管理者將該 Auth UUID 寫入 `public.ds_owner`。此表只允許一位擁有者，瀏覽器無法新增或修改。
4. 以管理者身分匯入桿件與專案，並指定該使用者的 owner_id。
5. `cloud-config.js` 僅放專案 URL 與 publishable key，不得放 secret/service_role key。
6. 發布後驗證：匿名與其他帳號無法讀寫；擁有者可儲存、重讀專案與修改單重。

前端只提供登入，不提供公開註冊。登入工作階段保留在記憶體中，重新整理需重新登入。資料庫以 RLS 及唯一擁有者表執行權限檢查。網站原始碼及內建規格為公開資料，個人專案及雲端修改資料需登入才能存取。

本機 SQLite 不會與雲端持續同步。搬移資料應以一次性匯入進行，避免覆蓋後續的線上修改。勿將實際資料庫、匯入檔或私人金鑰提交至公開儲存庫。
