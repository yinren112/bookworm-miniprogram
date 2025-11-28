// pages/acquisition-scan/index.js
const { checkAcquisition, createAcquisition } = require('../../utils/api');
const ui = require('../../utils/ui');
const { extractErrorMessage } = require('../../utils/error');
const logger = require('../../utils/logger');
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
    submitting: false,

    // 定价模式
    pricingMode: 'bulk',  // 'bulk' | 'individual'

    // 学生信息
    enrollmentYear: null,
    enrollmentYearIndex: 0,
    yearRange: [],        // 年份选项数组
    major: '',
    className: ''
  },

  /**
   * 页面加载：初始化年份范围
   */
  onLoad() {
    const currentYear = new Date().getFullYear();
    const yearRange = [];
    for (let i = 0; i < 10; i++) {
      yearRange.push((currentYear - i).toString());
    }
    this.setData({ yearRange });
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
        logger.error('Check acquisition failed:', error);
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
    // 为精确模式添加额外字段
    const enrichedItem = {
      ...item,
      condition: 'GOOD',        // 默认品相
      conditionIndex: 1,        // 默认"良好"
      individualPrice: '',      // 单本价格(元)
      individualPriceCents: 0   // 单本价格(分)
    };
    const scannedItems = [...this.data.scannedItems, enrichedItem];
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
   * 定价模式切换
   */
  onSwitchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ pricingMode: mode });

    // 切换到精确模式时，重置总金额
    if (mode === 'individual') {
      this.setData({ finalAmount: '0.00' });
    }

    // 切换到快速模式时，重新计算总金额
    if (mode === 'bulk') {
      this.calculateFinalAmount();
    }
  },

  /**
   * 学生信息：年份选择
   */
  onYearChange(e) {
    const index = e.detail.value;
    const year = parseInt(this.data.yearRange[index]);
    this.setData({
      enrollmentYearIndex: index,
      enrollmentYear: year
    });
  },

  /**
   * 学生信息：专业输入
   */
  onMajorInput(e) {
    this.setData({ major: e.detail.value });
  },

  /**
   * 学生信息：班级输入
   */
  onClassNameInput(e) {
    this.setData({ className: e.detail.value });
  },

  /**
   * 精确模式：品相选择
   */
  onConditionChange(e) {
    const index = e.currentTarget.dataset.index;
    const value = parseInt(e.detail.value);  // 选中的索引：0=全新, 1=良好, 2=可接受

    const conditionMap = ['NEW', 'GOOD', 'ACCEPTABLE'];
    const items = [...this.data.scannedItems];
    items[index].conditionIndex = value;
    items[index].condition = conditionMap[value];

    this.setData({ scannedItems: items });
  },

  /**
   * 精确模式：单本价格输入
   */
  onIndividualPriceInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const priceYuan = parseFloat(value) || 0;
    const priceCents = Math.round(priceYuan * 100);

    const items = [...this.data.scannedItems];
    items[index].individualPrice = value;
    items[index].individualPriceCents = priceCents;

    // 重新计算总金额（只统计可收购的书籍）
    const acquirableItems = items.filter(item => item.status === 'acquirable');
    const totalCents = acquirableItems.reduce((sum, item) => sum + (item.individualPriceCents || 0), 0);
    const finalAmount = (totalCents / 100).toFixed(2);

    this.setData({
      scannedItems: items,
      finalAmount: finalAmount
    });
  },

  /**
   * 提交收购单（支持快速模式和精确模式）
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

    this.setData({ submitting: true });

    try {
      // 构建items数组
      let items = [];

      if (this.data.pricingMode === 'bulk') {
        // 快速模式：按重量计价，平均分配
        const weight = parseFloat(this.data.totalWeight);
        const unitPrice = parseFloat(this.data.unitPriceYuan);

        if (!weight || weight <= 0) {
          wx.showToast({ title: '请输入有效的重量', icon: 'none' });
          this.setData({ submitting: false });
          return;
        }

        if (!unitPrice || unitPrice <= 0) {
          wx.showToast({ title: '请输入有效的单价', icon: 'none' });
          this.setData({ submitting: false });
          return;
        }

        const totalAmount = Math.round(weight * unitPrice * 100);
        const perBookPrice = Math.floor(totalAmount / acquirableItems.length);

        items = acquirableItems.map(item => ({
          skuId: item.skuInfo.skuId,
          condition: 'GOOD',
          acquisitionPrice: perBookPrice
        }));

      } else {
        // 精确模式：逐本定价
        for (const item of acquirableItems) {
          if (!item.individualPriceCents || item.individualPriceCents <= 0) {
            wx.showToast({
              title: `请为《${item.skuInfo.title}》设置价格`,
              icon: 'none'
            });
            this.setData({ submitting: false });
            return;
          }

          items.push({
            skuId: item.skuInfo.skuId,
            condition: item.condition,
            acquisitionPrice: item.individualPriceCents
          });
        }
      }

      // 构建请求payload
      const payload = {
        items: items,
        settlementType: 'CASH',
        notes: this.data.pricingMode === 'bulk'
          ? `批量收购 - ${acquirableItems.length}本 (总重${this.data.totalWeight}kg, 单价¥${this.data.unitPriceYuan}/kg)`
          : `精确定价收购 - ${acquirableItems.length}本`
      };

      // 添加学生信息（customerProfile）
      payload.customerProfile = {
        phoneNumber: phone
      };

      if (this.data.enrollmentYear) {
        payload.customerProfile.enrollmentYear = this.data.enrollmentYear;
      }
      if (this.data.major) {
        payload.customerProfile.major = this.data.major;
      }
      if (this.data.className) {
        payload.customerProfile.className = this.data.className;
      }

      // 调用完整的收购API
      await createAcquisition(payload);

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
          submitting: false,
          pricingMode: 'bulk',
          enrollmentYear: null,
          enrollmentYearIndex: 0,
          major: '',
          className: ''
        });
      }, 2000);

    } catch (error) {
      logger.error('Create acquisition failed:', error);
      const errorMsg = extractErrorMessage(error, '提交失败');
      ui.showError(errorMsg);
      this.setData({ submitting: false });
    }
  }
});
