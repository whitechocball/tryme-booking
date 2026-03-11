# Tryme 技師預約管理系統 - 部署完成文檔

## 🎉 部署狀態

✅ **部署成功！** 系統已在 Railway 上完全部署並運行。

## 📍 應用 URL

- **主應用**：https://tryme-app-production.up.railway.app
- **管理後台**：https://tryme-app-production.up.railway.app/admin
- **健康檢查**：https://tryme-app-production.up.railway.app/health
- **企業微信 Webhook**：https://tryme-app-production.up.railway.app/wechat/webhook

## 🏗️ 系統架構

### 後端技術棧
- **框架**：Node.js + Express
- **數據庫**：PostgreSQL 16
- **部署平台**：Railway
- **代碼倉庫**：GitHub (whitechocball/tryme-booking)

### 核心功能模塊

#### 1. Telegram Bot 預約流程
- 客戶通過 Telegram 發起預約請求
- 支持場所選擇、技師選擇、日期和時段選擇
- 自動計算客戶爽約次數並展示給技師

#### 2. 企業微信集成（外部聯繫人方案）
- **技師身份**：普通微信用戶（通過外部聯繫人功能接收消息）
- **消息發送**：使用企業微信外部聯繫人 API
- **消息接收**：通過 webhook 接收技師回覆
- **回覆方式**：技師在微信中回覆「1」(接受) 或「2」(拒絕)

#### 3. 爽約管理系統
- **爽約定義**：預約服務前 1 小時內未取消且未出現
- **爽約記錄**：永久保留，客戶可見
- **技師可見**：預約通知中顯示客戶爽約次數
- **VIP 保障**：VIP 技師被爽約時自動減免服務費

#### 4. 後台管理系統
- 場所管理（新增、編輯、刪除）
- 技師管理（新增、編輯、刪除、設置外部聯繫人 ID、標記 VIP）
- 預約管理（查看、確認、拒絕、取消）
- 爽約管理（查看、標記、撤銷）
- 統計報表（按日期、按技師）

## 🗄️ 數據庫架構

### 主要表結構

#### locations（場所表）
```sql
- id: 主鍵
- code: 場所代碼（如 007）
- name: 場所名稱（如 黃金海岸）
- description: 描述
- created_at, updated_at: 時間戳
```

#### therapists（技師表）
```sql
- id: 主鍵
- name: 技師名稱
- location_id: 所屬場所
- external_user_id: 外部聯繫人 ID（技師的微信用戶 ID）
- wechat_id: 企業微信帳號（已棄用）
- is_vip: VIP 標記
- available_time_slots: 可預約時段（JSON）
- created_at, updated_at: 時間戳
```

#### customers（客戶表）
```sql
- id: 主鍵
- telegram_id: Telegram 用戶 ID
- name: 客戶名稱
- phone: 電話
- no_show_count: 爽約次數
- created_at, updated_at: 時間戳
```

#### bookings（預約表）
```sql
- id: 主鍵
- customer_id: 客戶 ID
- therapist_id: 技師 ID
- location_id: 場所 ID
- booking_date: 預約日期
- time_slot: 時段（morning/afternoon/evening）
- time_option: 具體時間（A/B/C/D/E）
- status: 狀態（pending/confirmed/rejected/completed/cancelled）
- therapist_response_at: 技師回覆時間
- created_at, updated_at: 時間戳
```

#### no_shows（爽約記錄表）
```sql
- id: 主鍵
- booking_id: 預約 ID
- customer_id: 客戶 ID
- therapist_id: 技師 ID
- no_show_date: 爽約日期
- reason: 原因
- reported_by: 報告者（therapist/admin/system）
- reported_at: 報告時間
- stripe_payment_required: Stripe 支付標記（預留）
- stripe_payment_id: Stripe 支付 ID（預留）
- stripe_payment_status: 支付狀態（預留）
- created_at, updated_at: 時間戳
```

#### booking_stats（預約統計表）
```sql
- id: 主鍵
- customer_id: 客戶 ID
- therapist_id: 技師 ID
- booking_count: 預約次數
- last_booking_date: 最後預約日期
- created_at, updated_at: 時間戳
```

#### time_options（時間段配置表）
```sql
- id: 主鍵
- time_slot: 時段（morning/afternoon/evening）
- option_letter: 選項字母（A/B/C/D/E）
- start_time: 開始時間
- end_time: 結束時間
- created_at: 創建時間
```

## 🔧 環境變量配置

在 Railway 上已配置的環境變量：

```
PORT=3000
NODE_ENV=production
DATABASE_URL=postgresql://tryme:tryme_pass_2024@postgres-db.railway.internal:5432/tryme_db
TELEGRAM_API_ID=34859690
TELEGRAM_API_HASH=743581d27f2fbc7e82281350a5fe69db
TELEGRAM_BOT_TOKEN=8670236056:AAHYnRIv9IrzbaIuJgG8OZ0NC5DdEUFeQ8I
WECHAT_CORP_ID=ww6ccfc2612e6f75fd
WECHAT_AGENT_ID=1000002
WECHAT_SECRET=DnCK0s-xwkaTA0CGB0mlISGIieMTxM45HKA4Xeo2Uh0
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tryme2024
WECHAT_WEBHOOK_TOKEN=tryme_webhook_token
WECHAT_ENCODING_AES_KEY=（可選，用於消息加密）
```

## 🔌 API 端點

### 預約相關
- `GET /api/bookings` - 獲取所有預約
- `POST /api/bookings` - 創建預約
- `GET /api/bookings/:id` - 獲取預約詳情
- `PUT /api/bookings/:id/confirm` - 確認預約
- `PUT /api/bookings/:id/reject` - 拒絕預約
- `PUT /api/bookings/:id/cancel` - 取消預約

