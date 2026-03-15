-- 添加技師爽約備註欄位
DO $$ 
BEGIN 
    -- 添加 therapist_notes（技師爽約備註）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='no_shows' AND column_name='therapist_notes') THEN
        ALTER TABLE no_shows ADD COLUMN therapist_notes TEXT;
    END IF;
    
    -- 添加 updated_at（更新時間）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='no_shows' AND column_name='updated_at') THEN
        ALTER TABLE no_shows ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;
