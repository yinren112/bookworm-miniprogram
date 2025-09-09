// pages/profile/index.js
Page({
  data: {
    userInfo: {
      nickName: 'WeChat User' // Match UI mockup
    },
    serviceInfo: {
      wechatId: 'your_service_wechat_id',
      time: 'Weekdays 9:00 - 18:00'
    }
  },
  copyWechatId() {
    wx.setClipboardData({
      data: this.data.serviceInfo.wechatId,
      success: () => { wx.showToast({ title: 'Copied!' }); }
    });
  },
  onShareAppMessage() {
    return {
      title: 'Check out these great second-hand books!',
      path: '/pages/market/index',
    }
  }
});