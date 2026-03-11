const axios = require('axios');
const logger = require('./logger');
require('dotenv').config();

const WECHAT_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';
const CORP_ID = process.env.WECHAT_CORP_ID;
const AGENT_ID = process.env.WECHAT_AGENT_ID;
const SECRET = process.env.WECHAT_SECRET;

let accessToken = null;
let tokenExpireTime = 0;

async function getAccessToken() {
  const now = Date.now();
  
  // 如果 token 還有效，直接返回
  if (accessToken && now < tokenExpireTime) {
    return accessToken;
  }

  try {
    const response = await axios.get(
      `${WECHAT_API_BASE}/gettoken`,
      {
        params: {
          corpid: CORP_ID,
          corpsecret: SECRET,
        },
      }
    );

    if (response.data.errcode === 0) {
      accessToken = response.data.access_token;
      // Token 有效期 7200 秒，提前 300 秒刷新
      tokenExpireTime = now + (response.data.expires_in - 300) * 1000;
      logger.info('企業微信 Token 已更新');
      return accessToken;
    } else {
      throw new Error(`企業微信 API 錯誤: ${response.data.errmsg}`);
    }
  } catch (error) {
    logger.error('獲取企業微信 Token 失敗', { error: error.message });
    throw error;
  }
}

/**
 * 通過外部聯繫人 API 發送消息給技師
 * 技師是普通微信用戶，通過外部聯繫人功能接收消息
 */
async function sendMessageToExternalContact(externalUserId, message) {
  try {
    const token = await getAccessToken();
    
    const payload = {
      touser: externalUserId,
      msgtype: 'text',
      agentid: AGENT_ID,
      text: {
        content: message,
      },
      safe: 0,
    };

    const response = await axios.post(
      `${WECHAT_API_BASE}/message/send?access_token=${token}`,
      payload
    );

    if (response.data.errcode === 0) {
      logger.info('企業微信消息已發送至外部聯繫人', { 
        externalUserId, 
        messageId: response.data.msgid 
      });
      return response.data;
    } else {
      throw new Error(`發送失敗: ${response.data.errmsg}`);
    }
  } catch (error) {
    logger.error('發送企業微信消息失敗', { 
      error: error.message, 
      externalUserId 
    });
    throw error;
  }
}

/**
 * 發送預約通知給技師（通過外部聯繫人）
 */
async function sendBookingNotification(therapistExternalUserId, bookingDetails) {
  const message = `
【新預約通知】
客戶名稱: ${bookingDetails.customerName}
場所: ${bookingDetails.locationName}
預約日期: ${bookingDetails.bookingDate}
時段: ${bookingDetails.timeSlot}
時間: ${bookingDetails.timeOption}

客戶信息:
- 與您的預約次數: ${bookingDetails.bookingCountWithTherapist}
- 平台爽約次數: ${bookingDetails.totalNoShowCount}

請回覆以下內容：
1 = 接受預約
2 = 拒絕預約

預約 ID: ${bookingDetails.bookingId}
  `.trim();

  return sendMessageToExternalContact(therapistExternalUserId, message);
}

/**
 * 驗證企業微信回調簽名
 */
function verifySignature(signature, timestamp, nonce, echostr, token) {
  const crypto = require('crypto');
  
  // 將 token、timestamp、nonce 進行排序
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  
  // 計算 SHA1 哈希
  const hash = crypto.createHash('sha1');
  hash.update(str);
  const computed = hash.digest('hex');
  
  return computed === signature;
}

/**
 * 解密企業微信回調消息
 */
function decryptMessage(encryptedMsg, encodingAesKey, corpId) {
  const crypto = require('crypto');
  
  // Base64 解碼
  const buf = Buffer.from(encodingAesKey + '=', 'base64');
  const key = buf.slice(0, 32);
  const iv = buf.slice(0, 16);
  
  // 解密
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(encryptedMsg, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  // 移除填充
  const pad = decrypted.charCodeAt(decrypted.length - 1);
  if (pad < 1 || pad > 32) {
    throw new Error('Invalid padding');
  }
  
  decrypted = decrypted.slice(0, -pad);
  
  // 檢查 corpId
  const xml = decrypted.substring(16);
  const endIndex = xml.lastIndexOf('<');
  const actualCorpId = xml.substring(endIndex + 1, xml.length - 1);
  
  if (actualCorpId !== corpId) {
    throw new Error('Invalid corpId');
  }
  
  return xml.substring(0, endIndex);
}

/**
 * 加密企業微信回調回覆
 */
function encryptMessage(replyXml, encodingAesKey, corpId) {
  const crypto = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substring(2, 10);
  
  // 構建待加密字符串
  const buf = Buffer.from(encodingAesKey + '=', 'base64');
  const key = buf.slice(0, 32);
  const iv = buf.slice(0, 16);
  
  // 添加 corpId
  const msgWithCorpId = replyXml + corpId;
  
  // 計算填充
  const blockSize = 32;
  const pad = blockSize - (msgWithCorpId.length % blockSize);
  const paddedMsg = msgWithCorpId + String.fromCharCode(pad).repeat(pad);
  
  // 加密
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(paddedMsg, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // 計算簽名
  const arr = [encrypted, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1');
  hash.update(str);
  const signature = hash.digest('hex');
  
  return {
    signature,
    timestamp,
    nonce,
    encrypted,
  };
}

module.exports = {
  getAccessToken,
  sendMessageToExternalContact,
  sendBookingNotification,
  verifySignature,
  decryptMessage,
  encryptMessage,
};
