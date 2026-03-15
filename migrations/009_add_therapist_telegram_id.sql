-- 為技師表添加 telegram_id 欄位
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100);
