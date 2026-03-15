const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const AIBookingBridge = require('../services/aiBookingBridge');
const Customer = require('../models/customer');

/**
 * Telegram Webhook 端點
 * POST /api/telegram/webhook
 * 
 * 注意：此路由僅在使用 webhook 模式時需要。
 * 當前系統使用 polling 模式，此路由作為備用。
 */
router.post('/', async (req, res) => {
  try {
    // 立即返回 200
    res.sendStatus(200);

    const update = req.body;
    if (!update || !update.message) {
      return;
    }

    const message = update.message;
    const chatId = message.chat?.id;
    const text = message.text;
    const userName = message.from?.first_name || `用戶${chatId}`;

    if (!chatId || !text) {
      return;
    }

    // 忽略命令（由 bot 直接處理）
    if (text.startsWith('/')) {
      return;
    }

    logger.info('收到 Telegram webhook 消息', { chatId, text });

    // 先檢查是否有待確認的改期
    const handled = await AIBookingBridge.handleCustomerRescheduleReply(chatId, text);
    if (handled) return;

    // 處理自然語言預約
    await AIBookingBridge.handleCustomerMessage(chatId, text, userName);
  } catch (error) {
    logger.error('處理 Telegram webhook 失敗', { error: error.message });
  }
});

module.exports = router;
