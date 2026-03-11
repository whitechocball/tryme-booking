# Tryme 系統設置和測試指南

## 本地開發環境設置

### 前置要求

- Node.js 14+ 和 npm
- PostgreSQL 12+
- Git
- 文本編輯器（VS Code 推薦）

### 安裝步驟

#### 1. 克隆倉庫

```bash
git clone https://github.com/whitechocball/tryme-booking.git
cd tryme-booking
```

#### 2. 安裝依賴

```bash
npm install
```

#### 3. 配置環境變量

複製 `.env.example` 為 `.env`（如果存在），或直接編輯 `.env`：

```bash
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL - 本地開發
DATABASE_URL=postgresql://postgres:password@localhost:5432/tryme

# Telegram
TELEGRAM_API_ID=34859690
TELEGRAM_API_HASH=743581d27f2fbc7e82281350a5fe69db
TELEGRAM_BOT_TOKEN=8670236056:AAHYnRIv9IrzbaIuJgG8OZ0NC5DdEUFeQ8I

# WeChat Work
WECHAT_CORP_ID=ww6ccfc2612e6f75fd
WECHAT_AGENT_ID=1000002
WECHAT_SECRET=DnCK0s-xwkaTA0CGB0mlISGIieMTxM45HKA4Xeo2Uh0

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tryme2024
```

#### 4. 創建數據庫

```bash
# 使用 psql 連接到 PostgreSQL
psql -U postgres

# 在 psql 中執行
CREATE DATABASE tryme;
\q
```

#### 5. 運行數據庫遷移

```bash
npm run migrate
```

#### 6. 啟動開發服務器

```bash
npm run dev
```

應用將在 `http://localhost:3000` 啟動。

## 系統測試

### 1. 健康檢查

```bash
curl http://localhost:3000/health
```

預期響應：
```json
{
  "status": "ok",
  "timestamp": "2024-03-11T10:00:00.000Z"
}
```

### 2. 初始化測試數據

#### 添加場所

```bash
curl -X POST http://localhost:3000/api/locations \
  -H "Content-Type: application/json" \
  -d '{
    "code": "007",
    "name": "黃金海岸",
    "description": "深圳黃金海岸分店"
  }'
```

預期響應：
```json
{
  "success": true,
  "message": "場所已創建",
  "location": {
    "id": 1,
    "code": "007",
    "name": "黃金海岸",
    "description": "深圳黃金海岸分店",
    "created_at": "2024-03-11T10:00:00.000Z",
    "updated_at": "2024-03-11T10:00:00.000Z"
  }
}
```

#### 添加技師

```bash
curl -X POST http://localhost:3000/api/therapists \
  -H "Content-Type: application/json" \
  -d '{
    "name": "張醫生",
    "locationId": 1,
    "wechatId": "therapist_001",
    "isVip": false
  }'
```

#### 查詢所有場所

```bash
curl http://localhost:3000/api/locations
```

#### 查詢所有技師

```bash
curl http://localhost:3000/api/therapists
```

### 3. Telegram Bot 測試

#### 在 Telegram 中測試

1. 打開 Telegram
2. 搜索您的 Bot（使用 `TELEGRAM_BOT_TOKEN` 中的 Bot 名稱）
3. 發送以下命令進行測試：

| 命令 | 預期結果 |
|------|--------|
| `/start` | Bot 歡迎消息 |
| `/help` | 顯示幫助信息 |
| `/book` | 顯示場所列表 |
| `book` | 同 `/book` |

#### 預約流程測試

1. 發送 `/book`
2. 選擇場所（點擊按鈕）
3. 選擇技師
4. 選擇時段（早上/中午/晚上）
5. 選擇時間選項（A/B/C/D/E）
6. 確認預約

預期結果：
- 預約已提交消息
- 技師收到企業微信通知
- 預約記錄保存到數據庫

### 4. 後台管理頁面測試

訪問 `http://localhost:3000/admin`

#### 儀表板測試

- [ ] 頁面加載成功
- [ ] 顯示今日預約統計
- [ ] 顯示最近預約列表
- [ ] 時間自動更新

#### 預約管理測試

- [ ] 加載所有預約
- [ ] 按日期篩選
- [ ] 按狀態篩選
- [ ] 查看預約詳情
- [ ] 標記爽約

#### 爽約管理測試

- [ ] 加載所有爽約記錄
- [ ] 按日期範圍篩選
- [ ] 撤銷爽約記錄

#### 場所管理測試

- [ ] 新增場所
- [ ] 編輯場所
- [ ] 刪除場所
- [ ] 查看場所列表

#### 技師管理測試

