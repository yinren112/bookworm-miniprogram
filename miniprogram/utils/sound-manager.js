/**
 * 音效管理模块
 * 使用单实例复用策略，避免创建过多 InnerAudioContext
 * 支持开关控制
 */

const logger = require('./logger');

// 存储键
const STORAGE_KEY = 'sound_enabled';
const OBEY_MUTE_SWITCH_KEY = 'sound_obey_mute_switch';

// 默认启用
let _enabled = true;
let _obeyMuteSwitch = false;

// 音效实例池（复用策略）
const _audioPool = {};
const _canPlayReady = {};
const _pendingPlay = {};

// 音效路径映射
const SOUND_PATHS = {
  swipe_light: '/subpackages/review/assets/sounds/swipe_light.mp3',
  swipe_heavy: '/subpackages/review/assets/sounds/swipe_heavy.mp3',
  celebration: '/subpackages/review/assets/sounds/celebration.mp3'
};

// 初始化时读取设置
try {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (stored !== '') {
    _enabled = stored !== false;
  }
} catch (e) {
  // ignore
}

try {
  const stored = wx.getStorageSync(OBEY_MUTE_SWITCH_KEY);
  if (stored !== '') {
    _obeyMuteSwitch = stored === true;
  }
} catch (e) {
  // ignore
}

/**
 * 获取或创建音效实例
 * @param {string} name - 音效名称
 * @returns {InnerAudioContext|null}
 */
function getAudioInstance(name) {
  if (!wx.createInnerAudioContext) return null;

  const path = SOUND_PATHS[name];
  if (!path) {
    logger.warn('Unknown sound:', name);
    return null;
  }

  // 复用已有实例
  if (_audioPool[name]) {
    return _audioPool[name];
  }

  // 创建新实例
  try {
    const audio = wx.createInnerAudioContext();
    audio.src = path;
    audio.obeyMuteSwitch = _obeyMuteSwitch;

    audio.onCanplay(() => {
      _canPlayReady[name] = true;
      if (_pendingPlay[name]) {
        _pendingPlay[name] = false;
        try {
          audio.seek(0);
          audio.play();
        } catch (err) {
          logger.warn('Sound play failed:', name, err);
        }
      }
    });

    // 错误处理
    audio.onError((err) => {
      logger.warn('Sound error:', name, err);
    });

    _audioPool[name] = audio;
    return audio;
  } catch (err) {
    logger.warn('Failed to create audio:', name, err);
    return null;
  }
}

/**
 * 播放音效
 * @param {string} name - 音效名称：swipe_light/swipe_heavy/celebration
 */
function play(name) {
  if (!_enabled) return;

  const audio = getAudioInstance(name);
  if (!audio) return;

  if (!_canPlayReady[name]) {
    _pendingPlay[name] = true;
    return;
  }

  try {
    // 重置播放位置
    audio.seek(0);
    audio.play();
  } catch (err) {
    logger.warn('Sound play failed:', name, err);
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

function setObeyMuteSwitch(val) {
  _obeyMuteSwitch = !!val;
  try {
    wx.setStorageSync(OBEY_MUTE_SWITCH_KEY, _obeyMuteSwitch);
  } catch (e) {
    // ignore
  }

  Object.keys(_audioPool).forEach((name) => {
    try {
      _audioPool[name].obeyMuteSwitch = _obeyMuteSwitch;
    } catch (e) {
      // ignore
    }
  });
}

function getObeyMuteSwitch() {
  return _obeyMuteSwitch;
}

/**
 * 销毁所有音效实例（页面卸载时调用）
 */
function destroyAll() {
  Object.keys(_audioPool).forEach((name) => {
    try {
      _audioPool[name].destroy();
    } catch (e) {
      // ignore
    }
  });
  // 清空池
  Object.keys(_audioPool).forEach((k) => delete _audioPool[k]);
  Object.keys(_canPlayReady).forEach((k) => delete _canPlayReady[k]);
  Object.keys(_pendingPlay).forEach((k) => delete _pendingPlay[k]);
}

/**
 * 预加载音效（可选，提升首次播放速度）
 */
function preload() {
  Object.keys(SOUND_PATHS).forEach((name) => {
    getAudioInstance(name);
  });
}

module.exports = {
  play,
  isEnabled,
  setEnabled,
  getObeyMuteSwitch,
  setObeyMuteSwitch,
  destroyAll,
  preload
};
