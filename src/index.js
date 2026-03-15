const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const logger = require('./utils/logger');
const db = require('./utils/db');

// 導入路由
const bookingRoutes = require('./api/bookingRoutes');
const noshowRoutes = require('./api/noshowRoutes');
const locationRoutes = require('./api/locationRoutes');
const therapistRoutes = require('./api/therapistRoutes');
const customerRoutes = require('./api/customerRoutes');
const wechatWebhookRoutes = require('./api/wechatWebhook');

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 設置視圖引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Basic Auth 中間件（用於後台管理頁面）
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'tryme2024';

function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Tryme Admin"');
    return res.status(401).send('需要登入');
  }

  const base64 = authHeader.split(' ')[1];
  const [username, password] = Buffer.from(base64, 'base64').toString().split(':');

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Tryme Admin"');
  return res.status(401).send('帳號或密碼錯誤');
}

// 健康檢查 - 包含數據庫狀態
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const dbOk = await db.checkConnection();
    dbStatus = dbOk ? 'connected' : 'disconnected';
  } catch (e) {
    dbStatus = 'error';
  }
  res.json({
    status: 'ok',
    version: 'v1.0',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API 路由（API 不需要 Basic Auth，因為 Bot 和 Webhook 會調用）
app.use('/api/bookings', bookingRoutes);
app.use('/api/noshows', noshowRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/therapists', therapistRoutes);
app.use('/api/customers', customerRoutes);

// 企業微信 webhook 路由
app.use('/wechat/webhook', wechatWebhookRoutes);

// 後台管理頁面路由（需要 Basic Auth）
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

// 帶重試的數據庫遷移
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
        const delay = attempt * 5000;
        console.log(`⏳ 等待 ${delay / 1000} 秒後重試...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ 遷移最終失敗，服務器將繼續運行但數據庫可能不可用');
  return false;
}

// 啟動應用
async function startApp() {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info('服務器已啟動', { port: PORT });
    console.log(`🚀 Tryme 預約系統 v1.0 運行在 port ${PORT}`);
    console.log(`📊 管理後台: /admin`);
  });

  await runMigrations();

  try {
    const bot = require('./bot/bookingBot');
    bot.launch().then(() => {
      logger.info('Telegram Bot 已啟動');
      console.log('📱 Telegram Bot 已啟動');
    }).catch((error) => {
      logger.error('Telegram Bot 啟動失敗', { error: error.message });
      console.error('❌ Telegram Bot 啟動失敗:', error.message);
    });

    const shutdown = (signal) => {
      console.log(`收到 ${signal} 信號，正在關閉...`);
      logger.info(`收到 ${signal} 信號，正在關閉...`);
      bot.stop(signal);
      db.pool.end().catch(() => {});
      setTimeout(() => process.exit(0), 3000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('❌ Bot 模塊加載失敗:', error.message);
  }
}

process.on('uncaughtException', (error) => {
  console.error('未捕獲的異常:', error.message);
  logger.error('未捕獲的異常', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  console.error('未處理的 Promise 拒絕:', reason);
  logger.error('未處理的 Promise 拒絕', { reason: String(reason) });
});

startApp();

module.exports = app;
