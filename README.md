# Tryme - 技師預約管理系統

Tryme 是一個完整的技師預約管理系統，包含 Telegram Bot 客戶端、企業微信技師通知、以及完整的後台管理頁面。

## 功能特性

### 核心功能
- **Telegram Bot 預約流程**：客戶通過 Telegram Bot 進行預約
- **企業微信通知**：技師通過企業微信接收預約通知並回覆
- **爽約管理**：完整的爽約記錄和管理系統
- **後台管理**：Web 管理頁面用於管理場所、技師、預約和爽約記錄

### 預約流程
1. 客戶輸入 `/book` 命令
2. 選擇場所
3. 選擇技師
4. 選擇時段（早上/中午/晚上）
5. 選擇具體時間（A/B/C/D/E）
6. 系統通過企業微信通知技師
7. 技師在企業微信回覆接受或拒絕
8. 系統通過 Telegram 通知客戶結果

### 爽約管理
- 爽約定義：預約服務前 1 小時內沒有取消，且沒有出現
- 爽約記錄永久保留
- 技師可以看到客戶的爽約次數
- 管理員可以在後台標記或撤銷爽約記錄

## 技術棧

- **後端**：Node.js + Express
- **數據庫**：PostgreSQL
- **Telegram Bot**：Telegraf
- **企業微信 API**：HTTP API
- **前端管理**：EJS 模板 + 原生 JavaScript

## 環境變量

創建 `.env` 文件並設置以下變量：

```env
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/tryme

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

## 安裝和運行

### 本地開發

1. 克隆項目
```bash
git clone https://github.com/whitechocball/tryme-booking.git
cd tryme-booking
```

2. 安裝依賴
```bash
npm install
```

3. 運行數據庫遷移
```bash
npm run migrate
```

4. 啟動開發服務器
```bash
npm run dev
```

5. 訪問應用
- 管理後台：http://localhost:3000/admin
- API：http://localhost:3000/api

### 部署到 Railway

1. 推送到 GitHub
```bash
git push origin main
```

2. 在 Railway 上創建新項目
3. 連接 GitHub 倉庫
4. 配置環境變量
5. 添加 PostgreSQL 數據庫
6. 部署

## API 端點

### 預約管理
- `GET /api/bookings` - 獲取所有預約
- `GET /api/bookings/:id` - 獲取特定預約
- `POST /api/bookings/:id/confirm` - 確認預約
- `POST /api/bookings/:id/reject` - 拒絕預約
- `POST /api/bookings/:id/cancel` - 取消預約
- `POST /api/bookings/:id/noshow` - 標記爽約

### 爽約管理
- `GET /api/noshows` - 獲取所有爽約記錄
- `GET /api/noshows/:id` - 獲取特定爽約記錄
- `POST /api/noshows` - 創建爽約記錄
- `DELETE /api/noshows/:id` - 刪除爽約記錄

### 場所管理
- `GET /api/locations` - 獲取所有場所
- `POST /api/locations` - 創建場所
- `PUT /api/locations/:id` - 更新場所
- `DELETE /api/locations/:id` - 刪除場所

### 技師管理
- `GET /api/therapists` - 獲取所有技師
- `POST /api/therapists` - 創建技師
- `PUT /api/therapists/:id` - 更新技師
- `DELETE /api/therapists/:id` - 刪除技師

### 客戶管理
- `GET /api/customers` - 獲取所有客戶
- `GET /api/customers/:id` - 獲取特定客戶

## 後台管理頁面

訪問 `http://localhost:3000/admin` 進入管理後台

### 功能模塊
- **儀表板**：查看今日統計和最近預約
- **預約管理**：查看和管理所有預約
- **爽約管理**：查看和撤銷爽約記錄
- **場所管理**：新增、編輯、刪除場所
- **技師管理**：新增、編輯、刪除技師，設置 VIP 狀態
- **客戶管理**：查看客戶信息和爽約記錄

## 數據庫架構

### 主要表
- `locations` - 場所
- `therapists` - 技師
- `customers` - 客戶
- `bookings` - 預約
- `no_shows` - 爽約記錄
- `booking_stats` - 預約統計
- `time_options` - 時間段配置

## 未來功能

- [ ] Stripe 支付集成
- [ ] 爽約客戶預付費
- [ ] 高級統計報表
- [ ] 技師排名和評分
- [ ] 自動定時報告

## 許可證

MIT

## 聯繫方式

如有問題或建議，請提交 Issue 或 Pull Request。
