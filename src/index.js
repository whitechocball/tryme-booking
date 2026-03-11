const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const bot = require('./bot/bookingBot');

// 導入路由
const bookingRoutes = require('./api/bookingRoutes');
const noshowRoutes = require('./api/noshowRoutes');
const locationRoutes = require('./api/locationRoutes');
const therapistRoutes = require('./api/therapistRoutes');
const customerRoutes = require('./api/customerRoutes');

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

// 啟動 Telegram Bot
bot.launch().then(() => {
  logger.info('Telegram Bot 已啟動');
}).catch((error) => {
  logger.error('Telegram Bot 啟動失敗', { error: error.message });
});

// 啟動 Express 服務器
app.listen(PORT, () => {
  logger.info(`服務器已啟動`, { port: PORT });
  console.log(`🚀 Tryme 預約系統運行在 http://localhost:${PORT}`);
  console.log(`📱 Telegram Bot 已啟動`);
  console.log(`📊 管理後台: http://localhost:${PORT}/admin`);
});

// 優雅關閉
process.on('SIGINT', () => {
  logger.info('收到關閉信號，正在關閉...');
  bot.stop();
  process.exit(0);
});

module.exports = app;
