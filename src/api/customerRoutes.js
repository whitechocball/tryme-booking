const express = require('express');
const router = express.Router();
const Customer = require('../models/customer');
const NoShow = require('../models/noshow');
const Booking = require('../models/booking');
const logger = require('../utils/logger');

// 獲取所有客戶
router.get('/', async (req, res) => {
  try {
    const customers = await Customer.getAll();
    res.json(customers);
  } catch (error) {
    logger.error('獲取客戶列表失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取特定客戶
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.getById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: '客戶不存在' });
    }

    // 獲取客戶的爽約記錄
    const noShows = await NoShow.getByCustomer(req.params.id);
    
    // 獲取客戶的預約記錄
    const bookings = await Booking.getByCustomer(req.params.id);

    res.json({
      ...customer,
      noShows,
      bookings,
    });
  } catch (error) {
    logger.error('獲取客戶失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取客戶的爽約記錄
router.get('/:id/noshows', async (req, res) => {
  try {
    const noShows = await NoShow.getByCustomer(req.params.id);
    res.json(noShows);
  } catch (error) {
    logger.error('獲取客戶爽約記錄失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取客戶的預約記錄
router.get('/:id/bookings', async (req, res) => {
  try {
    const bookings = await Booking.getByCustomer(req.params.id);
    res.json(bookings);
  } catch (error) {
    logger.error('獲取客戶預約記錄失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
