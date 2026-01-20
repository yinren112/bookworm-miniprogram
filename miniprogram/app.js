// miniprogram/app.js
const privacy = require('./utils/privacy');
App({
  TERMS_COPY: {
    title: '服务协议与隐私政策',
    content: '欢迎使用！为保障您的权益，请在使用前仔细阅读并同意《用户服务协议》和《隐私政策》。您可在“我的-设置”中随时查看。',
    confirmText: '同意',
    cancelText: '拒绝',
    rejectToast: '您需要同意协议才能使用本服务'
  },

  onLaunch() {
    wx.setBackgroundColor({
      backgroundColor: '#f8f9fa',
      backgroundColorTop: '#2c5f2d',
      backgroundColorBottom: '#f8f9fa'
    });
    privacy.setupPrivacyAuthorization();
    this.checkTermsAgreement();
  },

  checkTermsAgreement() {
    const hasAgreed = wx.getStorageSync('hasAgreedToTerms');
    if (!hasAgreed) {
      wx.showModal({
        title: this.TERMS_COPY.title,
        content: this.TERMS_COPY.content,
        confirmText: this.TERMS_COPY.confirmText,
        cancelText: this.TERMS_COPY.cancelText,
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync('hasAgreedToTerms', true);
          } else if (res.cancel) {
            wx.showToast({
              title: this.TERMS_COPY.rejectToast,
              icon: 'none',
              duration: 3000
            });
          }
        }
      });
    }
  },

  showTerms() {
    wx.navigateTo({
      url: '/pages/webview/index?slug=terms-of-service'
    });
  }
});
