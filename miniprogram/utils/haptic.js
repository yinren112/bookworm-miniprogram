/**
 * 触觉反馈模块
 * 封装 wx.vibrateShort，提供统一的触觉反馈接口
 * 支持开关控制和降级处理
 */

const logger = require('./logger');

// 存储键
const STORAGE_KEY = 'haptic_enabled';

// 默认启用
let _enabled = true;

// 初始化时读取设置
try {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (stored !== '') {
    _enabled = stored !== false;
  }
} catch (e) {
  // ignore
}

/**
 * 触发震动
 * @param {string} type - 震动类型：light/medium/heavy/celebration
 */
function trigger(type) {
  if (!_enabled) return;
  if (!wx.vibrateShort) return;

  try {
    switch (type) {
      case 'light':
      case 'success':
        wx.vibrateShort({ type: 'light' });
        break;
      case 'medium':
        wx.vibrateShort({ type: 'medium' });
        break;
      case 'heavy':
        wx.vibrateShort({ type: 'heavy' });
        break;
      case 'celebration':
        // 庆祝模式：渐弱三连振
        wx.vibrateShort({ type: 'heavy' });
        setTimeout(() => wx.vibrateShort({ type: 'medium' }), 150);
        setTimeout(() => wx.vibrateShort({ type: 'light' }), 300);
        break;
      default:
        wx.vibrateShort();
    }
  } catch (err) {
    // 静默失败，不影响主流程
    logger.warn('Haptic trigger failed:', err);
  }
}

/**
 * 检查是否启用
 * @returns {boolean}
 */
function isEnabled() {
  return _enabled;
}

/**
 * 设置启用状态
 * @param {boolean} val
 */
function setEnabled(val) {
  _enabled = !!val;
  try {
    wx.setStorageSync(STORAGE_KEY, _enabled);
  } catch (e) {
    // ignore
  }
}

module.exports = {
  trigger,
  isEnabled,
  setEnabled
};
