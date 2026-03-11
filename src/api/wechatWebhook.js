const express = require('express');
const router = express.Router();
const xml2js = require('xml2js');
const logger = require('../utils/logger');
const wechatUtil = require('../utils/wechat');
const Booking = require('../models/booking');
const Therapist = require('../models/therapist');
const BookingService = require('../services/bookingService');

const WECHAT_TOKEN = process.env.WECHAT_WEBHOOK_TOKEN || 'tryme_webhook_token';
const ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY || '';
const CORP_ID = process.env.WECHAT_CORP_ID;

const xmlBuilder = new xml2js.Builder({ rootName: 'xml' });
const xmlParser = new xml2js.Parser();

/**
 * 驗證企業微信回調 URL
 * GET /wechat/webhook?msg_signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
 */
router.get('/', (req, res) => {
  try {
    const { msg_signature, timestamp, nonce, echostr } = req.query;

    // 驗證簽名
    if (!wechatUtil.verifySignature(msg_signature, timestamp, nonce, echostr, WECHAT_TOKEN)) {
      logger.error('企業微信回調簽名驗證失敗', { msg_signature, timestamp, nonce });
      return res.status(403).send('Forbidden');
    }

    logger.info('企業微信回調 URL 驗證成功');
    res.send(echostr);
  } catch (error) {
    logger.error('企業微信回調驗證失敗', { error: error.message });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 接收企業微信回調消息
 * POST /wechat/webhook
 * 技師通過微信回覆「1」(接受) 或「2」(拒絕)
 */
router.post('/', async (req, res) => {
  try {
    const { msg_signature, timestamp, nonce } = req.query;
    let body = '';

    // 收集請求體
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        // 驗證簽名
        if (!wechatUtil.verifySignature(msg_signature, timestamp, nonce, body, WECHAT_TOKEN)) {
          logger.error('企業微信回調簽名驗證失敗', { msg_signature, timestamp, nonce });
          return res.status(403).send('Forbidden');
        }

        // 解密消息
        let decryptedXml;
        if (ENCODING_AES_KEY) {
          try {
            decryptedXml = wechatUtil.decryptMessage(body, ENCODING_AES_KEY, CORP_ID);
          } catch (error) {
            logger.error('企業微信消息解密失敗', { error: error.message });
            return res.status(400).send('Bad Request');
          }
        } else {
          decryptedXml = body;
        }

        // 解析 XML
        const message = await xmlParser.parseStringPromise(decryptedXml);
        const msg = message.xml;

        logger.info('收到企業微信回調消息', {
          msgType: msg.MsgType?.[0],
          fromUser: msg.FromUserID?.[0],
          content: msg.Content?.[0],
        });

        // 處理不同類型的消息
        if (msg.MsgType?.[0] === 'text') {
          await handleTextMessage(msg, res);
        } else {
          // 其他消息類型暫不處理
          res.send('ok');
        }
      } catch (error) {
        logger.error('處理企業微信回調失敗', { error: error.message });
        res.send('ok'); // 返回 ok 避免企業微信重試
      }
    });
  } catch (error) {
    logger.error('企業微信回調處理異常', { error: error.message });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 處理文本消息（技師的回覆）
 */
async function handleTextMessage(msg, res) {
  try {
    const therapistExternalUserId = msg.FromUserID?.[0];
    const content = msg.Content?.[0]?.trim();

    // 查找技師
    const therapists = await Therapist.getAll();
    const therapist = therapists.find(t => t.external_user_id === therapistExternalUserId);

    if (!therapist) {
      logger.warn('收到未知技師的消息', { therapistExternalUserId });
      res.send('ok');
      return;
    }

    // 解析技師的回覆
    // 消息格式應該是：「1」或「2」或「booking_id 1」或「booking_id 2」
    let bookingId = null;
    let response = null;

    // 嘗試解析「booking_id response」格式
    const parts = content.split(/\s+/);
    if (parts.length === 2 && (parts[1] === '1' || parts[1] === '2')) {
      bookingId = parseInt(parts[0], 10);
      response = parts[1] === '1' ? 'accept' : 'reject';
    } else if (content === '1' || content === '2') {
      // 如果只有數字，查找該技師最新的待確認預約
      response = content === '1' ? 'accept' : 'reject';
      const pendingBooking = await Booking.getAll({
        therapistId: therapist.id,
        status: 'pending',
      });
      if (pendingBooking.length > 0) {
        // 取最新的預約
        bookingId = pendingBooking[pendingBooking.length - 1].id;
      }
    }

    if (!bookingId || !response) {
      logger.warn('無法解析技師的回覆', { therapistExternalUserId, content });
      res.send('ok');
      return;
    }

    // 獲取預約信息
    const booking = await Booking.getById(bookingId);
    if (!booking || booking.therapist_id !== therapist.id) {
      logger.warn('預約不存在或技師無權操作', { bookingId, therapistId: therapist.id });
      res.send('ok');
      return;
    }

    // 根據技師的回覆更新預約狀態
    if (response === 'accept') {
      await BookingService.confirmBooking(bookingId, therapist.id);
      logger.info('技師已接受預約', { bookingId, therapistId: therapist.id });
    } else if (response === 'reject') {
      await BookingService.rejectBooking(bookingId, therapist.id);
      logger.info('技師已拒絕預約', { bookingId, therapistId: therapist.id });
    }

    res.send('ok');
  } catch (error) {
    logger.error('處理技師回覆失敗', { error: error.message });
    res.send('ok');
  }
}

module.exports = router;
