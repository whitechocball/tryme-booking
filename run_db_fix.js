const { Pool } = require('pg');

// 從環境變量讀取數據庫連接字符串
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 環境變量未設置');
  process.exit(1);
}

console.log('📦 正在連接數據庫...');
const pool = new Pool({ connectionString: DATABASE_URL });

const alterStatements = [
  // therapists 表
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS display_number VARCHAR(50)",
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_start_time VARCHAR(10)",
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_end_time VARCHAR(10)",
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_primary VARCHAR(100)",
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_secondary VARCHAR(100)",
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)",
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS profile_pic_url TEXT",
  "ALTER TABLE therapists ADD COLUMN IF NOT EXISTS current_location_id INTEGER",
  
  // bookings 表
  "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(50)",
  
  // no_shows 表
  "ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS therapist_notes TEXT",
  "ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
  
  // venues 表
  "ALTER TABLE venues ADD COLUMN IF NOT EXISTS description TEXT",
  "ALTER TABLE venues ADD COLUMN IF NOT EXISTS map_url TEXT",
  "ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_code VARCHAR(50)"
];

async function executeAlterStatements() {
  try {
    for (const stmt of alterStatements) {
      try {
        console.log(`⏳ 執行: ${stmt.substring(0, 60)}...`);
        await pool.query(stmt);
        console.log(`✅ 成功`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`⏭️  列已存在，跳過`);
        } else {
          console.error(`❌ 錯誤: ${error.message}`);
        }
      }
    }
    
    console.log('\n✅ 所有 ALTER TABLE 語句已執行完成！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 執行失敗:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

executeAlterStatements();
