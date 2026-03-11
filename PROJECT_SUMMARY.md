# Tryme 技師預約管理系統 - 項目總結

## 項目概述

**Tryme** 是一個完整的技師預約管理系統，專為深圳物理治療師平台設計。該系統集成了 Telegram Bot 客戶端、企業微信技師通知、完整的後台管理頁面，以及爽約記錄管理功能。

## 核心功能

### 1. Telegram Bot 預約流程

客戶通過 Telegram Bot 進行預約，流程如下：

1. 客戶輸入 `/book` 命令
2. 系統顯示場所列表
3. 客戶選擇場所
4. 系統顯示該場所的技師列表
5. 客戶選擇技師
6. 客戶選擇時段（早上/中午/晚上）
7. 系統提供具體時間選項（A/B/C/D/E）
8. 客戶選擇時間並確認預約
9. 系統通過企業微信通知技師有新預約

### 2. 企業微信技師通知

技師收到預約通知時會看到：
- 客戶名稱
- 場所名稱
- 預約日期和時間
- 該客戶與此技師的預約次數
- 該客戶在整個平台的爽約次數

技師可以在企業微信中回覆接受或拒絕預約。

### 3. 爽約管理

**爽約定義**：預約服務前 1 小時內沒有取消，且沒有出現。

**爽約規則**：
- 爽約記錄永久保留
- 技師可以看到客戶的爽約次數
- 管理員可以在後台標記或撤銷爽約記錄
- 為未來的 Stripe 支付功能預留數據庫結構

### 4. 後台管理頁面

完整的 Web 管理界面，包含以下模塊：

| 模塊 | 功能 |
|------|------|
| 儀表板 | 查看今日統計、預約情況、技師排名 |
| 預約管理 | 查看、篩選、管理所有預約 |
| 爽約管理 | 查看爽約記錄、撤銷爽約 |
| 場所管理 | 新增、編輯、刪除場所 |
| 技師管理 | 新增、編輯、刪除技師、設置 VIP 狀態 |
| 客戶管理 | 查看客戶信息和爽約記錄 |

## 技術架構

### 後端技術棧

| 組件 | 技術 | 版本 |
|------|------|------|
| 運行環境 | Node.js | 14+ |
| Web 框架 | Express | 5.x |
| 數據庫 | PostgreSQL | 12+ |
| Telegram Bot | Telegraf | 4.x |
| 企業微信 API | HTTP API | v1 |
| 模板引擎 | EJS | 5.x |

### 項目結構

```
tryme/
├── src/
│   ├── index.js                 # 主應用入口
│   ├── bot/
│   │   └── bookingBot.js        # Telegram Bot 實現
│   ├── api/
│   │   ├── bookingRoutes.js     # 預約 API
│   │   ├── noshowRoutes.js      # 爽約 API
│   │   ├── locationRoutes.js    # 場所 API
│   │   ├── therapistRoutes.js   # 技師 API
│   │   └── customerRoutes.js    # 客戶 API
│   ├── models/
│   │   ├── booking.js           # 預約數據模型
│   │   ├── noshow.js            # 爽約數據模型
│   │   ├── location.js          # 場所數據模型
│   │   ├── therapist.js         # 技師數據模型
│   │   └── customer.js          # 客戶數據模型
│   ├── services/
│   │   └── bookingService.js    # 預約業務邏輯
│   └── utils/
│       ├── db.js                # 數據庫連接
│       ├── logger.js            # 日誌工具
│       ├── telegram.js          # Telegram 工具
│       └── wechat.js            # 企業微信工具
├── views/
│   └── admin/                   # 後台管理頁面
│       ├── dashboard.ejs        # 儀表板
│       ├── bookings.ejs         # 預約管理
│       ├── noshows.ejs          # 爽約管理
│       ├── locations.ejs        # 場所管理
│       ├── therapists.ejs       # 技師管理
│       └── customers.ejs        # 客戶管理
├── migrations/
│   ├── 001_init_schema.sql      # 數據庫初始化
│   └── run.js                   # 遷移運行器
├── package.json                 # 項目配置
├── .env                         # 環境變量
├── Procfile                     # Railway 進程文件
├── railway.json                 # Railway 配置
└── README.md                    # 項目文檔
```

## 數據庫架構

### 主要表結構

| 表名 | 用途 | 關鍵字段 |
|------|------|--------|
| `locations` | 場所信息 | code, name, description |
| `therapists` | 技師信息 | name, location_id, wechat_id, is_vip |
| `customers` | 客戶信息 | telegram_id, name, no_show_count |
| `bookings` | 預約記錄 | customer_id, therapist_id, booking_date, status |
| `no_shows` | 爽約記錄 | booking_id, customer_id, therapist_id, no_show_date |
| `booking_stats` | 預約統計 | customer_id, therapist_id, booking_count |
| `time_options` | 時間段配置 | time_slot, option_letter, start_time, end_time |

### 關鍵索引

- `customers.telegram_id` - 快速查詢客戶
- `bookings.customer_id` - 快速查詢客戶預約
- `bookings.therapist_id` - 快速查詢技師預約
- `bookings.status` - 按狀態篩選預約
- `no_shows.customer_id` - 快速查詢客戶爽約記錄
- `therapists.location_id` - 快速查詢場所技師

## API 端點

### 預約管理

