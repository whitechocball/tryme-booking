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

async function sendMessage(toUser, message) {
  try {
    const token = await getAccessToken();
    
    const payload = {
      touser: toUser,
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
      logger.info('企業微信消息已發送', { toUser, messageId: response.data.msgid });
      return response.data;
    } else {
      throw new Error(`發送失敗: ${response.data.errmsg}`);
    }
  } catch (error) {
    logger.error('發送企業微信消息失敗', { error: error.message, toUser });
    throw error;
  }
}

async function sendBookingNotification(therapistWechatId, bookingDetails) {
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

請在企業微信中回覆接受或拒絕此預約。
預約 ID: ${bookingDetails.bookingId}
  `.trim();

  return sendMessage(therapistWechatId, message);
}

module.exports = {
  getAccessToken,
  sendMessage,
  sendBookingNotification,
};
