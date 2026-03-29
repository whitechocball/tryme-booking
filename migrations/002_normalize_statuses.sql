-- ============================================================
-- 數據遷移：將所有舊狀態統一更新為標準狀態
-- 標準狀態枚舉：pending, confirmed, in_progress, completed, cancelled, no_show, rescheduled
-- ============================================================

-- 舊狀態 → pending
UPDATE bookings SET status = 'pending' WHERE status IN ('waiting_therapist', 'pending_technician_confirmation');

-- 舊狀態 → confirmed
UPDATE bookings SET status = 'confirmed' WHERE status IN ('waiting_service');

-- 舊狀態 → cancelled
UPDATE bookings SET status = 'cancelled' WHERE status IN ('rejected', 'rejected_by_technician', 'therapist_cancelled', 'cancelled_by_customer');

-- 舊狀態 → no_show
UPDATE bookings SET status = 'no_show' WHERE status IN ('customer_no_show', 'therapist_no_show');

-- 舊狀態 → rescheduled
UPDATE bookings SET status = 'rescheduled' WHERE status IN ('rescheduled_pending', 'rescheduled_pending_customer_approval');

-- 為缺少 booking_code 的預約補上
UPDATE bookings
SET booking_code = TO_CHAR(created_at, 'YYYYMMDD') || '-' || TO_CHAR(created_at, 'HH24MI') || '-' || LPAD(CAST(id AS TEXT), 4, '0')
WHERE booking_code IS NULL;
