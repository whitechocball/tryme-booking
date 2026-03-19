const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./utils/db');
const { ensureColumns } = require('./utils/ensureColumns');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 企業微信域名驗證文件路由 ====================
// 企業微信需要驗證域名所有權，會要求在根目錄放置一個驗證文件
// 文件名格式通常為 WW_verify_xxxxxxxx.txt
// 用戶從企業微信後台下載驗證文件後，放入 public/ 目錄即可
// 此路由同時支持通過環境變量配置驗證文件內容

app.get('/WW_verify_:filename.txt', (req, res) => {
  const filename = `WW_verify_${req.params.filename}.txt`;
  const filePath = path.join(__dirname, '../public', filename);
  
  // 優先從文件系統讀取
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  
  // 其次從環境變量讀取
  const envContent = process.env.WECHAT_VERIFY_FILE_CONTENT;
  const envFilename = process.env.WECHAT_VERIFY_FILE_NAME;
  
  if (envContent && envFilename === filename) {
    return res.type('text/plain').send(envContent);
  }
  
  logger.warn('企業微信域名驗證文件不存在', { filename });
  res.status(404).send('File not found');
});

// ==================== 中間件 ====================
// 注意：企業微信回調需要原始 XML body，所以需要在 json 解析之前處理
app.use('/api/wechat/callback', (req, res, next) => {
  // 讓 wechatCallbackRoute 自己處理 body 解析
  next();
});

app.use('/wechat/webhook', (req, res, next) => {
  // 讓 wechatWebhook 自己處理 body 解析
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// ==================== 健康檢查 ====================
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  
  // 檢查企業微信配置狀態
  let wecomStatus = 'not_configured';
  try {
    const wecom = require('./utils/wecom');
    if (wecom.isConfigured()) {
      wecomStatus = wecom.isCallbackConfigured() ? 'fully_configured' : 'basic_configured';
    }
  } catch (e) {
    wecomStatus = 'error';
  }
  
  res.json({
    status: 'ok',
    database: 'connected',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    version: '1.3.0',
    releaseDate: '2026-03-19',
    features: [
      'telegram-ai-booking',
      'wechat-bridge',
      'wecom-card-messages',
      'wecom-callback',
      'booking-conflict-detection',
      'booking-status-workflow',
      'timeout-handling',
    ],
    wecom: wecomStatus,
  });
});

// ==================== 管理後台路由 ====================
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

app.get('/admin/wechat-binding', basicAuth, (req, res) => {
  res.render('admin/wechat-binding');
});

