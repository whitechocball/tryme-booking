const Booking = require('../models/booking');
const Customer = require('../models/customer');
const Therapist = require('../models/therapist');
const Location = require('../models/location');
const NoShow = require('../models/noshow');
const logger = require('../utils/logger');
const telegramUtil = require('../utils/telegram');

let wecom;
try {
  wecom = require('../utils/wecom');
} catch (e) {
  wecom = null;
}

// 兼容舊的 wechat.js
let wechatUtil;
try {
  wechatUtil = require('../utils/wechat');
} catch (e) {
  wechatUtil = null;
}

class BookingService {

  // ========== 創建預約（含衝突檢測） ==========

  static async createBooking(customerId, therapistId, locationId, bookingDate, timeSlot, timeOption) {
    try {
      // 1. 衝突檢測：檢查該技師在該時段是否已有活躍預約
      const conflict = await Booking.checkConflict(therapistId, bookingDate, timeSlot, timeOption);

      if (conflict) {
        const therapist = await Therapist.getById(therapistId);
        const therapistName = therapist ? therapist.name : `技師 #${therapistId}`;
        throw new Error(
          `預約衝突：${therapistName} 在 ${bookingDate} ${this.getTimeSlotLabel(timeSlot)} ${timeOption} 時段已有預約（預約 #${conflict.id}，狀態：${Booking.STATUS_LABELS[conflict.status] || conflict.status}）`
        );
      }

      // 2. 創建預約（初始狀態為 pending）
      const booking = await Booking.create(
        customerId,
        therapistId,
        locationId,
        bookingDate,
        timeSlot,
        timeOption
      );

      // 3. 獲取詳細信息
      const bookingDetails = await Booking.getById(booking.id);
      const therapist = await Therapist.getById(therapistId);
      const customer = await Customer.getById(customerId);

      // 4. 獲取客戶與該技師的預約次數
      const bookingCountWithTherapist = await Therapist.getBookingCountWithCustomer(therapistId, customerId);

      // 5. 獲取客戶的總爽約次數
      const totalNoShowCount = await NoShow.getCountByCustomer(customerId);

      // 6. 發送企業微信通知給技師（優先使用新的 wecom 模塊發送卡片消息）
      const wechatUserId = therapist ? (therapist.wechat_userid || therapist.external_user_id) : null;
      
      if (wechatUserId && wecom && wecom.isConfigured()) {
        const notificationData = {
          bookingId: booking.id,
          customerName: customer ? (customer.name || `用戶 ${customerId}`) : `用戶 ${customerId}`,
          locationName: bookingDetails.location_name,
          bookingDate: bookingDate,
          timeSlot: this.getTimeSlotLabel(timeSlot),
          timeOption: timeOption,
          bookingTime: bookingDetails.booking_time,
          bookingCountWithTherapist: bookingCountWithTherapist,
          totalNoShowCount: totalNoShowCount,
        };

        try {
          await wecom.sendBookingNotificationCard(wechatUserId, notificationData);
          logger.info('企業微信卡片通知已發送', { bookingId: booking.id, therapistId, wechatUserId });
        } catch (cardError) {
          logger.warn('卡片消息發送失敗，嘗試文本消息', { error: cardError.message });
          
          // 降級為文本消息
          try {
            const textMsg = `【新預約通知】\n` +
              `預約編號: #${booking.id}\n` +
              `客戶: ${notificationData.customerName}\n` +
              `場所: ${notificationData.locationName}\n` +
              `日期: ${bookingDate}\n` +
              `時間: ${notificationData.bookingTime || `${notificationData.timeSlot} ${timeOption || ''}`}\n` +
              `歷史預約: ${bookingCountWithTherapist} 次\n` +
              `爽約記錄: ${totalNoShowCount} 次\n\n` +
              `請回覆「接受」或「拒絕」`;
            await wecom.sendTextMessage(wechatUserId, textMsg);
          } catch (textError) {
            logger.error('文本消息也發送失敗', { error: textError.message });
          }
        }
      } else if (wechatUserId && wechatUtil) {
        // 兼容舊模式
        const notificationData = {
          bookingId: booking.id,
          customerName: customer ? (customer.name || `用戶 ${customerId}`) : `用戶 ${customerId}`,
          locationName: bookingDetails.location_name,
          bookingDate: bookingDate,
          timeSlot: this.getTimeSlotLabel(timeSlot),
          timeOption: timeOption,
          bookingCountWithTherapist: bookingCountWithTherapist,
          totalNoShowCount: totalNoShowCount,
        };

        try {
          await wechatUtil.sendBookingNotification(wechatUserId, notificationData);
        } catch (error) {
          logger.error('發送企業微信通知失敗', { error: error.message, therapistId });
        }
      }

      logger.info('預約已創建並通知已發送', { bookingId: booking.id, therapistId });
      return booking;
    } catch (error) {
      logger.error('創建預約失敗', { error: error.message });
      throw error;
    }
  }

  // ========== 狀態流轉操作 ==========

