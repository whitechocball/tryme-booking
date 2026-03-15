const db = require('./db');

/**
 * 確保所有必需的列都存在
 */
async function ensureColumns() {
  const statements = [
    // bookings 表
    'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(20)',
    
    // therapists 表
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS display_number VARCHAR(20)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_primary VARCHAR(100)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_secondary VARCHAR(100)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS profile_pic_url TEXT',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_start_time TIME',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_end_time TIME',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS current_location_id INTEGER',
    
    // no_shows 表
    'ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS therapist_notes TEXT',
    'ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP',
    
    // locations 表
    'ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT',
    'ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_url TEXT',
    'ALTER TABLE locations ADD COLUMN IF NOT EXISTS venue_code VARCHAR(50)',
  ];

  console.log('🔄 確保所有數據庫列存在...');
  
  for (const stmt of statements) {
    try {
      await db.query(stmt);
      const colMatch = stmt.match(/ADD COLUMN IF NOT EXISTS (\w+)/);
      const colName = colMatch ? colMatch[1] : 'unknown';
      console.log(`  ✓ ${colName}`);
    } catch (error) {
      const colMatch = stmt.match(/ADD COLUMN IF NOT EXISTS (\w+)/);
      const colName = colMatch ? colMatch[1] : 'unknown';
      console.log(`  ⚠ ${colName}: ${error.message.substring(0, 40)}`);
    }
  }
  
  console.log('✅ 列檢查完成\n');
}

module.exports = { ensureColumns };
