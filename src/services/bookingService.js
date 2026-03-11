const Booking = require('../models/booking');
const Customer = require('../models/customer');
const Therapist = require('../models/therapist');
const Location = require('../models/location');
const NoShow = require('../models/noshow');
const logger = require('../utils/logger');
const wechatUtil = require('../utils/wechat');
const telegramUtil = require('../utils/telegram');

class BookingService {
  static async createBooking(customerId, therapistId, locationId, bookingDate, timeSlot, timeOption) {
    try {
      // 檢查時間是否已被預約
      const existingBooking = await Booking.getAll({
        status: 'confirmed',
        bookingDate,
      });

      const conflict = existingBooking.some(
        b => b.therapist_id === therapistId && 
             b.time_slot === timeSlot && 
             b.time_option === timeOption
      );

      if (conflict) {
        throw new Error('該時間已被預約');
      }

      // 創建預約
      const booking = await Booking.create(
        customerId,
        therapistId,
        locationId,
        bookingDate,
        timeSlot,
        timeOption
      );

      // 獲取詳細信息
      const bookingDetails = await Booking.getById(booking.id);
      const therapist = await Therapist.getById(therapistId);
      const customer = await Customer.getById(customerId);

      // 獲取客戶與該技師的預約次數
      const bookingCountWithTherapist = await Therapist.getBookingCountWithCustomer(therapistId, customerId);

      // 獲取客戶的總爽約次數
      const totalNoShowCount = await NoShow.getCountByCustomer(customerId);

      // 發送企業微信通知給技師
      if (therapist.wechat_id) {
        const notificationData = {
          bookingId: booking.id,
          customerName: customer.name || `用戶 ${customerId}`,
          locationName: bookingDetails.location_name,
          bookingDate: bookingDate,
          timeSlot: this.getTimeSlotLabel(timeSlot),
          timeOption: timeOption,
          bookingCountWithTherapist: bookingCountWithTherapist,
          totalNoShowCount: totalNoShowCount,
        };

        try {
          await wechatUtil.sendBookingNotification(therapist.wechat_id, notificationData);
        } catch (error) {
          logger.error('發送企業微信通知失敗', { error: error.message, therapistId });
          // 不中斷流程，繼續
        }
      }

      logger.info('預約已創建並通知已發送', { bookingId: booking.id, therapistId });
      return booking;
    } catch (error) {
      logger.error('創建預約失敗', { error: error.message });
      throw error;
    }
  }

  static async confirmBooking(bookingId, therapistId) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) {
        throw new Error('預約不存在');
      }

      if (booking.therapist_id !== therapistId) {
        throw new Error('無權確認此預約');
      }

      // 更新預約狀態
      await Booking.updateStatus(bookingId, 'confirmed');
      await Booking.markTherapistResponse(bookingId);

      // 發送 Telegram 確認消息給客戶
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

      logger.info('預約已確認', { bookingId, therapistId });
    } catch (error) {
      logger.error('確認預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async rejectBooking(bookingId, therapistId) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) {
        throw new Error('預約不存在');
      }

      if (booking.therapist_id !== therapistId) {
        throw new Error('無權拒絕此預約');
      }

      // 更新預約狀態
      await Booking.updateStatus(bookingId, 'rejected');
      await Booking.markTherapistResponse(bookingId);

      // 發送 Telegram 拒絕消息給客戶
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

      logger.info('預約已拒絕', { bookingId, therapistId });
    } catch (error) {
      logger.error('拒絕預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async cancelBooking(bookingId, customerId) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) {
        throw new Error('預約不存在');
      }

      if (booking.customer_id !== customerId) {
        throw new Error('無權取消此預約');
      }

      // 檢查是否在預約前 1 小時內
      const bookingDateTime = new Date(`${booking.booking_date}T12:00:00`);
      const now = new Date();
      const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);

      if (hoursUntilBooking < 1) {
        throw new Error('預約前 1 小時內無法取消');
      }

      // 更新預約狀態
      await Booking.updateStatus(bookingId, 'cancelled');

      logger.info('預約已取消', { bookingId, customerId });
    } catch (error) {
      logger.error('取消預約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

  static async markNoShow(bookingId, reason = null) {
    try {
      const booking = await Booking.getById(bookingId);
      if (!booking) {
        throw new Error('預約不存在');
      }

      // 創建爽約記錄
      const noShow = await NoShow.create(
        bookingId,
        booking.customer_id,
        booking.therapist_id,
        booking.booking_date,
        reason,
        'system'
      );

      // 更新預約狀態
      await Booking.updateStatus(bookingId, 'completed');

      logger.info('爽約記錄已創建', { bookingId, customerId: booking.customer_id });
      return noShow;
    } catch (error) {
      logger.error('標記爽約失敗', { error: error.message, bookingId });
      throw error;
    }
  }

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
        confirmedBookings: bookings.filter(b => b.status === 'confirmed').length,
        pendingBookings: bookings.filter(b => b.status === 'pending').length,
        rejectedBookings: bookings.filter(b => b.status === 'rejected').length,
        completedBookings: bookings.filter(b => b.status === 'completed').length,
        byTherapist: {},
      };

      // 按技師統計
      for (const booking of bookings) {
        if (!stats.byTherapist[booking.therapist_name]) {
          stats.byTherapist[booking.therapist_name] = 0;
        }
        if (booking.status === 'confirmed' || booking.status === 'completed') {
          stats.byTherapist[booking.therapist_name]++;
        }
      }

      return stats;
    } catch (error) {
      logger.error('獲取預約統計失敗', { error: error.message });
      throw error;
    }
  }
}

module.exports = BookingService;
