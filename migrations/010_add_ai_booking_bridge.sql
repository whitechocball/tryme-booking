-- 新增 AI 預約會話表
CREATE TABLE IF NOT EXISTS ai_booking_sessions (
  id SERIAL PRIMARY KEY,
  customer_telegram_id BIGINT NOT NULL,
  current_booking_id INTEGER,
  session_status VARCHAR(50) NOT NULL DEFAULT 'parsing_customer',
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_customer_input TEXT,
  parsed_customer_json JSONB,
  raw_technician_reply TEXT,
  parsed_technician_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ai_booking_sessions_telegram_id ON ai_booking_sessions(customer_telegram_id);
CREATE INDEX IF NOT EXISTS idx_ai_booking_sessions_status ON ai_booking_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_ai_booking_sessions_booking_id ON ai_booking_sessions(current_booking_id);

-- 技師表新增 wechat_userid 欄位（企業微信用戶 ID，用於發送應用消息）
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_userid VARCHAR(255);

-- 擴展 bookings.status 欄位長度以支持新狀態
ALTER TABLE bookings ALTER COLUMN status TYPE VARCHAR(50);

-- 預約表新增 ai_session_id 欄位（關聯 AI 會話）
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ai_session_id INTEGER;

-- 預約表新增 booking_time 欄位（具體預約時間，如 15:00:00）
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_time VARCHAR(20);
