const OpenAI = require('openai');
const logger = require('../utils/logger');

const client = new OpenAI();

const MODEL = 'gemini-2.5-flash';

/**
 * 客戶端解析 Prompt - 從客戶自然語言中提取預約信息
 */
function buildCustomerPrompt(userInput, currentDate) {
  return `你是一個頂級的預約信息解析引擎。你的任務是從用戶輸入的文本中，嚴格按照指令提取預約的關鍵信息。你必須忽略所有與預約無關的閒聊、問候、感謝或問題。

**指令：**
1.  只提取四個關鍵信息：**日期 (date)**、**時間 (time)**、**場所名稱 (location_name)** 和 **技師工號 (technician_code)**。
2.  如果文本中包含技師工號（例如「3號技師」、「8號」、「技師3」），請提取工號數字作為 technician_code。
3.  **日期解析規則**：
    *   今天的日期是 ${currentDate}。
    *   將「今天」、「明天」、「後天」轉換為 YYYY-MM-DD 格式。
    *   將「週三」、「下週五」等相對日期轉換為 YYYY-MM-DD 格式。
    *   如果只提到月份和日期（如「3月10日」），默認為今年。
4.  **時間解析規則**：
    *   將「下午3點」、「晚上8點」轉換為 HH:mm:ss (24小時制) 格式。
    *   將「中午」視為 12:00:00，將「傍晚」視為 18:00:00。
    *   如果用戶提到班次（早班、中班、夜班），請根據以下規則轉換：
        *   早班: 11:00:00
        *   中班: 15:00:00
        *   夜班: 20:00:00
5.  **輸出格式**：
    *   必須只返回一個 JSON 對象，不要包含任何其他文字或 markdown 標記。
    *   如果提取到任何預約相關信息，JSON 必須包含 date, time, location_name, technician_code 四個字段。任何未提取到的字段，其值必須為 null。
    *   如果文本完全不包含任何預約相關信息，返回一個空的 JSON 對象 {}。

**示例：**

*   用戶輸入: "你好，我想約明天下午3點XX店3號技師，謝謝！"
*   你的輸出: {"date": "2026-03-16", "time": "15:00:00", "location_name": "XX店", "technician_code": "3"}

*   用戶輸入: "有空嗎？"
*   你的輸出: {}

*   用戶輸入: "我想預約中班，在YY分店"
*   你的輸出: {"date": null, "time": "15:00:00", "location_name": "YY分店", "technician_code": null}

現在，請解析以下用戶文本：

${userInput}`;
}

/**
 * 技師端解析 Prompt - 解析技師對預約請求的回覆
 */
function buildTechnicianPrompt(technicianReply, originalTechnicianCode, originalCompanyName, currentDate) {
  return `你是一個頂級的技師回覆解析引擎。你的任務是解析技師對預約請求的回覆，判斷其是否接受預約，並提取任何時間或日期的變更建議。你必須忽略所有與預約確認無關的閒聊內容。

**指令：**
1.  判斷技師的核心意圖：**接受 (accepted)** 還是 **拒絕 (rejected)**。
2.  如果技師提出了新的時間或日期，提取 new_date 和 new_time。
3.  **意圖判斷規則**：
    *   「可以」、「OK」、「ok」、「接受」、「沒問題」、「好」、「行」、「好的」等正面詞彙視為 accepted: true。
    *   「不行」、「沒空」、「改時間」、「約滿了」、「不可以」、「拒絕」等負面或建議性詞彙視為 accepted: false。
4.  **時間日期解析規則**：
    *   今天的日期是 ${currentDate}。
    *   將相對日期和時間轉換為具體格式（同客戶端規則）。
5.  **輸出格式**：
    *   必須只返回一個 JSON 對象，不要包含任何其他文字或 markdown 標記。
    *   JSON 必須包含 accepted, new_date, new_time, technician_code, company_name 五個字段。
    *   任何未提取到的字段，其值必須為 null。
    *   如果回覆完全不包含任何預約相關信息，返回 {"accepted": null, "new_date": null, "new_time": null, "technician_code": "${originalTechnicianCode}", "company_name": "${originalCompanyName}"}。

**上下文信息：**
原始預約請求：
*   工號: ${originalTechnicianCode}
*   公司名: ${originalCompanyName}

**示例：**

*   技師回覆: "可以，我接受。"
*   你的輸出: {"accepted": true, "new_date": null, "new_time": null, "technician_code": "${originalTechnicianCode}", "company_name": "${originalCompanyName}"}

*   技師回覆: "那天下午不行，晚上8點可以嗎？"
*   你的輸出: {"accepted": false, "new_date": null, "new_time": "20:00:00", "technician_code": "${originalTechnicianCode}", "company_name": "${originalCompanyName}"}

*   技師回覆: "完全約滿了，抱歉。"
*   你的輸出: {"accepted": false, "new_date": null, "new_time": null, "technician_code": "${originalTechnicianCode}", "company_name": "${originalCompanyName}"}

現在，請解析以下技師回覆：

${technicianReply}`;
}

/**
 * 獲取當前日期字符串 (YYYY-MM-DD)
 */
function getCurrentDate() {
  const now = new Date();
  // 使用 UTC+8 時區
  const offset = 8 * 60;
  const local = new Date(now.getTime() + offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

/**
 * 解析客戶預約請求
 * @param {string} userInput - 客戶的自然語言輸入
 * @returns {Object} 解析結果 { date, time, location_name, technician_code } 或 {}
 */
async function parseCustomerRequest(userInput) {
  try {
    const currentDate = getCurrentDate();
    const prompt = buildCustomerPrompt(userInput, currentDate);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content?.trim();
    logger.info('AI 解析客戶請求原始回覆', { content });

    // 嘗試提取 JSON
    let parsed;
    try {
      // 移除可能的 markdown 代碼塊標記
      let jsonStr = content;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // 嘗試從文本中提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        logger.warn('AI 回覆無法解析為 JSON', { content });
        return {};
      }
    }

    logger.info('AI 解析客戶請求結果', { parsed });
    return parsed;
  } catch (error) {
    logger.error('AI 解析客戶請求失敗', { error: error.message });
    return {};
  }
}

/**
 * 解析技師回覆
 * @param {string} technicianReply - 技師的自然語言回覆
 * @param {string} originalTechnicianCode - 原始技師工號
 * @param {string} originalCompanyName - 原始場所名稱
 * @returns {Object} 解析結果 { accepted, new_date, new_time, technician_code, company_name }
 */
async function parseTechnicianReply(technicianReply, originalTechnicianCode, originalCompanyName) {
  try {
    const currentDate = getCurrentDate();
    const prompt = buildTechnicianPrompt(technicianReply, originalTechnicianCode, originalCompanyName, currentDate);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content?.trim();
    logger.info('AI 解析技師回覆原始回覆', { content });

    // 嘗試提取 JSON
    let parsed;
    try {
      let jsonStr = content;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        logger.warn('AI 回覆無法解析為 JSON', { content });
        return {
          accepted: null,
          new_date: null,
          new_time: null,
          technician_code: originalTechnicianCode,
          company_name: originalCompanyName,
        };
      }
    }

    logger.info('AI 解析技師回覆結果', { parsed });
    return parsed;
  } catch (error) {
    logger.error('AI 解析技師回覆失敗', { error: error.message });
    return {
      accepted: null,
      new_date: null,
      new_time: null,
      technician_code: originalTechnicianCode,
      company_name: originalCompanyName,
    };
  }
}

module.exports = {
  parseCustomerRequest,
  parseTechnicianReply,
};