- `GET /api/bookings` - 獲取所有預約（支持篩選）
- `GET /api/bookings/:id` - 獲取特定預約
- `POST /api/bookings/:id/confirm` - 技師確認預約
- `POST /api/bookings/:id/reject` - 技師拒絕預約
- `POST /api/bookings/:id/cancel` - 客戶取消預約
- `POST /api/bookings/:id/noshow` - 標記爽約
- `GET /api/bookings/stats/daily` - 獲取日統計

### 爽約管理

- `GET /api/noshows` - 獲取所有爽約記錄
- `GET /api/noshows/:id` - 獲取特定爽約記錄
- `POST /api/noshows` - 創建爽約記錄
- `DELETE /api/noshows/:id` - 刪除爽約記錄
- `GET /api/noshows/customer/:customerId` - 獲取客戶爽約記錄
- `GET /api/noshows/therapist/:therapistId` - 獲取技師爽約記錄

### 場所管理

- `GET /api/locations` - 獲取所有場所
- `GET /api/locations/:id` - 獲取特定場所
- `POST /api/locations` - 創建場所
- `PUT /api/locations/:id` - 更新場所
- `DELETE /api/locations/:id` - 刪除場所

### 技師管理

- `GET /api/therapists` - 獲取所有技師
- `GET /api/therapists/:id` - 獲取特定技師
- `POST /api/therapists` - 創建技師
- `PUT /api/therapists/:id` - 更新技師
- `DELETE /api/therapists/:id` - 刪除技師
- `GET /api/therapists/:id/noshows` - 獲取技師爽約記錄

### 客戶管理

- `GET /api/customers` - 獲取所有客戶
- `GET /api/customers/:id` - 獲取特定客戶
- `GET /api/customers/:id/noshows` - 獲取客戶爽約記錄
- `GET /api/customers/:id/bookings` - 獲取客戶預約記錄

## 部署信息

### GitHub 倉庫

- **地址**：https://github.com/whitechocball/tryme-booking
- **分支**：main
- **可見性**：Public

### Railway 部署

- **部署方式**：GitHub 自動部署
- **數據庫**：Railway PostgreSQL
- **環境變量**：已配置
- **構建命令**：`npm install`
- **啟動命令**：`npm start`

### 環境變量配置

| 變量 | 值 | 說明 |
|------|-----|------|
| `PORT` | 3000 | 應用端口 |
| `NODE_ENV` | production | 環境 |
| `DATABASE_URL` | postgresql://... | 數據庫連接 |
| `TELEGRAM_BOT_TOKEN` | 8670236056:... | Telegram Bot Token |
| `WECHAT_CORP_ID` | ww6ccfc2612e6f75fd | 企業微信企業ID |
| `WECHAT_AGENT_ID` | 1000002 | 企業微信應用ID |
| `WECHAT_SECRET` | DnCK0s-... | 企業微信應用密鑰 |

## 文檔

項目包含以下文檔：

| 文檔 | 內容 |
|------|------|
| `README.md` | 項目概述和快速開始 |
| `RAILWAY_DEPLOYMENT.md` | Railway 部署詳細指南 |
| `DEPLOYMENT_CHECKLIST.md` | 部署檢查清單 |
| `SETUP_AND_TESTING.md` | 本地開發和測試指南 |
| `PROJECT_SUMMARY.md` | 項目總結（本文件） |

## 未來功能

### 第二階段（已預留框架）

- **Stripe 支付集成**
  - 爽約客戶預付費
  - 技師 VIP 服務費支付
  - 爽約記錄刪除支付

### 第三階段

- 高級統計報表
- 技師排名和評分系統
- 自動定時報告
- 短信和郵件通知
- 移動端應用

## 部署步驟

### 快速部署

1. **在 Railway 上創建項目**
   - 訪問 https://railway.app
   - 點擊 "New Project"
   - 選擇 "Deploy from GitHub"
   - 授權並選擇 `tryme-booking` 倉庫

2. **配置數據庫**
   - 添加 PostgreSQL 服務
   - 自動設置 `DATABASE_URL` 環境變量

3. **配置環境變量**
   - 在 Railway 項目設置中添加所有必要的環境變量
   - 參考上表的環境變量配置

4. **運行數據庫遷移**
   ```bash
   railway run npm run migrate
   ```

5. **驗證部署**
   - 訪問應用 URL
   - 檢查 `/health` 端點
   - 訪問 `/admin` 管理後台

詳細步驟請參考 `RAILWAY_DEPLOYMENT.md`。

## 測試

### 本地測試

```bash
# 安裝依賴
npm install

# 運行數據庫遷移
npm run migrate

# 啟動開發服務器
npm run dev

# 訪問應用
# http://localhost:3000/admin
```

### 功能測試

詳見 `SETUP_AND_TESTING.md` 中的完整測試指南。

## 支持和聯繫

- **GitHub Issues**：https://github.com/whitechocball/tryme-booking/issues
- **文檔**：查看項目中的 markdown 文檔
- **日誌**：查看應用日誌進行故障排查

## 許可證

MIT License

## 項目統計

| 指標 | 數值 |
|------|------|
| 源代碼文件 | 34 個 |
| 數據庫表 | 7 個 |
| API 端點 | 25+ 個 |
| 管理頁面 | 6 個 |
| 總代碼行數 | ~6,500 行 |

## 完成日期

- **項目創建**：2024 年 3 月 11 日
- **初始部署**：準備就緒，等待 Railway 部署
- **最後更新**：2024 年 3 月 11 日

---

**項目狀態**：✅ 開發完成，準備部署

所有代碼已推送到 GitHub，可以直接在 Railway 上部署。按照 `RAILWAY_DEPLOYMENT.md` 中的步驟進行部署。
