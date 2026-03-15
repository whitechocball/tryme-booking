-- 添加場所描述和地圖連結欄位
ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_url TEXT;
