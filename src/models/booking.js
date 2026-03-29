const db = require('../utils/db');
const logger = require('../utils/logger');

// ========== 統一狀態定義（唯一權威來源） ==========
const BOOKING_STATUS = {
  PENDING: 'pending',                       // 待確認（新預約，等待技師回覆）
  CONFIRMED: 'confirmed',                   // 技師已確認
  IN_PROGRESS: 'in_progress',               // 進行中
  COMPLETED: 'completed',                   // 已完成
  CANCELLED: 'cancelled',                   // 已取消（含客戶取消、技師拒絕、管理員取消）
  NO_SHOW: 'no_show',                       // 爽約
  RESCHEDULED: 'rescheduled',               // 改期待確認（技師提出新時間，等待客戶回覆）
};

const STATUS_LABELS = {
  'pending': '待確認',
  'confirmed': '技師已確認',
  'in_progress': '進行中',
  'completed': '已完成',
  'cancelled': '已取消',
  'no_show': '爽約',
  'rescheduled': '改期待確認',
};

// 活躍狀態（用於衝突檢測）
const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress', 'rescheduled'];

// 合法的狀態流轉
const VALID_TRANSITIONS = {
  'pending': ['confirmed', 'cancelled', 'no_show', 'rescheduled'],
  'confirmed': ['in_progress', 'cancelled', 'no_show'],
  'in_progress': ['completed', 'cancelled', 'no_show'],
  'rescheduled': ['confirmed', 'cancelled', 'no_show'],
};

/**
 * 舊狀態 → 標準狀態 映射表
 * 用於數據遷移和運行時兼容
 */
const LEGACY_STATUS_MAP = {
  'waiting_therapist': 'pending',
  'waiting_service': 'confirmed',
  'pending_technician_confirmation': 'pending',
  'rejected_by_technician': 'cancelled',
  'rescheduled_pending': 'rescheduled',
  'rescheduled_pending_customer_approval': 'rescheduled',
  'cancelled_by_customer': 'cancelled',
  'customer_no_show': 'no_show',
  'therapist_cancelled': 'cancelled',
  'therapist_no_show': 'no_show',
  'rejected': 'cancelled',
};

/**
 * 將任意狀態標準化（如果是舊狀態則映射為標準狀態）
 */
function normalizeStatus(status) {
  if (Object.values(BOOKING_STATUS).includes(status)) {
    return status;
  }
  return LEGACY_STATUS_MAP[status] || status;
}

/**
 * 生成預約編號：YYYYMMDD-HHmm-XXXX（含隨機碼避免重複）
 */
function generateBookingCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${y}${m}${d}-${h}${min}-${rand}`;
}

class Booking {

  // ========== 衝突檢測 ==========

  /**
   * 檢查技師在指定日期和時段是否有衝突
   * @returns {object|null} 衝突的預約，或 null 表示無衝突
   */
  static async checkConflict(therapistId, bookingDate, timeSlot, timeOption, excludeBookingId = null) {
    try {
      let query = `
        SELECT b.id, b.customer_id, b.therapist_id, b.booking_date, b.time_slot, b.time_option, b.status,
               c.name as customer_name, t.name as therapist_name
        FROM bookings b
        LEFT JOIN customers c ON b.customer_id = c.id
        LEFT JOIN therapists t ON b.therapist_id = t.id
        WHERE b.therapist_id = $1
          AND b.booking_date = $2
          AND b.time_slot = $3
          AND b.time_option = $4
          AND b.status = ANY($5)
      `;
      const params = [therapistId, bookingDate, timeSlot, timeOption, ACTIVE_STATUSES];

      if (excludeBookingId) {
        query += ' AND b.id != $6';
        params.push(excludeBookingId);
      }

      query += ' LIMIT 1';

      const result = await db.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('衝突檢測失敗', { error: error.message, therapistId, bookingDate });
      throw error;
    }
  }

  /**
   * 批量檢測所有預約的衝突狀態，並更新 has_conflict 標記
   */
  static async detectAllConflicts() {
    try {
      // 先重置所有衝突標記
      await db.query('UPDATE bookings SET has_conflict = FALSE WHERE has_conflict = TRUE');

      // 找出所有活躍狀態中有衝突的預約（同一技師、同一日期、同一時段有多個活躍預約）
      const conflictQuery = `
        WITH conflict_groups AS (
          SELECT therapist_id, booking_date, time_slot, time_option
          FROM bookings
          WHERE status = ANY($1)
          GROUP BY therapist_id, booking_date, time_slot, time_option
          HAVING COUNT(*) > 1
        )
        UPDATE bookings b
        SET has_conflict = TRUE
        FROM conflict_groups cg
        WHERE b.therapist_id = cg.therapist_id
          AND b.booking_date = cg.booking_date
          AND b.time_slot = cg.time_slot
          AND b.time_option = cg.time_option
          AND b.status = ANY($1)
        RETURNING b.id
      `;

      const result = await db.query(conflictQuery, [ACTIVE_STATUSES]);
      logger.info('衝突檢測完成', { conflictCount: result.rows.length });
      return result.rows.map(r => r.id);
    } catch (error) {
      logger.error('批量衝突檢測失敗', { error: error.message });
      throw error;
    }
  }

  // ========== CRUD ==========

  static async create(customerId, therapistId, locationId, bookingDate, timeSlot, timeOption, extras = {}) {
    try {
      const bookingCode = generateBookingCode();
      const bookingTime = extras.bookingTime || null;
      const aiSessionId = extras.aiSessionId || null;

      const result = await db.query(
        `INSERT INTO bookings (customer_id, therapist_id, location_id, booking_date, time_slot, time_option, status, booking_code, booking_time, ai_session_id, status_changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP) RETURNING *`,
        [customerId, therapistId, locationId, bookingDate, timeSlot, timeOption, BOOKING_STATUS.PENDING, bookingCode, bookingTime, aiSessionId]
      );
      logger.info('新預約已創建', { customerId, therapistId, bookingDate, bookingId: result.rows[0]?.id, bookingCode });
      return result.rows[0];
    } catch (error) {
      logger.error('創建預約失敗', { error: error.message, customerId, therapistId });
      throw error;
    }
  }

  static async getById(bookingId) {
    try {
      const result = await db.query(
        `SELECT b.id, b.customer_id, b.therapist_id, b.location_id, b.booking_date, 
                b.time_slot, b.time_option, b.status, b.therapist_response_at, 
                b.created_at, b.updated_at, b.has_conflict, b.timeout_notified,
                b.status_changed_at, b.cancel_reason, b.booking_code, b.booking_time, b.ai_session_id,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name,
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
        `SELECT b.id, b.customer_id, b.therapist_id, b.location_id, b.booking_date, 
                b.time_slot, b.time_option, b.status, b.therapist_response_at, 
                b.created_at, b.updated_at, b.has_conflict, b.booking_code, b.booking_time,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name,
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
        `SELECT b.id, b.customer_id, b.therapist_id, b.location_id, b.booking_date, 
                b.time_slot, b.time_option, b.status, b.therapist_response_at, 
                b.created_at, b.updated_at, b.has_conflict, b.booking_code, b.booking_time,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name,
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
      let query = `SELECT b.id, b.customer_id, b.therapist_id, b.location_id, b.booking_date, 
                          b.time_slot, b.time_option, b.status, b.therapist_response_at, 
                          b.created_at, b.updated_at, b.has_conflict, b.timeout_notified,
                          b.status_changed_at, b.cancel_reason, b.booking_code, b.booking_time,
                          c.name as customer_name, c.telegram_id,
                          t.id as t_id, t.name as therapist_name, t.display_number,
                          t.profile_pic_url, t.work_start_time, t.work_end_time,
                          l.name as location_name, l.code as location_code, l.id as loc_id
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

      if (filters.therapistId) {
        conditions.push(`b.therapist_id = $${paramCount}`);
        params.push(filters.therapistId);
        paramCount++;
      }

      if (filters.locationId) {
        conditions.push(`b.location_id = $${paramCount}`);
        params.push(filters.locationId);
        paramCount++;
      }

      if (filters.hasConflict) {
        conditions.push(`b.has_conflict = TRUE`);
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

  // ========== 狀態管理 ==========

  static async updateStatus(bookingId, status, cancelReason = null) {
    try {
      let query, params;
      if (cancelReason) {
        query = 'UPDATE bookings SET status = $1, cancel_reason = $3, status_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
        params = [status, bookingId, cancelReason];
      } else {
        query = 'UPDATE bookings SET status = $1, status_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
        params = [status, bookingId];
      }
      const result = await db.query(query, params);
      logger.info('預約狀態已更新', { bookingId, status });
      return result.rows[0];
    } catch (error) {
      logger.error('更新預約狀態失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  /**
   * 帶狀態流轉驗證的狀態更新
   */
  static async transitionStatus(bookingId, newStatus, cancelReason = null) {
    try {
      const booking = await this.getById(bookingId);
      if (!booking) throw new Error('預約不存在');

      const currentStatus = booking.status;
      const allowed = VALID_TRANSITIONS[currentStatus];

      if (allowed && !allowed.includes(newStatus)) {
        throw new Error(`無法從 "${STATUS_LABELS[currentStatus] || currentStatus}" 轉為 "${STATUS_LABELS[newStatus] || newStatus}"`);
      }

      return await this.updateStatus(bookingId, newStatus, cancelReason);
    } catch (error) {
      logger.error('狀態流轉失敗', { error: error.message, bookingId, newStatus });
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

  static async cancel(bookingId, reason = null) {
    return await this.updateStatus(bookingId, BOOKING_STATUS.CANCELLED, reason);
  }

  // ========== 超時處理 ==========

  /**
   * 獲取超過 30 分鐘未回覆的 pending 預約
   */
  static async getTimedOutBookings() {
    try {
      const result = await db.query(
        `SELECT b.id, b.customer_id, b.therapist_id, b.booking_date, b.time_slot, b.time_option,
                b.status, b.created_at, b.timeout_notified, b.booking_code, b.booking_time,
                c.name as customer_name, c.telegram_id,
                t.name as therapist_name
         FROM bookings b
         LEFT JOIN customers c ON b.customer_id = c.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         WHERE b.status = 'pending'
           AND b.therapist_response_at IS NULL
           AND b.timeout_notified = FALSE
           AND b.created_at < NOW() - INTERVAL '30 minutes'
         ORDER BY b.created_at ASC`
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢超時預約失敗', { error: error.message });
      throw error;
    }
  }

  /**
   * 標記預約已發送超時通知
   */
  static async markTimeoutNotified(bookingId) {
    try {
      const result = await db.query(
        'UPDATE bookings SET timeout_notified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [bookingId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('標記超時通知失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  // ========== 查詢 ==========

  static async getByDateRange(startDate, endDate) {
    try {
      const result = await db.query(
        `SELECT b.id, b.customer_id, b.therapist_id, b.location_id, b.booking_date, 
                b.time_slot, b.time_option, b.status, b.therapist_response_at, 
                b.created_at, b.updated_at, b.has_conflict, b.booking_code, b.booking_time,
                c.name as customer_name, c.telegram_id,
                t.id as therapist_id, t.name as therapist_name,
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
           AND b.status NOT IN ('cancelled')
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

  /**
   * 更新預約的 ai_session_id
   */
  static async updateAiSessionId(bookingId, aiSessionId) {
    try {
      const result = await db.query(
        'UPDATE bookings SET ai_session_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [aiSessionId, bookingId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('更新 AI 會話 ID 失敗', { error: error.message, bookingId });
      throw error;
    }
  }
}

Booking.STATUS = BOOKING_STATUS;
Booking.STATUS_LABELS = STATUS_LABELS;
Booking.ACTIVE_STATUSES = ACTIVE_STATUSES;
Booking.VALID_TRANSITIONS = VALID_TRANSITIONS;
Booking.LEGACY_STATUS_MAP = LEGACY_STATUS_MAP;
Booking.normalizeStatus = normalizeStatus;
Booking.generateBookingCode = generateBookingCode;

module.exports = Booking;
