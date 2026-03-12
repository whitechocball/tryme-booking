const { Pool } = require('pg');
require('dotenv').config();

// 連接池配置 - 增強穩定性
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,                        // 最大連接數
  min: 2,                         // 最小連接數
  idleTimeoutMillis: 30000,       // 空閒連接超時 30 秒
  connectionTimeoutMillis: 10000, // 連接超時 10 秒
  allowExitOnIdle: false,         // 不允許空閒退出
};

// Railway 內部連接不需要 SSL
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.internal')) {
  poolConfig.ssl = false;
} else if (process.env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

let pool = new Pool(poolConfig);

// 連接池錯誤處理 - 自動重連
pool.on('error', (err) => {
  console.error('數據庫池錯誤，嘗試重連:', err.message);
  setTimeout(() => {
    try {
      pool.end().catch(() => {});
      pool = new Pool(poolConfig);
      pool.on('error', (e) => {
        console.error('數據庫池錯誤:', e.message);
      });
      console.log('數據庫連接池已重建');
    } catch (e) {
      console.error('重建數據庫連接池失敗:', e.message);
    }
  }, 3000);
});

pool.on('connect', () => {
  console.log('新的數據庫連接已建立');
});

/**
 * 帶重試機制的查詢函數
 */
async function queryWithRetry(text, params, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await pool.query(text, params);
      return result;
    } catch (error) {
      console.error(`數據庫查詢失敗 (嘗試 ${attempt}/${retries}):`, error.message);

      // 連接相關錯誤，等待後重試
      const isConnectionError = (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.code === '57P01' ||
        error.code === '57P03' ||
        error.code === '08006' ||
        error.code === '08001' ||
        error.code === '08003' ||
        (error.message && error.message.includes('Connection terminated')) ||
        (error.message && error.message.includes('connection refused')) ||
        (error.message && error.message.includes('timeout'))
      );

      if (isConnectionError && attempt < retries) {
        const delay = attempt * 2000;
        console.log(`等待 ${delay}ms 後重試數據庫連接...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }
}

/**
 * 檢查數據庫連接是否正常
 */
async function checkConnection() {
  try {
    const result = await pool.query('SELECT 1 as connected');
    return result.rows[0].connected === 1;
  } catch (error) {
    console.error('數據庫連接檢查失敗:', error.message);
    return false;
  }
}

module.exports = {
  query: queryWithRetry,
  getClient: () => pool.connect(),
  pool,
  checkConnection,
};
