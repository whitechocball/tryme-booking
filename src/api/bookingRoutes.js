const express = require('express');
const router = express.Router();
const Booking = require('../models/booking');
const BookingService = require('../services/bookingService');
const NoShow = require('../models/noshow');
const logger = require('../utils/logger');

// 獲取所有預約
router.get('/', async (req, res) => {
  try {
    const { status, date, bookingDate } = req.query;
    const filters = {};

    if (status) filters.status = status;
    if (date || bookingDate) filters.bookingDate = date || bookingDate;

    const bookings = await Booking.getAll(filters);
    res.json(bookings);
  } catch (error) {
    logger.error('獲取預約列表失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取技師排名
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

// 確認預約（技師）
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
    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({ error: '缺少 customerId' });
    }

    await BookingService.cancelBooking(req.params.id, customerId);
    res.json({ success: true, message: '預約已取消' });
  } catch (error) {
    logger.error('取消預約失敗', { error: error.message });
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