// ==================== 企業微信預約操作頁面 ====================
// 技師點擊卡片消息中的「查看預約」按鈕後跳轉到此頁面
app.get('/api/wechat/booking-action', async (req, res) => {
  try {
    const { booking_id, action } = req.query;
    
    if (!booking_id) {
      return res.status(400).send('缺少預約 ID');
    }
    
    const bookingResult = await db.query(
      `SELECT b.*, l.name as location_name, t.name as therapist_name, c.name as customer_name
       FROM bookings b
       LEFT JOIN locations l ON b.location_id = l.id
       LEFT JOIN therapists t ON b.therapist_id = t.id
       LEFT JOIN customers c ON b.customer_id = c.id
       WHERE b.id = $1`,
      [booking_id]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).send('預約不存在');
    }
    
    const booking = bookingResult.rows[0];
    
    // 如果帶有 action 參數，直接處理
    if (action === 'accept' || action === 'reject') {
      const BookingService = require('./services/bookingService');
      
      try {
        if (action === 'accept') {
          await BookingService.confirmBooking(parseInt(booking_id, 10), booking.therapist_id);
        } else {
          await BookingService.rejectBooking(parseInt(booking_id, 10), booking.therapist_id);
        }
        
        const statusText = action === 'accept' ? '已接受' : '已拒絕';
        return res.send(`
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
          <title>預約操作</title>
          <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}
          .card{background:white;border-radius:12px;padding:32px;max-width:400px;width:90%;box-shadow:0 2px 12px rgba(0,0,0,0.1);text-align:center;}
          .success{color:#52c41a;font-size:48px;margin-bottom:16px;}
          .reject{color:#ff4d4f;font-size:48px;margin-bottom:16px;}
          h2{margin:0 0 8px;color:#333;}p{color:#666;margin:4px 0;}</style></head>
          <body><div class="card">
          <div class="${action === 'accept' ? 'success' : 'reject'}">${action === 'accept' ? '✅' : '❌'}</div>
          <h2>預約 #${booking_id} ${statusText}</h2>
          <p>場所：${booking.location_name}</p>
          <p>日期：${booking.booking_date}</p>
          <p>時間：${booking.booking_time || booking.time_slot}</p>
          </div></body></html>
        `);
      } catch (error) {
        return res.send(`
          <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
          <title>操作失敗</title>
          <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}
          .card{background:white;border-radius:12px;padding:32px;max-width:400px;width:90%;box-shadow:0 2px 12px rgba(0,0,0,0.1);text-align:center;}
          .error{color:#ff4d4f;font-size:48px;margin-bottom:16px;}
          h2{margin:0 0 8px;color:#333;}p{color:#666;}</style></head>
          <body><div class="card">
          <div class="error">⚠️</div>
          <h2>操作失敗</h2>
          <p>${error.message}</p>
          </div></body></html>
        `);
      }
    }
    
    // 顯示預約詳情和操作按鈕
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : (process.env.APP_URL || 'https://tryme-app-production.up.railway.app');
    
    res.send(`
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>預約詳情 #${booking_id}</title>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}
        .card{background:white;border-radius:12px;padding:32px;max-width:400px;width:90%;box-shadow:0 2px 12px rgba(0,0,0,0.1);}
        h2{margin:0 0 16px;color:#333;text-align:center;}
        .info{margin:12px 0;padding:12px;background:#f9f9f9;border-radius:8px;}
        .info p{margin:6px 0;color:#555;font-size:14px;}
        .info .label{color:#999;font-size:12px;}
        .actions{display:flex;gap:12px;margin-top:24px;}
        .btn{flex:1;padding:14px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;text-align:center;display:block;}
        .btn-accept{background:#52c41a;color:white;}
        .btn-reject{background:#ff4d4f;color:white;}
        .btn:active{opacity:0.8;}
        .status{text-align:center;padding:8px;border-radius:6px;margin-bottom:16px;font-size:14px;}
        .status-pending{background:#fff7e6;color:#d48806;}
        .status-confirmed{background:#f6ffed;color:#52c41a;}
        .status-cancelled{background:#fff1f0;color:#ff4d4f;}
      </style></head>
      <body>
      <div class="card">
        <h2>預約 #${booking_id}</h2>
        <div class="status status-${booking.status === 'pending' || booking.status === 'pending_technician_confirmation' ? 'pending' : booking.status === 'confirmed' ? 'confirmed' : 'cancelled'}">
          狀態：${booking.status}
        </div>
        <div class="info">
          <p><span class="label">客戶</span><br>${booking.customer_name || '未知'}</p>
          <p><span class="label">場所</span><br>${booking.location_name || '未知'}</p>
          <p><span class="label">日期</span><br>${booking.booking_date}</p>
          <p><span class="label">時間</span><br>${booking.booking_time || booking.time_slot || '未指定'}</p>
        </div>
        ${['pending', 'pending_technician_confirmation', 'waiting_therapist'].includes(booking.status) ? `
        <div class="actions">
          <a class="btn btn-accept" href="${baseUrl}/api/wechat/booking-action?booking_id=${booking_id}&action=accept">接受</a>
          <a class="btn btn-reject" href="${baseUrl}/api/wechat/booking-action?booking_id=${booking_id}&action=reject">拒絕</a>
        </div>` : '<p style="text-align:center;color:#999;margin-top:16px;">此預約已處理</p>'}
      </div>
      </body></html>
    `);
  } catch (error) {
    logger.error('預約操作頁面錯誤', { error: error.message });
    res.status(500).send('伺服器錯誤');
  }
});

// ==================== API 路由 ====================
const bookingRoutes = require('./api/bookingRoutes');
const noshowRoutes = require('./api/noshowRoutes');
const locationRoutes = require('./api/locationRoutes');
const therapistRoutes = require('./api/therapistRoutes');
const customerRoutes = require('./api/customerRoutes');
const wechatWebhook = require('./api/wechatWebhook');
const wechatCallbackRoute = require('./api/wechatCallbackRoute');
const telegramWebhookRoute = require('./api/telegramWebhookRoute');
const wechatBindingRoutes = require('./api/wechatBindingRoutes');

