const express = require('express');
const router = express.Router();
const Location = require('../models/location');
const Therapist = require('../models/therapist');
const logger = require('../utils/logger');

// 獲取所有場所
router.get('/', async (req, res) => {
  try {
    const locations = await Location.getAll();
    res.json(locations);
  } catch (error) {
    logger.error('獲取場所列表失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 獲取特定場所
router.get('/:id', async (req, res) => {
  try {
    const location = await Location.getById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: '場所不存在' });
    }

    // 獲取該場所的技師
    const therapists = await Therapist.getByLocation(req.params.id);
    
    res.json({
      ...location,
      therapists,
    });
  } catch (error) {
    logger.error('獲取場所失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 創建場所
router.post('/', async (req, res) => {
  try {
    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: '缺少必要欄位' });
    }

    const location = await Location.create(code, name, description);
    res.json({ success: true, message: '場所已創建', location });
  } catch (error) {
    logger.error('創建場所失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 更新場所
router.put('/:id', async (req, res) => {
  try {
    const { code, name, description } = req.body;
    const updates = {};

    if (code) updates.code = code;
    if (name) updates.name = name;
    if (description) updates.description = description;

    const location = await Location.update(req.params.id, updates);
    res.json({ success: true, message: '場所已更新', location });
  } catch (error) {
    logger.error('更新場所失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 刪除場所
router.delete('/:id', async (req, res) => {
  try {
    await Location.delete(req.params.id);
    res.json({ success: true, message: '場所已刪除' });
  } catch (error) {
    logger.error('刪除場所失敗', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
