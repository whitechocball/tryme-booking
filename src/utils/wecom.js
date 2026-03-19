/**
 * 企業微信 (WeCom) API 對接模塊
 * 
 * 功能：
 * 1. 獲取和緩存 access_token
 * 2. 發送應用消息（文本消息、卡片消息）給技師
 * 3. 回調消息加解密（AES-256-CBC + PKCS#7）
 * 4. 回調 URL 簽名驗證
 */

const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');

// ==================== 配置 ====================

const WECOM_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';

const config = {
  corpId: process.env.WECHAT_CORP_ID || '',
  agentId: process.env.WECHAT_AGENT_ID || '',
  secret: process.env.WECHAT_SECRET || '',
  // 回調配置（用戶在企業微信後台設定後填入）
  callbackToken: process.env.WECHAT_CALLBACK_TOKEN || '',
  callbackEncodingAESKey: process.env.WECHAT_ENCODING_AES_KEY || '',
};

// ==================== Access Token 管理 ====================

let accessToken = null;
let tokenExpireTime = 0;

/**
 * 獲取 access_token（帶緩存）
 * Token 有效期 7200 秒，提前 300 秒刷新
 */
async function getAccessToken() {
  const now = Date.now();

  if (accessToken && now < tokenExpireTime) {
    return accessToken;
  }

  if (!config.corpId || !config.secret) {
    throw new Error('企業微信配置不完整：缺少 WECHAT_CORP_ID 或 WECHAT_SECRET');
  }

  try {
    const response = await axios.get(`${WECOM_API_BASE}/gettoken`, {
      params: {
        corpid: config.corpId,
        corpsecret: config.secret,
      },
    });

    if (response.data.errcode === 0) {
      accessToken = response.data.access_token;
      tokenExpireTime = now + (response.data.expires_in - 300) * 1000;
      logger.info('企業微信 access_token 已更新', {
        expiresIn: response.data.expires_in,
      });
      return accessToken;
    } else {
      throw new Error(`企業微信 API 錯誤: ${response.data.errcode} - ${response.data.errmsg}`);
    }
  } catch (error) {
    logger.error('獲取企業微信 access_token 失敗', { error: error.message });
    throw error;
  }
}

// ==================== 發送消息 ====================

/**
 * 發送文本消息給企業微信成員
 * @param {string} toUser - 企業微信 userid（多個用 | 分隔）
 * @param {string} content - 文本內容
 */
async function sendTextMessage(toUser, content) {
  try {
    const token = await getAccessToken();

    const payload = {
      touser: toUser,
      msgtype: 'text',
      agentid: parseInt(config.agentId, 10),
      text: {
        content: content,
      },
      safe: 0,
    };

    const response = await axios.post(
      `${WECOM_API_BASE}/message/send?access_token=${token}`,
      payload
    );

    if (response.data.errcode === 0) {
      logger.info('企業微信文本消息已發送', {
        toUser,
        msgid: response.data.msgid,
      });
      return response.data;
    } else {
      throw new Error(`發送失敗: ${response.data.errcode} - ${response.data.errmsg}`);
    }
  } catch (error) {
    logger.error('發送企業微信文本消息失敗', { error: error.message, toUser });
    throw error;
  }
}

/**
 * 發送文本卡片消息給企業微信成員
 * 
 * 卡片消息支持按鈕操作，技師可以直接點擊「接單」或「拒絕」
 * 
 * @param {string} toUser - 企業微信 userid
 * @param {object} options - 卡片選項
 * @param {string} options.title - 卡片標題
 * @param {string} options.description - 卡片描述
 * @param {string} options.url - 點擊卡片跳轉的 URL
 * @param {string} options.btntxt - 按鈕文字（可選）
 */
async function sendTextCardMessage(toUser, options) {
  try {
    const token = await getAccessToken();

    const payload = {
      touser: toUser,
      msgtype: 'textcard',
      agentid: parseInt(config.agentId, 10),
      textcard: {
        title: options.title,
        description: options.description,
        url: options.url,
        btntxt: options.btntxt || '查看詳情',
      },
    };

    const response = await axios.post(
      `${WECOM_API_BASE}/message/send?access_token=${token}`,
      payload
    );

    if (response.data.errcode === 0) {
      logger.info('企業微信卡片消息已發送', {
        toUser,
        msgid: response.data.msgid,
        title: options.title,
      });
      return response.data;
    } else {
      throw new Error(`發送卡片消息失敗: ${response.data.errcode} - ${response.data.errmsg}`);
    }
  } catch (error) {
    logger.error('發送企業微信卡片消息失敗', { error: error.message, toUser });
    throw error;
  }
}

