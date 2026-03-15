-- 確保 therapists 表中有 display_number 欄位
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='display_number') THEN
        ALTER TABLE therapists ADD COLUMN display_number VARCHAR(20);
    END IF;
END $$;
