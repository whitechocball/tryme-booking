const express = require('express');
const router = express.Router();
const Therapist = require('../models/therapist');
const NoShow = require('../models/noshow');
const logger = require('../utils/logger');

// 獲取所有技師
router.get('/', async (req, res) => {
  try {
    const therapists = await Therapist.getAll();
    res.json(therapists);
  } catch (error) {
    logger.error('獲取技師列表失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取特定技師
router.get('/:id', async (req, res) => {
  try {
    const therapist = await Therapist.getById(req.params.id);
    if (!therapist) {
      return res.status(404).json({ error: '技師不存在' });
    }

    // 獲取該技師的爽約次數
    const noShowCount = await NoShow.getCountByTherapist(req.params.id);

    res.json({
      ...therapist,
      noShowCount,
    });
  } catch (error) {
    logger.error('獲取技師失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 創建技師
router.post('/', async (req, res) => {
  try {
    const { name, locationId, wechatId, externalUserId, isVip, displayNumber } = req.body;

    if (!name || !locationId) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    const therapist = await Therapist.create(
      name,
      locationId,
      externalUserId || null,
      isVip || false,
      wechatId || null,
      displayNumber || null
    );
    res.json({ success: true, message: '技師已創建', therapist });
  } catch (error) {
    logger.error('創建技師失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 更新技師
router.put('/:id', async (req, res) => {
  try {
    const { name, locationId, wechatId, externalUserId, isVip, availableTimeSlots, displayNumber } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (locationId) updates.location_id = locationId;
    if (wechatId !== undefined) updates.wechat_id = wechatId;
    if (externalUserId !== undefined) updates.external_user_id = externalUserId;
    if (isVip !== undefined) updates.is_vip = isVip;
    if (displayNumber !== undefined) updates.display_number = displayNumber;
    if (availableTimeSlots) updates.available_time_slots = JSON.stringify(availableTimeSlots);

    const therapist = await Therapist.update(req.params.id, updates);
    res.json({ success: true, message: '技師已更新', therapist });
  } catch (error) {
    logger.error('更新技師失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 刪除技師
router.delete('/:id', async (req, res) => {
  try {
    await Therapist.delete(req.params.id);
    res.json({ success: true, message: '技師已刪除' });
  } catch (error) {
    logger.error('刪除技師失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取技師的爽約記錄
router.get('/:id/noshows', async (req, res) => {
  try {
    const noShows = await NoShow.getByTherapist(req.params.id);
    res.json(noShows);
  } catch (error) {
    logger.error('獲取技師爽約記錄失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
