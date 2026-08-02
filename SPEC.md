# Seedance Flow — 第一版規格

## 目標

建立一個在瀏覽器本地執行的 Seedance 2.5／即夢影片提示詞工作台。操作方式借鑑 ComfyUI：使用者把可編輯節點放在畫布上，從節點欄位組合一個可貼入 Dreamina 的多拍提示詞，並可下載結構化工作流。

提示詞與工作流可在瀏覽器本地編排；影片生成透過本機代理接入火山引擎 Ark 的非同步 contents generations API。模型／Endpoint ID 與 API Key 不寫死，需由使用者在目前分頁提供。

## 產品名稱與視覺

- 名稱：Seedance Flow
- 語言：繁體中文優先，技術標籤可保留英文
- 視覺：深墨色工作台、暖白文字、琥珀色選取狀態、青綠色輸出狀態；清楚的面板層級，不使用大面積漸層
- 版面：桌面三欄（節點庫／畫布／提示預覽），窄螢幕改為上下堆疊

## 必須實作的主流程

1. 載入後有一組可用的預設節點：Scene、Character、Camera、Motion、Style、Audio、Output。
2. 從節點庫新增節點；節點能在畫布拖曳、選取、刪除。
3. 選取節點後，在 Inspector 編輯其欄位。至少支援文字、下拉、數字或多行文字。
4. 預覽區即時產生四拍提示：00–06 hook、06–14 development、14–24 escalation、24–30 payoff。提示需包含 subject、action、environment、camera、lighting、mood、style、audio 等可見結構。
5. 「複製提示詞」寫入剪貼簿並顯示成功狀態；剪貼簿不可用時提供可選取文字的 fallback。
6. 「匯出工作流」下載 JSON，包含 schemaVersion、model、duration、nodes、prompt 與 exportedAt。
7. 編輯後自動儲存至 localStorage；重新整理能還原；提供「重設範例」按鈕。
8. 可在 API 設定填入裝置本地的 Ark API Key 與模型／Endpoint ID，送出目前提示詞生成任務，輪詢 queued／running／succeeded／failed 狀態。
9. 每次生成建立遞增版次，保存提示詞、摘要、工作流快照、任務狀態與影片 URL；歷史不保存 API Key。
10. 生成任務必須有逾時上限、暫時性錯誤退避重試、取消任務與失敗／完成版本再次生成入口。
11. API 錯誤使用結構化 code、request ID 與 retryable 欄位；工作流輸入拒絕過大 JSON、未知節點類型、重複 ID 與超長欄位。
12. `Reference` 節點支援用途、HTTPS 參考圖 URL 與備註；生成時最多送出 3 個 `image_url` content。瀏覽器本機檔案只提供預覽，不能直接送往 Ark。
13. 成功生成若回傳 `last_frame_url`，版本歷史需顯示尾幀，並提供將其回填成下一段「首幀參考」的操作。
14. 送出影片前使用本機用量護欄：單次時長、每日任務數、每日總秒數可限制；可要求每次付費請求前確認。護欄不得聲稱可估算供應商美元費用。
15. `/api/health` 回報 upstream 模式與部署相關 limits，不回傳 API Key 或其他敏感資訊。
16. API bridge 支援 HTTPS Origin allowlist、Origin 強制檢查、每分鐘請求上限與可配置 bind host；`preflight:strict` 必須在正式部署前通過。
17. 第 2 階段 release check 必須驗證 `dist/` 核心產物存在並輸出 SHA-256 manifest；strict 模式同時要求 production preflight 通過，不得包含真實憑證。
18. 第 3 階段版本歷史可匯出／匯入 `schemaVersion=1`、`kind=seedance-flow-history` 的 JSON archive；匯入必須限制最多 40 筆、依 ID 去重，且 archive 不得包含 API Key。

## 內容對齊方向

依 Dreamina 官方 Seedance 2.5 公開指南設計欄位：主體、動作、環境、鏡頭運動、光線、情緒、視覺風格、聲音／語音、逐拍敘事、角色或產品一致性、參考資產備註與畫面比例／時長。不要把任何未驗證的 API 或付費流程寫死。

## 技術約束

- 專案只修改目前 `moviedesign` 目錄，不改上層主站。
- 優先使用無外部執行期依賴的 HTML/CSS/ES modules；使用 Node 內建模組提供本地 dev server 與 test script。
- 將提示詞組裝、序列化與還原邏輯放在可被 Node test 匯入的純函式模組。
- 不使用假成功：每個按鈕要有實際副作用或清楚錯誤狀態；外部 API 未提供認證時必須明確停在可理解的錯誤。
- API Key 只能由瀏覽器記憶體經 `X-Ark-Api-Key` 傳給本機代理；不得進入 localStorage、版本歷史、伺服器日誌或錯誤回應。
- 外部 request 必須有 timeout；輪詢必須有 deadline 與 retry backoff；取消操作必須清理前端 timer，避免重複請求。
- 為核心互動加上 aria-label、鍵盤可操作性與明顯 focus 狀態。

## 驗收條件

- `npm run dev` 啟動本地預覽；`npm run build` 產出 `dist/`；`npm test` 通過核心邏輯測試。
- 實際瀏覽器操作：新增節點、拖曳節點、編輯欄位、看到提示更新、複製提示、匯出 JSON、重新整理後資料保留、重設範例。
- 窄視窗（約 390px）不水平溢位，仍能操作 Inspector 與提示預覽。
- 失敗狀態（空提示、剪貼簿拒絕、無效匯出）有可理解的訊息。
- API 代理健康檢查可用；缺少 Key、模型或無效參數回傳 4xx；上游錯誤保留安全的錯誤摘要，不回傳金鑰。
- 任務可在 queued／running 狀態取消；failed／cancelled／expired／succeeded 版本提供再次生成入口。
- Reference 節點的本機預覽、HTTPS URL 驗證、`image_url` payload 與尾幀接續可在隔離 mock provider 中完成驗收。
- 用量護欄可在本機阻擋超出上限的任務，並在送出前顯示費用不確定性與當日用量；限制設定只留在瀏覽器本機。
- bridge 安全邊界可用 mock request 驗證：不允許的 Origin 得到 403，超過速率得到 429 與 Retry-After，允許來源得到 CORS header。
- release check 可在沒有雲端帳號的本機環境先驗證發布產物與設定，不宣稱已完成正式部署。
- 版本 archive 可在本機下載與重新匯入，格式錯誤或超過上限時顯示可理解錯誤；跨裝置同步服務仍不在範圍內。
- 真實火山引擎生成需以主人提供的有效 Key、模型／Endpoint ID 及費用確認進行；沒有這些條件時標示 `MANUAL_REQUIRED`，不得宣稱已生成影片。
