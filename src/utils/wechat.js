/**
 * 企業微信工具模塊（兼容層）
 * 
 * 此模塊保持向後兼容，內部委託給新的 wecom.js 模塊
 * 現有代碼（bookingService.js、aiBookingBridge.js 等）可以繼續使用此模塊
 */

const wecom = require('./wecom');
const logger = require('./logger');

/**
 * 獲取 access_token
 */
async function getAccessToken() {
  return wecom.getAccessToken();
}

/**
 * 發送消息給企業微信成員（兼容舊接口）
 * 注意：舊代碼使用 external_user_id，新代碼使用 wechat_userid
 * 兩者都通過同一個 message/send API 發送
 */
async function sendMessageToExternalContact(userId, message) {
  return wecom.sendTextMessage(userId, message);
}

/**
 * 發送預約通知給技師
 * 新版本使用卡片消息，提供更好的用戶體驗
 */
async function sendBookingNotification(therapistUserId, bookingDetails) {
  try {
    // 優先使用卡片消息
    return await wecom.sendBookingNotificationCard(therapistUserId, bookingDetails);
  } catch (error) {
    logger.warn('卡片消息發送失敗，降級為文本消息', { error: error.message });

    // 降級為文本消息
    const message = `【新預約通知】
預約編號: #${bookingDetails.bookingId}
客戶名稱: ${bookingDetails.customerName || '未知'}
場所: ${bookingDetails.locationName}
預約日期: ${bookingDetails.bookingDate}
時間: ${bookingDetails.bookingTime || `${bookingDetails.timeSlot} ${bookingDetails.timeOption || ''}`}

客戶信息:
- 與您的預約次數: ${bookingDetails.bookingCountWithTherapist || 0}
- 平台爽約次數: ${bookingDetails.totalNoShowCount || 0}

請回覆「接受」或「拒絕」來處理此預約。`.trim();

    return wecom.sendTextMessage(therapistUserId, message);
  }
}

/**
 * 驗證企業微信回調簽名（兼容舊接口）
 */
function verifySignature(signature, timestamp, nonce, echostr, token) {
  const crypto = require('crypto');
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1');
  hash.update(str);
  const computed = hash.digest('hex');
  return computed === signature;
}

/**
 * 解密企業微信回調消息（兼容舊接口）
 */
function decryptMessage(encryptedMsg, encodingAesKey, corpId) {
  return wecom.decrypt(encryptedMsg).message;
}

/**
 * 加密企業微信回調回覆（兼容舊接口）
 */
function encryptMessage(replyXml, encodingAesKey, corpId) {
  return wecom.encrypt(replyXml);
}

module.exports = {
  getAccessToken,
  sendMessageToExternalContact,
  sendBookingNotification,
  verifySignature,
  decryptMessage,
  encryptMessage,
};
