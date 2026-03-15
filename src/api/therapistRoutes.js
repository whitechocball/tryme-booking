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

// 獲取特定技師及其工作歷史
router.get('/:id', async (req, res) => {
  try {
    const therapist = await Therapist.getById(req.params.id);
    if (!therapist) {
      return res.status(404).json({ error: '技師不存在' });
    }

    // 獲取該技師的爽約次數
    const noShowCount = await NoShow.getCountByTherapist(req.params.id);
    
    // 獲取工作歷史
    const workHistory = await Therapist.getWorkHistory(req.params.id);

    res.json({
      ...therapist,
      noShowCount,
      workHistory
    });
  } catch (error) {
    logger.error('獲取技師失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 創建技師
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      currentLocationId, 
      wechatIdPrimary, 
      wechatIdSecondary,
      phoneNumber,
      isVip, 
      displayNumber,
      profilePicUrl,
      workStartTime,
      workEndTime,
      telegramId,
      wechatUserid
    } = req.body;

    if (!name || !currentLocationId) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    const therapist = await Therapist.create(
      name,
      currentLocationId,
      isVip || false,
      wechatIdPrimary || null,
      wechatIdSecondary || null,
      phoneNumber || null,
      displayNumber || null,
      profilePicUrl || null,
      workStartTime || null,
      workEndTime || null,
      telegramId || null,
      wechatUserid || null
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
    const { 
      name, 
      currentLocationId, 
      wechatIdPrimary,
      wechatIdSecondary,
      phoneNumber,
      isVip, 
      displayNumber,
      profilePicUrl,
      workStartTime,
      workEndTime,
      telegramId,
      wechatUserid
    } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (currentLocationId) updates.current_location_id = currentLocationId;
    if (wechatIdPrimary !== undefined) updates.wechat_id_primary = wechatIdPrimary;
    if (wechatIdSecondary !== undefined) updates.wechat_id_secondary = wechatIdSecondary;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
    if (isVip !== undefined) updates.is_vip = isVip;
    if (displayNumber !== undefined) updates.display_number = displayNumber;
    if (profilePicUrl !== undefined) updates.profile_pic_url = profilePicUrl;
    if (workStartTime !== undefined) updates.work_start_time = workStartTime;
    if (workEndTime !== undefined) updates.work_end_time = workEndTime;
    if (telegramId !== undefined) updates.telegram_id = telegramId;
    if (wechatUserid !== undefined) updates.wechat_userid = wechatUserid;

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

// 獲取技師的工作歷史
router.get('/:id/history', async (req, res) => {
  try {
    const workHistory = await Therapist.getWorkHistory(req.params.id);
    res.json(workHistory);
  } catch (error) {
    logger.error('獲取技師工作歷史失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 添加工作歷史
router.post('/:id/history', async (req, res) => {
  try {
    const { locationId, displayNumber, startDate, endDate } = req.body;

    if (!locationId || !startDate) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    const history = await Therapist.addWorkHistory(
      req.params.id,
      locationId,
      displayNumber || null,
      startDate,
      endDate || null
    );

    res.json({ success: true, message: '工作歷史已添加', history });
  } catch (error) {
    logger.error('添加工作歷史失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 更新工作歷史
router.put('/history/:historyId', async (req, res) => {
  try {
    const { locationId, displayNumber, startDate, endDate } = req.body;
    const updates = {};

    if (locationId) updates.location_id = locationId;
    if (displayNumber !== undefined) updates.display_number = displayNumber;
    if (startDate) updates.start_date = startDate;
    if (endDate !== undefined) updates.end_date = endDate;

    const history = await Therapist.updateWorkHistory(req.params.historyId, updates);
    res.json({ success: true, message: '工作歷史已更新', history });
  } catch (error) {
    logger.error('更新工作歷史失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 刪除工作歷史
router.delete('/history/:historyId', async (req, res) => {
  try {
    await Therapist.deleteWorkHistory(req.params.historyId);
    res.json({ success: true, message: '工作歷史已刪除' });
  } catch (error) {
    logger.error('刪除工作歷史失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
