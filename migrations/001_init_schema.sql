-- 場所表
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 技師表
CREATE TABLE IF NOT EXISTS therapists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  wechat_id VARCHAR(100), -- 企業微信帳號（已棄用，改用 external_user_id）
  external_user_id VARCHAR(100), -- 外部聯繫人 ID（技師的普通微信用戶 ID）
  is_vip BOOLEAN DEFAULT FALSE,
  available_time_slots TEXT, -- JSON: {"monday": ["morning", "afternoon", "evening"], ...}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 客戶表
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(100),
  phone VARCHAR(20),
  no_show_count INTEGER DEFAULT 0, -- 爽約次數
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 預約表
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  therapist_id INTEGER NOT NULL REFERENCES therapists(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  booking_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL, -- 'morning', 'afternoon', 'evening'
  time_option VARCHAR(5) NOT NULL, -- 'A', 'B', 'C', 'D', 'E'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'rejected', 'completed', 'cancelled'
  therapist_response_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(therapist_id, booking_date, time_slot, time_option)
);

-- 爽約記錄表
CREATE TABLE IF NOT EXISTS no_shows (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  therapist_id INTEGER NOT NULL REFERENCES therapists(id),
  no_show_date DATE NOT NULL,
  reason VARCHAR(255),
  reported_by VARCHAR(20) DEFAULT 'system', -- 'therapist', 'admin', 'system'
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Stripe 支付相關欄位（預留）
  stripe_payment_required BOOLEAN DEFAULT FALSE,
  stripe_payment_id VARCHAR(100),
  stripe_payment_status VARCHAR(20), -- 'pending', 'completed', 'failed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 預約統計表（用於快速查詢）
CREATE TABLE IF NOT EXISTS booking_stats (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  therapist_id INTEGER NOT NULL REFERENCES therapists(id),
  booking_count INTEGER DEFAULT 0,
  last_booking_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, therapist_id)
);

-- 時間段配置表
CREATE TABLE IF NOT EXISTS time_options (
  id SERIAL PRIMARY KEY,
  time_slot VARCHAR(20) NOT NULL, -- 'morning', 'afternoon', 'evening'
  option_letter VARCHAR(1) NOT NULL, -- 'A', 'B', 'C', 'D', 'E'
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(time_slot, option_letter)
);

-- 索引
CREATE INDEX idx_customers_telegram_id ON customers(telegram_id);
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_therapist_id ON bookings(therapist_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_no_shows_customer_id ON no_shows(customer_id);
CREATE INDEX idx_no_shows_therapist_id ON no_shows(therapist_id);
CREATE INDEX idx_no_shows_date ON no_shows(no_show_date);
CREATE INDEX idx_therapists_location_id ON therapists(location_id);
