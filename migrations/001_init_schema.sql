-- ============================================================
-- Tryme 預約系統 - 完整數據庫 Schema（整合版）
-- 此檔案包含所有表結構、索引和初始數據
-- ============================================================

-- 場所表
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  map_url TEXT,
  venue_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 技師表
CREATE TABLE IF NOT EXISTS therapists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  display_number VARCHAR(50),
  wechat_id VARCHAR(100),
  external_user_id VARCHAR(100),
  wechat_id_primary VARCHAR(100),
  wechat_id_secondary VARCHAR(100),
  wechat_userid VARCHAR(255),
  phone_number VARCHAR(20),
  profile_pic_url TEXT,
  work_start_time VARCHAR(10),
  work_end_time VARCHAR(10),
  current_location_id INTEGER,
  telegram_id VARCHAR(100),
  is_vip BOOLEAN DEFAULT FALSE,
  available_time_slots TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 客戶表
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(100),
  phone VARCHAR(20),
  no_show_count INTEGER DEFAULT 0,
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
  time_slot VARCHAR(20) NOT NULL,
  time_option VARCHAR(5) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  booking_code VARCHAR(50),
  booking_time VARCHAR(20),
  ai_session_id INTEGER,
  has_conflict BOOLEAN DEFAULT FALSE,
  timeout_notified BOOLEAN DEFAULT FALSE,
  status_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancel_reason TEXT,
  therapist_response_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 爽約記錄表
CREATE TABLE IF NOT EXISTS no_shows (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  therapist_id INTEGER NOT NULL REFERENCES therapists(id),
  no_show_date DATE NOT NULL,
  reason VARCHAR(255),
  reported_by VARCHAR(20) DEFAULT 'system',
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  therapist_notes TEXT,
  stripe_payment_required BOOLEAN DEFAULT FALSE,
  stripe_payment_id VARCHAR(100),
  stripe_payment_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 預約統計表
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
  time_slot VARCHAR(20) NOT NULL,
  option_letter VARCHAR(1) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(time_slot, option_letter)
);

-- 技師歷史記錄表
CREATE TABLE IF NOT EXISTS therapist_history (
  id SERIAL PRIMARY KEY,
  therapist_id INTEGER NOT NULL REFERENCES therapists(id),
  location_id INTEGER REFERENCES locations(id),
  display_number VARCHAR(50),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI 預約會話表
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

-- ============================================================
-- 索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_telegram_id ON customers(telegram_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_therapist_id ON bookings(therapist_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings(booking_code);
CREATE INDEX IF NOT EXISTS idx_bookings_therapist_date_slot ON bookings(therapist_id, booking_date, time_slot, time_option);
CREATE INDEX IF NOT EXISTS idx_bookings_status_date ON bookings(status, booking_date);
CREATE INDEX IF NOT EXISTS idx_no_shows_customer_id ON no_shows(customer_id);
CREATE INDEX IF NOT EXISTS idx_no_shows_therapist_id ON no_shows(therapist_id);
CREATE INDEX IF NOT EXISTS idx_no_shows_date ON no_shows(no_show_date);
CREATE INDEX IF NOT EXISTS idx_therapists_location_id ON therapists(location_id);
CREATE INDEX IF NOT EXISTS idx_therapist_history_therapist_id ON therapist_history(therapist_id);
CREATE INDEX IF NOT EXISTS idx_therapist_history_location_id ON therapist_history(location_id);
CREATE INDEX IF NOT EXISTS idx_ai_booking_sessions_telegram_id ON ai_booking_sessions(customer_telegram_id);
CREATE INDEX IF NOT EXISTS idx_ai_booking_sessions_status ON ai_booking_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_ai_booking_sessions_booking_id ON ai_booking_sessions(current_booking_id);
