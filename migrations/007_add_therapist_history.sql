-- 添加技師工作歷史表
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

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_therapist_history_therapist_id ON therapist_history(therapist_id);
CREATE INDEX IF NOT EXISTS idx_therapist_history_location_id ON therapist_history(location_id);

-- 添加技師表的新欄位
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_primary VARCHAR(100);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_secondary VARCHAR(100);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS current_location_id INTEGER REFERENCES locations(id);
