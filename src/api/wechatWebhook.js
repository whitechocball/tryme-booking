/**
 * 企業微信 Webhook 路由（備用回調入口）
 * 
 * 路徑：/wechat/webhook
 * 
 * 此路由作為備用的企業微信回調入口
 * 主要回調入口為 /api/wechat/callback
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const wecom = require('../utils/wecom');
const Booking = require('../models/booking');
const Therapist = require('../models/therapist');
const BookingService = require('../services/bookingService');

/**
 * 驗證企業微信回調 URL
 * GET /wechat/webhook?msg_signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
 */
router.get('/', (req, res) => {
  try {
    const { msg_signature, timestamp, nonce, echostr } = req.query;

    logger.info('收到 webhook 回調驗證請求', { msg_signature, timestamp, nonce });

    if (!msg_signature || !timestamp || !nonce || !echostr) {
      return res.status(400).send('Missing parameters');
    }

    if (!wecom.isCallbackConfigured()) {
      logger.error('回調配置不完整');
      return res.status(500).send('Callback not configured');
    }

    // 驗證簽名
    if (!wecom.verifySignature(msg_signature, timestamp, nonce, echostr)) {
      logger.error('webhook 簽名驗證失敗');
      return res.status(403).send('Invalid signature');
    }

    // 解密 echostr
    const { message } = wecom.decrypt(echostr);
    logger.info('webhook 回調 URL 驗證成功');
    res.status(200).send(message);
  } catch (error) {
    logger.error('webhook 回調驗證失敗', { error: error.message });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 接收企業微信回調消息
 * POST /wechat/webhook
 */
router.post('/', express.text({ type: ['text/xml', 'application/xml'] }), async (req, res) => {
  try {
    const { msg_signature, timestamp, nonce } = req.query;
    const body = typeof req.body === 'string' ? req.body : '';

    logger.info('收到 webhook 回調消息', {
      msg_signature, timestamp, nonce,
      bodyLength: body.length,
    });

    // 從 XML 中提取 Encrypt 字段
    const encrypted = wecom.extractEncryptFromXml(body);
    if (!encrypted) {
      logger.error('無法從 XML 中提取 Encrypt 字段');
      return res.send('success');
    }

    // 驗證簽名
    if (!wecom.verifySignature(msg_signature, timestamp, nonce, encrypted)) {
      logger.error('webhook POST 簽名驗證失敗');
      return res.send('success');
    }

    // 解密消息
    const { message: xmlContent } = wecom.decrypt(encrypted);
    const msg = wecom.parseCallbackMessage(xmlContent);

    logger.info('webhook 解析消息', {
      msgType: msg.msgType,
      fromUser: msg.fromUserName,
      content: msg.content,
    });

    // 立即返回
    res.send('success');

    // 異步處理文本消息
    if (msg.msgType === 'text' && msg.fromUserName && msg.content) {
      handleTextMessage(msg).catch(error => {
        logger.error('webhook 處理消息失敗', { error: error.message });
      });
    }
  } catch (error) {
    logger.error('webhook 回調處理異常', { error: error.message });
    res.send('success');
  }
});

/**
 * 處理文本消息（技師的回覆）
 */
async function handleTextMessage(msg) {
  try {
    const wechatUserId = msg.fromUserName;
    const content = (msg.content || '').trim();

    // 查找技師
    const therapists = await Therapist.getAll();
    const therapist = therapists.find(
      t => t.wechat_userid === wechatUserId || t.external_user_id === wechatUserId
    );

    if (!therapist) {
      logger.warn('收到未知技師的消息', { wechatUserId });
      return;
    }

    // 解析技師的回覆
    let bookingId = null;
    let response = null;

    const parts = content.split(/\s+/);
    if (parts.length === 2 && (parts[1] === '1' || parts[1] === '2')) {
      bookingId = parseInt(parts[0], 10);
      response = parts[1] === '1' ? 'accept' : 'reject';
    } else if (content === '1' || content === '2') {
      response = content === '1' ? 'accept' : 'reject';
      const pendingBooking = await Booking.getAll({
        therapistId: therapist.id,
        status: 'pending',
      });
      if (pendingBooking.length > 0) {
        bookingId = pendingBooking[pendingBooking.length - 1].id;
      }
    } else {
      // 交給 AI 預約橋接處理自然語言回覆
      const AIBookingBridge = require('../services/aiBookingBridge');
      await AIBookingBridge.handleTechnicianReply(wechatUserId, content);
      return;
    }

    if (!bookingId || !response) {
      logger.warn('無法解析技師的回覆', { wechatUserId, content });
      return;
    }

    const booking = await Booking.getById(bookingId);
    if (!booking || booking.therapist_id !== therapist.id) {
      logger.warn('預約不存在或技師無權操作', { bookingId, therapistId: therapist.id });
      return;
    }

    if (response === 'accept') {
      await BookingService.confirmBooking(bookingId, therapist.id);
      logger.info('技師已接受預約', { bookingId, therapistId: therapist.id });
    } else if (response === 'reject') {
      await BookingService.rejectBooking(bookingId, therapist.id);
      logger.info('技師已拒絕預約', { bookingId, therapistId: therapist.id });
    }
  } catch (error) {
    logger.error('處理技師回覆失敗', { error: error.message });
  }
}

module.exports = router;
