# 桿件小幫手

支撐架配置、桿件數量與重量估算的靜態網頁工具。

## 使用方式

### GitHub Pages 個人雲端版

網站首頁導向 `ACT20261119-03.html`。線上版本透過 Supabase Auth 登入，專案及桿件資料由 Postgres RLS 限制為唯一擁有者讀寫。未登入仍可用內建規格計算；重新整理頁面需重新登入。部署與權限設定見 `supabase/README.md`。

本機 SQLite 與雲端資料庫各自儲存，不會持續自動同步。

### ACT20261119-03 本機專案資料庫

執行 `start-projects.cmd`（需 Node.js 24 以上），使用開啟的 `http://127.0.0.1:8765/` 網頁。服務會自動建立 `data/projects.sqlite`，儲存專案名稱、輸入設定及計算結果；重新啟動後仍可讀取。使用期間請保留服務視窗。

桿件規格及單重儲存在 `data/materials.sqlite`，第一次啟動自動建立 20 筆內建資料，後續啟動保留已修改的單重與新增規格。

備份或搬移時，先關閉服務，再複製 `data/projects.sqlite` 與 `data/materials.sqlite`。直接雙擊 HTML 無法讀寫這些資料庫。舊有瀏覽器 IndexedDB 專案及桿件資料保留，但不會自動匯入。資料庫不納入版本控制。

下載整個儲存庫後，以現代瀏覽器開啟 `index.html`，即會進入 `ACT20261119-03.html`；本機儲存功能請使用上述啟動檔。

### 舊版 autoCount 工具

1. 設定 X、Y 軸間距、支撐範圍及四角高度，執行配置計算。
2. 在單重設定頁調整 20 種桿件單重，可匯出及匯入 JSON 備份。
3. 在 3D 圖面區塊旋轉、縮放、篩選桿件，或匯入逐桿端點 CSV；支援匯出 PNG 與座標 CSV。

單重資料儲存在目前瀏覽器的 IndexedDB，不會上傳到伺服器，也不會自動同步至其他瀏覽器或裝置。更換網址或瀏覽器前，可先匯出 JSON 備份。若本機檔案模式不允許資料庫存取，請使用靜態網頁主機開啟。

## 主要檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 最終版入口 |
| `ACT20261119-03.html` | 現行配置計算、個人雲端登入與 3D 預覽 |
| `ds-storage.js` | 本機 SQLite／雲端 Supabase 存取 |
| `autoCount(20190904)_活潑版.html` | 保留的舊版配置計算與 3D 預覽 |
| `桿件重量修改_活潑版.html` | 最新版單重設定 |
| `autocount-theme_活潑版.css` | 最新版樣式 |
| `material-weights_活潑版.js` | 單重資料、驗證與備份 |
| `scaffold-model.js` | 逐桿模型及 CSV 資料處理 |
| `scaffold-viewer3d.js` | 3D 圖面繪製 |
| `scaffold-3d-ui.js` | 3D 操作介面與匯入匯出 |
| `05_1.png` | 四角高度位置示意圖 |

`autoCount(20190904)_優化版.html`、`autoCount(20190904).html` 及對應資源保留供版本比較與既有回歸測試使用；最新入口指向活潑版。

## 測試

安裝 Node.js 後，於儲存庫目錄執行：

```sh
node --test tests/autocount.test.cjs tests/material-weights.test.cjs tests/scaffold-details.test.cjs tests/scaffold-model.test.cjs
```

測試涵蓋配置數量、單重資料驗證、各位置桿件明細、3D 模型與 CSV 匯入匯出。
