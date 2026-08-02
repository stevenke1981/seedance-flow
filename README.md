# Seedance Flow

Seedance Flow 是一個節點式影片提示詞工作台，將場景、角色一致性、鏡頭、動作、風格、音訊與輸出限制組合成 Seedance 提示詞，並可透過本機代理送出非同步影片生成任務。

API 金鑰只存在目前分頁的記憶體，送出或查詢任務時才經由 `127.0.0.1` 本機代理轉送；不會寫入 `localStorage`、版本歷史、伺服器檔案或回應內容。工作流與生成版次則保存在目前瀏覽器的 `localStorage`，匯出 JSON 與提示詞文字檔由使用者主動下載。影片 URL 依 Ark 回應為準，可能具有期限。

## 啟動

```powershell
npm install
npm run dev
```

開啟 `http://127.0.0.1:4173`。啟動後可在「API 設定」填入 Ark API Key 與模型／Endpoint ID；模型 ID 刻意由使用者設定，不猜測或硬編碼 Seedance 2.5 的未確認 ID。

## 品質檢查

```powershell
npm run lint
npm test
npm run build
```

`npm run build` 會建立 `dist/` 靜態產物；`npm test` 覆蓋預設工作流、四拍提示組裝、JSON round-trip、無效匯入、Ark task adapter 與本機代理錯誤處理。

## 工作流設計依據

欄位刻意對齊 Dreamina 公開的 Seedance 2.5 提示方向：描述主體、動作、環境、鏡頭運動、光線、情緒與視覺風格，並補足聲音、參考資產、逐拍節奏與一致性備註。Seedance 2.5 的實際可用模型、額度、輸入上限與輸出選項仍以 Dreamina 當下介面為準。

- [Dreamina Seedance 2.5 官方頁面](https://dreamina.capcut.com/seedance/seedance-2-5)
- [Dreamina Seedance 2.5 提示指南（繁體中文）](https://dreamina.capcut.com/zh-tw/seedance/seedance-2-5-prompt)

## 生成與版次

- 「生成影片」會將目前預覽提示詞與 Output 節點的比例／時長送到 Ark `contents/generations/tasks`，再以輪詢取得完成狀態。
- 每次送出會建立 `v001`、`v002`…版次，保存提示詞、FNV-1a 摘要、模型、工作流快照、任務狀態與影片連結。
- 版本歷史區可將目前紀錄匯出為 `seedance-flow-history-YYYY-MM-DD.json`；匯入時會驗證 archive schema、限制最多 40 筆並依紀錄 ID 去重合併。下載檔只包含版本欄位，不包含 API Key。
- 重新整理頁面後，尚未完成的任務只會在本分頁重新輸入 API Key 後恢復輪詢。
- 生成輪詢有 15 分鐘上限、暫時性錯誤會退避重試；版本卡片可取消排隊／執行中的任務，也可對失敗、取消或完成版本再次生成。
- 新增 `Reference` 節點後可填入最多 3 個 Ark 可存取的 HTTPS 圖片 URL；Ark payload 會以 `image_url` content 傳送。瀏覽器選取的本機檔案只作預覽，不會上傳或偽裝成公開 URL。
- 若 Ark 回傳 `last_frame_url`，完成版本會顯示尾幀；按「用尾幀建立下一段」即可將尾幀回填為下一個 `Reference` 節點的「首幀參考」。
- API 設定中的「用量與費用護欄」只保存非敏感設定：單次最長時長、每日任務數、每日總秒數，以及是否每次送出前確認。歷史版次會記錄送出前用量快照；不估算或承諾供應商美元費用。
- API 錯誤會保留安全的 code、request ID 與 retryable 狀態；工作流匯入與本地還原會限制節點數、欄位大小、節點 ID 與節點類型。
- 真實生成需要你在火山引擎 Ark 控制台建立可用的模型／Endpoint ID、API Key 與額度；本專案不會代替使用者執行付費請求。

官方 API 參考：

- [Create contents generations task](https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01)
- [Get contents generations task](https://api.volcengine.com/api-docs/view?action=GetContentsGenerationsTask&serviceCode=ark&version=2024-01-01)

本機 API bridge 的 `GET /api/health` 會回報目前 upstream 模式與 body、timeout、影片時長、參考圖片數量上限，方便部署前檢查；這不代表已完成正式部署或真實 Ark 驗收。

### API bridge 部署前檢查

正式環境至少要明確設定 upstream、HTTPS Origin allowlist、非 localhost bind host、Origin 強制檢查與 rate limit：

```powershell
$env:SEEDANCE_API_BASE_URL = "https://ark.example.com/api/v3"
$env:SEEDANCE_ALLOWED_ORIGINS = "https://your-app.example"
$env:SEEDANCE_BIND_HOST = "0.0.0.0"
$env:SEEDANCE_REQUIRE_ORIGIN = "true"
$env:SEEDANCE_RATE_LIMIT_PER_MINUTE = "60"
npm run preflight:strict
npm run dev
```

`npm run preflight` 會列出目前設定是否就緒；`preflight:strict` 在條件不足時以失敗結束。rate limit 是單一 bridge process 的記憶體護欄，正式多執行個體部署仍需平台層級限流與正式監控。

第 2 階段的 `release:check` 會檢查 `dist/` 是否包含完整可發布產物並輸出每個檔案的 SHA-256；`release:check:strict` 會再要求 production preflight 通過。第 3 階段的 archive 也會納入 `dist/src/history-archive.mjs` 產物檢查。`.env.example` 只提供設定名稱與範例，不含任何憑證。

## 目前範圍

- 已完成：節點新增／選取／拖曳／刪除、Inspector 欄位、四拍提示預覽、複製 fallback、TXT 與 JSON 匯出、本地還原、響應式版面。
- 未包含：登入、付款、雲端同步、真正的檔案上傳服務與多供應商路由。Reference 節點目前支援 HTTPS 圖片參考與本機預覽；真實 Seedance 生成流程已接入，但需要使用者提供有效 Ark 認證與模型／Endpoint ID 才能進行外部驗收。
