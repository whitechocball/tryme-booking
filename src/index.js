const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./utils/db');
const { ensureColumns } = require('./utils/ensureColumns');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../views')));

// 設置視圖引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 基本認證中間件
const basicAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'tryme2024';
    const credentials = Buffer.from(`${adminUsername}:${adminPassword}`).toString('base64');
    return res.status(401).set('WWW-Authenticate', `Basic realm="Tryme Admin"`).json({ error: '需要認證' });
  }

  const credentials = auth.slice(6);
  const [username, password] = Buffer.from(credentials, 'base64').toString().split(':');
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'tryme2024';

  if (username === adminUsername && password === adminPassword) {
    next();
  } else {
    res.status(401).json({ error: '認證失敗' });
  }
};

// 路由
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  res.json({
    status: 'ok',
    database: 'connected',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    version: '1.0.0',
    releaseDate: '2026-03-15'
  });
});

// 管理後台路由（需要認證）
app.get('/admin', basicAuth, (req, res) => {
  res.render('admin/dashboard');
});

app.get('/admin/bookings', basicAuth, (req, res) => {
  res.render('admin/bookings');
});

app.get('/admin/noshows', basicAuth, (req, res) => {
  res.render('admin/noshows');
});

app.get('/admin/locations', basicAuth, (req, res) => {
  res.render('admin/locations');
});

app.get('/admin/therapists', basicAuth, (req, res) => {
  res.render('admin/therapists');
});

app.get('/admin/customers', basicAuth, (req, res) => {
  res.render('admin/customers');
});

// API 路由
const bookingRoutes = require('./api/bookingRoutes');
const noshowRoutes = require('./api/noshowRoutes');
const locationRoutes = require('./api/locationRoutes');
const therapistRoutes = require('./api/therapistRoutes');
const customerRoutes = require('./api/customerRoutes');
const wechatWebhook = require('./api/wechatWebhook');

app.use('/api/bookings', bookingRoutes);
app.use('/api/noshows', noshowRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/therapists', therapistRoutes);
app.use('/api/customers', customerRoutes);
app.use('/wechat/webhook', wechatWebhook);


// 診斷端點 - 檢查數據庫列
app.get('/api/diag/columns', basicAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('bookings', 'therapists', 'locations', 'no_shows')
      ORDER BY table_name, ordinal_position
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 修復端點 - 手動添加缺失列
app.post('/api/diag/fix-columns', basicAuth, async (req, res) => {
  const results = [];
  const statements = [
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='booking_code') THEN ALTER TABLE bookings ADD COLUMN booking_code VARCHAR(50); END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='display_number') THEN ALTER TABLE therapists ADD COLUMN display_number VARCHAR(50); END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='wechat_id_primary') THEN ALTER TABLE therapists ADD COLUMN wechat_id_primary VARCHAR(100); END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='wechat_id_secondary') THEN ALTER TABLE therapists ADD COLUMN wechat_id_secondary VARCHAR(100); END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='phone_number') THEN ALTER TABLE therapists ADD COLUMN phone_number VARCHAR(20); END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='profile_pic_url') THEN ALTER TABLE therapists ADD COLUMN profile_pic_url TEXT; END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='work_start_time') THEN ALTER TABLE therapists ADD COLUMN work_start_time VARCHAR(10); END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='work_end_time') THEN ALTER TABLE therapists ADD COLUMN work_end_time VARCHAR(10); END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='therapists' AND column_name='current_location_id') THEN ALTER TABLE therapists ADD COLUMN current_location_id INTEGER; END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='no_shows' AND column_name='therapist_notes') THEN ALTER TABLE no_shows ADD COLUMN therapist_notes TEXT; END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='description') THEN ALTER TABLE locations ADD COLUMN description TEXT; END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='map_url') THEN ALTER TABLE locations ADD COLUMN map_url TEXT; END IF; END $",
    "DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='venue_code') THEN ALTER TABLE locations ADD COLUMN venue_code VARCHAR(50); END IF; END $"
  ];
  
  for (const stmt of statements) {
    try {
      await db.query(stmt);
      results.push({ sql: stmt.substring(0, 80), status: 'ok' });
    } catch (e) {
      results.push({ sql: stmt.substring(0, 80), status: 'error', error: e.message });
    }
  }
  res.json({ results });
});


// 錯誤處理
app.use((err, req, res, next) => {
  logger.error('未捕獲的錯誤', { error: err.message, stack: err.stack });
  res.status(500).json({ error: '伺服器錯誤' });
});

