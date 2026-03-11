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

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api/bookings', bookingRoutes);
app.use('/api/noshows', noshowRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/therapists', therapistRoutes);
app.use('/api/customers', customerRoutes);

// 企業微信 webhook 路由
app.use('/wechat/webhook', wechatWebhookRoutes);

// 後台管理頁面路由
app.get('/admin', (req, res) => {
  res.render('admin/dashboard');
});

app.get('/admin/bookings', (req, res) => {
  res.render('admin/bookings');
});

app.get('/admin/noshows', (req, res) => {
  res.render('admin/noshows');
});

app.get('/admin/locations', (req, res) => {
  res.render('admin/locations');
});

app.get('/admin/therapists', (req, res) => {
  res.render('admin/therapists');
});

app.get('/admin/customers', (req, res) => {
  res.render('admin/customers');
});

// 自動運行數據庫遷移
async function runMigrations() {
  try {
    console.log('🔄 開始執行數據庫遷移...');
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
  } catch (error) {
    console.error('❌ 遷移失敗:', error.message);
    // 不退出進程，讓服務器繼續運行
  }
}

// 啟動應用
async function startApp() {
  // 先運行遷移
  await runMigrations();

  // 啟動 Telegram Bot
  try {
    const bot = require('./bot/bookingBot');
    bot.launch().then(() => {
      logger.info('Telegram Bot 已啟動');
      console.log('📱 Telegram Bot 已啟動');
    }).catch((error) => {
      logger.error('Telegram Bot 啟動失敗', { error: error.message });
      console.error('❌ Telegram Bot 啟動失敗:', error.message);
    });

    // 優雅關閉
    process.on('SIGINT', () => {
      logger.info('收到關閉信號，正在關閉...');
      bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('收到終止信號，正在關閉...');
      bot.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Bot 模塊加載失敗:', error.message);
  }

  // 啟動 Express 服務器
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`服務器已啟動`, { port: PORT });
    console.log(`🚀 Tryme 預約系統運行在 port ${PORT}`);
    console.log(`📊 管理後台: /admin`);
  });
}

startApp();

module.exports = app;
