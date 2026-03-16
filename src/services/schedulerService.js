const cron = require('node-cron');
const BookingService = require('./bookingService');
const Booking = require('../models/booking');
const logger = require('../utils/logger');

class SchedulerService {
  static init() {
    console.log('⏰ 初始化定時任務...');

    // 每 5 分鐘檢查超時未回覆的預約
    cron.schedule('*/5 * * * *', async () => {
      try {
        logger.info('定時任務：檢查超時預約');
        const result = await BookingService.handleTimeoutBookings();
        if (result.processed > 0) {
          logger.info('超時處理結果', result);
        }
      } catch (error) {
        logger.error('定時超時處理失敗', { error: error.message });
      }
    });

    // 每 10 分鐘執行衝突檢測
    cron.schedule('*/10 * * * *', async () => {
      try {
        logger.info('定時任務：衝突檢測');
        const conflictIds = await Booking.detectAllConflicts();
        if (conflictIds.length > 0) {
          logger.warn('發現衝突預約', { count: conflictIds.length, ids: conflictIds });
        }
      } catch (error) {
        logger.error('定時衝突檢測失敗', { error: error.message });
      }
    });

    console.log('  ✓ 超時檢查：每 5 分鐘');
    console.log('  ✓ 衝突檢測：每 10 分鐘');
    console.log('✅ 定時任務初始化完成');
  }
}

module.exports = SchedulerService;
