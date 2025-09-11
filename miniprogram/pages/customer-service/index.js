Page({
  data: {
    customerServiceWechat: 'bookworm_service'
  },

  onLoad() {
    wx.setNavigationBarTitle({
      title: '联系客服与帮助'
    });
  },

  // 复制微信号
  copyWechatId() {
    wx.setClipboardData({
      data: this.data.customerServiceWechat,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success',
          duration: 2000
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  }
});