# Remix: Excel Merge Tool - 專案指令與上下文

此文件為 Gemini CLI 提供專案的技術概觀、架構說明及開發指令，作為後續協作的基礎上下文。

---

## 1. 專案概觀 (Project Overview)

**Remix: Excel Merge Tool** 是一個強大的 Excel 資料處理工具，允許使用者合併多份 Excel 檔案、進行資料清理，並透過整合的 **Google Gemini AI 助理** 執行進階的資料分析、視覺化與自動化操作。

### 核心技術棧 (Tech Stack)
- **前端框架**: React 19 (TypeScript)
- **建置工具**: Vite
- **樣式處理**: Tailwind CSS 4.0, Framer Motion (動畫)
- **資料處理**: `xlsx` (SheetJS)
- **AI 整合**: `@google/genai` (Gemini API)
- **資料視覺化**: Recharts
- **本地儲存**: IndexedDB (透過 `idb-keyval`)
- **圖示**: Lucide React

### 專案架構
- **純客戶端應用**: 雖然 `package.json` 中包含 `express` 與 `better-sqlite3`，但主要邏輯（如 `src/App.tsx`）運行於瀏覽器，利用 Gemini 的 Function Calling 功能直接在前端操作資料狀態。
- **持久化設計**: 使用 IndexedDB 儲存使用者的 API Key、歷史檔案紀錄與目前的應用程式狀態，確保重新整理後資料不遺失。

---

## 2. 建置與執行 (Building and Running)

### 開發環境設定
1. **安裝依賴**:
   ```cmd
   npm install
   ```
2. **設定環境變數**:
   在專案根目錄建立 `.env.local` 並加入您的 Gemini API Key：
   ```env
   GEMINI_API_KEY=您的_API_KEY
   ```
   *註：應用程式也支援在介面中手動輸入 API Key (BYOK 模式)。*

### 常用指令
- **啟動開發伺服器**:
  ```cmd
  npm run dev
  ```
  預設運行於 `http://localhost:3000`。
- **建置專案**:
  ```cmd
  npm run build
  ```
- **檢查型別**:
  ```cmd
  npm run lint
  ```
- **清除建置產物**:
  ```cmd
  npm run clean
  ```

---

## 3. 開發規範與慣例 (Development Conventions)

### 程式碼風格
- **React 組件**: 偏好使用 Functional Components 與 Hooks。
- **型別定義**: 所有資料結構（如 `FileData`, `FileLibraryRecord`）均需定義清晰的 TypeScript Interface 或 Type。
- **狀態管理**: 主要狀態集中在 `App.tsx`，並透過 `useEffect` 同步至 IndexedDB。

### AI 助理開發 (Gemini Function Calling)
AI 助理具備多項工具（Functions），若需新增功能，需在 `handleSendMessage` 中：
1. 定義新的 `FunctionDeclaration`。
2. 在 `responseStream` 的 `tools` 中註冊。
3. 在 `switch (functionCallName)` 中實作對應的資料操作邏輯（例如過濾、排序、計算）。

### 安全性提醒
- **API Key 保護**: 嚴禁將 API Key 直接 Hardcode 在程式碼中。專案已配置 Vite 的 `define` 來從環境變數讀取。
- **資料隱私**: 資料處理均在本地執行，僅資料預覽與分析請求會發送至 Gemini API。

---

## 4. 關鍵檔案說明 (Key Files)

- `src/App.tsx`: 應用程式的核心邏輯，包含檔案上傳、VLOOKUP 合併演算法、資料清理功能及 AI 助理整合。
- `vite.config.ts`: Vite 配置，包含 Tailwind CSS 插件與環境變數定義。
- `package.json`: 專案依賴與腳本定義。
- `metadata.json`: 專案描述與 AI Studio 權限設定。
- `index.html`: 入口 HTML 文件。
