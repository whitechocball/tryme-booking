const express = require('express');
const router = express.Router();
const Booking = require('../models/booking');
const BookingService = require('../services/bookingService');
const NoShow = require('../models/noshow');
const logger = require('../utils/logger');

// ========== 查詢端點 ==========

// 獲取所有預約（支持多維篩選）
router.get('/', async (req, res) => {
  try {
    const { status, date, bookingDate, therapistId, locationId, hasConflict } = req.query;
    const filters = {};

    if (status) filters.status = status;
    if (date || bookingDate) filters.bookingDate = date || bookingDate;
    if (therapistId) filters.therapistId = parseInt(therapistId);
    if (locationId) filters.locationId = parseInt(locationId);
    if (hasConflict === 'true') filters.hasConflict = true;

    const bookings = await Booking.getAll(filters);
    res.json(bookings);
  } catch (error) {
    logger.error('獲取預約列表失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取技師排名 (必須在 /:id 之前)
router.get('/ranking', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const ranking = await Booking.getTherapistRanking(days);
    res.json(ranking);
  } catch (error) {
    logger.error('獲取技師排名失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取預約統計
router.get('/stats/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const stats = await BookingService.getBookingStats(date);
    res.json(stats);
  } catch (error) {
    logger.error('獲取統計失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取所有可用狀態列表
router.get('/statuses', (req, res) => {
  res.json({
    statuses: Booking.STATUS,
    labels: Booking.STATUS_LABELS,
    transitions: Booking.VALID_TRANSITIONS,
    activeStatuses: Booking.ACTIVE_STATUSES,
  });
});

// ========== 衝突檢測端點 ==========

// 檢查特定時段衝突
router.get('/check-conflict', async (req, res) => {
  try {
    const { therapistId, bookingDate, timeSlot, timeOption, excludeBookingId } = req.query;

    if (!therapistId || !bookingDate || !timeSlot || !timeOption) {
      return res.status(400).json({ error: '缺少必要參數：therapistId, bookingDate, timeSlot, timeOption' });
    }

    const conflict = await Booking.checkConflict(
      parseInt(therapistId),
      bookingDate,
      timeSlot,
      timeOption,
      excludeBookingId ? parseInt(excludeBookingId) : null
    );

    res.json({
      hasConflict: !!conflict,
      conflictBooking: conflict || null,
    });
  } catch (error) {
    logger.error('衝突檢測失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 批量檢測並標記所有衝突
router.post('/detect-conflicts', async (req, res) => {
  try {
    const conflictIds = await Booking.detectAllConflicts();
    res.json({
      success: true,
      message: `檢測完成，發現 ${conflictIds.length} 個衝突預約`,
      conflictBookingIds: conflictIds,
    });
  } catch (error) {
    logger.error('批量衝突檢測失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ========== 超時處理端點 ==========

// 手動觸發超時處理
router.post('/handle-timeouts', async (req, res) => {
  try {
    const result = await BookingService.handleTimeoutBookings();
    res.json({
      success: true,
      message: `超時處理完成`,
      ...result,
    });
  } catch (error) {
    logger.error('超時處理失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取超時未回覆的預約列表
router.get('/timed-out', async (req, res) => {
  try {
    const bookings = await Booking.getTimedOutBookings();
    res.json(bookings);
  } catch (error) {
    logger.error('查詢超時預約失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ========== 單個預約操作 ==========

// 獲取特定預約
router.get('/:id', async (req, res) => {
  try {
    const booking = await Booking.getById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: '預約不存在' });
    }
    res.json(booking);
  } catch (error) {
    logger.error('獲取預約失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 創建預約（含衝突檢測）
router.post('/', async (req, res) => {
  try {
    const { customerId, therapistId, locationId, bookingDate, timeSlot, timeOption } = req.body;

    if (!customerId || !therapistId || !locationId || !bookingDate || !timeSlot || !timeOption) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    const booking = await BookingService.createBooking(
      customerId, therapistId, locationId, bookingDate, timeSlot, timeOption
    );

    res.status(201).json({ success: true, booking });
  } catch (error) {
    // 衝突錯誤返回 409
    if (error.message.includes('預約衝突')) {
      return res.status(409).json({ error: error.message, type: 'CONFLICT' });
    }
    logger.error('創建預約失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 確認預約（技師）：pending → confirmed
router.post('/:id/confirm', async (req, res) => {
  try {
    const { therapistId } = req.body;
    if (!therapistId) {
      return res.status(400).json({ error: '缺少 therapistId' });
    }

    await BookingService.confirmBooking(req.params.id, therapistId);
    res.json({ success: true, message: '預約已確認' });
  } catch (error) {
    logger.error('確認預約失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 開始服務：confirmed → in_progress
router.post('/:id/start', async (req, res) => {
  try {
    const booking = await BookingService.startService(req.params.id);
    res.json({ success: true, message: '服務已開始', booking });
  } catch (error) {
    logger.error('開始服務失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 完成服務：in_progress → completed
router.post('/:id/complete', async (req, res) => {
  try {
    const booking = await BookingService.completeBooking(req.params.id);
    res.json({ success: true, message: '服務已完成', booking });
  } catch (error) {
    logger.error('完成服務失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 拒絕預約（技師）
router.post('/:id/reject', async (req, res) => {
  try {
    const { therapistId } = req.body;
    if (!therapistId) {
      return res.status(400).json({ error: '缺少 therapistId' });
    }

    await BookingService.rejectBooking(req.params.id, therapistId);
    res.json({ success: true, message: '預約已拒絕' });
  } catch (error) {
    logger.error('拒絕預約失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 取消預約（客戶）
router.post('/:id/cancel', async (req, res) => {
  try {
    const { customerId, reason } = req.body;
    if (!customerId) {
      return res.status(400).json({ error: '缺少 customerId' });
    }

    await BookingService.cancelBooking(req.params.id, customerId, reason);
    res.json({ success: true, message: '預約已取消' });
  } catch (error) {
    logger.error('取消預約失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 管理員手動更改狀態
router.post('/:id/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!status) {
      return res.status(400).json({ error: '缺少 status 參數' });
    }

    const booking = await BookingService.adminUpdateStatus(req.params.id, status, reason);
    res.json({ success: true, message: `狀態已更新為 ${Booking.STATUS_LABELS[status] || status}`, booking });
  } catch (error) {
    logger.error('管理員更新狀態失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 標記爽約
router.post('/:id/noshow', async (req, res) => {
  try {
    const { reason } = req.body;
    const noShow = await BookingService.markNoShow(req.params.id, reason);
    res.json({ success: true, message: '爽約已記錄', noShow });
  } catch (error) {
    logger.error('標記爽約失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
