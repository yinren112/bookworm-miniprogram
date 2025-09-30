// pages/order-detail/index.js
const { request } = require('../../utils/api');
const { extractErrorMessage } = require('../../utils/error');

Page({
  data: {
    order: null,
    isLoading: true,
    error: null
  },

  onLoad(options) {
    this.hasShownOnce = false;
    if (options.id) {
      this.currentId = options.id;
      this.fetchOrderDetail(options.id);
    } else {
      this.setData({ 
        isLoading: false, 
        error: '无效的订单ID' 
      });
    }
  },

  onShow() {
    if (!this.currentId) {
      return;
    }
    if (this.hasShownOnce) {
      this.fetchOrderDetail(this.currentId, { preserveData: true });
    } else {
      this.hasShownOnce = true;
    }
  },

  async fetchOrderDetail(orderId, { preserveData = false } = {}) {
    if (!preserveData) {
      this.setData({ isLoading: true, error: null });
    } else {
      this.setData({ error: null });
    }

    try {
      const data = await request({
        url: `/orders/${orderId}`,
        method: 'GET'
      });
      this.setData({ 
        order: data,
        isLoading: false 
      });
    } catch (error) {
      const errorMsg = extractErrorMessage(error, '获取订单详情失败');
      this.setData({ 
        error: errorMsg,
        isLoading: false 
      });
    }
  },

  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  getStatusText(status) {
    const statusMap = {
      'PENDING_PAYMENT': '待支付',
      'PENDING_PICKUP': '待取货', 
      'COMPLETED': '已完成',
      'CANCELLED': '已取消'
    };
    return statusMap[status] || status;
  },

  getConditionText(condition) {
    const conditionMap = {
      'NEW': '全新',
      'GOOD': '良好',
      'ACCEPTABLE': '可用'
    };
    return conditionMap[condition] || condition;
  },

  onRefresh() {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const orderId = currentPage.options.id;
    if (orderId) {
      this.fetchOrderDetail(orderId, { preserveData: true });
    }
  },

  copyPickupCode(e) {
    const code = e.target.dataset.code || e.currentTarget.dataset.code;
    if (code) {
      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({
            title: '取货码已复制',
            icon: 'success'
          });
        }
      });
    }
  }
});
