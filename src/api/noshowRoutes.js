const express = require('express');
const router = express.Router();
const NoShow = require('../models/noshow');
const Customer = require('../models/customer');
const logger = require('../utils/logger');

// 獲取所有爽約記錄
router.get('/', async (req, res) => {
  try {
    const { customerId, therapistId, startDate, endDate } = req.query;
    const filters = {};

    if (customerId) filters.customerId = parseInt(customerId, 10);
    if (therapistId) filters.therapistId = parseInt(therapistId, 10);
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const noShows = await NoShow.getAll(filters);
    res.json(noShows);
  } catch (error) {
    logger.error('獲取爽約記錄列表失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取特定爽約記錄
router.get('/:id', async (req, res) => {
  try {
    const noShow = await NoShow.getById(req.params.id);
    if (!noShow) {
      return res.status(404).json({ error: '爽約記錄不存在' });
    }
    res.json(noShow);
  } catch (error) {
    logger.error('獲取爽約記錄失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 創建爽約記錄（管理員或技師）
router.post('/', async (req, res) => {
  try {
    const { bookingId, customerId, therapistId, noShowDate, reason, reportedBy } = req.body;

    if (!bookingId || !customerId || !therapistId || !noShowDate) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    const noShow = await NoShow.create(
      bookingId,
      customerId,
      therapistId,
      noShowDate,
      reason,
      reportedBy || 'admin'
    );

    res.json({ success: true, message: '爽約記錄已創建', noShow });
  } catch (error) {
    logger.error('創建爽約記錄失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 刪除爽約記錄（撤銷爽約）
router.delete('/:id', async (req, res) => {
  try {
    await NoShow.delete(req.params.id);
    res.json({ success: true, message: '爽約記錄已刪除' });
  } catch (error) {
    logger.error('刪除爽約記錄失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取客戶爽約記錄
router.get('/customer/:customerId', async (req, res) => {
  try {
    const noShows = await NoShow.getByCustomer(req.params.customerId);
    res.json(noShows);
  } catch (error) {
    logger.error('獲取客戶爽約記錄失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 获取技师爽约记录
router.get('/therapist/:therapistId', async (req, res) => {
  try {
    const noShows = await NoShow.getByTherapist(req.params.therapistId);
    res.json(noShows);
  } catch (error) {
    logger.error('获取技师爽约记录失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 获取客户爽约排名
router.get('/ranking/customer', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    const ranking = await NoShow.getCustomerNoShowRanking(filters);
    res.json(ranking);
  } catch (error) {
    logger.error('获取客户爽约排名失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 获取技师爽约详细记录
router.get('/details/therapist', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    const details = await NoShow.getTherapistNoShowDetails(filters);
    res.json(details);
  } catch (error) {
    logger.error('获取技师爽约详情失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 更新技师爽约备注
router.put('/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    if (notes === undefined) {
      return res.status(400).json({ error: '缺少备注内容' });
    }
    const updated = await NoShow.updateTherapistNotes(req.params.id, notes);
    res.json({ success: true, message: '备注已更新', noShow: updated });
  } catch (error) {
    logger.error('更新技师爽约备注失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
