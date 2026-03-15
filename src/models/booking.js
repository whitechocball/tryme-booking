const db = require('../utils/db');
const logger = require('../utils/logger');

// 新的狀態定義
const BOOKING_STATUS = {
  WAITING_THERAPIST: 'waiting_therapist',   // 等待技師回覆
  WAITING_SERVICE: 'waiting_service',       // 等待進入服務
  COMPLETED: 'completed',                   // 已完成服務
  CUSTOMER_NO_SHOW: 'customer_no_show',     // 客戶爽約
  THERAPIST_CANCELLED: 'therapist_cancelled', // 技師取消
  THERAPIST_NO_SHOW: 'therapist_no_show',   // 技師爽約
};

const STATUS_LABELS = {
  'waiting_therapist': '等待技師回覆',
  'waiting_service': '等待進入服務',
  'completed': '已完成服務',
  'customer_no_show': '客戶爽約',
  'therapist_cancelled': '技師取消',
  'therapist_no_show': '技師爽約',
};

/**
 * 生成預約編號：YYYYMMDD-HHmm
 */
function generateBookingCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}`;
}

class Booking {
  static async create(customerId, therapistId, locationId, bookingDate, timeSlot, timeOption) {
    try {
      const bookingCode = generateBookingCode();
      const result = await db.query(
        `INSERT INTO bookings (customer_id, therapist_id, location_id, booking_date, time_slot, time_option, status, booking_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [customerId, therapistId, locationId, bookingDate, timeSlot, timeOption, BOOKING_STATUS.WAITING_THERAPIST, bookingCode]
      );
      logger.info('新預約已創建', { customerId, therapistId, bookingDate, bookingCode });
      return result.rows[0];
    } catch (error) {
      logger.error('創建預約失敗', { error: error.message, customerId, therapistId });
      throw error;
    }
  }

  static async getById(bookingId) {
    try {
      const result = await db.query(
        `SELECT b.*, b.booking_code,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name, t.external_user_id, t.wechat_id, t.profile_pic_url, t.work_start_time, t.work_end_time,
                l.name as location_name, l.code as location_code
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
        `SELECT b.*, b.booking_code,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name, t.wechat_id, t.profile_pic_url, t.work_start_time, t.work_end_time,
                l.name as location_name, l.code as location_code
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.customer_id = $1
         ORDER BY b.created_at DESC`,
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
        `SELECT b.*, b.booking_code,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name, t.wechat_id, t.profile_pic_url, t.work_start_time, t.work_end_time,
                l.name as location_name, l.code as location_code
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.therapist_id = $1
         ORDER BY b.created_at DESC`,
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
      let query = `SELECT b.*, b.booking_code,
                          c.name as customer_name, c.telegram_id,
                          t.id as therapist_id, t.name as therapist_name, t.external_user_id, t.wechat_id, t.profile_pic_url, t.work_start_time, t.work_end_time,
                          l.name as location_name, l.code as location_code
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

      query += ' ORDER BY b.created_at DESC';

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
      return result.rows[0];
    } catch (error) {
      logger.error('記錄技師回應失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async cancel(bookingId) {
    return await this.updateStatus(bookingId, BOOKING_STATUS.THERAPIST_CANCELLED);
  }

  static async getByDateRange(startDate, endDate) {
    try {
      const result = await db.query(
        `SELECT b.*, b.booking_code,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name, t.wechat_id, t.profile_pic_url, t.work_start_time, t.work_end_time,
                l.name as location_name, l.code as location_code
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.booking_date BETWEEN $1 AND $2
         ORDER BY b.created_at DESC`,
        [startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢日期範圍預約失敗', { error: error.message });
      throw error;
    }
  }

  /**
   * 獲取技師預約排名（指定天數範圍）
   * 注意：不包含 display_number 在 SELECT 和 GROUP BY 中，因為該欄位可能不存在
   */
  static async getTherapistRanking(days = 30) {
    try {
      const result = await db.query(
        `SELECT t.id, t.name as therapist_name,
                l.name as location_name, l.code as location_code,
                COUNT(b.id) as booking_count
         FROM bookings b
         JOIN therapists t ON b.therapist_id = t.id
         LEFT JOIN locations l ON t.location_id = l.id
         WHERE b.created_at >= NOW() - INTERVAL '1 day' * $1
           AND b.status NOT IN ('therapist_cancelled')
         GROUP BY t.id, t.name, l.name, l.code
         ORDER BY booking_count DESC`,
        [days]
      );
      return result.rows;
    } catch (error) {
      logger.error('獲取技師排名失敗', { error: error.message });
      throw error;
    }
  }
}

Booking.STATUS = BOOKING_STATUS;
Booking.STATUS_LABELS = STATUS_LABELS;

module.exports = Booking;
