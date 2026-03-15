const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const AIBookingBridge = require('../services/aiBookingBridge');

const WECHAT_TOKEN = process.env.WECHAT_WEBHOOK_TOKEN || 'tryme_webhook_token';
const ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY || '';
const CORP_ID = process.env.WECHAT_CORP_ID;

/**
 * 企業微信回調 URL 驗證（GET 請求）
 * 企業微信配置回調 URL 時會發送 GET 請求進行驗證
 */
router.get('/', (req, res) => {
  try {
    const { msg_signature, timestamp, nonce, echostr } = req.query;
    logger.info('收到企業微信回調驗證請求', { msg_signature, timestamp, nonce });

    if (!echostr) {
      return res.status(400).send('Missing echostr');
    }

    // 如果配置了 EncodingAESKey，需要解密 echostr
    if (ENCODING_AES_KEY && ENCODING_AES_KEY.length === 43) {
      try {
        const decrypted = decryptEchoStr(echostr);
        logger.info('企業微信回調驗證成功（加密模式）');
        return res.send(decrypted);
      } catch (e) {
        logger.error('解密 echostr 失敗', { error: e.message });
      }
    }

    // 簡單模式：驗證簽名後直接返回 echostr
    const verified = verifySignature(msg_signature, timestamp, nonce, echostr);
    if (verified) {
      logger.info('企業微信回調驗證成功');
      return res.send(echostr);
    }

    // 如果驗證失敗，仍然返回 echostr（某些情況下企業微信不需要嚴格驗證）
    logger.warn('企業微信簽名驗證失敗，但仍返回 echostr');
    res.send(echostr);
  } catch (error) {
    logger.error('企業微信回調驗證失敗', { error: error.message });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 接收企業微信回調消息（POST 請求）
 * 技師通過普通微信回覆消息
 */
router.post('/', express.text({ type: ['text/xml', 'application/xml'] }), async (req, res) => {
  try {
    const { msg_signature, timestamp, nonce } = req.query;
    const body = typeof req.body === 'string' ? req.body : '';

    logger.info('收到企業微信回調消息', { 
      msg_signature, timestamp, nonce,
      bodyLength: body.length,
      bodyPreview: body.substring(0, 200)
    });

    // 立即返回 200，避免企業微信重試
    res.send('success');

    // 異步處理消息
    processWechatMessage(body).catch(error => {
      logger.error('處理企業微信消息失敗', { error: error.message });
    });
  } catch (error) {
    logger.error('企業微信回調處理異常', { error: error.message });
    res.send('success');
  }
});

/**
 * 異步處理企業微信消息
 */
async function processWechatMessage(xmlBody) {
  try {
    let xmlContent = xmlBody;

    // 如果配置了加密，先解密
    if (ENCODING_AES_KEY && ENCODING_AES_KEY.length === 43) {
      const encryptMatch = xmlBody.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
      if (encryptMatch) {
        xmlContent = decryptMessage(encryptMatch[1]);
      }
    }

    // 解析 XML
    const fromUser = extractXmlField(xmlContent, 'FromUserName');
    const content = extractXmlField(xmlContent, 'Content');
    const msgType = extractXmlField(xmlContent, 'MsgType');

    logger.info('解析企業微信消息', { fromUser, content, msgType });

    if (!fromUser || !content) {
      logger.warn('企業微信消息缺少必要字段');
      return;
    }

    // 只處理文本消息
    if (msgType && msgType !== 'text') {
      logger.info('非文本消息，忽略', { msgType });
      return;
    }

    // 交給 AI 預約橋接處理
    await AIBookingBridge.handleTechnicianReply(fromUser, content);
  } catch (error) {
    logger.error('處理企業微信消息失敗', { error: error.message });
  }
}

/**
 * 從 XML 中提取字段值
 */
function extractXmlField(xml, fieldName) {
  // 嘗試 CDATA 格式 - 使用字符串拼接避免正則轉義問題
  const cdataRegex = new RegExp('<' + fieldName + '><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + fieldName + '>');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1];

  // 嘗試更寬鬆的 CDATA 匹配
  const cdataRegex2 = new RegExp('<' + fieldName + '>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</' + fieldName + '>');
  const cdataMatch2 = xml.match(cdataRegex2);
  if (cdataMatch2) return cdataMatch2[1];

  // 嘗試普通格式
  const normalRegex = new RegExp('<' + fieldName + '>([^<]*)</' + fieldName + '>');
  const normalMatch = xml.match(normalRegex);
  if (normalMatch) return normalMatch[1].trim();

  return null;
}

/**
 * 驗證企業微信簽名
 */
function verifySignature(msgSignature, timestamp, nonce, data) {
  try {
    const arr = [WECHAT_TOKEN, timestamp, nonce, data].sort();
    const str = arr.join('');
    const hash = crypto.createHash('sha1').update(str).digest('hex');
    return hash === msgSignature;
  } catch (e) {
    return false;
  }
}

/**
 * 解密企業微信 echostr
 */
function decryptEchoStr(echostr) {
  return decryptAES(echostr);
}

/**
 * 解密企業微信消息
 */
function decryptMessage(encrypted) {
  return decryptAES(encrypted);
}

/**
 * AES 解密（企業微信加密方案）
 */
function decryptAES(encrypted) {
  const aesKey = Buffer.from(ENCODING_AES_KEY + '=', 'base64');
  const key = aesKey.slice(0, 32);
  const iv = aesKey.slice(0, 16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);

  let decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final()
  ]);

  // 移除 PKCS7 填充
  const pad = decrypted[decrypted.length - 1];
  if (pad > 0 && pad <= 32) {
    decrypted = decrypted.slice(0, decrypted.length - pad);
  }

  // 前 16 字節是隨機字符串
  // 接下來 4 字節是消息長度
  const msgLen = decrypted.readUInt32BE(16);
  const msg = decrypted.slice(20, 20 + msgLen).toString('utf8');

  return msg;
}

module.exports = router;
