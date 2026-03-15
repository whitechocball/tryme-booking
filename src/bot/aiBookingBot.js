const { Telegraf } = require('telegraf');
const logger = require('../utils/logger');
const Customer = require('../models/customer');
const AIBookingBridge = require('../services/aiBookingBridge');
require('dotenv').config();

let bot = null;

/**
 * 初始化 AI 預約 Bot（使用 polling 模式）
 */
function initAIBookingBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN 未設置，AI 預約 Bot 未啟動');
    return null;
  }

  bot = new Telegraf(token);

  // /start 命令
  bot.command('start', async (ctx) => {
    try {
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || `用戶${userId}`;
      await Customer.findOrCreate(userId, userName);

      await ctx.reply(
        `歡迎使用 Tryme 預約系統！\n\n` +
        `您可以直接用自然語言預約，例如：\n` +
        `「我想約明天下午3點XX店3號技師」\n\n` +
        `或輸入 /help 查看更多幫助。`
      );
      logger.info('用戶開始對話', { userId, userName });
    } catch (error) {
      logger.error('處理 start 命令失敗', { error: error.message });
      await ctx.reply('發生錯誤，請稍後重試。');
    }
  });

  // /help 命令
  bot.command('help', async (ctx) => {
    try {
      await ctx.reply(
        `📖 Tryme 預約系統幫助\n\n` +
        `直接發送自然語言即可預約，例如：\n` +
        `• 「我想約明天下午3點XX店3號技師」\n` +
        `• 「後天早班YY店5號」\n` +
        `• 「3月20日晚上8點ZZ店10號技師」\n\n` +
        `系統會自動解析您的預約信息並通知技師。\n\n` +
        `命令列表：\n` +
        `/start - 開始使用\n` +
        `/help - 顯示幫助\n` +
        `/status - 查看最近預約狀態`
      );
    } catch (error) {
      logger.error('處理 help 命令失敗', { error: error.message });
    }
  });

  // /status 命令 - 查看最近預約
  bot.command('status', async (ctx) => {
    try {
      const chatId = ctx.from.id;
      const db = require('../utils/db');
      
      const result = await db.query(
        `SELECT b.*, l.name as location_name, t.display_number, t.name as therapist_name
         FROM bookings b
         LEFT JOIN locations l ON b.location_id = l.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         JOIN customers c ON b.customer_id = c.id
         WHERE c.telegram_id = $1
         ORDER BY b.created_at DESC
         LIMIT 5`,
        [chatId]
      );

      if (result.rows.length === 0) {
        await ctx.reply('您目前沒有預約記錄。\n\n直接發送預約信息即可開始預約。');
        return;
      }

      const statusLabels = {
        'pending_technician_confirmation': '⏳ 等待技師確認',
        'confirmed': '✅ 已確認',
        'rejected_by_technician': '❌ 技師已拒絕',
        'rescheduled_pending': '🔄 改期待確認',
        'cancelled_by_customer': '🚫 已取消',
        'waiting_therapist': '⏳ 等待技師回覆',
        'waiting_service': '✅ 等待服務',
        'completed': '✅ 已完成',
        'customer_no_show': '⚠️ 客戶爽約',
        'therapist_cancelled': '❌ 技師取消',
      };

      let msg = '📋 您最近的預約：\n\n';
      for (const b of result.rows) {
        const status = statusLabels[b.status] || b.status;
        const dateStr = b.booking_date ? new Date(b.booking_date).toISOString().split('T')[0] : '未知';
        msg += `${status}\n`;
        msg += `  場所：${b.location_name || '未知'}\n`;
        msg += `  技師：${b.display_number || b.therapist_name || '未知'}號\n`;
        msg += `  日期：${dateStr}\n`;
        msg += `  時間：${b.booking_time || b.time_slot || '未知'}\n\n`;
      }

      await ctx.reply(msg);
    } catch (error) {
      logger.error('處理 status 命令失敗', { error: error.message });
      await ctx.reply('查詢預約狀態時發生錯誤，請稍後重試。');
    }
  });

  // 處理所有文本消息
  bot.on('text', async (ctx) => {
    try {
      const chatId = ctx.from.id;
      const text = ctx.message.text;
      const userName = ctx.from.first_name || `用戶${chatId}`;

      // 忽略命令消息（已由上面的 handler 處理）
      if (text.startsWith('/')) return;

      logger.info('收到文本消息', { chatId, text });

      // 先檢查是否有待確認的改期
      const handled = await AIBookingBridge.handleCustomerRescheduleReply(chatId, text);
      if (handled) return;

      // 處理自然語言預約
      await AIBookingBridge.handleCustomerMessage(chatId, text, userName);
    } catch (error) {
      logger.error('處理文本消息失敗', { error: error.message });
      try {
        await ctx.reply('處理您的消息時發生錯誤，請稍後重試。');
      } catch (e) {
        logger.error('發送錯誤回覆失敗', { error: e.message });
      }
    }
  });

  // 錯誤處理
  bot.catch((err, ctx) => {
    logger.error('Bot 錯誤', { error: err.message });
  });

  // 啟動 polling
  bot.launch({
    dropPendingUpdates: true,
  }).then(() => {
    logger.info('Telegram AI 預約 Bot 已啟動（polling 模式）');
    console.log('🤖 Telegram AI 預約 Bot 已啟動');
  }).catch((error) => {
    logger.error('Telegram Bot 啟動失敗', { error: error.message });
    console.error('❌ Telegram Bot 啟動失敗:', error.message);
  });

  // 優雅關閉
  const gracefulStop = () => {
    if (bot) {
      bot.stop('SIGTERM');
    }
  };
  process.once('SIGINT', gracefulStop);
  process.once('SIGTERM', gracefulStop);

  return bot;
}

/**
 * 獲取 bot 實例
 */
function getBot() {
  return bot;
}

module.exports = {
  initAIBookingBot,
  getBot,
};
