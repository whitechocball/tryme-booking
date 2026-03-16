const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');

// 環境變量
const WECHAT_TOKEN = process.env.WECHAT_TOKEN || '';
const ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY || '';
const CORP_ID = process.env.WECHAT_CORP_ID || '';

/**
 * 企業微信 WXBizMsgCrypt 實現
 * 
 * 加解密方案：
 * - AES Key = Base64Decode(EncodingAESKey + "=")，共 32 字節
 * - IV = AES Key 的前 16 字節
 * - 使用 AES-256-CBC 模式，PKCS#7 填充（block size = 32）
 * 
 * 解密後的明文結構：
 * [16字節隨機字符串][4字節消息長度(網絡字節序)][消息內容][CorpID]
 */

/**
 * 計算企業微信簽名
 * dev_msg_signature = SHA1(sort(token, timestamp, nonce, encrypt))
 */
function getSignature(token, timestamp, nonce, encrypt) {
  const arr = [token, timestamp, nonce, encrypt].sort();
  const str = arr.join('');
  return crypto.createHash('sha1').update(str).digest('hex');
}

/**
 * AES 解密企業微信消息
 * @param {string} encrypted - Base64 編碼的密文
 * @returns {object} { message, corpId }
 */
function decrypt(encrypted) {
  // EncodingAESKey 是 43 個字符的 Base64 編碼（缺少尾部 '='）
  const aesKey = Buffer.from(ENCODING_AES_KEY + '=', 'base64');
  const iv = aesKey.slice(0, 16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  let decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final()
  ]);

  // 移除 PKCS#7 填充（block size = 32）
  const padLen = decrypted[decrypted.length - 1];
  if (padLen < 1 || padLen > 32) {
    throw new Error('Invalid PKCS#7 padding');
  }
  decrypted = decrypted.slice(0, decrypted.length - padLen);

  // 解析明文結構：
  // 前 16 字節：隨機字符串
  // 接下來 4 字節：消息長度（網絡字節序，Big Endian）
  // 接下來 msgLen 字節：消息內容
  // 剩餘字節：CorpID
  const msgLen = decrypted.readUInt32BE(16);
  const message = decrypted.slice(20, 20 + msgLen).toString('utf8');
  const corpId = decrypted.slice(20 + msgLen).toString('utf8');

  return { message, corpId };
}

/**
 * 驗證回調 URL（GET 請求）
 * 
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
      echostr: echostr ? echostr.substring(0, 20) + '...' : 'null',
      hasToken: !!WECHAT_TOKEN,
      hasAesKey: !!ENCODING_AES_KEY,
      hasCorpId: !!CORP_ID
    });

    if (!msg_signature || !timestamp || !nonce || !echostr) {
      logger.error('缺少必要參數');
      return res.status(400).send('Missing required parameters');
    }

    // 步驟 1：驗證簽名
    const signature = getSignature(WECHAT_TOKEN, timestamp, nonce, echostr);
    logger.info('簽名驗證', {
      computed: signature,
      expected: msg_signature,
      match: signature === msg_signature
    });

    if (signature !== msg_signature) {
      logger.error('簽名驗證失敗', { computed: signature, expected: msg_signature });
      return res.status(403).send('Invalid signature');
    }

    // 步驟 2：解密 echostr
    const { message, corpId } = decrypt(echostr);
    logger.info('解密成功', { message, corpId });

    // 步驟 3：驗證 CorpID
    if (CORP_ID && corpId !== CORP_ID) {
      logger.error('CorpID 不匹配', { expected: CORP_ID, actual: corpId });
      return res.status(403).send('Invalid CorpID');
    }

    // 步驟 4：返回解密後的明文
    logger.info('企業微信回調 URL 驗證成功', { echostr: message });
    res.status(200).send(message);
  } catch (error) {
    logger.error('企業微信回調驗證異常', { error: error.message, stack: error.stack });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 接收企業微信回調消息（POST 請求）
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

    // 從 XML 中提取 Encrypt 字段
    const encryptMatch = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
    if (!encryptMatch) {
      logger.error('無法從 XML 中提取 Encrypt 字段');
      return res.send('success');
    }

    const encrypted = encryptMatch[1];

    // 驗證簽名
    const signature = getSignature(WECHAT_TOKEN, timestamp, nonce, encrypted);
    if (signature !== msg_signature) {
      logger.error('POST 消息簽名驗證失敗');
      return res.send('success');
    }

    // 解密消息
    const { message, corpId } = decrypt(encrypted);
    logger.info('解密企業微信消息', { corpId, messagePreview: message.substring(0, 200) });

    // 立即返回 200，避免企業微信重試
    res.send('success');

    // 異步處理消息
    processWechatMessage(message).catch(error => {
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
async function processWechatMessage(xmlContent) {
  try {
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
    const AIBookingBridge = require('../services/aiBookingBridge');
    await AIBookingBridge.handleTechnicianReply(fromUser, content);
  } catch (error) {
    logger.error('處理企業微信消息失敗', { error: error.message });
  }
}

/**
 * 從 XML 中提取字段值
 */
function extractXmlField(xml, fieldName) {
  const tagStart = `<${fieldName}>`;
  const tagEnd = `</${fieldName}>`;

  const startIndex = xml.indexOf(tagStart);
  const endIndex = xml.indexOf(tagEnd);

  if (startIndex === -1 || endIndex === -1) return null;

  let content = xml.substring(startIndex + tagStart.length, endIndex).trim();

  // 處理 CDATA
  if (content.startsWith('<![CDATA[') && content.endsWith(']]>')) {
    return content.substring(9, content.length - 3);
  }

  return content;
}

module.exports = router;
