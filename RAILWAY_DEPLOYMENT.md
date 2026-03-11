# Railway 部署指南

本指南說明如何將 Tryme 預約系統部署到 Railway。

## 前置要求

- GitHub 帳號（whitechocball）
- Railway 帳號和 API Token
- 代碼已推送到 GitHub：https://github.com/whitechocball/tryme-booking

## 部署步驟

### 1. 在 Railway 上創建新項目

1. 訪問 https://railway.app
2. 登錄您的 Railway 帳號
3. 點擊 "New Project"
4. 選擇 "Deploy from GitHub"
5. 授權 Railway 訪問您的 GitHub 帳號
6. 選擇 `tryme-booking` 倉庫
7. 點擊 "Deploy"

### 2. 配置環境變量

在 Railway 項目設置中，添加以下環境變量：

```
PORT=3000
NODE_ENV=production

# PostgreSQL（由 Railway 自動提供）
DATABASE_URL=postgresql://...

# Telegram
TELEGRAM_API_ID=34859690
TELEGRAM_API_HASH=743581d27f2fbc7e82281350a5fe69db
TELEGRAM_BOT_TOKEN=8670236056:AAHYnRIv9IrzbaIuJgG8OZ0NC5DdEUFeQ8I

# WeChat Work (企業微信)
WECHAT_CORP_ID=ww6ccfc2612e6f75fd
WECHAT_AGENT_ID=1000002
WECHAT_SECRET=DnCK0s-xwkaTA0CGB0mlISGIieMTxM45HKA4Xeo2Uh0

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tryme2024
```

### 3. 添加 PostgreSQL 數據庫

1. 在 Railway 項目中，點擊 "+ Add"
2. 選擇 "Database"
3. 選擇 "PostgreSQL"
4. Railway 會自動為您創建數據庫並設置 `DATABASE_URL` 環境變量

### 4. 運行數據庫遷移

部署後，需要運行數據庫遷移來創建表結構：

#### 方法 1：使用 Railway CLI

```bash
# 安裝 Railway CLI
npm install -g @railway/cli

# 登錄 Railway
railway login

# 進入項目目錄
cd /home/ubuntu/tryme

# 運行遷移
railway run npm run migrate
```

#### 方法 2：使用 Railway 控制台

1. 在 Railway 項目頁面，點擊 "PostgreSQL" 服務
2. 進入 "Query" 標籤
3. 複製 `migrations/001_init_schema.sql` 中的 SQL 語句
4. 粘貼到查詢框並執行

#### 方法 3：使用 psql 連接

```bash
# 獲取 Railway PostgreSQL 連接信息
# 從 Railway 控制台複製 DATABASE_URL

# 連接到數據庫
psql $DATABASE_URL

# 執行遷移 SQL
\i migrations/001_init_schema.sql

# 退出
\q
```

### 5. 驗證部署

1. 訪問應用 URL（Railway 會提供）
2. 檢查健康檢查端點：`https://your-app.railway.app/health`
3. 訪問管理後台：`https://your-app.railway.app/admin`
4. 測試 Telegram Bot：在 Telegram 中發送 `/start` 命令

## 常見問題

### 數據庫連接失敗

確保：
1. PostgreSQL 服務已添加到項目
2. `DATABASE_URL` 環境變量已設置
3. 數據庫遷移已運行

### Telegram Bot 不回應

檢查：
1. `TELEGRAM_BOT_TOKEN` 環境變量是否正確
2. 應用日誌中是否有錯誤信息
3. 確保 Bot 已啟動（檢查應用日誌）

### 企業微信通知不工作

檢查：
1. `WECHAT_CORP_ID`、`WECHAT_AGENT_ID`、`WECHAT_SECRET` 是否正確
2. 技師的企業微信 ID 是否在數據庫中設置
3. 應用日誌中是否有企業微信 API 錯誤

## 監控和日誌

在 Railway 控制台中：

1. 點擊應用服務
2. 進入 "Logs" 標籤查看實時日誌
3. 進入 "Metrics" 標籤查看性能指標

## 更新部署

推送新代碼到 GitHub 後，Railway 會自動檢測並重新部署：

```bash
cd /home/ubuntu/tryme
git add .
git commit -m "Update: your changes"
git push origin main
```

## 備份和恢復

### 備份數據庫

```bash
# 使用 Railway 提供的備份功能
# 在 PostgreSQL 服務頁面點擊 "Backups"
```

### 恢復數據庫

```bash
# 在 PostgreSQL 服務頁面選擇備份並點擊 "Restore"
```

## 成本估算

Railway 提供免費額度：
- 計算：500 小時/月
- 數據庫：5GB 存儲

對於小型應用，通常在免費額度內。

## 支持

- Railway 文檔：https://docs.railway.app
- Railway 社區：https://railway.app/support