app.use('/api/bookings', bookingRoutes);
app.use('/api/noshows', noshowRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/therapists', therapistRoutes);
app.use('/api/customers', customerRoutes);
app.use('/wechat/webhook', wechatWebhook);
app.use('/api/wechat/callback', wechatCallbackRoute);
app.use('/api/telegram/webhook', telegramWebhookRoute);
app.use('/api/wechat', wechatBindingRoutes);
app.use('/api', wechatBindingRoutes);

// ==================== 企業微信配置狀態端點 ====================
app.get('/api/wecom/status', basicAuth, (req, res) => {
  try {
    const wecom = require('./utils/wecom');
    const config = wecom.getConfig();
    
    res.json({
      success: true,
      configured: wecom.isConfigured(),
      callbackConfigured: wecom.isCallbackConfigured(),
      config: {
        corpId: config.corpId ? config.corpId.substring(0, 6) + '***' : '未設置',
        agentId: config.agentId || '未設置',
        hasSecret: !!config.secret,
        hasCallbackToken: !!config.callbackToken,
        hasEncodingAESKey: !!config.callbackEncodingAESKey,
      },
      callbackUrl: `${process.env.APP_URL || 'https://tryme-app-production.up.railway.app'}/api/wechat/callback`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// AI 預約會話查詢端點
app.get('/api/ai-sessions', basicAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, c.name as customer_name, c.telegram_id,
              b.booking_date, b.booking_time, b.status as booking_status,
              l.name as location_name, t.name as therapist_name, t.display_number
       FROM ai_booking_sessions s
       LEFT JOIN bookings b ON s.current_booking_id = b.id
       LEFT JOIN customers c ON c.telegram_id = s.customer_telegram_id
       LEFT JOIN locations l ON b.location_id = l.id
       LEFT JOIN therapists t ON b.therapist_id = t.id
       ORDER BY s.created_at DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('查詢 AI 會話失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 診斷端點 - 檢查數據庫列
app.get('/api/diag/columns', basicAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('bookings', 'therapists', 'locations', 'no_shows', 'ai_booking_sessions')
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
    'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(50)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS display_number VARCHAR(50)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_primary VARCHAR(100)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_id_secondary VARCHAR(100)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS profile_pic_url TEXT',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_start_time VARCHAR(10)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS work_end_time VARCHAR(10)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS current_location_id INTEGER',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100)',
    'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_userid VARCHAR(255)',
    'ALTER TABLE no_shows ADD COLUMN IF NOT EXISTS therapist_notes TEXT',
    'ALTER TABLE locations ADD COLUMN IF NOT EXISTS description TEXT',
    'ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_url TEXT',
    'ALTER TABLE locations ADD COLUMN IF NOT EXISTS venue_code VARCHAR(50)',
    'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ai_session_id INTEGER',
    'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_time VARCHAR(20)',
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
        try {
          await db.query(sql);
          console.log(`  ✓ ${file} 完成`);
        } catch (fileError) {
          console.log(`  ⚠ ${file} 部分失敗: ${fileError.message.substring(0, 80)}，繼續執行...`);
        }
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
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100)',
        'ALTER TABLE therapists ADD COLUMN IF NOT EXISTS wechat_userid VARCHAR(255)',
        // bookings 表
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_code VARCHAR(50)',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ai_session_id INTEGER',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_time VARCHAR(20)',
        // 新功能：衝突檢測 & 狀態流程
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN DEFAULT FALSE',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS timeout_notified BOOLEAN DEFAULT FALSE',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT',
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

    // 檢查企業微信配置狀態
    try {
      const wecom = require('./utils/wecom');
      if (wecom.isConfigured()) {
        console.log('✅ 企業微信 API 已配置');
        if (wecom.isCallbackConfigured()) {
          console.log('✅ 企業微信回調已配置');
        } else {
          console.log('⚠️ 企業微信回調未配置（WECHAT_CALLBACK_TOKEN / WECHAT_ENCODING_AES_KEY）');
        }
      } else {
        console.log('⚠️ 企業微信未配置（WECHAT_CORP_ID / WECHAT_AGENT_ID / WECHAT_SECRET）');
      }
    } catch (e) {
      console.log('⚠️ 企業微信模塊載入失敗:', e.message);
    }

    // 啟動定時任務（超時處理 & 衝突檢測）
    try {
      const SchedulerService = require('./services/schedulerService');
      SchedulerService.init();
    } catch (schedulerError) {
      console.error('❌ 定時任務初始化失敗:', schedulerError.message);
      logger.error('定時任務初始化失敗', { error: schedulerError.message });
    }

    // 啟動 Telegram AI 預約 Bot（polling 模式）
    try {
      const { initAIBookingBot } = require('./bot/aiBookingBot');
      initAIBookingBot();
      console.log('🤖 Telegram AI 預約 Bot 初始化中...');
    } catch (botError) {
      console.error('❌ Telegram Bot 初始化失敗:', botError.message);
      logger.error('Telegram Bot 初始化失敗', { error: botError.message });
    }

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
