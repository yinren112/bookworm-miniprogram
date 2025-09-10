Page({
  data: {
    userInfo: { nickName: '微信用户' },
    serviceInfo: {
      wechatId: 'your_service_wechat_id',
      time: '工作日 9:00 - 18:00'
    }
  },
  copyWechatId() {
    wx.setClipboardData({
      data: this.data.serviceInfo.wechatId,
      success: () => { wx.showToast({ title: '已复制' }); }
    });
  },
  onShareAppMessage() {
    return {
      title: '超值的二手教材，快来看看吧！',
      path: '/pages/market/index',
    }
  }
});