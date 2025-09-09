// pages/order-confirm/index.js
const auth = require('../../utils/auth');
const config = require('../../config');

Page({
  data: {
    book: null,
    isSubmitting: false
  },
  
  onLoad(options) {
    if (options.book) {
      this.setData({
        book: JSON.parse(decodeURIComponent(options.book))
      });
    }
  },
  
  handlePayment() {
    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });

    const userId = auth.getUserId();
    const inventoryItemId = this.data.book.id;

    if (!userId) {
      wx.showToast({ title: '登录信息失效，请重启小程序', icon: 'none' });
      this.setData({ isSubmitting: false });
      return;
    }

    wx.showLoading({ title: '正在创建订单...' });

    // Step 1: Create the order
    wx.request({
      url: `${config.apiBaseUrl}/orders/create`,
      method: 'POST',
      data: { userId, inventoryItemIds: [inventoryItemId] },
      success: (createRes) => {
        if (createRes.statusCode !== 201) {
          wx.hideLoading();
          wx.showToast({ title: '创建订单失败', icon: 'error' });
          this.setData({ isSubmitting: false });
          return;
        }
        
        const orderId = createRes.data.id;
        wx.showLoading({ title: '获取支付参数...' });

        // Step 2: Get payment parameters
        wx.request({
          url: `${config.apiBaseUrl}/orders/${orderId}/pay`,
          method: 'POST',
          data: { openid: auth.getToken() }, // Use stored token as openid for now
          success: (payRes) => {
            wx.hideLoading();
            if (payRes.statusCode !== 200) {
              wx.showToast({ title: '获取支付参数失败', icon: 'error' });
              this.setData({ isSubmitting: false });
              return;
            }

            const payParams = payRes.data.paymentParams;
            // Step 3: Request payment
            wx.requestPayment({
              timeStamp: payParams.timeStamp,
              nonceStr: payParams.nonceStr,
              package: payParams.package,
              signType: payParams.signType,
              paySign: payParams.paySign,
              success: (paymentSuccessRes) => {
                wx.showToast({ title: '支付成功', icon: 'success' });
                // Navigate to orders page to see the result
                setTimeout(() => {
                  wx.switchTab({ url: '/pages/orders/index' });
                }, 1500);
              },
              fail: (paymentFailRes) => {
                wx.showToast({ title: '支付已取消', icon: 'none' });
                this.setData({ isSubmitting: false });
              }
            });
          },
          fail: (err) => {
            wx.hideLoading();
            wx.showToast({ title: '网络请求失败', icon: 'error' });
            this.setData({ isSubmitting: false });
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ title: '网络请求失败', icon: 'error' });
        this.setData({ isSubmitting: false });
      }
    });
  }
});