  /**
   * 確認預約（技師確認）：pending → confirmed
   */
  static async confirmBooking(bookingId, therapistId) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) throw new Error('預約不存在');
      if (booking.therapist_id !== therapistId) throw new Error('無權確認此預約');

      // 使用新狀態或兼容舊狀態
      const newStatus = (booking.status === 'waiting_therapist') 
        ? Booking.STATUS.WAITING_SERVICE 
        : Booking.STATUS.CONFIRMED;

      await Booking.updateStatus(bookingId, newStatus);
      await Booking.markTherapistResponse(bookingId);

      try {
        await telegramUtil.sendBookingConfirmation(booking.telegram_id, {
          locationName: booking.location_name,
          therapistName: booking.therapist_name,
          bookingDate: booking.booking_date,
          timeSlot: this.getTimeSlotLabel(booking.time_slot),
          timeOption: booking.time_option,
          bookingId: booking.id,
        });
      } catch (error) {
        logger.error('發送 Telegram 確認消息失敗', { error: error.message });
      }

      // 發送企業微信確認通知
      const therapist = await Therapist.getById(therapistId);
      const wechatUserId = therapist ? (therapist.wechat_userid || therapist.external_user_id) : null;
      if (wechatUserId && wecom && wecom.isConfigured()) {
        try {
          await wecom.sendTextMessage(wechatUserId, `✅ 您已成功接受預約 #${bookingId}\n\n場所：${booking.location_name}\n日期：${booking.booking_date}\n時間：${booking.booking_time || booking.time_slot}`);
        } catch (e) {
          logger.warn('發送企業微信確認通知失敗', { error: e.message });
        }
      }

      logger.info('預約已確認', { bookingId, therapistId });
    } catch (error) {
      logger.error('確認預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  /**
   * 開始服務：confirmed → in_progress
   */
  static async startService(bookingId) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) throw new Error('預約不存在');

      if (booking.status !== 'confirmed' && booking.status !== 'waiting_service') {
        throw new Error(`無法開始服務：當前狀態為 "${Booking.STATUS_LABELS[booking.status] || booking.status}"`);
      }

      await Booking.updateStatus(bookingId, Booking.STATUS.IN_PROGRESS);
      logger.info('服務已開始', { bookingId });
      return await Booking.getById(bookingId);
    } catch (error) {
      logger.error('開始服務失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  /**
   * 完成服務：in_progress → completed
   */
  static async completeBooking(bookingId) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) throw new Error('預約不存在');

      if (booking.status !== 'in_progress' && booking.status !== 'waiting_service' && booking.status !== 'confirmed') {
        throw new Error(`無法完成服務：當前狀態為 "${Booking.STATUS_LABELS[booking.status] || booking.status}"`);
      }

      await Booking.updateStatus(bookingId, Booking.STATUS.COMPLETED);
      logger.info('服務已完成', { bookingId });
      return await Booking.getById(bookingId);
    } catch (error) {
      logger.error('完成服務失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  /**
   * 拒絕預約（技師）
   */
  static async rejectBooking(bookingId, therapistId) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) throw new Error('預約不存在');
      if (booking.therapist_id !== therapistId) throw new Error('無權拒絕此預約');

      const newStatus = (booking.status === 'waiting_therapist')
        ? Booking.STATUS.THERAPIST_CANCELLED
        : Booking.STATUS.CANCELLED;

      await Booking.updateStatus(bookingId, newStatus, '技師拒絕');
      await Booking.markTherapistResponse(bookingId);

      try {
        await telegramUtil.sendBookingRejection(booking.telegram_id, {
          locationName: booking.location_name,
          therapistName: booking.therapist_name,
          bookingDate: booking.booking_date,
          timeSlot: this.getTimeSlotLabel(booking.time_slot),
        });
      } catch (error) {
        logger.error('發送 Telegram 拒絕消息失敗', { error: error.message });
      }

      // 發送企業微信拒絕通知
      const therapist = await Therapist.getById(therapistId);
      const wechatUserId = therapist ? (therapist.wechat_userid || therapist.external_user_id) : null;
      if (wechatUserId && wecom && wecom.isConfigured()) {
        try {
          await wecom.sendTextMessage(wechatUserId, `❌ 您已拒絕預約 #${bookingId}\n\n場所：${booking.location_name}\n日期：${booking.booking_date}`);
        } catch (e) {
          logger.warn('發送企業微信拒絕通知失敗', { error: e.message });
        }
      }

      logger.info('預約已拒絕', { bookingId, therapistId });
    } catch (error) {
      logger.error('拒絕預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  /**
   * 取消預約
   */
  static async cancelBooking(bookingId, customerId, reason = null) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) throw new Error('預約不存在');
      if (booking.customer_id !== customerId) throw new Error('無權取消此預約');

      // 檢查是否在可取消的狀態
      const cancellableStatuses = ['pending', 'confirmed', 'waiting_therapist', 'waiting_service'];
      if (!cancellableStatuses.includes(booking.status)) {
        throw new Error(`當前狀態 "${Booking.STATUS_LABELS[booking.status] || booking.status}" 無法取消`);
      }

      const bookingDateTime = new Date(`${booking.booking_date}T12:00:00`);
      const now = new Date();
      const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);

      if (hoursUntilBooking < 1) {
        throw new Error('預約前 1 小時內無法取消');
      }

      await Booking.updateStatus(bookingId, Booking.STATUS.CANCELLED, reason || '客戶取消');
      logger.info('預約已取消', { bookingId, customerId });
    } catch (error) {
      logger.error('取消預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  /**
   * 管理員手動更改狀態
   */
  static async adminUpdateStatus(bookingId, newStatus, reason = null) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) throw new Error('預約不存在');

      // 管理員可以強制更改任何狀態
      const validStatuses = Object.values(Booking.STATUS);
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`無效的狀態: ${newStatus}`);
      }

      await Booking.updateStatus(bookingId, newStatus, reason);
      logger.info('管理員更新預約狀態', { bookingId, newStatus, reason });
      return await Booking.getById(bookingId);
    } catch (error) {
      logger.error('管理員更新狀態失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  /**
   * 標記爽約
   */
  static async markNoShow(bookingId, reason = null) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) throw new Error('預約不存在');

      const noShow = await NoShow.create(
        bookingId,
        booking.customer_id,
        booking.therapist_id,
        booking.booking_date,
        reason,
        'admin'
      );

      await Booking.updateStatus(bookingId, Booking.STATUS.NO_SHOW, reason);

      logger.info('爽約記錄已創建', { bookingId, customerId: booking.customer_id });
      return noShow;
    } catch (error) {
      logger.error('標記爽約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  // ========== 超時處理 ==========

  /**
   * 處理超時未回覆的預約（由定時任務調用）
   */
  static async handleTimeoutBookings() {
    try {
      const timedOutBookings = await Booking.getTimedOutBookings();

      if (timedOutBookings.length === 0) {
        return { processed: 0 };
      }

      let notifiedCount = 0;

      for (const booking of timedOutBookings) {
        try {
          // 發送超時通知給客戶
          if (booking.telegram_id) {
            try {
              await telegramUtil.sendMessage(booking.telegram_id,
                `⏰ 您的預約 #${booking.id} 提醒：\n\n` +
                `技師 ${booking.therapist_name || '未知'} 暫時未回覆您的預約請求。\n` +
                `預約日期：${booking.booking_date}\n` +
                `時段：${this.getTimeSlotLabel(booking.time_slot)} ${booking.time_option}\n\n` +
                `請稍後再試或選擇其他技師。如有疑問請聯繫客服。`
              );
            } catch (sendError) {
              logger.error('發送超時通知失敗', { error: sendError.message, bookingId: booking.id });
            }
          }

          // 標記已通知
          await Booking.markTimeoutNotified(booking.id);
          notifiedCount++;

          logger.info('超時通知已發送', { bookingId: booking.id, customerId: booking.customer_id });
        } catch (error) {
          logger.error('處理超時預約失敗', { error: error.message, bookingId: booking.id });
        }
      }

      logger.info('超時處理完成', { total: timedOutBookings.length, notified: notifiedCount });
      return { processed: timedOutBookings.length, notified: notifiedCount };
    } catch (error) {
      logger.error('超時處理批次失敗', { error: error.message });
      throw error;
    }
  }

  // ========== 工具方法 ==========

  static getTimeSlotLabel(timeSlot) {
    const labels = {
      'morning': '早上',
      'afternoon': '中午',
      'evening': '晚上',
    };
    return labels[timeSlot] || timeSlot;
  }

  static async getBookingStats(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const bookings = await Booking.getAll({ bookingDate: targetDate });

      const stats = {
        totalBookings: bookings.length,
        // 新狀態統計
        pending: bookings.filter(b => b.status === 'pending').length,
        confirmed: bookings.filter(b => b.status === 'confirmed').length,
        inProgress: bookings.filter(b => b.status === 'in_progress').length,
        completed: bookings.filter(b => b.status === 'completed').length,
        cancelled: bookings.filter(b => b.status === 'cancelled').length,
        noShow: bookings.filter(b => b.status === 'no_show').length,
        conflicts: bookings.filter(b => b.has_conflict).length,
        // 向後兼容舊狀態
        waitingTherapist: bookings.filter(b => b.status === 'waiting_therapist' || b.status === 'pending').length,
        waitingService: bookings.filter(b => b.status === 'waiting_service' || b.status === 'confirmed').length,
        customerNoShow: bookings.filter(b => b.status === 'customer_no_show' || b.status === 'no_show').length,
        therapistCancelled: bookings.filter(b => b.status === 'therapist_cancelled').length,
        therapistNoShow: bookings.filter(b => b.status === 'therapist_no_show').length,
        // 向後兼容
        confirmedBookings: bookings.filter(b => ['waiting_service', 'confirmed'].includes(b.status)).length,
        pendingBookings: bookings.filter(b => ['waiting_therapist', 'pending'].includes(b.status)).length,
      };

      return stats;
    } catch (error) {
      logger.error('獲取預約統計失敗', { error: error.message });
      throw error;
    }
  }
}

module.exports = BookingService;
