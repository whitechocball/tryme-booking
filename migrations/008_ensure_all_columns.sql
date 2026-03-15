-- 確保所有必需的列都存在

-- bookings 表
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(20);

-- therapists 表
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS display_number VARCHAR(20);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_primary VARCHAR(100);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_secondary VARCHAR(100);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_start_time TIME;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_end_time TIME;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS current_location_id INTEGER;

-- no_shows 表
ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS therapist_notes TEXT;
ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- locations 表
ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_url TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS venue_code VARCHAR(50);

-- 為 booking_code 創建索引
CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings(booking_code);

-- 為 therapist_history 創建索引
CREATE INDEX IF NOT EXISTS idx_therapist_history_therapist_id ON therapist_history(therapist_id);
CREATE INDEX IF NOT EXISTS idx_therapist_history_location_id ON therapist_history(location_id);

-- 確保 therapist_history 表存在
CREATE TABLE IF NOT EXISTS therapist_history (
  id SERIAL PRIMARY KEY,
  therapist_id INTEGER NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  display_number VARCHAR(50),
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
