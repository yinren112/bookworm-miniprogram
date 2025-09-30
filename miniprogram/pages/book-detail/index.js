// pages/book-detail/index.js
const { request } = require('../../utils/api');
const ui = require('../../utils/ui');
const { safeCreateOrderAndPay } = require('../../utils/payment');
const { extractErrorMessage } = require('../../utils/error');

Page({
  data: {
    bookDetail: null,
    isLoading: true,
    error: null,
    isSubmitting: false,
  },

  onLoad(options) {
    this.hasShownOnce = false;
    if (options.id) {
      this.currentId = options.id;
      this.fetchBookDetails(options.id);
    } else {
      this.setData({ error: '无效的书籍ID', isLoading: false });
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
      const data = await request({
        url: `/inventory/item/${id}`,
        method: 'GET'
      });
      if (!data) {
        this.setData({ error: '书籍信息不存在' });
      } else {
        this.setData({ bookDetail: data });
      }
    } catch (error) {
      console.error('API request failed', error);
      const errorMsg = extractErrorMessage(error, '加载失败');
      this.setData({ error: errorMsg });
      ui.showError(errorMsg);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async handleBuyNow() {
    // 在函数开始时获取本地常量，确保数据访问的稳定性
    const { bookDetail } = this.data;
    if (this.data.isSubmitting || !bookDetail) return;

    // 显示购买确认对话框
    const confirmResult = await new Promise((resolve) => {
      wx.showModal({
        title: '确认购买',
        content: `确定要购买《${bookDetail.bookSku.bookMaster.title}》吗？\n支付金额：¥${bookDetail.selling_price}`,
        confirmText: '立即支付',
        cancelText: '再看看',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmResult) {
      return; // 用户取消购买
    }

    this.setData({ isSubmitting: true });
    const result = await safeCreateOrderAndPay([bookDetail.id]);

    this.setData({ isSubmitting: false });

    if (result.success) {
      setTimeout(() => {
        wx.switchTab({ url: '/pages/orders/index' });
      }, 1500);
    }
  }
});
