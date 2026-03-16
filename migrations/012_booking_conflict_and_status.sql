-- 012: 預約衝突檢測 & 預約狀態完整流程

-- 添加 has_conflict 標記欄位（用於管理後台標記衝突預約）
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN DEFAULT FALSE;

-- 添加 timeout_notified 標記（技師超時未回覆是否已通知客戶）
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS timeout_notified BOOLEAN DEFAULT FALSE;

-- 添加 status_changed_at 記錄狀態變更時間
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 添加 cancel_reason 取消原因
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 創建衝突檢測索引（加速衝突查詢）
CREATE INDEX IF NOT EXISTS idx_bookings_therapist_date_slot 
  ON bookings(therapist_id, booking_date, time_slot, time_option);

-- 創建狀態+日期複合索引
CREATE INDEX IF NOT EXISTS idx_bookings_status_date 
  ON bookings(status, booking_date);
