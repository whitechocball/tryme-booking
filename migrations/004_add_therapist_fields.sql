-- 添加技師表的新欄位
DO $$ 
BEGIN 
    -- 添加 display_number（工號）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='display_number') THEN
        ALTER TABLE therapists ADD COLUMN display_number VARCHAR(20);
    END IF;
    
    -- 添加 wechat_id（微信ID）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='wechat_id') THEN
        ALTER TABLE therapists ADD COLUMN wechat_id VARCHAR(100);
    END IF;
    
    -- 添加 profile_pic_url（頭像URL）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='profile_pic_url') THEN
        ALTER TABLE therapists ADD COLUMN profile_pic_url TEXT;
    END IF;
    
    -- 添加 work_start_time（上班時間）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='work_start_time') THEN
        ALTER TABLE therapists ADD COLUMN work_start_time TIME;
    END IF;
    
    -- 添加 work_end_time（下班時間）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='work_end_time') THEN
        ALTER TABLE therapists ADD COLUMN work_end_time TIME;
    END IF;
END $$;