/**
 * 發送新預約通知卡片給技師
 * 
 * @param {string} toUser - 技師的企業微信 userid
 * @param {object} booking - 預約詳情
 * @param {number} booking.bookingId - 預約 ID
 * @param {string} booking.customerName - 客戶名稱
 * @param {string} booking.locationName - 場所名稱
 * @param {string} booking.bookingDate - 預約日期
 * @param {string} booking.timeSlot - 時段
 * @param {string} booking.timeOption - 時間選項
 * @param {string} booking.bookingTime - 具體時間
 * @param {number} booking.bookingCountWithTherapist - 與該技師的預約次數
 * @param {number} booking.totalNoShowCount - 客戶總爽約次數
 */
async function sendBookingNotificationCard(toUser, booking) {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : (process.env.APP_URL || 'https://tryme-app-production.up.railway.app');

  const description = [
    `<div class="gray">預約編號: #${booking.bookingId}</div>`,
    `<div class="normal">客戶: ${booking.customerName || '未知'}</div>`,
    `<div class="normal">場所: ${booking.locationName}</div>`,
    `<div class="normal">日期: ${booking.bookingDate}</div>`,
    `<div class="normal">時間: ${booking.bookingTime || `${booking.timeSlot} ${booking.timeOption || ''}`}</div>`,
    `<div class="normal">歷史預約: ${booking.bookingCountWithTherapist || 0} 次</div>`,
    `<div class="normal">爽約記錄: ${booking.totalNoShowCount || 0} 次</div>`,
    '',
    `<div class="highlight">請回覆「接受」或「拒絕」來處理此預約</div>`,
  ].join('\n');

  // 卡片消息的 URL 指向接單操作頁面
  const actionUrl = `${baseUrl}/api/wechat/booking-action?booking_id=${booking.bookingId}`;

  return sendTextCardMessage(toUser, {
    title: '新預約通知',
    description: description,
    url: actionUrl,
    btntxt: '查看預約',
  });
}

/**
 * 發送預約狀態更新通知給技師
 */
async function sendBookingStatusUpdate(toUser, booking, status) {
  const statusLabels = {
    confirmed: '已確認',
    cancelled: '已取消',
    rejected: '已拒絕',
    completed: '已完成',
    no_show: '客戶爽約',
  };

  const statusEmoji = {
    confirmed: '✅',
    cancelled: '❌',
    rejected: '❌',
    completed: '🎉',
    no_show: '⚠️',
  };

  const emoji = statusEmoji[status] || '📋';
  const label = statusLabels[status] || status;

  const content = `${emoji} 預約 #${booking.bookingId} ${label}\n\n` +
    `場所：${booking.locationName}\n` +
    `日期：${booking.bookingDate}\n` +
    `時間：${booking.bookingTime || booking.timeSlot}`;

  return sendTextMessage(toUser, content);
}

// ==================== 回調消息加解密 ====================

/**
 * 計算企業微信消息簽名
 * signature = SHA1(sort(token, timestamp, nonce, encrypt))
 * 
 * @param {string} token - 回調 Token
 * @param {string} timestamp - 時間戳
 * @param {string} nonce - 隨機字符串
 * @param {string} encrypt - 加密的消息體（可選，用於 POST 驗證）
 * @returns {string} SHA1 簽名
 */
function getSignature(token, timestamp, nonce, encrypt = '') {
  const arr = encrypt ? [token, timestamp, nonce, encrypt] : [token, timestamp, nonce];
  arr.sort();
  const str = arr.join('');
  return crypto.createHash('sha1').update(str).digest('hex');
}

/**
 * 驗證回調簽名
 */
function verifySignature(msgSignature, timestamp, nonce, encrypt) {
  const computed = getSignature(config.callbackToken, timestamp, nonce, encrypt);
  return computed === msgSignature;
}

/**
 * AES-256-CBC 解密企業微信消息
 * 
 * 加解密方案：
 * - AES Key = Base64Decode(EncodingAESKey + "=")，共 32 字節
 * - IV = AES Key 的前 16 字節
 * - 使用 AES-256-CBC 模式，PKCS#7 填充（block size = 32）
 * 
 * 解密後的明文結構：
 * [16字節隨機字符串][4字節消息長度(Big Endian)][消息內容][CorpID]
 * 
 * @param {string} encrypted - Base64 編碼的密文
 * @returns {object} { message, corpId }
 */
function decrypt(encrypted) {
  if (!config.callbackEncodingAESKey) {
    throw new Error('缺少 WECHAT_ENCODING_AES_KEY 配置');
  }

  const aesKey = Buffer.from(config.callbackEncodingAESKey + '=', 'base64');
  const iv = aesKey.slice(0, 16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  let decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);

  // 移除 PKCS#7 填充（block size = 32）
  const padLen = decrypted[decrypted.length - 1];
  if (padLen < 1 || padLen > 32) {
    throw new Error('Invalid PKCS#7 padding');
  }
  decrypted = decrypted.slice(0, decrypted.length - padLen);

  // 解析明文結構
  const msgLen = decrypted.readUInt32BE(16);
  const message = decrypted.slice(20, 20 + msgLen).toString('utf8');
  const corpId = decrypted.slice(20 + msgLen).toString('utf8');

  return { message, corpId };
}

