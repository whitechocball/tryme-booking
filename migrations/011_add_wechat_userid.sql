-- 確保 therapists 表有 wechat_userid 欄位（用於綁定企業微信成員）
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_userid VARCHAR(255);
