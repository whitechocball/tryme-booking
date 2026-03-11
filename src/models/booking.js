const db = require('../utils/db');
const logger = require('../utils/logger');

class Booking {
  static async create(customerId, therapistId, locationId, bookingDate, timeSlot, timeOption) {
    try {
      const result = await db.query(
        `INSERT INTO bookings (customer_id, therapist_id, location_id, booking_date, time_slot, time_option, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
        [customerId, therapistId, locationId, bookingDate, timeSlot, timeOption]
      );
      logger.info('新預約已創建', { customerId, therapistId, bookingDate });
      return result.rows[0];
    } catch (error) {
      logger.error('創建預約失敗', { error: error.message, customerId, therapistId });
      throw error;
    }
  }

  static async getById(bookingId) {
    try {
      const result = await db.query(
        `SELECT b.*, c.name as customer_name, c.telegram_id, t.name as therapist_name, t.wechat_id, l.name as location_name
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.id = $1`,
        [bookingId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查詢預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async getByCustomer(customerId) {
    try {
      const result = await db.query(
        `SELECT b.*, c.name as customer_name, t.name as therapist_name, l.name as location_name
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.customer_id = $1
         ORDER BY b.booking_date DESC`,
        [customerId]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢客戶預約失敗', { error: error.message, customerId });
      throw error;
    }
  }

  static async getByTherapist(therapistId) {
    try {
      const result = await db.query(
        `SELECT b.*, c.name as customer_name, t.name as therapist_name, l.name as location_name
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.therapist_id = $1
         ORDER BY b.booking_date DESC`,
        [therapistId]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢技師預約失敗', { error: error.message, therapistId });
      throw error;
    }
  }

  static async getAll(filters = {}) {
    try {
      let query = `SELECT b.*, c.name as customer_name, c.telegram_id, t.name as therapist_name, t.wechat_id, l.name as location_name
                   FROM bookings b
                   LEFT JOIN customers c ON b.customer_id = c.id
                   LEFT JOIN therapists t ON b.therapist_id = t.id
                   LEFT JOIN locations l ON b.location_id = l.id`;
      
      const conditions = [];
      const params = [];
      let paramCount = 1;

      if (filters.status) {
        conditions.push(`b.status = $${paramCount}`);
        params.push(filters.status);
        paramCount++;
      }

      if (filters.bookingDate) {
        conditions.push(`b.booking_date = $${paramCount}`);
        params.push(filters.bookingDate);
        paramCount++;
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY b.booking_date DESC';

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('查詢預約列表失敗', { error: error.message });
      throw error;
    }
  }

  static async updateStatus(bookingId, status) {
    try {
      const result = await db.query(
        'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [status, bookingId]
      );
      logger.info('預約狀態已更新', { bookingId, status });
      return result.rows[0];
    } catch (error) {
      logger.error('更新預約狀態失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async markTherapistResponse(bookingId) {
    try {
      const result = await db.query(
        'UPDATE bookings SET therapist_response_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [bookingId]
      );
      logger.info('技師回應已記錄', { bookingId });
      return result.rows[0];
    } catch (error) {
      logger.error('記錄技師回應失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async cancel(bookingId) {
    try {
      return await this.updateStatus(bookingId, 'cancelled');
    } catch (error) {
      logger.error('取消預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async getByDateRange(startDate, endDate) {
    try {
      const result = await db.query(
        `SELECT b.*, c.name as customer_name, t.name as therapist_name, l.name as location_name
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.booking_date BETWEEN $1 AND $2
         ORDER BY b.booking_date DESC`,
        [startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢日期範圍預約失敗', { error: error.message });
      throw error;
    }
  }
}

module.exports = Booking;
