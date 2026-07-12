由於 GitHub 限制單一檔案大小不能超過 100MB，本資料夾中的 `visual-dashboard-studio.zip` 檔案已被分割為以下兩個分卷：
- `visual-dashboard-studio.zip.001`
- `visual-dashboard-studio.zip.002`

### 合併還原步驟

在 Windows 環境中，請依照以下步驟合併還原：

1. 開啟 **命令提示字元 (CMD)**。
2. 切換至此檔案目錄 (使用 `cd` 指令)。
3. 執行下列指令進行二進位合併：
   ```cmd
   copy /b visual-dashboard-studio.zip.001+visual-dashboard-studio.zip.002 visual-dashboard-studio.zip
   ```
4. 執行完畢後，即可獲得完整的 `visual-dashboard-studio.zip` 檔案並進行解壓縮。
