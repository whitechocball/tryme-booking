-- 添加 booking_code 欄位（格式：20260315-1430）
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(20);

-- 添加技師號碼欄位
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS display_number VARCHAR(20);

-- 為 booking_code 創建索引
CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings(booking_code);

-- 更新現有預約的 booking_code（基於 created_at）
UPDATE bookings 
SET booking_code = TO_CHAR(created_at, 'YYYYMMDD') || '-' || TO_CHAR(created_at, 'HH24MI')
WHERE booking_code IS NULL;

-- 將舊狀態映射到新狀態
-- pending -> waiting_therapist（等待技師回覆）
-- confirmed -> waiting_service（等待進入服務）
-- completed -> completed（已完成服務）
-- cancelled -> therapist_cancelled（技師取消）
-- rejected -> therapist_cancelled（技師取消）
UPDATE bookings SET status = 'waiting_therapist' WHERE status = 'pending';
UPDATE bookings SET status = 'waiting_service' WHERE status = 'confirmed';
UPDATE bookings SET status = 'therapist_cancelled' WHERE status = 'rejected';
UPDATE bookings SET status = 'therapist_cancelled' WHERE status = 'cancelled';
