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
    className: '',
    continuousMode: false, // 连续扫码模式
    isScanning: false,     // 扫码锁
    batchPrice: ''         // 批量价格暂存
  },

  // 定时器ID，用于清理
  _scanTimerId: null,
  // 页面是否活跃
  _isPageActive: true,

  /**
   * 页面加载：初始化年份范围
   */
  onLoad() {
    this._isPageActive = true;
    this._acquirableCount = 0; // 增量计数器
    const currentYear = new Date().getFullYear();
    const yearRange = [];
    for (let i = 0; i < 10; i++) {
      yearRange.push((currentYear - i).toString());
    }
    this.setData({ yearRange });
  },

  /**
   * 页面卸载：清理定时器
   */
  onUnload() {
    this._isPageActive = false;
    if (this._scanTimerId) {
      clearTimeout(this._scanTimerId);
      this._scanTimerId = null;
    }
  },

  /**
   * 连续扫码开关切换
   */
  onContinuousModeChange(e) {
    this.setData({ continuousMode: e.detail.value });
  },

  /**
   * 扫码处理
   */
  async onScanCode() {
    if (this.data.isScanning) return;
    this.setData({ isScanning: true });
    await this.performScan();
    this.setData({ isScanning: false });
  },

  /**
   * 执行单次扫码
   */
  async performScan() {
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
          // 可收购
          const sku = data.acquirableSkus[0];
          this.addScannedItem({
            isbn,
            status: 'acquirable',
            skuInfo: sku
          });

          // 震动反馈
          wx.vibrateShort({ type: 'heavy' });
          
          wx.showToast({
            title: '已添加到白名单',
            icon: 'success',
            duration: 1000
          });
        } else {
          // 不可收购
          this.addScannedItem({
            isbn,
            status: 'rejected',
            skuInfo: null
          });

          // 震动反馈
          wx.vibrateLong();

          wx.showToast({
            title: '不在白名单',
            icon: 'none',
            duration: 1500
          });
        }

        // 如果是连续扫码模式，短暂延迟后继续扫码
        if (this.data.continuousMode && this._isPageActive) {
          this._scanTimerId = setTimeout(() => {
            if (this._isPageActive && this.data.continuousMode) {
              this.performScan();
            }
          }, 1200); // 等待 Toast 显示一会儿
        }

      } catch (error) {
        wx.hideLoading();
        logger.error('Check acquisition failed:', error);
        const errorMsg = extractErrorMessage(error, '查询失败');
        ui.showError(errorMsg);
      }
    } catch (scanError) {
      // 用户取消扫码，自然退出连续模式
      // 不做任何操作
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
    
    // 增量更新计数
    if (enrichedItem.status === 'acquirable') {
      this._acquirableCount++;
    }
    
    this.setData({
      scannedItems,
      summary: { count: this._acquirableCount },
      hasRejectedItems: this.data.hasRejectedItems || enrichedItem.status === 'rejected'
    });
  },

  /**
   * 移除扫描项
   */
  onRemoveItem(e) {
    const index = e.currentTarget.dataset.index;
    const removedItem = this.data.scannedItems[index];
    const scannedItems = [...this.data.scannedItems];
    scannedItems.splice(index, 1);
    
    // 增量更新计数
    if (removedItem.status === 'acquirable') {
      this._acquirableCount--;
    }
    // hasRejectedItems 需要重新计算（因为可能移除了唯一的 rejected 项）
    const hasRejectedItems = scannedItems.some(item => item.status === 'rejected');
    
    this.setData({
      scannedItems,
      summary: { count: this._acquirableCount },
      hasRejectedItems
    });
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
  // updateSummary 已移除，改用增量计算

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

    // 检查是否有拒绝项
    const hasRejectedItems = items.some(item => item.status === 'rejected');

    this.setData({
      scannedItems: items,
      hasRejectedItems,
      finalAmount: finalAmount
    });
  },

  /**
   * 清理所有无效书籍
   */
  onClearRejected() {
    const validItems = this.data.scannedItems.filter(item => item.status === 'acquirable');
    // 重置增量计数器
    this._acquirableCount = validItems.length;
    this.setData({
      scannedItems: validItems,
      summary: { count: this._acquirableCount },
      hasRejectedItems: false
    });
    wx.showToast({ title: '已清理', icon: 'success' });
  },

  /**
   * 批量价格输入
   */
  onBatchPriceInput(e) {
    this.setData({ batchPrice: e.detail.value });
  },

  /**
   * 批量应用价格
   */
  onBatchApply() {
    const priceYuan = parseFloat(this.data.batchPrice);
    if (isNaN(priceYuan) || priceYuan <= 0) {
      wx.showToast({ title: '请输入有效价格', icon: 'none' });
      return;
    }

    const priceCents = Math.round(priceYuan * 100);
    const items = this.data.scannedItems.map(item => {
      // 只应用到可收购且未设置价格的项目（使用 undefined 检查而非 falsy）
      if (item.status === 'acquirable' && (item.individualPrice === undefined || item.individualPrice === '')) {
        return {
          ...item,
          individualPrice: this.data.batchPrice,
          individualPriceCents: priceCents
        };
      }
      // 始终返回新对象，避免引用问题
      return { ...item };
    });

    // 重新计算总金额
    const acquirableItems = items.filter(item => item.status === 'acquirable');
    const totalCents = acquirableItems.reduce((sum, item) => sum + (item.individualPriceCents || 0), 0);
    const finalAmount = (totalCents / 100).toFixed(2);

    // 检查是否有拒绝项
    const hasRejectedItems = items.some(item => item.status === 'rejected');

    this.setData({
      scannedItems: items,
      hasRejectedItems,
      finalAmount: finalAmount
    });

    wx.showToast({ title: '已应用', icon: 'success' });
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

      // 清空页面状态 (但保留部分偏好设置)
      const { unitPriceYuan, pricingMode, enrollmentYear, enrollmentYearIndex, major, className, continuousMode } = this.data;

      setTimeout(() => {
        this.setData({
          scannedItems: [],
          summary: { count: 0 },
          customerPhone: '',
          totalWeight: '',
          unitPriceYuan,        // 保留
          finalAmount: '0.00',
          submitting: false,
          pricingMode,          // 保留
          enrollmentYear,       // 保留
          enrollmentYearIndex,  // 保留
          major,                // 保留
          className,            // 保留
          continuousMode,       // 保留
          batchPrice: '',       // 清空批量价格
          hasRejectedItems: false // 清空拒绝项标志
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
