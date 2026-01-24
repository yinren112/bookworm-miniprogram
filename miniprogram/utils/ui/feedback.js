const soundManager = require('../sound-manager')

let _lastSoundAt = 0

function _getSettings() {
  let globalSettings = null
  try {
    const app = getApp()
    globalSettings = app && app.globalData && app.globalData.settings ? app.globalData.settings : null
  } catch (_) {
    globalSettings = null
  }

  let storedSettings = null
  try {
    const v = wx.getStorageSync('settings')
    storedSettings = v && typeof v === 'object' ? v : null
  } catch (_) {
    storedSettings = null
  }

  const hapticsEnabled =
    (globalSettings && typeof globalSettings.hapticsEnabled === 'boolean' ? globalSettings.hapticsEnabled : undefined) ??
    (storedSettings && typeof storedSettings.hapticsEnabled === 'boolean' ? storedSettings.hapticsEnabled : undefined) ??
    true

  const soundEnabled =
    (globalSettings && typeof globalSettings.soundEnabled === 'boolean' ? globalSettings.soundEnabled : undefined) ??
    (storedSettings && typeof storedSettings.soundEnabled === 'boolean' ? storedSettings.soundEnabled : undefined) ??
    soundManager.isEnabled()

  return { hapticsEnabled, soundEnabled }
}

function _vibrateShort(type) {
  try {
    if (!wx.vibrateShort) return
    wx.vibrateShort(type ? { type } : {})
  } catch (_) {
    void 0
  }
}

function _vibrateLong() {
  try {
    if (!wx.vibrateLong) return
    wx.vibrateLong()
  } catch (_) {
    void 0
  }
}

function _playSound(name) {
  const now = Date.now()
  if (now - _lastSoundAt < 120) return
  _lastSoundAt = now
  try {
    soundManager.play(name)
  } catch (_) {
    void 0
  }
}

function tap(level = 'light') {
  const { hapticsEnabled, soundEnabled } = _getSettings()
  if (hapticsEnabled) {
    if (level === 'long') _vibrateLong()
    else _vibrateShort(level)
  }
  if (soundEnabled) _playSound('swipe_light')
}

function correct() {
  const { hapticsEnabled, soundEnabled } = _getSettings()
  if (hapticsEnabled) _vibrateShort('medium')
  if (soundEnabled) _playSound('celebration')
}

function wrong() {
  const { hapticsEnabled, soundEnabled } = _getSettings()
  if (hapticsEnabled) _vibrateShort('heavy')
  if (soundEnabled) _playSound('swipe_heavy')
}

function success() {
  const { hapticsEnabled, soundEnabled } = _getSettings()
  if (hapticsEnabled) _vibrateShort('light')
  if (soundEnabled) _playSound('celebration')
}

function warn() {
  const { hapticsEnabled, soundEnabled } = _getSettings()
  if (hapticsEnabled) _vibrateShort('heavy')
  if (soundEnabled) _playSound('swipe_heavy')
}

module.exports = {
  tap,
  correct,
  wrong,
  success,
  warn
}
