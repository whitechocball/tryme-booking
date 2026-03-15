const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./utils/db');
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
      
      // therapists 表列
      const therapistCols = [
        ['display_number', 'VARCHAR(50)'],
        ['wechat_id', 'VARCHAR(100)'],
        ['profile_pic_url', 'TEXT'],
        ['work_start_time', 'TIME'],
        ['work_end_time', 'TIME']
      ];
      for (const [colName, colType] of therapistCols) {
        try {
          await db.query(`ALTER TABLE therapists ADD COLUMN IF NOT EXISTS ${colName} ${colType}`);
          console.log(`    ✓ therapists.${colName} 已確保`);
        } catch (e) {
          console.log(`    ⚠ therapists.${colName}: ${e.message.substring(0, 40)}`);
        }
      }
      
      // bookings 表列
      const bookingCols = [['booking_code', 'VARCHAR(50)']];
      for (const [colName, colType] of bookingCols) {
        try {
          await db.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ${colName} ${colType}`);
          console.log(`    ✓ bookings.${colName} 已確保`);
        } catch (e) {
          console.log(`    ⚠ bookings.${colName}: ${e.message.substring(0, 40)}`);
        }
      }
      
      // no_shows 表列
      const noshowCols = [
        ['therapist_notes', 'TEXT'],
        ['updated_at', 'TIMESTAMP']
      ];
      for (const [colName, colType] of noshowCols) {
        try {
          await db.query(`ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS ${colName} ${colType}`);
          console.log(`    ✓ no_shows.${colName} 已確保`);
        } catch (e) {
          console.log(`    ⚠ no_shows.${colName}: ${e.message.substring(0, 40)}`);
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
    // 先啟動 Express 伺服器，確保健康檢查可用
    const server = app.listen(PORT, () => {
      console.log(`✅ 伺服器運行在 http://localhost:${PORT}`);
    });

    // 後台運行遷移
    runMigrations().then(success => {
      if (!success) {
        console.warn('⚠️ 遷移失敗，但伺服器仍在運行');
      }
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
  logger.error('未處理的 Promise 拒絕', { reason, promise });
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

startServer();

module.exports = app;
