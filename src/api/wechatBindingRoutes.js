const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../utils/db');
const logger = require('../utils/logger');

// 企業微信配置
const WECHAT_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';
const CORP_ID = process.env.WECHAT_CORP_ID || 'ww6ccfc2612e6f75fd';
const AGENT_ID = process.env.WECHAT_AGENT_ID || '1000002';
const SECRET = process.env.WECHAT_SECRET || 'DnCK0s-xwkaTA0CGB0mlISGIieMTxM45HKA4Xeo2Uh0';

// Token 緩存
let accessToken = null;
let tokenExpireTime = 0;

/**
 * 獲取企業微信 access_token
 */
async function getAccessToken() {
  const now = Date.now();
  if (accessToken && now < tokenExpireTime) {
    return accessToken;
  }

  try {
    const response = await axios.get(`${WECHAT_API_BASE}/gettoken`, {
      params: {
        corpid: CORP_ID,
        corpsecret: SECRET,
      },
    });

    if (response.data.errcode === 0) {
      accessToken = response.data.access_token;
      tokenExpireTime = now + (response.data.expires_in - 300) * 1000;
      logger.info('企業微信綁定模組 Token 已更新');
      return accessToken;
    } else {
      throw new Error(`企業微信 API 錯誤: ${response.data.errcode} - ${response.data.errmsg}`);
    }
  } catch (error) {
    logger.error('獲取企業微信 Token 失敗', { error: error.message });
    throw error;
  }
}

/**
 * GET /api/wechat/members — 獲取企業微信成員列表
 */
router.get('/members', async (req, res) => {
  try {
    const token = await getAccessToken();

    // 先獲取部門列表
    const deptResponse = await axios.get(`${WECHAT_API_BASE}/department/list`, {
      params: { access_token: token },
    });

    // 檢查 IP 白名單錯誤
    if (deptResponse.data.errcode === 60020) {
      const ipMatch = deptResponse.data.errmsg.match(/from ip: ([\d.]+)/);
      const serverIp = ipMatch ? ipMatch[1] : '未知';
      return res.json({
        success: false,
        error: 'IP_NOT_WHITELISTED',
        message: `服務器 IP (${serverIp}) 不在企業微信可信 IP 列表中。請在企業微信管理後台 → 應用管理 → 應用 → IP白名單中添加此 IP。`,
        serverIp: serverIp,
        members: [],
        total: 0,
      });
    }

    if (deptResponse.data.errcode !== 0) {
      throw new Error(`獲取部門列表失敗: ${deptResponse.data.errmsg}`);
    }

    const departments = deptResponse.data.department || [];
    
    // 獲取所有部門的成員
    const allMembers = [];
    const memberIds = new Set();

    for (const dept of departments) {
      try {
        const memberResponse = await axios.get(`${WECHAT_API_BASE}/user/simplelist`, {
          params: {
            access_token: token,
            department_id: dept.id,
            fetch_child: 0,
          },
        });

        if (memberResponse.data.errcode === 0 && memberResponse.data.userlist) {
          for (const member of memberResponse.data.userlist) {
            if (!memberIds.has(member.userid)) {
              memberIds.add(member.userid);
              allMembers.push({
                userid: member.userid,
                name: member.name,
                department: dept.name,
                department_id: dept.id,
              });
            }
          }
        }
      } catch (deptError) {
        logger.warn(`獲取部門 ${dept.id} 成員失敗`, { error: deptError.message });
      }
    }

    // 按名稱排序
    allMembers.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

    res.json({
      success: true,
      members: allMembers,
      total: allMembers.length,
    });
  } catch (error) {
    logger.error('獲取企業微信成員列表失敗', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      members: [],
      total: 0,
    });
  }
});

/**
 * POST /api/therapists/:id/bind-wechat — 綁定企業微信 userid
 */
router.post('/therapists/:id/bind-wechat', async (req, res) => {
  try {
    const therapistId = req.params.id;
    const { wechatUserid, wechatName } = req.body;

    if (!wechatUserid) {
      return res.status(400).json({ success: false, error: '缺少企業微信 userid' });
    }

    // 檢查技師是否存在
    const therapistResult = await db.query('SELECT * FROM therapists WHERE id = $1', [therapistId]);
    if (therapistResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '技師不存在' });
    }

    // 檢查該企業微信 userid 是否已被其他技師綁定
    const existingResult = await db.query(
      'SELECT id, name FROM therapists WHERE wechat_userid = $1 AND id != $2',
      [wechatUserid, therapistId]
    );
    if (existingResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: `該企業微信成員已被技師「${existingResult.rows[0].name}」(ID: ${existingResult.rows[0].id}) 綁定`,
      });
    }

    // 執行綁定
    const updateResult = await db.query(
      'UPDATE therapists SET wechat_userid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [wechatUserid, therapistId]
    );

    logger.info('技師企業微信綁定成功', {
      therapistId,
      wechatUserid,
      wechatName,
    });

    res.json({
      success: true,
      message: '綁定成功',
      therapist: updateResult.rows[0],
    });
  } catch (error) {
    logger.error('綁定企業微信失敗', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/therapists/:id/unbind-wechat — 解除企業微信綁定
 */
router.post('/therapists/:id/unbind-wechat', async (req, res) => {
  try {
    const therapistId = req.params.id;

    // 檢查技師是否存在
    const therapistResult = await db.query('SELECT * FROM therapists WHERE id = $1', [therapistId]);
    if (therapistResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '技師不存在' });
    }

    if (!therapistResult.rows[0].wechat_userid) {
      return res.status(400).json({ success: false, error: '該技師尚未綁定企業微信' });
    }

    // 執行解綁
    const updateResult = await db.query(
      'UPDATE therapists SET wechat_userid = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [therapistId]
    );

    logger.info('技師企業微信解綁成功', { therapistId });

    res.json({
      success: true,
      message: '解綁成功',
      therapist: updateResult.rows[0],
    });
  } catch (error) {
    logger.error('解綁企業微信失敗', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
