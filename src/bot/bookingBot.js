const { Telegraf } = require('telegraf');
const logger = require('../utils/logger');
const Customer = require('../models/customer');
const Location = require('../models/location');
const Therapist = require('../models/therapist');
const NoShow = require('../models/noshow');
const BookingService = require('../services/bookingService');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 用戶會話狀態
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

// 開始命令
bot.command('start', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || `用戶${userId}`;

    // 創建或獲取客戶
    await Customer.findOrCreate(userId, userName);

    await ctx.reply(
      `歡迎使用 Tryme 預約系統！👋\n\n` +
      `輸入 /book 開始預約，或輸入 /help 查看幫助。`
    );

    logger.info('用戶開始對話', { userId, userName });
  } catch (error) {
    logger.error('處理 start 命令失敗', { error: error.message });
    await ctx.reply('發生錯誤，請稍後重試。');
  }
});

// 幫助命令
bot.command('help', async (ctx) => {
  try {
    await ctx.reply(
      `📖 Tryme 預約系統幫助\n\n` +
      `/book - 開始預約\n` +
      `/cancel - 取消預約\n` +
      `/status - 查看預約狀態\n` +
      `/help - 顯示此幫助信息`
    );
  } catch (error) {
    logger.error('處理 help 命令失敗', { error: error.message });
  }
});

// 預約命令
bot.command('book', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const session = getUserSession(userId);

    // 獲取所有場所
    const locations = await Location.getAll();

    if (locations.length === 0) {
      await ctx.reply('目前沒有可用的場所。請稍後重試。');
      return;
    }

    // 顯示場所列表
    const keyboard = locations.map((loc) => [
      {
        text: `${loc.code} - ${loc.name}`,
        callback_data: `location_${loc.id}`,
      },
    ]);

    session.state = 'selecting_location';
    session.data = {};

    await ctx.reply('請選擇場所:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });

    logger.info('用戶開始預約流程', { userId });
  } catch (error) {
    logger.error('處理 book 命令失敗', { error: error.message });
    await ctx.reply('發生錯誤，請稍後重試。');
  }
});

// 場所選擇回調
bot.action(/^location_(\d+)$/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const locationId = parseInt(ctx.match[1], 10);
    const session = getUserSession(userId);

    session.data.locationId = locationId;

    // 獲取該場所的技師
    const therapists = await Therapist.getByLocation(locationId);

    if (therapists.length === 0) {
      await ctx.reply('該場所目前沒有可用的技師。');
      clearUserSession(userId);
      return;
    }

    // 顯示技師列表
    const keyboard = therapists.map((therapist) => [
      {
        text: therapist.name,
        callback_data: `therapist_${therapist.id}`,
      },
    ]);

    session.state = 'selecting_therapist';

    await ctx.editMessageText('請選擇技師:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });

    logger.info('用戶選擇場所', { userId, locationId });
  } catch (error) {
    logger.error('處理場所選擇失敗', { error: error.message });
    await ctx.reply('發生錯誤，請稍後重試。');
  }
});

// 技師選擇回調
bot.action(/^therapist_(\d+)$/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const therapistId = parseInt(ctx.match[1], 10);
    const session = getUserSession(userId);

    session.data.therapistId = therapistId;

    // 顯示時段選擇
    const keyboard = [
      [
        { text: '早上', callback_data: 'timeslot_morning' },
        { text: '中午', callback_data: 'timeslot_afternoon' },
        { text: '晚上', callback_data: 'timeslot_evening' },
      ],
    ];

    session.state = 'selecting_timeslot';

    await ctx.editMessageText('請選擇時段:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });

    logger.info('用戶選擇技師', { userId, therapistId });
  } catch (error) {
    logger.error('處理技師選擇失敗', { error: error.message });
    await ctx.reply('發生錯誤，請稍後重試。');
  }
});

// 時段選擇回調
bot.action(/^timeslot_(\w+)$/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const timeSlot = ctx.match[1];
    const session = getUserSession(userId);

    session.data.timeSlot = timeSlot;

    // 顯示日期選擇（簡化版，使用按鈕）
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    session.data.bookingDate = dateStr;

    // 顯示時間選項
    const keyboard = [
      [
        { text: 'A', callback_data: 'timeoption_A' },
        { text: 'B', callback_data: 'timeoption_B' },
        { text: 'C', callback_data: 'timeoption_C' },
      ],
      [
        { text: 'D', callback_data: 'timeoption_D' },
        { text: 'E', callback_data: 'timeoption_E' },
      ],
    ];

    session.state = 'selecting_timeoption';

    const timeSlotLabel = {
      morning: '早上',
      afternoon: '中午',
      evening: '晚上',
    }[timeSlot];

    await ctx.editMessageText(
      `預約日期: ${dateStr}\n時段: ${timeSlotLabel}\n\n請選擇具體時間:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );

    logger.info('用戶選擇時段', { userId, timeSlot, bookingDate: dateStr });
  } catch (error) {
    logger.error('處理時段選擇失敗', { error: error.message });
    await ctx.reply('發生錯誤，請稍後重試。');
  }
});

// 時間選項選擇回調
bot.action(/^timeoption_([A-E])$/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const timeOption = ctx.match[1];
    const session = getUserSession(userId);

    session.data.timeOption = timeOption;

    // 確認預約
    const customer = await Customer.getByTelegramId(userId);
    const booking = await BookingService.createBooking(
      customer.id,
      session.data.therapistId,
      session.data.locationId,
      session.data.bookingDate,
      session.data.timeSlot,
      timeOption
    );

    // 獲取爽約次數
    const noShowCount = await NoShow.getCountByCustomer(customer.id);

    await ctx.editMessageText(
      `✅ 預約已提交！\n\n` +
      `預約 ID: ${booking.id}\n` +
      `日期: ${session.data.bookingDate}\n` +
      `時段: ${session.data.timeSlot}\n` +
      `時間: ${timeOption}\n\n` +
      `⚠️ 提醒: 爽約會在您的記錄中留下痕跡，技師會看到您的爽約次數 (${noShowCount})。\n` +
      `請務必準時出現或提前至少 1 小時取消。`
    );

    clearUserSession(userId);
    logger.info('預約已創建', { userId, bookingId: booking.id });
  } catch (error) {
    logger.error('處理時間選項失敗', { error: error.message });
    await ctx.reply(`發生錯誤: ${error.message}`);
    clearUserSession(userId);
  }
});

// 文本消息處理
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text.toLowerCase();
    const userId = ctx.from.id;

    if (text === 'book' || text === '/book') {
      // 觸發 /book 命令
      await ctx.command('book');
    } else {
      await ctx.reply(
        '我不太明白您的意思。\n\n' +
        '輸入 /book 開始預約，或輸入 /help 查看幫助。'
      );
    }
  } catch (error) {
    logger.error('處理文本消息失敗', { error: error.message });
  }
});

module.exports = bot;