- [ ] 新增技師
- [ ] 編輯技師
- [ ] 刪除技師
- [ ] 設置 VIP 狀態
- [ ] 查看技師列表

#### 客戶管理測試

- [ ] 加載所有客戶
- [ ] 搜索客戶
- [ ] 查看客戶詳情
- [ ] 查看客戶爽約記錄

### 5. API 端點測試

使用 Postman 或 curl 測試以下端點：

#### 預約 API

```bash
# 獲取所有預約
curl http://localhost:3000/api/bookings

# 獲取特定預約
curl http://localhost:3000/api/bookings/1

# 確認預約
curl -X POST http://localhost:3000/api/bookings/1/confirm \
  -H "Content-Type: application/json" \
  -d '{"therapistId": 1}'

# 拒絕預約
curl -X POST http://localhost:3000/api/bookings/1/reject \
  -H "Content-Type: application/json" \
  -d '{"therapistId": 1}'

# 標記爽約
curl -X POST http://localhost:3000/api/bookings/1/noshow \
  -H "Content-Type: application/json" \
  -d '{"reason": "客戶沒有出現"}'
```

#### 爽約 API

```bash
# 獲取所有爽約記錄
curl http://localhost:3000/api/noshows

# 獲取特定爽約記錄
curl http://localhost:3000/api/noshows/1

# 創建爽約記錄
curl -X POST http://localhost:3000/api/noshows \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": 1,
    "customerId": 1,
    "therapistId": 1,
    "noShowDate": "2024-03-11",
    "reason": "客戶沒有出現",
    "reportedBy": "admin"
  }'

# 刪除爽約記錄
curl -X DELETE http://localhost:3000/api/noshows/1
```

### 6. 數據庫測試

```bash
# 連接到數據庫
psql $DATABASE_URL

# 查詢客戶
SELECT * FROM customers;

# 查詢預約
SELECT * FROM bookings;

# 查詢爽約記錄
SELECT * FROM no_shows;

# 查詢技師
SELECT * FROM therapists;

# 查詢場所
SELECT * FROM locations;
```

## 性能測試

### 負載測試

使用 Apache Bench 或 wrk 進行負載測試：

```bash
# 安裝 Apache Bench（macOS）
brew install httpd

# 測試健康檢查端點
ab -n 1000 -c 10 http://localhost:3000/health

# 測試 API 端點
ab -n 1000 -c 10 http://localhost:3000/api/locations
```

### 數據庫性能

```bash
# 檢查索引
SELECT * FROM pg_indexes WHERE tablename = 'bookings';

# 檢查表大小
SELECT pg_size_pretty(pg_total_relation_size('bookings'));

# 查看慢查詢日誌
SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

## 故障排查

### 常見問題

#### 1. 數據庫連接失敗

**症狀**：應用啟動時出現 `ECONNREFUSED` 錯誤

**解決方案**：
```bash
# 檢查 PostgreSQL 是否運行
psql -U postgres -c "SELECT version();"

# 檢查 DATABASE_URL 環境變量
echo $DATABASE_URL

# 確保數據庫存在
psql -U postgres -l | grep tryme
```

#### 2. Telegram Bot 不回應

**症狀**：發送命令給 Bot 沒有反應

**解決方案**：
```bash
# 檢查應用日誌
# 查看是否有 "Telegram Bot 已啟動" 消息

# 檢查 TELEGRAM_BOT_TOKEN
echo $TELEGRAM_BOT_TOKEN

# 驗證 Token 有效性
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe
```

#### 3. 企業微信通知失敗

**症狀**：技師沒有收到預約通知

**解決方案**：
```bash
# 檢查企業微信憑證
echo $WECHAT_CORP_ID
echo $WECHAT_AGENT_ID
echo $WECHAT_SECRET

# 檢查技師的企業微信 ID 是否設置
psql $DATABASE_URL -c "SELECT id, name, wechat_id FROM therapists;"
```

#### 4. 端口已被占用

**症狀**：啟動應用時出現 `EADDRINUSE` 錯誤

**解決方案**：
```bash
# 查找占用端口的進程
lsof -i :3000

# 殺死進程
kill -9 <PID>

# 或使用不同的端口
PORT=3001 npm run dev
```

## 部署前檢查清單

在部署到 Railway 前，請確保：

- [ ] 所有測試都通過
- [ ] 沒有控制台錯誤
- [ ] 數據庫遷移成功
- [ ] Telegram Bot 可以接收消息
- [ ] 企業微信 API 可以連接
- [ ] 管理後台頁面可以訪問
- [ ] 所有環境變量已配置
- [ ] 代碼已推送到 GitHub

## 下一步

完成所有測試後，按照 `RAILWAY_DEPLOYMENT.md` 中的步驟部署到 Railway。
