// pages/order-confirm/index.js
const auth = require('../../utils/auth');
const api = require('../../utils/api');

function promisifiedPayment(options) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

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

  async fetchBookDetails(id) {
    this.setData({ isLoading: true, error: null });
    
    try {
      const data = await api.request({
        url: `/inventory/item/${id}`,
        method: 'GET'
      });
      
      if (data.status === 'in_stock') {
        this.setData({ book: data });
      } else {
        this.setData({ error: '该书籍已售出或不可用' });
      }
    } catch (error) {
      this.setData({ error: error.error || '网络请求失败，无法获取书籍信息' });
    } finally {
      this.setData({ isLoading: false });
    }
  },
  
  async handlePayment() {
    if (this.data.isSubmitting || !this.data.book) return;
    this.setData({ isSubmitting: true });

    const userId = auth.getUserId();
    const inventoryItemId = this.data.book.id;

    if (!userId) {
      wx.showToast({ title: '登录信息失效，请重启小程序', icon: 'none' });
      this.setData({ isSubmitting: false });
      return;
    }

    try {
      wx.showLoading({ title: '正在创建订单...' });

      const createData = await api.request({
        url: '/orders/create',
        method: 'POST',
        data: { inventoryItemIds: [inventoryItemId] }
      });

      const orderId = createData.id;
      wx.showLoading({ title: '获取支付参数...' });

      const payParams = await api.request({
        url: `/orders/${orderId}/pay`,
        method: 'POST' // body为空，所有信息都在JWT里
      });

      wx.hideLoading();

      try {
        await promisifiedPayment(payParams); // 直接使用后端返回的签名参数
        wx.showToast({ title: '支付成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/orders/index' });
        }, 1500);
      } catch (paymentError) {
        wx.showToast({ title: '支付已取消', icon: 'none' });
        this.setData({ isSubmitting: false });
      }

    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.error || '网络请求失败', icon: 'error' });
      this.setData({ isSubmitting: false });
    }
  }
});