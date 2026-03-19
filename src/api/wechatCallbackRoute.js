/**
 * 企業微信回調路由
 * 
 * 路徑：/api/wechat/callback
 * 
 * GET  - 回調 URL 驗證（企業微信配置時發送）
 * POST - 接收企業微信推送的消息/事件
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const wecom = require('../utils/wecom');

// ==================== GET: 回調 URL 驗證 ====================

/**
 * 企業微信配置回調 URL 時會發送 GET 請求：
 * ?msg_signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
 * 
 * 驗證流程：
 * 1. 用 Token, timestamp, nonce, echostr 計算簽名，與 msg_signature 比對
 * 2. 解密 echostr 得到明文
 * 3. 驗證解密後的 CorpID 是否匹配
 * 4. 返回解密後的明文（HTTP 200，純文本）
 */
router.get('/', (req, res) => {
  try {
    const { msg_signature, timestamp, nonce, echostr } = req.query;

    logger.info('收到企業微信回調驗證請求', {
      msg_signature,
      timestamp,
      nonce,
      echostr: echostr ? echostr.substring(0, 30) + '...' : 'null',
      callbackConfigured: wecom.isCallbackConfigured(),
    });

    if (!msg_signature || !timestamp || !nonce || !echostr) {
      logger.error('缺少必要參數');
      return res.status(400).send('Missing required parameters');
    }

    if (!wecom.isCallbackConfigured()) {
      logger.error('企業微信回調配置不完整（缺少 WECHAT_CALLBACK_TOKEN 或 WECHAT_ENCODING_AES_KEY）');
      return res.status(500).send('Callback not configured');
    }

    // 步驟 1：驗證簽名
    if (!wecom.verifySignature(msg_signature, timestamp, nonce, echostr)) {
      logger.error('簽名驗證失敗', { msg_signature });
      return res.status(403).send('Invalid signature');
    }

    // 步驟 2：解密 echostr
    const { message, corpId } = wecom.decrypt(echostr);
    logger.info('解密成功', { message, corpId });

    // 步驟 3：驗證 CorpID
    const wecomConfig = wecom.getConfig();
    if (wecomConfig.corpId && corpId !== wecomConfig.corpId) {
      logger.error('CorpID 不匹配', { expected: wecomConfig.corpId, actual: corpId });
      return res.status(403).send('Invalid CorpID');
    }

    // 步驟 4：返回解密後的明文
    logger.info('企業微信回調 URL 驗證成功');
    res.status(200).send(message);
  } catch (error) {
    logger.error('企業微信回調驗證異常', { error: error.message, stack: error.stack });
    res.status(500).send('Internal Server Error');
  }
});

// ==================== POST: 接收回調消息 ====================

/**
 * 接收企業微信推送的消息和事件
 * 
 * 消息類型：
 * - text: 技師回覆的文本消息（如「接受」「拒絕」）
 * - event: 事件消息（如菜單點擊等）
 */
router.post('/', express.text({ type: ['text/xml', 'application/xml'] }), async (req, res) => {
  try {
    const { msg_signature, timestamp, nonce } = req.query;
    const body = typeof req.body === 'string' ? req.body : '';

    logger.info('收到企業微信回調消息', {
      msg_signature,
      timestamp,
      nonce,
      bodyLength: body.length,
      bodyPreview: body.substring(0, 200),
    });

    // 從 XML 中提取 Encrypt 字段
    const encrypted = wecom.extractEncryptFromXml(body);
    if (!encrypted) {
      logger.error('無法從 XML 中提取 Encrypt 字段');
      return res.send('success');
    }

    // 驗證簽名
    if (!wecom.verifySignature(msg_signature, timestamp, nonce, encrypted)) {
      logger.error('POST 消息簽名驗證失敗');
      return res.send('success');
    }

    // 解密消息
    const { message: xmlContent, corpId } = wecom.decrypt(encrypted);
    logger.info('解密企業微信消息成功', { corpId, messagePreview: xmlContent.substring(0, 300) });

    // 解析消息
    const msg = wecom.parseCallbackMessage(xmlContent);
    logger.info('解析企業微信消息', {
      fromUser: msg.fromUserName,
      msgType: msg.msgType,
      content: msg.content,
      event: msg.event,
      eventKey: msg.eventKey,
    });

    // 立即返回 success，避免企業微信重試
    res.send('success');

    // 異步處理消息
    processMessage(msg).catch(error => {
      logger.error('處理企業微信消息失敗', { error: error.message });
    });
  } catch (error) {
    logger.error('企業微信回調處理異常', { error: error.message, stack: error.stack });
    res.send('success');
  }
});

