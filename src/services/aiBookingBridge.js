const db = require('../utils/db');
const logger = require('../utils/logger');
const aiParser = require('./aiParser');
const telegramUtil = require('../utils/telegram');
const Customer = require('../models/customer');

// 優先使用新的 wecom 模塊
let wecom;
try {
  wecom = require('../utils/wecom');
} catch (e) {
  wecom = null;
}

// 兼容舊的 wechat 模塊
let wechatService;
try {
  wechatService = require('../utils/wechat');
} catch (e) {
  wechatService = null;
}

// AI 預約會話狀態
const SESSION_STATUS = {
  PARSING_CUSTOMER: 'parsing_customer',
  PENDING_TECHNICIAN: 'pending_technician_confirmation',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  RESCHEDULED_PENDING: 'rescheduled_pending_customer_approval',
  CLARIFICATION_NEEDED: 'clarification_needed',
  EXPIRED: 'expired',
};

class AIBookingBridge {
  /**
   * 處理客戶 Telegram 消息（自然語言預約）
   */
  static async handleCustomerMessage(chatId, text, userName) {
    try {
      logger.info('收到客戶 Telegram 消息', { chatId, text });

      // 1. AI 解析客戶請求
      const parsed = await aiParser.parseCustomerRequest(text);

      // 如果解析結果為空（非預約消息），忽略
      if (!parsed || Object.keys(parsed).length === 0) {
        logger.info('非預約相關消息，忽略', { chatId, text });
        return null;
      }

      const { date, time, location_name, technician_code } = parsed;

      // 2. 檢查必要信息是否完整
      const missingFields = [];
      if (!location_name) missingFields.push('場所名稱');
      if (!technician_code) missingFields.push('技師工號');

      if (missingFields.length > 0) {
        const msg = `您的預約信息不完整，缺少：${missingFields.join('、')}。\n\n請提供完整信息，例如：「我想約明天下午3點XX店3號技師」`;
        await telegramUtil.sendMessage(chatId, msg);

        // 創建會話記錄
        await this.createSession(chatId, text, parsed, SESSION_STATUS.CLARIFICATION_NEEDED);
        return null;
      }

      if (!date && !time) {
        const msg = `請提供預約的日期和時間。\n\n例如：「我想約明天下午3點${location_name}${technician_code}號技師」`;
        await telegramUtil.sendMessage(chatId, msg);
        await this.createSession(chatId, text, parsed, SESSION_STATUS.CLARIFICATION_NEEDED);
        return null;
      }

      // 3. 在數據庫中查找場所
      const location = await this.findLocation(location_name);
      if (!location) {
        await telegramUtil.sendMessage(chatId, `找不到場所「${location_name}」，請確認場所名稱是否正確。`);
        await this.createSession(chatId, text, parsed, SESSION_STATUS.CLARIFICATION_NEEDED);
        return null;
      }

      // 4. 在數據庫中查找技師
      const therapist = await this.findTherapist(technician_code, location.id);
      if (!therapist) {
        await telegramUtil.sendMessage(chatId, `在「${location_name}」找不到${technician_code}號技師，請確認工號是否正確。`);
        await this.createSession(chatId, text, parsed, SESSION_STATUS.CLARIFICATION_NEEDED);
        return null;
      }

      // 5. 確保客戶存在
      const customer = await Customer.findOrCreate(chatId, userName);

      // 6. 創建預約記錄
      const bookingDate = date || new Date().toISOString().split('T')[0];
      const bookingTime = time || '15:00:00';

      const booking = await db.query(
        `INSERT INTO bookings (customer_id, therapist_id, location_id, booking_date, time_slot, time_option, status, booking_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [customer.id, therapist.id, location.id, bookingDate, this.getTimeSlot(bookingTime), 'A', 'pending_technician_confirmation', bookingTime]
      );

      const bookingRecord = booking.rows[0];

      // 7. 創建 AI 會話記錄
      const session = await this.createSession(
        chatId, text, parsed, SESSION_STATUS.PENDING_TECHNICIAN, bookingRecord.id
      );

      // 8. 更新預約的 ai_session_id
      await db.query('UPDATE bookings SET ai_session_id = $1 WHERE id = $2', [session.id, bookingRecord.id]);

      // 9. 發送企業微信消息給技師（優先使用新的 wecom 模塊發送卡片消息）
      const wechatUserId = therapist.wechat_userid || therapist.external_user_id;
      if (wechatUserId) {
        try {
          if (wecom && wecom.isConfigured()) {
            // 使用新的 wecom 模塊發送卡片消息
            await wecom.sendBookingNotificationCard(wechatUserId, {
              bookingId: bookingRecord.id,
              customerName: customer.name || `用戶`,
              locationName: location.name,
              bookingDate: bookingDate,
              bookingTime: bookingTime,
              bookingCountWithTherapist: 0,
              totalNoShowCount: 0,
            });
            logger.info('企業微信卡片通知已發送', { therapistId: therapist.id, wechatUserId });
          } else if (wechatService) {
            // 降級為舊模式文本消息
            const message = `【新預約請求】\n日期：${bookingDate}\n時間：${bookingTime}\n場所：${location.name}\n\n請回覆「接受」或「拒絕」。`;
            await wechatService.sendMessageToExternalContact(wechatUserId, message);
            logger.info('企業微信文本通知已發送', { therapistId: therapist.id, wechatUserId });
          }
        } catch (wechatError) {
          logger.error('發送企業微信通知失敗', { error: wechatError.message });
          
          // 嘗試降級為文本消息
          if (wecom && wecom.isConfigured()) {
            try {
              const textMsg = `【新預約請求】\n預約編號: #${bookingRecord.id}\n日期：${bookingDate}\n時間：${bookingTime}\n場所：${location.name}\n\n請回覆「接受」或「拒絕」。`;
              await wecom.sendTextMessage(wechatUserId, textMsg);
            } catch (fallbackError) {
              logger.error('降級文本消息也失敗', { error: fallbackError.message });
            }
          }
        }
      } else {
        logger.warn('技師未配置企業微信 ID', { therapistId: therapist.id });
      }

      // 10. 回覆客戶
      const confirmMsg = `✅ 預約請求已提交！\n\n` +
        `場所：${location.name}\n` +
        `技師：${technician_code}號\n` +
        `日期：${bookingDate}\n` +
        `時間：${bookingTime}\n\n` +
        `正在等待技師確認，請稍候...`;
      await telegramUtil.sendMessage(chatId, confirmMsg);

      logger.info('AI 預約已創建並通知技師', {
        bookingId: bookingRecord.id,
        sessionId: session.id,
        chatId,
        therapistId: therapist.id,
      });

      return bookingRecord;
    } catch (error) {
      logger.error('處理客戶消息失敗', { error: error.message, chatId });
      try {
        await telegramUtil.sendMessage(chatId, '處理您的預約請求時發生錯誤，請稍後重試。');
      } catch (e) {
        logger.error('發送錯誤消息失敗', { error: e.message });
      }
      return null;
    }
  }

  /**
   * 處理技師企業微信回覆
   */
  static async handleTechnicianReply(wechatUserId, replyText) {
    try {
      logger.info('收到技師企業微信回覆', { wechatUserId, replyText });

      // 1. 查找技師
      const therapistResult = await db.query(
        `SELECT t.*, l.name as location_name FROM therapists t 
         LEFT JOIN locations l ON t.current_location_id = l.id 
         WHERE t.wechat_userid = $1 OR t.external_user_id = $1`,
        [wechatUserId]
      );

      if (therapistResult.rows.length === 0) {
        logger.warn('找不到對應的技師', { wechatUserId });
        return null;
      }

      const therapist = therapistResult.rows[0];

      // 2. 查找該技師最新的待確認預約會話
      const sessionResult = await db.query(
        `SELECT s.*, b.booking_date, b.booking_time, b.customer_id, b.location_id,
                l.name as location_name, c.telegram_id as customer_telegram_id
         FROM ai_booking_sessions s
         JOIN bookings b ON s.current_booking_id = b.id
         JOIN customers c ON b.customer_id = c.id
         LEFT JOIN locations l ON b.location_id = l.id
         WHERE b.therapist_id = $1
           AND s.session_status = $2
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [therapist.id, SESSION_STATUS.PENDING_TECHNICIAN]
      );

      if (sessionResult.rows.length === 0) {
        logger.warn('找不到待確認的預約會話', { therapistId: therapist.id });
        return null;
      }

      const session = sessionResult.rows[0];
      const technicianCode = therapist.display_number || String(therapist.id);
      const companyName = session.location_name || '';

      // 3. AI 解析技師回覆（只提取：是否接受、時間、日期、工號、公司名）
      const parsed = await aiParser.parseTechnicianReply(replyText, technicianCode, companyName);

      // 4. 更新會話記錄
      await db.query(
        `UPDATE ai_booking_sessions 
         SET raw_technician_reply = $1, parsed_technician_json = $2, last_interaction_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [replyText, JSON.stringify(parsed), session.id]
      );

      // 5. 根據解析結果處理
      if (parsed.accepted === true) {
        // 技師接受預約
        await db.query(
          `UPDATE bookings SET status = 'confirmed', therapist_response_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [session.current_booking_id]
        );
        await db.query(
          `UPDATE ai_booking_sessions SET session_status = $1, updated_at = NOW() WHERE id = $2`,
          [SESSION_STATUS.CONFIRMED, session.id]
        );

        // 通知客戶
        const confirmMsg = `✅ 預約已確認！\n\n` +
          `場所：${session.location_name}\n` +
          `日期：${session.booking_date}\n` +
          `時間：${session.booking_time}\n\n` +
          `技師已接受您的預約，請準時到達。`;
        await telegramUtil.sendMessage(session.customer_telegram_id, confirmMsg);

        // 通知技師確認成功
        if (wecom && wecom.isConfigured()) {
          try {
            await wecom.sendTextMessage(wechatUserId, `✅ 您已成功接受預約 #${session.current_booking_id}`);
          } catch (e) {
            logger.warn('發送確認回執失敗', { error: e.message });
          }
        }

        logger.info('預約已確認', { bookingId: session.current_booking_id });
      } else if (parsed.accepted === false) {
        if (parsed.new_time || parsed.new_date) {
          // 技師提出新時間
          await db.query(
            `UPDATE bookings SET status = 'rescheduled_pending', updated_at = NOW() WHERE id = $1`,
            [session.current_booking_id]
          );
          await db.query(
            `UPDATE ai_booking_sessions SET session_status = $1, updated_at = NOW() WHERE id = $2`,
            [SESSION_STATUS.RESCHEDULED_PENDING, session.id]
          );

          const newTimeInfo = [];
          if (parsed.new_date) newTimeInfo.push(`日期：${parsed.new_date}`);
          if (parsed.new_time) newTimeInfo.push(`時間：${parsed.new_time}`);

          const rescheduleMsg = `⏰ 技師提出了新的時間：\n\n` +
            `${newTimeInfo.join('\n')}\n` +
            `場所：${session.location_name}\n\n` +
            `請回覆「接受」或「拒絕」。`;
          await telegramUtil.sendMessage(session.customer_telegram_id, rescheduleMsg);

          logger.info('技師提出新時間', { bookingId: session.current_booking_id, newTime: parsed.new_time, newDate: parsed.new_date });
        } else {
          // 技師拒絕預約
          await db.query(
            `UPDATE bookings SET status = 'rejected_by_technician', therapist_response_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [session.current_booking_id]
          );
          await db.query(
            `UPDATE ai_booking_sessions SET session_status = $1, updated_at = NOW() WHERE id = $2`,
            [SESSION_STATUS.REJECTED, session.id]
          );

          const rejectMsg = `❌ 很抱歉，技師無法接受此預約。\n\n` +
            `場所：${session.location_name}\n` +
            `日期：${session.booking_date}\n` +
            `時間：${session.booking_time}\n\n` +
            `請嘗試預約其他技師或時間。`;
          await telegramUtil.sendMessage(session.customer_telegram_id, rejectMsg);

          logger.info('預約已被技師拒絕', { bookingId: session.current_booking_id });
        }
      } else {
        // 無法判斷意圖，忽略
        logger.info('技師回覆無法判斷意圖，忽略', { wechatUserId, replyText });
      }

      return parsed;
    } catch (error) {
      logger.error('處理技師回覆失敗', { error: error.message, wechatUserId });
      return null;
    }
  }

  /**
   * 處理客戶對改期的回覆
   */
  static async handleCustomerRescheduleReply(chatId, text) {
    try {
      // 查找該客戶最新的改期待確認會話
      const sessionResult = await db.query(
        `SELECT s.*, b.therapist_id, b.booking_date, b.booking_time, b.location_id,
                l.name as location_name, t.wechat_userid, t.external_user_id, t.display_number
         FROM ai_booking_sessions s
         JOIN bookings b ON s.current_booking_id = b.id
         LEFT JOIN locations l ON b.location_id = l.id
         LEFT JOIN therapists t ON b.therapist_id = t.id
         WHERE s.customer_telegram_id = $1
           AND s.session_status = $2
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [chatId, SESSION_STATUS.RESCHEDULED_PENDING]
      );

      if (sessionResult.rows.length === 0) {
        return false; // 沒有待確認的改期
      }

      const session = sessionResult.rows[0];
      const parsedTechnician = session.parsed_technician_json;

      // 簡單判斷客戶是否接受
      const lowerText = text.toLowerCase().trim();
      const acceptKeywords = ['接受', '好', '可以', 'ok', '好的', '行', '沒問題', '同意', 'yes'];
      const rejectKeywords = ['拒絕', '不', '不行', '不可以', '算了', '取消', 'no'];

      let accepted = null;
      for (const kw of acceptKeywords) {
        if (lowerText.includes(kw)) { accepted = true; break; }
      }
      if (accepted === null) {
        for (const kw of rejectKeywords) {
          if (lowerText.includes(kw)) { accepted = false; break; }
        }
      }

      if (accepted === null) {
        return false; // 無法判斷
      }

      if (accepted) {
        // 客戶接受新時間，更新預約
        const newDate = parsedTechnician?.new_date || session.booking_date;
        const newTime = parsedTechnician?.new_time || session.booking_time;

        await db.query(
          `UPDATE bookings SET status = 'confirmed', booking_date = $1, booking_time = $2, 
           therapist_response_at = NOW(), updated_at = NOW() WHERE id = $3`,
          [newDate, newTime, session.current_booking_id]
        );
        await db.query(
          `UPDATE ai_booking_sessions SET session_status = $1, updated_at = NOW() WHERE id = $2`,
          [SESSION_STATUS.CONFIRMED, session.id]
        );

        await telegramUtil.sendMessage(chatId,
          `✅ 預約已確認！\n\n場所：${session.location_name}\n日期：${newDate}\n時間：${newTime}\n\n請準時到達。`
        );
      } else {
        // 客戶拒絕新時間
        await db.query(
          `UPDATE bookings SET status = 'cancelled_by_customer', updated_at = NOW() WHERE id = $1`,
          [session.current_booking_id]
        );
        await db.query(
          `UPDATE ai_booking_sessions SET session_status = 'cancelled', updated_at = NOW() WHERE id = $1`,
          [session.id]
        );

        await telegramUtil.sendMessage(chatId,
          `❌ 預約已取消。\n\n您可以隨時發送新的預約請求。`
        );
      }

      return true;
    } catch (error) {
      logger.error('處理客戶改期回覆失敗', { error: error.message, chatId });
      return false;
    }
  }

  /**
   * 模糊查找場所
   */
  static async findLocation(locationName) {
    try {
      // 先精確匹配名稱
      let result = await db.query(
        'SELECT * FROM locations WHERE name = $1',
        [locationName]
      );
      if (result.rows.length > 0) return result.rows[0];

      // 模糊匹配
      result = await db.query(
        'SELECT * FROM locations WHERE name ILIKE $1',
        [`%${locationName}%`]
      );
      if (result.rows.length > 0) return result.rows[0];

      // 按 code 匹配
      result = await db.query(
        'SELECT * FROM locations WHERE code ILIKE $1',
        [`%${locationName}%`]
      );
      if (result.rows.length > 0) return result.rows[0];

      return null;
    } catch (error) {
      logger.error('查找場所失敗', { error: error.message, locationName });
      return null;
    }
  }

  /**
   * 查找技師（通過工號和場所）
   */
  static async findTherapist(technicianCode, locationId) {
    try {
      // 先按 display_number + location 查找
      let result = await db.query(
        `SELECT * FROM therapists WHERE display_number = $1 AND (current_location_id = $2 OR location_id = $2)`,
        [technicianCode, locationId]
      );
      if (result.rows.length > 0) return result.rows[0];

      // 按 display_number 查找（不限場所）
      result = await db.query(
        `SELECT * FROM therapists WHERE display_number = $1`,
        [technicianCode]
      );
      if (result.rows.length > 0) return result.rows[0];

      // 按 ID 查找
      const numCode = parseInt(technicianCode, 10);
      if (!isNaN(numCode)) {
        result = await db.query(
          `SELECT * FROM therapists WHERE id = $1`,
          [numCode]
        );
        if (result.rows.length > 0) return result.rows[0];
      }

      return null;
    } catch (error) {
      logger.error('查找技師失敗', { error: error.message, technicianCode });
      return null;
    }
  }

  /**
   * 根據時間判斷班次
   */
  static getTimeSlot(timeStr) {
    if (!timeStr) return 'afternoon';
    const hour = parseInt(timeStr.split(':')[0], 10);
    if (hour >= 5 && hour < 15) return 'morning';
    if (hour >= 15 && hour < 20) return 'afternoon';
    return 'evening';
  }

  /**
   * 創建 AI 會話記錄
   */
  static async createSession(customerTelegramId, rawInput, parsedJson, status, bookingId = null) {
    try {
      const result = await db.query(
        `INSERT INTO ai_booking_sessions 
         (customer_telegram_id, current_booking_id, session_status, raw_customer_input, parsed_customer_json)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [customerTelegramId, bookingId, status, rawInput, JSON.stringify(parsedJson)]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('創建 AI 會話記錄失敗', { error: error.message });
      throw error;
    }
  }
}

module.exports = AIBookingBridge;