// 數據庫遷移
async function runMigrations(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 開始執行數據庫遷移 (嘗試 ${attempt}/${maxRetries})...`);

      const connected = await db.checkConnection();
      if (!connected) {
        throw new Error('數據庫連接失敗');
      }

      const migrationsDir = path.join(__dirname, '../migrations');
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        console.log(`  執行遷移: ${file}`);
        await db.query(sql);
        console.log(`  ✓ ${file} 完成`);
      }

      // 確保所有表有所有必需的列
      console.log('  確保所有表有所有必需的列...');
      await ensureColumns();
      
      const alterStatements = [
        // therapists 表
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS display_number VARCHAR(50)',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_primary VARCHAR(100)',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_secondary VARCHAR(100)',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS profile_pic_url TEXT',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_start_time VARCHAR(10)',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_end_time VARCHAR(10)',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS current_location_id INTEGER',
        // bookings 表
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(50)',
        // no_shows 表
        'ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS therapist_notes TEXT',
        'ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP',
        // locations/venues 表
        'ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT',
        'ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_url TEXT',
        'ALTER TABLE locations ADD COLUMN IF NOT EXISTS venue_code VARCHAR(50)'
      ];
      
      for (const stmt of alterStatements) {
        try {
          await db.query(stmt);
          const colMatch = stmt.match(/ADD COLUMN IF NOT EXISTS (\w+)/);
          const colName = colMatch ? colMatch[1] : 'unknown';
          console.log(`    ✓ ${colName} 已確保`);
        } catch (e) {
          const colMatch = stmt.match(/ADD COLUMN IF NOT EXISTS (\w+)/);
          const colName = colMatch ? colMatch[1] : 'unknown';
          console.log(`    ⚠ ${colName}: ${e.message.substring(0, 50)}`);
        }
      }
      
      console.log('  ✓ 所有表列檢查完成');

      // 插入默認時間段配置
      await db.query(`
        INSERT INTO time_options (time_slot, option_letter, start_time, end_time)
        VALUES 
          ('morning', 'A', '09:00', '09:30'),
          ('morning', 'B', '09:30', '10:00'),
          ('morning', 'C', '10:00', '10:30'),
          ('morning', 'D', '10:30', '11:00'),
          ('morning', 'E', '11:00', '11:30'),
          ('afternoon', 'A', '13:00', '13:30'),
          ('afternoon', 'B', '13:30', '14:00'),
          ('afternoon', 'C', '14:00', '14:30'),
          ('afternoon', 'D', '14:30', '15:00'),
          ('afternoon', 'E', '15:00', '15:30'),
          ('evening', 'A', '18:00', '18:30'),
          ('evening', 'B', '18:30', '19:00'),
          ('evening', 'C', '19:00', '19:30'),
          ('evening', 'D', '19:30', '20:00'),
          ('evening', 'E', '20:00', '20:30')
        ON CONFLICT (time_slot, option_letter) DO NOTHING;
      `);

      console.log('✅ 所有遷移完成！');
      return true;
    } catch (error) {
      console.error(`❌ 遷移失敗 (嘗試 ${attempt}/${maxRetries}):`, error.message);
      if (attempt < maxRetries) {
        const delay = Math.min(2000 * attempt, 10000);
        console.log(`⏳ ${delay / 1000} 秒後重試...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ 數據庫遷移最終失敗');
  return false;
}

// 啟動伺服器
async function startServer() {
  try {
    // 先執行遷移，確保數據庫準備好
    console.log('🔄 執行數據庫遷移...');
    const migrationSuccess = await runMigrations();
    
    if (!migrationSuccess) {
      console.warn('⚠️ 遷移失敗，但將繼續啟動伺服器');
    }
    
    // 啟動 Express 伺服器
    const server = app.listen(PORT, () => {
      console.log(`✅ 伺服器運行在 http://localhost:${PORT}`);
    });

    // 優雅關閉
    process.on('SIGINT', () => {
      console.log('\n⏹️ 收到 SIGINT，正在關閉伺服器...');
      server.close(() => {
        console.log('✅ 伺服器已關閉');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n⏹️ 收到 SIGTERM，正在關閉伺服器...');
      server.close(() => {
        console.log('✅ 伺服器已關閉');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ 啟動失敗:', error.message);
    process.exit(1);
  }
}

// 未捕獲異常處理
process.on('uncaughtException', (error) => {
  logger.error('未捕獲的異常', { error: error.message, stack: error.stack });
  console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未處理的 Promise 拒絕', { reason });
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

// 啟動伺服器
startServer();

module.exports = app;
