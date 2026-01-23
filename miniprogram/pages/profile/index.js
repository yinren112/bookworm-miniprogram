// miniprogram/pages/profile/index.js
const { getCurrentUser } = require('../../utils/api');
const authGuard = require('../../utils/auth-guard');
const ui = require('../../utils/ui');
const logger = require('../../utils/logger');
const privacy = require('../../utils/privacy');
const { getStudyReminderStatus, subscribeStudyReminder } = require('../../utils/study-api');
const { STUDY_REMINDER_TEMPLATE_ID } = require('../../utils/constants');
const { track } = require('../../utils/track');
const { APP_CONFIG } = require('../../config');

Page({
  data: {
    userInfo: {
      nickName: '',
      avatarUrl: '',
      role: 'USER' // 默认角色
    },
    serviceInfo: {
      wechatId: 'your_service_wechat_id',
      time: '工作日 9:00 - 18:00'
    },
    hasPhoneNumber: false, // 是否已授权手机号
    isLinking: false,      // 防止重复点击
    isReviewMode: APP_CONFIG.REVIEW_ONLY_MODE,
    reminderStatus: 'UNKNOWN',
    reminderStatusText: '未开启',
    nextSendAtText: '',
    reminderLoading: false
  },

  onShow() {
    this.fetchUserInfo();
    this.loadReminderStatus();
  },

  async fetchUserInfo() {
    try {
      const userData = await getCurrentUser();
      const nickName = userData.nickname || '微信用户';
      const avatarUrl = userData.avatar_url || '';
      this.setData({
        'userInfo.role': userData.role,
        'userInfo.nickName': nickName,
        'userInfo.avatarUrl': avatarUrl,
        hasPhoneNumber: !!userData.phone_number
      });
    } catch (error) {
      logger.error('Failed to fetch user info:', error);
      // 静默失败，保持默认USER角色
    }
  },

  async loadReminderStatus() {
    if (!STUDY_REMINDER_TEMPLATE_ID || STUDY_REMINDER_TEMPLATE_ID === 'TEMPLATE_ID') {
      this.setData({
        reminderStatus: 'UNKNOWN',
        reminderStatusText: '未配置模板',
        nextSendAtText: ''
      });
      return;
    }

    try {
      const status = await getStudyReminderStatus({ templateId: STUDY_REMINDER_TEMPLATE_ID });
      const nextSendAtText = formatDateTime(status.nextSendAt);
      this.setData({
        reminderStatus: status.status || 'UNKNOWN',
        reminderStatusText: formatReminderStatus(status.status),
        nextSendAtText
      });
    } catch (error) {
      logger.error('Failed to load reminder status:', error);
    }
  },

  async onGetPhoneNumber(e) {
    const { authorized } = await privacy.ensurePrivacyAuthorized({
      content: '绑定手机号前，请先阅读并同意隐私保护指引。'
    });
    if (!authorized) return;

    // 防止重复点击
    if (this.data.isLinking) return;

    // 检查用户是否拒绝授权
    if (!e.detail || !e.detail.code) {
      const errorMsg = e.detail && e.detail.errMsg
        ? '授权失败，请重试'  // 不暴露原始错误信息
        : '需要授权手机号才能关联卖书记录';
      ui.showError(errorMsg);
      return;
    }

    const phoneCode = e.detail.code;
    this.setData({ isLinking: true });

    try {
      wx.showLoading({ title: '正在关联账户...' });

      // 调用带手机号的登录函数
      const loginResult = await authGuard.loginWithPhoneNumber(phoneCode);

      wx.hideLoading();

      // 检查是否发生了账户合并
      if (loginResult.merged) {
        wx.showModal({
          title: '账户已关联',
          content: '您的微信账户已成功关联手机号，可以查看您的卖书记录了！',
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            this.fetchUserInfo();
          }
        });
      } else {
        wx.showToast({
          title: '手机号授权成功',
          icon: 'success',
          duration: 2000
        });
        this.fetchUserInfo();
      }
    } catch (error) {
      wx.hideLoading();
      logger.error('Authorization failed:', error);
      ui.showError('授权失败，请稍后重试');
    } finally {
      this.setData({ isLinking: false });
    }
  },

  onReminderSubscribe() {
    if (this.data.reminderLoading) return;
    if (!STUDY_REMINDER_TEMPLATE_ID || STUDY_REMINDER_TEMPLATE_ID === 'TEMPLATE_ID') {
      wx.showToast({
        title: '订阅模板未配置',
        icon: 'none'
      });
      return;
    }

    this.setData({ reminderLoading: true });
    track('subscribe_click', { entry: 'profile' });

    wx.requestSubscribeMessage({
      tmplIds: [STUDY_REMINDER_TEMPLATE_ID],
      success: async (res) => {
        const result = res[STUDY_REMINDER_TEMPLATE_ID];
        const normalized = result === 'accept' ? 'accept' : 'reject';
        track('subscribe_result', { result: normalized });
        try {
          const response = await subscribeStudyReminder({
            templateId: STUDY_REMINDER_TEMPLATE_ID,
            result: normalized,
            timezone: 'Asia/Shanghai'
          });
          this.setData({
            reminderStatus: response.status || 'UNKNOWN',
            reminderStatusText: formatReminderStatus(response.status),
            nextSendAtText: formatDateTime(response.nextSendAt)
          });
        } catch (err) {
          logger.error('Subscribe reminder failed:', err);
          ui.showError('订阅失败，请稍后重试');
        }
      },
      fail: (err) => {
        logger.error('Subscribe reminder failed:', err);
        ui.showError('订阅失败，请稍后重试');
      },
      complete: () => {
        this.setData({ reminderLoading: false });
      }
    });
  },
  goToReview() {
    wx.switchTab({
      url: '/pages/review/index'
    });
  },

  copyWechatId() {
    wx.setClipboardData({
      data: this.data.serviceInfo.wechatId,
      success: () => { wx.showToast({ title: '已复制' }); }
    });
  },

  showTerms() {
    wx.navigateTo({
      url: '/pages/webview/index?slug=terms-of-service'
    });
  },

  showPrivacy() {
    wx.navigateTo({
      url: '/pages/webview/index?slug=privacy-policy'
    });
  },

  goToCustomerService() {
    wx.navigateTo({
      url: '/pages/customer-service/index'
    });
  },

  onShareAppMessage() {
    return {
      title: '复习助手，随时开始学习',
      path: '/pages/review/index',
    }
  }
});

function formatReminderStatus(status) {
  switch (status) {
    case 'ACCEPT':
    case 'ACTIVE':
      return '已开启'; // 等待发送
    case 'SENT':
      return '已发送'; // 需要重新订阅
    case 'REJECT':
      return '未开启'; 
    case 'BAN':
      return '已停用';
    case 'FAILED':
      return '发送失败'; // 允许重试
    default:
      return '未开启';
  }
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}