/**
 * AES-256-CBC 加密企業微信回覆消息
 * 
 * @param {string} replyMsg - 回覆的 XML 消息
 * @returns {object} { encrypted, signature, timestamp, nonce }
 */
function encrypt(replyMsg) {
  if (!config.callbackEncodingAESKey) {
    throw new Error('缺少 WECHAT_ENCODING_AES_KEY 配置');
  }

  const aesKey = Buffer.from(config.callbackEncodingAESKey + '=', 'base64');
  const iv = aesKey.slice(0, 16);

  // 構建明文：[16字節隨機字符串][4字節消息長度(Big Endian)][消息內容][CorpID]
  const randomBytes = crypto.randomBytes(16);
  const msgBuffer = Buffer.from(replyMsg, 'utf8');
  const msgLenBuffer = Buffer.alloc(4);
  msgLenBuffer.writeUInt32BE(msgBuffer.length, 0);
  const corpIdBuffer = Buffer.from(config.corpId, 'utf8');

  let plaintext = Buffer.concat([randomBytes, msgLenBuffer, msgBuffer, corpIdBuffer]);

  // PKCS#7 填充（block size = 32）
  const blockSize = 32;
  const padLen = blockSize - (plaintext.length % blockSize);
  const padBuffer = Buffer.alloc(padLen, padLen);
  plaintext = Buffer.concat([plaintext, padBuffer]);

  // AES-256-CBC 加密
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64');

  // 生成簽名
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString('hex');
  const signature = getSignature(config.callbackToken, timestamp, nonce, encrypted);

  return { encrypted, signature, timestamp, nonce };
}

/**
 * 構建加密的 XML 回覆
 */
function buildEncryptedReply(replyMsg) {
  const { encrypted, signature, timestamp, nonce } = encrypt(replyMsg);

  return `<xml>
<Encrypt><![CDATA[${encrypted}]]></Encrypt>
<MsgSignature><![CDATA[${signature}]]></MsgSignature>
<TimeStamp>${timestamp}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`;
}

// ==================== XML 解析工具 ====================

/**
 * 從 XML 中提取 Encrypt 字段
 */
function extractEncryptFromXml(xml) {
  const match = xml.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
  return match ? match[1] : null;
}

/**
 * 從 XML 中提取指定字段值
 */
function extractXmlField(xml, fieldName) {
  // 嘗試 CDATA 格式
  const cdataMatch = xml.match(new RegExp(`<${fieldName}><!\[CDATA\\[(.*?)\\]\\]></${fieldName}>`));
  if (cdataMatch) return cdataMatch[1];

  // 嘗試普通格式
  const normalMatch = xml.match(new RegExp(`<${fieldName}>(.*?)</${fieldName}>`));
  if (normalMatch) return normalMatch[1];

  return null;
}

/**
 * 解析企業微信回調消息 XML
 * @param {string} xml - 解密後的 XML 消息
 * @returns {object} 解析後的消息對象
 */
function parseCallbackMessage(xml) {
  return {
    toUserName: extractXmlField(xml, 'ToUserName'),
    fromUserName: extractXmlField(xml, 'FromUserName'),
    createTime: extractXmlField(xml, 'CreateTime'),
    msgType: extractXmlField(xml, 'MsgType'),
    content: extractXmlField(xml, 'Content'),
    msgId: extractXmlField(xml, 'MsgId'),
    agentId: extractXmlField(xml, 'AgentID'),
    // 事件類型消息
    event: extractXmlField(xml, 'Event'),
    eventKey: extractXmlField(xml, 'EventKey'),
  };
}

// ==================== 獲取配置信息 ====================

function getConfig() {
  return { ...config };
}

function isConfigured() {
  return !!(config.corpId && config.agentId && config.secret);
}

function isCallbackConfigured() {
  return !!(config.callbackToken && config.callbackEncodingAESKey);
}

// ==================== 導出 ====================

module.exports = {
  // 配置
  getConfig,
  isConfigured,
  isCallbackConfigured,
  // Token
  getAccessToken,
  // 發送消息
  sendTextMessage,
  sendTextCardMessage,
  sendBookingNotificationCard,
  sendBookingStatusUpdate,
  // 回調加解密
  getSignature,
  verifySignature,
  decrypt,
  encrypt,
  buildEncryptedReply,
  // XML 工具
  extractEncryptFromXml,
  extractXmlField,
  parseCallbackMessage,
};
