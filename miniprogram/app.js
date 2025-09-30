// miniprogram/app.js
const auth = require('./utils/auth');
const tokenUtil = require('./utils/token');

App({
  onLaunch() {
    auth.login()
      .then(res => {
        console.log('Login successful', res);
        tokenUtil.setToken(res.token);
        tokenUtil.setUserId(res.userId);
        this.checkTermsAgreement();
      })
      .catch(err => {
        console.error('Login failed on launch', err);
      });
  },

  checkTermsAgreement() {
    const hasAgreed = wx.getStorageSync('hasAgreedToTerms');
    if (!hasAgreed) {
      wx.showModal({
        title: '服务协议与隐私政策',
        content: '欢迎使用！为了保障您的权益，请在使用前仔细阅读并同意我们的《用户服务协议》与《隐私政策》。您可以在"我的-设置"中随时查看。',
        confirmText: '同意',
        cancelText: '拒绝',
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync('hasAgreedToTerms', true);
          } else if (res.cancel) {
            // 用户拒绝，可以引导退出或提示无法使用
            wx.showToast({
              title: '您需要同意协议才能使用本服务',
              icon: 'none',
              duration: 3000
            });
            // 简单处理，可以让用户无法进行核心操作
          }
        }
      });
    }
  },

  // 增加一个全局方法，方便其他页面调用
  showTerms() {
    wx.showModal({
      title: '服务协议与隐私政策',
      content: '这里是完整的《用户服务协议》与《隐私政策》内容...（此处应从服务器获取或本地预置长文本）',
      showCancel: false,
      confirmText: '我已知晓',
    });
  }
});
