const { Telegraf } = require('telegraf');
const logger = require('./logger');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 存儲用戶會話狀態
const userSessions = new Map();

function getUserSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      state: null,
      data: {},
    });
  }
  return userSessions.get(userId);
}

function clearUserSession(userId) {
  userSessions.delete(userId);
}

async function sendMessage(chatId, text, options = {}) {
  try {
    await bot.telegram.sendMessage(chatId, text, options);
    logger.info('Telegram 消息已發送', { chatId, text: text.substring(0, 50) });
  } catch (error) {
    logger.error('發送 Telegram 消息失敗', { error: error.message, chatId });
    throw error;
  }
}

async function sendBookingConfirmation(chatId, bookingDetails) {
  const text = `
✅ 預約已確認！

場所: ${bookingDetails.locationName}
技師: ${bookingDetails.therapistName}
日期: ${bookingDetails.bookingDate}
時段: ${bookingDetails.timeSlot}
時間選項: ${bookingDetails.timeOption}

預約 ID: ${bookingDetails.bookingId}

⚠️ 提醒: 爽約會在您的記錄中留下痕跡，技師會看到您的爽約次數。請務必準時出現或提前至少 1 小時取消。
  `.trim();

  return sendMessage(chatId, text);
}

async function sendBookingRejection(chatId, bookingDetails) {
  const text = `
❌ 預約已被拒絕

場所: ${bookingDetails.locationName}
技師: ${bookingDetails.therapistName}
日期: ${bookingDetails.bookingDate}
時段: ${bookingDetails.timeSlot}

技師無法接受此預約。請嘗試預約其他技師或時間。

輸入 /book 重新預約。
  `.trim();

  return sendMessage(chatId, text);
}

async function sendNoShowWarning(chatId, customerName) {
  const text = `
⚠️ 爽約警告

您已被記錄為爽約。這會影響您未來的預約。

您目前的爽約次數會在預約時顯示給技師。

如有任何疑問，請聯繫管理員。
  `.trim();

  return sendMessage(chatId, text);
}

module.exports = {
  bot,
  getUserSession,
  clearUserSession,
  sendMessage,
  sendBookingConfirmation,
  sendBookingRejection,
  sendNoShowWarning,
};
