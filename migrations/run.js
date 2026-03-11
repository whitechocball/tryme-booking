const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  try {
    console.log('開始執行數據庫遷移...');
    
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      console.log(`執行遷移: ${file}`);
      await pool.query(sql);
      console.log(`✓ ${file} 完成`);
    }

    console.log('所有遷移完成！');
    await pool.end();
  } catch (error) {
    console.error('遷移失敗:', error);
    process.exit(1);
  }
}

runMigrations();
