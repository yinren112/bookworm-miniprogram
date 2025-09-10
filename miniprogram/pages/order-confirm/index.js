// pages/order-confirm/index.js
const auth = require('../../utils/auth');
const config = require('../../config');

Page({
  data: {
    book: null,
    isLoading: true,
    error: null,
    isSubmitting: false
  },
  
  onLoad(options) {
    if (options.id) {
      this.fetchBookDetails(options.id);
    } else {
      this.setData({ isLoading: false, error: '无效的商品ID' });
    }
  },

  fetchBookDetails(id) {
    this.setData({ isLoading: true, error: null });
    wx.request({
      url: `${config.apiBaseUrl}/inventory/item/${id}`,
      success: (res) => {
        if (res.statusCode === 200 && res.data.status === 'in_stock') {
          this.setData({ book: res.data });
        } else {
          this.setData({ error: res.data.error || '该书籍已售出或不可用' });
        }
      },
      fail: (err) => {
        this.setData({ error: '网络请求失败，无法获取书籍信息' });
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },
  
  handlePayment() {
    if (this.data.isSubmitting || !this.data.book) return;
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
          wx.showToast({ title: createRes.data.error || '创建订单失败', icon: 'error' });
          this.setData({ isSubmitting: false });
          return;
        }
        
        const orderId = createRes.data.id;
        wx.showLoading({ title: '获取支付参数...' });

        // Step 2: Get payment parameters
        wx.request({
          url: `${config.apiBaseUrl}/orders/${orderId}/pay`,
          method: 'POST',
          data: { openid: auth.getToken() },
          success: (payRes) => {
            wx.hideLoading();
            if (payRes.statusCode !== 200) {
              wx.showToast({ title: payRes.data.error || '获取支付参数失败', icon: 'error' });
              this.setData({ isSubmitting: false });
              return;
            }

            const payParams = payRes.data.result;
            // Step 3: Request payment
            wx.requestPayment({
              ...payParams,
              success: (paymentSuccessRes) => {
                wx.showToast({ title: '支付成功', icon: 'success' });
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