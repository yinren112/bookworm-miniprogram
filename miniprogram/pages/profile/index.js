// miniprogram/pages/profile/index.js
const { getCurrentUser } = require('../../utils/api');
const authGuard = require('../../utils/auth-guard');
const ui = require('../../utils/ui');

Page({
  data: {
    userInfo: {
      nickName: '微信用户',
      role: 'USER' // 默认角色
    },
    serviceInfo: {
      wechatId: 'your_service_wechat_id',
      time: '工作日 9:00 - 18:00'
    },
    hasPhoneNumber: false // 是否已授权手机号
  },

  onShow() {
    this.fetchUserInfo();
  },

  async fetchUserInfo() {
    try {
      const userData = await getCurrentUser();
      this.setData({
        'userInfo.role': userData.role,
        hasPhoneNumber: !!userData.phone_number
      });
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      // 静默失败，保持默认USER角色
    }
  },

  async onGetPhoneNumber(e) {
    // 检查用户是否拒绝授权
    if (!e.detail || !e.detail.code) {
      const errorMsg = e.detail && e.detail.errMsg
        ? `授权失败: ${e.detail.errMsg}`
        : '需要授权手机号才能关联卖书记录';
      ui.showError(errorMsg);
      return;
    }

    const phoneCode = e.detail.code;

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
      console.error('Authorization failed:', error);
      ui.showError(error.message || '授权失败，请稍后重试');
    }
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
      title: '超值的二手教材，快来看看吧！',
      path: '/pages/market/index',
    }
  }
});