// pages/order-confirm/index.js
const api = require('../../utils/api');
const ui = require('../../utils/ui');
const { safeCreateOrderAndPay } = require('../../utils/payment');
const { extractErrorMessage } = require('../../utils/error');

Page({
  data: {
    book: null,
    isLoading: true,
    error: null,
    isSubmitting: false
  },
  
  onLoad(options) {
    this.hasShownOnce = false;
    if (options.id) {
      this.currentId = options.id;
      this.fetchBookDetails(options.id);
    } else {
      this.setData({ isLoading: false, error: '无效的商品ID' });
    }
  },

  onShow() {
    if (!this.currentId) {
      return;
    }
    if (this.hasShownOnce) {
      this.fetchBookDetails(this.currentId, { preserveData: true });
    } else {
      this.hasShownOnce = true;
    }
  },

  async fetchBookDetails(id, { preserveData = false } = {}) {
    if (!preserveData) {
      this.setData({ isLoading: true, error: null });
    } else {
      this.setData({ error: null });
    }

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
      const errorMsg = extractErrorMessage(error, '网络请求失败，无法获取书籍信息');
      this.setData({ error: errorMsg });
      ui.showError(errorMsg);
    } finally {
      this.setData({ isLoading: false });
    }
  },
  
  async handlePayment() {
    // 在函数开始时获取本地常量，确保数据访问的稳定性
    const { book } = this.data;
    if (this.data.isSubmitting || !book) return;

    // 显示支付确认对话框
    const confirmResult = await new Promise((resolve) => {
      wx.showModal({
        title: '确认支付',
        content: `确定要购买《${book.bookSku.bookMaster.title}》吗？\n支付金额：¥${(book.selling_price / 100).toFixed(2)}`,
        confirmText: '确认支付',
        cancelText: '再想想',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmResult) {
      return; // 用户取消支付
    }

    this.setData({ isSubmitting: true });
    const result = await safeCreateOrderAndPay([book.id]);
    this.setData({ isSubmitting: false });

    if (result.success) {
      setTimeout(() => {
        wx.switchTab({ url: '/pages/orders/index' });
      }, 1500);
    }
  }
});
