const db = require('../utils/db');
const logger = require('../utils/logger');
const Customer = require('./customer');

class NoShow {
  static async create(bookingId, customerId, therapistId, noShowDate, reason = null, reportedBy = 'system') {
    try {
      const result = await db.query(
        `INSERT INTO no_shows (booking_id, customer_id, therapist_id, no_show_date, reason, reported_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [bookingId, customerId, therapistId, noShowDate, reason, reportedBy]
      );

      // 更新客戶的爽約計數
      await Customer.updateNoShowCount(customerId);

      logger.info('爽約記錄已創建', { customerId, therapistId, noShowDate });
      return result.rows[0];
    } catch (error) {
      logger.error('創建爽約記錄失敗', { error: error.message, customerId });
      throw error;
    }
  }

  static async getById(noShowId) {
    try {
      const result = await db.query(
        `SELECT ns.*, c.name as customer_name, t.name as therapist_name, l.name as location_name
         FROM no_shows ns
         LEFT JOIN customers c ON ns.customer_id = c.id
         LEFT JOIN therapists t ON ns.therapist_id = t.id
         LEFT JOIN locations l ON t.location_id = l.id
         WHERE ns.id = $1`,
        [noShowId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查詢爽約記錄失敗', { error: error.message, noShowId });
      throw error;
    }
  }

  static async getByCustomer(customerId) {
    try {
      const result = await db.query(
        `SELECT ns.*, c.name as customer_name, t.name as therapist_name, l.name as location_name
         FROM no_shows ns
         LEFT JOIN customers c ON ns.customer_id = c.id
         LEFT JOIN therapists t ON ns.therapist_id = t.id
         LEFT JOIN locations l ON t.location_id = l.id
         WHERE ns.customer_id = $1
         ORDER BY ns.no_show_date DESC`,
        [customerId]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢客戶爽約記錄失敗', { error: error.message, customerId });
      throw error;
    }
  }

  static async getByTherapist(therapistId) {
    try {
      const result = await db.query(
        `SELECT ns.*, c.name as customer_name, t.name as therapist_name
         FROM no_shows ns
         LEFT JOIN customers c ON ns.customer_id = c.id
         LEFT JOIN therapists t ON ns.therapist_id = t.id
         WHERE ns.therapist_id = $1
         ORDER BY ns.no_show_date DESC`,
        [therapistId]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢技師爽約記錄失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async getAll(filters = {}) {
    try {
      let query = `SELECT ns.*, c.name as customer_name, c.telegram_id, t.name as therapist_name, l.name as location_name
                   FROM no_shows ns
                   LEFT JOIN customers c ON ns.customer_id = c.id
                   LEFT JOIN therapists t ON ns.therapist_id = t.id
                   LEFT JOIN locations l ON t.location_id = l.id`;
      
      const conditions = [];
      const params = [];
      let paramCount = 1;

      if (filters.customerId) {
        conditions.push(`ns.customer_id = $${paramCount}`);
        params.push(filters.customerId);
        paramCount++;
      }

      if (filters.therapistId) {
        conditions.push(`ns.therapist_id = $${paramCount}`);
        params.push(filters.therapistId);
        paramCount++;
      }

      if (filters.startDate) {
        conditions.push(`ns.no_show_date >= $${paramCount}`);
        params.push(filters.startDate);
        paramCount++;
      }

      if (filters.endDate) {
        conditions.push(`ns.no_show_date <= $${paramCount}`);
        params.push(filters.endDate);
        paramCount++;
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY ns.no_show_date DESC';

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('查詢爽約記錄列表失敗', { error: error.message });
      throw error;
    }
  }

  static async delete(noShowId) {
    try {
      const noShow = await this.getById(noShowId);
      if (!noShow) {
        throw new Error('爽約記錄不存在');
      }

      await db.query('DELETE FROM no_shows WHERE id = $1', [noShowId]);

      // 更新客戶的爽約計數
      await Customer.updateNoShowCount(noShow.customer_id);

      logger.info('爽約記錄已刪除', { noShowId, customerId: noShow.customer_id });
    } catch (error) {
      logger.error('刪除爽約記錄失敗', { error: error.message, noShowId });
      throw error;
    }
  }

  static async getCountByCustomer(customerId) {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM no_shows WHERE customer_id = $1',
        [customerId]
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('查詢客戶爽約次數失敗', { error: error.message, customerId });
      throw error;
    }
  }

  static async getCountByTherapist(therapistId) {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM no_shows WHERE therapist_id = $1',
        [therapistId]
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('查詢技師爽約次數失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async getCustomerNoShowRanking() {
    try {
      const result = await db.query(
        `SELECT c.id, c.name as customer_name, c.telegram_id,
                COUNT(ns.id) as no_show_count,
                STRING_AGG(DISTINCT t.name || ' (' || l.code || ')', ', ') as therapists
         FROM no_shows ns
         JOIN customers c ON ns.customer_id = c.id
         LEFT JOIN therapists t ON ns.therapist_id = t.id
         LEFT JOIN locations l ON t.location_id = l.id
         GROUP BY c.id, c.name, c.telegram_id
         ORDER BY no_show_count DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢客戶爽約排名失敗', { error: error.message });
      throw error;
    }
  }

  static async getTherapistNoShowDetails() {
    try {
      const result = await db.query(
        `SELECT ns.*, c.name as customer_name, c.telegram_id,
                t.name as therapist_name,
                l.name as location_name, l.code as location_code
         FROM no_shows ns
         JOIN therapists t ON ns.therapist_id = t.id
         LEFT JOIN customers c ON ns.customer_id = c.id
         LEFT JOIN locations l ON t.location_id = l.id
         ORDER BY ns.no_show_date DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢技師爽約詳情失敗', { error: error.message });
      throw error;
    }
  }

  static async updateTherapistNotes(noShowId, notes) {
    try {
      const result = await db.query(
        `UPDATE no_shows SET therapist_notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [notes, noShowId]
      );
      logger.info('技師爽約備註已更新', { noShowId });
      return result.rows[0];
    } catch (error) {
      logger.error('更新技師爽約備註失敗', { error: error.message, noShowId });
      throw error;
    }
  }
}

module.exports = NoShow;
