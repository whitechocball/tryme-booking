const db = require('../utils/db');
const logger = require('../utils/logger');

class Therapist {
  static async create(name, locationId, externalUserId = null, isVip = false, wechatId = null) {
    try {
      const result = await db.query(
        'INSERT INTO therapists (name, location_id, external_user_id, wechat_id, is_vip) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, locationId, externalUserId, wechatId, isVip]
      );
      logger.info('新技師已創建', { name, locationId, isVip });
      return result.rows[0];
    } catch (error) {
      logger.error('創建技師失敗', { error: error.message, name });
      throw error;
    }
  }

  static async getById(therapistId) {
    try {
      const result = await db.query(
        'SELECT * FROM therapists WHERE id = $1',
        [therapistId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查詢技師失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async getByLocation(locationId) {
    try {
      const result = await db.query(
        'SELECT * FROM therapists WHERE location_id = $1 ORDER BY name',
        [locationId]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢場所技師失敗', { error: error.message, locationId });
      throw error;
    }
  }

  static async getAll() {
    try {
      const result = await db.query(
        'SELECT t.*, l.name as location_name FROM therapists t LEFT JOIN locations l ON t.location_id = l.id ORDER BY t.created_at DESC'
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢所有技師失敗', { error: error.message });
      throw error;
    }
  }

  static async update(therapistId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(therapistId);

      const result = await db.query(
        `UPDATE therapists SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      logger.info('技師已更新', { therapistId });
      return result.rows[0];
    } catch (error) {
      logger.error('更新技師失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async delete(therapistId) {
    try {
      await db.query('DELETE FROM therapists WHERE id = $1', [therapistId]);
      logger.info('技師已刪除', { therapistId });
    } catch (error) {
      logger.error('刪除技師失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async getBookingCountWithCustomer(therapistId, customerId) {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM bookings WHERE therapist_id = $1 AND customer_id = $2 AND status = $3',
        [therapistId, customerId, 'completed']
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('查詢預約次數失敗', { error: error.message, therapistId, customerId });
      throw error;
    }
  }
}

module.exports = Therapist;
