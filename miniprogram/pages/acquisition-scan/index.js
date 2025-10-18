// pages/acquisition-scan/index.js
const { checkAcquisition, createSellOrder } = require('../../utils/api');
const ui = require('../../utils/ui');
const { extractErrorMessage } = require('../../utils/error');
const { formatPrice } = ui;

Page({
  data: {
    scannedItems: [],
    summary: {
      count: 0
    },
    customerPhone: '',
    totalWeight: '',
    unitPriceYuan: '',
    finalAmount: '0.00',
    submitting: false
  },

  /**
   * 扫码处理
   */
  async onScanCode() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.scanCode({
          onlyFromCamera: true,
          scanType: ['barCode'],
          success: resolve,
          fail: reject
        });
      });

      const isbn = res.result;

      // 显示加载提示
      wx.showLoading({ title: '查询中...', mask: true });

      try {
        // 调用API检查书籍是否可收购
        const data = await checkAcquisition(isbn);
        wx.hideLoading();

        if (data.acquirableSkus && data.acquirableSkus.length > 0) {
          // 可收购 - 使用第一个SKU
          const sku = data.acquirableSkus[0];
          this.addScannedItem({
            isbn,
            status: 'acquirable',
            skuInfo: sku
          });

          wx.showToast({
            title: '已添加到白名单',
            icon: 'success',
            duration: 1500
          });
        } else {
          // 不可收购
          this.addScannedItem({
            isbn,
            status: 'rejected',
            skuInfo: null
          });

          wx.showToast({
            title: '不在白名单',
            icon: 'none',
            duration: 2000
          });
        }
      } catch (error) {
        wx.hideLoading();
        console.error('Check acquisition failed:', error);
        const errorMsg = extractErrorMessage(error, '查询失败');
        ui.showError(errorMsg);
      }
    } catch (scanError) {
      // 用户取消扫码，不显示错误
    }
  },

  /**
   * 添加扫描项到列表
   */
  addScannedItem(item) {
    const scannedItems = [...this.data.scannedItems, item];
    this.setData({ scannedItems });
    this.updateSummary();
  },

  /**
   * 移除扫描项
   */
  onRemoveItem(e) {
    const index = e.currentTarget.dataset.index;
    const scannedItems = [...this.data.scannedItems];
    scannedItems.splice(index, 1);
    this.setData({ scannedItems });
    this.updateSummary();
  },

  /**
   * 手机号输入
   */
  onPhoneInput(e) {
    this.setData({ customerPhone: e.detail.value });
  },

  /**
   * 重量输入
   */
  onWeightInput(e) {
    this.setData({ totalWeight: e.detail.value });
    this.calculateFinalAmount();
  },

  /**
   * 单价输入
   */
  onUnitPriceInput(e) {
    this.setData({ unitPriceYuan: e.detail.value });
    this.calculateFinalAmount();
  },

  /**
   * 计算最终总金额（防止NaN显示）
   */
  calculateFinalAmount() {
    const weight = parseFloat(this.data.totalWeight || 0);
    const unitPrice = parseFloat(this.data.unitPriceYuan || 0);
    const amount = weight * unitPrice;

    // 使用 formatPrice 防止 NaN 显示
    this.setData({
      finalAmount: formatPrice(amount)
    });
  },

  /**
   * 更新汇总信息
   */
  updateSummary() {
    const acquirableItems = this.data.scannedItems.filter(
      item => item.status === 'acquirable'
    );

    const count = acquirableItems.length;

    this.setData({
      summary: { count }
    });
  },

  /**
   * 提交收购单
   */
  async onSubmit() {
    const acquirableItems = this.data.scannedItems.filter(
      item => item.status === 'acquirable'
    );

    if (acquirableItems.length === 0) {
      wx.showToast({
        title: '没有可收购的书籍',
        icon: 'none'
      });
      return;
    }

    // 验证手机号
    const phone = this.data.customerPhone.trim();
    if (!phone || phone.length !== 11) {
      wx.showToast({
        title: '请输入有效的手机号',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    // 验证重量和单价
    const weight = parseFloat(this.data.totalWeight);
    const unitPrice = parseFloat(this.data.unitPriceYuan);

    if (!weight || weight <= 0) {
      wx.showToast({
        title: '请输入有效的重量',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    if (!unitPrice || unitPrice <= 0) {
      wx.showToast({
        title: '请输入有效的单价',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    this.setData({ submitting: true });

    try {
      // 构建请求体
      const payload = {
        customerPhoneNumber: phone,
        totalWeightKg: weight,
        unitPrice: Math.round(unitPrice * 100), // 转换为分
        settlementType: 'CASH',
        notes: `批量收购 - ${acquirableItems.length} 本书籍通过白名单筛选`
      };

      const result = await createSellOrder(payload);

      wx.showToast({
        title: '收购成功',
        icon: 'success',
        duration: 2000
      });

      // 清空页面状态
      setTimeout(() => {
        this.setData({
          scannedItems: [],
          summary: { count: 0 },
          customerPhone: '',
          totalWeight: '',
          unitPriceYuan: '',
          finalAmount: '0.00',
          submitting: false
        });
      }, 2000);

    } catch (error) {
      console.error('Create sell order failed:', error);
      const errorMsg = extractErrorMessage(error, '提交失败');
      ui.showError(errorMsg);
      this.setData({ submitting: false });
    }
  }
});