### 爽約管理
- `GET /api/noshows` - 獲取爽約記錄
- `POST /api/noshows` - 創建爽約記錄
- `DELETE /api/noshows/:id` - 撤銷爽約記錄

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
- `GET /api/customers/:id` - 獲取客戶詳情

### 企業微信 Webhook
- `GET /wechat/webhook` - 驗證 webhook URL
- `POST /wechat/webhook` - 接收技師回覆

## 🔐 企業微信 Webhook 配置

### 配置步驟

1. **在企業微信管理後台**：
   - 進入「應用管理」→「應用」→「選擇應用」
   - 進入「接收消息」設置
   - 設置回調 URL：`https://tryme-app-production.up.railway.app/wechat/webhook`
   - 設置 Token：`tryme_webhook_token`
   - 設置 EncodingAESKey：（可選，用於消息加密）

2. **驗證 URL**：
   - 企業微信會發送驗證請求到上述 URL
   - 系統會自動驗證簽名並返回 echostr

3. **接收消息**：
   - 技師在微信中回覆消息時，企業微信 API 會將消息轉發到 webhook
   - 系統解析消息內容（「1」= 接受，「2」= 拒絕）
   - 自動更新預約狀態並通知客戶

## 📱 技師工作流

1. **接收通知**：
   - 技師在普通微信中收到企業微信發送的預約通知
   - 通知包含：客戶名稱、場所、日期、時段、客戶爽約次數

2. **回覆預約**：
   - 技師在微信中回覆「1」表示接受
   - 技師在微信中回覆「2」表示拒絕
   - 或回覆「預約ID 1」或「預約ID 2」指定預約

3. **系統處理**：
   - 系統通過 webhook 接收回覆
   - 自動更新預約狀態
   - 通過 Telegram 通知客戶結果

## 👥 客戶工作流

1. **發起預約**：
   - 客戶在 Telegram 中輸入 `/book` 或 `book`
   - 選擇場所 → 選擇技師 → 選擇日期和時段

2. **等待確認**：
   - 系統通知技師有新預約
   - 客戶等待技師回覆

3. **接收結果**：
   - 技師接受：Telegram 通知客戶預約已確認
   - 技師拒絕：Telegram 通知客戶預約被拒絕
   - 客戶可在預約前 1 小時內取消預約

4. **爽約處理**：
   - 如果客戶在預約前 1 小時內未取消且未出現，記錄爽約
   - 爽約次數會在下次預約時顯示給技師

## 🚀 部署詳情

### Railway 項目配置
- **項目名稱**：tryme-booking
- **項目 ID**：7fdc4c04-37e3-4c72-bcc6-54eec0d7a24e
- **環境**：production (814db73e-c42a-4108-b03b-c59108b0beb8)

### 服務配置
- **應用服務**：
  - ID：18a76aae-629f-488a-b612-d672105004e8
  - 名稱：tryme-app
  - 源：GitHub (whitechocball/tryme-booking)
  - 分支：main
  - 域名：tryme-app-production.up.railway.app

- **PostgreSQL 服務**：
  - ID：3a537486-eccd-4436-be88-ea5e3725a85d
  - 名稱：postgres-db
  - 鏡像：postgres:16
  - 內部域名：postgres-db.railway.internal

## 📊 監控和日誌

### 應用日誌
- 所有操作都記錄在應用日誌中
- 可在 Railway 控制台查看實時日誌
- 包含：Telegram Bot 活動、企業微信消息、數據庫操作等

### 健康檢查
- 端點：`https://tryme-app-production.up.railway.app/health`
- 返回：`{"status":"ok","timestamp":"..."}`

## 🔄 自動化功能

### 數據庫遷移
- 應用啟動時自動運行數據庫遷移
- 創建所有必要的表和索引
- 插入默認時間段配置

### Telegram Bot
- 應用啟動時自動啟動 Telegram Bot
- 監聽客戶消息並處理預約請求

### 企業微信 Webhook
- 應用運行時持續監聽 webhook 請求
- 接收並處理技師回覆

## 📝 後續步驟

### 第二階段功能（待實現）
1. **Stripe 支付集成**
   - 爽約客戶下次預約需要預付費用
   - 爽約記錄刪除功能（需支付 $69）

2. **定時報告**
   - 每日中午和晚上發送預約統計報告
   - 技師排名和業績統計

3. **高級功能**
   - 客戶評分系統
   - 技師排班管理
   - 自動提醒系統

## 🆘 故障排查

### 應用無法啟動
- 檢查環境變量是否正確配置
- 檢查 PostgreSQL 連接是否正常
- 查看 Railway 日誌了解具體錯誤

### Telegram Bot 無法接收消息
- 確認 TELEGRAM_BOT_TOKEN 正確
- 檢查應用是否正常運行
- 查看日誌中的 Bot 啟動信息

### 企業微信消息無法發送
- 確認 WECHAT_CORP_ID、WECHAT_AGENT_ID、WECHAT_SECRET 正確
- 檢查技師的 external_user_id 是否正確設置
- 查看日誌中的企業微信 API 調用結果

### Webhook 無法接收消息
- 確認 webhook URL 在企業微信後台正確配置
- 確認 WECHAT_WEBHOOK_TOKEN 與企業微信後台設置一致
- 檢查簽名驗證是否通過

## 📞 支持

如有任何問題，請：
1. 查看應用日誌
2. 檢查環境變量配置
3. 參考本文檔的故障排查部分
4. 聯繫開發團隊

---

**部署日期**：2026-03-11
**系統版本**：1.0.0
**最後更新**：2026-03-11