// ==================== 消息處理 ====================

/**
 * 異步處理企業微信消息
 */
async function processMessage(msg) {
  try {
    const fromUser = msg.fromUserName;
    const msgType = msg.msgType;

    if (!fromUser) {
      logger.warn('消息缺少發送者信息');
      return;
    }

    switch (msgType) {
      case 'text':
        await handleTextMessage(fromUser, msg.content);
        break;
      case 'event':
        await handleEventMessage(fromUser, msg.event, msg.eventKey);
        break;
      default:
        logger.info('收到非文本/事件消息，忽略', { msgType });
    }
  } catch (error) {
    logger.error('處理消息失敗', { error: error.message });
  }
}

/**
 * 處理文本消息（技師回覆接受/拒絕）
 */
async function handleTextMessage(fromUser, content) {
  try {
    if (!content) {
      logger.warn('文本消息內容為空', { fromUser });
      return;
    }

    const trimmedContent = content.trim();
    logger.info('處理技師文本回覆', { fromUser, content: trimmedContent });

    // 交給 AI 預約橋接處理
    const AIBookingBridge = require('../services/aiBookingBridge');
    await AIBookingBridge.handleTechnicianReply(fromUser, trimmedContent);
  } catch (error) {
    logger.error('處理文本消息失敗', { error: error.message, fromUser });
  }
}

/**
 * 處理事件消息（菜單點擊等）
 */
async function handleEventMessage(fromUser, event, eventKey) {
  try {
    logger.info('處理事件消息', { fromUser, event, eventKey });

    if (event === 'click') {
      // 處理菜單點擊事件
      if (eventKey && eventKey.startsWith('ACCEPT_BOOKING_')) {
        const bookingId = eventKey.replace('ACCEPT_BOOKING_', '');
        await handleBookingAction(fromUser, bookingId, 'accept');
      } else if (eventKey && eventKey.startsWith('REJECT_BOOKING_')) {
        const bookingId = eventKey.replace('REJECT_BOOKING_', '');
        await handleBookingAction(fromUser, bookingId, 'reject');
      }
    }
  } catch (error) {
    logger.error('處理事件消息失敗', { error: error.message, fromUser });
  }
}

/**
 * 處理預約接單/拒單操作
 */
async function handleBookingAction(fromUser, bookingId, action) {
  try {
    logger.info('處理預約操作', { fromUser, bookingId, action });

    const db = require('../utils/db');
    const BookingService = require('../services/bookingService');

    // 查找技師
    const therapistResult = await db.query(
      'SELECT * FROM therapists WHERE wechat_userid = $1',
      [fromUser]
    );

    if (therapistResult.rows.length === 0) {
      logger.warn('找不到對應的技師', { fromUser });
      await wecom.sendTextMessage(fromUser, '❌ 無法識別您的身份，請聯繫管理員綁定企業微信帳號。');
      return;
    }

    const therapist = therapistResult.rows[0];

    if (action === 'accept') {
      await BookingService.confirmBooking(parseInt(bookingId, 10), therapist.id);
      await wecom.sendTextMessage(fromUser, `✅ 您已接受預約 #${bookingId}`);
    } else if (action === 'reject') {
      await BookingService.rejectBooking(parseInt(bookingId, 10), therapist.id);
      await wecom.sendTextMessage(fromUser, `❌ 您已拒絕預約 #${bookingId}`);
    }
  } catch (error) {
    logger.error('處理預約操作失敗', { error: error.message, fromUser, bookingId });
    try {
      await wecom.sendTextMessage(fromUser, `⚠️ 處理預約操作時發生錯誤：${error.message}`);
    } catch (e) {
      logger.error('發送錯誤通知失敗', { error: e.message });
    }
  }
}

module.exports = router;
