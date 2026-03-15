const db = require('../utils/db');
const logger = require('../utils/logger');

class Therapist {
  static async create(name, currentLocationId, isVip = false, wechatIdPrimary = null, wechatIdSecondary = null, phoneNumber = null, displayNumber = null, profilePicUrl = null, workStartTime = null, workEndTime = null, telegramId = null, wechatUserid = null) {
    try {
      const result = await db.query(
        'INSERT INTO therapists (name, location_id, current_location_id, is_vip, wechat_id_primary, wechat_id_secondary, phone_number, display_number, profile_pic_url, work_start_time, work_end_time, telegram_id, wechat_userid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
        [name, currentLocationId, currentLocationId, isVip, wechatIdPrimary, wechatIdSecondary, phoneNumber, displayNumber, profilePicUrl, workStartTime, workEndTime, telegramId, wechatUserid]
      );
      logger.info('新技師已創建', { name, currentLocationId, isVip });
      return result.rows[0];
    } catch (error) {
      logger.error('創建技師失敗', { error: error.message, name });
      throw error;
    }
  }

  static async getById(therapistId) {
    try {
      const result = await db.query(
        'SELECT t.*, l.name as location_name, l.code as location_code FROM therapists t LEFT JOIN locations l ON t.current_location_id = l.id WHERE t.id = $1',
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
        'SELECT t.*, l.name as location_name FROM therapists t LEFT JOIN locations l ON t.current_location_id = l.id WHERE t.current_location_id = $1 ORDER BY t.name',
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
        'SELECT t.*, l.name as location_name, l.code as location_code FROM therapists t LEFT JOIN locations l ON t.current_location_id = l.id ORDER BY t.name ASC'
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢所有技師失敗', { error: error.message });
      throw error;
    }
  }

  static async update(therapistId, updates) {
    try {
      // 同步 location_id 和 current_location_id
      if (updates.current_location_id && !updates.location_id) {
        updates.location_id = updates.current_location_id;
      }

      const fields = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }

      // 移除 updated_at 避免重複
      const updatedFields = fields.filter(f => !f.startsWith('updated_at'));
      updatedFields.push(`updated_at = CURRENT_TIMESTAMP`);
      
      values.push(therapistId);

      const result = await db.query(
        `UPDATE therapists SET ${updatedFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
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

  // 工作歷史相關方法
  static async addWorkHistory(therapistId, locationId, displayNumber, startDate, endDate = null) {
    try {
      const result = await db.query(
        'INSERT INTO therapist_history (therapist_id, location_id, display_number, start_date, end_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [therapistId, locationId, displayNumber, startDate, endDate]
      );
      logger.info('工作歷史已添加', { therapistId, locationId });
      return result.rows[0];
    } catch (error) {
      logger.error('添加工作歷史失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async getWorkHistory(therapistId) {
    try {
      const result = await db.query(
        `SELECT th.*, l.name as location_name, l.code as location_code 
         FROM therapist_history th 
         LEFT JOIN locations l ON th.location_id = l.id 
         WHERE th.therapist_id = $1 
         ORDER BY th.start_date DESC`,
        [therapistId]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢工作歷史失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async updateWorkHistory(historyId, updates) {
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
      values.push(historyId);

      const result = await db.query(
        `UPDATE therapist_history SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      logger.info('工作歷史已更新', { historyId });
      return result.rows[0];
    } catch (error) {
      logger.error('更新工作歷史失敗', { error: error.message, historyId });
      throw error;
    }
  }

  static async deleteWorkHistory(historyId) {
    try {
      await db.query('DELETE FROM therapist_history WHERE id = $1', [historyId]);
      logger.info('工作歷史已刪除', { historyId });
    } catch (error) {
      logger.error('刪除工作歷史失敗', { error: error.message, historyId });
      throw error;
    }
  }
}

module.exports = Therapist;
