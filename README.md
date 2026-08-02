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
- 重新整理頁面後，尚未完成的任務只會在本分頁重新輸入 API Key 後恢復輪詢。
- 生成輪詢有 15 分鐘上限、暫時性錯誤會退避重試；版本卡片可取消排隊／執行中的任務，也可對失敗、取消或完成版本再次生成。
- API 錯誤會保留安全的 code、request ID 與 retryable 狀態；工作流匯入與本地還原會限制節點數、欄位大小、節點 ID 與節點類型。
- 真實生成需要你在火山引擎 Ark 控制台建立可用的模型／Endpoint ID、API Key 與額度；本專案不會代替使用者執行付費請求。

官方 API 參考：

- [Create contents generations task](https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01)
- [Get contents generations task](https://api.volcengine.com/api-docs/view?action=GetContentsGenerationsTask&serviceCode=ark&version=2024-01-01)

## 目前範圍

- 已完成：節點新增／選取／拖曳／刪除、Inspector 欄位、四拍提示預覽、複製 fallback、TXT 與 JSON 匯出、本地還原、響應式版面。
- 未包含：登入、付款、雲端同步、資產上傳與多供應商路由。真實 Seedance 生成流程已接入，但需要使用者提供有效 Ark 認證與模型／Endpoint ID 才能進行外部驗收。
