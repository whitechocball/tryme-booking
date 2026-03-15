const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.internal') 
    ? false 
    : { rejectUnauthorized: false }
});

const migrations = [
  // 確保 booking_code 列存在
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(20)`,
  
  // 確保 therapists 表的所有列
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS display_number VARCHAR(20)`,
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_primary VARCHAR(100)`,
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_secondary VARCHAR(100)`,
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)`,
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS profile_pic_url TEXT`,
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_start_time TIME`,
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_end_time TIME`,
  `ALTER TABLE therapists ADD COLUMN IF NOT EXISTS current_location_id INTEGER`,
  
  // 確保 no_shows 表的所有列
  `ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS therapist_notes TEXT`,
  `ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
  
  // 確保 locations 表的所有列
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_url TEXT`,
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS venue_code VARCHAR(50)`,
  
  // 創建 therapist_history 表
  `CREATE TABLE IF NOT EXISTS therapist_history (
    id SERIAL PRIMARY KEY,
    therapist_id INTEGER NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    display_number VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // 創建索引
  `CREATE INDEX IF NOT EXISTS idx_therapist_history_therapist_id ON therapist_history(therapist_id)`,
  `CREATE INDEX IF NOT EXISTS idx_therapist_history_location_id ON therapist_history(location_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings(booking_code)`
];

async function runMigrations() {
  try {
    console.log('🔄 開始執行強制遷移...\n');
    
    for (const migration of migrations) {
      try {
        console.log(`⏳ 執行: ${migration.substring(0, 70)}...`);
        await pool.query(migration);
        console.log(`✅ 成功\n`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`⏭️  已存在，跳過\n`);
        } else {
          console.error(`❌ 錯誤: ${error.message}\n`);
        }
      }
    }
    
    console.log('✅ 所有遷移已完成！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 遷移失敗:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
