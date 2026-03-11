# Tryme 部署檢查清單

## GitHub 推送 ✅

- [x] 代碼已推送到 GitHub
- [x] 倉庫地址：https://github.com/whitechocball/tryme-booking
- [x] 分支：main
- [x] 所有文件已提交

## Railway 配置清單

### 項目設置
- [ ] 在 Railway 上創建新項目
- [ ] 連接 GitHub 倉庫 (whitechocball/tryme-booking)
- [ ] 啟用自動部署

### 數據庫設置
- [ ] 添加 PostgreSQL 服務
- [ ] 確認 DATABASE_URL 環境變量已自動設置
- [ ] 運行數據庫遷移：`npm run migrate`

### 環境變量配置
在 Railway 項目設置中配置以下變量：

#### 服務器配置
- [ ] `PORT` = 3000
- [ ] `NODE_ENV` = production

#### Telegram 配置
- [ ] `TELEGRAM_API_ID` = 34859690
- [ ] `TELEGRAM_API_HASH` = 743581d27f2fbc7e82281350a5fe69db
- [ ] `TELEGRAM_BOT_TOKEN` = 8670236056:AAHYnRIv9IrzbaIuJgG8OZ0NC5DdEUFeQ8I

#### 企業微信配置
- [ ] `WECHAT_CORP_ID` = ww6ccfc2612e6f75fd
- [ ] `WECHAT_AGENT_ID` = 1000002
- [ ] `WECHAT_SECRET` = DnCK0s-xwkaTA0CGB0mlISGIieMTxM45HKA4Xeo2Uh0

#### 管理員配置
- [ ] `ADMIN_USERNAME` = admin
- [ ] `ADMIN_PASSWORD` = tryme2024

### 部署驗證
- [ ] 應用成功部署
- [ ] 健康檢查端點可訪問：`/health`
- [ ] 管理後台可訪問：`/admin`
- [ ] 日誌中沒有錯誤

### 功能測試
- [ ] Telegram Bot 可以接收 `/start` 命令
- [ ] Telegram Bot 可以接收 `/book` 命令
- [ ] 數據庫連接正常
- [ ] 企業微信 API 可以連接

## 初始化數據

運行以下命令初始化測試數據（可選）：

### 1. 添加場所

```bash
curl -X POST https://your-app.railway.app/api/locations \
  -H "Content-Type: application/json" \
  -d '{
    "code": "007",
    "name": "黃金海岸",
    "description": "深圳黃金海岸分店"
  }'
```

### 2. 添加技師

```bash
curl -X POST https://your-app.railway.app/api/therapists \
  -H "Content-Type: application/json" \
  -d '{
    "name": "張醫生",
    "locationId": 1,
    "wechatId": "therapist_wechat_id",
    "isVip": false
  }'
```

## 監控和維護

- [ ] 設置日誌監控
- [ ] 設置性能告警
- [ ] 定期檢查數據庫大小
- [ ] 定期備份數據庫

## 文檔更新

- [ ] 更新 README.md 中的應用 URL
- [ ] 記錄 Railway 項目 ID
- [ ] 記錄數據庫連接信息（僅供內部使用）

## 上線後步驟

1. **通知用戶**
   - [ ] 通知 Telegram 用戶新的 Bot 地址
   - [ ] 通知技師新的企業微信通知系統

2. **監控**
   - [ ] 監控應用日誌
   - [ ] 監控 Telegram Bot 活動
   - [ ] 監控數據庫性能

3. **備份**
   - [ ] 配置自動備份
   - [ ] 測試備份恢復流程

## 故障排查

如遇到問題，請檢查：

1. **應用無法啟動**
   - 檢查 `npm start` 命令是否正確
   - 檢查依賴是否已安裝
   - 檢查 Node.js 版本

2. **數據庫連接失敗**
   - 檢查 `DATABASE_URL` 環境變量
   - 確認 PostgreSQL 服務已添加
   - 檢查數據庫遷移是否完成

3. **Telegram Bot 不工作**
   - 檢查 `TELEGRAM_BOT_TOKEN` 是否正確
   - 檢查應用日誌中的錯誤
   - 確認 Bot 已啟動

4. **企業微信通知失敗**
   - 檢查企業微信憑證是否正確
   - 檢查技師的企業微信 ID 是否設置
   - 檢查應用日誌中的 API 錯誤

## 聯繫方式

如有問題，請：
- 查看應用日誌
- 檢查 Railway 控制台
- 參考 RAILWAY_DEPLOYMENT.md 文檔
