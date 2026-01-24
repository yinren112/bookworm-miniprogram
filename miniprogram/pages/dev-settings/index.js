const { normalizeApiBaseUrl } = require('../../utils/url');
const config = require('../../config');

Page({
  data: {
    value: '',
    normalizedValue: '',
    effectiveBaseUrl: '',
  },

  onLoad() {
    this.refreshStateFromStorage();
  },

  onShow() {
    this.refreshStateFromStorage();
  },

  refreshStateFromStorage() {
    let stored = '';
    try {
      stored = wx.getStorageSync('DEV_API_BASE_URL') || '';
    } catch (e) {
      stored = '';
    }
    const normalizedValue = normalizeApiBaseUrl(stored);
    const effectiveBaseUrl = config.apiBaseUrl || '';
    this.setData({ value: stored, normalizedValue, effectiveBaseUrl });
  },

  onInput(e) {
    const value = e.detail.value;
    this.setData({ value, normalizedValue: normalizeApiBaseUrl(value) });
  },

  onSave() {
    const normalizedValue = normalizeApiBaseUrl(this.data.value);
    if (!normalizedValue) {
      wx.showToast({ title: '请输入地址', icon: 'none' });
      return;
    }
    try {
      wx.setStorageSync('DEV_API_BASE_URL', normalizedValue);
    } catch (e) {
      // ignore
    }
    this.setData({ value: normalizedValue });
    this.refreshStateFromStorage();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onClear() {
    try {
      wx.removeStorageSync('DEV_API_BASE_URL');
    } catch (e) {
      // ignore storage errors
    }
    this.refreshStateFromStorage();
    wx.showToast({ title: '已清除', icon: 'success' });
  },

  onCopyEffective() {
    const data = this.data.effectiveBaseUrl || '';
    if (!data) {
      wx.showToast({ title: '无可复制地址', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data });
  }
});
