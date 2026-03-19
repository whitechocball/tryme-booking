const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../utils/db');
const logger = require('../utils/logger');
const wecom = require('../utils/wecom');

// 企業微信配置（從環境變量讀取，不再硬編碼）
const WECHAT_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';

/**
 * GET /api/wechat/members — 獲取企業微信成員列表
 */
router.get('/members', async (req, res) => {
  try {
    const token = await wecom.getAccessToken();

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
 * GET /api/wechat/config-status — 檢查企業微信配置狀態
 */
router.get('/config-status', (req, res) => {
  res.json({
    success: true,
    configured: wecom.isConfigured(),
    callbackConfigured: wecom.isCallbackConfigured(),
    config: {
      hasCorpId: !!wecom.getConfig().corpId,
      hasAgentId: !!wecom.getConfig().agentId,
      hasSecret: !!wecom.getConfig().secret,
      hasCallbackToken: !!wecom.getConfig().callbackToken,
      hasEncodingAESKey: !!wecom.getConfig().callbackEncodingAESKey,
    },
  });
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

/**
 * POST /api/wechat/test-message — 測試發送企業微信消息
 */
router.post('/test-message', async (req, res) => {
  try {
    const { userid, message } = req.body;

    if (!userid) {
      return res.status(400).json({ success: false, error: '缺少 userid' });
    }

    const result = await wecom.sendTextMessage(userid, message || '這是一條測試消息 from Tryme 預約系統');

    res.json({
      success: true,
      message: '消息已發送',
      result,
    });
  } catch (error) {
    logger.error('測試消息發送失敗', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
