const db = require('../utils/db');
const logger = require('../utils/logger');

class Customer {
  static async findOrCreate(telegramId, name = null) {
    try {
      // 先查詢是否存在
      const existing = await db.query(
        'SELECT * FROM customers WHERE telegram_id = $1',
        [telegramId]
      );

      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      // 如果不存在，創建新客戶
      const result = await db.query(
        'INSERT INTO customers (telegram_id, name) VALUES ($1, $2) RETURNING *',
        [telegramId, name]
      );

      logger.info('新客戶已創建', { telegramId, name });
      return result.rows[0];
    } catch (error) {
      logger.error('查詢或創建客戶失敗', { error: error.message, telegramId });
      throw error;
    }
  }

  static async getById(customerId) {
    try {
      const result = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查詢客戶失敗', { error: error.message, customerId });
      throw error;
    }
  }

  static async getByTelegramId(telegramId) {
    try {
      const result = await db.query(
        'SELECT * FROM customers WHERE telegram_id = $1',
        [telegramId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查詢客戶失敗', { error: error.message, telegramId });
      throw error;
    }
  }

  static async getNoShowCount(customerId) {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM no_shows WHERE customer_id = $1',
        [customerId]
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('查詢爽約次數失敗', { error: error.message, customerId });
      throw error;
    }
  }

  static async updateNoShowCount(customerId) {
    try {
      const count = await this.getNoShowCount(customerId);
      await db.query(
        'UPDATE customers SET no_show_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [count, customerId]
      );
      logger.info('客戶爽約次數已更新', { customerId, count });
    } catch (error) {
      logger.error('更新爽約次數失敗', { error: error.message, customerId });
      throw error;
    }
  }

  static async getAll() {
    try {
      const result = await db.query('SELECT * FROM customers ORDER BY created_at DESC');
      return result.rows;
    } catch (error) {
      logger.error('查詢所有客戶失敗', { error: error.message });
      throw error;
    }
  }
}

module.exports = Customer;
